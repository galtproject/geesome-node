import {buildBlueskyFeedPostRecord, buildBlueskyImageEmbed, createBlueskySession, uploadBlueskyBlob, createBlueskyRecord} from '../../bluesky/helpers.js';
import {check, didPattern, handlePattern, secret, loadImages, readJson, ServerPublicationError} from './common.js';
import {blueskyFacets} from './blueskyFacets.js';

const origin = 'https://bsky.social';
export function createBlueskyProvider(transport: any) {
	const fetchHelper = (mayPublish: boolean) => async (url, options) => {
		const parsed = new URL(url);
		check(parsed.origin === origin && !parsed.username && !parsed.password && /^\/xrpc\/(com\.atproto\.(server\.createSession|repo\.(uploadBlob|createRecord)))$/.test(parsed.pathname), 'Bluesky request endpoint is invalid');
		return transport(url, options, mayPublish);
	};
	async function session(credentials: any) {
		check(credentials && typeof credentials.identifier === 'string' && (handlePattern.test(credentials.identifier) || didPattern.test(credentials.identifier)), 'Bluesky account identifier is invalid');
		secret(credentials.appPassword);
		let result;
		try {
			result = await createBlueskySession({identifier: credentials.identifier, password: credentials.appPassword, origin, fetch: fetchHelper(false)});
		} catch (error) {
			if (error instanceof ServerPublicationError) {
				throw error;
			}
			throw new ServerPublicationError('Bluesky session was not confirmed');
		}
		check(didPattern.test(result.did) && result.handle && handlePattern.test(result.handle), 'Bluesky account identity is invalid');
		check(credentials.identifier.startsWith('did:') ? credentials.identifier === result.did : credentials.identifier.toLowerCase() === result.handle.toLowerCase(), 'Bluesky session identity does not match');
		secret(result.accessJwt);
		return result;
	}
	return {
		async verify(credentials: any, target: any = {}) {
			check(!Object.keys(target).length, 'Bluesky destination parameters are invalid');
			const connected = await session(credentials);
			return {accountIdentity: connected.did, username: connected.handle, target: {}};
		},
		async publish(account: any, payload: any, loadMedia: any) {
			check(Object.keys(payload.target).length === 0, 'Bluesky publication target is invalid');
			const connected = await session(account.credentials);
			check(connected.did === account.accountIdentity, 'Bluesky publishing account changed');
			const images = await loadImages(payload, loadMedia, 2000000);
			const facets = await blueskyFacets(payload.text, async handle => {
				const result = await readJson(transport, `${origin}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`);
				check(didPattern.test(result?.did || ''), 'Bluesky mention identity is invalid');
				return result.did;
			});
			const blobs = [];
			for (const image of images) {
				let blob;
				try {
					blob = await uploadBlueskyBlob({data: image.bytes, mimeType: image.mimeType, origin, accessJwt: connected.accessJwt, fetch: fetchHelper(false)});
				} catch (error) {
					if (error instanceof ServerPublicationError) {
						throw error;
					}
					throw new ServerPublicationError('Bluesky image upload was not confirmed');
				}
				check(blob?.$type === 'blob' && /^[A-Za-z0-9]{1,256}$/.test(blob.ref?.$link || '') && blob.mimeType === image.mimeType && blob.size === image.bytes.length, 'Bluesky uploaded image receipt is invalid');
				blobs.push({alt: '', image: blob});
			}
			const record = buildBlueskyFeedPostRecord({text: payload.text, facets, ...(blobs.length ? {embed: buildBlueskyImageEmbed(blobs)} : {})});
			if (payload.contentType === 'nsfw') {
				record.labels = {$type: 'com.atproto.label.defs#selfLabels', values: [{val: 'porn'}]};
			}
			let result;
			try {
				result = await createBlueskyRecord({repo: connected.did, collection: 'app.bsky.feed.post', record, origin, accessJwt: connected.accessJwt, fetch: fetchHelper(true)});
			} catch (error) {
				if (error instanceof ServerPublicationError) {
					throw error;
				}
				throw new ServerPublicationError('Bluesky publication was not confirmed', true);
			}
			const prefix = `at://${connected.did}/app.bsky.feed.post/`;
			check(typeof result.uri === 'string' && result.uri.startsWith(prefix) && result.uri.length <= 500 && /^[A-Za-z0-9._~-]{1,128}$/.test(result.uri.slice(prefix.length)) && /^[A-Za-z0-9]{1,256}$/.test(result.cid || ''), 'Bluesky publication identity was not confirmed', true);
			return {remoteId: result.uri, remoteUrl: `https://bsky.app/profile/${connected.did}/post/${result.uri.slice(prefix.length)}`};
		}
	};
}
