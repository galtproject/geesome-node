/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import aesjs from 'aes-js';
import assert from 'assert';
import sigUtil from 'eth-sig-util';
import commonHelper from "geesome-libs/src/common.js";
import IGeesomeForeignAccountsModule from "../app/modules/foreignAccounts/interface.js";
import {CorePermissionName, UserLimitName} from "../app/modules/database/interface.js";
import {IGeesomeApp} from "../app/interface.js";

describe("app", function () {
	const databaseConfig = {
		name: 'geesome_test', options: {
			logging: () => {
			}, dialect: 'sqlite', storage: 'database-test.sqlite'
		}
	};

	this.timeout(60000);

	let admin, app: IGeesomeApp, foreignAccounts: IGeesomeForeignAccountsModule;
	beforeEach(async () => {
		const appConfig: any = (await import('../app/config.js')).default;
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
			foreignAccounts = app.ms['foreignAccounts'] as IGeesomeForeignAccountsModule;
		} catch (e) {
			console.error('error', e);
			assert.equal(true, false);
		}
	});

	afterEach(async () => {
		await app.stop();
	});

	it('user invites should work properly', async () => {
		const userAccountPrivateKey = '0xec63de747a7872b20793af42814ce92b5749dd13017887b6ab26754907b4934f';
		const userAccountAddress = '0x2FAa9af0dbD9d32722C494bAD6B4A2521d132003';
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testAdmin = (await app.ms.database.getAllUserList('admin'))[0];

		const invite = await app.ms.invite.createInvite(testAdmin.id, {
			title: 'test invite',
			limits: JSON.stringify([{
				name: UserLimitName.SaveContentSize,
				value: 100 * (10 ** 3),
				periodTimestamp: 60,
				isActive: true
			}]),
			permissions: JSON.stringify([CorePermissionName.UserAll]),
			groupsToJoin: JSON.stringify([testGroup.manifestStaticStorageId]),
			maxCount: 1,
			isActive: true
		});

		try {
			await app.ms.invite.registerUserByInviteCode(invite.code, {
				email: 'new2@user.com',
				name: 'new2',
				password: 'new2',
				foreignAccounts: [{'address': userAccountAddress, 'provider': 'ethereum'}]
			});
			assert.equal(true, false);
		} catch (e) {
			assert.equal(e.toString().includes("signature_required"), true);
		}
		const messageToSign = await app.ms.invite.getRegisterMessage(invite.code);
		const signature = signTypedData(userAccountPrivateKey, [{type: 'string', name: 'message', value: messageToSign}]);
		try {
			await app.ms.invite.registerUserByInviteCode(invite.code, {
				email: 'new2@user.com',
				name: 'new2',
				password: 'new2',
				foreignAccounts: [
					{'address': userAccountAddress, 'provider': 'ethereum', signature },
					{'address': userAccountAddress, 'provider': 'bitcoin', signature }
				]
			})
			assert.equal(true, false);
		} catch (e) {
			assert.equal(e.toString().includes("not_supported_provider"), true);
		}
		const {user: newMember} = await app.ms.invite.registerUserByInviteCode(invite.code, {
			email: 'new2@user.com',
			name: 'new2',
			password: 'new2',
			foreignAccounts: [{'address': userAccountAddress, 'provider': 'ethereum', signature }]
		});
		assert.equal(await app.ms.invite.getInvitedUserOfJoinedUser(newMember.id).then(u => u.id), invite.createdById);
		assert.equal(await app.ms.invite.getInviteOfJoinedUser(newMember.id).then(i => i.id), invite.id);

		const accs = await foreignAccounts.getUserAccountsList(newMember.id);
		assert.equal(accs.length, 1);
		assert.equal(accs[0].address, userAccountAddress.toLowerCase());
		assert.equal(accs[0].signature, signature);

		const userLimit = await app.getUserLimit(testAdmin.id, newMember.id, UserLimitName.SaveContentSize);
		assert.equal(userLimit.isActive, true);
		assert.equal(userLimit.periodTimestamp, 60);
		assert.equal(userLimit.value, 100 * (10 ** 3));

		assert.equal(await app.ms.database.isHaveCorePermission(newMember.id, CorePermissionName.UserAll), true);

		assert.equal(await app.ms.group.isMemberInGroup(newMember.id, testGroup.id), false);

		await app.ms.group.addAdminToGroup(testUser.id, testGroup.id, testAdmin.id);

		try {
			await app.ms.invite.registerUserByInviteCode(commonHelper.random('hash'), {
				email: 'new3@user.com',
				name: 'new3',
				password: 'new3',
			});
			assert.equal(true, false);
		} catch (e) {
			assert.equal(e.toString().includes("invite_not_found"), true);
		}

		try {
			await app.ms.invite.registerUserByInviteCode(invite.code, {
				email: 'new3@user.com',
				name: 'new3',
				password: 'new3',
			});
			assert.equal(true, false);
		} catch (e) {
			assert.equal(e.toString().includes("invite_max_count"), true);
		}

		await app.ms.invite.updateInvite(testAdmin.id, invite.id, {maxCount: 3});
		const foundInvite = await app.ms.invite.findInviteByCode(invite.code);
		assert.equal(foundInvite.maxCount, 3);

		const {user: newMember3} = await app.ms.invite.registerUserByInviteCode(invite.code, {
			email: 'new3@user.com',
			name: 'new3',
			password: 'new3',
		});

		assert.equal(await app.ms.group.isMemberInGroup(newMember.id, testGroup.id), false);
		assert.equal(await app.ms.group.isMemberInGroup(newMember3.id, testGroup.id), true);

		await app.ms.invite.updateInvite(testAdmin.id, invite.id, {isActive: false});

		try {
			await app.ms.invite.registerUserByInviteCode(invite.code, {
				email: 'new4@user.com',
				name: 'new4',
				password: 'new4',
			});
			assert.equal(true, false);
		} catch (e) {
			assert.equal(e.toString().includes("invite_not_active"), true);
		}
	});

	it('admin invites should work properly', async () => {
		const testAdmin = (await app.ms.database.getAllUserList('admin'))[0];

		const invite = await app.ms.invite.createInvite(testAdmin.id, {
			title: 'test invite',
			limits: JSON.stringify([{
				name: UserLimitName.SaveContentSize,
				value: 100 * (10 ** 3),
				periodTimestamp: 60,
				isActive: true
			}]),
			permissions: JSON.stringify([CorePermissionName.UserAll, CorePermissionName.AdminAll]),
			maxCount: 1,
			isActive: true
		});
		assert.equal(testAdmin.id, invite.createdById);

		const {user: newMember} = await app.ms.invite.registerUserByInviteCode(invite.code, {
			email: 'new2@user.com',
			name: 'new2',
			password: 'new2',
		});

		assert.equal(await app.ms.database.isHaveCorePermission(newMember.id, CorePermissionName.AdminAll), true);
	});
});

function hexToBuffer(hex) {
	return Buffer.from(hexToBytes(hex));
}
function hexToBytes(hex) {
	return aesjs.utils.hex.toBytes(hex.indexOf('0x') === 0 ? hex.slice(2) : hex);
}
function signTypedData(privateKey, msgParams) {
	const privateKeyBytes = hexToBuffer(privateKey);
	return sigUtil.signTypedData(privateKeyBytes, {data: msgParams});
}