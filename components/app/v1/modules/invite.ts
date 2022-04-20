import {IGeesomeApp, IUserInput} from "../../interface";
import {CorePermissionName} from "../../../database/interface";
const commonHelper = require('geesome-libs/src/common');
const pIteration = require('p-iteration');

module.exports = (app: IGeesomeApp) => {
	class InviteModule {
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
				return app.addMemberToGroup(invite.createdById, groupId, user.id).catch(e => {/*ignore, because it's optional*/});
			});

			return user;
		}

		async createInvite(userId, inviteData) {
			await app.checkUserCan(userId, CorePermissionName.AdminAddUser);
			inviteData.code = commonHelper.random('hash');
			inviteData.createdById = userId;
			return await app.database.addInvite(inviteData);
		}

		async updateInvite(userId, inviteId, inviteData) {
			await app.checkUserCan(userId, CorePermissionName.AdminAddUser);
			delete inviteData.code;
			delete inviteData.createdById;
			return await app.database.updateInvite(inviteId, inviteData);
		}
	}
	return new InviteModule();
}