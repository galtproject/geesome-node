import assert from 'node:assert';
import {IGeesomeApp} from '../app/interface.js';
import {CorePermissionName} from '../app/modules/database/interface.js';

describe("staticId", function () {
	this.timeout(60000);

	let app: IGeesomeApp;
	let testUser;

	beforeEach(async () => {
		const appConfig = (await import('../app/config.js')).default;
		appConfig.storageConfig.jsNode.pass = 'test test test test test test test test test test';
		app = await (await import('../app/index.js')).default({storageConfig: appConfig.storageConfig, port: 7790});
		await app.flushDatabase();
		await app.setup({email: 'admin@admin.com', name: 'admin', password: 'admin'});
		testUser = await app.registerUser({
			email: 'static-user@user.com',
			name: 'static-user',
			password: 'user',
			permissions: [CorePermissionName.UserAll]
		});
	});

	afterEach(async () => {
		await app.stop();
	});

	it("keeps one current binding while retaining static-id history", async () => {
		const staticId = await app.ms.staticId.createStaticAccountId(testUser.id, 'current-binding-test');
		const oldDynamicId = 'storage-old';
		const newDynamicId = 'storage-new';
		const StaticIdBinding = app.ms.database.sequelize.model('staticIdBinding') as any;
		const StaticIdHistory = app.ms.database.sequelize.model('staticIdHistory') as any;

		await app.ms.staticId.bindToStaticId(testUser.id, oldDynamicId, staticId);
		await app.ms.staticId.bindToStaticId(testUser.id, newDynamicId, staticId);

		const currentItem = await app.ms.staticId.getActualStaticIdItem(staticId);
		const currentReverseItem = await app.ms.staticId.getStaticIdItemByDynamicId(newDynamicId);
		const oldReverseItem = await app.ms.staticId.getStaticIdItemByDynamicId(oldDynamicId);

		assert.equal(currentItem.dynamicId, newDynamicId);
		assert.equal(currentReverseItem.staticId, staticId);
		assert.equal(oldReverseItem, null);
		assert.equal(await StaticIdBinding.count({where: {staticId}}), 1);
		assert.equal(await StaticIdHistory.count({where: {staticId}}), 2);

		await StaticIdBinding.destroy({where: {staticId}});

		const oldReverseMissingBindingItem = await app.ms.staticId.getStaticIdItemByDynamicId(oldDynamicId);
		assert.equal(oldReverseMissingBindingItem, null);
		assert.equal(await StaticIdBinding.count({where: {staticId}}), 0);

		const lazyCurrentItem = await app.ms.staticId.getActualStaticIdItem(staticId);
		assert.equal(lazyCurrentItem.dynamicId, newDynamicId);
		assert.equal(await StaticIdBinding.count({where: {staticId}}), 1);

		await StaticIdBinding.destroy({where: {staticId}});

		const lazyReverseItem = await app.ms.staticId.getStaticIdItemByDynamicId(newDynamicId);
		assert.equal(lazyReverseItem.staticId, staticId);
		assert.equal(await StaticIdBinding.count({where: {staticId}}), 1);

		await app.ms.staticId.destroyStaticIdHistory(staticId);

		assert.equal(await StaticIdBinding.count({where: {staticId}}), 0);
		assert.equal(await StaticIdHistory.count({where: {staticId}}), 0);
	});
});
