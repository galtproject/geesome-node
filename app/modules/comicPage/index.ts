import sharp from 'sharp';
import {randomUUID, createHash} from 'node:crypto';
import {Op} from 'sequelize';
import type {IGeesomeApp} from '../../interface.js';
import {ContentView, CorePermissionName, ContentDependencyRole} from '../database/interface.js';
import {FileCatalogItemType} from '../fileCatalog/interface.js';
import {ComicPageError, ComicPageReceipt} from './contract.js';
import {hash, identity, normalize, validatePng} from './validation.js';
import type IGeesomeComicPageModule from './interface.js';

const LEASE_MS = 5 * 60_000;

export default async function init(app: IGeesomeApp) {
	app.checkModules(['database', 'api', 'content', 'fileCatalog']);
	const models = app.ms.database.models;
	await (await import('./model.js')).default(app.ms.database.sequelize, models);
	const module = getModule(app, models);
	(await import('./api.js')).default(app, module);
	return module;
}

export function getModule(app: IGeesomeApp, models): IGeesomeComicPageModule {
	const sequelize = app.ms.database.sequelize;
	const Operation = models.ComicPageOperation;
	class ComicPageModule implements IGeesomeComicPageModule {
		async create(userId, raw) {
			await app.checkUserCan(userId, CorePermissionName.UserSaveData);
			await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
			let input;
			try {
				input = normalize(raw);
			} catch (error) {
				throw error instanceof ComicPageError ? error : new ComicPageError('comic_page_invalid');
			}
			const folder = await models.FileCatalogItem.findOne({where: {id: input.folderId, userId, type: FileCatalogItemType.Folder, isDeleted: false}});
			if (!folder) {
				throw new ComicPageError('comic_page_folder_not_permitted', 403);
			}
			const sources = [];
			for (const source of input.recipe.sourceAssets) {
				let content = await app.ms.database.getContentByManifestAndUserId(source.originalManifestId, userId);
				if (!content) {
					content = await app.ms.database.getContentByManifestId(source.originalManifestId);
					if (content && !content.isPublic) {
						throw new ComicPageError('comic_page_source_not_permitted', 403);
					}
				}
				if (!content || content.isDeleted || (content as any).isEncrypted || !/^image\/(png|jpeg|webp|gif|avif)$/.test(content.mimeType)) {
					throw new ComicPageError('comic_page_source_not_found', 404);
				}
				if (source.storageId !== content.storageId) {
					throw new ComicPageError('comic_page_source_mismatch');
				}
				let dimensions;
				try {
					dimensions = JSON.parse(content.propertiesJson || '{}') || {};
				} catch (_) {
					dimensions = {};
				}
				if (!dimensions.width || !dimensions.height) {
					if (Number(content.size) > 100_000_000) {
						throw new ComicPageError('comic_page_render_limit');
					}
					try {
						dimensions = await sharp(Buffer.from(await app.ms.storage.getFileData(content.storageId)), {limitInputPixels: 64_000_000}).metadata();
					} catch (_) {
						throw new ComicPageError('comic_page_source_mismatch');
					}
				}
				if (dimensions.width !== source.width || dimensions.height !== source.height) {
					throw new ComicPageError('comic_page_source_mismatch');
				}
				sources.push(content);
			}
			if (input.previousVersionRef) {
				const prior = await this.detail(userId, input.previousVersionRef);
				if (prior.comicId !== input.comicId || prior.pageId !== input.pageId || prior.pageRevision !== input.pageRevision - 1) {
					throw new ComicPageError('comic_page_revision_conflict', 409);
				}
			}
			const png = await validatePng(input.pngBase64, input.recipe.canvas);
			const requestHash = hash(input);
			const claimToken = randomUUID();
			try {
				await Operation.create({userId, idempotencyKey: input.idempotencyKey, comicId: input.comicId,
					pageId: input.pageId, pageRevision: input.pageRevision, requestHash, status: 'pending',
					claimToken, claimExpiresAt: new Date(Date.now() + LEASE_MS)});
			} catch (error) {
				if (error?.name !== 'SequelizeUniqueConstraintError') {
					throw error;
				}
			}
			const operation = await sequelize.transaction(async transaction => {
				const row = await Operation.findOne({where: {userId, idempotencyKey: input.idempotencyKey}, transaction, lock: transaction.LOCK.UPDATE});
				if (!row || row.requestHash !== requestHash) {
					throw new ComicPageError('comic_page_idempotency_conflict', 409);
				}
				if (row.status === 'succeeded') {
					return row;
				}
				if (row.claimToken !== claimToken && row.status === 'pending' && new Date(row.claimExpiresAt).getTime() > Date.now()) {
					throw new ComicPageError('comic_page_operation_pending', 409);
				}
				await row.update({status: 'pending', claimToken, claimExpiresAt: new Date(Date.now() + LEASE_MS), errorCode: null}, {transaction});
				return row;
			});
			if (operation.status === 'succeeded') {
				return JSON.parse(operation.receiptJson);
			}
			let recovery = JSON.parse(operation.recoveryJson || '{}');
			const checkpoint = async (changes, contentId?) => {
				recovery = {...recovery, ...changes};
				const [updated] = await Operation.update({recoveryJson: JSON.stringify(recovery), ...(contentId ? {contentId} : {}), claimExpiresAt: new Date(Date.now() + LEASE_MS)},
					{where: {id: operation.id, claimToken, status: 'pending'}});
				if (!updated) {
					throw new ComicPageError('comic_page_operation_pending', 409);
				}
			};
			try {
				const bubbles = [];
				const bubbleContents = [];
				for (const bubble of input.bubbles) {
					const content = await app.ms.content.saveData(userId, bubble.svg, `comic-bubble-${bubble.id}.svg`, {
						mimeType: 'image/svg+xml', driver: {raw: true}, skipFileCatalog: true,
					});
					bubbleContents.push(content);
					bubbles.push({id: bubble.id, contentManifestId: content.manifestStorageId,
						svgHash: `sha256:${createHash('sha256').update(bubble.svg).digest('hex')}`, url: `/ipfs/${content.storageId}`});
				}
				await checkpoint({bubbles});
				let composite = operation.contentId ? await models.Content.findByPk(operation.contentId) : null;
				if (!composite) {
					const candidates = await models.Content.findAll({where: {userId, propertiesJson: {[Op.like]: `%${requestHash}%`}}, order: [['id', 'DESC']], limit: 20});
					composite = candidates.find(candidate => {
						const saved = JSON.parse(candidate.propertiesJson || '{}').comicPageOperation;
						return saved?.requestHash === requestHash;
					});
				}
				if (!composite) {
					composite = await app.ms.content.saveData(userId, png, `comic-${input.comicId}-${input.pageId}-r${input.pageRevision}.png`, {
						mimeType: 'image/png', view: ContentView.Media, forceNewContentEntity: true, requirePreview: true,
						properties: {comicPage: input.recipe, comicPageAssets: {bubbles}, comicPageOperation: {requestHash}},
						skipFileCatalog: true,
					});
				}
				if (!composite.mediumPreviewStorageId) {
					throw new ComicPageError('comic_page_preview_failed');
				}
				await checkpoint({contentManifestId: composite.manifestStorageId}, composite.id);
				await app.ms.database.syncContentDependencies(composite.id, [
					...sources.map((content, position) => ({childContentId: content.id, role: ContentDependencyRole.ComicPageSource, position})),
					...bubbleContents.map((content, position) => ({childContentId: content.id, role: ContentDependencyRole.ComicPageBubble, position})),
				]);
				return await sequelize.transaction(async transaction => {
					const row = await Operation.findByPk(operation.id, {transaction, lock: transaction.LOCK.UPDATE});
					if (row.claimToken !== claimToken || row.status !== 'pending') {
						throw new ComicPageError('comic_page_operation_pending', 409);
					}
					const parent = await models.FileCatalogItem.findOne({where: {id: input.folderId, userId, type: FileCatalogItemType.Folder, isDeleted: false}, transaction, lock: transaction.LOCK.UPDATE});
					if (!parent) {
						throw new ComicPageError('comic_page_folder_not_permitted', 403);
					}
					const item = await models.FileCatalogItem.create({userId, parentItemId: input.folderId, contentId: composite.id,
						name: `comic-${input.comicId}-${input.pageId}-r${input.pageRevision}.png`, type: FileCatalogItemType.File,
						view: ContentView.Media, size: composite.size, position: input.recipe.pageNumber || 1, isDeleted: false}, {transaction});
					const receipt = buildReceipt(composite, item.id);
					await row.update({status: 'succeeded', receiptJson: JSON.stringify(receipt), contentId: composite.id, fileCatalogItemId: item.id, claimToken: null, claimExpiresAt: null}, {transaction});
					await parent.increment({size: Number(composite.size)}, {transaction});
					return receipt;
				});
			} catch (error) {
				await Operation.update({status: 'failed', errorCode: error instanceof ComicPageError ? error.errorCode : 'comic_page_storage_failed'}, {where: {id: operation.id, claimToken, status: 'pending'}});
				throw error;
			}
		}

		async detail(userId, manifest) {
			identity(manifest, 200);
			let content = await app.ms.database.getContentByManifestAndUserId(manifest, userId);
			if (!content || !JSON.parse(content.propertiesJson || '{}').comicPage) {
				throw new ComicPageError('comic_page_not_found', 404);
			}
			const recipe = JSON.parse(content.propertiesJson).comicPage;
			const row = await Operation.findOne({where: {userId, comicId: recipe.comicId, pageId: recipe.pageId, pageRevision: recipe.pageRevision, status: 'succeeded'}});
			if (!row) {
				throw new ComicPageError('comic_page_not_found', 404);
			}
			content = await models.Content.findByPk(row.contentId);
			if (!content || content.isDeleted || content.manifestStorageId !== manifest) {
				throw new ComicPageError('comic_page_not_found', 404);
			}
			return buildReceipt(content, row.fileCatalogItemId);
		}

		async operation(userId, key) {
			identity(key, 200);
			const row = await Operation.findOne({where: {userId, idempotencyKey: key}});
			if (!row) {
				throw new ComicPageError('comic_page_operation_not_found', 404);
			}
			return {status: row.status, canResume: row.status === 'failed' || (row.status === 'pending' && new Date(row.claimExpiresAt).getTime() <= Date.now()), ...(row.receiptJson ? {receipt: JSON.parse(row.receiptJson)} : {}), ...(row.errorCode ? {errorCode: row.errorCode} : {})};
		}

		async flushDatabase() {
			await Operation.destroy({where: {}});
		}
	}
	return new ComicPageModule();
}

function buildReceipt(content, fileCatalogItemId): ComicPageReceipt {
	const properties = JSON.parse(content.propertiesJson);
	const recipe = properties.comicPage;
	return {comicId: recipe.comicId, pageId: recipe.pageId, pageRevision: recipe.pageRevision,
		recipeHash: hash(recipe), fileCatalogItemId, contentManifestId: content.manifestStorageId,
		storageId: content.storageId, previewStorageId: content.mediumPreviewStorageId,
		url: `/ipfs/${content.storageId}`, previewUrl: `/ipfs/${content.mediumPreviewStorageId}`,
		width: recipe.canvas.width, height: recipe.canvas.height, recipe,
		bubbles: properties.comicPageAssets.bubbles};
}
