import {assertStorageWritable} from './modules/asyncOperation/storageHolds.js';
import {problem} from './modules/content/publicationImagePolicy.js';
import {AsyncLocalStorage} from 'node:async_hooks';
import pg from 'pg';
import {createHash} from 'node:crypto';

// A separate, bounded pool avoids holding an application SQL-pool connection
// while waiting for a writer/GC fence. No transaction spans media or IPFS I/O.
const pools = new WeakMap<object, pg.Pool>();
const contexts = new AsyncLocalStorage<any>();
const namespace = 17419;
const storageKey = 9301;

function storageLockPool(app) {
    const sequelize = app.ms.database.sequelize;
    let pool = pools.get(app);
    if (!pool) {
        const config = sequelize.config;
        pool = new pg.Pool({host: config.host, port: config.port, database: config.database,
            user: config.username, password: config.password, ssl: sequelize.options?.dialectOptions?.ssl,
            max: 4, idleTimeoutMillis: 1000, connectionTimeoutMillis: 10000, allowExitOnIdle: true});
        pools.set(app, pool);
    }
    return pool;
}

export async function withStorageFence<T>(app, mode: 'shared' | 'exclusive', run: (assertHeld?: () => Promise<void>) => Promise<T>, options: {wait?: boolean} = {}): Promise<T> {
    const existing = contexts.getStore();
    if (existing?.app === app && existing.active) {
        if (mode === 'exclusive' && existing.mode !== 'exclusive') {
            throw new Error('storage_fence_upgrade_forbidden');
        }
        existing.users++;
        try {
            return await run(existing.assertHeld);
        } finally {
            await existing.release();
        }
    }
    const sequelize = app.ms?.database?.sequelize;
    if (!sequelize?.getDialect || sequelize.getDialect() !== 'postgres') {
        if (mode === 'exclusive') {
            throw new Error('storage_retirement_requires_postgres');
        }
        return run(async () => undefined);
    }
    const pool = storageLockPool(app);
    // Pool capacity is unrelated to an exclusive GC fence. Queue behind shared
    // writers within the pool's bounded acquisition timeout, then probe the lock.
    let connection;
    try {
        connection = await pool.connect();
    } catch (error) {
        if (error.message === 'timeout exceeded when trying to connect') {
            problem('storage_busy', 503);
        }
        throw error;
    }
    const suffix = mode === 'shared' ? '_shared' : '';
    let broken = false;
    const controller = new AbortController();
    const onError = () => {
        broken = true;
        controller.abort(new Error('storage_fence_lost'));
    };
    connection.on('error', onError);
    const context: any = {app, mode, users: 1, active: true, signal: controller.signal};
    context.assertHeld = async () => {
        if (broken || !context.active) {
            throw new Error('storage_fence_lost');
        }
        try {
            await connection.query('SELECT 1');
        } catch {
            onError();
            throw new Error('storage_fence_lost');
        }
    };
    context.release = async () => {
        context.users--;
        if (context.users !== 0) {
            return;
        }
        context.active = false;
        try {
            if (!broken) {
                await connection.query(`SELECT pg_advisory_unlock${suffix}($1, $2)`, [namespace, storageKey]);
            }
        } finally {
            connection.removeListener('error', onError);
            connection.release(broken);
        }
    };
    let acquired = true;
    try {
        if (options.wait === false) {
            acquired = (await connection.query(`SELECT pg_try_advisory_lock${suffix}($1, $2) AS locked`, [namespace, storageKey])).rows[0].locked;
        } else {
            await connection.query(`SELECT pg_advisory_lock${suffix}($1, $2)`, [namespace, storageKey]);
        }
    } catch (error) {
        connection.removeListener('error', onError);
        connection.release(true);
        throw error;
    }
    if (!acquired) {
        connection.removeListener('error', onError);
        connection.release();
        problem('storage_maintenance_busy', 503);
    }
    return contexts.run(context, async () => {
        try {
            return await run(context.assertHeld);
        } finally {
            await context.release();
        }
    });
}

export function fenceStorageMethods(app, module, names: string[]) {
    for (const name of names) {
        const original = module[name];
        if (typeof original === 'function') {
            module[name] = function (...args) {
                return withStorageFence(app, 'shared', async () => {
                    if (name === 'restoreContent') {
                        const content = await app.ms.database.getContent(args[0], {includeDeleted: true});
                        if (JSON.parse(content?.propertiesJson || '{}').publicationRetirement) {
                            problem('content_retired');
                        }
                        await assertStorageWritable(app, content);
                    }
                    if (name === 'addContent' || name === 'updateContent') {
                        await assertStorageWritable(app, name === 'addContent' ? args[0] : args[1]);
                    }
                    return original.apply(this, args);
                });
            };
        }
    }
    return module;
}

export async function withStorageWorker(app, run: () => Promise<any>) {
    // Session lock: a crashed process releases it; the next worker reconciles
    // persisted queue/retirement receipts rather than replaying accepted work.
    const connection = await storageLockPool(app).connect();
    let broken = false;
    const onError = () => { broken = true; };
    connection.on('error', onError);
    let locked = false;
    try {
        const result = await connection.query('SELECT pg_try_advisory_lock($1, $2) AS locked', [namespace, storageKey + 1]);
        locked = result.rows[0].locked;
        if (!locked) {
            return {processed: 0};
        }
        return await run();
    } finally {
        try {
            if (locked && !broken) {
                await connection.query('SELECT pg_advisory_unlock($1, $2)', [namespace, storageKey + 1]);
            }
        } finally {
            connection.removeListener('error', onError);
            connection.release(broken);
        }
    }
}

export async function stopStorageFence(app) {
    const pool = pools.get(app);
    pools.delete(app);
    await pool?.end();
}

export function storageFenceSignal() {
    return contexts.getStore()?.signal;
}

export async function withStorageTaskLock(app, identity: string, run) {
    const sequelize = app.ms.database.sequelize;
    const connection = await sequelize.connectionManager.getConnection({type: 'WRITE'});
    const key = createHash('sha256').update(identity).digest().readInt32BE(0);
    let locked = false;
    try {
        locked = (await connection.query('SELECT pg_try_advisory_lock($1, $2) AS locked', [namespace + 1, key])).rows[0].locked;
        if (!locked) {
            throw new Error('image_render_in_process');
        }
        return await run();
    } finally {
        if (locked) {
            await connection.query('SELECT pg_advisory_unlock($1, $2)', [namespace + 1, key]);
        }
        await sequelize.connectionManager.releaseConnection(connection);
    }
}
