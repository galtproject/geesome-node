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
	this.timeout(60000);

	let admin, app: IGeesomeApp, foreignAccounts: IGeesomeForeignAccountsModule;
	beforeEach(async () => {
		const appConfig: any = (await import('../app/config.js')).default;
		appConfig.storageConfig.jsNode.pass = 'test test test test test test test test test test';

		try {
			app = await (await import('../app/index.js')).default({storageConfig: appConfig.storageConfig, port: 7771});
			await app.flushDatabase();

			const setupResult = await app.setup({email: 'admin@admin.com', name: 'admin', password: 'admin'});
			admin = setupResult.user;
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

	it('invite status should preflight upload-capable invites', async () => {
		const invite = await createInvite(app, admin.id, {
			title: 'upload invite',
			permissions: JSON.stringify([CorePermissionName.UserSaveData]),
			maxCount: 2,
			isActive: true
		});

		const response = await requestJson('GET', `/invite/status/${invite.code}`);

		assert.equal(response.status, 200);
		assert.equal(response.body.ok, true);
		assert.equal(response.body.code, invite.code);
		assert.equal(response.body.publicJoinEnabled, true);
		assert.equal(response.body.active, true);
		assert.equal(response.body.remainingUses, 2);
		assert.deepEqual(response.body.permissions, [CorePermissionName.UserSaveData]);
		assert.equal(response.body.requiredPermission, CorePermissionName.UserSaveData);
		assert.equal(response.body.joinPath, `/v1/invite/join/${invite.code}`);
	});

	it('invite codes should be configured length base62 strings', async () => {
		const seenCodes = new Set<string>();
		const expectedLength = getExpectedInviteCodeLength();
		for (let i = 0; i < 20; i++) {
			const invite = await createInvite(app, admin.id, {
				title: `generated invite ${i}`,
				permissions: JSON.stringify([CorePermissionName.UserSaveData]),
				maxCount: 1,
				isActive: true
			});

			assert.equal(invite.code.length, expectedLength);
			assert.equal(new RegExp(`^[A-Za-z0-9]{${expectedLength}}$`).test(invite.code), true);
			assert.equal(seenCodes.has(invite.code), false);
			seenCodes.add(invite.code);
		}
	});

	it('invite status should return structured errors for unusable upload invites', async () => {
		const missingResponse = await requestJson('GET', `/invite/status/${commonHelper.random('hash')}`);
		assert.equal(missingResponse.status, 404);
		assert.equal(missingResponse.body.error.code, 'invite_not_found');
		assert.equal(missingResponse.body.error.agentAction, 'try_next_invite');

		const inactiveInvite = await createInvite(app, admin.id, {
			title: 'inactive invite',
			permissions: JSON.stringify([CorePermissionName.UserSaveData]),
			maxCount: 1,
			isActive: false
		});
		const inactiveResponse = await requestJson('GET', `/invite/status/${inactiveInvite.code}`);
		assert.equal(inactiveResponse.status, 410);
		assert.equal(inactiveResponse.body.error.code, 'invite_not_active');

		const exhaustedInvite = await createInvite(app, admin.id, {
			title: 'exhausted invite',
			permissions: JSON.stringify([CorePermissionName.UserSaveData]),
			maxCount: 1,
			isActive: true
		});
		await app.ms.invite.registerUserByInviteCode(exhaustedInvite.code, {
			email: 'used-invite@user.com',
			name: 'used-invite',
			password: 'used-invite',
		});
		const exhaustedResponse = await requestJson('GET', `/invite/status/${exhaustedInvite.code}`);
		assert.equal(exhaustedResponse.status, 410);
		assert.equal(exhaustedResponse.body.error.code, 'invite_exhausted');

		const wrongScopeInvite = await createInvite(app, admin.id, {
			title: 'wrong scope invite',
			permissions: JSON.stringify([CorePermissionName.UserGroupManagement]),
			maxCount: 1,
			isActive: true
		});
		const wrongScopeResponse = await requestJson('GET', `/invite/status/${wrongScopeInvite.code}`);
		assert.equal(wrongScopeResponse.status, 422);
		assert.equal(wrongScopeResponse.body.error.code, 'invite_missing_upload_permission');
		assert.equal(wrongScopeResponse.body.error.agentAction, 'use_upload_scoped_invite_or_existing_admin_user_provisioning');
	});

	it('invite status should rate limit repeated checks by ip', async () => {
		const headers = {'x-forwarded-for': '198.51.100.10'};
		for (let i = 0; i < 30; i++) {
			const response = await requestJson('GET', `/invite/status/${commonHelper.random('hash')}`, null, headers);
			assert.equal(response.status, 404);
		}

		const limitedResponse = await requestJson('GET', `/invite/status/${commonHelper.random('hash')}`, null, headers);
		assert.equal(limitedResponse.status, 429);
		assert.equal(limitedResponse.body.error.code, 'invite_rate_limited');
		assert.equal(limitedResponse.body.error.retryable, true);
		assert.equal(limitedResponse.body.error.retryAfterSeconds, 600);
	});

	it('invite join should return the documented credential shape and structured errors', async () => {
		const invite = await createInvite(app, admin.id, {
			title: 'join invite',
			permissions: JSON.stringify([CorePermissionName.UserSaveData]),
			maxCount: 1,
			isActive: true
		});

		const joinResponse = await requestJson('POST', `/invite/join/${invite.code}`, {
			email: 'joined-upload@user.com',
			name: 'joined-upload',
			password: 'joined-upload',
		});
		assert.equal(joinResponse.status, 200);
		assert.equal(joinResponse.body.user.name, 'joined-upload');
		assert.equal(typeof joinResponse.body.apiKey, 'string');
		assert.deepEqual(joinResponse.body.permissions, [CorePermissionName.UserSaveData]);
		assert.equal(joinResponse.body.keyStoreMethod, 'node');

		const exhaustedResponse = await requestJson('POST', `/invite/join/${invite.code}`, {
			email: 'joined-upload-2@user.com',
			name: 'joined-upload-2',
			password: 'joined-upload-2',
		});
		assert.equal(exhaustedResponse.status, 410);
		assert.equal(exhaustedResponse.body.error.code, 'invite_exhausted');
	});

	it('invite join should rate limit repeated failed registrations by ip', async () => {
		const headers = {'x-forwarded-for': '198.51.100.20'};
		for (let i = 0; i < 10; i++) {
			const response = await requestJson('POST', `/invite/join/${commonHelper.random('hash')}`, {
				email: `missing-${i}@user.com`,
				name: `missing-${i}`,
				password: `missing-${i}`
			}, headers);
			assert.equal(response.status, 404);
		}

		const limitedResponse = await requestJson('POST', `/invite/join/${commonHelper.random('hash')}`, {
			email: 'missing-limited@user.com',
			name: 'missing-limited',
			password: 'missing-limited'
		}, headers);
		assert.equal(limitedResponse.status, 429);
		assert.equal(limitedResponse.body.error.code, 'invite_rate_limited');
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

async function createInvite(app: IGeesomeApp, adminId, inviteData) {
	return app.ms.invite.createInvite(adminId, {
		limits: JSON.stringify([]),
		groupsToJoin: JSON.stringify([]),
		...inviteData
	});
}

function getExpectedInviteCodeLength() {
	const configuredLength = Number.parseInt(process.env.GEESOME_INVITE_CODE_LENGTH || '', 10);
	if (!Number.isFinite(configuredLength) || configuredLength <= 0) {
		return 16;
	}
	return Math.max(configuredLength, 16);
}

async function requestJson(method, path, body?, extraHeaders?) {
	const headers: any = {};
	if (body) {
		headers['Content-Type'] = 'application/json';
	}
	if (extraHeaders) {
		Object.assign(headers, extraHeaders);
	}
	const port = process.env.PORT || 7771;
	const response = await fetch(`http://127.0.0.1:${port}/v1${path}`, {
		method,
		headers,
		body: body ? JSON.stringify(body) : undefined
	});
	const text = await response.text();
	return {
		status: response.status,
		body: text ? JSON.parse(text) : null
	};
}
