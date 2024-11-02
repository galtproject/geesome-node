import {IGeesomeApp} from "../../interface";
import {
	CorePermissionName,
	IListParams
} from "../database/interface";
import IGeesomeGroupCategoryModule, {IGroupCategory, IGroupSection} from "./interface";
import {GroupType} from "../group/interface";
const _ = require('lodash');
const pIteration = require('p-iteration');

module.exports = async (app: IGeesomeApp) => {
	const commonHelper = (await import("geesome-libs/src/common.js")).default;
	app.checkModules(['database', 'staticId', 'group']);

	const {sequelize, models} = app.ms.database;
	const module = getModule(app, await require('./models')(sequelize, models));
	require('./api')(app, module);
	return module;
	function getModule(app: IGeesomeApp, models) {

		class GroupCategoryModule implements IGeesomeGroupCategoryModule {

			async canAddGroupToCategory(userId, categoryId) {
				if (!categoryId) {
					return false;
				}
				categoryId = await this.checkCategoryId(categoryId);
				return this.isAdminInCategory(userId, categoryId);
			}

			async canEditCategory(userId, categoryId) {
				if (!categoryId) {
					return false;
				}
				categoryId = await this.checkCategoryId(categoryId);
				return this.isAdminInCategory(userId, categoryId);
			}

			async checkCategoryId(categoryId, createIfNotExist = true) {
				if (categoryId == 'null' || categoryId == 'undefined') {
					return null;
				}
				if (!categoryId || _.isUndefined(categoryId)) {
					return null;
				}
				if (!commonHelper.isNumber(categoryId)) {
					let group = await this.getCategoryByManifestId(categoryId, categoryId);
					if (!group && createIfNotExist) {
						// TODO: create category by remote storage id
						return null;
						// group = await this.createGroupByRemoteStorageId(categoryId);
						// return group.id;
					} else if (group) {
						categoryId = group.id;
					}
				}
				return categoryId;
			}

			async getCategoryByManifestId(groupId, staticId) {
				if (!staticId) {
					const historyItem = await app.ms.staticId.getStaticIdItemByDynamicId(groupId);
					if (historyItem) {
						staticId = historyItem.staticId;
					}
				}
				return this.getCategoryByParams({
					manifestStaticStorageId: staticId
				});
			}

			async getCategoryPosts(categoryId, filters = {}, listParams?: IListParams) {
				listParams = this.prepareListParams(listParams);
				app.ms.database.setDefaultListParamsValues(listParams, {sortBy: 'publishedAt'});

				const {limit, offset, sortBy, sortDir} = listParams;
				return {
					list: await models.Post.findAll({
						where: app.ms.group.getPostsWhere(filters),
						include: [
							{association: 'contents'},
							{
								association: 'group', required: true,
								include: [{association: 'categories', where: {id: categoryId}, required: true}]
							}
						],
						order: [[sortBy, sortDir.toUpperCase()]],
						limit,
						offset
					}),
					total: await this.getCategoryPostsCount(categoryId, filters)
				};
			}

			async getCategoryGroups(userId, categoryId, filters = {}, listParams?: IListParams) {
				listParams = this.prepareListParams(listParams);
				app.ms.database.setDefaultListParamsValues(listParams, {sortBy: 'createdAt'});
				const {limit, offset, sortBy, sortDir} = listParams;

				return {
					list: await (await this.getCategory(categoryId)).getGroups({
						where: app.ms.group.getGroupsWhere(filters),
						include: [ {association: 'avatarImage'}, {association: 'coverImage'} ],
						order: [[sortBy, sortDir.toUpperCase()]],
						limit,
						offset
					}),
					total: await this.getCategoryGroupsCount(categoryId, filters)
				};
			}

			async updateCategoryManifest(categoryId) {
				const post = await this.getCategory(categoryId);

				return this.updateCategory(categoryId, {
					manifestStorageId: await app.generateAndSaveManifest('category', post)
				});
			}

			async createCategory(userId, categoryData) {
				await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
				categoryData.creatorId = userId;

				categoryData.manifestStaticStorageId = await app.ms.staticId.createStaticAccountId(userId, categoryData['name']);
				if (categoryData.type !== GroupType.PersonalChat) {
					categoryData.staticStorageId = categoryData.manifestStaticStorageId;
				}

				const category = await this.addCategory(categoryData);

				await (await this.getCategory(category.id)).addAdministrators([await app.ms.database.getUser(userId)]);

				await this.updateCategoryManifest(category.id);

				return this.getCategory(category.id);
			}

			async addGroupToCategory(userId, groupId, categoryId) {
				await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
				if (!(await this.canEditCategory(userId, categoryId))) {
					throw new Error("not_permitted");
				}

				return (await this.getCategory(categoryId)).addGroups([await app.ms.group.getGroup(groupId)]);
			}

			async addGroupToCategoryMembership(userId, groupId, categoryId) {
				await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
				if (!(await app.ms.group.canEditGroup(userId, groupId))) {
					throw new Error("not_permitted");
				}

				return (await this.getCategory(categoryId)).addMembershipGroups([await app.ms.group.getGroup(groupId)]);
			}

			async getCategoriesMembershipOfGroup(groupId) {
				return ((await app.ms.group.getGroup(groupId)) as any).getMembershipCategories();
			}

			async canCreatePostInGroup(userId, groupId) {
				return pIteration.some(await this.getCategoriesMembershipOfGroup(groupId), (category: IGroupCategory) => {
					return this.isMemberInCategory(userId, category.id);
				})
			}

			async addMemberToCategory(userId, categoryId, memberId) {
				await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
				// const category = await this.getGroup(categoryId);
				if(!(await this.isAdminInCategory(userId, categoryId))) {
					// if(userId.toString() !== memberId.toString()) {
					throw new Error("not_permitted");
					// }
					//TODO: add isPublic and isOpen to category
					// if(!category.isPublic || !category.isOpen) {
					//   throw new Error("not_permitted");
					// }
				}

				return (await this.getCategory(categoryId)).addMembers([await app.ms.database.getUser(memberId)]);
			}

			async addAdminToCategory(userId, categoryId, memberId) {
				await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
				// const category = await this.getGroup(categoryId);
				if(!(await this.isAdminInCategory(userId, categoryId))) {
					// if(userId.toString() !== memberId.toString()) {
					throw new Error("not_permitted");
					// }
					//TODO: add isPublic and isOpen to category
					// if(!category.isPublic || !category.isOpen) {
					//   throw new Error("not_permitted");
					// }
				}

				await (await this.getCategory(categoryId)).addAdministrators([await app.ms.database.getUser(memberId)]);
			}

			async removeMemberFromCategory(userId, categoryId, memberId) {
				await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
				// const category = await this.getGroup(categoryId);
				if(!(await this.isAdminInCategory(userId, categoryId))) {
					if(userId.toString() !== memberId.toString()) {
						throw new Error("not_permitted");
					}
					//TODO: add isPublic and isOpen to category
					// if(!category.isPublic || !category.isOpen) {
					//   throw new Error("not_permitted");
					// }
				}
				await (await this.getCategory(categoryId)).removeMembers([await app.ms.database.getUser(memberId)]);
			}

			async createGroupSection(userId, groupSectionData) {
				await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
				groupSectionData.creatorId = userId;

				if (groupSectionData.categoryId) {
					if (!(await this.isAdminInCategory(userId, groupSectionData.categoryId))) {
						throw new Error("not_permitted");
					}
				}
				return models.GroupSection.create(groupSectionData);
			}

			async updateGroupSection(userId, groupSectionId, groupSectionData) {
				await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);

				const dbGroup = await this.getGroupSection(groupSectionId);
				if (dbGroup.categoryId || groupSectionData.categoryId) {
					const permittedInCategory1 = !groupSectionData.categoryId || await this.isAdminInCategory(userId, groupSectionData.categoryId);
					const permittedInCategory2 = !dbGroup.categoryId || await this.isAdminInCategory(userId, dbGroup.categoryId);
					if (!permittedInCategory1 || !permittedInCategory2) {
						throw new Error("not_permitted");
					}
				} else {
					if(dbGroup.creatorId !== userId) {
						throw new Error("not_permitted");
					}
				}

				await models.GroupSection.update(groupSectionData, {where: {id: groupSectionId}});

				return this.getGroupSection(groupSectionId);
			}

			async setSectionOfGroup(userId, groupId, sectionId) {
				await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
				if (!(await app.ms.group.canEditGroup(userId, groupId))) {
					throw new Error("not_permitted");
				}
				if (!sectionId) {
					return models.GroupSectionsPivot.destroy({where: {groupId}});
				}
				return (await app.ms.group.getGroup(groupId) as any).setSections([await this.getGroupSection(sectionId)]);
			}

			async getGroupSectionItems(filters?, listParams?: IListParams) {
				listParams = this.prepareListParams(listParams);
				return {
					list: await this.getGroupSections(filters, listParams),
					total: await this.getGroupSectionsCount(filters)
				};
			}

			async isMemberInCategory(userId, categoryId) {
				const result = await (await app.ms.database.getUser(userId) as any).getMemberInCategories({ where: {id: categoryId} });
				return result.length > 0;
			}

			async getGroupSection(groupSectionId) {
				return models.GroupSection.findOne({ where: {id: groupSectionId} }) as IGroupSection;
			}

			async getGroupSectionByParams(params) {
				return models.GroupSection.findOne({ where: params });
			}

			getGroupSectionsWhere(filters) {
				const where = {};
				['name', 'categoryId'].forEach((name) => {
					if(!_.isUndefined(filters[name])) {
						where[name] = filters[name];
					}
				});
				console.log('getGroupSectionsWhere', where);
				return where;
			}

			async getGroupSections(filters = {}, listParams: IListParams = {}) {
				app.ms.database.setDefaultListParamsValues(listParams);

				const {limit, offset, sortBy, sortDir} = listParams;

				return models.GroupSection.findAll({
					where: this.getGroupSectionsWhere(filters),
					order: [[sortBy, sortDir.toUpperCase()]],
					limit,
					offset
				});
			}

			async getGroupSectionsCount(filters = {}) {
				return models.GroupSection.count({ where: this.getGroupSectionsWhere(filters) });
			}

			async addCategory(group) {
				return models.GroupCategory.create(group);
			}

			async updateCategory(id, updateData) {
				return models.GroupCategory.update(updateData, {where: {id}});
			}

			async getCategory(id) {
				return models.GroupCategory.findOne({ where: {id} }) as IGroupCategory;
			}

			async getCategoryByParams(params) {
				params = _.pick(params, ['name', 'staticStorageId', 'manifestStorageId', 'manifestStaticStorageId']);
				return models.GroupCategory.findOne({ where: params }) as IGroupCategory;
			}

			async removeAdminFromCategory(userId, groupId) {
				return (await this.getCategory(groupId)).removeAdministrators([await app.ms.database.getUser(userId)]);
			}

			async removeGroupFromCategory(groupId, categoryId) {
				return (await this.getCategory(categoryId)).removeGroups([await app.ms.group.getGroup(groupId)]);
			}

			async isAdminInCategory(userId, categoryId) {
				if (!categoryId) {
					return false;
				}
				const result = await (await app.ms.database.getUser(userId) as any).getAdministratorInCategories({ where: {id: categoryId} });
				return result.length > 0;
			}

			async getCategoryPostsCount(categoryId, filters = {}) {
				return models.Post.count({
					where: app.ms.group.getPostsWhere(filters),
					include: [
						{
							association: 'group', required: true,
							include: [ {association: 'categories', where: {id: categoryId}, required: true} ]
						}
					]
				});
			}

			getSectionsWhere(filters) {
				const where = {};
				['name', 'parentSectionId'].forEach((name) => {
					if(!_.isUndefined(filters[name])) {
						where[name] = filters[name];
					}
				});
				console.log('getSectionsWhere', where);
				return where;
			}

			async getCategoryGroupsCount(categoryId, filters = {}) {
				return (await this.getCategory(categoryId)).countGroups({
					where: app.ms.group.getGroupsWhere(filters)
				});
			}

			async getCategorySections(categoryId, filters = {}, listParams: IListParams = {}) {
				app.ms.database.setDefaultListParamsValues(listParams, {sortBy: 'createdAt'});

				const {limit, offset, sortBy, sortDir} = listParams;

				return models.GroupSection.findAll({
					where: {...this.getSectionsWhere(filters), categoryId},
					order: [[sortBy, sortDir.toUpperCase()]],
					limit,
					offset
				});
			}

			async getCategorySectionsCount(categoryId, filters = {}) {
				return models.GroupSection.count({
					where: {...this.getSectionsWhere(filters), categoryId}
				});
			}

			prepareListParams(listParams?: IListParams): IListParams {
				return _.pick(listParams, ['sortBy', 'sortDir', 'limit', 'offset']);
			}

			async flushDatabase() {
				await pIteration.forEachSeries([
					'GroupSectionsPivot', 'CategoryAdministratorsPivot', 'CategoryMembersPivot', 'CategoryGroupsPivot',
					'CategoryGroupsMembershipPivot', 'GroupSection', 'GroupCategory'
				], (modelName) => {
					return models[modelName].destroy({where: {}});
				});
			}
		}
		return new GroupCategoryModule();
	}
}

