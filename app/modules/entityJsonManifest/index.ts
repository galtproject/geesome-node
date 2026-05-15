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

type GroupManifestPostRef = {localId: number; manifestStorageId: string};
type GroupManifestPostIndexPages = Record<string, any>;
type GroupManifestPostFilters = {
  activeFilters: any;
  deletedFilters: any;
  unpublishedFilters: any;
};
type GroupManifestPostIndexChanges = {
  changedPostRefs: GroupManifestPostRef[];
  removedLocalIds: number[];
};
type GroupManifestPostIndexPageChanges = {
  touchedPageKeys: Set<string>;
  changedRefsByPage: Map<string, GroupManifestPostRef[]>;
  removedIdsByPage: Map<string, number[]>;
};

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

  function createGroupManifestPostFilters(): GroupManifestPostFilters {
    return {
      activeFilters: {status: PostStatus.Published, isDeleted: false},
      deletedFilters: {status: PostStatus.Published, isDeleted: true},
      unpublishedFilters: {statusNe: PostStatus.Published}
    };
  }

  function createEmptyGroupManifestPostIndexChanges(): GroupManifestPostIndexChanges {
    return {
      changedPostRefs: [],
      removedLocalIds: []
    };
  }

  function sortGroupManifestPostRefs(refs: GroupManifestPostRef[]): GroupManifestPostRef[] {
    return refs.sort((a, b) => a.localId - b.localId);
  }

  function sortGroupManifestPostIndexPageKeys(pageKeys: string[]): string[] {
    return pageKeys.sort((a, b) => Number(a) - Number(b));
  }

  function cloneGroupManifestPostIndexPages(postsIndex): GroupManifestPostIndexPages {
    const pages: GroupManifestPostIndexPages = {};
    Object.entries(postsIndex?.pages || {}).forEach(([pageKey, pageData]: [string, any]) => {
      pages[pageKey] = {...pageData};
    });
    return pages;
  }

  function getGroupManifestPostCountFromPages(pages: GroupManifestPostIndexPages): number {
    return Object.values(pages || {}).reduce((sum: number, pageData: any) => sum + Number(pageData.count || 0), 0);
  }

  function getGroupManifestPostIndexPostCount(groupData: IGroup, pages: GroupManifestPostIndexPages, explicitPostCount?: number): number {
    if (explicitPostCount !== undefined && Number.isFinite(explicitPostCount)) {
      return explicitPostCount;
    }
    const availablePostsCount = Number(groupData.availablePostsCount);
    if (Number.isFinite(availablePostsCount)) {
      return availablePostsCount;
    }
    return getGroupManifestPostCountFromPages(pages);
  }

  function setGroupManifestPostIndex(groupManifest, groupData: IGroup, pageSize: number, pages: GroupManifestPostIndexPages, postCount?: number) {
    const sortedPages: GroupManifestPostIndexPages = {};
    sortGroupManifestPostIndexPageKeys(Object.keys(pages || {})).forEach((pageKey) => {
      sortedPages[pageKey] = pages[pageKey];
    });

    groupManifest.postsIndex = {
      indexType: groupManifestPostIndexType,
      pageSize,
      postCount: getGroupManifestPostIndexPostCount(groupData, sortedPages, postCount),
      pageCount: Object.keys(sortedPages).length,
      pages: sortedPages
    };
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

  function normalizeGroupManifestPostRef(ref): GroupManifestPostRef | null {
    const localId = Number(ref?.localId);
    const manifestStorageId = getPostManifestStorageId(ref?.manifestStorageId);
    if (!Number.isFinite(localId) || localId <= 0 || !manifestStorageId) {
      return null;
    }
    return {localId, manifestStorageId};
  }

  function normalizeGroupManifestPostRefs(refs: any[] = []): GroupManifestPostRef[] {
    const refsByLocalId = new Map<number, GroupManifestPostRef>();
    refs.forEach((ref) => {
      const normalized = normalizeGroupManifestPostRef(ref);
      if (!normalized) {
        return;
      }
      refsByLocalId.set(normalized.localId, normalized);
    });
    return sortGroupManifestPostRefs(Array.from(refsByLocalId.values()));
  }

  function normalizeGroupManifestRemovedLocalIds(localIds: any[] = []): number[] {
    const uniqueIds = new Set<number>();
    localIds.forEach((localId) => {
      const numericId = Number(localId);
      if (!Number.isFinite(numericId) || numericId <= 0) {
        return;
      }
      uniqueIds.add(numericId);
    });
    return Array.from(uniqueIds.values()).sort((a, b) => a - b);
  }

  function addPostRefToPageMap(postRef: GroupManifestPostRef, pageSize: number, refsByPage: Map<string, GroupManifestPostRef[]>) {
    const pageKey = getGroupManifestPostIndexPageKey(postRef.localId, pageSize);
    if (!refsByPage.has(pageKey)) {
      refsByPage.set(pageKey, []);
    }
    refsByPage.get(pageKey).push(postRef);
  }

  function addLocalIdToPageMap(localId: number, pageSize: number, idsByPage: Map<string, number[]>) {
    const pageKey = getGroupManifestPostIndexPageKey(localId, pageSize);
    if (!idsByPage.has(pageKey)) {
      idsByPage.set(pageKey, []);
    }
    idsByPage.get(pageKey).push(localId);
  }

  function addPostLocalIdToRemovedChanges(changes: GroupManifestPostIndexChanges, post: IPost) {
    const localId = Number(post.localId);
    if (!Number.isFinite(localId) || localId <= 0) {
      return;
    }
    changes.removedLocalIds.push(localId);
  }

  function addPostManifestRefToChangedChanges(changes: GroupManifestPostIndexChanges, post: IPost) {
    const localId = Number(post.localId);
    const manifestStorageId = getManifestStorageIdForPostRef(post);
    if (!Number.isFinite(localId) || localId <= 0 || !manifestStorageId) {
      return;
    }
    changes.changedPostRefs.push({localId, manifestStorageId});
  }

  function canReuseGroupManifestPostIndex(postsIndex, pageSize: number): boolean {
    if (!postsIndex || postsIndex.indexType !== groupManifestPostIndexType) {
      return false;
    }
    return Number(postsIndex.pageSize) === pageSize;
  }

  function createPostRefsByLocalId(refs: GroupManifestPostRef[]): Map<number, GroupManifestPostRef> {
    const refsByLocalId = new Map<number, GroupManifestPostRef>();
    refs.forEach((ref) => {
      refsByLocalId.set(ref.localId, ref);
    });
    return refsByLocalId;
  }

  function applyPostIndexPageRefChanges(existingRefs: GroupManifestPostRef[], changedRefs: GroupManifestPostRef[], removedLocalIds: number[]): GroupManifestPostRef[] {
    const refsByLocalId = createPostRefsByLocalId(existingRefs);
    removedLocalIds.forEach((localId) => {
      refsByLocalId.delete(localId);
    });
    changedRefs.forEach((ref) => {
      refsByLocalId.set(ref.localId, ref);
    });
    return sortGroupManifestPostRefs(Array.from(refsByLocalId.values()));
  }

  function buildGroupManifestPostIndexPageChanges(pageSize: number, changedRefs: GroupManifestPostRef[], removedLocalIds: number[]): GroupManifestPostIndexPageChanges {
    const touchedPageKeys = new Set<string>();
    const changedRefsByPage = new Map<string, GroupManifestPostRef[]>();
    const removedIdsByPage = new Map<string, number[]>();

    changedRefs.forEach((ref) => {
      const pageKey = getGroupManifestPostIndexPageKey(ref.localId, pageSize);
      touchedPageKeys.add(pageKey);
      addPostRefToPageMap(ref, pageSize, changedRefsByPage);
    });
    removedLocalIds.forEach((localId) => {
      const pageKey = getGroupManifestPostIndexPageKey(localId, pageSize);
      touchedPageKeys.add(pageKey);
      addLocalIdToPageMap(localId, pageSize, removedIdsByPage);
    });

    return {
      touchedPageKeys,
      changedRefsByPage,
      removedIdsByPage
    };
  }

  function getSortedTouchedPostIndexPageKeys(pageChanges: GroupManifestPostIndexPageChanges): string[] {
    return sortGroupManifestPostIndexPageKeys(Array.from(pageChanges.touchedPageKeys.values()));
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

  function getPostCursorFromValues(updatedAt, id): {updatedAt: Date; id: number} | null {
    const date = normalizeManifestDate(updatedAt);
    const numericId = Number(id);
    if (!(date instanceof Date) || Number.isNaN(date.getTime()) || !Number.isFinite(numericId)) {
      return null;
    }
    return {updatedAt: date, id: numericId};
  }

  function getPostCursorFromPost(post): {updatedAt: Date; id: number} | null {
    if (!post) {
      return null;
    }
    return getPostCursorFromValues(post.updatedAt, post.id);
  }

  function isPostCursorAfter(candidate, current) {
    if (!candidate) {
      return false;
    }
    if (!current) {
      return true;
    }
    const candidateTime = candidate.updatedAt.getTime();
    const currentTime = current.updatedAt.getTime();
    if (candidateTime !== currentTime) {
      return candidateTime > currentTime;
    }
    return candidate.id > current.id;
  }

  function updateGenerationStateCursor(options, post) {
    if (!options.generationState) {
      return;
    }
    const cursor = getPostCursorFromPost(post);
    if (!isPostCursorAfter(cursor, options.generationState.postCursor)) {
      return;
    }
    options.generationState.postCursor = cursor;
  }

  function getGroupManifestGenerationCursor(groupData: IGroup) {
    return getPostCursorFromValues(groupData.manifestPostsCursorUpdatedAt, groupData.manifestPostsCursorId);
  }

  function setPostUpdatedAtGteFilters(filtersList, updatedAt) {
    filtersList.forEach((filters) => {
      filters.updatedAtGte = updatedAt;
    });
  }

  function applyGroupManifestGenerationCursor(groupData: IGroup, lastGroupManifest, filtersList) {
    const cursor = getGroupManifestGenerationCursor(groupData);
    if (cursor) {
      setPostUpdatedAtGteFilters(filtersList, cursor.updatedAt);
      return cursor;
    }
    if (!lastGroupManifest?.updatedAt) {
      return null;
    }
    setPostUpdatedAtGteFilters(filtersList, normalizeManifestDate(lastGroupManifest.updatedAt));
    return null;
  }

  class EntityJsonManifest implements IGeesomeEntityJsonManifestModule {
    constructor() {

    }

    async forEachGroupManifestPostRef(groupId, filters, options, callback: (post: IPost) => void) {
      const batchSize = getGroupManifestPostRefsBatchSize(options);
      let cursor: {updatedAt: any; id: any} | null = null;
      let latestCursor: {updatedAt: Date; id: number} | null = null;
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
        posts.forEach((post) => {
          callback(post);
          const postCursor = getPostCursorFromPost(post);
          if (isPostCursorAfter(postCursor, latestCursor)) {
            latestCursor = postCursor;
          }
          updateGenerationStateCursor(options, post);
        });
        if (posts.length < batchSize) {
          break;
        }

        const lastPost = posts[posts.length - 1];
        cursor = {updatedAt: lastPost.updatedAt, id: lastPost.id};
      }
      return latestCursor;
    }

    async getCurrentGroupManifestPostRefs(groupId, options: any = {}): Promise<GroupManifestPostRef[]> {
      const refs: GroupManifestPostRef[] = [];
      await this.forEachGroupManifestPostRef(groupId, {status: PostStatus.Published, isDeleted: false}, options, (post: IPost) => {
        const localId = Number(post.localId);
        const manifestStorageId = getManifestStorageIdForPostRef(post);
        if (!Number.isFinite(localId) || localId <= 0 || !manifestStorageId) {
          return;
        }
        refs.push({localId, manifestStorageId});
      });
      return sortGroupManifestPostRefs(refs);
    }

    async saveGroupManifestPostIndexPage(groupManifest, groupData: IGroup, pageSize: number, pageKey: string, refs: GroupManifestPostRef[]) {
      const pageRefs = sortGroupManifestPostRefs([...refs]);
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

      return {
        storageId: await app.saveDataStructure(pageManifest, {waitForStorage: true}),
        count: pageManifest.count,
        fromLocalId: pageManifest.fromLocalId,
        toLocalId: pageManifest.toLocalId
      };
    }

    async attachGroupManifestPostIndex(groupManifest, groupData: IGroup, options: any = {}) {
      const refs = Array.isArray(options.postRefs) ? options.postRefs : getInlineGroupManifestPostRefs(groupManifest.posts);
      const pageSize = getGroupManifestPostIndexPageSize(options);
      const refsByPage = new Map<string, GroupManifestPostRef[]>();
      const normalizedRefs = normalizeGroupManifestPostRefs(refs);

      normalizedRefs.forEach((ref) => addPostRefToPageMap(ref, pageSize, refsByPage));

      const pages: GroupManifestPostIndexPages = {};
      const sortedPageKeys = Array.from(refsByPage.keys()).sort((a, b) => Number(a) - Number(b));
      for (const pageKey of sortedPageKeys) {
        const pageRefs = refsByPage.get(pageKey) || [];
        if (!pageRefs.length) {
          continue;
        }
        pages[pageKey] = await this.saveGroupManifestPostIndexPage(groupManifest, groupData, pageSize, pageKey, pageRefs);
      }

      setGroupManifestPostIndex(groupManifest, groupData, pageSize, pages, normalizedRefs.length);
    }

    async getGroupManifestPostIndexPageRefs(pageData): Promise<GroupManifestPostRef[]> {
      const storageId = pageData?.storageId || getPostManifestStorageId(pageData);
      if (!storageId) {
        return [];
      }
      const page = await app.ms.storage.getObject(storageId);
      return normalizeGroupManifestPostRefs(page.refs || []);
    }

    async attachIncrementalGroupManifestPostIndex(groupManifest, groupData: IGroup, options: any = {}) {
      const previousPostsIndex = options.previousPostsIndex;
      const pageSize = getGroupManifestPostIndexPageSize(options);
      if (!canReuseGroupManifestPostIndex(previousPostsIndex, pageSize)) {
        const postRefs = await this.getCurrentGroupManifestPostRefs(groupData.id, options);
        return this.attachGroupManifestPostIndex(groupManifest, groupData, {...options, postRefs});
      }

      const pages = cloneGroupManifestPostIndexPages(previousPostsIndex);
      const changedRefs = normalizeGroupManifestPostRefs(options.changedPostRefs || []);
      const removedLocalIds = normalizeGroupManifestRemovedLocalIds(options.removedLocalIds || []);
      const pageChanges = buildGroupManifestPostIndexPageChanges(pageSize, changedRefs, removedLocalIds);

      if (!pageChanges.touchedPageKeys.size) {
        setGroupManifestPostIndex(groupManifest, groupData, pageSize, pages);
        return;
      }

      await this.rewriteTouchedGroupManifestPostIndexPages(groupManifest, groupData, pageSize, pages, pageChanges);
      setGroupManifestPostIndex(groupManifest, groupData, pageSize, pages);
    }

    async rewriteTouchedGroupManifestPostIndexPages(groupManifest, groupData: IGroup, pageSize: number, pages: GroupManifestPostIndexPages, pageChanges: GroupManifestPostIndexPageChanges) {
      await pIteration.forEachSeries(getSortedTouchedPostIndexPageKeys(pageChanges), async (pageKey) => {
        const existingRefs = await this.getGroupManifestPostIndexPageRefs(pages[pageKey]);
        const pageRefs = applyPostIndexPageRefChanges(
          existingRefs,
          pageChanges.changedRefsByPage.get(pageKey) || [],
          pageChanges.removedIdsByPage.get(pageKey) || []
        );
        if (!pageRefs.length) {
          delete pages[pageKey];
          return;
        }
        pages[pageKey] = await this.saveGroupManifestPostIndexPage(groupManifest, groupData, pageSize, pageKey, pageRefs);
      });
    }

    async getGroupManifestPostRefsFromIndex(postsIndex): Promise<GroupManifestPostRef[]> {
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
      const refs: GroupManifestPostRef[] = [];

      await pIteration.forEachSeries(pageEntries, async (pageData) => {
        refs.push(...await this.getGroupManifestPostIndexPageRefs(pageData));
      });

      return sortGroupManifestPostRefs(refs);
    }

    async getGroupManifestPostRefs(groupManifest): Promise<GroupManifestPostRef[]> {
      const inlineRefs = getInlineGroupManifestPostRefs(groupManifest.posts);
      if (inlineRefs.length || !groupManifest.postsIndex) {
        return inlineRefs;
      }
      return this.getGroupManifestPostRefsFromIndex(groupManifest.postsIndex);
    }

    createGroupManifestShell(groupData: IGroup, includeInlinePosts: boolean) {
      //TODO: size => postsSize
      const groupManifest = ipfsHelper.pickObjectFields(groupData, ['name', 'homePage', 'title', 'type', 'view', 'theme', 'isPublic', 'description', 'size', 'directoryStorageId', 'createdAt', 'updatedAt']);
      if (includeInlinePosts) {
        groupManifest.posts = {};
      }
      return groupManifest;
    }

    initializeGroupManifestGenerationState(groupData: IGroup, options: any = {}) {
      if (!options.generationState || options.generationState.postCursor) {
        return;
      }
      options.generationState.postCursor = getGroupManifestGenerationCursor(groupData);
    }

    async loadPreviousGroupManifestState(groupData: IGroup, postFilters: GroupManifestPostFilters) {
      if (!groupData.manifestStorageId) {
        return {
          lastGroupManifest: null,
          previousPostsIndex: null
        };
      }
      const lastGroupManifest = await app.ms.storage.getObject(groupData.manifestStorageId);
      applyGroupManifestGenerationCursor(groupData, lastGroupManifest, [
        postFilters.activeFilters,
        postFilters.deletedFilters,
        postFilters.unpublishedFilters
      ]);
      return {
        lastGroupManifest,
        previousPostsIndex: lastGroupManifest.postsIndex || null
      };
    }

    async inheritInlineGroupManifestPosts(groupManifest, lastGroupManifest) {
      if (!lastGroupManifest) {
        return;
      }
      groupManifest.posts = lastGroupManifest.posts || {};
      if (lastGroupManifest.posts || !lastGroupManifest.postsIndex) {
        return;
      }
      const previousRefs = await this.getGroupManifestPostRefsFromIndex(lastGroupManifest.postsIndex);
      previousRefs.forEach((postRef) => {
        treeLib.setNode(groupManifest.posts, postRef.localId, this.getStorageRef(postRef.manifestStorageId));
      });
    }

    async attachGroupManifestEntityRefs(groupManifest, groupData: IGroup) {
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
    }

    async collectRemovedGroupManifestPostRefs(groupManifest, groupId, filters, options, changes: GroupManifestPostIndexChanges, shouldUnsetInlinePosts: boolean) {
      await this.forEachGroupManifestPostRef(groupId, filters, options, (post: IPost) => {
        if (shouldUnsetInlinePosts) {
          unsetTreeNode(groupManifest.posts, post.localId);
        }
        addPostLocalIdToRemovedChanges(changes, post);
      });
    }

    async collectChangedGroupManifestPostRefs(groupManifest, groupId, filters, options, changes: GroupManifestPostIndexChanges, shouldSetInlinePosts: boolean) {
      await this.forEachGroupManifestPostRef(groupId, filters, options, (post: IPost) => {
        if (shouldSetInlinePosts) {
          treeLib.setNode(groupManifest.posts, post.localId, post.isEncrypted ? post.encryptedManifestStorageId : this.getStorageRef(post.manifestStorageId));
        }
        addPostManifestRefToChangedChanges(changes, post);
      });
    }

    async collectInlineGroupManifestPostChanges(groupManifest, groupData: IGroup, postFilters: GroupManifestPostFilters, options: any = {}): Promise<GroupManifestPostIndexChanges> {
      const changes = createEmptyGroupManifestPostIndexChanges();
      if (groupData.manifestStorageId) {
        await this.collectRemovedGroupManifestPostRefs(groupManifest, groupData.id, postFilters.deletedFilters, options, changes, true);
        await this.collectRemovedGroupManifestPostRefs(groupManifest, groupData.id, postFilters.unpublishedFilters, options, changes, true);
      }
      //TODO: remove deprecated
      await this.collectChangedGroupManifestPostRefs(groupManifest, groupData.id, postFilters.activeFilters, options, changes, true);
      return changes;
    }

    async collectChunkedGroupManifestPostChanges(groupManifest, groupData: IGroup, postFilters: GroupManifestPostFilters, previousPostsIndex, options: any = {}): Promise<GroupManifestPostIndexChanges> {
      const changes = createEmptyGroupManifestPostIndexChanges();
      if (!previousPostsIndex) {
        return changes;
      }
      await this.collectRemovedGroupManifestPostRefs(groupManifest, groupData.id, postFilters.deletedFilters, options, changes, false);
      await this.collectRemovedGroupManifestPostRefs(groupManifest, groupData.id, postFilters.unpublishedFilters, options, changes, false);
      await this.collectChangedGroupManifestPostRefs(groupManifest, groupData.id, postFilters.activeFilters, options, changes, false);
      return changes;
    }

    async attachGeneratedGroupManifestPostIndex(groupManifest, groupData: IGroup, includeInlinePosts: boolean, previousPostsIndex, changes: GroupManifestPostIndexChanges, options: any = {}) {
      if (previousPostsIndex) {
        return this.attachIncrementalGroupManifestPostIndex(groupManifest, groupData, {
          ...options,
          previousPostsIndex,
          changedPostRefs: changes.changedPostRefs,
          removedLocalIds: changes.removedLocalIds
        });
      }
      if (includeInlinePosts) {
        return this.attachGroupManifestPostIndex(groupManifest, groupData, options);
      }
      const postRefs = await this.getCurrentGroupManifestPostRefs(groupData.id, options);
      return this.attachGroupManifestPostIndex(groupManifest, groupData, {...options, postRefs});
    }

    async generateGroupManifest(groupData: IGroup, options: any = {}) {
      const includeInlinePosts = shouldIncludeInlineGroupManifestPosts(groupData, options);
      this.initializeGroupManifestGenerationState(groupData, options);

      const groupManifest = this.createGroupManifestShell(groupData, includeInlinePosts);
      const postFilters = createGroupManifestPostFilters();
      const {lastGroupManifest, previousPostsIndex} = await this.loadPreviousGroupManifestState(groupData, postFilters);
      if (includeInlinePosts) {
        await this.inheritInlineGroupManifestPosts(groupManifest, lastGroupManifest);
      }

      await this.attachGroupManifestEntityRefs(groupManifest, groupData);
      const postIndexChanges = includeInlinePosts
        ? await this.collectInlineGroupManifestPostChanges(groupManifest, groupData, postFilters, options)
        : await this.collectChunkedGroupManifestPostChanges(groupManifest, groupData, postFilters, previousPostsIndex, options);

      await this.attachGeneratedGroupManifestPostIndex(groupManifest, groupData, includeInlinePosts, previousPostsIndex, postIndexChanges, options);
      this.setManifestMeta(groupManifest, 'group');
      return groupManifest;
    }

    async generateGroupManifestWithState(groupData: IGroup, options: any = {}) {
      const state = options.generationState || {};
      const manifest = await this.generateGroupManifest(groupData, {...options, generationState: state});
      return {manifest, state};
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
