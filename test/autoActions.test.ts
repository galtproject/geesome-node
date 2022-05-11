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
	ContentView,
	CorePermissionName, PostStatus,
} from "../app/modules/database/interface";
import IGeesomeAutoActionsModule, {IAutoAction} from "../app/modules/autoActions/interface";

const assert = require('assert');

describe.skip("autoActions", function () {
	const databaseConfig = {
		name: 'geesome_test', options: {
			logging: () => {
			}, storage: 'database-test.sqlite'
		}
	};

	this.timeout(60000);

	let app: IGeesomeApp, autoActions: IGeesomeAutoActionsModule;

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
			autoActions = app.ms['autoActions'] as IGeesomeAutoActionsModule;
		} catch (e) {
			console.error('error', e);
			assert.equal(true, false);
		}
	});

	afterEach(async () => {
		await app.flushDatabase();
		await app.stop();
	});

	it('autoActions should be executed successfully', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		let testGroup = (await app.ms.database.getAllGroupList('test'))[0];
		await addTextPostToGroup(testGroup, 'Test 1 post');

		let newContentCalls = 0;
		app.ms['testModule'] = {
			isAutoActionAllowed(userId, funcName, funcArgs) {
				return true;
			},
			getNewContent(userId, arg1, arg2, arg3) {
				newContentCalls++;
				return 'test-' + newContentCalls;
			}
		}

		// const actions = await autoActions.addSerialAutoActions(testUser.id, [{
		// 	moduleName: 'testModule',
		// 	funcName: 'getNewContent',
		// 	funcArgs: ['val1', 'val2'],
		// 	isActive: true,
		// 	runPeriod: '1',
		// 	position: '1',
		// 	totalExecuteAttempts: 3,
		// 	currentExecuteAttempts: 3
		// },{
		// 	moduleName: 'content',
		// 	funcName: 'saveDataAndGetStorageId',
		// 	funcArgs: ['{{testModule.getNewContent}}'],
		// 	isActive: true,
		// 	runPeriod: '1',
		// 	position: '1',
		// 	totalExecuteAttempts: 3,
		// 	currentExecuteAttempts: 3
		// },{
		// 	moduleName: 'content',
		// 	funcName: 'saveDataAndGetStorageId',
		// 	funcArgs: ['{{testModule.getNewContent}}'],
		// 	isActive: true,
		// 	runPeriod: '1',
		// 	position: '1',
		// 	totalExecuteAttempts: 3,
		// 	currentExecuteAttempts: 3
		// }] as IAutoAction[])


		async function addTextPostToGroup(group, text) {
			const post1Content = await app.ms.content.saveData(testUser.id, text, null, {
				mimeType: 'text/html'
			});

			await app.ms.group.createPost(testUser.id, {
				contents: [{manifestStorageId: post1Content.manifestStorageId, view: ContentView.Attachment}],
				groupId: group.id,
				status: PostStatus.Published
			});
		}
	});
});