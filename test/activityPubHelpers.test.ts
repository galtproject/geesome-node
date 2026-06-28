import assert from 'assert';
import {
	buildActivityPubGroupWebFingerResponse,
	getActivityPubGroupActorUrls,
	getActivityPubGroupPostObjectUrl,
	getActivityPubWebFingerResource,
	getActivityPubWebFingerUrl,
	isActivityPubEnabled,
	resolveActivityPubConfig
} from '../app/modules/activityPub/helpers.js';

describe('activityPub helpers', () => {
	it('normalizes explicit public URL config without deriving internal node URLs', () => {
		const config = resolveActivityPubConfig({
			enabled: '1',
			publicUrl: 'https://node.example.com:8443/geesome/?debug=1#fragment'
		});

		assert.deepEqual(config, {
			enabled: true,
			publicUrl: 'https://node.example.com:8443/geesome',
			domain: 'node.example.com:8443'
		});
		assert.equal(isActivityPubEnabled({enabled: true}), true);
		assert.equal(isActivityPubEnabled({enabled: false}), false);
	});

	it('builds stable group actor and collection URLs', () => {
		const urls = getActivityPubGroupActorUrls(getConfig(), {name: 'test-channel'} as any);

		assert.deepEqual(urls, {
			actorUrl: 'https://social.example/ap/groups/test-channel',
			inboxUrl: 'https://social.example/ap/groups/test-channel/inbox',
			outboxUrl: 'https://social.example/ap/groups/test-channel/outbox',
			followersUrl: 'https://social.example/ap/groups/test-channel/followers',
			followingUrl: 'https://social.example/ap/groups/test-channel/following',
			sharedInboxUrl: 'https://social.example/ap/shared-inbox'
		});
	});

	it('builds WebFinger resource and response data for a group actor', () => {
		const config = getConfig();
		const group = {name: 'test-channel'} as any;

		assert.equal(getActivityPubWebFingerResource(config, group), 'acct:test-channel@example.com');
		assert.equal(
			getActivityPubWebFingerUrl(config, group),
			'https://social.example/.well-known/webfinger?resource=acct%3Atest-channel%40example.com'
		);
		assert.deepEqual(buildActivityPubGroupWebFingerResponse(config, group), {
			subject: 'acct:test-channel@example.com',
			aliases: ['https://social.example/ap/groups/test-channel'],
			links: [
				{
					rel: 'self',
					type: 'application/activity+json',
					href: 'https://social.example/ap/groups/test-channel'
				}
			]
		});
	});

	it('rejects group names that cannot be used as WebFinger acct usernames', () => {
		const config = getConfig();
		const group = {name: 'Test Space'} as any;

		assert.throws(() => getActivityPubGroupActorUrls(config, group), /activitypub_group_name_invalid/);
	});

	it('builds post object URLs from local group post ids', () => {
		assert.equal(
			getActivityPubGroupPostObjectUrl(getConfig(), 'test-channel', 42),
			'https://social.example/ap/groups/test-channel/posts/42'
		);
	});

	it('rejects missing public URL and invalid post ids', () => {
		assert.throws(() => resolveActivityPubConfig({}), /activitypub_public_url_required/);
		assert.throws(() => getActivityPubGroupPostObjectUrl(getConfig(), 'test-channel', 0), /activitypub_post_local_id_invalid/);
		assert.throws(() => getActivityPubGroupActorUrls(getConfig(), {name: ''} as any), /activitypub_group_name_required/);
	});
});

function getConfig() {
	return {
		enabled: true,
		publicUrl: 'https://social.example/',
		domain: 'example.com'
	};
}
