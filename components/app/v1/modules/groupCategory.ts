import {IGeesomeApp} from "../../interface";
import {CorePermissionName, GroupType, IListParams} from "../../../database/interface";
const commonHelper = require('geesome-libs/src/common');
const _ = require('lodash');

module.exports = (app: IGeesomeApp) => {
	class CategoryModule {

		async canAddGroupToCategory(userId, categoryId) {
			if (!categoryId) {
				return false;
			}
			categoryId = await this.checkCategoryId(categoryId);
			return app.database.isAdminInCategory(userId, categoryId);
		}

		async canEditCategory(userId, categoryId) {
			if (!categoryId) {
				return false;
			}
			categoryId = await this.checkCategoryId(categoryId);
			return app.database.isAdminInCategory(userId, categoryId);
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
				const historyItem = await app.database.getStaticIdItemByDynamicId(groupId);
				if (historyItem) {
					staticId = historyItem.staticId;
				}
			}
			return app.database.getCategoryByParams({
				manifestStaticStorageId: staticId
			});
		}

		async getCategoryPosts(categoryId, filters = {}, listParams?: IListParams) {
			listParams = this.prepareListParams(listParams);
			return {
				list: await app.database.getCategoryPosts(categoryId, filters, listParams),
				total: await app.database.getCategoryPostsCount(categoryId, filters)
			};
		}

		async getCategoryGroups(userId, categoryId, filters = {}, listParams?: IListParams) {
			listParams = this.prepareListParams(listParams);
			return {
				list: await app.database.getCategoryGroups(categoryId, filters, listParams),
				total: await app.database.getCategoryGroupsCount(categoryId, filters)
			};
		}

		prepareListParams(listParams?: IListParams): IListParams {
			return _.pick(listParams, ['sortBy', 'sortDir', 'limit', 'offset']);
		}

		async updateCategoryManifest(categoryId) {
			const post = await app.database.getCategory(categoryId);

			return app.database.updateCategory(categoryId, {
				manifestStorageId: await app.generateAndSaveManifest('category', post)
			});
		}

		async isAdminInCategory(userId, categoryId) {
			if (!categoryId) {
				return false;
			}
			return app.database.isAdminInCategory(userId, categoryId);
		}


		async createCategory(userId, categoryData) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			categoryData.creatorId = userId;

			categoryData.manifestStaticStorageId = await app.createStorageAccount(categoryData['name']);
			if (categoryData.type !== GroupType.PersonalChat) {
				categoryData.staticStorageId = categoryData.manifestStaticStorageId;
			}

			const category = await app.database.addCategory(categoryData);

			await app.database.addAdminToCategory(userId, category.id);

			await this.updateCategoryManifest(category.id);

			return app.database.getCategory(category.id);
		}

		async addGroupToCategory(userId, groupId, categoryId) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			if (!(await this.canEditCategory(userId, categoryId))) {
				throw new Error("not_permitted");
			}

			await app.database.addGroupToCategory(groupId, categoryId);
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

			await app.database.addMemberToCategory(memberId, categoryId);
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

			await app.database.addAdminToCategory(memberId, categoryId);
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
			await app.database.removeMemberFromCategory(memberId, categoryId);
		}

		async isMemberInCategory(userId, categoryId) {
			return app.database.isMemberInCategory(userId, categoryId);
		}

		async getCategoryByParams(params) {
			return app.database.getCategoryByParams(_.pick(params, ['name', 'staticStorageId', 'manifestStorageId', 'manifestStaticStorageId']));
		}

		async createGroupSection(userId, groupSectionData) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			groupSectionData.creatorId = userId;

			if (groupSectionData.categoryId) {
				if (!(await this.isAdminInCategory(userId, groupSectionData.categoryId))) {
					throw new Error("not_permitted");
				}
			}

			return app.database.addGroupSection(groupSectionData);
		}

		async updateGroupSection(userId, groupSectionId, groupSectionData) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);

			const dbGroup = await app.database.getGroupSection(groupSectionId);
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

			await app.database.updateGroupSection(groupSectionId, groupSectionData);

			return app.database.getGroupSection(groupSectionId);
		}

		async getGroupSectionItems(filters?, listParams?: IListParams) {
			listParams = this.prepareListParams(listParams);
			return {
				list: await app.database.getGroupSections(filters, listParams),
				total: await app.database.getGroupSectionsCount(filters)
			};
		}
	}
	return new CategoryModule();
};