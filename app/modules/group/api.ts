import {IGeesomeApp} from "../../interface.js";
import IGeesomeGroupModule from "./interface.js";

export default (app: IGeesomeApp, groupModule: IGeesomeGroupModule) => {

    /**
     * @api {post} /v1/group/get Get group by params
     * @apiName GroupGetByParams
     * @apiGroup Group
     *
     * @apiBody {String} name
     * @apiBody {String} storageId
     * @apiBody {String} staticStorageId
     * @apiBody {String} manifestStorageId
     * @apiBody {String} manifestStaticStorageId
     * @apiInterface (./interface.ts) {IGroupApiResponse} apiSuccess
     */
    app.ms.api.onPost('group/get', async (req, res) => {
        res.send(await groupModule.getGroupByParams(req.body), 200);
    });

    /**
     * @api {post} /v1/post/get Get post by params
     * @apiName PostGetByParams
     * @apiGroup Group
     *
     * @apiBody {Number} id
     * @apiBody {String} storageId
     * @apiBody {String} manifestStorageId
     * @apiInterface (./interface.ts) {IPostApiResponse} apiSuccess
     */
    app.ms.api.onPost('post/get', async (req, res) => {
        res.send(await groupModule.getPostByParams(req.body), 200);
    });
    
    /**
     * @api {post} /v1/user/create-group Create group
     * @apiName UserGroupCreate
     * @apiGroup UserGroup
     *
     * @apiUse ApiKey
     *
     * @apiInterface (./interface.ts) {IGroupInput} apiBody
     *
     * @apiInterface (./interface.ts) {IGroupApiResponse} apiSuccess
     */
    app.ms.api.onAuthorizedPost('user/create-group', async (req, res) => {
        res.send(await groupModule.createGroup(req.user.id, req.body), 200);
    });

    /**
     * @api {get} /v1/user/post/:postId Get user-visible post
     * @apiName UserPostGet
     * @apiGroup UserGroup
     *
     * @apiUse ApiKey
     *
     * @apiParam {String} postId Post id.
     * @apiInterface (./interface.ts) {IPostApiResponse} apiSuccess
     */
    app.ms.api.onAuthorizedGet('user/post/:postId', async (req, res) => {
        res.send(await groupModule.getPost(req.user.id, req.params.postId), 200);
    });
    
    /**
     * @api {post} /v1/user/group/:groupId/update Edit group
     * @apiDescription Can be edit by database id or storage id
     * @apiName UserGroupUpdate
     * @apiGroup UserGroup
     *
     * @apiUse ApiKey
     *
     * @apiParam {String} groupId Group database id or storage id.
     * @apiInterface (./interface.ts) {IGroupInput} apiBody
     *
     * @apiInterface (./interface.ts) {IGroupApiResponse} apiSuccess
     */
    app.ms.api.onAuthorizedPost('user/group/:groupId/update', async (req, res) => {
        res.send(await groupModule.updateGroup(req.user.id, req.params.groupId, req.body), 200);
    });

    /**
     * @api {get} /v1/user/member-in-groups Get groups where user is member
     * @apiName UserGroupsForMember
     * @apiGroup UserGroup
     *
     * @apiUse ApiKey
     *
     * @apiQuery {String} types Comma-separated group types.
     * @apiInterface (./interface.ts) {IGroupApiListResponse} apiSuccess
     */
    app.ms.api.onAuthorizedGet('user/member-in-groups', async (req, res) => {
        res.send(await groupModule.getMemberInGroups(req.user.id, req.query.types.split(',')));
    });

    /**
     * @api {get} /v1/user/admin-in-groups Get groups where user is admin
     * @apiName UserGroupsForAdmin
     * @apiGroup UserGroup
     *
     * @apiUse ApiKey
     *
     * @apiQuery {String} types Comma-separated group types.
     * @apiInterface (./interface.ts) {IGroupApiListResponse} apiSuccess
     */
    app.ms.api.onAuthorizedGet('user/admin-in-groups', async (req, res) => {
        res.send(await groupModule.getAdminInGroups(req.user.id, req.query.types.split(',')));
    });

    /**
     * @api {get} /v1/user/personal-chat-groups Get personal chat groups
     * @apiName UserGroupsAsPersonalChats
     * @apiGroup UserGroup
     *
     * @apiUse ApiKey
     *
     * @apiInterface (./interface.ts) {IGroupApiListResponse} apiSuccess
     */
    app.ms.api.onAuthorizedGet('user/personal-chat-groups', async (req, res) => {
        res.send(await groupModule.getPersonalChatGroups(req.user.id));
    });

    /**
     * @api {get} /v1/user/group/:groupId/can-create-post Check post creation permission
     * @apiName UserGroupCanCreatePost
     * @apiGroup UserGroup
     *
     * @apiUse ApiKey
     *
     * @apiParam {String} groupId Group id.
     * @apiInterface (../../interface.ts) {IValidResponse} apiSuccess
     */
    app.ms.api.onAuthorizedGet('user/group/:groupId/can-create-post', async (req, res) => {
        res.send({valid: await groupModule.canCreatePostInGroup(req.user.id, req.params.groupId)});
    });

    /**
     * @api {get} /v1/user/group/:groupId/can-edit Check group edit permission
     * @apiName UserGroupCanEdit
     * @apiGroup UserGroup
     *
     * @apiUse ApiKey
     *
     * @apiParam {String} groupId Group id.
     * @apiInterface (../../interface.ts) {IValidResponse} apiSuccess
     */
    app.ms.api.onAuthorizedGet('user/group/:groupId/can-edit', async (req, res) => {
        res.send({valid: await groupModule.canEditGroup(req.user.id, req.params.groupId)});
    });

    /**
     * @api {post} /v1/user/group/create-post Create Group post
     * @apiDescription Create post by content ids and group id.
     * @apiName UserGroupCreatePost
     * @apiGroup UserGroup
     *
     * @apiUse ApiKey
     *
     * @apiInterface (./interface.ts) {IPostInput} apiBody
     *
     * @apiInterface (./interface.ts) {IPostApiResponse} apiSuccess
     */
    app.ms.api.onAuthorizedPost('user/group/create-post', async (req, res) => {
        res.send(await groupModule.createPost(req.user.id, req.body), 200);
    });

    /**
     * @api {post} /v1/user/group/update-post/:postId Update group post
     * @apiName UserGroupUpdatePost
     * @apiGroup UserGroup
     *
     * @apiUse ApiKey
     *
     * @apiParam {String} postId Post id.
     * @apiInterface (./interface.ts) {IPostUpdateInput} apiBody
     * @apiInterface (./interface.ts) {IPostApiResponse} apiSuccess
     */
    app.ms.api.onAuthorizedPost('user/group/update-post/:postId', async (req, res) => {
        res.send(await groupModule.updatePost(req.user.id, req.params.postId, req.body), 200);
    });

    /**
     * @api {post} /v1/user/group/:groupId/is-member Check group membership
     * @apiName UserGroupIsMember
     * @apiGroup UserGroup
     *
     * @apiUse ApiKey
     *
     * @apiParam {String} groupId Group id.
     * @apiInterface (../../interface.ts) {IBooleanResultResponse} apiSuccess
     */
    app.ms.api.onAuthorizedPost('user/group/:groupId/is-member', async (req, res) => {
        res.send({result: await groupModule.isMemberInGroup(req.user.id, req.params.groupId)}, 200);
    });

    /**
     * @api {post} /v1/user/group/:groupId/join Join group
     * @apiName UserGroupJoin
     * @apiGroup UserGroup
     *
     * @apiUse ApiKey
     *
     * @apiParam {String} groupId Group id.
     */
    app.ms.api.onAuthorizedPost('user/group/:groupId/join', async (req, res) => {
        res.send(await groupModule.addMemberToGroup(req.user.id, req.params.groupId, req.user.id), 200);
    });

    /**
     * @api {post} /v1/user/group/:groupId/leave Leave group
     * @apiName UserGroupLeave
     * @apiGroup UserGroup
     *
     * @apiUse ApiKey
     *
     * @apiParam {String} groupId Group id.
     */
    app.ms.api.onAuthorizedPost('user/group/:groupId/leave', async (req, res) => {
        res.send(await groupModule.removeMemberFromGroup(req.user.id, req.params.groupId, req.user.id), 200);
    });

    /**
     * @api {post} /v1/user/group/:groupId/add-admin Add group admin
     * @apiName UserGroupAddAdmin
     * @apiGroup UserGroupAdmin
     *
     * @apiUse ApiKey
     *
     * @apiParam {String} groupId Group id.
     * @apiInterface (./interface.ts) {IGroupUserInput} apiBody
     */
    app.ms.api.onAuthorizedPost('user/group/:groupId/add-admin', async (req, res) => {
        res.send(await groupModule.addAdminToGroup(req.user.id, req.params.groupId, req.body.userId), 200);
    });

    /**
     * @api {post} /v1/user/group/:groupId/remove-admin Remove group admin
     * @apiName UserGroupRemoveAdmin
     * @apiGroup UserGroupAdmin
     *
     * @apiUse ApiKey
     *
     * @apiParam {String} groupId Group id.
     * @apiInterface (./interface.ts) {IGroupUserInput} apiBody
     */
    app.ms.api.onAuthorizedPost('user/group/:groupId/remove-admin', async (req, res) => {
        res.send(await groupModule.removeAdminFromGroup(req.user.id, req.params.groupId, req.body.userId), 200);
    });

    /**
     * @api {post} /v1/user/group/:groupId/set-admins Set group admins
     * @apiName UserGroupSetAdmins
     * @apiGroup UserGroupAdmin
     *
     * @apiUse ApiKey
     *
     * @apiParam {String} groupId Group id.
     * @apiInterface (./interface.ts) {IGroupUserListInput} apiBody
     */
    app.ms.api.onAuthorizedPost('user/group/:groupId/set-admins', async (req, res) => {
        res.send(await groupModule.setAdminsOfGroup(req.user.id, req.params.groupId, req.body.userIds), 200);
    });

    /**
     * @api {post} /v1/user/group/:groupId/add-member Add group member
     * @apiName UserGroupAddMember
     * @apiGroup UserGroupMember
     *
     * @apiUse ApiKey
     *
     * @apiParam {String} groupId Group id.
     * @apiInterface (./interface.ts) {IGroupUserInput} apiBody
     */
    app.ms.api.onAuthorizedPost('user/group/:groupId/add-member', async (req, res) => {
        res.send(await groupModule.addMemberToGroup(req.user.id, req.params.groupId, req.body.userId, req.body.permissions || []), 200);
    });

    /**
     * @api {post} /v1/user/group/:groupId/set-members Set group members
     * @apiName UserGroupSetMembers
     * @apiGroup UserGroupMember
     *
     * @apiUse ApiKey
     *
     * @apiParam {String} groupId Group id.
     * @apiInterface (./interface.ts) {IGroupUserListInput} apiBody
     */
    app.ms.api.onAuthorizedPost('user/group/:groupId/set-members', async (req, res) => {
        res.send(await groupModule.setMembersOfGroup(req.user.id, req.params.groupId, req.body.userIds), 200);
    });

    /**
     * @api {post} /v1/user/group/:groupId/set-permissions Set group member permissions
     * @apiName UserGroupSetPermissions
     * @apiGroup UserGroupMember
     *
     * @apiUse ApiKey
     *
     * @apiParam {String} groupId Group id.
     * @apiInterface (./interface.ts) {IGroupPermissionInput} apiBody
     */
    app.ms.api.onAuthorizedPost('user/group/:groupId/set-permissions', async (req, res) => {
        res.send(await groupModule.setGroupPermissions(req.user.id, req.params.groupId, req.body.userId, req.body.permissions), 200);
    });

    /**
     * @api {post} /v1/user/group/:groupId/remove-member Remove group member
     * @apiName UserGroupRemoveMember
     * @apiGroup UserGroupMember
     *
     * @apiUse ApiKey
     *
     * @apiParam {String} groupId Group id.
     * @apiInterface (./interface.ts) {IGroupUserInput} apiBody
     */
    app.ms.api.onAuthorizedPost('user/group/:groupId/remove-member', async (req, res) => {
        res.send(await groupModule.removeMemberFromGroup(req.user.id, req.params.groupId, req.body.userId), 200);
    });

    /**
     * @api {get} /v1/user/group/unread/:groupId Get unread group posts data
     * @apiName UserGroupUnread
     * @apiGroup UserGroup
     *
     * @apiUse ApiKey
     *
     * @apiParam {String} groupId Group id.
     * @apiInterface (./interface.ts) {IGroupUnreadResponse} apiSuccess
     */
    app.ms.api.onAuthorizedGet('user/group/unread/:groupId', async (req, res) => {
        res.send(await groupModule.getGroupUnreadPostsData(req.user.id, req.params.groupId), 200);
    });

    /**
     * @api {post} /v1/user/group/set-read Mark group as read
     * @apiName UserGroupSetRead
     * @apiGroup UserGroup
     *
     * @apiUse ApiKey
     *
     * @apiInterface (./interface.ts) {IGroupReadInput} apiBody
     */
    app.ms.api.onAuthorizedPost('user/group/set-read', async (req, res) => {
        res.send(await groupModule.addOrUpdateGroupRead(req.user.id, req.body), 200);
    });

    /**
     * @api {get} /v1/admin/all-groups List all groups
     * @apiName AdminAllGroups
     * @apiGroup AdminGroup
     *
     * @apiUse ApiKey
     *
     * @apiInterface (../../interface.ts) {IListQueryInput} apiQuery
     * @apiInterface (./interface.ts) {IGroupApiListResponse} apiSuccess
     */
    app.ms.api.onAuthorizedGet('admin/all-groups', async (req, res) => {
        res.send(await groupModule.getAllGroupList(req.user.id, req.query.search, req.query));
    });

    /**
     * @api {get} /v1/group/:groupId/posts Get group posts
     * @apiName GroupPosts
     * @apiGroup Group
     *
     * @apiUse ApiKey
     *
     * @apiParam {String} groupId Group database id or storage id.
     * @apiQuery {String} sortBy
     * @apiQuery {String} sortDir
     * @apiQuery {Number} limit
     * @apiQuery {Number} offset
     *
     * @apiInterface (./interface.ts) {IPostApiListResponse} apiSuccess
     */
    app.ms.api.onGet('group/:groupId/posts', async (req, res) => {
        res.send(await groupModule.getGroupPosts(req.params.groupId, req.query, req.query));
    });

    /**
     * @api {get} /v1/group/:groupId/peers Get group peers
     * @apiName GroupPeers
     * @apiGroup Group
     *
     * @apiParam {String} groupId Group id.
     * @apiSuccess {Object[]} list Group peer data.
     */
    app.ms.api.onGet('group/:groupId/peers', async (req, res) => {
        res.send(await groupModule.getGroupPeers(req.params.groupId));
    });

    /**
     * @api {get} /v1/user/get-friends List user friends
     * @apiName UserFriends
     * @apiGroup UserFriend
     *
     * @apiUse ApiKey
     *
     * @apiInterface (../../interface.ts) {IListQueryInput} apiQuery
     * @apiSuccess {Object[]} list Friend users.
     */
    app.ms.api.onAuthorizedGet('user/get-friends', async (req, res) => {
        res.send(await groupModule.getUserFriends(req.user.id, req.query.search, req.query));
    });

    /**
     * @api {post} /v1/user/add-friend Add friend
     * @apiName UserAddFriend
     * @apiGroup UserFriend
     *
     * @apiUse ApiKey
     *
     * @apiInterface (./interface.ts) {IUserFriendInput} apiBody
     */
    app.ms.api.onAuthorizedPost('user/add-friend', async (req, res) => {
        res.send(await groupModule.addUserFriendById(req.user.id, req.body.friendId));
    });

    /**
     * @api {post} /v1/user/remove-friend Remove friend
     * @apiName UserRemoveFriend
     * @apiGroup UserFriend
     *
     * @apiUse ApiKey
     *
     * @apiInterface (./interface.ts) {IUserFriendInput} apiBody
     */
    app.ms.api.onAuthorizedPost('user/remove-friend', async (req, res) => {
        res.send(await groupModule.addUserFriendById(req.user.id, req.body.friendId));
    });
};
