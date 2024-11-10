/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import assert from "assert";
import {CorePermissionName} from "../app/modules/database/interface.js";
import IGeesomePinModule from "../app/modules/pin/interface.js";
import {IGeesomeApp} from "../app/interface.js";

describe("pin", function () {
	this.timeout(60000);

	let admin, app: IGeesomeApp, pins: IGeesomePinModule;

	beforeEach(async () => {
		const appConfig = (await import('../app/config.js')).default;
		appConfig.storageConfig.jsNode.pass = 'test test test test test test test test test test';

		try {
			app = await (await import('../app/index.js')).default({storageConfig: appConfig.storageConfig, port: 7771});
			await app.flushDatabase();

			admin = await app.setup({email: 'admin@admin.com', name: 'admin', password: 'admin'}).then(r => r.user);
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
			pins = app.ms['pin'] as IGeesomePinModule;
		} catch (e) {
			console.error('error', e);
			assert.equal(true, false);
		}
	});

	afterEach(async () => {
		await app.stop();
	});

	it('pins should stored correctly', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		let testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];

		const acc = await pins.createAccount(testUser.id, {
			name: 'pinata-1',
			service: 'pinata',
			apiKey: '111',
			secretApiKey: '222',
			isEncrypted: true,
			groupId: testGroup.id
		});

		let gotAccount = await pins.getUserAccount(testUser.id, 'pinata-1');
		assert.equal(acc.id, gotAccount.id);

		const testUser2 = await app.registerUser({
			email: 'user2@user.com',
			name: 'user2',
			password: 'user2',
			permissions: [CorePermissionName.UserAll]
		});

		const nullAccount = await pins.getUserAccount(testUser2.id, 'pinata-1');
		assert.equal(nullAccount, null);

		gotAccount = await pins.getGroupAccount(testUser.id, testGroup.id, 'pinata-1');
		assert.equal(acc.id, gotAccount.id);

		try {
			await pins.getGroupAccount(testUser2.id, testGroup.id, 'pinata-1');
			assert(false, "Error expected");
		} catch (e) {
			assert(e.message, "not_permitted");
		}
		try {
			await pins.getGroupAccountsList(testUser2.id, testGroup.id);
			assert(false, "Error expected");
		} catch (e) {
			assert(e.message, "not_permitted");
		}

		let gotAccounts = await pins.getGroupAccountsList(testUser.id, testGroup.id);
		assert.equal(acc.id, gotAccounts.length);
		assert.equal(acc.id, gotAccounts[0].id);

		const acc2 = await pins.createAccount(testUser2.id, {
			name: 'pinata-1',
			service: 'pinata',
			apiKey: '111',
			secretApiKey: '222',
			isEncrypted: true,
			groupId: testGroup.id
		});

		gotAccount = await pins.getUserAccount(testUser.id, 'pinata-1');
		assert.equal(acc.id, gotAccount.id);

		gotAccount = await pins.getUserAccount(testUser2.id, 'pinata-1');
		assert.equal(acc2.id, gotAccount.id);

		let updatedAccount = await pins.updateAccount(testUser.id, acc.id, {
			apiKey: '123',
		});
		assert.equal(updatedAccount.apiKey, '123');

		try {
			await pins.updateAccount(testUser2.id, acc.id, {
				apiKey: '123',
			});
			assert(false, "Error expected");
		} catch (e) {
			assert(e.message, "not_permitted");
		}

		updatedAccount = await pins.updateAccount(testUser2.id, acc2.id, {
			apiKey: '456',
		});
		assert.equal(updatedAccount.apiKey, '456');

		gotAccount = await pins.getUserAccount(testUser.id, 'pinata-1');
		assert.equal(gotAccount.apiKey, '123');
	});
});