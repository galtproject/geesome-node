import crypto from 'node:crypto';
import type {
	IActivityPubActorKey,
	IActivityPubGeneratedKeyPair,
	IActivityPubSignedRequest,
	IActivityPubSignRequestOptions
} from './interface.js';

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
	const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
	const digest = crypto.createHash('sha256').update(buffer).digest('base64');

	return `SHA-256=${digest}`;
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

function normalizeHeaders(headers: IActivityPubSignRequestOptions['headers'] = {}): Record<string, string> {
	const result = {};
	Object.keys(headers || {}).forEach((name) => {
		result[normalizeHeaderName(name)] = String(headers[name]);
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

function getActivityPubSignatureDate(value?: Date | string): string {
	const date = getActivityPubSignatureDateValue(value);
	if (Number.isNaN(date.getTime())) {
		throw new Error('activitypub_signature_date_invalid');
	}
	return date.toUTCString();
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
