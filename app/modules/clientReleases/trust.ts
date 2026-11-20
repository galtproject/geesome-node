import {readFileSync} from 'node:fs';
import {releasePublicKey} from './manifest.js';

// Same publisher as the official client. Never take a replacement trust key from discovery.
export const officialReleasePublicKey = readFileSync(new URL('./official-public-key.pem', import.meta.url), 'utf8');

export function configuredReleaseKey(config: {enabled?: boolean; publicKey?: string} = {}) {
	if (config?.enabled === false) {
		return null;
	}
	return releasePublicKey(config?.publicKey || officialReleasePublicKey);
}
