import _ from 'lodash';
import path from 'path';
import debug from 'debug';
import {Op} from "sequelize";
import pIteration from 'p-iteration';
import IGeesomeFileCatalogModule, {FileCatalogItemType, IFileCatalogItem} from "./interface.js";
import {CorePermissionName, IContent, IListParams, IListParamsOptions} from "../database/interface.js";
import {IGeesomeApp, ManifestToSave} from "../../interface.js";
import helpers from "../../helpers";
const {first, isUndefined, upperFirst, trim, reverse, difference, pick} = _;
const log = debug('geesome:app');
const FILE_CATALOG_PATH_UNIQUE_INDEXES = [
	'file_catalog_items_child_path_unique',
	'file_catalog_items_root_path_unique'
];
const fileCatalogPublicListParams: IListParamsOptions = {
	sortBy: 'createdAt',
	allowedSortBy: ['createdAt', 'id', 'position', 'name'],
	maxLimit: 200
};
const fileCatalogPublishBatchLimit = 500;

export default async (app: IGeesomeApp) => {
	app.checkModules(['database', 'group', 'storage', 'staticId', 'content']);
	const {sequelize, models} = app.ms.database;
	const module = getModule(app, await (await import('./models.js')).default(sequelize, models));
	(await import('./api.js')).default(app, module);
	return module;
}

function getUniqueConstraintName(e) {
	if (!e) {
		return null;
	}
	if (e.parent && e.parent.constraint) {
		return e.parent.constraint;
	}
	if (e.original && e.original.constraint) {
		return e.original.constraint;
	}
	if (e.constraint) {
		return e.constraint;
	}
	return null;
}

function getUniqueErrorFieldNames(e) {
	if (!e || !e.fields) {
		return [];
	}
	if (Array.isArray(e.fields)) {
		return e.fields;
	}
	return Object.keys(e.fields);
}

function isFileCatalogPathUniqueError(e) {
	if (!e || e.name !== 'SequelizeUniqueConstraintError') {
		return false;
	}
	const constraintName = getUniqueConstraintName(e);
	if (FILE_CATALOG_PATH_UNIQUE_INDEXES.includes(constraintName)) {
		return true;
	}
	const fieldNames = getUniqueErrorFieldNames(e);
	if (!fieldNames.length) {
		return false;
	}
	return fieldNames.includes('userId')
		&& fieldNames.includes('name')
		&& (
			fieldNames.includes('parentItemId')
			|| fieldNames.length === 2
		);
}

function getFileCatalogPathWhere(userId, parentItemId, name, type?) {
	const where: any = {userId, parentItemId, name, isDeleted: false};
	if (!isUndefined(type)) {
		where.type = type;
	}
	return where;
}

function truncateCatalogItemName(name) {
	return String(name || '').slice(0, 200);
}

function getNumberedCatalogItemName(name, number) {
	const cleanName = truncateCatalogItemName(name);
	if (number <= 1) {
		return cleanName;
	}
	const suffix = ` (${number})`;
	const extension = path.extname(cleanName);
	const stem = extension ? cleanName.slice(0, -extension.length) : cleanName;
	const maxStemLength = Math.max(1, 200 - suffix.length - extension.length);
	return stem.slice(0, maxStemLength) + suffix + extension;
}

