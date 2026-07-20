import debug from 'debug';
import type {IGeesomeApp} from '../../interface.js';
import {
	ContentView,
	CorePermissionName,
	IContent,
	IListParams,
} from '../database/interface.js';
import {PostStatus} from '../group/interface.js';
import {
	IMAGE_COMPOSITION_POST_TYPE,
	IMAGE_COMPOSITION_VERSION,
	IMAGE_COMPOSITION_VIEW,
	StoredImageComposition,
} from './contract.js';
import {
	assertRasterBaseContent,
	buildResolvedImageComposition,
	canViewImageCompositionGroup,
	doesStoredCompositionMatchCreate,
	getImageCompositionProperties,
	ImageCompositionApiError,
	normalizeImageCompositionCreateInput,
	normalizeImageCompositionUpdateInput,
	parseStoredImageComposition,
} from './helpers.js';
import {generateImageCompositionStickerSvg} from './svg.js';
import {
	createImageCompositionOperationRepository,
	createImageCompositionRequestHash,
} from './operationRepository.js';
import type IGeesomeImageCompositionModule from './interface.js';

const log = debug('geesome:app:image-composition');

function doesStoredCompositionMatchUpdate(composition: StoredImageComposition, input): boolean {
	if (composition.output.width !== input.output.width || composition.output.height !== input.output.height) {
		return false;
	}
	if (composition.stickers.length !== input.stickers.length) {
		return false;
	}
	const semanticFields = ['id', 'kind', 'template', 'text', 'x', 'y', 'width', 'height', 'rotationDeg', 'zIndex'];
	return input.stickers.every((sticker, index) => {
		const stored = composition.stickers[index];
		return semanticFields.every(field => stored?.[field] === sticker[field]);
	});
}

function isImageCompositionEntityUniqueError(error): boolean {
	if ((error as any)?.name !== 'SequelizeUniqueConstraintError') {
		return false;
	}
	return [
		(error as any)?.parent?.constraint,
		(error as any)?.original?.constraint,
	].includes('posts_group_type_entity_unique');
}

export default async function initImageCompositionModule(app: IGeesomeApp) {
	app.checkModules(['database', 'api', 'content', 'group', 'asyncOperation']);
	const models = await (await import('./models/index.js')).default(app.ms.database.sequelize, app.ms.database.models);
	const module = getModule(app, models);
	(await import('./api.js')).default(app, module);
	return module;
}

