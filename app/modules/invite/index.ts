import {IGeesomeApp, IUserInput} from "../../interface";
import {CorePermissionName, IListParams} from "../database/interface";
import IGeesomeInviteModule from "./interface";
const pIteration = require('p-iteration');
const _ = require('lodash');
const ethereumAuthorization = require('geesome-libs/src/ethereum');
const geesomeMessages = require("geesome-libs/src/messages");
const commonHelpers = require("geesome-libs/src/common");

module.exports = (app: IGeesomeApp) => {
	const module = getModule(app);
	require('./api')(app, module);
	return module;
}

function getModule(app: IGeesomeApp) {
	app.checkModules(['database', 'group']);

	class InviteModule implements IGeesomeInviteModule {
		public async registerUserByInviteCode(inviteCode, userData: IUserInput): Promise<any> {
			userData = _.pick(userData, ['email', 'name', 'password', 'accounts']);

			const invite = await app.ms.database.findInviteByCode(inviteCode);
			if (!invite) {
				throw new Error("invite_not_found");
			}
			if (!invite.isActive) {
				throw new Error("invite_not_active");
			}
			const joinedByInviteCount = await app.ms.database.getJoinedByInviteCount(invite.id);
			if (joinedByInviteCount >= invite.maxCount) {
				throw new Error("invite_max_count");
			}

			if (userData.accounts) {
				const selfIpnsId = await app.ms.staticId.getSelfStaticAccountId();

				userData.accounts.forEach(acc => {
					if (acc.provider === 'ethereum') {
						if (!acc.signature) {
							throw new Error("signature_required");
						}
						const isValid = ethereumAuthorization.isSignatureValid(acc.address, acc.signature, geesomeMessages.acceptInvite(selfIpnsId, inviteCode), 'message');
						if (!isValid) {
							throw Error('account_signature_not_valid');
						}
					} else {
						throw Error('not_supported_provider');
					}
				});
			}

			const user = await app.registerUser({
				...userData,
				permissions: JSON.parse(invite.permissions),
			}, invite.id);

			if (invite.limits) {
				await pIteration.forEachSeries(JSON.parse(invite.limits), (limitData) => {
					return app.setUserLimit(invite.createdById, {
						...limitData,
						userId: user.id,
					});
				});
			}

			if (invite.groupsToJoin) {
				await pIteration.forEachSeries(JSON.parse(invite.groupsToJoin), (groupId) => {
					return app.ms.group.addMemberToGroup(invite.createdById, groupId, user.id).catch(e => {/*ignore, because it's optional*/});
				});
			}

			return { user, apiKey: await app.generateUserApiKey(user.id, {type: "invite"})};
		}

		async createInvite(userId, inviteData) {
			await app.checkUserCan(userId, CorePermissionName.AdminAddUser);
			inviteData.code = commonHelpers.makeCode(16);
			inviteData.createdById = userId;
			return app.ms.database.addInvite(inviteData);
		}

		async updateInvite(userId, inviteId, inviteData) {
			await app.checkUserCan(userId, CorePermissionName.AdminAddUser);
			const invite = await app.ms.database.getInvite(inviteId);
			if (!invite) {
				throw new Error("not_found");
			}
			if (invite.createdById !== userId) {
				throw new Error("not_creator");
			}
			delete inviteData.code;
			delete inviteData.createdById;
			return app.ms.database.updateInvite(inviteId, inviteData);
		}

		async getUserInvites(userId, filters = {}, listParams?: IListParams) {
			listParams = this.prepareListParams(listParams);
			return {
				list: await app.ms.database.getUserInvites(userId, filters, listParams),
				total: await app.ms.database.getUserInvitesCount(userId, filters)
			};
		}

		prepareListParams(listParams?: IListParams): IListParams {
			return _.pick(listParams, ['sortBy', 'sortDir', 'limit', 'offset']);
		}
	}
	return new InviteModule();
}