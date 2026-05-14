/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import debug from 'debug';
import pIteration from 'p-iteration';
import base36 from "geesome-libs/src/base36.js";
import treeLib from "geesome-libs/src/base36Trie.js";
import ipfsHelper from "geesome-libs/src/ipfsHelper.js";
import {GroupType, IGroup, IPost, PostStatus} from "../group/interface.js";
import IGeesomeEntityJsonManifestModule from "./interface.js";
import {IGroupCategory} from "../groupCategory/interface.js";
import {IContent, IUser} from "../database/interface.js";
import {IGeesomeApp} from "../../interface.js";
const log = debug('geesome:app');
const defaultGroupManifestPostRefsBatchSize = 1000;
const defaultGroupManifestPostIndexPageSize = 1000;
const groupManifestPostIndexType = 'geesome-group-post-index-v1';

function parseInlinePostsLimit(value: any): number {
  if (value === undefined || value === null || value === '') {
    return Number.MAX_SAFE_INTEGER;
  }
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return Math.floor(parsed);
  }
  return Number.MAX_SAFE_INTEGER;
}

const groupManifestInlinePostsLimit = parseInlinePostsLimit(process.env.GROUP_MANIFEST_INLINE_POSTS_LIMIT);

export default async (app: IGeesomeApp) => {
  return getModule(app);
};

