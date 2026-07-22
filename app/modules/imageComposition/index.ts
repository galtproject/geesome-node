import debug from 'debug';
import {Op} from 'sequelize';
import type {IGeesomeApp} from '../../interface.js';
import {
  ContentDependencyRole,
  ContentView,
  CorePermissionName,
  IContent,
} from '../database/interface.js';
import {FileCatalogItemType} from '../fileCatalog/interface.js';
import {
  IMAGE_COMPOSITION_TYPE,
  IMAGE_COMPOSITION_LIMITS,
  IMAGE_COMPOSITION_RENDERER,
  IMAGE_COMPOSITION_VERSION,
  StoredImageComposition,
} from './contract.js';
import {
  assertRasterOriginalContent,
  buildImageCompositionCatalogSummary,
  buildResolvedImageComposition,
  doesRecipeMatchCreate,
  doesRecipeMatchUpdate,
  getImageCompositionRecipeHash,
  ImageCompositionApiError,
  normalizeImageCompositionContentCreateInput,
  normalizeImageCompositionUpdateInput,
  parseImageCompositionContent,
} from './helpers.js';
import {bakeImageComposition} from './raster.js';
import {generateImageCompositionStickerSvg} from './svg.js';
import {createImageCompositionOperationRepository, createImageCompositionRequestHash} from './operationRepository.js';
import type IGeesomeImageCompositionModule from './interface.js';

const log = debug('geesome:app:image-composition');

export default async function initImageCompositionModule(app: IGeesomeApp) {
  app.checkModules(['database', 'api', 'content', 'fileCatalog', 'asyncOperation']);
  const models = await (await import('./models/index.js')).default(app.ms.database.sequelize, app.ms.database.models);
  const module = getModule(app, models);
  (await import('./api.js')).default(app, module);
  return module;
}

