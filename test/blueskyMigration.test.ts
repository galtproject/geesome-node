import assert from 'node:assert';
import {projectBlueskyAuthorFeed} from '../app/modules/bluesky/helpers.js';
import {createBlueskyMigrationPreview} from '../app/modules/bluesky/migration.js';

describe('bluesky migration helpers', () => {
	it('classifies owned posts and remote placeholders for a social-page migration preview', () => {
		const projections = projectBlueskyAuthorFeed(getMigrationFeedFixture());
		const preview = createBlueskyMigrationPreview({
			actor: 'alice.bsky.social',
			claimed: true,
			accountDid: 'did:plc:alice',
			accountHandle: 'alice.bsky.social',
			projections
		});

		assert.equal(preview.actor, 'alice.bsky.social');
		assert.equal(projections[2].repost?.by.did, 'did:plc:alice');
		assert.equal(projections[3].quote?.uri, 'at://did:plc:bob/app.bsky.feed.post/quote-target');
		assert.deepEqual(preview.ownership, {
			claimed: true,
			verified: true,
			method: 'did',
			did: 'did:plc:alice',
			handle: 'alice.bsky.social',
			reason: null
		});
		assert.deepEqual(preview.summary, {
			total: 4,
			localPosts: 3,
			remoteContextPosts: 1,
			replies: 1,
			reposts: 1,
			quotes: 1,
			remoteActors: 1,
			remotePlaceholders: 4
		});
		assert.deepEqual(preview.list.map(item => ({
			uri: item.uri,
			importKind: item.importKind,
			relationTypes: item.relationTypes
		})), [
			{
				uri: 'at://did:plc:alice/app.bsky.feed.post/root',
				importKind: 'localPost',
				relationTypes: ['post']
			},
			{
				uri: 'at://did:plc:alice/app.bsky.feed.post/reply-to-bob',
				importKind: 'localPost',
				relationTypes: ['reply']
			},
			{
				uri: 'at://did:plc:bob/app.bsky.feed.post/reposted',
				importKind: 'remoteContext',
				relationTypes: ['repost']
			},
			{
				uri: 'at://did:plc:alice/app.bsky.feed.post/quote-bob',
				importKind: 'localPost',
				relationTypes: ['quote']
			}
		]);
		assert.deepEqual(preview.remotePlaceholders.map(placeholder => ({
			key: placeholder.key,
			type: placeholder.type,
			did: placeholder.did,
			uri: placeholder.uri,
			relationTypes: placeholder.relationTypes,
			sourceIdentity: placeholder.sourceIdentity
		})), [
			{
				key: 'atproto:post:at://did:plc:bob/app.bsky.feed.post/root',
				type: 'post',
				did: 'did:plc:bob',
				uri: 'at://did:plc:bob/app.bsky.feed.post/root',
				relationTypes: ['reply'],
				sourceIdentity: {
					protocol: 'atproto',
					source: 'socNetImport:bluesky',
					sourceChannelId: 'did:plc:bob',
					sourcePostId: 'at://did:plc:bob/app.bsky.feed.post/root',
					did: 'did:plc:bob',
					handle: null,
					uri: 'at://did:plc:bob/app.bsky.feed.post/root',
					cid: null
				}
			},
			{
				key: 'atproto:actor:did:plc:bob',
				type: 'actor',
				did: 'did:plc:bob',
				uri: undefined,
				relationTypes: ['reply', 'repost', 'quote'],
				sourceIdentity: {
					protocol: 'atproto',
					source: 'socNetImport:bluesky',
					sourceChannelId: 'did:plc:bob',
					did: 'did:plc:bob',
					handle: 'bob.bsky.social'
				}
			},
			{
				key: 'atproto:post:at://did:plc:bob/app.bsky.feed.post/reposted',
				type: 'post',
				did: 'did:plc:bob',
				uri: 'at://did:plc:bob/app.bsky.feed.post/reposted',
				relationTypes: ['repost'],
				sourceIdentity: {
					protocol: 'atproto',
					source: 'socNetImport:bluesky',
					sourceChannelId: 'did:plc:bob',
					sourcePostId: 'at://did:plc:bob/app.bsky.feed.post/reposted',
					did: 'did:plc:bob',
					handle: 'bob.bsky.social',
					uri: 'at://did:plc:bob/app.bsky.feed.post/reposted',
					cid: 'bafyreibsky'
				}
			},
			{
				key: 'atproto:post:at://did:plc:bob/app.bsky.feed.post/quote-target',
				type: 'post',
				did: 'did:plc:bob',
				uri: 'at://did:plc:bob/app.bsky.feed.post/quote-target',
				relationTypes: ['quote'],
				sourceIdentity: {
					protocol: 'atproto',
					source: 'socNetImport:bluesky',
					sourceChannelId: 'did:plc:bob',
					sourcePostId: 'at://did:plc:bob/app.bsky.feed.post/quote-target',
					did: 'did:plc:bob',
					handle: 'bob.bsky.social',
					uri: 'at://did:plc:bob/app.bsky.feed.post/quote-target',
					cid: 'bafyquote'
				}
			}
		]);
	});

	it('reports unverified claimed ownership without blocking neutral previews', () => {
		const projections = projectBlueskyAuthorFeed(getMigrationFeedFixture());
		const claimedPreview = createBlueskyMigrationPreview({
			actor: 'alice.bsky.social',
			claimed: true,
			accountDid: 'did:plc:mallory',
			accountHandle: 'mallory.bsky.social',
			projections
		});
		const neutralPreview = createBlueskyMigrationPreview({
			actor: 'alice.bsky.social',
			projections
		});

		assert.equal(claimedPreview.ownership.verified, false);
		assert.equal(claimedPreview.ownership.reason, 'bluesky_migration_account_mismatch');
		assert.equal(neutralPreview.ownership.claimed, false);
		assert.equal(neutralPreview.ownership.reason, 'bluesky_migration_not_claimed');
		assert.equal(neutralPreview.summary.localPosts, 3);
	});
});

