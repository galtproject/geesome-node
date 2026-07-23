import assert from 'node:assert';
import {ContentView} from '../app/modules/database/interface.js';
import {BlueskyImportClient, createBlueskyImportMessages} from '../app/modules/bluesky/importClient.js';
import {projectBlueskyAuthorFeed} from '../app/modules/bluesky/helpers.js';
import {RICH_TEXT_MIME_TYPE, richTextToPlainText} from '../app/richText.js';

describe('bluesky import client', () => {
	it('converts public ATProto projections into socNet import messages', () => {
		const projections = projectBlueskyAuthorFeed(getAuthorFeedFixture());
		const messages = createBlueskyImportMessages(projections);

		assert.equal(messages.list.length, 2);
		assert.equal(messages.list[0].id, 'at://did:plc:alice/app.bsky.feed.post/root');
		assert.equal(messages.list[0].date, 1783151940);
		assert.equal(messages.list[0].text, 'Root post');
		assert.equal(messages.authorById['did:plc:alice'].handle, 'alice.bsky.social');
		assert.equal(messages.authorById['alice.bsky.social'].did, 'did:plc:alice');
		assert.equal(messages.messagesByUri[messages.list[1].uri], messages.list[1]);
		assert.equal(messages.projectionsByUri[messages.list[1].uri], projections[1]);
	});

	it('stores imported post text as canonical rich text and links content messages by AT URI', async () => {
		const projections = projectBlueskyAuthorFeed(getAuthorFeedFixture());
		const savedContentCalls: any[] = [];
		const storedContentMessages: any[] = [];
		const app = {
			ms: {
				content: {
					saveData: async (userId, data, fileName, options) => {
						savedContentCalls.push({userId, data, fileName, options});
						return {
							id: savedContentCalls.length,
							userId,
							mimeType: options.mimeType,
							view: options.view,
							manifestStorageId: `manifest-${savedContentCalls.length}`
						};
					}
				},
				socNetImport: {
					storeContentMessage: async (contentMessageData, content) => {
						storedContentMessages.push({contentMessageData, content});
					}
				}
			}
		};
		const dbChannel = getDbChannel();
		const client = new BlueskyImportClient(app as any, 7, dbChannel as any, projections);
		const replyMessage = client.messages.list[1];
		const rootMessage = client.messages.list[0];

		assert.equal(client.socNet, 'bluesky');
		assert.equal(await client.getRemotePostDbChannel(replyMessage, 'post'), dbChannel);
		assert.equal(await client.getRemotePostDbChannel(replyMessage, 'reply'), dbChannel);
		assert.equal(await client.getReplyMessage(dbChannel as any, replyMessage), rootMessage);
		assert.equal(await client.getRepostMessage(dbChannel as any, replyMessage), null);
		assert.equal(
			await client.getRemotePostLink(dbChannel as any, replyMessage.id),
			'https://bsky.app/profile/alice.bsky.social/post/reply'
		);

		const contents = await client.getRemotePostContents(dbChannel as any, replyMessage, 'post');

		assert.equal(contents.length, 1);
		assert.equal(savedContentCalls.length, 1);
		assert.equal(savedContentCalls[0].userId, 7);
		assert.match(savedContentCalls[0].fileName, /^bluesky-at-did.plc.alice-app.bsky.feed.post-reply\.json$/);
		assert.equal(savedContentCalls[0].options.mimeType, RICH_TEXT_MIME_TYPE);
		assert.equal(savedContentCalls[0].options.view, ContentView.Contents);
		assert.equal(savedContentCalls[0].options.properties.source, 'socNetImport:bluesky');
		assert.equal(savedContentCalls[0].options.properties.bluesky.uri, replyMessage.uri);
		assert.equal(richTextToPlainText(JSON.parse(savedContentCalls[0].data)), 'Reply post');
		assert.deepEqual(storedContentMessages, [{
			contentMessageData: {
				userId: 7,
				msgId: replyMessage.uri,
				dbChannelId: 9
			},
			content: contents[0]
		}]);

		const properties = await client.getRemotePostProperties(dbChannel as any, replyMessage, 'post');
		assert.equal(properties.bluesky.uri, replyMessage.uri);
		assert.equal(properties.bluesky.sourceIdentity.sourcePostId, replyMessage.uri);
		assert.equal(properties.bluesky.reply.parentUri, rootMessage.uri);
		assert.equal(properties.bluesky.repost, null);
		assert.equal(properties.bluesky.quote, null);
	});

	it('does not link replies to parents from a different channel', async () => {
		const projections = projectBlueskyAuthorFeed(getCrossChannelReplyFeedFixture());
		const client = new BlueskyImportClient({ms: {content: {}, socNetImport: {}}} as any, 7, getDbChannel() as any, projections);
		const replyMessage = client.messages.list[1];

		assert.equal(await client.getReplyMessage(getDbChannel() as any, replyMessage), null);
		assert.equal(await client.getRemotePostDbChannel(replyMessage, 'reply'), null);
	});
});

function getDbChannel() {
	return {
		id: 9,
		userId: 7,
		groupId: 3,
		accountId: 4,
		channelId: 'did:plc:alice',
		socNet: 'bluesky',
		title: 'Alice'
	};
}

function getAuthorFeedFixture() {
	return {
		feed: [
			getFeedItem({
				uri: 'at://did:plc:alice/app.bsky.feed.post/root',
				text: 'Root post',
				createdAt: '2026-07-04T07:59:00.000Z'
			}),
			getFeedItem({
				uri: 'at://did:plc:alice/app.bsky.feed.post/reply',
				text: 'Reply post',
				createdAt: '2026-07-04T08:00:00.000Z',
				reply: {
					root: {uri: 'at://did:plc:alice/app.bsky.feed.post/root'},
					parent: {uri: 'at://did:plc:alice/app.bsky.feed.post/root'}
				}
			})
		]
	};
}

function getCrossChannelReplyFeedFixture() {
	return {
		feed: [
			getFeedItem({
				uri: 'at://did:plc:bob/app.bsky.feed.post/root',
				author: {
					did: 'did:plc:bob',
					handle: 'bob.bsky.social',
					displayName: 'Bob'
				},
				text: 'Bob root',
				createdAt: '2026-07-04T07:59:00.000Z'
			}),
			getFeedItem({
				uri: 'at://did:plc:alice/app.bsky.feed.post/reply',
				text: 'Reply post',
				createdAt: '2026-07-04T08:00:00.000Z',
				reply: {
					root: {uri: 'at://did:plc:bob/app.bsky.feed.post/root'},
					parent: {uri: 'at://did:plc:bob/app.bsky.feed.post/root'}
				}
			})
		]
	};
}

function getFeedItem(overrides: any = {}) {
	const author = overrides.author || {
		did: 'did:plc:alice',
		handle: 'alice.bsky.social',
		displayName: 'Alice'
	};
	return {
		post: {
			uri: overrides.uri,
			cid: overrides.cid || 'bafyreibsky',
			author,
			indexedAt: overrides.indexedAt || overrides.createdAt,
			record: {
				$type: 'app.bsky.feed.post',
				text: overrides.text,
				createdAt: overrides.createdAt,
				reply: overrides.reply
			}
		}
	};
}