function getModule(app: IGeesomeApp, models) {
	class FileCatalogModule implements IGeesomeFileCatalogModule {
		public async addContentToFolder(userId, contentId, folderId) {
			await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
			const content = await app.ms.database.getContent(contentId);
			return this.addContentToUserFileCatalog(userId, content, {folderId})
		}

		async getOrCreateDefaultFolderFor(userId, baseType) {
			const folderName = upperFirst(baseType) + " Uploads";
			while (true) {
				const folder = await this.getFileCatalogItemByDefaultFolderFor(userId, baseType);
				if (folder) {
					return folder;
				}

				const name = await this.getAvailableFileCatalogItemName(userId, null, folderName);
				try {
					return await this.addFileCatalogItem({
						name,
						type: FileCatalogItemType.Folder,
						position: (await this.getFileCatalogItemsCount(userId, null)) + 1,
						defaultFolderFor: baseType,
						parentItemId: null,
						userId
					});
				} catch (e) {
					if (!isFileCatalogPathUniqueError(e)) {
						throw e;
					}
				}
			}
		}

		async addContentToUserFileCatalog(userId, content: IContent, options: { groupId?, apiKey?, folderId?, path? }) {
			await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
			const baseType = content.mimeType ? first(content.mimeType['split']('/')) : 'other';

			let parentItemId;

			const groupId = (await app.ms.group.checkGroupId(options.groupId)) || null;

			if (options.path) {
				return this.saveContentByPath(content.userId, options.path, content.id);
			}

			parentItemId = options.folderId;

			if (isUndefined(parentItemId) || parentItemId === 'undefined') {
				const contentFiles = await this.getFileCatalogItemsByContent(userId, content.id, FileCatalogItemType.File);
				if (contentFiles.length) {
					return content;
				}

				const folder = await this.getOrCreateDefaultFolderFor(userId, baseType);
				parentItemId = folder.id;
			}

			if (parentItemId === 'null') {
				parentItemId = null;
			}

			if (await this.isFileCatalogItemExistWithContent(userId, parentItemId, content.id)) {
				log(`Content ${content.id} already exists in folder`);
				return;
			}

			const resultItem = await this.addFileCatalogItemWithAvailableName({
				name: content.name || "Unnamed " + new Date().toISOString(),
				type: FileCatalogItemType.File,
				position: (await this.getFileCatalogItemsCount(userId, parentItemId)) + 1,
				contentId: content.id,
				size: content.size,
				groupId,
				parentItemId,
				userId
			});

			if (parentItemId) {
				const size = await this.getFileCatalogItemsSizeSum(parentItemId);
				await models.FileCatalogItem.update({size}, {where: {id: parentItemId}});
			}

			return resultItem;
		}

		async createUserFolder(userId, parentItemId, folderName) {
			await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
			return this.addFileCatalogItem({
				name: folderName,
				type: FileCatalogItemType.Folder,
				position: (await this.getFileCatalogItemsCount(userId, parentItemId)) + 1,
				size: 0,
				parentItemId,
				userId
			});
		}

		public async updateFileCatalogItem(userId, fileCatalogId, updateData) {
			await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
			const fileCatalogItem = await this.getFileCatalogItem(fileCatalogId);
			if (fileCatalogItem.userId !== userId) {
				throw new Error("not_permitted");
			}
			await models.FileCatalogItem.update(updateData, {where: {id: fileCatalogId}});
			return this.getFileCatalogItem(fileCatalogId);
		}

		public async updateFileCatalogList(userId, fileCatalogIds, updateData) {
			await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
			return models.FileCatalogItem.update(pick(updateData, ['description', 'type', 'view', 'position', 'isDeleted']), {where: {id: {[Op.in]: fileCatalogIds}, userId}});
		}

		async getFileCatalogItems(userId, parentItemId, type?, search = '', isDeleted = false, listParams?: IListParams) {
			listParams = helpers.prepareListParams(listParams, fileCatalogPublicListParams);
			await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
			if (parentItemId == 'null') {
				parentItemId = null;
			}
			if (isUndefined(parentItemId) || parentItemId === 'undefined') {
				parentItemId = undefined;
			}
			if (isUndefined(type) || type === 'undefined') {
				type = undefined;
			}
			log('userId', userId, 'parentItemId', parentItemId, 'type', type, 'search', search);
			return {
				list: await this.getFileCatalogItemsList(userId, parentItemId, type, search, isDeleted, listParams),
				total: await this.getFileCatalogItemsCount(userId, parentItemId, type, search, isDeleted)
			};
		}

		async getFileCatalogItemsBreadcrumbs(userId, itemId) {
			await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
			const item = await this.getFileCatalogItem(itemId);
			if (item.userId != userId) {
				throw new Error("not_permitted");
			}

			return this.getFileCatalogItemsBreadcrumbsList(itemId);
		}

		public async makeFolderStorageDir(fileCatalogItem: IFileCatalogItem) {
			const breadcrumbs = await this.getFileCatalogItemsBreadcrumbs(fileCatalogItem.userId, fileCatalogItem.id);

			// breadcrumbs.push(fileCatalogItem);

			const {storageAccountId: userStaticId} = await app.ms.database.getUser(fileCatalogItem.userId);

			const path = `/${userStaticId}/` + breadcrumbs.map(b => b.name).join('/') + '/';

			await app.ms.storage.makeDir(path);

			return path;
		}

		async forEachFileCatalogChild(userId, parentItemId, type: FileCatalogItemType, callback: (item: IFileCatalogItem) => Promise<any>) {
			let lastId = 0;
			let childItems: IFileCatalogItem[];
			do {
				childItems = await models.FileCatalogItem.findAll({
					where: {
						userId,
						parentItemId,
						type,
						isDeleted: false,
						id: {[Op.gt]: lastId}
					},
					order: [['id', 'ASC']],
					include: [{association: 'content'}],
					limit: fileCatalogPublishBatchLimit
				}) as IFileCatalogItem[];

				await pIteration.forEachSeries(childItems, callback);
				if (childItems.length) {
					lastId = childItems[childItems.length - 1].id;
				}
			} while (childItems.length === fileCatalogPublishBatchLimit);
		}

		public async makeFolderChildrenStorageDirsAndCopyFiles(fileCatalogItem, storageDirPath) {
			await this.forEachFileCatalogChild(fileCatalogItem.userId, fileCatalogItem.id, FileCatalogItemType.Folder, async (fItem: IFileCatalogItem) => {
				const sPath = await this.makeFolderStorageDir(fItem);
				return this.makeFolderChildrenStorageDirsAndCopyFiles(fItem, sPath)
			});

			await this.forEachFileCatalogChild(fileCatalogItem.userId, fileCatalogItem.id, FileCatalogItemType.File, async (fileCatalogItem: IFileCatalogItem) => {
				await app.ms.storage.copyFileFromId(fileCatalogItem.content.storageId, storageDirPath + fileCatalogItem.name);
			});
		}

		public async publishFolder(userId, fileCatalogId, options: {bindToStatic?} = {}) {
			await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
			const fileCatalogItem = await this.getFileCatalogItem(fileCatalogId);

			const storageDirPath = await this.makeFolderStorageDir(fileCatalogItem);

			await this.makeFolderChildrenStorageDirsAndCopyFiles(fileCatalogItem, storageDirPath);

			const storageId = await app.ms.storage.getDirectoryId(storageDirPath);

			const user = await app.ms.database.getUser(userId);

			if (!options.bindToStatic) {
				return { storageId };
			}

			const staticId = await app.ms.staticId.getOrCreateStaticAccountId(userId, user.name + '@directory:' + storageDirPath);
			await app.ms.staticId.bindToStaticId(userId, storageId, staticId);

			return {
				storageId,
				staticId
			}
		}

		public async findCatalogItemByPath(userId, path, type, createFoldersIfNotExists = false): Promise<{ foundCatalogItem: IFileCatalogItem, lastFolderId: number } | null> {
			await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
			const pathArr = trim(path, '/').split('/');
			const foldersArr = pathArr.slice(0, -1);
			const lastItemName = pathArr.slice(-1)[0];

			let currentFolderId = null;
			let breakSearch = false;
			await pIteration.forEachSeries(foldersArr, async (name) => {
				if (breakSearch) {
					return;
				}
				const foundItems = await this.getActiveFileCatalogPathItems(userId, currentFolderId, name, FileCatalogItemType.Folder);

				if (foundItems.length) {
					currentFolderId = foundItems[0].id;
				} else if (createFoldersIfNotExists) {
					let newFileCatalogFolder;
					try {
						newFileCatalogFolder = await this.addFileCatalogItem({
							name,
							userId,
							type: FileCatalogItemType.Folder,
							position: (await this.getFileCatalogItemsCount(userId, currentFolderId)) + 1,
							parentItemId: currentFolderId
						});
					} catch (e) {
						if (!isFileCatalogPathUniqueError(e)) {
							throw e;
						}
						newFileCatalogFolder = await this.getActiveFileCatalogPathItem(userId, currentFolderId, name, FileCatalogItemType.Folder);
						if (!newFileCatalogFolder) {
							throw e;
						}
					}
					currentFolderId = newFileCatalogFolder.id;
				} else {
					breakSearch = true;
				}
			});

			if (breakSearch) {
				return null;
			}

			const results = await this.getActiveFileCatalogPathItems(userId, currentFolderId, lastItemName, type);
			if (results.length > 1) {
				await pIteration.forEach(results.slice(1), (item: any) => models.FileCatalogItem.update({isDeleted: true}, {where: {id: item.id}}));
				log('remove excess file items: ', lastItemName);
			}

			log('lastFolderId', currentFolderId);
			return {
				lastFolderId: currentFolderId,
				foundCatalogItem: results[0]
			};
		}

		public async saveDataToPath(userId: number, dataToSave, path, options = {}) {
			options['path'] = path;
			const content = await app.ms.content.saveData(userId, dataToSave, null, options);
			return this.saveContentByPath(userId, path, content.id);
		}

		public async saveContentByPath(userId, path, contentId, options: { groupId? } = {}) {
			log('saveContentByPath', 'path:', path);
			await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
			const fileName = trim(path, '/').split('/').slice(-1)[0];
			log('saveContentByPath', 'fileName:', fileName);

			const pathResult = await this.findCatalogItemByPath(userId, path, FileCatalogItemType.File, true);
			if (!pathResult) {
				throw new Error('path_not_found');
			}
			let {foundCatalogItem: fileItem, lastFolderId} = pathResult;

			const content = await app.ms.database.getContent(contentId);
			if (fileItem) {
				log('saveContentByPath', 'fileItem.name:', fileItem.name, contentId);
				await models.FileCatalogItem.update({contentId, size: content.size}, {where: {id: fileItem.id}});
			} else {
				log('saveContentByPath', 'addFileCatalogItem', fileName, contentId);
				try {
					fileItem = await this.addFileCatalogItem({
						userId,
						contentId,
						name: fileName,
						type: FileCatalogItemType.File,
						position: (await this.getFileCatalogItemsCount(userId, lastFolderId)) + 1,
						parentItemId: lastFolderId,
						groupId: options.groupId,
						size: content.size
					});
				} catch (e) {
					if (!isFileCatalogPathUniqueError(e)) {
						throw e;
					}
					fileItem = await this.getActiveFileCatalogPathItem(userId, lastFolderId, fileName, FileCatalogItemType.File);
					if (!fileItem) {
						throw e;
					}
					await models.FileCatalogItem.update({contentId, size: content.size}, {where: {id: fileItem.id}});
				}
			}
			if (fileItem.parentItemId) {
				const size = await this.getFileCatalogItemsSizeSum(fileItem.parentItemId);
				await models.FileCatalogItem.update({size}, {where: {id: fileItem.parentItemId}});
			}
			return this.getFileCatalogItem(fileItem.id);
		}

		public async saveManifestsToFolder(userId, folderPath, toSaveList: ManifestToSave[], options: { groupId? } = {}) {
			await pIteration.map(toSaveList, async (item: ManifestToSave) => {
				const content = await app.ms.content.createContentByRemoteStorageId(userId, item.manifestStorageId, options);
				return this.saveContentByPath(userId, path.join(folderPath, item.path || content.name), content.id, options)
			});

			return this.getFileCatalogItemByPath(userId, folderPath, FileCatalogItemType.Folder);
		}

		public async getContentByPath(userId, path) {
			await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
			const result = await this.findCatalogItemByPath(userId, path, FileCatalogItemType.File);
			if (!result) {
				return null;
			}
			const fileCatalogItem = result.foundCatalogItem;
			return fileCatalogItem ? await app.ms.database.getContent(fileCatalogItem.contentId) : null;
		}

		public async getFileCatalogItemByPath(userId, path, type: FileCatalogItemType) {
			await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
			const result = await this.findCatalogItemByPath(userId, path, type);
			return result ? result.foundCatalogItem : null;
		}

		public async deleteFileCatalogItem(userId, itemId, options: { deleteContent? } = {}) {
			await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
			const fileCatalogItem = await this.getFileCatalogItem(itemId);
			if (fileCatalogItem.userId != userId) {
				throw new Error("not_permitted");
			}

			if (!options.deleteContent) {
				await fileCatalogItem['destroy']();
				return true;
			}

			const content = await app.ms.database.getContent(fileCatalogItem.contentId);
			if (content.userId != userId) {
				throw new Error("not_permitted");
			}

			const deleteSafety = await app.ms.database.getContentDeleteSafety(content, {
				allowedFileCatalogItems: 1,
				excludeFileCatalogItemId: fileCatalogItem.id,
			});

			await fileCatalogItem['destroy']();
			if (deleteSafety.safeToDestroyContent) {
				await app.ms.database.deleteContent(content.id);
			}
			if (deleteSafety.safeToRemovePhysical) {
				await removePhysicalStorageForDeletedContent(app, userId, content);
			}

			return true;
		}

		async getFileCatalogItemByDefaultFolderFor(userId, defaultFolderFor) {
			return models.FileCatalogItem.findOne({
				where: {userId, defaultFolderFor}
			}) as IFileCatalogItem;
		}

		async getFileCatalogItemsList(userId, parentItemId, type = null, search = '', isDeleted = false, listParams: IListParams = {}) {
			app.ms.database.setDefaultListParamsValues(listParams);

			const {limit, offset, sortBy, sortDir} = listParams;
			const where: any = {userId, type, isDeleted: !!isDeleted};
			if (!isUndefined(parentItemId)) {
				where.parentItemId = parentItemId;
			}
			if (search) {
				where['name'] = {[Op.like]: search};
			}
			return models.FileCatalogItem.findAll({
				where,
				order: [[sortBy, sortDir.toUpperCase()]],
				include: [{association: 'content'}],
				limit,
				offset
			});
		}

		async getFileCatalogItemsCount(userId, parentItemId, type = null, search = '', isDeleted = false) {
			const where: any = {userId, type, isDeleted: !!isDeleted};
			if (!isUndefined(parentItemId)) {
				where.parentItemId = parentItemId;
			}
			if (search) {
				where['name'] = {[Op.like]: search};
			}
			return models.FileCatalogItem.count({where});
		}

		async getFileCatalogItemsByContent(userId, contentId, type = null, listParams: IListParams = {}) {
			app.ms.database.setDefaultListParamsValues(listParams);
			const {sortBy, sortDir, limit, offset} = listParams;

			return models.FileCatalogItem.findAll({
				where: {userId, contentId, type, isDeleted: false},
				order: [[sortBy, sortDir.toUpperCase()]],
				limit,
				offset
			});
		}

		async isFileCatalogItemExistWithContent(userId, parentItemId, contentId) {
			return models.FileCatalogItem.findOne({where: {userId, parentItemId, contentId, isDeleted: false}}).then(r => !!r);
		}

		async getActiveFileCatalogPathItems(userId, parentItemId, name, type?) {
			return models.FileCatalogItem.findAll({
				where: getFileCatalogPathWhere(userId, parentItemId, name, type),
				order: [['createdAt', 'DESC'], ['id', 'DESC']],
				include: [{association: 'content'}]
			}) as IFileCatalogItem[];
		}

		async getActiveFileCatalogPathItem(userId, parentItemId, name, type?) {
			return (await this.getActiveFileCatalogPathItems(userId, parentItemId, name, type))[0];
		}

		async getAvailableFileCatalogItemName(userId, parentItemId, name) {
			let number = 1;
			while (number <= 1000) {
				const candidateName = getNumberedCatalogItemName(name, number);
				const existsItem = await this.getActiveFileCatalogPathItem(userId, parentItemId, candidateName);
				if (!existsItem) {
					return candidateName;
				}
				number += 1;
			}
			throw new Error('file_catalog_name_conflict');
		}

		async addFileCatalogItemWithAvailableName(item) {
			while (true) {
				const name = await this.getAvailableFileCatalogItemName(item.userId, item.parentItemId, item.name);
				try {
					return await this.addFileCatalogItem({...item, name});
				} catch (e) {
					if (!isFileCatalogPathUniqueError(e)) {
						throw e;
					}
				}
			}
		}

		async getFileCatalogItemsBreadcrumbsList(childItemId) {
			const breadcrumbs = [];
			if (!childItemId) {
				return breadcrumbs;
			}
			const maxNesting = 20;

			let currentItemId = childItemId;
			while (currentItemId) {
				const currentItem = await this.getFileCatalogItem(currentItemId);
				breadcrumbs.push(currentItem);
				currentItemId = currentItem.parentItemId;

				if (breadcrumbs.length >= maxNesting || !currentItemId) {
					return reverse(breadcrumbs);
				}
			}
			return reverse(breadcrumbs);
		}

		async getFileCatalogItem(id) {
			if (!id) {
				return null;
			}
			return models.FileCatalogItem.findOne({
				where: {id},
				include: [{association: 'content'}]
			}) as IFileCatalogItem;
		}

		async addFileCatalogItem(item) {
			return models.FileCatalogItem.create(item);
		}

		async getFileCatalogItemsSizeSum(parentItemId) {
			return models.FileCatalogItem.sum('size', {
				where: {parentItemId, isDeleted: false}
			});
		}

		async getContentsIdsByFileCatalogIds(catalogIds) {
			const links = await models.FileCatalogItem.findAll({
				attributes: ['id', 'linkOfId'],
				where: {id: {[Op.in]: catalogIds}, linkOfId: {[Op.ne]: null}}
			});

			let allCatalogIds = difference(catalogIds, links.map((link) => link.id));
			allCatalogIds = allCatalogIds.concat(links.map((link) => link.linkOfId));

			const folders = await models.FileCatalogItem.findAll({
				attributes: ['id'],
				where: {id: {[Op.in]: allCatalogIds}, type: 'folder'}
			});

			allCatalogIds = difference(allCatalogIds, folders.map((folder) => folder.id));

			await pIteration.forEachSeries(folders, async (folder: IFileCatalogItem) => {
				const files = await models.FileCatalogItem.findAll({
					attributes: ['id'],
					where: {parentItemId: folder.id, type: 'file'}
				});

				allCatalogIds = allCatalogIds.concat(files.map(f => f.id));
			});

			return (await models.FileCatalogItem.findAll({
				attributes: ['contentId'],
				where: {id: {[Op.in]: allCatalogIds}}
			})).map(f => f.contentId);
		}

		async afterContentAdding(userId, content: IContent, options) {
			if (await app.isUserCan(userId, CorePermissionName.UserFileCatalogManagement)) {
				await this.addContentToUserFileCatalog(userId, content, options);
			}
		}

		async existsContentAdding(userId, content: IContent, options) {
			if (await app.isUserCan(userId, CorePermissionName.UserFileCatalogManagement)) {
				await this.addContentToUserFileCatalog(userId, content, options);
			}
		}

		async flushDatabase() {
			await pIteration.forEachSeries(['FileCatalogItem', 'FileCatalogItemPermission'], (modelName) => {
				return models[modelName].destroy({where: {}});
			});
		}
	}
	return new FileCatalogModule();
}

async function removePhysicalStorageForDeletedContent(app: IGeesomeApp, userId, content) {
	const storageIds = getContentPhysicalStorageIds(content);
	const storageSpace = app.ms['storageSpace'];
	if (storageSpace && typeof storageSpace.queueStorageObjectRemoval === 'function') {
		for (const storageId of storageIds) {
			await storageSpace.queueStorageObjectRemoval(userId, null, storageId);
		}
		return;
	}

	for (const storageId of storageIds) {
		await removePhysicalStorageIdIfSafe(app, storageId);
	}
}

async function removePhysicalStorageIdIfSafe(app: IGeesomeApp, storageId) {
	const deleteSafety = await app.ms.database.getStorageObjectDeleteSafety(storageId);
	if (!deleteSafety.safeToRemovePhysical) {
		return;
	}
	await app.ms.storage.unPin(storageId).catch(() => null);
	await app.ms.storage.remove(storageId).catch(() => null);
}

function getContentPhysicalStorageIds(content) {
	return [...new Set([
		content?.storageId,
		content?.largePreviewStorageId,
		content?.mediumPreviewStorageId,
		content?.smallPreviewStorageId,
	].filter(Boolean))];
}