function getMigrationFeedFixture() {
	return {
		feed: [
			getFeedItem({
				uri: 'at://did:plc:alice/app.bsky.feed.post/root',
				text: 'Alice root'
			}),
			getFeedItem({
				uri: 'at://did:plc:alice/app.bsky.feed.post/reply-to-bob',
				text: 'Reply to Bob',
				reply: {
					root: {uri: 'at://did:plc:bob/app.bsky.feed.post/root'},
					parent: {uri: 'at://did:plc:bob/app.bsky.feed.post/root'}
				}
			}),
			getFeedItem({
				uri: 'at://did:plc:bob/app.bsky.feed.post/reposted',
				author: getBobAuthor(),
				text: 'Bob original',
				reason: {
					$type: 'app.bsky.feed.defs#reasonRepost',
					by: getAliceAuthor(),
					indexedAt: '2026-07-04T08:01:00.000Z'
				}
			}),
			getFeedItem({
				uri: 'at://did:plc:alice/app.bsky.feed.post/quote-bob',
				text: 'Quote Bob',
				recordEmbed: {
					$type: 'app.bsky.embed.record',
					record: {
						uri: 'at://did:plc:bob/app.bsky.feed.post/quote-target',
						cid: 'bafyquote'
					}
				},
				viewEmbed: {
					$type: 'app.bsky.embed.record#view',
					record: {
						uri: 'at://did:plc:bob/app.bsky.feed.post/quote-target',
						cid: 'bafyquote',
						author: getBobAuthor()
					}
				}
			})
		]
	};
}

function getFeedItem(overrides: any = {}) {
	return {
		reason: overrides.reason,
		post: {
			uri: overrides.uri,
			cid: overrides.cid || 'bafyreibsky',
			author: overrides.author || getAliceAuthor(),
			indexedAt: overrides.indexedAt || '2026-07-04T08:00:00.000Z',
			record: {
				$type: 'app.bsky.feed.post',
				text: overrides.text,
				createdAt: overrides.createdAt || '2026-07-04T07:59:00.000Z',
				reply: overrides.reply,
				embed: overrides.recordEmbed
			},
			embed: overrides.viewEmbed
		}
	};
}

function getAliceAuthor() {
	return {
		did: 'did:plc:alice',
		handle: 'alice.bsky.social',
		displayName: 'Alice'
	};
}

function getBobAuthor() {
	return {
		did: 'did:plc:bob',
		handle: 'bob.bsky.social',
		displayName: 'Bob'
	};
}
