import {IGeesomeApp} from "../../interface";
import IGeesomeGroupModule from "./interface";

module.exports = (app: IGeesomeApp, groupModule: IGeesomeGroupModule) => {

    app.ms.api.onPost('group/get', async (req, res) => {
        res.send(await groupModule.getGroupByParams(req.body), 200);
    });

    app.ms.api.onPost('post/get', async (req, res) => {
        res.send(await groupModule.getPostByParams(req.body), 200);
    });
    
    /**
     * @api {post} user/create-group Create group
     * @apiName UserGroupCreate
     * @apiGroup UserGroup
     *
     * @apiUse ApiKey
     *
     * @apiInterface (../../app/interface.ts) {IGroupInput} apiParam
     *
     * @apiInterface (../../database/interface.ts) {IGroup} apiSuccess
     */
    app.ms.api.onAuthorizedPost('user/create-group', async (req, res) => {
        res.send(await groupModule.createGroup(req.user.id, req.body), 200);
    });

    app.ms.api.onAuthorizedGet('user/post/:postId', async (req, res) => {
        res.send(await groupModule.getPost(req.user.id, req.params.postId), 200);
    });
    
    /**
     * @api {post} user/group/:groupId/update Edit group
     * @apiDescription Can be edit by database id or storage id
     * @apiName UserGroupUpdate
     * @apiGroup UserGroup
     *
     * @apiUse ApiKey
     *
     * @apiInterface (../../app/interface.ts) {IGroupInput} apiParam
     *
     * @apiInterface (../../database/interface.ts) {IGroup} apiSuccess
     */
    app.ms.api.onAuthorizedPost('user/group/:groupId/update', async (req, res) => {
        res.send(await groupModule.updateGroup(req.user.id, req.params.groupId, req.body), 200);
    });

    /**
     * @api {get} user/member-in-groups Get groups where user is member
     * @apiName UserGroupsForMember
     * @apiGroup UserGroup
     *
     * @apiUse ApiKey
     *
     * @apiInterface (../../app/interface.ts) {IGroupListResponse} apiSuccess
     */
    app.ms.api.onAuthorizedGet('user/member-in-groups', async (req, res) => {
        res.send(await groupModule.getMemberInGroups(req.user.id, req.query.types.split(',')));
    });

    /**
     * @api {get} user/admin-in-groups Get groups where user is admin
     * @apiName UserGroupsForAdmin
     * @apiGroup UserGroup
     *
     * @apiUse ApiKey
     *
     * @apiInterface (../../app/interface.ts) {IGroupListResponse} apiSuccess
     */
    app.ms.api.onAuthorizedGet('user/admin-in-groups', async (req, res) => {
        res.send(await groupModule.getAdminInGroups(req.user.id, req.query.types.split(',')));
    });

    /**
     * @api {get} user/personal-chat-groups Get personal chat groups
     * @apiName UserGroupsAsPersonalChats
     * @apiGroup UserGroup
     *
     * @apiUse ApiKey
     *
     * @apiInterface (../../app/interface.ts) {IGroupListResponse} apiSuccess
     */
    app.ms.api.onAuthorizedGet('user/personal-chat-groups', async (req, res) => {
        res.send(await groupModule.getPersonalChatGroups(req.user.id));
    });

    app.ms.api.onAuthorizedGet('user/group/:groupId/can-create-post', async (req, res) => {
        res.send({valid: await groupModule.canCreatePostInGroup(req.user.id, req.params.groupId)});
    });

    app.ms.api.onAuthorizedGet('user/group/:groupId/can-edit', async (req, res) => {
        res.send({valid: await groupModule.canEditGroup(req.user.id, req.params.groupId)});
    });

    /**
     * @api {post} user/group/:groupId/create-post Create Group post
     * @apiDescription Create post by content ids and group id.
     * @apiName UserGroupCreatePost
     * @apiGroup UserGroup
     *
     * @apiUse ApiKey
     *
     * @apiInterface (../../app/interface.ts) {IPostInput} apiParam
     *
     * @apiInterface (../../database/interface.ts) {IPost} apiSuccess
     */
    app.ms.api.onAuthorizedPost('user/group/create-post', async (req, res) => {
        res.send(await groupModule.createPost(req.user.id, req.body), 200);
    });

    app.ms.api.onAuthorizedPost('user/group/update-post/:postId', async (req, res) => {
        res.send(await groupModule.updatePost(req.user.id, req.params.postId, req.body), 200);
    });

    app.ms.api.onAuthorizedPost('user/group/:groupId/is-member', async (req, res) => {
        res.send({result: await groupModule.isMemberInGroup(req.user.id, req.params.groupId)}, 200);
    });

    app.ms.api.onAuthorizedPost('user/group/:groupId/join', async (req, res) => {
        res.send(await groupModule.addMemberToGroup(req.user.id, req.params.groupId, req.user.id), 200);
    });

    app.ms.api.onAuthorizedPost('user/group/:groupId/leave', async (req, res) => {
        res.send(await groupModule.removeMemberFromGroup(req.user.id, req.params.groupId, req.user.id), 200);
    });

    app.ms.api.onAuthorizedPost('user/group/:groupId/add-admin', async (req, res) => {
        res.send(await groupModule.addAdminToGroup(req.user.id, req.params.groupId, req.body.userId), 200);
    });

    app.ms.api.onAuthorizedPost('user/group/:groupId/remove-admin', async (req, res) => {
        res.send(await groupModule.removeAdminFromGroup(req.user.id, req.params.groupId, req.body.userId), 200);
    });

    app.ms.api.onAuthorizedPost('user/group/:groupId/set-admins', async (req, res) => {
        res.send(await groupModule.setAdminsOfGroup(req.user.id, req.params.groupId, req.body.userIds), 200);
    });

    app.ms.api.onAuthorizedPost('user/group/:groupId/add-member', async (req, res) => {
        res.send(await groupModule.addMemberToGroup(req.user.id, req.params.groupId, req.body.userId, req.body.permissions || []), 200);
    });

    app.ms.api.onAuthorizedPost('user/group/:groupId/set-members', async (req, res) => {
        res.send(await groupModule.setMembersOfGroup(req.user.id, req.params.groupId, req.body.userIds), 200);
    });

    app.ms.api.onAuthorizedPost('user/group/:groupId/set-permissions', async (req, res) => {
        res.send(await groupModule.setGroupPermissions(req.user.id, req.params.groupId, req.body.userId, req.body.permissions), 200);
    });

    app.ms.api.onAuthorizedPost('user/group/:groupId/remove-member', async (req, res) => {
        res.send(await groupModule.removeMemberFromGroup(req.user.id, req.params.groupId, req.body.userId), 200);
    });

    app.ms.api.onAuthorizedGet('user/group/unread/:groupId', async (req, res) => {
        res.send(await groupModule.getGroupUnreadPostsData(req.user.id, req.params.groupId), 200);
    });

    app.ms.api.onAuthorizedPost('user/group/set-read', async (req, res) => {
        res.send(await groupModule.addOrUpdateGroupRead(req.user.id, req.body), 200);
    });

    app.ms.api.onAuthorizedGet('admin/all-groups', async (req, res) => {
        res.send(await groupModule.getAllGroupList(req.user.id, req.query.search, req.query));
    });

    /**
     * @api {get} group/:groupId/posts Get group posts
     * @apiName GroupPosts
     * @apiGroup Group
     *
     * @apiUse ApiKey
     *
     * @apiParam sortBy
     * @apiParam sortDir
     * @apiParam limit
     * @apiParam offset
     *
     * @apiInterface (../../app/interface.ts) {IPostListResponse} apiSuccess
     */
    app.ms.api.onGet('group/:groupId/posts', async (req, res) => {
        res.send(await groupModule.getGroupPosts(req.params.groupId, req.query, req.query));
    });

    app.ms.api.onGet('group/:groupId/peers', async (req, res) => {
        res.send(await groupModule.getGroupPeers(req.params.groupId));
    });

    app.ms.api.onAuthorizedGet('user/get-friends', async (req, res) => {
        res.send(await groupModule.getUserFriends(req.user.id, req.query.search, req.query));
    });

    app.ms.api.onAuthorizedPost('user/add-friend', async (req, res) => {
        res.send(await groupModule.addUserFriendById(req.user.id, req.body.friendId));
    });

    app.ms.api.onAuthorizedPost('user/remove-friend', async (req, res) => {
        res.send(await groupModule.addUserFriendById(req.user.id, req.body.friendId));
    });
};