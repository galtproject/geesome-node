import {IGeesomeApp, IGeesomeGroupCategoryModule} from "../../../interface";

module.exports = (app: IGeesomeApp, groupCategoryModule: IGeesomeGroupCategoryModule) => {

    app.ms.api.onPost('category/get', async (req, res) => {
        res.send(await groupCategoryModule.getCategoryByParams(req.body), 200);
    });

    app.ms.api.onGet('category/:categoryId/posts', async (req, res) => {
        res.send(await groupCategoryModule.getCategoryPosts(req.params.categoryId, req.query, req.query));
    });

    app.ms.api.onAuthorizedPost('user/create-category', async (req, res) => {
        res.send(await groupCategoryModule.createCategory(req.user.id, req.body), 200);
    });

    app.ms.api.onAuthorizedGet('user/category/:categoryId/groups', async (req, res) => {
        res.send(await groupCategoryModule.getCategoryGroups(req.user.id, req.params.categoryId, req.query, req.query), 200);
    });

    app.ms.api.onAuthorizedPost('user/category/:categoryId/add-group', async (req, res) => {
        res.send(await groupCategoryModule.addGroupToCategory(req.user.id, req.body.groupId, req.params.categoryId), 200);
    });

    app.ms.api.onAuthorizedPost('user/category/:categoryId/add-member', async (req, res) => {
        res.send(await groupCategoryModule.addMemberToCategory(req.user.id, req.params.categoryId, req.body.userId, req.body.permissions || []), 200);
    });

    app.ms.api.onAuthorizedPost('user/category/:categoryId/remove-member', async (req, res) => {
        res.send(await groupCategoryModule.removeMemberFromCategory(req.user.id, req.params.categoryId, req.body.userId), 200);
    });

    app.ms.api.onAuthorizedPost('user/category/:categoryId/is-member', async (req, res) => {
        res.send({result: await groupCategoryModule.isMemberInCategory(req.user.id, req.params.categoryId)}, 200);
    });

    app.ms.api.onAuthorizedPost('user/group-section/create', async (req, res) => {
        res.send(await groupCategoryModule.createGroupSection(req.user.id, req.body), 200);
    });

    app.ms.api.onAuthorizedPost('user/group-section/:groupSectionId/update', async (req, res) => {
        res.send(await groupCategoryModule.updateGroupSection(req.user.id, req.params.groupSectionId, req.body), 200);
    });

    app.ms.api.onAuthorizedGet('user/group-sections', async (req, res) => {
        res.send(await groupCategoryModule.getGroupSectionItems(req.query, req.query), 200);
    });
};