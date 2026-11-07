import {assertStorageWritable} from './modules/asyncOperation/storageHolds.js';
import {problem} from './modules/content/publicationInput.js';
import {AsyncLocalStorage} from 'node:async_hooks';
import pg from 'pg';
import {createHash, randomUUID} from 'node:crypto';
import {ApiProblemError} from './modules/api/problem.js';

// A separate, bounded pool avoids holding an application SQL-pool connection
// while waiting for a writer/GC fence. No transaction spans media or IPFS I/O.
const pools = new WeakMap<object, pg.Pool>();
const workerPools = new WeakMap<object, pg.Pool>();
const controlPools = new WeakMap<object, pg.Pool>();
const contexts = new AsyncLocalStorage<any>();
const controlContexts = new AsyncLocalStorage<any>();
const admissions = new AsyncLocalStorage<any>();
const admissionRejections = new WeakMap<object, AbortSignal>();

export interface StorageAdmissionOptions {
    signal?: AbortSignal;
    timeoutMs: number;
    route?: string;
    requestId?: string;
}

export interface StorageFenceOptions {
    wait?: boolean;
    admissionTimeoutMs?: number;
    signal?: AbortSignal;
    diagnostic?: {route?: string; requestId?: string};
}

// Only unaccepted work is cancelled. The first acquired fence transfers lifetime
// ownership to the operation; response loss must not cancel its durable outcome.
export function withStorageAdmission<T>(app, options: StorageAdmissionOptions, run: () => Promise<T>): Promise<T> {
    const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs >= 0 ? options.timeoutMs : 10000;
    return admissions.run({app, ...options, deadline: performance.now() + timeoutMs, admitted: false}, run);
}

let diagnosticWindow = 0;
let diagnosticCount = 0;
let diagnosticDropped = 0;
function fenceDiagnostic(pool, diagnostic, fields) {
    if (process.env.GEESOME_STORAGE_FENCE_DIAGNOSTICS !== '1') {
        return;
    }
    const now = Date.now();
    if (now - diagnosticWindow >= 60000) {
        diagnosticWindow = now;
        diagnosticCount = 0;
    }
    if (diagnosticCount++ >= 120) {
        diagnosticDropped++;
        return;
    }
    // Registered templates only: reject query strings, CIDs, numeric IDs and
    // arbitrary URL paths. Correlation IDs cannot contain whitespace or payloads.
    const route = typeof diagnostic?.route === 'string' && diagnostic.route.length <= 180
        && /^\/(?:v[0-9]+\/)?[a-z][a-z/:_-]*$/.test(diagnostic.route) ? diagnostic.route : undefined;
    const requestId = typeof diagnostic?.requestId === 'string'
        && /^[A-Za-z0-9._:-]{1,128}$/.test(diagnostic.requestId) ? diagnostic.requestId : undefined;
    console.info(JSON.stringify({event: 'storage_fence', ...fields, fenceId: diagnostic?.fenceId, route, requestId,
        poolTotal: pool.totalCount, poolIdle: pool.idleCount, poolWaiting: pool.waitingCount,
        droppedDiagnostics: diagnosticDropped}));
    diagnosticDropped = 0;
}

function admissionError(code = 'storage_busy') {
    return new ApiProblemError(503, code, code.replace(/_/g, ' '));
}

// Only the actual first-fence refusal carries this private origin. A business
// handler throwing the same public code cannot forge a pre-execution refusal.
export function isStorageAdmissionRejection(error: unknown, signal: AbortSignal): boolean {
    return typeof error === 'object' && error !== null
        && admissionRejections.has(error) && admissionRejections.get(error) === signal;
}

export function storageAdmissionFenceOptions(app): StorageFenceOptions {
    const admission = admissions.getStore();
    return admission?.app === app && !admission.admitted ? {wait: false} : {};
}


// pg-pool has no AbortSignal checkout API. An abandoned waiter can still receive
// a connection later, so consume that promise and release its result exactly once.
async function admissionCheckout(pool, signal?: AbortSignal): Promise<pg.PoolClient> {
    if (signal?.aborted) {
        throw admissionError();
    }
    return new Promise((resolve, reject) => {
        let settled = false;
        const abort = () => {
            if (!settled) {
                settled = true;
                reject(admissionError());
            }
        };
        signal?.addEventListener('abort', abort, {once: true});
        pool.connect().then(connection => {
            signal?.removeEventListener('abort', abort);
            if (settled || signal?.aborted) {
                connection.release();
                if (!settled) {
                    settled = true;
                    reject(admissionError());
                }
                return;
            }
            settled = true;
            resolve(connection);
        }, error => {
            signal?.removeEventListener('abort', abort);
            if (!settled) {
                settled = true;
                reject(error);
            }
        });
        // An AbortSignal can fire between the initial check and registration.
        if (signal?.aborted) {
            abort();
        }
    });
}

