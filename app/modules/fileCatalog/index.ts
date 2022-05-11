import {IGeesomeApp, ManifestToSave} from "../../interface";
import {
	CorePermissionName,
	IContent,
	IListParams
} from "../database/interface";
import IGeesomeFileCatalogModule, {FileCatalogItemType, IFileCatalogItem} from "./interface";
const _ = require('lodash');
const pIteration = require('p-iteration');
const path = require('path');
const Op = require("sequelize").Op;

module.exports = async (app: IGeesomeApp) => {
	app.checkModules(['database', 'group', 'storage', 'staticId', 'content']);
	const {sequelize, models} = app.ms.database;
	const module = getModule(app, await require('./database')(sequelize, models));
	require('./api')(app, module);
	return module;
}

function getModule(app: IGeesomeApp, models) {

	class FileCatalogModule implements IGeesomeFileCatalogModule {
		public async addContentToFolder(userId, contentId, folderId) {
			await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
			const content = await app.ms.database.getContent(contentId);
			return this.addContentToUserFileCatalog(userId, content, {folderId})
		}

		async addContentToUserFileCatalog(userId, content: IContent, options: { groupId?, apiKey?, folderId?, path? }) {
			await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
			const baseType = content.mimeType ? _.first(content.mimeType['split']('/')) : 'other';

			let parentItemId;

			const groupId = (await app.ms.group.checkGroupId(options.groupId)) || null;

			if (options.path) {
				return this.saveContentByPath(content.userId, options.path, content.id);
			}

			parentItemId = options.folderId;

			if (_.isUndefined(parentItemId) || parentItemId === 'undefined') {
				const contentFiles = await this.getFileCatalogItemsByContent(userId, content.id, FileCatalogItemType.File);
				if (contentFiles.length) {
					return content;
				}

				let folder = await this.getFileCatalogItemByDefaultFolderFor(userId, baseType);

				if (!folder) {
					folder = await this.addFileCatalogItem({
						name: _.upperFirst(baseType) + " Uploads",
						type: FileCatalogItemType.Folder,
						position: (await this.getFileCatalogItemsCount(userId, null)) + 1,
						defaultFolderFor: baseType,
						userId
					});
				}
				parentItemId = folder.id;
			}

			if (parentItemId === 'null') {
				parentItemId = null;
			}

			if (await this.isFileCatalogItemExistWithContent(userId, parentItemId, content.id)) {
				console.log(`Content ${content.id} already exists in folder`);
				return;
			}

			const resultItem = await this.addFileCatalogItem({
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

		async getFileCatalogItems(userId, parentItemId, type?, search = '', listParams?: IListParams) {
			listParams = this.prepareListParams(listParams);
			await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
			if (parentItemId == 'null') {
				parentItemId = null;
			}
			if (_.isUndefined(parentItemId) || parentItemId === 'undefined') {
				parentItemId = undefined;
			}
			if (_.isUndefined(type) || type === 'undefined') {
				type = undefined;
			}
			console.log('userId', userId, 'parentItemId', parentItemId, 'type', type, 'search', search);

			return {
				list: await this.getFileCatalogItemsList(userId, parentItemId, type, search, listParams),
				total: await this.getFileCatalogItemsCount(userId, parentItemId, type, search)
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

		public async makeFolderChildrenStorageDirsAndCopyFiles(fileCatalogItem, storageDirPath) {
			const fileCatalogChildrenFolders = await this.getFileCatalogItemsList(fileCatalogItem.userId, fileCatalogItem.id, FileCatalogItemType.Folder);

			await pIteration.forEachSeries(fileCatalogChildrenFolders, async (fItem: IFileCatalogItem) => {
				const sPath = await this.makeFolderStorageDir(fItem);
				return this.makeFolderChildrenStorageDirsAndCopyFiles(fItem, sPath)
			});

			const fileCatalogChildrenFiles = await this.getFileCatalogItemsList(fileCatalogItem.userId, fileCatalogItem.id, FileCatalogItemType.File);

			await pIteration.forEachSeries(fileCatalogChildrenFiles, async (fileCatalogItem: IFileCatalogItem) => {
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

		public async findCatalogItemByPath(userId, path, type, createFoldersIfNotExists = false): Promise<{ foundCatalogItem: IFileCatalogItem, lastFolderId: number }> {
			await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
			const pathArr = _.trim(path, '/').split('/');
			const foldersArr = pathArr.slice(0, -1);
			const lastItemName = pathArr.slice(-1)[0];

			let currentFolderId = null;
			let breakSearch = false;
			await pIteration.forEachSeries(foldersArr, async (name) => {
				if (breakSearch) {
					return;
				}
				const foundItems = await this.getFileCatalogItemsList(userId, currentFolderId, FileCatalogItemType.Folder, name);

				if (foundItems.length) {
					currentFolderId = foundItems[0].id;
				} else if (createFoldersIfNotExists) {
					const newFileCatalogFolder = await this.addFileCatalogItem({
						name,
						userId,
						type: FileCatalogItemType.Folder,
						position: (await this.getFileCatalogItemsCount(userId, currentFolderId)) + 1,
						parentItemId: currentFolderId
					});
					currentFolderId = newFileCatalogFolder.id;
				} else {
					breakSearch = true;
				}
			});

			if (breakSearch) {
				return null;
			}

			const results = await this.getFileCatalogItemsList(userId, currentFolderId, type, lastItemName);
			if (results.length > 1) {
				await pIteration.forEach(results.slice(1), item => models.FileCatalogItem.update({isDeleted: true}, {where: {id: item.id}}));
				console.log('remove excess file items: ', lastItemName);
			}

			console.log('lastFolderId', currentFolderId);
			return {
				lastFolderId: currentFolderId,
				foundCatalogItem: results[0]
			};
		}

		public async saveDataToPath(userId: number, dataToSave, path, options = {}) {
			options['path'] = path;
			const content = await app.ms.content.saveData(userId, dataToSave, null, options);
			return app.ms.fileCatalog.saveContentByPath(userId, path, content.id);
		}

		public async saveContentByPath(userId, path, contentId, options: { groupId? } = {}) {
			console.log('saveContentByPath', 'path:', path);
			await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
			const fileName = _.trim(path, '/').split('/').slice(-1)[0];
			console.log('saveContentByPath', 'fileName:', fileName);

			let {foundCatalogItem: fileItem, lastFolderId} = await this.findCatalogItemByPath(userId, path, FileCatalogItemType.File, true);

			const content = await app.ms.database.getContent(contentId);
			if (fileItem) {
				console.log('saveContentByPath', 'fileItem.name:', fileItem.name, contentId);
				await models.FileCatalogItem.update({contentId, size: content.size}, {where: {id: fileItem.id}});
			} else {
				console.log('saveContentByPath', 'addFileCatalogItem', fileName, contentId);
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
			const {foundCatalogItem: fileCatalogItem} = await this.findCatalogItemByPath(userId, path, FileCatalogItemType.File);
			return fileCatalogItem ? await app.ms.database.getContent(fileCatalogItem.contentId) : null;
		}

		public async getFileCatalogItemByPath(userId, path, type: FileCatalogItemType) {
			await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
			const {foundCatalogItem: fileCatalogItem} = await this.findCatalogItemByPath(userId, path, type);
			return fileCatalogItem;
		}

		public async deleteFileCatalogItem(userId, itemId, options: { deleteContent? } = {}) {
			await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
			const fileCatalogItem = await this.getFileCatalogItem(itemId);
			if (fileCatalogItem.userId != userId) {
				throw new Error("not_permitted");
			}

			if(options.deleteContent) {
				const content = await app.ms.database.getContent(fileCatalogItem.contentId);
				if (content.userId != userId) {
					throw new Error("not_permitted");
				}
				await app.ms.storage.unPin(content.storageId).catch(() => {/*not pinned*/});
				await app.ms.storage.remove(content.storageId).catch(() => {/*not found*/});

				await fileCatalogItem['destroy']();
				await content['destroy']();
			} else {
				await fileCatalogItem['destroy']();
			}

			return true;
		}

		async getFileCatalogItemByDefaultFolderFor(userId, defaultFolderFor) {
			return models.FileCatalogItem.findOne({
				where: {userId, defaultFolderFor}
			}) as IFileCatalogItem;
		}

		async getFileCatalogItemsList(userId, parentItemId, type = null, search = '', listParams: IListParams = {}) {
			app.ms.database.setDefaultListParamsValues(listParams);

			const {limit, offset, sortBy, sortDir} = listParams;
			const where: any = {userId, type, isDeleted: false};

			if (!_.isUndefined(parentItemId)) {
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

		async getFileCatalogItemsCount(userId, parentItemId, type = null, search = '') {
			const where: any = {userId, type, isDeleted: false};

			if (!_.isUndefined(parentItemId)) {
				where.parentItemId = parentItemId;
			}

			if (search) {
				where['name'] = {[Op.like]: search};
			}

			return models.FileCatalogItem.count({where});
		}

		async isFileCatalogItemExistWithContent(userId, parentItemId, contentId) {
			return models.FileCatalogItem.findOne({where: {userId, parentItemId, contentId}}).then(r => !!r);
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
					return _.reverse(breadcrumbs);
				}
			}
			return _.reverse(breadcrumbs);
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
				where: {parentItemId}
			});
		}

		async getContentsIdsByFileCatalogIds(catalogIds) {
			const links = await models.FileCatalogItem.findAll({
				attributes: ['id', 'linkOfId'],
				where: {id: {[Op.in]: catalogIds}, linkOfId: {[Op.ne]: null}}
			});

			let allCatalogIds = _.difference(catalogIds, links.map((link) => link.id));
			allCatalogIds = allCatalogIds.concat(links.map((link) => link.linkOfId));

			const folders = await models.FileCatalogItem.findAll({
				attributes: ['id'],
				where: {id: {[Op.in]: allCatalogIds}, type: 'folder'}
			});

			allCatalogIds = _.difference(allCatalogIds, folders.map((folder) => folder.id));

			await pIteration.forEachSeries(folders, async (folder) => {
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

		prepareListParams(listParams?: IListParams): IListParams {
			return _.pick(listParams, ['sortBy', 'sortDir', 'limit', 'offset']);
		}

		async flushDatabase() {
			await pIteration.forEachSeries(['FileCatalogItem', 'FileCatalogItemPermission'], (modelName) => {
				return models[modelName].destroy({where: {}});
			});
		}
	}
	return new FileCatalogModule();
}