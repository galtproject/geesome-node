/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {IGeesomeApp} from "../app/interface";
import {
	CorePermissionName,
} from "../app/modules/database/interface";
import IGeesomeForeignAccountsModule from "../app/modules/foreignAccounts/interface";

const assert = require('assert');

describe("foreignAccounts", function () {
	const databaseConfig = {
		name: 'geesome_test', options: {
			logging: () => {
			}, storage: 'database-test.sqlite'
		}
	};

	this.timeout(60000);

	let admin, app: IGeesomeApp, foreignAccounts: IGeesomeForeignAccountsModule;
	beforeEach(async () => {
		const appConfig = require('../app/config');
		appConfig.storageConfig.implementation = 'js-ipfs';
		appConfig.storageConfig.jsNode.repo = '.jsipfs-test';
		appConfig.storageConfig.jsNode.pass = 'test test test test test test test test test test';
		appConfig.storageConfig.jsNode.config = {
			Addresses: {
				Swarm: [
					"/ip4/0.0.0.0/tcp/40002",
					"/ip4/127.0.0.1/tcp/40003/ws",
					"/dns4/wrtc-star.discovery.libp2p.io/tcp/443/wss/p2p-webrtc-star"
				]
			}
		};

		try {
			app = await require('../app')({databaseConfig, storageConfig: appConfig.storageConfig, port: 7771});
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
			foreignAccounts = app.ms['foreignAccounts'] as IGeesomeForeignAccountsModule;
		} catch (e) {
			console.error('error', e);
			assert.equal(true, false);
		}
	});

	afterEach(async () => {
		await app.stop();
	});

	it('user accounts should work properly', async () => {
		const userAccountPrivateKey = '0xec63de747a7872b20793af42814ce92b5749dd13017887b6ab26754907b4934f';
		const userAccountAddress = '0x2FAa9af0dbD9d32722C494bAD6B4A2521d132003';

		const newMember = await app.registerUser({
			email: 'new1@user.com',
			name: 'new1',
			password: 'new1',
			permissions: [CorePermissionName.UserAll],
			foreignAccounts: [{'address': userAccountAddress, 'provider': 'ethereum'}]
		});

		const userAccounts = await foreignAccounts.getUserAccountsList(newMember.id);
		assert.equal(userAccounts.length, 1);
		assert.equal(userAccounts[0].provider, 'ethereum');
		assert.equal(userAccounts[0].address, userAccountAddress.toLowerCase());

		const userObject = await app.getDataStructure(newMember.manifestStorageId);
		assert.equal(userObject.foreignAccounts.length, 1);
		assert.equal(userObject.foreignAccounts[0].provider, 'ethereum');
		assert.equal(userObject.foreignAccounts[0].address, userAccountAddress.toLowerCase());
	});
});
