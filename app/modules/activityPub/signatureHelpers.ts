import crypto from 'node:crypto';
import type {
	IActivityPubActorKey,
	IActivityPubGeneratedKeyPair,
	IActivityPubRemoteActorKey,
	IActivityPubRequestSignatureInfo,
	IActivityPubSignedRequest,
	IActivityPubSignRequestOptions,
	IActivityPubVerifiedRequest,
	IActivityPubVerifyRequestOptions
} from './interface.js';

const defaultActivityPubSignatureClockSkewMs = 12 * 60 * 60 * 1000;

export function generateActivityPubRsaKeyPair(): IActivityPubGeneratedKeyPair {
	const {publicKey, privateKey} = crypto.generateKeyPairSync('rsa', {
		modulusLength: 2048,
		publicKeyEncoding: {
			type: 'spki',
			format: 'pem'
		},
		privateKeyEncoding: {
			type: 'pkcs8',
			format: 'pem'
		}
	});

	return {
		publicKeyPem: publicKey,
		privateKeyPem: privateKey
	};
}

export function signActivityPubRequestWithKey(actorKey: IActivityPubActorKey, options: IActivityPubSignRequestOptions): IActivityPubSignedRequest {
	const url = new URL(options.url);
	const headers = getActivityPubSignatureHeaders(options, url);
	const signedHeaders = getActivityPubSignedHeaders(options, headers);
	const signingString = getActivityPubSigningString(options.method, url, headers, signedHeaders);
	const signature = crypto
		.createSign('RSA-SHA256')
		.update(signingString)
		.end()
		.sign(actorKey.privateKeyPem, 'base64');

	headers.Signature = [
		`keyId="${actorKey.keyId}"`,
		'algorithm="rsa-sha256"',
		`headers="${signedHeaders.join(' ')}"`,
		`signature="${signature}"`
	].join(',');

	return {
		headers,
		signature,
		signingString,
		signedHeaders
	};
}

export function getActivityPubDigestHeader(body: string | Buffer): string {
	return `SHA-256=${getActivityPubBodyDigest(body)}`;
}

export function getActivityPubContentDigestHeader(body: string | Buffer): string {
	return `sha-256=:${getActivityPubBodyDigest(body)}:`;
}

export function getActivityPubRequestSignatureInfo(options: IActivityPubVerifyRequestOptions): IActivityPubRequestSignatureInfo {
	const headers = normalizeHeaders(options.headers);
	const signatureHeader = getSignatureHeader(headers);
	const params = parseActivityPubSignatureHeader(signatureHeader);
	const signedHeaders = getInboundSignedHeaders(params.headers);

	return {
		keyId: getRequiredSignatureParam(params, 'keyId'),
		algorithm: getRequiredSignatureParam(params, 'algorithm').toLowerCase(),
		signature: getRequiredSignatureParam(params, 'signature'),
		signedHeaders
	};
}

export function verifyActivityPubRequestWithKey(actorKey: IActivityPubRemoteActorKey, options: IActivityPubVerifyRequestOptions): IActivityPubVerifiedRequest {
	const url = getActivityPubSignatureUrl(options.url);
	const headers = normalizeHeaders(options.headers);
	const signatureInfo = getActivityPubRequestSignatureInfo({...options, headers});

	assertActivityPubSignatureKeyMatches(actorKey, signatureInfo);
	assertActivityPubSignatureAlgorithm(signatureInfo);
	assertRequiredActivityPubSignedHeaders(signatureInfo, options);
	const digestVerified = verifyActivityPubDigest(headers, options.body, signatureInfo.signedHeaders);
	assertActivityPubSignedDate(headers, options);

	const signingString = getActivityPubSigningString(options.method, url, headers, signatureInfo.signedHeaders);
	const isVerified = crypto
		.createVerify('RSA-SHA256')
		.update(signingString)
		.end()
		.verify(actorKey.publicKeyPem, signatureInfo.signature, 'base64');
	if (!isVerified) {
		throw new Error('activitypub_signature_invalid');
	}

	return {
		...signatureInfo,
		signingString,
		digestVerified
	};
}

function getActivityPubSignatureHeaders(options: IActivityPubSignRequestOptions, url: URL): Record<string, string> {
	const headers = normalizeHeaders(options.headers);
	headers.Host = headers.Host || url.host;
	headers.Date = headers.Date || getActivityPubSignatureDate(options.date);
	if (options.body !== undefined && options.body !== null) {
		headers.Digest = headers.Digest || getActivityPubDigestHeader(options.body);
	}
	return headers;
}

