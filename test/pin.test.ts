/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import assert from "assert";
import axios from "axios";
import {ContentView, CorePermissionName} from "../app/modules/database/interface.js";
import IGeesomePinModule from "../app/modules/pin/interface.js";
import IGeesomeAutoActionsModule from "../app/modules/autoActions/interface.js";
import CronService from "../app/modules/autoActions/cronService.js";
import {IGeesomeApp} from "../app/interface.js";
import {PostStatus} from "../app/modules/group/interface.js";
import {PinStorageObjectStatus} from "../app/modules/pin/stateHelpers.js";
import {getModule as getPinModule} from "../app/modules/pin/index.js";

function isUniqueConstraintError(error: Error) {
	return error.name === 'SequelizeUniqueConstraintError';
}

async function waitForCondition(condition, timeoutMs = 5000) {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		if (await condition()) {
			return;
		}
		await new Promise(resolve => setTimeout(resolve, 50));
	}
	throw new Error('condition_timeout');
}

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
		assert.equal(gotAccount, null);

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
		assert.equal(gotAccounts.length, 1);
		assert.equal(acc.id, gotAccounts[0].id);

		const acc2 = await pins.createAccount(testUser2.id, {
			name: 'pinata-1',
			service: 'pinata',
			apiKey: '111',
			secretApiKey: '222',
			isEncrypted: true
		});

		gotAccount = await pins.getUserAccount(testUser.id, 'pinata-1');
		assert.equal(gotAccount, null);

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

		gotAccount = await pins.getGroupAccount(testUser.id, testGroup.id, 'pinata-1');
		assert.equal(gotAccount.apiKey, '123');
	});

	it('enforces pin account names for user and group lookups', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];
		const testUser2 = await app.registerUser({
			email: 'pin-user-2@user.com',
			name: 'pin-user-2',
			password: 'pin-user-2',
			permissions: [CorePermissionName.UserAll]
		});

		await pins.createAccount(testUser.id, {
			name: 'pinata-unique',
			service: 'pinata',
			apiKey: '111',
			secretApiKey: '222'
		});

		await assert.rejects(
			() => pins.createAccount(testUser.id, {
				name: 'pinata-unique',
				service: 'pinata',
				apiKey: '333',
				secretApiKey: '444'
			}),
			isUniqueConstraintError
		);

		await assert.rejects(
			() => pins.createAccount(testUser.id, {
				name: 'pinata-unique',
				service: 'pinata',
				apiKey: '555',
				secretApiKey: '666',
				groupId: testGroup.id
			}),
			isUniqueConstraintError
		);

		await pins.createAccount(testUser.id, {
			name: 'pinata-group-unique',
			service: 'pinata',
			apiKey: '777',
			secretApiKey: '888',
			groupId: testGroup.id
		});
		await app.ms.group.addAdminToGroup(testUser.id, testGroup.id, testUser2.id);

		await assert.rejects(
			() => pins.createAccount(testUser2.id, {
				name: 'pinata-group-unique',
				service: 'pinata',
				apiKey: '999',
				secretApiKey: '000',
				groupId: testGroup.id
			}),
			isUniqueConstraintError
		);
	});

	it('queues and executes opted-in automatic pins once', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const autoActions = app.ms['autoActions'] as IGeesomeAutoActionsModule;
		const originalAxiosPost = axios.post;
		axios.post = async (url, body) => ({data: {IpfsHash: body.hashToPin}}) as any;

		try {
			await pins.createAccount(testUser.id, {
				name: 'automatic-pinata',
				service: 'pinata',
				apiKey: '111',
				secretApiKey: '222',
				options: {autoPin: {enabled: true, attempts: 2}}
			});

			const content = await app.ms.content.saveData(testUser.id, 'automatic pin', 'automatic-pin.txt');
			await Promise.all(Array.from({length: 8}, () => {
				return pins.afterContentAdding(testUser.id, content);
			}));
			const queued = await autoActions.getUserActions(testUser.id, {
				moduleName: 'pin',
				funcName: 'pinByAccountId'
			});
			assert.equal(queued.total, 1);
			assert.equal(queued.list[0].isActive, true);

			await new CronService(app, autoActions).getActionsAndAddToQueueAndRun();

			const completed = await autoActions.getUserActions(testUser.id, {
				moduleName: 'pin',
				funcName: 'pinByAccountId'
			});
			const pinnedContent = await app.ms.content.getContentByStorageAndUserId(content.storageId, testUser.id);
			assert.equal(completed.list[0].isActive, false);
			assert.notEqual(pinnedContent.isPinned, true);
			const pinStorageObject = await app.ms.database.sequelize.models.pinStorageObject.findOne({
				where: {storageId: content.storageId}
			});
			assert.equal(pinStorageObject.status, PinStorageObjectStatus.Accepted);
		} finally {
			axios.post = originalAxiosPost;
		}
	});

	it('queues published group post targets for the group account owner', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const postAuthor = await app.registerUser({
			email: 'group-post-author@user.com',
			name: 'group-post-author',
			password: 'group-post-author',
			permissions: [CorePermissionName.UserAll]
		});
		const group = await app.ms.group.createGroup(testUser.id, {
			name: 'automatic-pin-group',
			title: 'Automatic pin group',
			isPublic: true,
			isOpen: true
		});
		await app.ms.group.addAdminToGroup(testUser.id, group.id, postAuthor.id);
		await pins.createAccount(testUser.id, {
			name: 'group-automatic-pinata',
			service: 'pinata',
			groupId: group.id,
			apiKey: '111',
			secretApiKey: '222',
			options: {
				autoPin: {
					enabled: true,
					scope: 'group-post',
					targets: ['post-manifest', 'contents'],
					attempts: 2
				}
			}
		});

		const content = await app.ms.content.saveData(postAuthor.id, 'group automatic pin', 'group-auto-pin.txt');
		const post = await app.ms.group.createPost(postAuthor.id, {
			groupId: group.id,
			status: PostStatus.Published,
			contents: [{id: content.id, view: ContentView.Attachment}]
		});
		const autoActions = app.ms['autoActions'] as IGeesomeAutoActionsModule;
		await Promise.all(Array.from({length: 8}, () => {
			return pins.afterPostManifestUpdate(postAuthor.id, post.id);
		}));
		await waitForCondition(async () => {
			const actions = await autoActions.getUserActions(testUser.id, {
				moduleName: 'pin',
				funcName: 'pinByAccountId'
			});
			return actions.total === 2;
		});

		const queued = await autoActions.getUserActions(testUser.id, {
			moduleName: 'pin',
			funcName: 'pinByAccountId'
		});
		const storageIds = queued.list.map(action => JSON.parse(action.funcArgs)[1]).sort();
		const storedPost = await app.ms.group.getPostPure(post.id);
		assert.deepEqual(storageIds, [content.storageId, storedPost.manifestStorageId].sort());

		const originalAxiosPost = axios.post;
		axios.post = async (url, body) => ({data: {IpfsHash: body.hashToPin}}) as any;
		try {
			await new CronService(app, autoActions).getActionsAndAddToQueueAndRun();
			const completed = await autoActions.getUserActions(testUser.id, {
				moduleName: 'pin',
				funcName: 'pinByAccountId'
			});
			const pinnedContent = await app.ms.content.getContentByStorageAndUserId(content.storageId, postAuthor.id);
			assert(completed.list.every(action => action.isActive === false));
			assert.notEqual(pinnedContent.isPinned, true);
			const pinStorageObjects = await app.ms.database.sequelize.models.pinStorageObject.findAll();
			const acceptedStorageIds = pinStorageObjects
				.filter(row => row.status === PinStorageObjectStatus.Accepted)
				.map(row => row.storageId)
				.sort();
			assert.deepEqual(acceptedStorageIds, [content.storageId, storedPost.manifestStorageId].sort());
		} finally {
			axios.post = originalAxiosPost;
		}
	});

	it('enforces the reconciliation account concurrency cap across module instances', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const account = await pins.createAccount(testUser.id, {
			name: 'reconciliation-pinata',
			service: 'pinata',
			apiKey: '111',
			secretApiKey: '222'
		});
		const PinAccount = app.ms.database.sequelize.models.pinAccount;
		const PinStorageObject = app.ms.database.sequelize.models.pinStorageObject;
		await PinStorageObject.bulkCreate([
			{pinAccountId: account.id, storageId: 'reconcile-first', status: PinStorageObjectStatus.Accepted},
			{pinAccountId: account.id, storageId: 'reconcile-second', status: PinStorageObjectStatus.Accepted}
		]);
		let providerCalls = 0;
		let resolveInspection;
		const inspection = new Promise(resolve => {
			resolveInspection = resolve;
		});
		const providerInspector: any = async () => {
			providerCalls += 1;
			return inspection;
		};
		const firstModule: any = getPinModule(app, {PinAccount, PinStorageObject}, {providerInspector});
		const secondModule: any = getPinModule(app, {PinAccount, PinStorageObject}, {providerInspector});

		const first = firstModule.reconcilePinStorageObject(
			{pinAccountId: account.id, storageId: 'reconcile-first'},
			{perAccountLimit: 1}
		);
		await waitForCondition(async () => providerCalls === 1);
		const second = await secondModule.reconcilePinStorageObject(
			{pinAccountId: account.id, storageId: 'reconcile-second'},
			{perAccountLimit: 1}
		);
		resolveInspection({status: PinStorageObjectStatus.Confirmed, result: {id: 'remote-id'}});
		await first;
		const staleDuplicate = await secondModule.reconcilePinStorageObject(
			{pinAccountId: account.id, storageId: 'reconcile-first'},
			{perAccountLimit: 1}
		);

		assert.equal(providerCalls, 1);
		assert.equal(second.skipped, true);
		assert.equal(staleDuplicate.skipped, true);
		const rows = await PinStorageObject.findAll({order: [['storageId', 'ASC']]});
		assert.equal(rows[0].status, PinStorageObjectStatus.Confirmed);
		assert.equal(rows[1].status, PinStorageObjectStatus.Accepted);
	});

	it('keeps local and per-account remote claims independent for shared storage', async () => {
		const firstUser = (await app.ms.database.getAllUserList('user'))[0];
		const secondUser = await app.registerUser({
			email: 'pin-peer@user.com',
			name: 'pin-peer',
			password: 'pin-peer',
			permissions: [CorePermissionName.UserAll]
		});
		const firstContent = await app.ms.content.saveData(firstUser.id, 'shared pin body', 'first.txt');
		const secondContent = await app.ms.content.saveData(secondUser.id, 'shared pin body', 'second.txt');
		assert.equal(firstContent.storageId, secondContent.storageId);

		await app.ms.database.markStorageObjectPinnedByContent(firstContent);
		const firstAccount = await pins.createAccount(firstUser.id, {
			name: 'first-pinata',
			service: 'pinata',
			apiKey: 'first-key',
			secretApiKey: 'first-secret'
		});
		const secondAccount = await pins.createAccount(secondUser.id, {
			name: 'second-pinata',
			service: 'pinata',
			apiKey: 'second-key',
			secretApiKey: 'second-secret'
		});
		await confirmPin(pins, firstAccount, firstContent);
		await confirmPin(pins, secondAccount, secondContent);

		let provenance = await app.ms.database.getStorageObjectPinProvenance(firstContent.storageId);
		assert.equal(provenance.storageObjectPinRefs, 1);
		assert.equal(provenance.confirmedRemotePinRefs, 2);
		assert.equal(provenance.protectedRemotePinRefs, 2);
		assert.equal(provenance.isConfirmedPinned, true);
		assert.equal(provenance.isDeletionProtected, true);

		await pins.updatePinStorageObjectStatus(
			firstAccount.id,
			firstContent.storageId,
			PinStorageObjectStatus.Missing
		);
		provenance = await app.ms.database.getStorageObjectPinProvenance(firstContent.storageId);
		assert.equal(provenance.confirmedRemotePinRefs, 1);
		assert.equal(provenance.protectedRemotePinRefs, 1);
		assert.equal(provenance.isConfirmedPinned, true);

		await pins.updatePinStorageObjectStatus(
			secondAccount.id,
			firstContent.storageId,
			PinStorageObjectStatus.Missing
		);
		provenance = await app.ms.database.getStorageObjectPinProvenance(firstContent.storageId);
		assert.equal(provenance.confirmedRemotePinRefs, 0);
		assert.equal(provenance.protectedRemotePinRefs, 0);
		assert.equal(provenance.hasLocalOrLegacyPin, true);
		assert.equal(provenance.isConfirmedPinned, true);
		assert.equal(provenance.isDeletionProtected, true);

		await app.ms.database.models.StorageObject.update(
			{isPinned: false},
			{where: {storageId: firstContent.storageId}}
		);
		await pins.updatePinStorageObjectStatus(
			secondAccount.id,
			firstContent.storageId,
			PinStorageObjectStatus.Accepted
		);
		provenance = await app.ms.database.getStorageObjectPinProvenance(firstContent.storageId);
		assert.equal(provenance.isConfirmedPinned, false);
		assert.equal(provenance.isDeletionProtected, true);
		const deleteSafety = await app.ms.database.getStorageObjectDeleteSafety(firstContent.storageId);
		assert.equal(deleteSafety.storageRefs.remotePinRefs, 1);
		assert.equal(deleteSafety.storageRefs.pinProvenance.isDeletionProtected, true);
	});
});

async function confirmPin(pins: IGeesomePinModule, account, content) {
	await pins.recordPinnedStorageObject(content.storageId, account, content, {
		data: {IpfsHash: content.storageId}
	});
	await pins.updatePinStorageObjectStatus(
		account.id,
		content.storageId,
		PinStorageObjectStatus.Confirmed
	);
}