function getModule(app: IGeesomeApp) {
  app.checkModules(['database', 'group', 'accountStorage', 'staticId', 'storage']);

  function unsetTreeNode(tree: Record<string, any>, id) {
    if (!tree || !id) {
      return;
    }
    const treePath = treeLib.getTreePath(id);
    const parentStack: Array<{node: Record<string, any>; key: string}> = [];
    let parentNode = tree;
    for (let i = 0; i < treePath.length - 1; i++) {
      const key = treePath[i];
      const nextNode = parentNode[key];
      if (!nextNode || typeof nextNode !== 'object') {
        return;
      }
      parentStack.push({node: parentNode, key});
      parentNode = nextNode;
    }

    delete parentNode[treePath[treePath.length - 1]];
    for (let i = parentStack.length - 1; i >= 0; i--) {
      const {node, key} = parentStack[i];
      if (Object.keys(node[key] || {}).length) {
        break;
      }
      delete node[key];
    }
  }

  function getGroupManifestPostRefsBatchSize(options: any = {}) {
    const batchSize = Number(options.postRefsBatchSize || defaultGroupManifestPostRefsBatchSize);
    if (Number.isFinite(batchSize) && batchSize > 0) {
      return Math.floor(batchSize);
    }
    return defaultGroupManifestPostRefsBatchSize;
  }

  function getGroupManifestPostIndexPageSize(options: any = {}) {
    const pageSize = Number(options.postIndexPageSize || defaultGroupManifestPostIndexPageSize);
    if (Number.isFinite(pageSize) && pageSize > 0) {
      return Math.floor(pageSize);
    }
    return defaultGroupManifestPostIndexPageSize;
  }

  function getGroupManifestPostIndexPageKey(localId: number, pageSize: number): string {
    return String(Math.floor((localId - 1) / pageSize));
  }

  function getGroupManifestInlinePostsLimit(options: any = {}): number {
    if (options.inlinePostsLimit !== undefined) {
      return parseInlinePostsLimit(options.inlinePostsLimit);
    }
    return groupManifestInlinePostsLimit;
  }

  function shouldIncludeInlineGroupManifestPosts(groupData: IGroup, options: any = {}): boolean {
    if (options.includeInlinePosts === false) {
      return false;
    }
    if (options.includeInlinePosts === true) {
      return true;
    }
    const availablePostsCount = Number(groupData.availablePostsCount);
    if (!Number.isFinite(availablePostsCount)) {
      return true;
    }
    return availablePostsCount <= getGroupManifestInlinePostsLimit(options);
  }

  function getPostManifestStorageId(postRef) {
    if (!postRef) {
      return null;
    }
    if (typeof postRef === 'string') {
      return postRef;
    }
    if (postRef['/']) {
      return postRef['/'];
    }
    return null;
  }

  function appendInlineGroupManifestPostRefs(postsTree, refs: Array<{localId: number; manifestStorageId: string}>) {
    for (const [key, value] of Object.entries(postsTree || {})) {
      if (key.endsWith('_')) {
        appendInlineGroupManifestPostRefs(value, refs);
        continue;
      }
      const localId = base36.decode(key);
      const manifestStorageId = getPostManifestStorageId(value);
      if (!Number.isFinite(localId) || localId <= 0 || !manifestStorageId) {
        continue;
      }
      refs.push({localId, manifestStorageId});
    }
  }

  function getInlineGroupManifestPostRefs(postsTree): Array<{localId: number; manifestStorageId: string}> {
    const refs: Array<{localId: number; manifestStorageId: string}> = [];
    appendInlineGroupManifestPostRefs(postsTree, refs);
    return refs.sort((a, b) => a.localId - b.localId);
  }

  function getManifestStorageIdForPostRef(post: IPost): string | null {
    if (!post || !post.localId) {
      return null;
    }
    if (post.isEncrypted) {
      return getPostManifestStorageId(post.encryptedManifestStorageId);
    }
    return getPostManifestStorageId(post.manifestStorageId);
  }

  function normalizeManifestDate(value) {
    if (!value) {
      return value;
    }
    if (value instanceof Date) {
      return value;
    }
    const numericDate = typeof value === 'number' ? value : (typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : null);
    if (numericDate && Number.isFinite(numericDate) && numericDate < 100000000000) {
      return new Date(numericDate * 1000);
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date;
  }

  class EntityJsonManifest implements IGeesomeEntityJsonManifestModule {
    constructor() {

    }

    async forEachGroupManifestPostRef(groupId, filters, options, callback: (post: IPost) => void) {
      const batchSize = getGroupManifestPostRefsBatchSize(options);
      let cursor: {updatedAt: any; id: any} | null = null;
      while (true) {
        const batchFilters: any = {...filters};
        if (cursor) {
          batchFilters.cursorUpdatedAt = cursor.updatedAt;
          batchFilters.cursorId = cursor.id;
        }

        const posts = await app.ms.group.getGroupManifestPostRefs(groupId, batchFilters, {
          limit: batchSize,
          sortBy: 'updatedAt',
          sortDir: 'ASC'
        });
        posts.forEach(callback);
        if (posts.length < batchSize) {
          break;
        }

        const lastPost = posts[posts.length - 1];
        cursor = {updatedAt: lastPost.updatedAt, id: lastPost.id};
      }
    }

    async getCurrentGroupManifestPostRefs(groupId, options: any = {}): Promise<Array<{localId: number; manifestStorageId: string}>> {
      const refs: Array<{localId: number; manifestStorageId: string}> = [];
      await this.forEachGroupManifestPostRef(groupId, {status: PostStatus.Published, isDeleted: false}, options, (post: IPost) => {
        const localId = Number(post.localId);
        const manifestStorageId = getManifestStorageIdForPostRef(post);
        if (!Number.isFinite(localId) || localId <= 0 || !manifestStorageId) {
          return;
        }
        refs.push({localId, manifestStorageId});
      });
      return refs.sort((a, b) => a.localId - b.localId);
    }

    async attachGroupManifestPostIndex(groupManifest, groupData: IGroup, options: any = {}) {
      const refs = Array.isArray(options.postRefs) ? options.postRefs : getInlineGroupManifestPostRefs(groupManifest.posts);
      const pageSize = getGroupManifestPostIndexPageSize(options);
      const refsByPage = new Map<string, Array<{localId: number; manifestStorageId: string}>>();

      for (const ref of refs) {
        const pageKey = getGroupManifestPostIndexPageKey(ref.localId, pageSize);
        if (!refsByPage.has(pageKey)) {
          refsByPage.set(pageKey, []);
        }
        refsByPage.get(pageKey).push(ref);
      }

      const pages = {};
      const sortedPageKeys = Array.from(refsByPage.keys()).sort((a, b) => Number(a) - Number(b));
      for (const pageKey of sortedPageKeys) {
        const pageRefs = refsByPage.get(pageKey) || [];
        if (!pageRefs.length) {
          continue;
        }
        const pageManifest: any = {
          indexType: groupManifestPostIndexType,
          groupStaticId: groupData.manifestStaticStorageId,
          groupManifestUpdatedAt: groupManifest.updatedAt,
          pageSize,
          pageKey,
          fromLocalId: pageRefs[0].localId,
          toLocalId: pageRefs[pageRefs.length - 1].localId,
          count: pageRefs.length,
          refs: pageRefs
        };
        this.setManifestMeta(pageManifest, 'group-post-index-page');
        pages[pageKey] = {
          storageId: await app.saveDataStructure(pageManifest, {waitForStorage: true}),
          count: pageManifest.count,
          fromLocalId: pageManifest.fromLocalId,
          toLocalId: pageManifest.toLocalId
        };
      }

      groupManifest.postsIndex = {
        indexType: groupManifestPostIndexType,
        pageSize,
        postCount: refs.length,
        pageCount: sortedPageKeys.length,
        pages
      };
    }

    async getGroupManifestPostRefsFromIndex(postsIndex): Promise<Array<{localId: number; manifestStorageId: string}>> {
      if (!postsIndex || postsIndex.indexType !== groupManifestPostIndexType) {
        return [];
      }

      const pageEntries = Object.entries(postsIndex.pages || {})
        .map(([pageKey, pageData]: [string, any]) => ({
          pageKey,
          storageId: pageData.storageId || getPostManifestStorageId(pageData)
        }))
        .filter(pageData => pageData.storageId)
        .sort((a, b) => Number(a.pageKey) - Number(b.pageKey));
      const refs: Array<{localId: number; manifestStorageId: string}> = [];

      await pIteration.forEachSeries(pageEntries, async (pageData) => {
        const page = await app.ms.storage.getObject(pageData.storageId);
        for (const ref of page.refs || []) {
          const localId = Number(ref.localId);
          const manifestStorageId = getPostManifestStorageId(ref.manifestStorageId);
          if (!Number.isFinite(localId) || localId <= 0 || !manifestStorageId) {
            continue;
          }
          refs.push({localId, manifestStorageId});
        }
      });

      return refs.sort((a, b) => a.localId - b.localId);
    }

    async getGroupManifestPostRefs(groupManifest): Promise<Array<{localId: number; manifestStorageId: string}>> {
      const inlineRefs = getInlineGroupManifestPostRefs(groupManifest.posts);
      if (inlineRefs.length || !groupManifest.postsIndex) {
        return inlineRefs;
      }
      return this.getGroupManifestPostRefsFromIndex(groupManifest.postsIndex);
    }

    async generateGroupManifest(groupData: IGroup, options: any = {}) {
      //TODO: size => postsSize
      const groupManifest = ipfsHelper.pickObjectFields(groupData, ['name', 'homePage', 'title', 'type', 'view', 'theme', 'isPublic', 'description', 'size', 'directoryStorageId', 'createdAt', 'updatedAt']);
      const includeInlinePosts = shouldIncludeInlineGroupManifestPosts(groupData, options);

      if (includeInlinePosts) {
        groupManifest.posts = {};
      }

      const filters: any = {status: PostStatus.Published, isDeleted: false};
      const deletedFilters: any = {status: PostStatus.Published, isDeleted: true};
      const unpublishedFilters: any = {statusNe: PostStatus.Published};
      if (includeInlinePosts && groupData.manifestStorageId) {
        const lastGroupManifest = await app.ms.storage.getObject(groupData.manifestStorageId);
        filters['updatedAtGte'] = new Date(lastGroupManifest.updatedAt);
        deletedFilters['updatedAtGte'] = filters['updatedAtGte'];
        unpublishedFilters['updatedAtGte'] = filters['updatedAtGte'];
        groupManifest.posts = lastGroupManifest.posts || {};
        if (!lastGroupManifest.posts && lastGroupManifest.postsIndex) {
          const previousRefs = await this.getGroupManifestPostRefsFromIndex(lastGroupManifest.postsIndex);
          previousRefs.forEach((postRef) => {
            treeLib.setNode(groupManifest.posts, postRef.localId, this.getStorageRef(postRef.manifestStorageId));
          });
        }
      }

      if (groupData.isEncrypted) {
        groupManifest.isEncrypted = true;
      }
      groupManifest.postsCount = groupData.publishedPostsCount;
      //TODO: add previous ID
      groupManifest.staticId = groupData.manifestStaticStorageId;
      groupManifest.publicKey = await app.ms.accountStorage.getStaticIdPublicKeyByOr(groupManifest.staticId);

      if (groupData.avatarImage) {
        groupManifest.avatarImage = this.getStorageRef(groupData.avatarImage.manifestStorageId);
      }
      if (groupData.coverImage) {
        groupManifest.coverImage = this.getStorageRef(groupData.coverImage.manifestStorageId);
      }

      // TODO: is this need for protocol?
      // currently used for getting companion info in chats list
      if(groupData.type === GroupType.PersonalChat) {
        const creator = await app.ms.database.getUser(groupData.creatorId);
        groupManifest.members = [groupData.staticStorageId, creator.manifestStaticStorageId];
      }

      if (includeInlinePosts && groupData.manifestStorageId) {
        await this.forEachGroupManifestPostRef(groupData.id, deletedFilters, options, (post: IPost) => {
          unsetTreeNode(groupManifest.posts, post.localId);
        });
        await this.forEachGroupManifestPostRef(groupData.id, unpublishedFilters, options, (post: IPost) => {
          unsetTreeNode(groupManifest.posts, post.localId);
        });
      }
      //TODO: remove deprecated
      if (includeInlinePosts) {
        await this.forEachGroupManifestPostRef(groupData.id, filters, options, (post: IPost) => {
          treeLib.setNode(groupManifest.posts, post.localId, post.isEncrypted ? post.encryptedManifestStorageId : this.getStorageRef(post.manifestStorageId));
        });
        await this.attachGroupManifestPostIndex(groupManifest, groupData, options);
      } else {
        const postRefs = await this.getCurrentGroupManifestPostRefs(groupData.id, options);
        await this.attachGroupManifestPostIndex(groupManifest, groupData, {...options, postRefs});
      }
      this.setManifestMeta(groupManifest, 'group');
      return groupManifest;
    }

    async generateManifest(name, data, options?) {
      if (name === 'group') {
        return this.generateGroupManifest(data as IGroup, options);
      } else if (name === 'category') {
        const category: IGroupCategory = data;
        const categoryManifest = ipfsHelper.pickObjectFields(category, ['name', 'title', 'type', 'view', 'theme', 'isGlobal', 'description', 'createdAt', 'updatedAt']);

        this.setManifestMeta(categoryManifest, name);

        return categoryManifest;
      } else if (name === 'post') {
        const post: IPost = data;
        //TODO: fix size, view and type
        //TODO: add groupNumber
        const postManifest = ipfsHelper.pickObjectFields(post, ['status', 'publishedAt', 'view', 'type', 'size', 'source', 'sourceChannelId', 'sourcePostId', 'directoryStorageId', 'sourceDate']);

        if(post.propertiesJson) {
          postManifest.properties = JSON.parse(post.propertiesJson);
        }

        postManifest.groupId = post.groupStorageId;
        postManifest.groupStaticId = post.groupStaticStorageId;

        postManifest.authorId = post.authorStorageId;
        postManifest.authorStaticId = post.authorStaticStorageId;

        postManifest.contents = post.contents.map((content: IContent) => {
          // Per-post view lives on the PostsContents join row (set by setPostContents). Fall back
          // to the Content row's default view only when the join row is missing or unset; this is
          // the P2 finding "Per-post attachment metadata is not consistently read from the join row".
          const attachmentView = content['postsContents']?.view || content.view;
          return {
            view: attachmentView,
            storageId: content.manifestStorageId //this.getStorageRef(content.manifestStorageId)
          };
        });

        this.setManifestMeta(postManifest, name);

        return postManifest;
      } else if (name === 'user') {
        const user: IUser = data;
        const userManifest = ipfsHelper.pickObjectFields(user, ['name', 'title', 'email', 'description', 'updatedAt', 'createdAt']);

        userManifest.staticId = user.manifestStaticStorageId;
        userManifest.publicKey = await app.ms.accountStorage.getStaticIdPublicKeyByOr(userManifest.staticId);

        if (user.avatarImage) {
          userManifest.avatarImage = this.getStorageRef(user.avatarImage.manifestStorageId);
        }

        this.setManifestMeta(userManifest, name);

        await app.callHook('entityJsonManifest', 'beforeEntityManifestStore', [user.id, 'user', user, userManifest]);

        return userManifest;
      } else if (name === 'content') {
        const content: IContent = data;
        const contentManifest = ipfsHelper.pickObjectFields(content, ['name', 'description', 'mimeType', 'storageType', 'size', 'extension']);

        if(content.propertiesJson) {
          contentManifest.properties = JSON.parse(content.propertiesJson);
        }
        contentManifest.storageId = content.storageId;
        contentManifest.preview = {
          medium: {
            storageId: content.mediumPreviewStorageId || null,
            mimeType: content.previewMimeType || null,
            extension: content.previewExtension || null,
            size: content.mediumPreviewSize || null
          }
        };

        if (content.smallPreviewStorageId) {
          contentManifest.preview.small = {
            storageId: content.smallPreviewStorageId || null,
            mimeType: content.previewMimeType || null,
            extension: content.previewExtension || null,
            size: content.smallPreviewSize || null
          };
        }
        if (content.largePreviewStorageId) {
          contentManifest.preview.large = {
            storageId: content.largePreviewStorageId || null,
            mimeType: content.previewMimeType || null,
            extension: content.previewExtension || null,
            size: content.largePreviewSize || null
          };
        }
        this.setManifestMeta(contentManifest, name);

        return contentManifest;
      }
      return '';
    }

    async manifestIdToDbObject(manifestId, type = null, options: any = {}) {
      manifestId = ipfsHelper.getStorageIdHash(manifestId);
      let manifest: any = {};

      if (!options.isEncrypted) {
        log('manifestIdToDbObject:getObject', type, manifestId);
        manifest = await app.ms.storage.getObject(manifestId);
        log('manifestIdToDbObject:manifest', manifest);

        if (!type) {
          type = manifest._entityName;
        }
      }

      if (type === 'group') {
        const group: IGroup = ipfsHelper.pickObjectFields(manifest, ['name', 'homePage', 'title', 'type', 'view', 'isPublic', 'description', 'size']);
        group.manifestStorageId = manifestId;

        if (manifest.avatarImage) {
          group.avatarImage = (await this.manifestIdToDbObject(manifest.avatarImage, 'content')) as any;
        }
        if (manifest.coverImage) {
          group.coverImage = (await this.manifestIdToDbObject(manifest.coverImage, 'content')) as any;
        }

        group.publishedPostsCount = manifest.postsCount;
        group.manifestStaticStorageId = manifest.staticId;

        //TODO: check ipns for valid bound to ipld
        await app.ms.accountStorage.createRemoteAccount(manifest.staticId, manifest.publicKey, manifest.name).catch(() => {});
        await app.ms.staticId.addStaticIdHistoryItem({
          staticId: manifest.staticId,
          dynamicId: manifestId,
          isActive: true,
          boundAt: new Date()
        }).catch(() => {});

        //TODO: import posts too
        return group;
      } else if (type === 'user') {
        const user: IUser = ipfsHelper.pickObjectFields(manifest, ['name', 'title', 'email', 'description']);
        user.manifestStorageId = manifestId;

        if (manifest.avatarImage) {
          user.avatarImage = (await this.manifestIdToDbObject(manifest.avatarImage, 'content')) as any;
        }

        user.manifestStaticStorageId = manifest.staticId;
        log('manifestIdToDbObject:user', user);

        //TODO: check ipns for valid bound to ipld
        await app.ms.accountStorage.createRemoteAccount(manifest.staticId, manifest.publicKey, manifest.name).catch(() => {});
        await app.ms.staticId.addStaticIdHistoryItem({
          staticId: manifest.staticId,
          dynamicId: manifestId,
          isActive: true,
          boundAt: new Date()
        }).catch(() => {});

        return user;
      } else if (type === 'post') {
        let post: IPost;

        if (options.isEncrypted) {
          post = { ...options, isEncrypted: true, encryptedManifestStorageId: manifestId };
        } else {
          post = ipfsHelper.pickObjectFields(manifest, ['status', 'publishedAt', 'view', 'type', 'size', 'source', 'sourceChannelId', 'sourcePostId', 'sourceDate']);

          post.manifestStorageId = manifestId;

          post.authorStorageId = manifest.authorId;
          post.authorStaticStorageId = manifest.authorStaticId;

          post.groupStorageId = manifest.groupId;
          post.groupStaticStorageId = manifest.groupStaticId;

          if (options.userId !== undefined) {
            post.userId = options.userId;
          }
          if (options.groupId !== undefined) {
            post.groupId = options.groupId;
          }
          post.publishedAt = normalizeManifestDate(options.publishedAt || post.publishedAt);
          post.sourceDate = normalizeManifestDate(post.sourceDate);

          const importerUserId = options.userId !== undefined ? options.userId : null;
          post.contents = await pIteration.map(manifest.contents, async (manifestContent) => {
            const contentRow: any = await app.ms.content.createContentByRemoteStorageId(importerUserId, manifestContent.storageId);
            return { id: contentRow ? contentRow.id : null, view: manifestContent.view };
          });
        }

        return post;
      } else if (type === 'content') {
        const content: IContent = ipfsHelper.pickObjectFields(manifest, ['name', 'mimeType', 'storageType', 'view', 'size', 'extension']);

        if(manifest.isEncrypted) {
          content.encryptedManifestStorageId = manifestId;
        } else {
          content.storageId = manifest.storageId;

          if(manifest.preview) {
            if(manifest.preview.medium) {
              const mediumPreview = manifest.preview.medium;
              content.mediumPreviewStorageId = mediumPreview.storageId;
              content.mediumPreviewSize = mediumPreview.size;

              content.previewExtension = mediumPreview.extension;
              content.previewMimeType = mediumPreview.mimeType;
            }

            if(manifest.preview.small) {
              const smallPreview = manifest.preview.small;
              content.smallPreviewStorageId = smallPreview.storageId;
              content.smallPreviewSize = smallPreview.size;

              content.previewExtension = content.previewExtension || smallPreview.extension;
              content.previewMimeType = content.previewMimeType || smallPreview.mimeType;
            }

            if(manifest.preview.large) {
              const largePreview = manifest.preview.large;

              content.smallPreviewStorageId = largePreview.storageId;
              content.smallPreviewSize = largePreview.size;

              content.previewExtension = content.previewExtension || largePreview.extension;
              content.previewMimeType = content.previewMimeType || largePreview.mimeType;
            }
          }

          content.manifestStorageId = manifestId;
        }

        return content;
      }
    }

    getStorageRef(storageId) {
      if (!storageId) {
        return null;
      }
      return storageId;
    }

    setManifestMeta(manifest, entityName) {
      manifest._version = "0.1";
      manifest._source = "geesome-node";
      manifest._protocol = "geesome-ipsp";
      manifest._type = 'manifest';
      manifest._entityName = entityName;
    }
  }

  return new EntityJsonManifest();
}
