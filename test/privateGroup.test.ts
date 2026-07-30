import assert from 'node:assert';
import {GroupType} from '../app/modules/group/interface.js';
import {
	privateGroupPostManifestHook,
	publicPostManifestHook
} from '../app/modules/privateGroup/interface.js';
import {getModule} from '../app/modules/privateGroup/index.js';

describe('private group policy', () => {
	it('normalizes the private group capability without changing other groups', () => {
		const module = getModule({
			config: {privateGroupConfig: {enabled: true}}
		} as any);
		const privateGroup = module.normalizeGroupData({
			type: GroupType.PrivateGroup,
			isPublic: true,
			isOpen: true,
			isEncrypted: false
		});
		const channel = module.normalizeGroupData({
			type: GroupType.Channel,
			isPublic: true,
			isOpen: true,
			isEncrypted: false
		});

		assert.equal(privateGroup.isPublic, false);
		assert.equal(privateGroup.isOpen, false);
		assert.equal(privateGroup.isEncrypted, true);
		assert.equal(channel.isPublic, true);
		assert.equal(channel.isOpen, true);
		assert.equal(channel.isEncrypted, false);
	});

	it('routes private posts separately and limits shared mutation to the author', () => {
		const module = getModule({
			config: {privateGroupConfig: {enabled: true}}
		} as any);

		assert.equal(
			module.getPostManifestHook({type: GroupType.PrivateGroup}),
			privateGroupPostManifestHook
		);
		assert.equal(
			module.getPostManifestHook({type: GroupType.Channel}),
			publicPostManifestHook
		);
		assert.equal(module.canMutateSharedPost(7, {userId: 7}), true);
		assert.equal(module.canMutateSharedPost(8, {userId: 7}), false);
	});

	it('accepts the private manifest hook only for private-group posts', async () => {
		const app: any = {
			config: {privateGroupConfig: {enabled: true}},
			ms: {
				group: {
					getPostPure: async (postId) => ({
						id: postId,
						groupId: 12,
						group: {type: GroupType.PrivateGroup}
					})
				}
			}
		};
		const module = getModule(app);

		assert.deepEqual(await module.afterPrivatePostManifestUpdate(7, 41), {
			groupId: 12,
			postId: 41,
			private: true
		});

		app.ms.group.getPostPure = async () => ({
			id: 42,
			groupId: 12,
			group: {type: GroupType.Channel}
		});
		await assert.rejects(
			() => module.afterPrivatePostManifestUpdate(7, 42),
			(error: Error) => error.message === 'private_group_post_required'
		);
	});

	it('keeps private-group creation disabled by default', () => {
		const module = getModule({config: {}} as any);

		assert.throws(
			() => module.normalizeGroupData({type: GroupType.PrivateGroup}),
			(error: Error) => error.message === 'private_group_disabled'
		);
	});
});
