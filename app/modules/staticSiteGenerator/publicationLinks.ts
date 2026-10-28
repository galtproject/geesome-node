import {CID} from 'multiformats/cid';

export const uriListLimit = 16 * 1024;

// Canonical stored URI is gateway-independent. Legacy gateway-relative links
// remain readable, but newly written URI lists use ipfs:// and CRLF lines.
export function ipfsLink(value: unknown) {
	if (typeof value !== 'string' || value.length > 4096 || /[\s\\\u0000-\u001f\u007f]/.test(value)) {
		return null;
	}
	const match = /^(?:ipfs:\/\/|\/ipfs\/)([^/?#]+)([^?#]*)(\?[^#]*)?(#.*)?$/.exec(value);
	if (!match) {
		return null;
	}
	try {
		const cid = CID.parse(match[1]).toString();
		const path = match[2];
		for (const segment of path.split('/')) {
			const decoded = decodeURIComponent(segment);
			if (decoded === '.' || decoded === '..' || /[\\/\u0000-\u001f\u007f]/.test(decoded)) {
				return null;
			}
		}
		const suffix = path + (match[3] || '') + (match[4] || '');
		return {cid, path, uri: `ipfs://${cid}${suffix}`, url: `/ipfs/${cid}${suffix}`};
	} catch {
		return null;
	}
}

export function ipfsUriList(value: unknown) {
	if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > uriListLimit) {
		throw new Error('publication_link_invalid');
	}
	const lines = value.split(/\r\n|\n/).filter(line => line && !line.startsWith('#'));
	if (!lines.length || lines.length > 100) {
		throw new Error('publication_link_invalid');
	}
	return lines.map(line => {
		const link = ipfsLink(line);
		if (!link) {
			throw new Error('publication_link_invalid');
		}
		return link;
	});
}

export async function contentIpfsLinks(storage, content) {
	if (Number(content.size || 0) > uriListLimit) {
		throw new Error('publication_link_invalid');
	}
	const stream = await storage.getFileStream(content.storageId);
	const chunks = [];
	let bytes = 0;
	const timer = setTimeout(() => stream.destroy(new Error('publication_link_timeout')), 15000);
	try {
		for await (const chunk of stream) {
			bytes += Buffer.byteLength(chunk);
			if (bytes > uriListLimit) {
				throw new Error('publication_link_invalid');
			}
			chunks.push(Buffer.from(chunk));
		}
		return ipfsUriList(Buffer.concat(chunks).toString('utf8'));
	} finally {
		clearTimeout(timer);
		stream.destroy();
	}
}

export async function postIpfsLinks(storage, post) {
	const result = [];
	for (const content of post.contents || []) {
		if (String(content.mimeType).split(';', 1)[0].trim().toLowerCase() === 'text/uri-list') {
			result.push(...await contentIpfsLinks(storage, content));
		}
	}
	return result;
}
