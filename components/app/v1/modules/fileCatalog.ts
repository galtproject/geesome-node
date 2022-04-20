import {IGeesomeApp, ManifestToSave} from "../../interface";
import {
	CorePermissionName, FileCatalogItemType,
	GroupPermissionName,
	GroupType,
	GroupView, IContent, IFileCatalogItem,
	IGroup,
	IListParams, IPost, PostStatus
} from "../../../database/interface";
const commonHelper = require('geesome-libs/src/common');
const _ = require('lodash');
const pIteration = require('p-iteration');
const ipfsHelper = require('geesome-libs/src/ipfsHelper');
const log = require('debug')('geesome:app:group');
const {getPersonalChatTopic, getGroupUpdatesTopic} = require('geesome-libs/src/name');
const pgpHelper = require('geesome-libs/src/pgpHelper');
const peerIdHelper = require('geesome-libs/src/peerIdHelper');
const path = require('path');

module.exports = (app: IGeesomeApp) => {
	app.checkModules(['group']);

	class FileCatalogModule {

		public async addContentToFolder(userId, contentId, folderId) {
			await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
			const content = await app.database.getContent(contentId);
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
				const contentFiles = await app.database.getFileCatalogItemsByContent(userId, content.id, FileCatalogItemType.File);
				if (contentFiles.length) {
					return content;
				}

				let folder = await app.database.getFileCatalogItemByDefaultFolderFor(userId, baseType);

				if (!folder) {
					folder = await app.database.addFileCatalogItem({
						name: _.upperFirst(baseType) + " Uploads",
						type: FileCatalogItemType.Folder,
						position: (await app.database.getFileCatalogItemsCount(userId, null)) + 1,
						defaultFolderFor: baseType,
						userId
					});
				}
				parentItemId = folder.id;
			}

			if (parentItemId === 'null') {
				parentItemId = null;
			}

			if (await app.database.isFileCatalogItemExistWithContent(userId, parentItemId, content.id)) {
				console.log(`Content ${content.id} already exists in folder`);
				return;
			}

			const resultItem = await app.database.addFileCatalogItem({
				name: content.name || "Unnamed " + new Date().toISOString(),
				type: FileCatalogItemType.File,
				position: (await app.database.getFileCatalogItemsCount(userId, parentItemId)) + 1,
				contentId: content.id,
				size: content.size,
				groupId,
				parentItemId,
				userId
			});

			if (parentItemId) {
				const size = await app.database.getFileCatalogItemsSizeSum(parentItemId);
				await app.database.updateFileCatalogItem(parentItemId, {size});
			}

			return resultItem;
		}

		async createUserFolder(userId, parentItemId, folderName) {
			await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
			return app.database.addFileCatalogItem({
				name: folderName,
				type: FileCatalogItemType.Folder,
				position: (await app.database.getFileCatalogItemsCount(userId, parentItemId)) + 1,
				size: 0,
				parentItemId,
				userId
			});
		}

		public async updateFileCatalogItem(userId, fileCatalogId, updateData) {
			await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
			const fileCatalogItem = await app.database.getFileCatalogItem(fileCatalogId);
			if (fileCatalogItem.userId !== userId) {
				throw new Error("not_permitted");
			}
			await app.database.updateFileCatalogItem(fileCatalogId, updateData);
			return app.database.getFileCatalogItem(fileCatalogId);
		}

		async getFileCatalogItems(userId, parentItemId, type?, search = '', listParams?: IListParams) {
			listParams = this.prepareListParams(listParams);
			await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
			if (parentItemId == 'null') {
				parentItemId = null;
			}
			if (_.isUndefined(parentItemId) || parentItemId === 'undefined')
				parentItemId = undefined;

			return {
				list: await app.database.getFileCatalogItems(userId, parentItemId, type, search, listParams),
				total: await app.database.getFileCatalogItemsCount(userId, parentItemId, type, search)
			};
		}

		async getFileCatalogItemsBreadcrumbs(userId, itemId) {
			await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
			const item = await app.database.getFileCatalogItem(itemId);
			if (item.userId != userId) {
				throw new Error("not_permitted");
			}

			return app.database.getFileCatalogItemsBreadcrumbs(itemId);
		}

		async getContentsIdsByFileCatalogIds(catalogIds) {
			return app.database.getContentsIdsByFileCatalogIds(catalogIds);
		}

		public async makeFolderStorageDir(fileCatalogItem: IFileCatalogItem) {
			const breadcrumbs = await this.getFileCatalogItemsBreadcrumbs(fileCatalogItem.userId, fileCatalogItem.id);

			// breadcrumbs.push(fileCatalogItem);

			const {storageAccountId: userStaticId} = await app.database.getUser(fileCatalogItem.userId);

			const path = `/${userStaticId}/` + breadcrumbs.map(b => b.name).join('/') + '/';

			await app.storage.makeDir(path);

			return path;
		}

		public async makeFolderChildrenStorageDirsAndCopyFiles(fileCatalogItem, storageDirPath) {
			const fileCatalogChildrenFolders = await app.database.getFileCatalogItems(fileCatalogItem.userId, fileCatalogItem.id, FileCatalogItemType.Folder);

			await pIteration.forEachSeries(fileCatalogChildrenFolders, async (fItem: IFileCatalogItem) => {
				const sPath = await this.makeFolderStorageDir(fItem);
				return this.makeFolderChildrenStorageDirsAndCopyFiles(fItem, sPath)
			});

			const fileCatalogChildrenFiles = await app.database.getFileCatalogItems(fileCatalogItem.userId, fileCatalogItem.id, FileCatalogItemType.File);

			await pIteration.forEachSeries(fileCatalogChildrenFiles, async (fileCatalogItem: IFileCatalogItem) => {
				await app.storage.copyFileFromId(fileCatalogItem.content.storageId, storageDirPath + fileCatalogItem.name);
			});
		}

		public async publishFolder(userId, fileCatalogId, options: {bindToStatic?} = {}) {
			await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
			const fileCatalogItem = await app.database.getFileCatalogItem(fileCatalogId);

			const storageDirPath = await this.makeFolderStorageDir(fileCatalogItem);

			await this.makeFolderChildrenStorageDirsAndCopyFiles(fileCatalogItem, storageDirPath);

			const storageId = await app.storage.getDirectoryId(storageDirPath);

			const user = await app.database.getUser(userId);

			if(!options.bindToStatic) {
				return { storageId };
			}

			const staticId = await app.createStorageAccount(user.name + '@directory:' + storageDirPath);
			await app.bindToStaticId(storageId, staticId);

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
				const foundItems = await app.database.getFileCatalogItems(userId, currentFolderId, FileCatalogItemType.Folder, name);

				if (foundItems.length) {
					currentFolderId = foundItems[0].id;
				} else if (createFoldersIfNotExists) {
					const newFileCatalogFolder = await app.database.addFileCatalogItem({
						name,
						userId,
						type: FileCatalogItemType.Folder,
						position: (await app.database.getFileCatalogItemsCount(userId, currentFolderId)) + 1,
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

			const results = await app.database.getFileCatalogItems(userId, currentFolderId, type, lastItemName);
			if (results.length > 1) {
				await pIteration.forEach(results.slice(1), item => app.database.updateFileCatalogItem(item.id, {isDeleted: true}));
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

			const content = await app.database.getContent(contentId);
			if (fileItem) {
				console.log('saveContentByPath', 'fileItem.name:', fileItem.name, contentId);
				await app.database.updateFileCatalogItem(fileItem.id, {contentId, size: content.size});
			} else {
				console.log('saveContentByPath', 'addFileCatalogItem', fileName, contentId);
				fileItem = await app.database.addFileCatalogItem({
					userId,
					contentId,
					name: fileName,
					type: FileCatalogItemType.File,
					position: (await app.database.getFileCatalogItemsCount(userId, lastFolderId)) + 1,
					parentItemId: lastFolderId,
					groupId: options.groupId,
					size: content.size
				});
			}
			if (fileItem.parentItemId) {
				const size = await app.database.getFileCatalogItemsSizeSum(fileItem.parentItemId);
				await app.database.updateFileCatalogItem(fileItem.parentItemId, {size});
			}
			return app.database.getFileCatalogItem(fileItem.id);
		}

		public async saveManifestsToFolder(userId, folderPath, toSaveList: ManifestToSave[], options: { groupId? } = {}) {
			await pIteration.map(toSaveList, async (item: ManifestToSave) => {
				const content = await app.createContentByRemoteStorageId(item.manifestStorageId, {
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
			return fileCatalogItem ? await app.database.getContent(fileCatalogItem.contentId) : null;
		}

		public async getFileCatalogItemByPath(userId, path, type: FileCatalogItemType) {
			await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
			const {foundCatalogItem: fileCatalogItem} = await this.findCatalogItemByPath(userId, path, type);
			return fileCatalogItem;
		}

		public async deleteFileCatalogItem(userId, itemId, options: { deleteContent? } = {}) {
			await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
			const fileCatalogItem = await app.database.getFileCatalogItem(itemId);
			if (fileCatalogItem.userId != userId) {
				throw new Error("not_permitted");
			}

			if(options.deleteContent) {
				const content = await app.database.getContent(fileCatalogItem.contentId);
				if (content.userId != userId) {
					throw new Error("not_permitted");
				}
				await app.storage.unPin(content.storageId).catch(() => {/*not pinned*/});
				await app.storage.remove(content.storageId).catch(() => {/*not found*/});

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