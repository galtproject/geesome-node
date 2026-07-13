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
	this.timeout(60000);

	let admin, app: IGeesomeApp, autoActions: IGeesomeAutoActionsModule;

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

	it('paginates user auto action management lists safely', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const otherUser = await app.registerUser({
			email: 'other@user.com',
			name: 'other',
			password: 'other',
			permissions: [CorePermissionName.UserAll]
		});

		async function addAction(userId, moduleName, isActive = true) {
			return autoActions.addAutoAction(userId, {
				moduleName,
				funcName: 'run',
				funcArgs: '[]',
				isActive,
				totalExecuteAttempts: 1,
				currentExecuteAttempts: 1,
				executeOn: new Date(Date.now() + 60000)
			});
		}

		await addAction(testUser.id, 'action-1');
		await addAction(testUser.id, 'action-2');
		await addAction(testUser.id, 'inactive-action', false);
		await addAction(testUser.id, 'action-3');
		await addAction(otherUser.id, 'other-user-action');

		const firstPage = await autoActions.getUserActions(testUser.id, {
			isActive: 'true',
			limit: '2',
			offset: '0',
			sortBy: 'id',
			sortDir: 'asc',
			unsafeWhereKey: 'ignored'
		} as any);

		assert.equal(firstPage.total, 3);
		assert.deepEqual(firstPage.list.map(action => action.moduleName), ['action-1', 'action-2']);

		const malformedFiltersPage = await autoActions.getUserActions(testUser.id, {
			isActive: 'maybe',
			moduleName: ['action-1'],
			funcName: {bad: 'value'},
			limit: '10',
			sortBy: 'id',
			sortDir: 'asc'
		} as any);

		assert.equal(malformedFiltersPage.total, 4);
		assert.deepEqual(malformedFiltersPage.list.map(action => action.moduleName), [
			'action-1',
			'action-2',
			'inactive-action',
			'action-3'
		]);

		const secondPage = await autoActions.getUserActions(testUser.id, {
			isActive: 'true',
			limit: '2',
			offset: '2',
			sortBy: 'id',
			sortDir: 'asc'
		} as any);

		assert.equal(secondPage.total, 3);
		assert.deepEqual(secondPage.list.map(action => action.moduleName), ['action-3']);
	});

	it('claims due auto actions before cron execution', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const dueAction = await autoActions.addAutoAction(testUser.id, {
			moduleName: 'testModule',
			funcName: 'run',
			funcArgs: '[]',
			isActive: true,
			totalExecuteAttempts: 1,
			currentExecuteAttempts: 1,
			executePeriod: 60,
			executeOn: new Date(Date.now() - 1000)
		});

		const claimStartedAt = new Date();
		const firstClaim = await autoActions.claimAutoActionsToExecute({
			now: claimStartedAt,
			claimTtlMs: 1000
		});
		assert.deepEqual(firstClaim.map(action => action.id), [dueAction.id]);

		const secondClaim = await autoActions.claimAutoActionsToExecute({
			now: new Date(claimStartedAt.getTime() + 500),
			claimTtlMs: 1000
		});
		assert.deepEqual(secondClaim, []);

		const expiredClaim = await autoActions.claimAutoActionsToExecute({
			now: new Date(claimStartedAt.getTime() + 1500),
			claimTtlMs: 1000
		});
		assert.deepEqual(expiredClaim.map(action => action.id), [dueAction.id]);
	});

	it('keeps handled execution failures out of stderr', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const action = await autoActions.addAutoAction(testUser.id, {
			moduleName: 'missingModule',
			funcName: 'run',
			funcArgs: '[]',
			isActive: true,
			totalExecuteAttempts: 1,
			currentExecuteAttempts: 1,
			executeOn: new Date(Date.now() - 1000)
		});
		const originalConsoleError = console.error;
		const consoleErrorCalls = [];

		console.error = ((...args) => {
			consoleErrorCalls.push(args);
		}) as any;

		try {
			const cronService = new CronService(app, autoActions);
			await cronService.getActionsAndAddToQueueAndRun();
		} finally {
			console.error = originalConsoleError;
		}

		const dbAction = await (autoActions as any).getAutoAction(action.id);
		const [logs] = await app.ms.database.sequelize.query(`
			SELECT error
			FROM "autoActionLogs"
			WHERE "actionId" = :actionId
			ORDER BY id ASC
		`, {
			replacements: {actionId: action.id}
		}) as any;

		assert.deepEqual(consoleErrorCalls, []);
		assert.equal(dbAction.isActive, false);
		assert.equal(logs.length, 1);
		assert.equal(JSON.parse(logs[0].error), 'module_dont_support_auto_actions');
	});

	it('stores long auto action log payloads', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const action = await autoActions.addAutoAction(testUser.id, {
			moduleName: 'testModule',
			funcName: 'run',
			funcArgs: '[]',
			isActive: true,
			totalExecuteAttempts: 2,
			currentExecuteAttempts: 2,
			executeOn: new Date(Date.now() - 1000)
		});
		const longResponse = {
			staticId: 'bafzbeice7d5pthq72mr7bfylhyzcwyzbmzy26q7xib3a2gruiqopnem3za',
			dynamicId: 'bafkreihndyo47fyzsda3rftwvz4finqqn52urmnoihixjsu5hp5zmyneo4',
			metadata: 'x'.repeat(400)
		};

		await autoActions.handleAutoActionSuccessfulExecution(testUser.id, action.id, longResponse);
		await autoActions.handleAutoActionFailedExecution(testUser.id, action.id, new Error('x'.repeat(400)));

		const [logs] = await app.ms.database.sequelize.query(`
			SELECT response, error
			FROM "autoActionLogs"
			WHERE "actionId" = :actionId
			ORDER BY id ASC
		`, {
			replacements: {actionId: action.id}
		}) as any;
		assert.equal(logs.length, 2);
		assert.deepEqual(JSON.parse(logs[0].response), longResponse);
		assert.equal(JSON.parse(logs[1].error), 'x'.repeat(400));
	});

	it('deactivates successful one-shot actions and keeps recurring actions active', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const oneShot = await autoActions.addAutoAction(testUser.id, {
			moduleName: 'content',
			funcName: 'saveDataAndGetStorageId',
			funcArgs: '[]',
			isActive: true,
			totalExecuteAttempts: 3,
			currentExecuteAttempts: 3,
			executePeriod: 0,
			executeOn: new Date()
		});
		const recurring = await autoActions.addAutoAction(testUser.id, {
			moduleName: 'content',
			funcName: 'saveDataAndGetStorageId',
			funcArgs: '[]',
			isActive: true,
			totalExecuteAttempts: 3,
			currentExecuteAttempts: 3,
			executePeriod: 60,
			executeOn: new Date()
		});

		await autoActions.handleAutoActionSuccessfulExecution(testUser.id, oneShot.id, {ok: true});
		await autoActions.handleAutoActionSuccessfulExecution(testUser.id, recurring.id, {ok: true});

		const storedOneShot = await (autoActions as any).getAutoAction(oneShot.id);
		const storedRecurring = await (autoActions as any).getAutoAction(recurring.id);
		assert.equal(storedOneShot.isActive, false);
		assert.equal(storedRecurring.isActive, true);
		assert(storedRecurring.executeOn.getTime() > recurring.executeOn.getTime());
	});
});
