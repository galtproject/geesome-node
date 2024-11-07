/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import assert from 'assert';
import IGeesomeAutoActionsModule, {IAutoAction} from "../app/modules/autoActions/interface.js";
import {ContentView, CorePermissionName} from "../app/modules/database/interface.js";
import CronService from "../app/modules/autoActions/cronService.js";
import {PostStatus} from "../app/modules/group/interface.js";
import commonHelper from "geesome-libs/src/common.js";
import {IGeesomeApp} from "../app/interface.js";

describe("autoActions", function () {
	const databaseConfig = {
		name: 'geesome_test', options: {
			logging: () => {
			}, dialect: 'sqlite', storage: 'database-test.sqlite'
		}
	};

	this.timeout(60000);

	let admin, app: IGeesomeApp, autoActions: IGeesomeAutoActionsModule;

	beforeEach(async () => {
		const appConfig = (await import('../app/config.js')).default;
		appConfig.storageConfig.jsNode.pass = 'test test test test test test test test test test';

		try {
			app = await (await import('../app/index.js')).default({databaseConfig, storageConfig: appConfig.storageConfig, port: 7771});
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
			autoActions = app.ms['autoActions'] as IGeesomeAutoActionsModule;
		} catch (e) {
			console.error('error', e);
			assert.equal(true, false);
		}
	});

	afterEach(async () => {
		await app.stop();
		await app.flushDatabase();
	});

	it('autoActions should be executed successfully', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		let testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];
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
		const staticIdName = 'test-static';

		function buildAutoAction(moduleName, funcName, funcArgs) {
			const runPeriod = funcName === 'getNewContent' ? 1 : 0;
			return {
				runPeriod,
				moduleName,
				funcName,
				funcArgs: JSON.stringify(funcArgs),
				isActive: true,
				isEncrypted: true,
				position: 1,
				totalExecuteAttempts: 3,
				currentExecuteAttempts: 3,
				executeOn: runPeriod ? commonHelper.moveDate(runPeriod, 'second') : null
			} as IAutoAction;
		}

		const actions = await autoActions.addSerialAutoActions(testUser.id, [
			buildAutoAction('testModule', 'getNewContent', ['val1', 'val2']),
			buildAutoAction('content', 'saveDataAndGetStorageId', ['{{testModule.getNewContent}}', 'text.txt']),
			buildAutoAction('staticId', 'bindToStaticIdByGroupAndCreateIfNotExists', [testGroup.id, staticIdName, '{{content.saveDataAndGetStorageId}}']),
		]);

		const [bindToStatic, saveData, getNewContent] = actions;
		assert.equal(bindToStatic.moduleName, 'staticId');
		assert.equal(bindToStatic.funcName, 'bindToStaticIdByGroupAndCreateIfNotExists');
		assert.equal(bindToStatic.funcArgs, JSON.stringify([testGroup.id, staticIdName, '{{content.saveDataAndGetStorageId}}']));
		const bindToStaticNextActions = await autoActions.getNextActionsById(testUser.id, bindToStatic.id);
		assert.equal(bindToStaticNextActions.length, 0);

		assert.equal(saveData.moduleName, 'content');
		assert.equal(saveData.funcName, 'saveDataAndGetStorageId');
		assert.equal(saveData.funcArgs, JSON.stringify(['{{testModule.getNewContent}}', 'text.txt']));
		const saveDataNextActions = await autoActions.getNextActionsById(testUser.id, saveData.id);
		assert.equal(saveDataNextActions.length, 1);
		assert.equal(saveDataNextActions[0].moduleName, 'staticId');
		assert.equal(saveDataNextActions[0].funcName, 'bindToStaticIdByGroupAndCreateIfNotExists');

		assert.equal(getNewContent.moduleName, 'testModule');
		assert.equal(getNewContent.funcName, 'getNewContent');
		assert.equal(getNewContent.funcArgs, JSON.stringify(['val1', 'val2']));
		const getNewContentNextActions = await autoActions.getNextActionsById(testUser.id, getNewContent.id);
		assert.equal(getNewContentNextActions.length, 1);
		assert.equal(getNewContentNextActions[0].moduleName, 'content');
		assert.equal(getNewContentNextActions[0].funcName, 'saveDataAndGetStorageId');

		const cronService = new CronService(app, autoActions);
		assert.equal(await autoActions.getAutoActionsToExecute().then(r => r.length), 0);
		await new Promise((resolve) => setTimeout(resolve, 1000));
		const actionsToExecute = await autoActions.getAutoActionsToExecute();
		assert.equal(actionsToExecute.length, 1);
		assert.equal(actionsToExecute[0].moduleName, getNewContent.moduleName);

		await cronService.getActionsAndAddToQueue();
		assert.equal(cronService.inProcessByModules[getNewContent.moduleName], undefined);
		assert.equal(cronService.inProcessByModules[saveData.moduleName], undefined);
		assert.equal(cronService.inProcessByModules[bindToStatic.moduleName], undefined);

		assert.equal(cronService.queueByModules[getNewContent.moduleName].length, 1);
		assert.equal(cronService.queueByModules[saveData.moduleName], undefined);
		assert.equal(cronService.queueByModules[bindToStatic.moduleName], undefined);

		await cronService.getActionsAndAddToQueue();
		assert.equal(cronService.inProcessByModules[getNewContent.moduleName], undefined);
		assert.equal(cronService.inProcessByModules[saveData.moduleName], undefined);
		assert.equal(cronService.inProcessByModules[bindToStatic.moduleName], undefined);

		assert.equal(cronService.queueByModules[getNewContent.moduleName].length, 1);
		assert.equal(cronService.queueByModules[saveData.moduleName], undefined);
		assert.equal(cronService.queueByModules[bindToStatic.moduleName], undefined);

		assert.equal(cronService.actionsIdsByRootId[getNewContent.id], undefined);

		await cronService.getActionsAndAddToQueueAndRun();

		await new Promise((resolve) => {
			setInterval(() => {
				if (cronService.queueByModules[bindToStatic.moduleName] && !cronService.inProcessByModules[bindToStatic.moduleName]) {
					resolve(true);
				}
			}, 500);
		});

		assert.equal(cronService.queueByModules[getNewContent.moduleName].length, 0);
		assert.equal(cronService.queueByModules[saveData.moduleName].length, 0);
		assert.equal(cronService.queueByModules[bindToStatic.moduleName].length, 0);

		const storageId = await app.ms.staticId.resolveStaticId(await app.ms.staticId.getOrCreateStaticGroupAccountId(testUser.id, testGroup.id, staticIdName));
		assert.equal(storageId, "bafkreihndyo47fyzsda3rftwvz4finqqn52urmnoihixjsu5hp5zmyneo4");

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