function getSignatureHeader(headers: Record<string, string>): string {
	if (headers.Signature) {
		return headers.Signature;
	}
	if (headers.Authorization?.startsWith('Signature ')) {
		return headers.Authorization.slice('Signature '.length);
	}
	throw new Error('activitypub_signature_required');
}

function parseActivityPubSignatureHeader(value: string): Record<string, string> {
	const result = {};
	splitSignatureHeaderParams(value).forEach((part) => {
		const separatorIndex = part.indexOf('=');
		if (separatorIndex < 1) {
			return;
		}
		const key = part.slice(0, separatorIndex).trim();
		const rawValue = part.slice(separatorIndex + 1).trim();
		result[key] = stripSignatureHeaderQuotes(rawValue);
	});
	return result;
}

function splitSignatureHeaderParams(value: string): string[] {
	const result: string[] = [];
	let current = '';
	let insideQuotes = false;
	Array.from(String(value || '')).forEach((char) => {
		if (char === '"') {
			insideQuotes = !insideQuotes;
		}
		if (char === ',' && !insideQuotes) {
			result.push(current.trim());
			current = '';
			return;
		}
		current += char;
	});
	if (current.trim()) {
		result.push(current.trim());
	}
	return result;
}

function stripSignatureHeaderQuotes(value: string): string {
	return value.replace(/^"|"$/g, '');
}

function getRequiredSignatureParam(params: Record<string, string>, name: string): string {
	if (!params[name]) {
		throw new Error(`activitypub_signature_param_missing:${name}`);
	}
	return params[name];
}

function getInboundSignedHeaders(value?: string): string[] {
	if (!value) {
		return ['date'];
	}
	return value.split(/\s+/).filter(Boolean).map((name) => name.toLowerCase());
}

function getActivityPubSignedHeaders(options: IActivityPubSignRequestOptions, headers: Record<string, string>): string[] {
	if (options.signedHeaders?.length) {
		return options.signedHeaders;
	}
	if (headers.Digest) {
		return ['(request-target)', 'host', 'date', 'digest'];
	}
	return ['(request-target)', 'host', 'date'];
}

function getActivityPubSigningString(method: string, url: URL, headers: Record<string, string>, signedHeaders: string[]): string {
	return signedHeaders.map((name) => {
		if (name === '(request-target)') {
			return `(request-target): ${String(method || 'GET').toLowerCase()} ${getRequestTarget(url)}`;
		}
		return `${name.toLowerCase()}: ${getHeaderValue(headers, name)}`;
	}).join('\n');
}

function normalizeHeaders(headers: IActivityPubSignRequestOptions['headers'] | IActivityPubVerifyRequestOptions['headers'] = {}): Record<string, string> {
	const result = {};
	Object.keys(headers || {}).forEach((name) => {
		const value = headers[name];
		if (value === undefined) {
			return;
		}
		result[normalizeHeaderName(name)] = Array.isArray(value) ? value.join(', ') : String(value);
	});
	return result;
}

function normalizeHeaderName(name: string): string {
	return String(name)
		.split('-')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
		.join('-');
}

function getHeaderValue(headers: Record<string, string>, name: string): string {
	const headerName = normalizeHeaderName(name);
	if (headers[headerName] === undefined) {
		throw new Error(`activitypub_signature_header_missing:${name}`);
	}
	return headers[headerName];
}

function assertActivityPubSignatureKeyMatches(actorKey: IActivityPubRemoteActorKey, signatureInfo: IActivityPubRequestSignatureInfo): void {
	if (actorKey.keyId === signatureInfo.keyId) {
		return;
	}
	throw new Error('activitypub_signature_key_mismatch');
}

function assertActivityPubSignatureAlgorithm(signatureInfo: IActivityPubRequestSignatureInfo): void {
	if (signatureInfo.algorithm === 'rsa-sha256') {
		return;
	}
	throw new Error(`activitypub_signature_algorithm_unsupported:${signatureInfo.algorithm}`);
}

function assertRequiredActivityPubSignedHeaders(signatureInfo: IActivityPubRequestSignatureInfo, options: IActivityPubVerifyRequestOptions): void {
	const requiredHeaders = getRequiredActivityPubSignedHeaders(options);
	const signedHeaders = new Set(signatureInfo.signedHeaders.map((header) => header.toLowerCase()));
	requiredHeaders.forEach((header) => {
		if (signedHeaders.has(header)) {
			return;
		}
		throw new Error(`activitypub_signature_signed_header_missing:${header}`);
	});
}

