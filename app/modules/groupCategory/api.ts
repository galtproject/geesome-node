import {IGeesomeApp} from "../../interface.js";
import IGeesomeGroupCategoryModule from "./interface.js";

export default (app: IGeesomeApp, groupCategoryModule: IGeesomeGroupCategoryModule) => {

    /**
     * @api {post} /v1/category/get Get category by params
     * @apiName CategoryGetByParams
     * @apiGroup Category
     *
     * @apiBody {String} name
     * @apiBody {String} storageId
     * @apiBody {String} staticStorageId
     * @apiBody {String} manifestStorageId
     * @apiBody {String} manifestStaticStorageId
     * @apiInterface (./interface.ts) {IGroupCategoryApiResponse} apiSuccess
     */
    app.ms.api.onPost('category/get', async (req, res) => {
        res.send(await groupCategoryModule.getCategoryByParams(req.body), 200);
    });

    /**
     * @api {get} /v1/category/:categoryId/posts Get category posts
     * @apiName CategoryPosts
     * @apiGroup Category
     *
     * @apiParam {String} categoryId Category id.
     * @apiInterface (../../interface.ts) {IListQueryInput} apiQuery
     * @apiInterface (../group/interface.ts) {IPostApiListResponse} apiSuccess
     */
    app.ms.api.onGet('category/:categoryId/posts', async (req, res) => {
        res.send(await groupCategoryModule.getCategoryPosts(req.params.categoryId, req.query, req.query));
    });

    /**
     * @api {post} /v1/user/create-category Create category
     * @apiName UserCreateCategory
     * @apiGroup UserCategory
     *
     * @apiUse ApiKey
     *
     * @apiInterface (./interface.ts) {IGroupCategoryInput} apiBody
     * @apiInterface (./interface.ts) {IGroupCategoryApiResponse} apiSuccess
     */
    app.ms.api.onAuthorizedPost('user/create-category', async (req, res) => {
        res.send(await groupCategoryModule.createCategory(req.user.id, req.body), 200);
    });

    /**
     * @api {get} /v1/user/category/:categoryId/groups Get category groups
     * @apiName UserCategoryGroups
     * @apiGroup UserCategory
     *
     * @apiUse ApiKey
     *
     * @apiParam {String} categoryId Category id.
     * @apiInterface (../../interface.ts) {IListQueryInput} apiQuery
     * @apiInterface (../group/interface.ts) {IGroupApiListResponse} apiSuccess
     */
    app.ms.api.onAuthorizedGet('user/category/:categoryId/groups', async (req, res) => {
        res.send(await groupCategoryModule.getCategoryGroups(req.user.id, req.params.categoryId, req.query, req.query), 200);
    });

    /**
     * @api {post} /v1/user/category/:categoryId/add-group Add group to category
     * @apiName UserCategoryAddGroup
     * @apiGroup UserCategory
     *
     * @apiUse ApiKey
     *
     * @apiParam {String} categoryId Category id.
     * @apiInterface (./interface.ts) {ICategoryGroupInput} apiBody
     */
    app.ms.api.onAuthorizedPost('user/category/:categoryId/add-group', async (req, res) => {
        res.send(await groupCategoryModule.addGroupToCategory(req.user.id, req.body.groupId, req.params.categoryId), 200);
    });

    /**
     * @api {post} /v1/user/category/:categoryId/add-member Add category member
     * @apiName UserCategoryAddMember
     * @apiGroup UserCategory
     *
     * @apiUse ApiKey
     *
     * @apiParam {String} categoryId Category id.
     * @apiInterface (./interface.ts) {ICategoryMemberInput} apiBody
     */
    app.ms.api.onAuthorizedPost('user/category/:categoryId/add-member', async (req, res) => {
        res.send(await groupCategoryModule.addMemberToCategory(req.user.id, req.params.categoryId, req.body.userId, req.body.permissions || []), 200);
    });

    /**
     * @api {post} /v1/user/category/:categoryId/remove-member Remove category member
     * @apiName UserCategoryRemoveMember
     * @apiGroup UserCategory
     *
     * @apiUse ApiKey
     *
     * @apiParam {String} categoryId Category id.
     * @apiInterface (./interface.ts) {ICategoryMemberInput} apiBody
     */
    app.ms.api.onAuthorizedPost('user/category/:categoryId/remove-member', async (req, res) => {
        res.send(await groupCategoryModule.removeMemberFromCategory(req.user.id, req.params.categoryId, req.body.userId), 200);
    });

    /**
     * @api {post} /v1/user/category/:categoryId/is-member Check category membership
     * @apiName UserCategoryIsMember
     * @apiGroup UserCategory
     *
     * @apiUse ApiKey
     *
     * @apiParam {String} categoryId Category id.
     * @apiInterface (../../interface.ts) {IBooleanResultResponse} apiSuccess
     */
    app.ms.api.onAuthorizedPost('user/category/:categoryId/is-member', async (req, res) => {
        res.send({result: await groupCategoryModule.isMemberInCategory(req.user.id, req.params.categoryId)}, 200);
    });

    /**
     * @api {post} /v1/user/group-section/create Create group section
     * @apiName UserGroupSectionCreate
     * @apiGroup UserCategory
     *
     * @apiUse ApiKey
     *
     * @apiInterface (./interface.ts) {IGroupSectionInput} apiBody
     * @apiInterface (./interface.ts) {IGroupSectionApiResponse} apiSuccess
     */
    app.ms.api.onAuthorizedPost('user/group-section/create', async (req, res) => {
        res.send(await groupCategoryModule.createGroupSection(req.user.id, req.body), 200);
    });

    /**
     * @api {post} /v1/user/group-section/:groupSectionId/update Update group section
     * @apiName UserGroupSectionUpdate
     * @apiGroup UserCategory
     *
     * @apiUse ApiKey
     *
     * @apiParam {String} groupSectionId Group section id.
     * @apiInterface (./interface.ts) {IGroupSectionInput} apiBody
     * @apiInterface (./interface.ts) {IGroupSectionApiResponse} apiSuccess
     */
    app.ms.api.onAuthorizedPost('user/group-section/:groupSectionId/update', async (req, res) => {
        res.send(await groupCategoryModule.updateGroupSection(req.user.id, req.params.groupSectionId, req.body), 200);
    });

    /**
     * @api {post} /v1/user/group/:groupId/add-to-section/:groupSectionId Add group to section
     * @apiName UserGroupAddToSection
     * @apiGroup UserCategory
     *
     * @apiUse ApiKey
     *
     * @apiParam {String} groupId Group id.
     * @apiParam {String} groupSectionId Group section id.
     */
    app.ms.api.onAuthorizedPost('user/group/:groupId/add-to-section/:groupSectionId', async (req, res) => {
        res.send(await groupCategoryModule.setSectionOfGroup(req.user.id, req.params.groupId, req.params.groupSectionId), 200);
    });

    /**
     * @api {get} /v1/user/group-sections List group sections
     * @apiName UserGroupSections
     * @apiGroup UserCategory
     *
     * @apiUse ApiKey
     *
     * @apiInterface (../../interface.ts) {IListQueryInput} apiQuery
     * @apiInterface (./interface.ts) {IGroupSectionApiListResponse} apiSuccess
     */
    app.ms.api.onAuthorizedGet('user/group-sections', async (req, res) => {
        res.send(await groupCategoryModule.getGroupSectionItems(req.query, req.query), 200);
    });
};
