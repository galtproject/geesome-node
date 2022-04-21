import {IGeesomeApp, IGeesomeInviteModule, IUserInput} from "../../interface";
import {CorePermissionName, IListParams} from "../../../database/interface";
const commonHelper = require('geesome-libs/src/common');
const pIteration = require('p-iteration');
const _ = require('lodash');

module.exports = (app: IGeesomeApp) => {
	app.checkModules(['group']);

	class InviteModule implements IGeesomeInviteModule {
		public async registerUserByInviteCode(inviteCode, userData: IUserInput): Promise<any> {
			const invite = await app.database.findInviteByCode(inviteCode);
			if (!invite) {
				throw new Error("invite_not_found");
			}
			if (!invite.isActive) {
				throw new Error("invite_not_active");
			}
			const joinedByInviteCount = await app.database.getJoinedByInviteCount(invite.id);
			console.log('joinedByInviteCount', joinedByInviteCount);
			console.log('invite.maxCount', invite.maxCount);
			if (joinedByInviteCount >= invite.maxCount) {
				throw new Error("invite_max_count");
			}

			const user = await app.registerUser({
				...userData,
				permissions: JSON.parse(invite.permissions),
			}, invite.id);

			await pIteration.forEachSeries(JSON.parse(invite.limits), (limitData) => {
				return app.setUserLimit(invite.createdById, {
					...limitData,
					userId: user.id,
				});
			});

			await pIteration.forEachSeries(JSON.parse(invite.groupsToJoin), (groupId) => {
				return app.ms.group.addMemberToGroup(invite.createdById, groupId, user.id).catch(e => {/*ignore, because it's optional*/});
			});

			return user;
		}

		async createInvite(userId, inviteData) {
			await app.checkUserCan(userId, CorePermissionName.AdminAddUser);
			inviteData.code = this.makeCode(16);
			inviteData.createdById = userId;
			return app.database.addInvite(inviteData);
		}

		makeCode(length) {
			let chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
			let res = '';
			for (let i = 0; i < length; i++) {
				res += chars.charAt(Math.floor(Math.random() * chars.length));
			}
			return res;
		}

		async updateInvite(userId, inviteId, inviteData) {
			await app.checkUserCan(userId, CorePermissionName.AdminAddUser);
			const invite = await app.database.getInvite(inviteId);
			if (!invite) {
				throw new Error("not_found");
			}
			if (invite.createdById !== userId) {
				throw new Error("not_creator");
			}
			delete inviteData.code;
			delete inviteData.createdById;
			return app.database.updateInvite(inviteId, inviteData);
		}

		async getUserInvites(userId, filters = {}, listParams?: IListParams) {
			listParams = this.prepareListParams(listParams);
			return {
				list: await app.database.getUserInvites(userId, filters, listParams),
				total: await app.database.getUserInvitesCount(userId, filters)
			};
		}

		prepareListParams(listParams?: IListParams): IListParams {
			return _.pick(listParams, ['sortBy', 'sortDir', 'limit', 'offset']);
		}
	}
	return new InviteModule();
}