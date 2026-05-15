import base36 from "geesome-libs/src/base36.js";
import treeLib from "geesome-libs/src/base36Trie.js";
import {PostStatus} from "../group/interface.js";
import type {IGroup, IPost} from "../group/interface.js";

const defaultGroupManifestPostRefsBatchSize = 1000;
const defaultGroupManifestPostIndexPageSize = 1000;

export const groupManifestPostIndexType = 'geesome-group-post-index-v1';

export type GroupManifestPostRef = {localId: number; manifestStorageId: string};
export type GroupManifestPostIndexPages = Record<string, any>;
export type GroupManifestPostFilters = {
  activeFilters: any;
  deletedFilters: any;
  unpublishedFilters: any;
};
export type GroupManifestPostIndexChanges = {
  changedPostRefs: GroupManifestPostRef[];
  removedLocalIds: number[];
};
export type GroupManifestPostIndexPageChanges = {
  touchedPageKeys: Set<string>;
  changedRefsByPage: Map<string, GroupManifestPostRef[]>;
  removedIdsByPage: Map<string, number[]>;
};

const groupManifestInlinePostsLimit = parseInlinePostsLimit(process.env.GROUP_MANIFEST_INLINE_POSTS_LIMIT);

export function getGroupManifestPostRefsBatchSize(options: any = {}) {
  const batchSize = Number(options.postRefsBatchSize || defaultGroupManifestPostRefsBatchSize);
  if (Number.isFinite(batchSize) && batchSize > 0) {
    return Math.floor(batchSize);
  }
  return defaultGroupManifestPostRefsBatchSize;
}

export function getGroupManifestPostIndexPageSize(options: any = {}) {
  const pageSize = Number(options.postIndexPageSize || defaultGroupManifestPostIndexPageSize);
  if (Number.isFinite(pageSize) && pageSize > 0) {
    return Math.floor(pageSize);
  }
  return defaultGroupManifestPostIndexPageSize;
}

export function getGroupManifestPostIndexPageKey(localId: number, pageSize: number): string {
  return String(Math.floor((localId - 1) / pageSize));
}

export function createGroupManifestPostFilters(): GroupManifestPostFilters {
  return {
    activeFilters: {status: PostStatus.Published, isDeleted: false},
    deletedFilters: {status: PostStatus.Published, isDeleted: true},
    unpublishedFilters: {statusNe: PostStatus.Published}
  };
}

export function createEmptyGroupManifestPostIndexChanges(): GroupManifestPostIndexChanges {
  return {
    changedPostRefs: [],
    removedLocalIds: []
  };
}

export function sortGroupManifestPostRefs(refs: GroupManifestPostRef[]): GroupManifestPostRef[] {
  return refs.sort((a, b) => a.localId - b.localId);
}

export function sortGroupManifestPostIndexPageKeys(pageKeys: string[]): string[] {
  return pageKeys.sort((a, b) => Number(a) - Number(b));
}

export function cloneGroupManifestPostIndexPages(postsIndex): GroupManifestPostIndexPages {
  const pages: GroupManifestPostIndexPages = {};
  Object.entries(postsIndex?.pages || {}).forEach(([pageKey, pageData]: [string, any]) => {
    pages[pageKey] = {...pageData};
  });
  return pages;
}