export function getModule(app: IGeesomeApp, models): IGeesomeImageCompositionModule {
	const operations = createImageCompositionOperationRepository(app.ms.database.sequelize, models);

	class ImageCompositionModule implements IGeesomeImageCompositionModule {
		async createImageComposition(userId: number, rawInput) {
			const input = normalizeImageCompositionCreateInput(rawInput);
			const [, canCreate] = await Promise.all([
				app.checkUserCan(userId, CorePermissionName.UserGroupManagement),
				app.ms.group.canCreatePostInGroup(userId, input.groupId),
			]);
			if (!canCreate) {
				throw new ImageCompositionApiError('composition_not_permitted', 403);
			}
			const baseContent = await this.getPermittedBase(userId, input.baseContentManifestId);
			const operation = await this.claimOperation(userId, 'create', input.compositionId, input);
			if (operation.replay) {
				return operation.response;
			}
			const postIdentityWhere = {
				groupId: input.groupId,
				type: IMAGE_COMPOSITION_POST_TYPE,
				entityId: input.compositionId,
				isDeleted: false,
			};
			const recoverExistingPost = async (existingPost, options: {allowFreshOperation?: boolean; repairManifest?: boolean} = {}) => {
				if (Number(existingPost.userId) !== Number(userId)) {
					throw new ImageCompositionApiError('composition_idempotency_conflict', 409);
				}
				const recoveredPost = await app.ms.group.getPostPure(existingPost.id);
				const recoveredComposition = parseStoredImageComposition(recoveredPost);
				if ((!options.allowFreshOperation && operation.attemptCount <= 1)
					|| !doesStoredCompositionMatchCreate(recoveredComposition, input)) {
					throw new ImageCompositionApiError('composition_idempotency_conflict', 409);
				}
				const repairedPost = options.repairManifest === false
					? recoveredPost
					: await app.ms.group.applyPostManifestUpdate(userId, recoveredPost, recoveredPost.group);
				const response = buildResolvedImageComposition(repairedPost, recoveredComposition);
				await operations.succeed(operation.id, operation.claimToken, {
					postId: response.postId,
					revision: response.revision,
					response,
				});
				return response;
			};

			try {
				const existingPost = await models.Post.findOne({where: postIdentityWhere});
				if (existingPost) {
					return recoverExistingPost(existingPost);
				}
				const storedStickers = [];
				const stickerContents: IContent[] = [];
				for (const sticker of input.stickers) {
					const generated = generateImageCompositionStickerSvg(sticker);
					const content = await app.ms.content.saveData(
						userId,
						generated.svg,
						`composition-${input.compositionId}-${sticker.id}.svg`,
						{
							mimeType: generated.mimeType,
							view: ContentView.Attachment,
							driver: {raw: true},
							properties: {
								source: 'image-composition-v1',
								semanticHash: generated.semanticHash,
								templateVersion: generated.templateVersion,
							},
						},
					);
					stickerContents.push(content);
					storedStickers.push({
						...sticker,
						templateVersion: generated.templateVersion,
						contentManifestId: content.manifestStorageId,
						semanticHash: generated.semanticHash,
					});
				}
				const composition: StoredImageComposition = {
					version: IMAGE_COMPOSITION_VERSION,
					compositionId: input.compositionId,
					revision: 1,
					baseContentManifestId: input.baseContentManifestId,
					output: input.output,
					stickers: storedStickers,
				};
				let post;
				try {
					post = await app.ms.group.createPost(userId, {
						groupId: input.groupId,
						status: PostStatus.Published,
						type: IMAGE_COMPOSITION_POST_TYPE,
						view: IMAGE_COMPOSITION_VIEW,
						entityId: input.compositionId,
						propertiesJson: getImageCompositionProperties(composition),
						contents: [
							{id: baseContent.id, view: ContentView.Media},
							...stickerContents.map(content => ({id: content.id, view: ContentView.Attachment})),
						],
					}, {asyncDerivedState: false});
				} catch (error) {
					if (!isImageCompositionEntityUniqueError(error)) {
						throw error;
					}
					const concurrentPost = await models.Post.findOne({where: postIdentityWhere});
					if (!concurrentPost) {
						throw error;
					}
					return recoverExistingPost(concurrentPost, {allowFreshOperation: true, repairManifest: false});
				}
				const response = buildResolvedImageComposition(post, composition);
				await operations.succeed(operation.id, operation.claimToken, {
					postId: response.postId,
					revision: response.revision,
					response,
				});
				return response;
			} catch (error) {
				await this.failOperation(operation, error);
				throw error;
			}
		}

		async updateImageComposition(userId: number, postId, rawInput) {
			const input = normalizeImageCompositionUpdateInput(rawInput);
			const oldPost = await app.ms.group.getPostPure(postId);
			if (!oldPost) {
				throw new ImageCompositionApiError('composition_not_found', 404);
			}
			const current = parseStoredImageComposition(oldPost);
			const [, canEdit] = await Promise.all([
				app.checkUserCan(userId, CorePermissionName.UserGroupManagement),
				app.ms.group.canEditPostInGroup(userId, oldPost.groupId, oldPost.id),
			]);
			if (!canEdit) {
				throw new ImageCompositionApiError('composition_not_permitted', 403);
			}
			if (current.output.width !== input.output.width || current.output.height !== input.output.height) {
				throw new ImageCompositionApiError('composition_invalid', 422, {field: 'output'});
			}
			const operation = await this.claimOperation(userId, 'update', String(oldPost.id), input);
			if (operation.replay) {
				return operation.response;
			}
			if (current.revision !== input.expectedRevision) {
				if (operation.attemptCount > 1 && current.revision === input.expectedRevision + 1 && doesStoredCompositionMatchUpdate(current, input)) {
					const repairedPost = await app.ms.group.applyPostManifestUpdate(userId, oldPost, oldPost.group);
					const response = buildResolvedImageComposition(repairedPost, current);
					await operations.succeed(operation.id, operation.claimToken, {postId: response.postId, revision: response.revision, response});
					return response;
				}
				const conflict = new ImageCompositionApiError('composition_revision_conflict', 409, {currentRevision: current.revision});
				await this.failOperation(operation, conflict);
				throw conflict;
			}

			try {
				const contentsByManifest = new Map((oldPost.contents || []).map(content => [content.manifestStorageId, content]));
				const baseContent = contentsByManifest.get(current.baseContentManifestId);
				assertRasterBaseContent(baseContent || null);
				const oldStickers = new Map(current.stickers.map(sticker => [sticker.id, sticker]));
				const nextStickers = [];
				const nextContents: IContent[] = [];
				for (const sticker of input.stickers) {
					const generated = generateImageCompositionStickerSvg(sticker);
					const oldSticker = oldStickers.get(sticker.id);
					let content = oldSticker?.semanticHash === generated.semanticHash
						? contentsByManifest.get(oldSticker.contentManifestId)
						: null;
					if (!content) {
						content = await app.ms.content.saveData(
							userId,
							generated.svg,
							`composition-${current.compositionId}-${sticker.id}-r${current.revision + 1}.svg`,
							{
								mimeType: generated.mimeType,
								view: ContentView.Attachment,
								driver: {raw: true},
								properties: {
									source: 'image-composition-v1',
									semanticHash: generated.semanticHash,
									templateVersion: generated.templateVersion,
								},
							},
						);
					}
					nextContents.push(content);
					nextStickers.push({
						...sticker,
						templateVersion: generated.templateVersion,
						contentManifestId: content.manifestStorageId,
						semanticHash: generated.semanticHash,
					});
				}
				const composition: StoredImageComposition = {...current, revision: current.revision + 1, stickers: nextStickers};
				const post = await app.ms.group.updatePostPure(userId, oldPost.id, {
					propertiesJson: getImageCompositionProperties(composition),
					contents: [
						{id: baseContent.id, view: ContentView.Media},
						...nextContents.map(content => ({id: content.id, view: ContentView.Attachment})),
					],
				}, {
					oldPost,
					asyncDerivedState: false,
					expectedPropertiesJson: oldPost.propertiesJson,
					createPropertiesConflictError: lockedPost => {
						const locked = parseStoredImageComposition(lockedPost);
						return new ImageCompositionApiError('composition_revision_conflict', 409, {currentRevision: locked.revision});
					},
				});
				const response = buildResolvedImageComposition(post, composition);
				await operations.succeed(operation.id, operation.claimToken, {postId: response.postId, revision: response.revision, response});
				return response;
			} catch (error) {
				await this.failOperation(operation, error);
				throw error;
			}
		}

		async getImageComposition(userId: number, postId) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			const post = await app.ms.group.getPostPure(postId);
			if (!post || post.isDeleted || post.status !== PostStatus.Published) {
				throw new ImageCompositionApiError('composition_not_found', 404);
			}
			if (!(await this.canViewGroup(userId, post.group))) {
				throw new ImageCompositionApiError('composition_not_permitted', 403);
			}
			return buildResolvedImageComposition(post);
		}

		async getImageCompositions(userId: number, groupId, filters = {}, listParams?: IListParams) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			groupId = await app.ms.group.checkGroupId(groupId);
			const group = await app.ms.group.getGroup(groupId);
			if (!(await this.canViewGroup(userId, group))) {
				throw new ImageCompositionApiError('composition_not_permitted', 403);
			}
			const result = await app.ms.group.getGroupPosts(groupId, {
				...filters,
				type: IMAGE_COMPOSITION_POST_TYPE,
				status: PostStatus.Published,
				isDeleted: false,
			}, listParams, {emitInitialCursor: true});
			return {
				...result,
				list: result.list.flatMap(post => {
					try {
						return [buildResolvedImageComposition(post)];
					} catch (error) {
						if (error instanceof ImageCompositionApiError) {
							return [];
						}
						throw error;
					}
				}),
			};
		}

		async canViewGroup(userId: number, group) {
			if (!group) return false;
			if (group.isPublic) return true;
			const [isMember, isAdmin] = await Promise.all([
				app.ms.group.isMemberInGroup(userId, group.id),
				app.ms.group.isAdminInGroup(userId, group.id),
			]);
			return canViewImageCompositionGroup(group, isMember, isAdmin);
		}

		async getPermittedBase(userId: number, manifestStorageId: string): Promise<IContent> {
			let content = await app.ms.database.getContentByManifestAndUserId(manifestStorageId, userId);
			if (!content) {
				content = await app.ms.database.getContentByManifestId(manifestStorageId);
				if (content && !content.isPublic) {
					throw new ImageCompositionApiError('composition_content_not_permitted', 403);
				}
			}
			assertRasterBaseContent(content);
			return content;
		}

		async claimOperation(userId: number, operationKind: 'create' | 'update', targetKey: string, request) {
			const identity = {actorUserId: userId, operationKind, targetKey, idempotencyKey: request.idempotencyKey};
			let claim;
			try {
				claim = await operations.claim({...identity, requestHash: createImageCompositionRequestHash(request)});
			} catch (error) {
				if ((error as Error).message === 'composition_idempotency_conflict') {
					throw new ImageCompositionApiError('composition_idempotency_conflict', 409);
				}
				throw error;
			}
			if (claim.disposition === 'replay') return {replay: true, response: claim.result?.response};
			if (claim.disposition === 'claimed') {
				return {replay: false, id: claim.operation.id, claimToken: claim.claimToken, attemptCount: Number(claim.operation.attemptCount) || 1};
			}
			for (let attempt = 0; attempt < 50; attempt += 1) {
				await new Promise(resolve => setTimeout(resolve, 100));
				const pending = await operations.find(identity);
				if (pending?.state === 'succeeded') {
					return {replay: true, response: pending.resultJson ? JSON.parse(pending.resultJson) : undefined};
				}
				if (pending?.state === 'failed') {
					const reclaimed = await operations.claim({...identity, requestHash: createImageCompositionRequestHash(request)});
					if (reclaimed.disposition === 'claimed') {
						return {replay: false, id: reclaimed.operation.id, claimToken: reclaimed.claimToken, attemptCount: Number(reclaimed.operation.attemptCount) || 1};
					}
				}
			}
			throw new ImageCompositionApiError('composition_idempotency_conflict', 409, {retryable: true});
		}

		async failOperation(operation, error) {
			try {
				await operations.fail(operation.id, operation.claimToken, error instanceof ImageCompositionApiError ? error.errorCode : 'composition_storage_failed');
			} catch (claimError) {
				log('failed to record image composition operation failure', claimError);
			}
		}

		async flushDatabase() {
			await models.ImageCompositionOperation.destroy({where: {}});
		}
	}

	return new ImageCompositionModule();
}
