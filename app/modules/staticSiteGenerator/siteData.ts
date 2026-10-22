import {normalizeStorageId as normalizeUnixfsId} from '../archive/index.js';
import {problem} from '../content/publicationImagePolicy.js';
export function pageCid(value) {
    try {
        return normalizeUnixfsId(new URL(value).pathname.match(/^\/ipfs\/([A-Za-z0-9]+)(?:\/|$)/)?.[1]);
    } catch {
        problem('image_replacement_page_invalid');
    }
}

export async function readSiteData(storage, cid) {
    const input = await storage.getFileStream(`${cid}/clientData.js`);
    const timer = setTimeout(() => input.destroy(new Error('site_manifest_timeout')), 30000);
    const chunks = [];
    let size = 0;
    try {
        for await (const chunk of input) {
            size += chunk.length;
            if (size > 4 * 1024 * 1024) {
                problem('image_replacement_manifest_too_large');
            }
            chunks.push(Buffer.from(chunk));
        }
    } finally {
        clearTimeout(timer);
        input.destroy();
    }
    const text = Buffer.concat(chunks).toString().trim();
    if (!text.startsWith('export default ')) {
        problem('image_replacement_manifest_invalid');
    }
    return JSON.parse(text.slice('export default '.length).replace(/;\s*$/, ''));
}
