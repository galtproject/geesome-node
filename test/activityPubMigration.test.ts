import assert from 'node:assert';
import {createActivityPubMigrationPreview} from '../app/modules/activityPub/migration.js';

const aliceActor = 'https://social.example/users/alice';
const bobActor = 'https://remote.example/users/bob';
const carolActor = 'https://remote.example/users/carol';

describe('activityPub migration helpers', () => {
	it('classifies owned ActivityPub objects and remote placeholders for a social-page migration preview', () => {
		const preview = createActivityPubMigrationPreview({
			actor: aliceActor,
			actorDocument: {
				id: aliceActor,
				url: 'https://social.example/@alice'
			},
			claimed: true,
			ownershipVerified: true,
			ownershipMethod: 'admin',
			items: getMigrationOutboxFixture()
		});

		assert.equal(preview.actor, aliceActor);
		assert.deepEqual(preview.ownership, {
			claimed: true,
			verified: true,
			method: 'admin',
			actor: aliceActor,
			reason: null
		});
		assert.deepEqual(preview.summary, {
			total: 5,
			localPosts: 3,
			remoteContextPosts: 2,
			replies: 1,
			announces: 1,
			quotes: 1,
			mentions: 2,
			remoteActors: 2,
			remoteObjects: 4,
			remotePlaceholders: 6
		});
		assert.deepEqual(preview.list.map(item => ({
			objectId: item.objectId,
			importKind: item.importKind,
			relationTypes: item.relationTypes,
			isOwnAuthor: item.isOwnAuthor
		})), [
			{
				objectId: `${aliceActor}/statuses/root`,
				importKind: 'localPost',
				relationTypes: ['post'],
				isOwnAuthor: true
			},
			{
				objectId: `${aliceActor}/statuses/reply`,
				importKind: 'localPost',
				relationTypes: ['reply', 'mention'],
				isOwnAuthor: true
			},
			{
				objectId: `${bobActor}/statuses/reblogged`,
				importKind: 'remoteContext',
				relationTypes: ['announce'],
				isOwnAuthor: false
			},
			{
				objectId: `${aliceActor}/statuses/quote`,
				importKind: 'localPost',
				relationTypes: ['quote'],
				isOwnAuthor: true
			},
			{
				objectId: `${carolActor}/statuses/mention`,
				importKind: 'remoteContext',
				relationTypes: ['mention'],
				isOwnAuthor: false
			}
		]);
		assert.equal(preview.list[0].preview?.contentHtml, '<p>Hello <a>unsafe</a></p>');
		assert.equal(preview.list[0].preview?.contentText, 'Hello unsafe');
		assert.deepEqual(preview.remotePlaceholders.map(placeholder => ({
			key: placeholder.key,
			type: placeholder.type,
			actorUrl: placeholder.actorUrl,
			objectId: placeholder.objectId,
			relationTypes: placeholder.relationTypes
		})), [
			{
				key: `activitypub:object:${bobActor}/statuses/root`,
				type: 'object',
				actorUrl: undefined,
				objectId: `${bobActor}/statuses/root`,
				relationTypes: ['reply']
			},
			{
				key: `activitypub:actor:${bobActor}`,
				type: 'actor',
				actorUrl: bobActor,
				objectId: undefined,
				relationTypes: ['reply', 'mention', 'announce', 'quote']
			},
			{
				key: `activitypub:object:${bobActor}/statuses/reblogged`,
				type: 'object',
				actorUrl: undefined,
				objectId: `${bobActor}/statuses/reblogged`,
				relationTypes: ['announce']
			},
			{
				key: `activitypub:object:${bobActor}/statuses/quote-target`,
				type: 'object',
				actorUrl: undefined,
				objectId: `${bobActor}/statuses/quote-target`,
				relationTypes: ['quote']
			},
			{
				key: `activitypub:object:${carolActor}/statuses/mention`,
				type: 'object',
				actorUrl: undefined,
				objectId: `${carolActor}/statuses/mention`,
				relationTypes: ['mention']
			},
			{
				key: `activitypub:actor:${carolActor}`,
				type: 'actor',
				actorUrl: carolActor,
				objectId: undefined,
				relationTypes: ['mention']
			}
		]);
	});

	it('reports unverified claimed ownership without blocking neutral previews', () => {
		const claimedPreview = createActivityPubMigrationPreview({
			actor: aliceActor,
			claimed: true,
			items: getMigrationOutboxFixture()
		});
		const neutralPreview = createActivityPubMigrationPreview({
			actor: aliceActor,
			items: getMigrationOutboxFixture()
		});

		assert.equal(claimedPreview.ownership.verified, false);
		assert.equal(claimedPreview.ownership.reason, 'activitypub_migration_ownership_unverified');
		assert.equal(neutralPreview.ownership.claimed, false);
		assert.equal(neutralPreview.ownership.reason, 'activitypub_migration_not_claimed');
		assert.equal(neutralPreview.summary.localPosts, 3);
	});

	it('does not create an owner actor placeholder for bare Announce targets', () => {
		const preview = createActivityPubMigrationPreview({
			actor: aliceActor,
			items: [
				{
					id: `${aliceActor}/activities/announce-bare`,
					type: 'Announce',
					actor: aliceActor,
					object: `${bobActor}/statuses/bare-reblog`
				}
			]
		});

		assert.deepEqual(preview.summary, {
			total: 1,
			localPosts: 0,
			remoteContextPosts: 1,
			replies: 0,
			announces: 1,
			quotes: 0,
			mentions: 0,
			remoteActors: 0,
			remoteObjects: 1,
			remotePlaceholders: 1
		});
		assert.deepEqual(preview.remotePlaceholders, [
			{
				key: `activitypub:object:${bobActor}/statuses/bare-reblog`,
				protocol: 'activitypub',
				type: 'object',
				objectId: `${bobActor}/statuses/bare-reblog`,
				objectType: 'Object',
				relationTypes: ['announce']
			}
		]);
	});
});

