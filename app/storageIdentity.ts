import {createHash} from 'node:crypto';
import ipfsHelper from 'geesome-libs/src/ipfsHelper.js';
import {problem} from './modules/content/publicationImagePolicy.js';
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const plain = row => typeof row?.toJSON === 'function' ? row.toJSON() : row;
export function normalizeStorageId(value) {
    try {
        if (typeof value !== 'string' || value.length > 100 || !/^[A-Za-z0-9]+$/.test(value)) {
            throw new Error('invalid CID');
        }
        const cid = ipfsHelper.ipfsHashToCid(value);
        if (![0x70, 0x55, 0x71, 0x0129].includes(cid.code)) {
            throw new Error('unsupported codec');
        }
        return cid.toV1().toString();
    } catch {
        problem('invalid_storage_id', 400);
    }
}
export const sameCid = (a, b) => Boolean(a && b) && normalizeStorageId(a) === normalizeStorageId(b);
export const variants = cid => {
    const parsed = ipfsHelper.ipfsHashToCid(cid);
    return [...new Set([cid, parsed.toV1().toString(), ...(parsed.code === 0x70 ? [parsed.toV0().toString()] : [])])];
};
export const imageFiles = content => [...new Set(['storageId', 'manifestStorageId', 'smallPreviewStorageId',
    'mediumPreviewStorageId', 'largePreviewStorageId'].map(key => content?.[key]).filter(Boolean).map(normalizeStorageId))];
