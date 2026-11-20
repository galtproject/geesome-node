import {createPublicKey, verify} from 'node:crypto';
import {CID} from 'multiformats/cid';
import {ApiProblemError} from '../api/problem.js';

export const MAX_RELEASE_BYTES = 512 * 1024 * 1024;
const fields = ['schemaVersion', 'version', 'platform', 'cid', 'sha256', 'size'];

export function releaseProblem(status: number, code: string) {
	return new ApiProblemError(status, code, code.replace(/_/g, ' '));
}

export function releasePublicKey(pem: string) {
	try {
		const key = createPublicKey(pem);
		if (key.asymmetricKeyType !== 'ed25519') {
			throw new Error('wrong_key_type');
		}
		return key;
	} catch {
		throw new Error('client_release_public_key_invalid');
	}
}

function exactFields(value, names) {
	return value && typeof value === 'object' && !Array.isArray(value)
		&& Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
}

function decode(value) {
	if (typeof value !== 'string' || !value || value.length % 4 !== 0
		|| !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
		throw releaseProblem(400, 'client_release_envelope_invalid');
	}
	const bytes = Buffer.from(value, 'base64');
	if (bytes.toString('base64') !== value) {
		throw releaseProblem(400, 'client_release_envelope_invalid');
	}
	return bytes;
}

export function releaseVersion(version: unknown): number[] {
	if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
		throw releaseProblem(400, 'client_release_version_invalid');
	}
	const parts = version.split('.').map(Number);
	if (parts.some(value => !Number.isSafeInteger(value))) {
		throw releaseProblem(400, 'client_release_version_invalid');
	}
	return parts;
}

export function compareReleaseVersions(left: string, right: string) {
	const a = releaseVersion(left);
	const b = releaseVersion(right);
	for (let i = 0; i < 3; i++) {
		if (a[i] !== b[i]) {
			return a[i] > b[i] ? 1 : -1;
		}
	}
	return 0;
}

export function verifyReleaseEnvelope(envelope, publicKey) {
	if (!exactFields(envelope, ['manifest', 'signature'])
		|| Buffer.byteLength(JSON.stringify(envelope)) > 16384) {
		throw releaseProblem(400, 'client_release_envelope_invalid');
	}
	const bytes = decode(envelope.manifest);
	const signature = decode(envelope.signature);
	if (signature.length !== 64 || !verify(null, bytes, publicKey, signature)) {
		throw releaseProblem(400, 'client_release_signature_invalid');
	}
	let manifest;
	try {
		manifest = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
	} catch {
		throw releaseProblem(400, 'client_release_manifest_invalid');
	}
	if (!exactFields(manifest, fields) || manifest.schemaVersion !== 1 || manifest.platform !== 'windows-x64'
		|| typeof manifest.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.sha256)
		|| !Number.isSafeInteger(manifest.size) || manifest.size < 1 || manifest.size > MAX_RELEASE_BYTES) {
		throw releaseProblem(400, 'client_release_manifest_invalid');
	}
	releaseVersion(manifest.version);
	try {
		if (typeof manifest.cid !== 'string' || manifest.cid.length > 128
			|| !/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,120})$/.test(manifest.cid)) {
			throw new Error('invalid_cid');
		}
		CID.parse(manifest.cid);
	} catch {
		throw releaseProblem(400, 'client_release_cid_invalid');
	}
	return manifest;
}
