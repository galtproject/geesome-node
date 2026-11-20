import {configuredReleaseKey} from './trust.js';
import {verifyReleaseEnvelope, compareReleaseVersions} from './manifest.js';

export class ReleaseImportError extends Error {}

const metadataLimit = 16384;
function publicAddress(value: string, origin?: string) {
	const url = new URL(value);
	const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
	if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password
		|| url.search || url.hash || (origin && url.origin !== origin)) {
		throw new ReleaseImportError('Client release addresses must use the same trusted HTTPS node (or loopback HTTP).');
	}
	return url;
}

async function readJson(response, limit = metadataLimit) {
	if (!response.body) {
		throw new ReleaseImportError('Empty client release response.');
	}
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of response.body) {
		size += chunk.length;
		if (size > limit) {
			throw new ReleaseImportError('Client release metadata exceeds its limit.');
		}
		chunks.push(Buffer.from(chunk));
	}
	return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function discover(nodeUrl, fetchImpl) {
	const node = publicAddress(nodeUrl);
	const get = url => fetchImpl(url, {redirect: 'error', signal: AbortSignal.timeout(15000)});
	let response = await get(new URL('/.well-known/geesome', node));
	if (response.status === 404) {
		response = await get(new URL('/api/.well-known/geesome', node));
	}
	if (!response.ok) {
		throw new ReleaseImportError(`Client release discovery failed (${response.status}).`);
	}
	const discovery = await readJson(response, 65536);
	const api = publicAddress(discovery.apiBaseUrl, node.origin).href.replace(/\/$/, '');
	const capability = discovery.capabilities?.clientReleases;
	if (capability?.schemaVersion !== 1 || !Array.isArray(capability.platforms) || !capability.platforms.includes('windows-x64')) {
		throw new ReleaseImportError('This node does not support client release distribution. Update/enable its clientReleases module.');
	}
	const stable = publicAddress(capability.stableUrl, node.origin).href;
	if (stable !== `${api}/client-releases/stable/windows-x64`) {
		throw new ReleaseImportError('Client release discovery does not match the public API base.');
	}
	return {api, stable};
}

// No private publisher key and no arbitrary-URL fetch on the destination server.
// Its existing publication path fetches and pins the original signed CID through IPFS.
export async function importClientRelease({source, node, apiKey, trust = {}, fetchImpl = fetch}: {
	source: string; node: string; apiKey: string; trust?: {enabled?: boolean; publicKey?: string}; fetchImpl?: typeof fetch;
}) {
	if (typeof apiKey !== 'string' || !apiKey.trim()) {
		throw new ReleaseImportError('Set GEESOME_RELEASE_API_KEY to the destination node administrator API key.');
	}
	const key = configuredReleaseKey(trust);
	if (!key) {
		throw new ReleaseImportError('Client release distribution is explicitly disabled.');
	}
	const from = await discover(source, fetchImpl);
	const response = await fetchImpl(from.stable, {redirect: 'error', signal: AbortSignal.timeout(15000)});
	if (!response.ok) {
		throw new ReleaseImportError(response.status === 404 ? 'No stable Windows client has been published on the source node.'
			: `Source release lookup failed (${response.status}).`);
	}
	const envelope = await readJson(response);
	const manifest = verifyReleaseEnvelope(envelope, key);
	const destination = await discover(node, fetchImpl);
	const current = await fetchImpl(destination.stable, {redirect: 'error', signal: AbortSignal.timeout(15000)});
	if (current.ok) {
		const previous = await readJson(current);
		const installed = verifyReleaseEnvelope(previous, key);
		if (compareReleaseVersions(installed.version, manifest.version) > 0) {
			throw new ReleaseImportError('The destination already advertises a newer stable client.');
		}
		if (installed.version === manifest.version) {
			if (previous.manifest !== envelope.manifest || previous.signature !== envelope.signature) {
				throw new ReleaseImportError('The destination already has a different descriptor for this version.');
			}
			return {version: manifest.version, cid: manifest.cid, alreadyPublished: true};
		}
	} else if (current.status !== 404) {
		throw new ReleaseImportError(`Destination release lookup failed (${current.status}).`);
	}
	const published = await fetchImpl(`${destination.api}/admin/client-releases/stable/windows-x64`, {
		method: 'POST', redirect: 'error', signal: AbortSignal.timeout(300000),
		headers: {'content-type': 'application/json', authorization: `Bearer ${apiKey}`},
		body: JSON.stringify(envelope)
	});
	if (!published.ok) {
		// Do not echo an untrusted response, which could reflect the administrator key.
		throw new ReleaseImportError(`Destination refused client release import (${published.status}). Its stable release is unchanged on validation failure; ensure the administrator key and source CID availability through IPFS.`);
	}
	const accepted = await readJson(published);
	verifyReleaseEnvelope(accepted, key);
	if (accepted.manifest !== envelope.manifest || accepted.signature !== envelope.signature) {
		throw new ReleaseImportError('Destination did not acknowledge the requested signed release. Recheck stable before retrying.');
	}
	return {version: manifest.version, cid: manifest.cid, alreadyPublished: false};
}
