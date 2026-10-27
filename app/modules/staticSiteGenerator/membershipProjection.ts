import {createHash} from 'node:crypto';
import ipfsHelper from 'geesome-libs/src/ipfsHelper.js';
export const snapshotCid = value => typeof value === 'string' ? ipfsHelper.ipfsHashToCid(value).toString() : ipfsHelper.cidToIpfsHash(value);
export const publicationDigest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function membershipMetadata(post) {
	try {
		return JSON.parse(post.propertiesJson || '{}').membership || null;
	} catch {
		return null;
	}
}