const namespace = 17419;
const storageKey = 9301;

function storageLockPool(app, purpose: 'fence' | 'worker' | 'control' = 'fence') {
    const registry = purpose === 'control' ? controlPools : purpose === 'worker' ? workerPools : pools;
    const sequelize = app.ms.database.sequelize;
    let pool = registry.get(app);
    if (!pool) {
        const config = sequelize.config;
        pool = new pg.Pool({host: config.host, port: config.port, database: config.database,
            user: config.username, password: config.password, ssl: sequelize.options?.dialectOptions?.ssl,
            max: purpose === 'fence' ? 10 : 2, idleTimeoutMillis: 1000, connectionTimeoutMillis: 10000, allowExitOnIdle: true});
        registry.set(app, pool);
    }
    return pool;
}

export async function withStorageFence<T>(app, mode: 'shared' | 'exclusive', run: (assertHeld?: () => Promise<void>) => Promise<T>, options: StorageFenceOptions = {}): Promise<T> {
    const existing = contexts.getStore();
    if (existing?.app === app && existing.active) {
        if (mode === 'exclusive' && existing.mode !== 'exclusive') {
            throw new Error('storage_fence_upgrade_forbidden');
        }
        if (existing.signal.aborted) {
            throw new Error('storage_fence_lost');
        }
        existing.users++;
        existing.peakUsers = Math.max(existing.peakUsers, existing.users);
        try {
            return await run(existing.assertHeld);
        } catch (error) {
            existing.outcome = 'failed';
            throw error;
        } finally {
            await existing.release();
        }
    }
    const admission = admissions.getStore();
    const pendingAdmission = admission?.app === app && !admission.admitted ? admission : null;
    const rejected = error => {
        if (pendingAdmission?.signal && !pendingAdmission.admitted) {
            admissionRejections.set(error, pendingAdmission.signal);
        }
        return error;
    };
    const deadline = options.admissionTimeoutMs !== undefined
        ? performance.now() + (Number.isFinite(options.admissionTimeoutMs) ? Math.max(0, options.admissionTimeoutMs) : 10000)
        : pendingAdmission?.deadline;
    const callerSignal = options.signal || pendingAdmission?.signal;
    const admissionController = new AbortController();
    let timer;
    const abort = () => admissionController.abort();
    if (callerSignal) {
        callerSignal.addEventListener('abort', abort, {once: true});
        if (callerSignal.aborted) {
            abort();
        }
    }
    if (deadline !== undefined) {
        const remaining = deadline - performance.now();
        if (remaining <= 0) {
            abort();
        } else {
            timer = setTimeout(abort, remaining);
        }
    }
    const signal = admissionController.signal;
    const admissionExpired = () => {
        if (deadline !== undefined && performance.now() >= deadline && !signal.aborted) {
            abort();
        }
        return signal.aborted;
    };
    const stopAdmission = () => {
        clearTimeout(timer);
        callerSignal?.removeEventListener('abort', abort);
    };
    const sequelize = app.ms?.database?.sequelize;
    if (!sequelize?.getDialect || sequelize.getDialect() !== 'postgres') {
        stopAdmission();
        if (mode === 'exclusive') {
            throw new Error('storage_retirement_requires_postgres');
        }
        if (admissionExpired()) {
            throw rejected(admissionError());
        }
        if (pendingAdmission) {
            pendingAdmission.admitted = true;
        }
        return run(async () => undefined);
    }
    let pool;
    try {
        pool = storageLockPool(app);
    } catch (error) {
        stopAdmission();
        throw error;
    }
    const diagnostic = process.env.GEESOME_STORAGE_FENCE_DIAGNOSTICS === '1'
        ? {...(options.diagnostic || (admission?.app === app ? admission : null)), fenceId: randomUUID()} : undefined;
    const started = performance.now();
    let connection;
    try {
        connection = await admissionCheckout(pool, signal);
    } catch (error) {
        stopAdmission();
        fenceDiagnostic(pool, diagnostic, {stage: 'rejected', mode, reason: signal.aborted ? 'abandoned' : 'checkout_failed',
            poolWaitMs: Math.round(performance.now() - started)});
        if (signal.aborted || error.message === 'timeout exceeded when trying to connect') {
            throw rejected(admissionError());
        }
        throw error;
    }
    const checkedOut = performance.now();
    const suffix = mode === 'shared' ? '_shared' : '';
    let broken = false;
    let released = false;
    const controller = new AbortController();
    const onError = () => {
        broken = true;
        controller.abort(new Error('storage_fence_lost'));
    };
    const releaseConnection = (destroy = false) => {
        if (!released) {
            released = true;
            connection.removeListener('error', onError);
            connection.release(destroy || broken);
        }
    };
    connection.on('error', onError);
    // A cancelled lock query must not later acquire an orphaned session lock.
    // Destroy this session while consuming the query rejection below.
    const abandonLock = () => releaseConnection(true);
    signal.addEventListener('abort', abandonLock, {once: true});
    let acquired = true;
    try {
        if (admissionExpired()) {
            throw rejected(admissionError());
        }
        if (options.wait === false) {
            acquired = (await connection.query(`SELECT pg_try_advisory_lock${suffix}($1, $2) AS locked`, [namespace, storageKey])).rows[0].locked;
        } else {
            await connection.query(`SELECT pg_advisory_lock${suffix}($1, $2)`, [namespace, storageKey]);
        }
        if (admissionExpired()) {
            throw rejected(admissionError());
        }
        if (broken) {
            throw new Error('storage_fence_lost');
        }
    } catch (error) {
        releaseConnection(true);
        fenceDiagnostic(pool, diagnostic, {stage: 'rejected', mode, reason: signal.aborted ? 'abandoned' : 'lock_failed',
            poolWaitMs: Math.round(checkedOut - started), lockWaitMs: Math.round(performance.now() - checkedOut)});
        if (signal.aborted) {
            throw rejected(admissionError());
        }
        throw error;
    } finally {
        signal.removeEventListener('abort', abandonLock);
        stopAdmission();
    }
    if (!acquired) {
        releaseConnection();
        fenceDiagnostic(pool, diagnostic, {stage: 'rejected', mode, reason: 'maintenance',
            poolWaitMs: Math.round(checkedOut - started), lockWaitMs: Math.round(performance.now() - checkedOut)});
        throw rejected(admissionError('storage_maintenance_busy'));
    }
    if (pendingAdmission) {
        pendingAdmission.admitted = true;
    }
    const heldAt = performance.now();
    const context: any = {app, mode, users: 1, peakUsers: 1, active: true, signal: controller.signal, outcome: 'finished'};
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
            releaseConnection(broken);
            fenceDiagnostic(pool, diagnostic, {stage: 'released', mode, outcome: broken ? 'fence_lost' : context.outcome,
                holdMs: Math.round(performance.now() - heldAt), users: context.users, peakUsers: context.peakUsers});
        }
    };
    fenceDiagnostic(pool, diagnostic, {stage: 'acquired', mode,
        poolWaitMs: Math.round(checkedOut - started), lockWaitMs: Math.round(heldAt - checkedOut), users: context.users});
    return contexts.run(context, async () => {
        try {
            return await run(context.assertHeld);
        } catch (error) {
            context.outcome = 'failed';
            throw error;
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
    const connection = await storageLockPool(app, 'worker').connect();
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
    const workers = workerPools.get(app);
    const control = controlPools.get(app);
    pools.delete(app);
    workerPools.delete(app);
    controlPools.delete(app);
    await Promise.all([pool?.end(), workers?.end(), control?.end()]);
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

export async function withStorageControlTaskLock(app, identity: string, run, options: {taskLockNamespace?: boolean} = {}) {
    const lockNamespace = options.taskLockNamespace ? namespace + 1 : namespace + 2;
    const existing = controlContexts.getStore();
    if (existing?.app === app && existing.active) {
        if (existing.identity !== identity || existing.lockNamespace !== lockNamespace) {
            throw new Error('storage_control_lock_nesting_forbidden');
        }
        await existing.assertHeld();
        return run();
    }
    const connection = await storageLockPool(app, 'control').connect();
    const key = createHash('sha256').update(identity).digest().readInt32BE(0);
    let locked = false;
    let broken = false;
    const onError = () => {broken = true;};
    connection.on('error', onError);
    const context = {app, identity, lockNamespace, active: true, assertHeld: async () => {
        if (broken) {
            throw new Error('storage_control_lock_lost');
        }
        await connection.query('SELECT 1');
    }};
    try {
        locked = (await connection.query('SELECT pg_try_advisory_lock($1, $2) AS locked', [lockNamespace, key])).rows[0].locked;
        if (!locked) {
            if (options.taskLockNamespace) {
                throw new Error('image_render_in_process');
            }
            problem('storage_control_busy', 409);
        }
        return await controlContexts.run(context, async () => {
            const result = await run();
            await context.assertHeld();
            return result;
        });
    } finally {
        context.active = false;
        try {
            if (locked && !broken) {
                await connection.query('SELECT pg_advisory_unlock($1, $2)', [lockNamespace, key]);
            }
        } finally {
            connection.removeListener('error', onError);
            connection.release(broken);
        }
    }
}
