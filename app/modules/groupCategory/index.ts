import {IGeesomeApp, IGeesomeGroupCategoryModule} from "../../interface";
import {CorePermissionName, GroupType, IListParams} from "../database/interface";
const commonHelper = require('geesome-libs/src/common');
const _ = require('lodash');

module.exports = (app: IGeesomeApp) => {
	const module = getModule(app);
	require('./api')(app, module);
	return module;
}

function getModule(app: IGeesomeApp) {
	app.checkModules(['database', 'group']);

	class GroupCategoryModule implements IGeesomeGroupCategoryModule{

		async canAddGroupToCategory(userId, categoryId) {
			if (!categoryId) {
				return false;
			}
			categoryId = await this.checkCategoryId(categoryId);
			return app.ms.database.isAdminInCategory(userId, categoryId);
		}

		async canEditCategory(userId, categoryId) {
			if (!categoryId) {
				return false;
			}
			categoryId = await this.checkCategoryId(categoryId);
			return app.ms.database.isAdminInCategory(userId, categoryId);
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
				const historyItem = await app.ms.database.getStaticIdItemByDynamicId(groupId);
				if (historyItem) {
					staticId = historyItem.staticId;
				}
			}
			return app.ms.database.getCategoryByParams({
				manifestStaticStorageId: staticId
			});
		}

		async getCategoryPosts(categoryId, filters = {}, listParams?: IListParams) {
			listParams = this.prepareListParams(listParams);
			return {
				list: await app.ms.database.getCategoryPosts(categoryId, filters, listParams),
				total: await app.ms.database.getCategoryPostsCount(categoryId, filters)
			};
		}

		async getCategoryGroups(userId, categoryId, filters = {}, listParams?: IListParams) {
			listParams = this.prepareListParams(listParams);
			return {
				list: await app.ms.database.getCategoryGroups(categoryId, filters, listParams),
				total: await app.ms.database.getCategoryGroupsCount(categoryId, filters)
			};
		}

		async updateCategoryManifest(categoryId) {
			const post = await app.ms.database.getCategory(categoryId);

			return app.ms.database.updateCategory(categoryId, {
				manifestStorageId: await app.generateAndSaveManifest('category', post)
			});
		}

		async isAdminInCategory(userId, categoryId) {
			if (!categoryId) {
				return false;
			}
			return app.ms.database.isAdminInCategory(userId, categoryId);
		}


		async createCategory(userId, categoryData) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			categoryData.creatorId = userId;

			categoryData.manifestStaticStorageId = await app.ms.staticId.createStaticAccountId(categoryData['name']);
			if (categoryData.type !== GroupType.PersonalChat) {
				categoryData.staticStorageId = categoryData.manifestStaticStorageId;
			}

			const category = await app.ms.database.addCategory(categoryData);

			await app.ms.database.addAdminToCategory(userId, category.id);

			await this.updateCategoryManifest(category.id);

			return app.ms.database.getCategory(category.id);
		}

		async addGroupToCategory(userId, groupId, categoryId) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			if (!(await this.canEditCategory(userId, categoryId))) {
				throw new Error("not_permitted");
			}

			await app.ms.database.addGroupToCategory(groupId, categoryId);
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

			await app.ms.database.addMemberToCategory(memberId, categoryId);
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

			await app.ms.database.addAdminToCategory(memberId, categoryId);
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
			await app.ms.database.removeMemberFromCategory(memberId, categoryId);
		}

		async isMemberInCategory(userId, categoryId) {
			return app.ms.database.isMemberInCategory(userId, categoryId);
		}

		async getCategoryByParams(params) {
			return app.ms.database.getCategoryByParams(_.pick(params, ['name', 'staticStorageId', 'manifestStorageId', 'manifestStaticStorageId']));
		}

		async createGroupSection(userId, groupSectionData) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			groupSectionData.creatorId = userId;

			if (groupSectionData.categoryId) {
				if (!(await this.isAdminInCategory(userId, groupSectionData.categoryId))) {
					throw new Error("not_permitted");
				}
			}

			return app.ms.database.addGroupSection(groupSectionData);
		}

		async updateGroupSection(userId, groupSectionId, groupSectionData) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);

			const dbGroup = await app.ms.database.getGroupSection(groupSectionId);
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

			await app.ms.database.updateGroupSection(groupSectionId, groupSectionData);

			return app.ms.database.getGroupSection(groupSectionId);
		}

		async getGroupSectionItems(filters?, listParams?: IListParams) {
			listParams = this.prepareListParams(listParams);
			return {
				list: await app.ms.database.getGroupSections(filters, listParams),
				total: await app.ms.database.getGroupSectionsCount(filters)
			};
		}

		prepareListParams(listParams?: IListParams): IListParams {
			return _.pick(listParams, ['sortBy', 'sortDir', 'limit', 'offset']);
		}
	}
	return new GroupCategoryModule();
}
