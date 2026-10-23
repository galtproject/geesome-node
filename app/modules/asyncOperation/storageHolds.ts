import {AsyncLocalStorage} from 'node:async_hooks';
import {Op, literal} from 'sequelize';
import {imageFiles, sameCid, normalizeStorageId} from '../../storageIdentity.js';
import {problem} from '../content/publicationInput.js';

const snapshots = new AsyncLocalStorage<any>();
export async function storageJobs(app) {
    const sequelize = app.ms.database.sequelize;
    if (sequelize.models && !sequelize.models.userOperationQueue) {
        return [];
    }
    return sequelize.model('userOperationQueue').findAll({where: {isWaiting: true},
        include: [{association: 'asyncOperation', attributes: ['output']}], limit: 1001});
}
export function storageJobState(row) {
    const accepted = JSON.parse(row.inputJson);
    return {...accepted, ...(row.asyncOperation?.output ? JSON.parse(row.asyncOperation.output) : {})};
}
function indexJobs(app, rows) {
    const holders = new Map<string, Set<number>>();
    const inputs = [];
    let unsafe = rows.length > 1000;
    for (const row of rows) {
        try {
            const state = row.module === 'site-replacement' ? storageJobState(row) : JSON.parse(row.inputJson);
            inputs.push({id: row.id, input: state});
            let ids: string[] = [];
            if (row.module === 'content-resave') {
                ids = imageFiles(state.source);
            } else if (row.module === 'site-replacement' && !state.result?.cleanup?.holdsReleased) {
                ids = [...state.input.sources.flatMap(imageFiles), state.input.previous?.storageId,
                    state.input.previous?.archiveStorageId].filter(Boolean).map(normalizeStorageId);
            }
            for (const cid of new Set(ids)) {
                const owners = holders.get(cid) || new Set<number>();
                owners.add(row.id);
                holders.set(cid, owners);
            }
        } catch {
            unsafe = true;
        }
    }
    return {app, holders, inputs, unsafe, active: 0};
}
export async function withStorageJobSnapshot(app, run) {
    const snapshot = indexJobs(app, await storageJobs(app));
    snapshot.active = await app.ms.database.sequelize.model('userAsyncOperation').count({where: {inProcess: true}});
    return snapshots.run(snapshot, run);
}
export function releaseStorageJobHolds(app, id) {
    const snapshot = snapshots.getStore();
    if (snapshot?.app === app) {
        for (const owners of snapshot.holders.values()) {
            owners.delete(id);
        }
    }
}
export function hasActiveSourceWork(app, contentIds, oldCid) {
    const snapshot = snapshots.getStore();
    if (!snapshot || snapshot.app !== app || snapshot.unsafe || snapshot.active) {
        return true;
    }
    const sources = new Set(contentIds);
    return snapshot.inputs.some(({input}) => input.renderArgs?.entityIds?.some(id => sources.has(id))
        || (oldCid && input.originalStorageId && sameCid(input.originalStorageId, oldCid)));
}
export async function countStorageHolds(app, cid, excludeJobId = null) {
    const current = snapshots.getStore();
    const snapshot = current?.app === app ? current : indexJobs(app, await storageJobs(app));
    if (snapshot.unsafe) {
        return 1001; // Unknown or overflowing work blocks deletion, never ordinary saves.
    }
    let normalized;
    try {
        normalized = normalizeStorageId(cid);
    } catch {
        return 0; // Remote identities cannot be local IPFS cleanup candidates.
    }
    const owners = snapshot.holders.get(normalized) || new Set();
    return owners.size - Number(owners.has(excludeJobId));
}
export async function assertStorageWritable(app, data) {
    const ids = ['storageId', 'manifestStorageId', 'smallPreviewStorageId',
        'mediumPreviewStorageId', 'largePreviewStorageId'].flatMap(key => {
        try {
            return data?.[key] ? [normalizeStorageId(data[key])] : [];
        } catch {
            return [];
        }
    });
    const sequelize = app.ms.database.sequelize;
    if (!ids.length || (sequelize.models && !sequelize.models.userOperationQueue)) {
        return;
    }
    // Target only exact pending-retirement candidates. A large resave backlog is
    // unrelated to a write fence and must not prevent its own optimized outputs.
    const candidates = `COALESCE(("asyncOperation"."output"::jsonb #> '{result,cleanup,candidates}'), '[]'::jsonb)`;
    const blocked = await sequelize.model('userOperationQueue').findOne({attributes: ['id'],
        include: [{association: 'asyncOperation', required: true, attributes: []}],
        where: {module: 'site-replacement', isWaiting: true,
            [Op.and]: literal(`EXISTS (SELECT 1 FROM jsonb_array_elements(${candidates}) candidate
                WHERE candidate->>'storageId' IN (${ids.map(id => sequelize.escape(id)).join(',')}))`)}});
    if (blocked) {
        problem('storage_cleanup_in_progress');
    }
}