function getMigrationOutboxFixture() {
	return [
		getCreateActivity({
			id: `${aliceActor}/statuses/root`,
			content: '<p>Hello <script>alert(1)</script><a href="javascript:alert(1)">unsafe</a></p>'
		}),
		getCreateActivity({
			id: `${aliceActor}/statuses/reply`,
			content: '<p>Reply to Bob</p>',
			inReplyTo: {
				id: `${bobActor}/statuses/root`,
				type: 'Note',
				attributedTo: bobActor
			},
			tag: [
				{
					type: 'Mention',
					href: bobActor,
					name: '@bob'
				}
			]
		}),
		{
			id: `${aliceActor}/activities/announce-reblogged`,
			type: 'Announce',
			actor: aliceActor,
			object: {
				id: `${bobActor}/statuses/reblogged`,
				type: 'Note',
				attributedTo: bobActor,
				content: '<p>Bob original</p>'
			}
		},
		getCreateActivity({
			id: `${aliceActor}/statuses/quote`,
			content: '<p>Quote Bob</p>',
			quote: {
				id: `${bobActor}/statuses/quote-target`,
				type: 'Note',
				attributedTo: {
					id: bobActor
				}
			}
		}),
		{
			id: `${carolActor}/activities/mention-alice`,
			type: 'Create',
			actor: carolActor,
			object: {
				id: `${carolActor}/statuses/mention`,
				type: 'Note',
				attributedTo: carolActor,
				content: '<p>Hi Alice</p>',
				tag: [
					{
						type: 'Mention',
						href: aliceActor,
						name: '@alice'
					}
				]
			}
		}
	];
}

function getCreateActivity(noteOverrides: any = {}) {
	return {
		id: noteOverrides.activityId || `${noteOverrides.id}/activity`,
		type: 'Create',
		actor: aliceActor,
		object: {
			id: noteOverrides.id,
			type: 'Note',
			attributedTo: aliceActor,
			content: noteOverrides.content,
			published: noteOverrides.published || '2026-07-04T08:00:00.000Z',
			inReplyTo: noteOverrides.inReplyTo,
			quote: noteOverrides.quote,
			tag: noteOverrides.tag
		}
	};
}
