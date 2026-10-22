import {Op} from 'sequelize';
import {imageFiles, sameCid, normalizeStorageId} from '../../storageIdentity.js';
import {problem} from '../content/publicationImagePolicy.js';

export async function storageJobs(app) {
    const sequelize = app.ms.database.sequelize;
    if (sequelize.models && !sequelize.models.userOperationQueue) {
        return []; // Minimal module configurations cannot create these workflows.
    }
    return sequelize.model('userOperationQueue').findAll({where: {
        module: {[Op.in]: ['site-replacement', 'content-resave']}, isWaiting: true}, limit: 1001});
}
export async function countStorageHolds(app, cid, excludeJobId = null) {
    const rows = await storageJobs(app);
    if (rows.length > 1000) {
        return 1001;
    }
    let count = 0;
    for (const row of rows) {
        if (row.module === 'site-replacement' && row.id === excludeJobId) {
            continue;
        }
        try {
            const state = JSON.parse(row.inputJson);
            if (row.module === 'site-replacement' && state.result?.cleanup?.holdsReleased) {
                continue;
            }
            const ids = row.module === 'content-resave' ? imageFiles(state.source)
                : [...state.input.sources.flatMap(imageFiles), state.input.previous?.storageId, state.input.previous?.archiveStorageId].filter(Boolean);
            if (ids.some(id => sameCid(id, cid))) {
                count++;
            }
        } catch {
            return 1001; // Unknown pending work must fail closed.
        }
    }
    return count;
}
export async function assertStorageWritable(app, data) {
    // Ordinary remote identities are outside local IPFS retirement.
    const ids = ['storageId', 'manifestStorageId', 'smallPreviewStorageId',
        'mediumPreviewStorageId', 'largePreviewStorageId'].flatMap(key => {
        try {
            return data?.[key] ? [normalizeStorageId(data[key])] : [];
        } catch {
            return [];
        }
    });
    if (!ids.length) {
        return;
    }
    const rows = await storageJobs(app);
    if (rows.length > 1000) {
        problem('storage_maintenance_busy');
    }
    for (const row of rows.filter(job => job.module === 'site-replacement')) {
        const state = JSON.parse(row.inputJson);
        if (state.result?.cleanup?.candidates?.some(candidate => ids.includes(normalizeStorageId(candidate.storageId)))) {
            problem('storage_cleanup_in_progress');
        }
    }
}