export function setGroupManifestPostIndex(groupManifest, groupData: IGroup, pageSize: number, pages: GroupManifestPostIndexPages, postCount?: number) {
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

export function shouldIncludeInlineGroupManifestPosts(groupData: IGroup, options: any = {}): boolean {
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

export function getPostManifestStorageId(postRef) {
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

export function getInlineGroupManifestPostRefs(postsTree): Array<{localId: number; manifestStorageId: string}> {
  const refs: Array<{localId: number; manifestStorageId: string}> = [];
  appendInlineGroupManifestPostRefs(postsTree, refs);
  return refs.sort((a, b) => a.localId - b.localId);
}

export function getManifestStorageIdForPostRef(post: IPost): string | null {
  if (!post || !post.localId) {
    return null;
  }
  if (post.isEncrypted) {
    return getPostManifestStorageId(post.encryptedManifestStorageId);
  }
  return getPostManifestStorageId(post.manifestStorageId);
}

export function normalizeGroupManifestPostRefs(refs: any[] = []): GroupManifestPostRef[] {
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

export function normalizeGroupManifestRemovedLocalIds(localIds: any[] = []): number[] {
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

export function addPostRefToPageMap(postRef: GroupManifestPostRef, pageSize: number, refsByPage: Map<string, GroupManifestPostRef[]>) {
  const pageKey = getGroupManifestPostIndexPageKey(postRef.localId, pageSize);
  if (!refsByPage.has(pageKey)) {
    refsByPage.set(pageKey, []);
  }
  refsByPage.get(pageKey).push(postRef);
}

export function addPostLocalIdToRemovedChanges(changes: GroupManifestPostIndexChanges, post: IPost) {
  const localId = Number(post.localId);
  if (!Number.isFinite(localId) || localId <= 0) {
    return;
  }
  changes.removedLocalIds.push(localId);
}

export function addPostManifestRefToChangedChanges(changes: GroupManifestPostIndexChanges, post: IPost) {
  const localId = Number(post.localId);
  const manifestStorageId = getManifestStorageIdForPostRef(post);
  if (!Number.isFinite(localId) || localId <= 0 || !manifestStorageId) {
    return;
  }
  changes.changedPostRefs.push({localId, manifestStorageId});
}

export function canReuseGroupManifestPostIndex(postsIndex, pageSize: number): boolean {
  if (!postsIndex || postsIndex.indexType !== groupManifestPostIndexType) {
    return false;
  }
  return Number(postsIndex.pageSize) === pageSize;
}

export function applyPostIndexPageRefChanges(existingRefs: GroupManifestPostRef[], changedRefs: GroupManifestPostRef[], removedLocalIds: number[]): GroupManifestPostRef[] {
  const refsByLocalId = createPostRefsByLocalId(existingRefs);
  removedLocalIds.forEach((localId) => {
    refsByLocalId.delete(localId);
  });
  changedRefs.forEach((ref) => {
    refsByLocalId.set(ref.localId, ref);
  });
  return sortGroupManifestPostRefs(Array.from(refsByLocalId.values()));
}

export function buildGroupManifestPostIndexPageChanges(pageSize: number, changedRefs: GroupManifestPostRef[], removedLocalIds: number[]): GroupManifestPostIndexPageChanges {
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

export function getSortedTouchedPostIndexPageKeys(pageChanges: GroupManifestPostIndexPageChanges): string[] {
  return sortGroupManifestPostIndexPageKeys(Array.from(pageChanges.touchedPageKeys.values()));
}

export function normalizeManifestDate(value) {
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

export function getPostCursorFromValues(updatedAt, id): {updatedAt: Date; id: number} | null {
  const date = normalizeManifestDate(updatedAt);
  const numericId = Number(id);
  if (!(date instanceof Date) || Number.isNaN(date.getTime()) || !Number.isFinite(numericId)) {
    return null;
  }
  return {updatedAt: date, id: numericId};
}

export function getPostCursorFromPost(post): {updatedAt: Date; id: number} | null {
  if (!post) {
    return null;
  }
  return getPostCursorFromValues(post.updatedAt, post.id);
}

export function isPostCursorAfter(candidate, current) {
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

export function updateGenerationStateCursor(options, post) {
  if (!options.generationState) {
    return;
  }
  const cursor = getPostCursorFromPost(post);
  if (!isPostCursorAfter(cursor, options.generationState.postCursor)) {
    return;
  }
  options.generationState.postCursor = cursor;
}

export function getGroupManifestGenerationCursor(groupData: IGroup) {
  return getPostCursorFromValues(groupData.manifestPostsCursorUpdatedAt, groupData.manifestPostsCursorId);
}

export function applyGroupManifestGenerationCursor(groupData: IGroup, lastGroupManifest, filtersList) {
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

export function unsetTreeNode(tree: Record<string, any>, id) {
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

function getGroupManifestInlinePostsLimit(options: any = {}): number {
  if (options.inlinePostsLimit !== undefined) {
    return parseInlinePostsLimit(options.inlinePostsLimit);
  }
  return groupManifestInlinePostsLimit;
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

function normalizeGroupManifestPostRef(ref): GroupManifestPostRef | null {
  const localId = Number(ref?.localId);
  const manifestStorageId = getPostManifestStorageId(ref?.manifestStorageId);
  if (!Number.isFinite(localId) || localId <= 0 || !manifestStorageId) {
    return null;
  }
  return {localId, manifestStorageId};
}

function addLocalIdToPageMap(localId: number, pageSize: number, idsByPage: Map<string, number[]>) {
  const pageKey = getGroupManifestPostIndexPageKey(localId, pageSize);
  if (!idsByPage.has(pageKey)) {
    idsByPage.set(pageKey, []);
  }
  idsByPage.get(pageKey).push(localId);
}

function createPostRefsByLocalId(refs: GroupManifestPostRef[]): Map<number, GroupManifestPostRef> {
  const refsByLocalId = new Map<number, GroupManifestPostRef>();
  refs.forEach((ref) => {
    refsByLocalId.set(ref.localId, ref);
  });
  return refsByLocalId;
}

function setPostUpdatedAtGteFilters(filtersList, updatedAt) {
  filtersList.forEach((filters) => {
    filters.updatedAtGte = updatedAt;
  });
}
