import assert from 'node:assert';
import {
	atProtoPostRecordToRichText,
	blueskyFeedPostCollection,
	blueskyPostSource,
	buildBlueskyActorProfileUrl,
	buildBlueskyAuthorFeedUrl,
	buildBlueskyCreateRecordUrl,
	buildBlueskyCreateSessionUrl,
	buildBlueskyFeedPostRecord,
	buildBlueskyPostRecordUrl,
	createBlueskyRecord,
	createBlueskySession,
	fetchBlueskyAuthorFeed,
	fetchBlueskyActorProfile,
	fetchBlueskyPostRecord,
	getBlueskyProjectionPreview,
	normalizeBlueskyAuthorFeedFilter,
	normalizeBlueskyActor,
	parseBlueskyPostAtUri,
	projectBlueskyAuthorFeed
} from '../app/modules/bluesky/helpers.js';
import {richTextToPlainText} from '../app/richText.js';

describe('bluesky helpers', () => {
	it('builds native ATProto author feed URLs without bridge-specific state', () => {
		const url = buildBlueskyAuthorFeedUrl({
			actor: '@bsky.app',
			origin: 'https://public.api.bsky.app/',
			limit: 200,
			filter: 'posts_no_replies',
			cursor: 'next-cursor'
		});

		assert.equal(
			url,
			'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=bsky.app&limit=100&filter=posts_no_replies&cursor=next-cursor'
		);
		assert.equal(normalizeBlueskyActor('@alice.bsky.social'), 'alice.bsky.social');
		assert.throws(() => normalizeBlueskyActor(''), /bluesky_actor_required/);
		assert.equal(normalizeBlueskyAuthorFeedFilter('posts_and_author_threads'), 'posts_and_author_threads');
		assert.equal(normalizeBlueskyAuthorFeedFilter(undefined), undefined);
		assert.throws(() => normalizeBlueskyAuthorFeedFilter('likes'), /bluesky_author_feed_filter_invalid/);
	});

	it('creates authenticated sessions and fetches actor profiles through injectable XRPC calls', async () => {
		const calls: any[] = [];
		const session = await createBlueskySession({
			identifier: '@alice.bsky.social',
			password: 'app-password',
			origin: 'https://bsky.social/',
			fetch: async (url, options) => {
				calls.push({url, options});
				return {
					ok: true,
					json: async () => ({
						did: 'did:plc:alice',
						handle: 'alice.bsky.social',
						accessJwt: 'access-token',
						refreshJwt: 'refresh-token'
					})
				};
			}
		});
		const profile = await fetchBlueskyActorProfile({
			actor: session.did,
			origin: 'https://bsky.social/',
			accessJwt: session.accessJwt,
			fetch: async (url, options) => {
				calls.push({url, options});
				return {
					ok: true,
					json: async () => ({
						did: 'did:plc:alice',
						handle: 'alice.bsky.social',
						displayName: 'Alice',
						description: 'hello',
						avatar: 'https://cdn.example/avatar.jpg'
					})
				};
			}
		});

		assert.equal(buildBlueskyCreateSessionUrl({origin: 'https://bsky.social/'}), 'https://bsky.social/xrpc/com.atproto.server.createSession');
		assert.equal(buildBlueskyActorProfileUrl({origin: 'https://bsky.social/', actor: '@alice.bsky.social'}), 'https://bsky.social/xrpc/app.bsky.actor.getProfile?actor=alice.bsky.social');
		assert.equal(calls[0].url, 'https://bsky.social/xrpc/com.atproto.server.createSession');
		assert.equal(calls[0].options.method, 'POST');
		assert.deepEqual(JSON.parse(calls[0].options.body), {
			identifier: 'alice.bsky.social',
			password: 'app-password'
		});
		assert.equal(calls[1].url, 'https://bsky.social/xrpc/app.bsky.actor.getProfile?actor=did%3Aplc%3Aalice');
		assert.equal(calls[1].options.headers.Authorization, 'Bearer access-token');
		assert.deepEqual(session, {
			did: 'did:plc:alice',
			handle: 'alice.bsky.social',
			accessJwt: 'access-token',
			refreshJwt: 'refresh-token'
		});
		assert.deepEqual(profile, {
			did: 'did:plc:alice',
			handle: 'alice.bsky.social',
			displayName: 'Alice',
			description: 'hello',
			avatar: 'https://cdn.example/avatar.jpg'
		});
		await assert.rejects(
			() => createBlueskySession({
				identifier: 'alice.bsky.social',
				password: '',
				fetch: async () => ({ok: true, json: async () => ({})})
			}),
			/bluesky_account_password_required/
		);
	});

	it('builds and creates native ATProto feed post records', async () => {
		const calls: any[] = [];
		const record = buildBlueskyFeedPostRecord({
			text: 'Hello site',
			facets: [{
				$type: 'app.bsky.richtext.facet',
				index: {byteStart: 6, byteEnd: 10},
				features: [{
					$type: 'app.bsky.richtext.facet#link',
					uri: 'https://example.com'
				}]
			}],
			langs: ['en', 'pt', 'extra', 'ignored'],
			createdAt: '2026-07-04T08:00:00.000Z'
		});
		const created = await createBlueskyRecord({
			repo: 'did:plc:alice',
			collection: blueskyFeedPostCollection,
			record,
			origin: 'https://bsky.social/',
			accessJwt: 'access-token',
			fetch: async (url, options) => {
				calls.push({url, options});
				return {
					ok: true,
					json: async () => ({
						uri: 'at://did:plc:alice/app.bsky.feed.post/3k4duaz5vfs2b',
						cid: 'bafycreate'
					})
				};
			}
		});

		assert.equal(buildBlueskyCreateRecordUrl({origin: 'https://bsky.social/'}), 'https://bsky.social/xrpc/com.atproto.repo.createRecord');
		assert.deepEqual(record, {
			$type: 'app.bsky.feed.post',
			text: 'Hello site',
			createdAt: '2026-07-04T08:00:00.000Z',
			facets: [{
				$type: 'app.bsky.richtext.facet',
				index: {byteStart: 6, byteEnd: 10},
				features: [{
					$type: 'app.bsky.richtext.facet#link',
					uri: 'https://example.com'
				}]
			}],
			langs: ['en', 'pt', 'extra']
		});
		assert.deepEqual(created, {
			uri: 'at://did:plc:alice/app.bsky.feed.post/3k4duaz5vfs2b',
			cid: 'bafycreate'
		});
		assert.equal(calls[0].url, 'https://bsky.social/xrpc/com.atproto.repo.createRecord');
		assert.equal(calls[0].options.method, 'POST');
		assert.equal(calls[0].options.headers.Authorization, 'Bearer access-token');
		assert.deepEqual(JSON.parse(calls[0].options.body), {
			repo: 'did:plc:alice',
			collection: blueskyFeedPostCollection,
			record
		});
		assert.throws(
			() => buildBlueskyFeedPostRecord({text: '   '}),
			/bluesky_cross_post_text_required/
		);
		assert.throws(
			() => buildBlueskyFeedPostRecord({text: 'a'.repeat(301)}),
			/bluesky_cross_post_text_too_long/
		);
	});

	it('builds and fetches native ATProto post record lookups', async () => {
		const url = buildBlueskyPostRecordUrl({
			origin: 'https://public.api.bsky.app/',
			uri: 'at://did:plc:alice/app.bsky.feed.post/3k4duaz5vfs2b'
		});
		const calls: any[] = [];
		const record = await fetchBlueskyPostRecord({
			uri: 'at://did:plc:alice/app.bsky.feed.post/3k4duaz5vfs2b',
			fetch: async (fetchUrl, options) => {
				calls.push({url: fetchUrl, options});
				return {
					ok: true,
					json: async () => ({
						uri: 'at://did:plc:alice/app.bsky.feed.post/3k4duaz5vfs2b',
						cid: 'bafyupdated',
						value: {
							$type: 'app.bsky.feed.post',
							text: 'Updated record',
							createdAt: '2026-07-04T08:00:00.000Z'
						}
					})
				};
			}
		});
		const missing = await fetchBlueskyPostRecord({
			uri: 'at://did:plc:alice/app.bsky.feed.post/deleted',
			fetch: async () => ({
				ok: false,
				status: 400,
				json: async () => ({message: 'Could not locate record: deleted'})
			})
		});

		assert.equal(
			url,
			'https://public.api.bsky.app/xrpc/com.atproto.repo.getRecord?repo=did%3Aplc%3Aalice&collection=app.bsky.feed.post&rkey=3k4duaz5vfs2b'
		);
		assert.deepEqual(parseBlueskyPostAtUri('at://did:plc:alice/app.bsky.feed.post/3k4duaz5vfs2b'), {
			repo: 'did:plc:alice',
			collection: 'app.bsky.feed.post',
			rkey: '3k4duaz5vfs2b'
		});
		assert.equal(parseBlueskyPostAtUri('at://did:plc:alice/app.bsky.feed.like/abc'), null);
		assert.equal(calls[0].url, 'https://public.api.bsky.app/xrpc/com.atproto.repo.getRecord?repo=did%3Aplc%3Aalice&collection=app.bsky.feed.post&rkey=3k4duaz5vfs2b');
		assert.equal(calls[0].options.headers.Accept, 'application/json');
		assert.equal(record.exists, true);
		assert.equal(record.cid, 'bafyupdated');
		assert.equal(record.projection?.sourceIdentity.sourcePostId, 'at://did:plc:alice/app.bsky.feed.post/3k4duaz5vfs2b');
		assert.equal(richTextToPlainText(record.projection!.richText), 'Updated record');
		assert.equal(missing.exists, false);
		assert.equal(missing.projection, null);
	});

	it('fetches public author feeds through an injectable XRPC fetcher', async () => {
		const calls: any[] = [];
		const response = await fetchBlueskyAuthorFeed({
			actor: 'bsky.app',
			limit: 2,
			fetch: async (url, options) => {
				calls.push({url, options});
				return {
					ok: true,
					json: async () => ({feed: []})
				};
			}
		});

		assert.deepEqual(response, {feed: []});
		assert.equal(calls.length, 1);
		assert.equal(calls[0].url, 'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=bsky.app&limit=2');
		assert.equal(calls[0].options.headers.Accept, 'application/json');
		assert.equal(typeof calls[0].options.signal, 'object');
	});

	it('projects app.bsky.feed.post facets and embeds into source identity and rich text', () => {
		const feedResponse = {
			cursor: 'next-page',
			feed: [{
				post: {
					uri: 'at://did:plc:alice/app.bsky.feed.post/3k4duaz5vfs2b',
					cid: 'bafyreibsky',
					author: {
						did: 'did:plc:alice',
						handle: 'alice.bsky.social',
						displayName: 'Alice'
					},
					indexedAt: '2026-07-04T08:00:00.000Z',
					record: {
						$type: 'app.bsky.feed.post',
						text: 'Hi 🌍 site @alice #тег plain',
						createdAt: '2026-07-04T07:59:00.000Z',
						langs: ['en'],
						facets: [
							{
								index: {byteStart: 8, byteEnd: 12},
								features: [{
									$type: 'app.bsky.richtext.facet#link',
									uri: 'https://example.com/post'
								}]
							},
							{
								index: {byteStart: 13, byteEnd: 19},
								features: [{
									$type: 'app.bsky.richtext.facet#mention',
									did: 'did:plc:bob'
								}]
							},
							{
								index: {byteStart: 20, byteEnd: 27},
								features: [{
									$type: 'app.bsky.richtext.facet#tag',
									tag: 'тег'
								}]
							}
						],
						reply: {
							root: {uri: 'at://did:plc:alice/app.bsky.feed.post/root'},
							parent: {uri: 'at://did:plc:bob/app.bsky.feed.post/parent'}
						},
						embed: {
							$type: 'app.bsky.embed.external',
							external: {
								uri: 'https://example.com/article',
								title: 'Article',
								description: 'Read this'
							}
						}
					},
					embed: {
						$type: 'app.bsky.embed.recordWithMedia#view',
						media: {
							$type: 'app.bsky.embed.images#view',
							images: [{
								thumb: 'https://cdn.bsky.app/img/thumb/plain/did:plc:alice/image@jpeg',
								fullsize: 'https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:alice/image@jpeg',
								alt: 'sky',
								aspectRatio: {width: 1200, height: 900}
							}]
						}
					}
				}
			}]
		};

		const projections = projectBlueskyAuthorFeed(feedResponse);
		const projection = projections[0];

		assert.equal(projections.length, 1);
		assert.equal(projection.uri, 'at://did:plc:alice/app.bsky.feed.post/3k4duaz5vfs2b');
		assert.equal(projection.sourceIdentity.source, blueskyPostSource);
		assert.equal(projection.sourceIdentity.sourceChannelId, 'did:plc:alice');
		assert.equal(projection.sourceIdentity.sourcePostId, projection.uri);
		assert.equal(richTextToPlainText(projection.richText), 'Hi 🌍 site @alice #тег plain');
		assert.deepEqual(projection.richText.blocks[0].children, [
			{text: 'Hi 🌍 '},
			{text: 'site', marks: [{type: 'link', href: 'https://example.com/post'}]},
			{text: ' '},
			{text: '@alice', marks: [{type: 'mention', id: 'did:plc:bob', protocol: 'atproto'}]},
			{text: ' '},
			{text: '#тег', marks: [{type: 'hashtag', name: 'тег', protocol: 'atproto'}]},
			{text: ' plain'}
		]);
		assert.deepEqual(projection.reply, {
			rootUri: 'at://did:plc:alice/app.bsky.feed.post/root',
			parentUri: 'at://did:plc:bob/app.bsky.feed.post/parent'
		});
		assert.deepEqual(projection.embed.external, [{
			uri: 'https://example.com/article',
			title: 'Article',
			description: 'Read this',
			thumbUrl: null
		}]);
		assert.deepEqual(projection.embed.images, [{
			alt: 'sky',
			thumbUrl: 'https://cdn.bsky.app/img/thumb/plain/did:plc:alice/image@jpeg',
			fullsizeUrl: 'https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:alice/image@jpeg',
			mimeType: null,
			size: null,
			aspectRatio: {width: 1200, height: 900}
		}]);
		assert.deepEqual(getBlueskyProjectionPreview(projection), {
			uri: projection.uri,
			cid: 'bafyreibsky',
			author: {
				did: 'did:plc:alice',
				handle: 'alice.bsky.social',
				displayName: 'Alice'
			},
			sourceIdentity: projection.sourceIdentity,
			createdAt: '2026-07-04T07:59:00.000Z',
			indexedAt: '2026-07-04T08:00:00.000Z',
			text: 'Hi 🌍 site @alice #тег plain',
			langs: ['en'],
			facetsCount: 3,
			externalEmbeds: 1,
			imageEmbeds: 1,
			unsupportedEmbedTypes: [],
			reply: projection.reply
		});
	});

	it('keeps unsupported or invalid facets as plain text', () => {
		const richText = atProtoPostRecordToRichText({
			text: 'hello link',
			facets: [
				{
					index: {byteStart: 0, byteEnd: 5},
					features: [{$type: 'app.bsky.richtext.facet#unknown'}]
				},
				{
					index: {byteStart: 6, byteEnd: 99},
					features: [{
						$type: 'app.bsky.richtext.facet#link',
						uri: 'https://example.com'
					}]
				}
			]
		});

		assert.equal(richTextToPlainText(richText), 'hello link');
		assert.deepEqual(richText.blocks[0].children, [{text: 'hello link'}]);
	});
});
