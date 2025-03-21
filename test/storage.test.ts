/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import assert from "assert";
import IGeesomeCommunicatorModule from "../app/modules/communicator/interface.js";
import {CorePermissionName} from "../app/modules/database/interface.js";
import IGeesomeStorageModule from "../app/modules/storage/interface.js";
import {IGeesomeApp} from "../app/interface.js";

describe("storage", function () {
	this.timeout(30000);
	let storage: IGeesomeStorageModule;
	let communicator: IGeesomeCommunicatorModule;
	let app: IGeesomeApp;

	before(async () => {
		const appConfig = (await import('../app/config.js')).default;
		appConfig.storageConfig.jsNode.pass = 'test test test test test test test test test test';

		try {
			app = await (await import('../app/index.js')).default({storageConfig: appConfig.storageConfig, port: 7771});
			await app.flushDatabase();

			await app.setup({email: 'admin@admin.com', name: 'admin', password: 'admin'});
			const testUser = await app.registerUser({
				email: 'user@user.com',
				name: 'user',
				password: 'user',
				permissions: [CorePermissionName.UserAll]
			});
			await app.ms.group.createGroup(testUser.id, {
				name: 'test',
				title: 'Test'
			});
			communicator = app.ms['communicator'];
			storage = app.ms['storage'];
		} catch (e) {
			console.error('error', e);
			assert.equal(true, false);
		}
	});

	afterEach(async () => {
		await app.stop();
	});

	it("should save and get objects correctly", async () => {
		const obj = {
			foo: 'bar',
			fooArray: ['bar1', 'bar2']
		};
		const objectId = await storage.saveObject(obj, {waitForPin: true});

		assert.deepEqual(await storage.getObject(objectId), obj);

		assert.equal(await storage.getObjectProp(objectId, 'foo'), 'bar');

		assert.equal(await storage.getObjectProp(objectId, 'fooArray/0'), 'bar1');
	});

	//TODO: solve "cannot call iterator() before open()" error
	it.skip("should save and get remote objects correctly", async () => {
		const array = ['bar1', 'bar2'];
		const arrayId = await storage.saveObject(array, {waitForPin: true});

		const obj = {
			foo: 'bar',
			fooArray: arrayId
		};
		const objectId = await storage.saveObject(obj, {waitForPin: true});
		assert.deepEqual(await storage.getObjectProp(objectId, 'fooArray'), array);
	});

	//TODO: solve fluence service issues
	it.skip("should allow to bind id to static", async () => {
		const array = ['bar1', 'bar2'];
		const arrayId = await storage.saveObject(array, {waitForPin: true});

		const staticId = await communicator.bindToStaticId(arrayId, 'self');

		assert.equal(await communicator.resolveStaticId(staticId), arrayId)
	});

	it.skip("should create account if not exists", async () => {
		await communicator.removeAccountIfExists('new-key');

		assert.equal(await communicator.getAccountIdByName('new-key'), null);

		let accountId = await communicator.createAccountIfNotExists('new-key');

		assert.notEqual(accountId, null);

		let sameAccountId = await communicator.getAccountIdByName('new-key');

		assert.equal(accountId, sameAccountId);

		await communicator.createAccountIfNotExists('new-key');
		sameAccountId = await communicator.getAccountIdByName('new-key');

		assert.equal(accountId, sameAccountId);

		await communicator.removeAccountIfExists('new-key');

		assert.equal(await communicator.getAccountIdByName('new-key'), null);
	});
});