function getRequiredActivityPubSignedHeaders(options: IActivityPubVerifyRequestOptions): string[] {
	if (options.requiredSignedHeaders?.length) {
		return options.requiredSignedHeaders.map((header) => header.toLowerCase());
	}
	return ['(request-target)', 'host', 'date'];
}

function verifyActivityPubDigest(headers: Record<string, string>, body?: string | Buffer, signedHeaders: string[] = []): boolean {
	if (!hasActivityPubRequestBody(body)) {
		return false;
	}
	const signedDigestHeaders = getSignedActivityPubDigestHeaders(signedHeaders);
	if (!signedDigestHeaders.length) {
		throw new Error('activitypub_signature_signed_header_missing:digest');
	}
	signedDigestHeaders.forEach((headerName) => {
		verifySignedActivityPubDigestHeader(headers, body as string | Buffer, headerName);
	});
	return true;
}

function getSignedActivityPubDigestHeaders(signedHeaders: string[]): string[] {
	return signedHeaders
		.map((header) => header.toLowerCase())
		.filter((header) => header === 'digest' || header === 'content-digest');
}

function verifySignedActivityPubDigestHeader(headers: Record<string, string>, body: string | Buffer, headerName: string): void {
	if (headerName === 'content-digest') {
		verifyActivityPubContentDigest(headers, body);
		return;
	}
	verifyLegacyActivityPubDigest(headers, body);
}

function verifyLegacyActivityPubDigest(headers: Record<string, string>, body: string | Buffer): void {
	const digest = getHeaderValue(headers, 'digest');
	if (!digest.toLowerCase().startsWith('sha-256=')) {
		throw new Error('activitypub_digest_algorithm_unsupported');
	}
	if (!safeEqualString(digest, getActivityPubDigestHeader(body))) {
		throw new Error('activitypub_digest_mismatch');
	}
}

function verifyActivityPubContentDigest(headers: Record<string, string>, body: string | Buffer): void {
	const digest = parseActivityPubContentDigestHeader(getHeaderValue(headers, 'content-digest'));
	if (!digest) {
		throw new Error('activitypub_digest_algorithm_unsupported');
	}
	if (!safeEqualString(digest, getActivityPubBodyDigest(body))) {
		throw new Error('activitypub_digest_mismatch');
	}
}

function parseActivityPubContentDigestHeader(value: string): string {
	const structuredDigest = /(?:^|,)\s*sha-256\s*=\s*:([^:]+):\s*(?:,|$)/i.exec(value);
	if (structuredDigest?.[1]) {
		return structuredDigest[1];
	}
	const legacyDigest = /(?:^|,)\s*sha-256\s*=\s*([^,\s]+)\s*(?:,|$)/i.exec(value);
	if (legacyDigest?.[1]) {
		return legacyDigest[1];
	}
	return '';
}

function assertActivityPubSignedDate(headers: Record<string, string>, options: IActivityPubVerifyRequestOptions): void {
	const date = getActivityPubSignatureDateValue(getHeaderValue(headers, 'date'));
	if (Number.isNaN(date.getTime())) {
		throw new Error('activitypub_signature_date_invalid');
	}
	const now = getActivityPubSignatureDateValue(options.now);
	const maxClockSkewMs = options.maxClockSkewMs ?? defaultActivityPubSignatureClockSkewMs;
	if (Math.abs(now.getTime() - date.getTime()) <= maxClockSkewMs) {
		return;
	}
	throw new Error('activitypub_signature_date_out_of_range');
}

function getActivityPubSignatureDate(value?: Date | string): string {
	const date = getActivityPubSignatureDateValue(value);
	if (Number.isNaN(date.getTime())) {
		throw new Error('activitypub_signature_date_invalid');
	}
	return date.toUTCString();
}

function getActivityPubSignatureUrl(value: string): URL {
	return new URL(value, 'https://activitypub.local');
}

function getRequestTarget(url: URL): string {
	return `${url.pathname}${url.search}`;
}

function getActivityPubSignatureDateValue(value?: Date | string): Date {
	if (!value) {
		return new Date();
	}
	if (value instanceof Date) {
		return value;
	}
	return new Date(value);
}

function hasActivityPubRequestBody(body?: string | Buffer): boolean {
	return body !== undefined && body !== null;
}

function getActivityPubBodyDigest(body: string | Buffer): string {
	const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
	return crypto.createHash('sha256').update(buffer).digest('base64');
}

function safeEqualString(left: string, right: string): boolean {
	const leftBuffer = Buffer.from(left);
	const rightBuffer = Buffer.from(right);
	if (leftBuffer.length !== rightBuffer.length) {
		return false;
	}
	return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
