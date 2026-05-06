import assert from "assert";
import registerGroupApi from "../app/modules/group/api.js";
import IGeesomeGroupModule from "../app/modules/group/interface.js";

function createGroupApiHarness(groupModule: Partial<IGeesomeGroupModule>) {
	const routes = {};
	const app = {
		ms: {
			api: {
				onAuthorizedPost: (path, handler) => {
					routes[`POST ${path}`] = handler;
				},
				onAuthorizedGet: (path, handler) => {
					routes[`GET ${path}`] = handler;
				},
				onPost: (path, handler) => {
					routes[`POST ${path}`] = handler;
				},
				onGet: (path, handler) => {
					routes[`GET ${path}`] = handler;
				}
			}
		}
	};

	registerGroupApi(app as any, groupModule as IGeesomeGroupModule);

	return {
		async call(method, path, req = {}) {
			let responseBody;
			await routes[`${method} ${path}`]({
				user: {id: 1},
				body: {},
				params: {},
				query: {types: "channel,chat"},
				...req
			}, {
				send: (body) => {
					responseBody = body;
				}
			});
			return responseBody;
		}
	};
}

describe("group api ownership controls", function () {
	it("uses the authenticated user for self-service group membership routes", async () => {
		const calls = [];
		const {call} = createGroupApiHarness({
			addMemberToGroup: async (...args) => {
				calls.push(["addMemberToGroup", ...args]);
				return {ok: true};
			},
			removeMemberFromGroup: async (...args) => {
				calls.push(["removeMemberFromGroup", ...args]);
				return {ok: true};
			}
		});

		await call("POST", "user/group/:groupId/join", {
			user: {id: 7},
			params: {groupId: 11},
			body: {userId: 999, memberId: 999}
		});
		await call("POST", "user/group/:groupId/leave", {
			user: {id: 7},
			params: {groupId: 11},
			body: {userId: 999, memberId: 999}
		});

		assert.deepEqual(calls, [
			["addMemberToGroup", 7, 11, 7],
			["removeMemberFromGroup", 7, 11, 7]
		]);
	});

	it("uses the authenticated user as actor for group admin and member mutations", async () => {
		const calls = [];
		const groupModule = {
			addAdminToGroup: async (...args) => calls.push(["addAdminToGroup", ...args]),
			removeAdminFromGroup: async (...args) => calls.push(["removeAdminFromGroup", ...args]),
			setAdminsOfGroup: async (...args) => calls.push(["setAdminsOfGroup", ...args]),
			addMemberToGroup: async (...args) => calls.push(["addMemberToGroup", ...args]),
			setMembersOfGroup: async (...args) => calls.push(["setMembersOfGroup", ...args]),
			setGroupPermissions: async (...args) => calls.push(["setGroupPermissions", ...args]),
			removeMemberFromGroup: async (...args) => calls.push(["removeMemberFromGroup", ...args])
		};
		const {call} = createGroupApiHarness(groupModule);

		await call("POST", "user/group/:groupId/add-admin", {user: {id: 7}, params: {groupId: 11}, body: {userId: 21}});
		await call("POST", "user/group/:groupId/remove-admin", {user: {id: 7}, params: {groupId: 11}, body: {userId: 22}});
		await call("POST", "user/group/:groupId/set-admins", {user: {id: 7}, params: {groupId: 11}, body: {userIds: [23]}});
		await call("POST", "user/group/:groupId/add-member", {user: {id: 7}, params: {groupId: 11}, body: {userId: 24, permissions: ["group:edit_general"]}});
		await call("POST", "user/group/:groupId/set-members", {user: {id: 7}, params: {groupId: 11}, body: {userIds: [25]}});
		await call("POST", "user/group/:groupId/set-permissions", {user: {id: 7}, params: {groupId: 11}, body: {userId: 26, permissions: ["group:edit_general"]}});
		await call("POST", "user/group/:groupId/remove-member", {user: {id: 7}, params: {groupId: 11}, body: {userId: 27}});

		assert.deepEqual(calls, [
			["addAdminToGroup", 7, 11, 21],
			["removeAdminFromGroup", 7, 11, 22],
			["setAdminsOfGroup", 7, 11, [23]],
			["addMemberToGroup", 7, 11, 24, ["group:edit_general"]],
			["setMembersOfGroup", 7, 11, [25]],
			["setGroupPermissions", 7, 11, 26, ["group:edit_general"]],
			["removeMemberFromGroup", 7, 11, 27]
		]);
	});

	it("uses the authenticated user as actor for group and post writes", async () => {
		const calls = [];
		const {call} = createGroupApiHarness({
			updateGroup: async (...args) => calls.push(["updateGroup", ...args]),
			createPost: async (...args) => calls.push(["createPost", ...args]),
			updatePost: async (...args) => calls.push(["updatePost", ...args]),
			addOrUpdateGroupRead: async (...args) => calls.push(["addOrUpdateGroupRead", ...args])
		});

		await call("POST", "user/group/:groupId/update", {user: {id: 7}, params: {groupId: 11}, body: {userId: 999, title: "updated"}});
		await call("POST", "user/group/create-post", {user: {id: 7}, body: {userId: 999, groupId: 11, text: "post"}});
		await call("POST", "user/group/update-post/:postId", {user: {id: 7}, params: {postId: 31}, body: {userId: 999, text: "edited"}});
		await call("POST", "user/group/set-read", {user: {id: 7}, body: {userId: 999, groupId: 11}});

		assert.deepEqual(calls, [
			["updateGroup", 7, 11, {userId: 999, title: "updated"}],
			["createPost", 7, {userId: 999, groupId: 11, text: "post"}],
			["updatePost", 7, 31, {userId: 999, text: "edited"}],
			["addOrUpdateGroupRead", 7, {userId: 999, groupId: 11}]
		]);
	});

	it("uses the authenticated user for friend add and remove routes", async () => {
		const calls = [];
		const {call} = createGroupApiHarness({
			addUserFriendById: async (...args) => calls.push(["addUserFriendById", ...args]),
			removeUserFriendById: async (...args) => calls.push(["removeUserFriendById", ...args])
		});

		await call("POST", "user/add-friend", {user: {id: 7}, body: {userId: 999, friendId: 44}});
		await call("POST", "user/remove-friend", {user: {id: 7}, body: {userId: 999, friendId: 44}});

		assert.deepEqual(calls, [
			["addUserFriendById", 7, 44],
			["removeUserFriendById", 7, 44]
		]);
	});
});
