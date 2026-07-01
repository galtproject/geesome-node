import assert from 'assert';
import {RICH_TEXT_MIME_TYPE, createRichTextDocument} from '../app/richText.js';
import {ContentMimeType} from '../app/modules/database/interface.js';
import {GroupType, GroupView, PostStatus} from '../app/modules/group/interface.js';
import {
	buildActivityPubFollowAcceptActivity,
	buildActivityPubFollowersCollection,
	buildActivityPubFollowingCollection,
	buildActivityPubGroupActor,
	buildActivityPubOutboxCollection,
	buildActivityPubPostCreateActivity,
	buildActivityPubPostNote,
	isActivityPubGroupFederatable,
	isActivityPubPostFederatable
} from '../app/modules/activityPub/serializers.js';

describe('activityPub serializers', () => {
	it('builds a group actor document with public identity URLs', () => {
		const actor = buildActivityPubGroupActor(getConfig(), getGroup(), {
			publicKeyPem: '-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----'
		});

		assert.deepEqual(actor, {
			'@context': 'https://www.w3.org/ns/activitystreams',
			id: 'https://social.example/ap/groups/test-channel',
			type: 'Group',
			preferredUsername: 'test-channel',
			name: 'Test Channel',
			summary: 'A public test channel',
			url: 'https://social.example/groups/test-channel',
			inbox: 'https://social.example/ap/groups/test-channel/inbox',
			outbox: 'https://social.example/ap/groups/test-channel/outbox',
			followers: 'https://social.example/ap/groups/test-channel/followers',
			following: 'https://social.example/ap/groups/test-channel/following',
			manuallyApprovesFollowers: false,
			discoverable: true,
			endpoints: {
				sharedInbox: 'https://social.example/ap/shared-inbox'
			},
			icon: {
				type: 'Image',
				mediaType: 'image/png',
				url: 'https://social.example/ipfs/avatar'
			},
			image: {
				type: 'Image',
				mediaType: 'image/jpeg',
				url: 'https://social.example/ipfs/cover'
			},
			publicKey: {
				id: 'https://social.example/ap/groups/test-channel#main-key',
				owner: 'https://social.example/ap/groups/test-channel',
				publicKeyPem: '-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----'
			}
		});
	});

	it('builds Note and Create payloads from a published group post', () => {
		const note = buildActivityPubPostNote(getConfig(), getGroup(), getPublishedPost(), {contents: getContents()});

		assert.deepEqual(note, {
			'@context': 'https://www.w3.org/ns/activitystreams',
			id: 'https://social.example/ap/groups/test-channel/posts/7',
			type: 'Note',
			attributedTo: 'https://social.example/ap/groups/test-channel',
			to: ['https://www.w3.org/ns/activitystreams#Public'],
			cc: ['https://social.example/ap/groups/test-channel/followers'],
			content: 'Hello &lt;fediverse&gt;<br>from GeeSome',
			url: 'https://social.example/ap/groups/test-channel/posts/7',
			published: '2026-06-01T12:00:00.000Z',
			attachment: [
				{
					type: 'Image',
					mediaType: 'image/png',
					url: 'https://social.example/ipfs/image-storage',
					name: 'image-storage'
				}
			]
		});

		const activity = buildActivityPubPostCreateActivity(getConfig(), getGroup(), getPublishedPost(), {contents: getContents()});

		assert.equal(activity.id, 'https://social.example/ap/groups/test-channel/posts/7/activity/create');
		assert.equal(activity.type, 'Create');
		assert.equal(activity.actor, 'https://social.example/ap/groups/test-channel');
		assert.deepEqual(activity.object, note);
	});

	it('renders canonical rich-text post content safely', () => {
		const document = createRichTextDocument([{
			type: 'paragraph',
			children: [
				{text: 'Hello '},
				{text: 'fediverse', marks: [{type: 'strong'}]},
				{text: ' link', marks: [{type: 'link', href: 'https://example.com/post'}]},
				{text: ' unsafe', marks: [{type: 'link', href: 'javascript:alert(1)'}]}
			]
		}]);
		const contents = [{
			...getContents()[0],
			text: JSON.stringify(document),
			mimeType: RICH_TEXT_MIME_TYPE
		}];
		const note = buildActivityPubPostNote(getConfig(), getGroup(), getPublishedPost(), {contents});

		assert.equal(note.content, '<p>Hello <strong>fediverse</strong><a href="https://example.com/post"> link</a> unsafe</p>');
		assert.equal(note.content.includes('javascript:'), false);
	});

	it('escapes invalid rich-text payloads instead of throwing from ActivityPub serializers', () => {
		const contents = [{
			...getContents()[0],
			text: '{"bad": "<script>alert(1)</script>"}',
			mimeType: RICH_TEXT_MIME_TYPE
		}];
		const note = buildActivityPubPostNote(getConfig(), getGroup(), getPublishedPost(), {contents});

		assert.equal(note.content, '{&quot;bad&quot;: &quot;&lt;script&gt;alert(1)&lt;/script&gt;&quot;}');
	});

	it('builds an outbox collection and filters non-federatable posts', () => {
		const group = getGroup();
		const published = getPublishedPost();
		const draft = {...getPublishedPost(), id: 12, localId: 8, status: PostStatus.Draft};
		const outbox = buildActivityPubOutboxCollection(getConfig(), group, [published, draft], {
			contentsByPostId: new Map([[published.id, getContents()]])
		});

		assert.equal(outbox.id, 'https://social.example/ap/groups/test-channel/outbox');
		assert.equal(outbox.type, 'OrderedCollection');
		assert.equal(outbox.totalItems, 1);
		assert.equal(outbox.orderedItems.length, 1);
		assert.equal(outbox.orderedItems[0].object.id, 'https://social.example/ap/groups/test-channel/posts/7');
		assert.equal(outbox.orderedItems[0].object.content, 'Hello &lt;fediverse&gt;<br>from GeeSome');
	});

	it('builds an Accept activity for inbound Follow requests', () => {
		const followActivity = {
			id: 'https://remote.example/activities/follow-1',
			type: 'Follow',
			actor: 'https://remote.example/users/alice',
			object: 'https://social.example/ap/groups/test-channel'
		};
		const accept = buildActivityPubFollowAcceptActivity(getConfig(), getGroup(), followActivity, {
			activityId: 'https://social.example/ap/groups/test-channel/activities/follows/1/accept'
		});

		assert.deepEqual(accept, {
			'@context': 'https://www.w3.org/ns/activitystreams',
			id: 'https://social.example/ap/groups/test-channel/activities/follows/1/accept',
			type: 'Accept',
			actor: 'https://social.example/ap/groups/test-channel',
			object: followActivity
		});
	});

	it('builds a followers collection from accepted remote actor URLs', () => {
		const followers = buildActivityPubFollowersCollection(getConfig(), getGroup(), [
			'https://remote.example/users/alice'
		], {
			totalItems: 2
		});

		assert.deepEqual(followers, {
			'@context': 'https://www.w3.org/ns/activitystreams',
			id: 'https://social.example/ap/groups/test-channel/followers',
			type: 'OrderedCollection',
			totalItems: 2,
			orderedItems: ['https://remote.example/users/alice']
		});
	});

	it('builds an empty following collection until outbound follows exist', () => {
		const following = buildActivityPubFollowingCollection(getConfig(), getGroup());

		assert.deepEqual(following, {
			'@context': 'https://www.w3.org/ns/activitystreams',
			id: 'https://social.example/ap/groups/test-channel/following',
			type: 'OrderedCollection',
			totalItems: 0,
			orderedItems: []
		});
	});

	it('rejects private, encrypted, remote, deleted, and chat-only data', () => {
		const group = getGroup();
		const post = getPublishedPost();

		assert.equal(isActivityPubGroupFederatable(group), true);
		assert.equal(isActivityPubPostFederatable(group, post), true);
		assert.equal(isActivityPubGroupFederatable({...group, isPublic: false}), false);
		assert.equal(isActivityPubGroupFederatable({...group, isEncrypted: true}), false);
		assert.equal(isActivityPubGroupFederatable({...group, isRemote: true}), false);
		assert.equal(isActivityPubGroupFederatable({...group, type: GroupType.PersonalChat}), false);
		assert.equal(isActivityPubPostFederatable(group, {...post, isDeleted: true}), false);
		assert.equal(isActivityPubPostFederatable(group, {...post, isEncrypted: true}), false);
		assert.equal(isActivityPubPostFederatable(group, {...post, publishedAt: 'Invalid date'}), false);
		assert.throws(() => buildActivityPubGroupActor(getConfig(), {...group, isPublic: false}), /activitypub_group_not_federatable/);
		assert.throws(() => buildActivityPubPostNote(getConfig(), group, {...post, status: PostStatus.Draft}), /activitypub_post_not_federatable/);
	});
});

