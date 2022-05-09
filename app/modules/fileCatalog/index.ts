import {IGeesomeApp, ManifestToSave} from "../../interface";
import {
	CorePermissionName, FileCatalogItemType,
	IContent, IFileCatalogItem,
	IListParams
} from "../database/interface";
import IGeesomeFileCatalogModule from "./interface";
const _ = require('lodash');
const pIteration = require('p-iteration');
const path = require('path');

module.exports = (app: IGeesomeApp) => {
	const module = getModule(app);
	require('./api')(app, module);
	return module;
}

function getModule(app: IGeesomeApp) {
	app.checkModules(['group', 'storage', 'staticId', 'content']);

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
				const contentFiles = await app.ms.database.getFileCatalogItemsByContent(userId, content.id, FileCatalogItemType.File);
				if (contentFiles.length) {
					return content;
				}

				let folder = await app.ms.database.getFileCatalogItemByDefaultFolderFor(userId, baseType);

				if (!folder) {
					folder = await app.ms.database.addFileCatalogItem({
						name: _.upperFirst(baseType) + " Uploads",
						type: FileCatalogItemType.Folder,
						position: (await app.ms.database.getFileCatalogItemsCount(userId, null)) + 1,
						defaultFolderFor: baseType,
						userId
					});
				}
				parentItemId = folder.id;
			}

			if (parentItemId === 'null') {
				parentItemId = null;
			}

			if (await app.ms.database.isFileCatalogItemExistWithContent(userId, parentItemId, content.id)) {
				console.log(`Content ${content.id} already exists in folder`);
				return;
			}

			const resultItem = await app.ms.database.addFileCatalogItem({
				name: content.name || "Unnamed " + new Date().toISOString(),
				type: FileCatalogItemType.File,
				position: (await app.ms.database.getFileCatalogItemsCount(userId, parentItemId)) + 1,
				contentId: content.id,
				size: content.size,
				groupId,
				parentItemId,
				userId
			});

			if (parentItemId) {
				const size = await app.ms.database.getFileCatalogItemsSizeSum(parentItemId);
				await app.ms.database.updateFileCatalogItem(parentItemId, {size});
			}

			return resultItem;
		}

		async createUserFolder(userId, parentItemId, folderName) {
			await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
			return app.ms.database.addFileCatalogItem({
				name: folderName,
				type: FileCatalogItemType.Folder,
				position: (await app.ms.database.getFileCatalogItemsCount(userId, parentItemId)) + 1,
				size: 0,
				parentItemId,
				userId
			});
		}

		public async updateFileCatalogItem(userId, fileCatalogId, updateData) {
			await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
			const fileCatalogItem = await app.ms.database.getFileCatalogItem(fileCatalogId);
			if (fileCatalogItem.userId !== userId) {
				throw new Error("not_permitted");
			}
			await app.ms.database.updateFileCatalogItem(fileCatalogId, updateData);
			return app.ms.database.getFileCatalogItem(fileCatalogId);
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
				list: await app.ms.database.getFileCatalogItems(userId, parentItemId, type, search, listParams),
				total: await app.ms.database.getFileCatalogItemsCount(userId, parentItemId, type, search)
			};
		}

		async getFileCatalogItemsBreadcrumbs(userId, itemId) {
			await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
			const item = await app.ms.database.getFileCatalogItem(itemId);
			if (item.userId != userId) {
				throw new Error("not_permitted");
			}

			return app.ms.database.getFileCatalogItemsBreadcrumbs(itemId);
		}

		async getContentsIdsByFileCatalogIds(catalogIds) {
			return app.ms.database.getContentsIdsByFileCatalogIds(catalogIds);
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
			const fileCatalogChildrenFolders = await app.ms.database.getFileCatalogItems(fileCatalogItem.userId, fileCatalogItem.id, FileCatalogItemType.Folder);

			await pIteration.forEachSeries(fileCatalogChildrenFolders, async (fItem: IFileCatalogItem) => {
				const sPath = await this.makeFolderStorageDir(fItem);
				return this.makeFolderChildrenStorageDirsAndCopyFiles(fItem, sPath)
			});

			const fileCatalogChildrenFiles = await app.ms.database.getFileCatalogItems(fileCatalogItem.userId, fileCatalogItem.id, FileCatalogItemType.File);

			await pIteration.forEachSeries(fileCatalogChildrenFiles, async (fileCatalogItem: IFileCatalogItem) => {
				await app.ms.storage.copyFileFromId(fileCatalogItem.content.storageId, storageDirPath + fileCatalogItem.name);
			});
		}

		public async publishFolder(userId, fileCatalogId, options: {bindToStatic?} = {}) {
			await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
			const fileCatalogItem = await app.ms.database.getFileCatalogItem(fileCatalogId);

			const storageDirPath = await this.makeFolderStorageDir(fileCatalogItem);

			await this.makeFolderChildrenStorageDirsAndCopyFiles(fileCatalogItem, storageDirPath);

			const storageId = await app.ms.storage.getDirectoryId(storageDirPath);

			const user = await app.ms.database.getUser(userId);

			if(!options.bindToStatic) {
				return { storageId };
			}

			const staticId = await app.ms.staticId.createStaticAccountId(user.name + '@directory:' + storageDirPath);
			await app.ms.staticId.bindToStaticId(storageId, staticId);

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
				const foundItems = await app.ms.database.getFileCatalogItems(userId, currentFolderId, FileCatalogItemType.Folder, name);

				if (foundItems.length) {
					currentFolderId = foundItems[0].id;
				} else if (createFoldersIfNotExists) {
					const newFileCatalogFolder = await app.ms.database.addFileCatalogItem({
						name,
						userId,
						type: FileCatalogItemType.Folder,
						position: (await app.ms.database.getFileCatalogItemsCount(userId, currentFolderId)) + 1,
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

			const results = await app.ms.database.getFileCatalogItems(userId, currentFolderId, type, lastItemName);
			if (results.length > 1) {
				await pIteration.forEach(results.slice(1), item => app.ms.database.updateFileCatalogItem(item.id, {isDeleted: true}));
				console.log('remove excess file items: ', lastItemName);
			}

			console.log('lastFolderId', currentFolderId);
			return {
				lastFolderId: currentFolderId,
				foundCatalogItem: results[0]
			};
		}

		public async saveContentByPath(userId, path, contentId, options: { groupId? } = {}) {
			await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
			const fileName = _.trim(path, '/').split('/').slice(-1)[0];
			console.log('saveContentByPath', 'path:', path, 'fileName:', fileName);

			let {foundCatalogItem: fileItem, lastFolderId} = await this.findCatalogItemByPath(userId, path, FileCatalogItemType.File, true);

			const content = await app.ms.database.getContent(contentId);
			if (fileItem) {
				console.log('saveContentByPath', 'fileItem.name:', fileItem.name, contentId);
				await app.ms.database.updateFileCatalogItem(fileItem.id, {contentId, size: content.size});
			} else {
				console.log('saveContentByPath', 'addFileCatalogItem', fileName, contentId);
				fileItem = await app.ms.database.addFileCatalogItem({
					userId,
					contentId,
					name: fileName,
					type: FileCatalogItemType.File,
					position: (await app.ms.database.getFileCatalogItemsCount(userId, lastFolderId)) + 1,
					parentItemId: lastFolderId,
					groupId: options.groupId,
					size: content.size
				});
			}
			if (fileItem.parentItemId) {
				const size = await app.ms.database.getFileCatalogItemsSizeSum(fileItem.parentItemId);
				await app.ms.database.updateFileCatalogItem(fileItem.parentItemId, {size});
			}
			return app.ms.database.getFileCatalogItem(fileItem.id);
		}

		public async saveManifestsToFolder(userId, folderPath, toSaveList: ManifestToSave[], options: { groupId? } = {}) {
			await pIteration.map(toSaveList, async (item: ManifestToSave) => {
				const content = await app.ms.content.createContentByRemoteStorageId(item.manifestStorageId, {
					userId,
					...options
				});
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
			const fileCatalogItem = await app.ms.database.getFileCatalogItem(itemId);
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

		prepareListParams(listParams?: IListParams): IListParams {
			return _.pick(listParams, ['sortBy', 'sortDir', 'limit', 'offset']);
		}
	}
	return new FileCatalogModule();
}