export function getModule(app: IGeesomeApp, models): IGeesomeImageCompositionModule {
  const operations = createImageCompositionOperationRepository(app.ms.database.sequelize, models);

  class ImageCompositionModule implements IGeesomeImageCompositionModule {
    async createImageCompositionContent(userId: number, rawInput) {
      await app.checkUserCan(userId, CorePermissionName.UserSaveData);
      const input = normalizeImageCompositionContentCreateInput(rawInput);
      const operation = await this.claimOperation(userId, 'content-create', input.compositionId, input);
      if (operation.replay) return operation.response;
      try {
        const result = await this.createRootComposite(userId, input, operation);
        const catalogItem = await this.ensureCatalogItem(userId, result.identity, result.composite);
        const response = await this.resolveComposite(result.composite, catalogItem);
        await this.succeedOperation(operation, result.composite, response);
        return response;
      } catch (error) {
        await this.failOperation(operation, error);
        throw error;
      }
    }

    async createImageCompositionContentRevision(userId: number, contentManifestId: string, rawInput) {
      await app.checkUserCan(userId, CorePermissionName.UserSaveData);
      const input = normalizeImageCompositionUpdateInput(rawInput);
      const current = await this.getOwnedComposite(userId, contentManifestId);
      const currentRecipe = parseImageCompositionContent(current);
      const identity = await this.getCompositionIdentity(userId, currentRecipe.compositionId);
      const operation = await this.claimOperation(userId, 'content-revision', contentManifestId, input);
      if (operation.replay) return operation.response;
      let currentCatalogItem;
      try {
        currentCatalogItem = await this.getCurrentCatalogItem(userId, identity, current);
      } catch (error) {
        const item = await this.getBoundCatalogItem(userId, identity);
        const active = item ? await models.Content.findByPk(item.contentId) : null;
        if (active && operation.recovery?.compositeContentManifestId === active.manifestStorageId
          && doesRecipeMatchUpdate(parseImageCompositionContent(active), input)) {
          const response = await this.resolveComposite(active, item);
          await this.succeedOperation(operation, active, response);
          return response;
        }
        await this.failOperation(operation, error);
        throw error;
      }
      if (currentRecipe.revision !== input.expectedRevision) {
        const error = revisionConflict(currentRecipe.revision, current.manifestStorageId);
        await this.failOperation(operation, error);
        throw error;
      }
      try {
        const result = await this.createCompositeRevision(userId, current, currentRecipe, input, operation);
        const catalogItem = await this.swapCatalogComposite(userId, identity, currentCatalogItem, current, result.composite);
        const response = await this.resolveComposite(result.composite, catalogItem);
        await this.succeedOperation(operation, result.composite, response);
        return response;
      } catch (error) {
        await this.failOperation(operation, error);
        throw error;
      }
    }

    async getImageCompositionContent(userId: number, contentManifestId: string) {
      await app.checkUserCan(userId, CorePermissionName.UserSaveData);
      const composite = await this.getOwnedComposite(userId, contentManifestId);
      const recipe = parseImageCompositionContent(composite);
      const identity = await this.getCompositionIdentity(userId, recipe.compositionId);
      return this.resolveComposite(composite, await this.getCurrentCatalogItem(userId, identity, composite));
    }

    async getImageCompositionCatalogItems(userId: number, listParams: any = {}) {
      await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
      const allowedSortBy = new Set(['createdAt', 'updatedAt', 'id', 'position', 'name']);
      const sortBy = allowedSortBy.has(listParams.sortBy) ? listParams.sortBy : 'updatedAt';
      const sortDir = String(listParams.sortDir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
      const limit = Math.min(Math.max(Number(listParams.limit) || 50, 1), 200);
      const offset = Math.max(Number(listParams.offset) || 0, 0);
      const itemWhere: any = {userId, type: FileCatalogItemType.File, isDeleted: false};
      if (listParams.search) itemWhere.name = {[Op.like]: `%${String(listParams.search).slice(0, 200)}%`};
      const contentInclude: any = {
        association: 'content',
        required: true,
        where: {
          isDeleted: {[Op.ne]: true},
          mimeType: 'image/png',
          propertiesJson: {[Op.like]: '%"imageComposition":%'},
        },
      };
      const {rows, count} = await models.FileCatalogItem.findAndCountAll({
        where: itemWhere,
        include: [contentInclude],
        order: [[sortBy, sortDir], ['id', sortDir]],
        limit,
        offset,
        distinct: true,
      });
      const dependencyReadiness = await this.getCatalogDependencyReadiness(rows);
      return {
        list: rows.map(item => buildImageCompositionCatalogSummary(
          item,
          dependencyReadiness.get(Number(item.contentId)) !== false,
        )).filter(Boolean),
        total: Number(count),
      };
    }

    async getCatalogDependencyReadiness(items) {
      const recipes = new Map<number, StoredImageComposition>();
      for (const item of items) {
        try { recipes.set(Number(item.contentId), parseImageCompositionContent(item.content)); } catch (_error) {}
      }
      const readiness = new Map<number, boolean>();
      if (!recipes.size) return readiness;
      const edges = await models.ContentDependency.findAll({
        where: {parentContentId: {[Op.in]: [...recipes.keys()]}},
        order: [['parentContentId', 'ASC'], ['role', 'ASC'], ['position', 'ASC']],
      });
      const edgesByParent = new Map<number, any[]>();
      for (const edge of edges) {
        const parentId = Number(edge.parentContentId);
        edgesByParent.set(parentId, [...(edgesByParent.get(parentId) || []), edge]);
      }
      const childIds = [...new Set(edges.map(edge => Number(edge.childContentId)))];
      const children = childIds.length
        ? await models.Content.findAll({where: {id: {[Op.in]: childIds}, isDeleted: {[Op.ne]: true}}})
        : [];
      const childrenById = new Map(children.map(content => [Number(content.id), content]));
      for (const [parentId, recipe] of recipes) {
        const item = items.find(candidate => Number(candidate.contentId) === parentId);
        const composite = item?.content;
        const parentEdges = edgesByParent.get(parentId) || [];
        const originals = parentEdges.filter(edge => edge.role === ContentDependencyRole.ImageCompositionOriginal);
        const stickers = parentEdges.filter(edge => edge.role === ContentDependencyRole.ImageCompositionSticker)
          .sort((left, right) => left.position - right.position);
        const original = originals.length === 1 ? childrenById.get(Number(originals[0].childContentId)) : null;
        const stickerContents = stickers.map(edge => childrenById.get(Number(edge.childContentId)));
        readiness.set(parentId, Boolean(
          composite
          && originals.length === 1
          && originals[0].position === 0
          && stickers.length === recipe.stickers.length
          && stickers.every((edge, index) => edge.position === index)
          && original
          && original.manifestStorageId === recipe.originalContentManifestId
          && (Number(original.userId) === Number(composite.userId) || original.isPublic)
          && stickerContents.every((content, index) => content
            && content.mimeType === 'image/svg+xml'
            && content.manifestStorageId === recipe.stickers[index].contentManifestId
            && Number(content.userId) === Number(composite.userId))
        ));
      }
      return readiness;
    }

    async createRootComposite(userId: number, input, operation) {
      const [identity] = await models.ImageCompositionIdentity.findOrCreate({
        where: {userId, compositionId: input.compositionId},
        defaults: {rootContentId: null, fileCatalogItemId: null},
      });
      if (identity.rootContentId) {
        const root = await models.Content.findByPk(identity.rootContentId);
        const recipe = parseImageCompositionContent(root);
        if (!doesRecipeMatchCreate(recipe, input)) throw new ImageCompositionApiError('composition_idempotency_conflict', 409);
        return {composite: await this.getActiveCompositeForIdentity(userId, identity, root), identity};
      }
      let candidate;
      if (operation.recovery?.compositeContentManifestId) {
        const recovered = await app.ms.database.getContentByManifestAndUserId(operation.recovery.compositeContentManifestId, userId);
        try {
          if (recovered && doesRecipeMatchCreate(parseImageCompositionContent(recovered), input)) {
            candidate = {composite: recovered};
          }
        } catch (_error) {}
      }
      if (!candidate) candidate = await this.createComposite(userId, input, null, operation);
      const winner = await app.ms.database.sequelize.transaction(async transaction => {
        const locked = await models.ImageCompositionIdentity.findByPk(identity.id, {transaction, lock: transaction.LOCK.UPDATE});
        if (!locked.rootContentId) await locked.update({rootContentId: candidate.composite.id}, {transaction});
        return locked.rootContentId || candidate.composite.id;
      });
      const composite = Number(winner) === Number(candidate.composite.id) ? candidate.composite : await models.Content.findByPk(winner);
      const recipe = parseImageCompositionContent(composite);
      if (!doesRecipeMatchCreate(recipe, input)) throw new ImageCompositionApiError('composition_idempotency_conflict', 409);
      return {composite: await this.getActiveCompositeForIdentity(userId, identity, composite), identity};
    }

    async getActiveCompositeForIdentity(userId: number, identity, root) {
      if (!identity.fileCatalogItemId) return root;
      const item = await models.FileCatalogItem.findOne({
        where: {id: identity.fileCatalogItemId, userId, isDeleted: false},
      });
      if (!item || Number(item.contentId) === Number(root.id)) return root;
      const active = await models.Content.findOne({where: {id: item.contentId, userId, isDeleted: {[Op.ne]: true}}});
      if (!active) throw new ImageCompositionApiError('composition_not_found', 404);
      const activeRecipe = parseImageCompositionContent(active);
      if (activeRecipe.compositionId !== parseImageCompositionContent(root).compositionId
        || !(await this.isCompositeInLineage(userId, activeRecipe, root.manifestStorageId))) {
        throw new ImageCompositionApiError('composition_idempotency_conflict', 409);
      }
      return active;
    }

    async createCompositeRevision(userId, currentComposite, currentRecipe, input, operation) {
      const recovered = await this.getRecoveredComposite(userId, operation, input);
      if (recovered) {
        return {composite: recovered};
      }
      return this.createComposite(userId, input, {composite: currentComposite, recipe: currentRecipe}, operation);
    }

    async getRecoveredComposite(userId, operation, input) {
      if (!operation.recovery?.compositeContentManifestId) {
        return null;
      }
      try {
        const recovered = await app.ms.database.getContentByManifestAndUserId(operation.recovery.compositeContentManifestId, userId);
        if (recovered && doesRecipeMatchUpdate(parseImageCompositionContent(recovered), input)) {
          return recovered;
        }
      } catch (_error) {}
      return null;
    }

    async isCompositeInLineage(userId, recipe: StoredImageComposition, ancestorManifestId: string) {
      let current = recipe;
      const visited = new Set<string>();
      while (current.previousCompositeContentManifestId && !visited.has(current.previousCompositeContentManifestId)) {
        const manifestId = current.previousCompositeContentManifestId;
        if (manifestId === ancestorManifestId) {
          return true;
        }
        visited.add(manifestId);
        const content = await app.ms.database.getContentByManifestAndUserId(manifestId, userId);
        if (!content) {
          return false;
        }
        try {
          current = parseImageCompositionContent(content);
        } catch (_error) {
          return false;
        }
      }
      return false;
    }

    async createComposite(userId, input, previous, operation) {
      const original = previous
        ? (await this.resolveDependencies(previous.composite, previous.recipe)).original
        : await this.getPermittedOriginal(userId, input.originalContentManifestId);
      const previousDependencies = previous ? await this.resolveDependencies(previous.composite, previous.recipe) : null;
      const oldStickers = new Map((previous?.recipe.stickers || []).map(sticker => [sticker.id, sticker]));
      const oldContents = new Map((previousDependencies?.stickers || []).map(content => [content.manifestStorageId, content]));
      const storedStickers = [];
      const stickerContents: IContent[] = [];
      const rasterStickers = [];
      for (const sticker of input.stickers) {
        let generated;
        try {
          generated = generateImageCompositionStickerSvg(sticker);
        } catch (_error) {
          throw new ImageCompositionApiError('composition_svg_generation_failed', 500);
        }
        const oldSticker: any = oldStickers.get(sticker.id);
        let content = oldSticker?.semanticHash === generated.semanticHash ? oldContents.get(oldSticker.contentManifestId) : null;
        if (content && !(await this.isVerifiedStickerContent(content, generated))) content = null;
        if (!content) {
          content = await app.ms.content.saveData(userId, generated.svg, `composition-${input.compositionId || previous.recipe.compositionId}-${sticker.id}.svg`, {
            mimeType: generated.mimeType,
            view: ContentView.Attachment,
            driver: {raw: true},
            properties: {source: 'image-composition-v1', semanticHash: generated.semanticHash, templateVersion: generated.templateVersion},
            skipFileCatalog: true,
          });
        }
        stickerContents.push(content);
        rasterStickers.push({...sticker, svg: generated.svg});
        storedStickers.push({...sticker, templateVersion: generated.templateVersion, contentManifestId: content.manifestStorageId, semanticHash: generated.semanticHash});
        await this.checkpoint(operation, {
          ...operation.recovery,
          stickerContentManifestIds: stickerContents.map(savedContent => savedContent.manifestStorageId),
        });
      }
      if (Number(original.size) > IMAGE_COMPOSITION_LIMITS.maxInputBytes) {
        throw new ImageCompositionApiError('composition_render_limit', 422, {field: 'originalBytes'});
      }
      const originalBytes = await app.ms.storage.getFileData(original.storageId);
      const render = previous ? {maxDimension: Math.max(previous.recipe.output.width, previous.recipe.output.height)} : input.render;
      const baked = await bakeImageComposition(toBuffer(originalBytes), rasterStickers, render);
      if (previous && (baked.output.width !== previous.recipe.output.width || baked.output.height !== previous.recipe.output.height)) {
        throw new ImageCompositionApiError('composition_invalid', 422, {field: 'output'});
      }
      const recipeWithoutHash: any = {
        type: IMAGE_COMPOSITION_TYPE,
        version: IMAGE_COMPOSITION_VERSION,
        compositionId: input.compositionId || previous.recipe.compositionId,
        revision: previous ? previous.recipe.revision + 1 : 1,
        ...(previous ? {previousCompositeContentManifestId: previous.composite.manifestStorageId} : {}),
        originalContentManifestId: original.manifestStorageId,
        ...(input.render ? {render: input.render} : previous?.recipe.render ? {render: previous.recipe.render} : {}),
        source: baked.source,
        output: baked.output,
        renderer: IMAGE_COMPOSITION_RENDERER,
        stickers: storedStickers,
      };
      const recipe: StoredImageComposition = {...recipeWithoutHash, recipeHash: getImageCompositionRecipeHash(recipeWithoutHash)};
      let composite;
      try {
        composite = await app.ms.content.saveData(userId, baked.png, `composition-${recipe.compositionId}-r${recipe.revision}.png`, {
          mimeType: 'image/png',
          view: ContentView.Media,
          forceNewContentEntity: true,
          requirePreview: true,
          previews: [{content: baked.previewPng, mimeType: 'image/png', previewSize: 'medium', driver: {raw: true}}],
          properties: {
            imageComposition: recipe,
            imageCompositionAsset: {width: baked.output.width, height: baked.output.height},
          },
          skipFileCatalog: true,
        });
      } catch (error) {
        if ((error as Error).message === 'content_required_preview_failed') {
          throw new ImageCompositionApiError('composition_preview_generation_failed', 422);
        }
        throw error;
      }
      if (!composite.mediumPreviewStorageId || !String(composite.previewMimeType || '').startsWith('image/')) {
        throw new ImageCompositionApiError('composition_preview_generation_failed', 422);
      }
      const dependencies = [
        {childContentId: original.id, role: ContentDependencyRole.ImageCompositionOriginal, position: 0},
        ...stickerContents.map((content, position) => ({childContentId: content.id, role: ContentDependencyRole.ImageCompositionSticker, position})),
      ];
      try {
        await app.ms.database.syncContentDependencies(composite.id, dependencies);
      } catch (error) {
        if ((error as Error).message === 'content_dependency_conflict') throw new ImageCompositionApiError('composition_invalid', 422, {field: 'dependencies'});
        throw error;
      }
      await this.checkpoint(operation, {...operation.recovery, compositeContentManifestId: composite.manifestStorageId, recipeHash: recipe.recipeHash}, composite.id);
      return {composite};
    }

    async resolveComposite(composite, fileCatalogItem) {
      if (!composite.mediumPreviewStorageId || !String(composite.previewMimeType || '').startsWith('image/')) {
        throw new ImageCompositionApiError('composition_invalid', 422, {field: 'preview'});
      }
      const recipe = parseImageCompositionContent(composite);
      const dependencies = await this.resolveDependencies(composite, recipe);
      return buildResolvedImageComposition(composite, recipe, dependencies.original, dependencies.stickers, fileCatalogItem);
    }

    async resolveDependencies(composite, recipe: StoredImageComposition) {
      let edges = await app.ms.database.getContentDependencies(composite.id);
      if (!edges.length) {
        await this.reconcileMissingDependencies(composite, recipe);
        edges = await app.ms.database.getContentDependencies(composite.id);
      }
      const originals = edges.filter(edge => edge.role === ContentDependencyRole.ImageCompositionOriginal);
      const stickers = edges.filter(edge => edge.role === ContentDependencyRole.ImageCompositionSticker).sort((a, b) => a.position - b.position);
      if (originals.length !== 1 || originals[0].position !== 0 || stickers.length !== recipe.stickers.length
        || stickers.some((edge, index) => edge.position !== index)) {
        throw new ImageCompositionApiError('composition_dependency_not_found', 422);
      }
      const ids = [originals[0].childContentId, ...stickers.map(edge => edge.childContentId)];
      const contents = await models.Content.findAll({where: {id: {[Op.in]: ids}, isDeleted: {[Op.ne]: true}}});
      const byId = new Map(contents.map(content => [Number(content.id), content]));
      const original = byId.get(Number(originals[0].childContentId));
      const stickerContents = stickers.map(edge => byId.get(Number(edge.childContentId)));
      assertRasterOriginalContent(original || null);
      if (original.manifestStorageId !== recipe.originalContentManifestId || stickerContents.some((content, index) => !content
        || content.mimeType !== 'image/svg+xml' || content.manifestStorageId !== recipe.stickers[index].contentManifestId)) {
        throw new ImageCompositionApiError('composition_dependency_not_found', 422);
      }
      if ((Number(original.userId) !== Number(composite.userId) && !original.isPublic)
        || stickerContents.some(content => Number(content.userId) !== Number(composite.userId))) {
        throw new ImageCompositionApiError('composition_dependency_not_permitted', 403);
      }
      return {original, stickers: stickerContents};
    }

    async reconcileMissingDependencies(composite, recipe: StoredImageComposition) {
      let original = await app.ms.database.getContentByManifestAndUserId(recipe.originalContentManifestId, composite.userId);
      if (!original) {
        const publicOriginal = await app.ms.database.getContentByManifestId(recipe.originalContentManifestId);
        original = publicOriginal?.isPublic ? publicOriginal : null;
      }
      const stickerContents = await Promise.all(recipe.stickers.map(sticker => {
        return app.ms.database.getContentByManifestAndUserId(sticker.contentManifestId, composite.userId);
      }));
      if (!original || original.isDeleted || stickerContents.some(content => !content || content.isDeleted)) {
        throw new ImageCompositionApiError('composition_dependency_not_found', 422);
      }
      assertRasterOriginalContent(original);
      if ((Number(original.userId) !== Number(composite.userId) && !original.isPublic)
        || stickerContents.some(content => Number(content.userId) !== Number(composite.userId))) {
        throw new ImageCompositionApiError('composition_dependency_not_permitted', 403);
      }
      for (let index = 0; index < recipe.stickers.length; index += 1) {
        const sticker = recipe.stickers[index];
        const content = stickerContents[index];
        let generated;
        try {
          generated = generateImageCompositionStickerSvg(sticker);
        } catch (_error) {
          throw new ImageCompositionApiError('composition_invalid', 422, {field: `stickers.${sticker.id}`});
        }
        if (content.mimeType !== 'image/svg+xml' || generated.semanticHash !== sticker.semanticHash
          || !(await this.isVerifiedStickerContent(content, generated))) {
          throw new ImageCompositionApiError('composition_dependency_not_found', 422, {contentManifestId: sticker.contentManifestId});
        }
      }
      await app.ms.database.syncContentDependencies(composite.id, [
        {childContentId: original.id, role: ContentDependencyRole.ImageCompositionOriginal, position: 0},
        ...stickerContents.map((content, position) => ({
          childContentId: content.id,
          role: ContentDependencyRole.ImageCompositionSticker,
          position,
        })),
      ]);
    }

    async getCompositionIdentity(userId: number, compositionId: string) {
      const identity = await models.ImageCompositionIdentity.findOne({where: {userId, compositionId}});
      if (!identity) throw new ImageCompositionApiError('composition_not_found', 404);
      return identity;
    }

    async ensureCatalogItem(userId: number, identity, composite) {
      await app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
      return app.ms.database.sequelize.transaction(async transaction => {
        const lockedIdentity = await models.ImageCompositionIdentity.findByPk(identity.id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        let item = lockedIdentity.fileCatalogItemId
          ? await models.FileCatalogItem.findOne({
            where: {id: lockedIdentity.fileCatalogItemId, userId, isDeleted: false},
            transaction,
          })
          : null;
        if (item && Number(item.contentId) !== Number(composite.id)) {
          throw new ImageCompositionApiError('composition_revision_conflict', 409);
        }
        if (!item) {
          item = await models.FileCatalogItem.findOne({
            where: {userId, contentId: composite.id, type: FileCatalogItemType.File, isDeleted: false},
            order: [['id', 'ASC']],
            transaction,
          });
        }
        if (!item) {
          item = await app.ms.fileCatalog.addContentToUserFileCatalogInTransaction(userId, composite, transaction);
        }
        if (!item) throw new ImageCompositionApiError('composition_storage_failed', 500);
        if (Number(lockedIdentity.fileCatalogItemId) !== Number(item.id)) {
          await lockedIdentity.update({fileCatalogItemId: item.id}, {transaction});
        }
        return item;
      });
    }

    async getCurrentCatalogItem(userId: number, identity, composite) {
      const item = await this.getBoundCatalogItem(userId, identity);
      if (!item) {
        throw new ImageCompositionApiError('composition_not_found', 404);
      }
      if (Number(item.contentId) !== Number(composite.id)) {
        const activeContent = await models.Content.findByPk(item.contentId);
        try { throw revisionConflict(parseImageCompositionContent(activeContent).revision, activeContent.manifestStorageId); } catch (error) {
          if (error instanceof ImageCompositionApiError) throw error;
          throw new ImageCompositionApiError('composition_not_found', 404);
        }
      }
      return item;
    }

    async getBoundCatalogItem(userId: number, identity) {
      return identity.fileCatalogItemId
        ? models.FileCatalogItem.findOne({where: {id: identity.fileCatalogItemId, userId, isDeleted: false}})
        : null;
    }

    async swapCatalogComposite(userId: number, identity, currentCatalogItem, currentComposite, nextComposite) {
      return app.ms.database.sequelize.transaction(async transaction => {
        const lockedIdentity = await models.ImageCompositionIdentity.findByPk(identity.id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        const item = await models.FileCatalogItem.findOne({
          where: {id: lockedIdentity.fileCatalogItemId, userId, isDeleted: false},
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!item || Number(item.id) !== Number(currentCatalogItem.id)) {
          throw new ImageCompositionApiError('composition_not_found', 404);
        }
        if (Number(item.contentId) === Number(nextComposite.id)) return item;
        if (Number(item.contentId) !== Number(currentComposite.id)) {
          const activeContent = await models.Content.findByPk(item.contentId, {transaction});
          let currentRevision = parseImageCompositionContent(currentComposite).revision + 1;
          try { currentRevision = parseImageCompositionContent(activeContent).revision; } catch (_error) {}
          throw revisionConflict(currentRevision, activeContent?.manifestStorageId);
        }
        await item.update({contentId: nextComposite.id, size: nextComposite.size}, {transaction});
        if (item.parentItemId) {
          const size = await models.FileCatalogItem.sum('size', {
            where: {parentItemId: item.parentItemId, isDeleted: false},
            transaction,
          });
          await models.FileCatalogItem.update({size}, {where: {id: item.parentItemId}, transaction});
        }
        return item;
      });
    }

    async getOwnedComposite(userId, manifestStorageId) {
      const content = await app.ms.database.getContentByManifestAndUserId(manifestStorageId, userId);
      if (!content) throw new ImageCompositionApiError('composition_not_found', 404);
      // Concurrent equivalent creates can produce distinct Content rows with the
      // same portable manifest before the identity winner is known. Always use
      // the catalog-bound row when that manifest is the active composition.
      const recipe = parseImageCompositionContent(content);
      const identity = await models.ImageCompositionIdentity.findOne({
        where: {userId, compositionId: recipe.compositionId},
      });
      if (identity?.fileCatalogItemId) {
        const item = await models.FileCatalogItem.findOne({
          where: {id: identity.fileCatalogItemId, userId, isDeleted: false},
        });
        const active = item
          ? await models.Content.findOne({where: {id: item.contentId, userId, isDeleted: {[Op.ne]: true}}})
          : null;
        if (active?.manifestStorageId === manifestStorageId) return active;
      }
      return content;
    }

    async getPermittedOriginal(userId, manifestStorageId) {
      let content = await app.ms.database.getContentByManifestAndUserId(manifestStorageId, userId);
      if (!content) {
        content = await app.ms.database.getContentByManifestId(manifestStorageId);
        if (content && !content.isPublic) throw new ImageCompositionApiError('composition_content_not_permitted', 403);
      }
      assertRasterOriginalContent(content);
      return content;
    }

    async isVerifiedStickerContent(content, generated) {
      if (!content || content.isDeleted || content.mimeType !== 'image/svg+xml') return false;
      try {
        const bytes = await app.ms.storage.getFileData(content.storageId);
        return toBuffer(bytes).equals(Buffer.from(generated.svg, 'utf8'));
      } catch (_error) {
        return false;
      }
    }

    async claimOperation(userId, operationKind, targetKey, request) {
      const identity = {actorUserId: userId, operationKind, targetKey, idempotencyKey: request.idempotencyKey};
      let claim;
      try {
        claim = await operations.claim({...identity, requestHash: createImageCompositionRequestHash(request)});
      } catch (error) {
        if ((error as Error).message === 'composition_idempotency_conflict') throw new ImageCompositionApiError('composition_idempotency_conflict', 409);
        throw error;
      }
      if (claim.disposition === 'replay') return {replay: true, response: claim.result?.response};
      if (claim.disposition === 'claimed') return this.claimedOperation(claim);
      for (let attempt = 0; attempt < 50; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
        const pending = await operations.find(identity);
        if (pending?.state === 'succeeded') return {replay: true, response: pending.resultJson ? JSON.parse(pending.resultJson) : undefined};
        if (pending?.state === 'failed') {
          const reclaimed = await operations.claim({...identity, requestHash: createImageCompositionRequestHash(request)});
          if (reclaimed.disposition === 'claimed') return this.claimedOperation(reclaimed);
        }
      }
      throw new ImageCompositionApiError('composition_idempotency_conflict', 409, {retryable: true});
    }

    claimedOperation(claim) {
      return {
        replay: false,
        id: claim.operation.id,
        claimToken: claim.claimToken,
        attemptCount: Number(claim.operation.attemptCount) || 1,
        recovery: parseJson(claim.operation.recoveryJson) || {},
      };
    }

    async checkpoint(operation, recovery, candidateContentId?) {
      operation.recovery = recovery;
      await operations.checkpoint(operation.id, operation.claimToken, recovery, candidateContentId);
    }

    async succeedOperation(operation, composite, response) {
      await operations.succeed(operation.id, operation.claimToken, {
        fileCatalogItemId: response.fileCatalogItemId,
        revision: response.revision,
        contentManifestId: composite.manifestStorageId,
        contentId: composite.id,
        response,
      });
    }

    async failOperation(operation, error) {
      try {
        await operations.fail(operation.id, operation.claimToken, error instanceof ImageCompositionApiError ? error.errorCode : 'composition_storage_failed', operation.recovery);
      } catch (claimError) {
        log('failed to record image composition operation failure', claimError);
      }
    }

    async flushDatabase() {
      await models.ImageCompositionIdentity.destroy({where: {}});
      await models.ImageCompositionOperation.destroy({where: {}});
    }
  }

  return new ImageCompositionModule();
}

function parseJson(value) {
  if (!value) return null;
  try { return JSON.parse(value); } catch (_error) { return null; }
}

function toBuffer(value): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value && typeof value.slice === 'function') return Buffer.from(value.slice());
  return Buffer.from(value);
}

function revisionConflict(currentRevision: number, currentContentManifestId?: string) {
  return new ImageCompositionApiError('composition_revision_conflict', 409, {
    currentRevision,
    ...(currentContentManifestId ? {currentContentManifestId} : {}),
  });
}