function getConfig() {
	return {
		enabled: true,
		publicUrl: 'https://social.example',
		domain: 'example.com'
	};
}

function getGroup() {
	return {
		id: 3,
		name: 'test-channel',
		title: 'Test Channel',
		description: 'A public test channel',
		homePage: 'https://social.example/groups/test-channel',
		type: GroupType.Channel,
		view: GroupView.TelegramLike,
		theme: 'default',
		isPublic: true,
		isOpen: true,
		isRemote: false,
		isReplyForbidden: false,
		creatorId: 1,
		avatarImage: {
			mimeType: ContentMimeType.ImagePng,
			url: 'https://social.example/ipfs/avatar'
		},
		coverImage: {
			mimeType: 'image/jpeg',
			url: 'https://social.example/ipfs/cover'
		},
		storageUpdatedAt: new Date('2026-06-01T00:00:00Z'),
		staticStorageUpdatedAt: new Date('2026-06-01T00:00:00Z')
	} as any;
}

function getPublishedPost() {
	return {
		id: 11,
		status: PostStatus.Published,
		groupId: 3,
		userId: 1,
		localId: 7,
		publishedAt: new Date('2026-06-01T12:00:00Z'),
		isDeleted: false,
		isEncrypted: false,
		createdAt: new Date('2026-06-01T11:00:00Z'),
		updatedAt: new Date('2026-06-01T12:00:00Z')
	} as any;
}

function getContents() {
	return [
		{
			id: 101,
			type: 'text',
			text: 'Hello <fediverse>\nfrom GeeSome',
			storageId: 'text-storage',
			mimeType: ContentMimeType.Text,
			url: 'https://social.example/ipfs/text-storage'
		},
		{
			id: 102,
			type: 'image',
			storageId: 'image-storage',
			mimeType: ContentMimeType.ImagePng,
			url: 'https://social.example/ipfs/image-storage'
		}
	] as any[];
}
