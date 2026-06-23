import type {IUserOperationQueue} from "../asyncOperation/interface.js";
import type {
  IContentDeleteSafetyBlocker,
  IContentReferenceCounts,
  IListParams,
  IStorageIdReferenceCounts
} from "../database/interface.js";

export default interface IGeesomeStorageSpaceModule {
  getStorageSpaceOverview(): Promise<IStorageSpaceOverview>;

  getStorageSpaceTypeBreakdown(listParams?: IListParams): Promise<IStorageSpaceTypeBreakdownRow[]>;

  getStorageSpaceTopContents(listParams?: IListParams): Promise<IStorageSpaceContentRow[]>;

  getStorageSpaceTopFileCatalogItems(listParams?: IListParams): Promise<IStorageSpaceFileCatalogRow[]>;

  getStorageSpaceFileCatalogFolders(listParams?: IListParams): Promise<IStorageSpaceFileCatalogFolderRow[]>;

  getStorageSpaceTopGroups(listParams?: IListParams): Promise<IStorageSpaceGroupRow[]>;

  getStorageSpaceGroupPosts(listParams?: IListParams): Promise<IStorageSpaceGroupPostRow[]>;

  getStorageSpaceGeneratedOutputs(listParams?: IListParams): Promise<IStorageSpaceGeneratedOutputRow[]>;

  getStorageSpaceSharedStorageIds(listParams?: IListParams): Promise<IStorageSpaceSharedStorageIdRow[]>;

  getStorageSpacePinnedStorageObjects(listParams?: IListParams): Promise<IStorageSpacePinnedStorageObjectRow[]>;

  getStorageSpacePreviewStorage(listParams?: IListParams): Promise<IStorageSpacePreviewStorageRow[]>;

  getStorageSpaceAvailabilitySignals(listParams?: IListParams): Promise<IStorageSpaceAvailabilitySignalRow[]>;

  inspectStorageSpaceAvailabilityNetworkSignals(listParams?: IListParams): Promise<IStorageSpaceAvailabilityNetworkSignalInspectionRow[]>;

  getStorageSpaceAvailabilityNetworkSamples(listParams?: IListParams): Promise<IStorageSpaceAvailabilityNetworkSampleRow[]>;

  refreshStorageSpaceAvailabilityNetworkSamples(userId?: number, listParams?: IListParams): Promise<IStorageSpaceAvailabilityNetworkSampleRefreshResult>;

  cleanupStorageSpaceAvailabilityNetworkSamples(options?: any): Promise<number>;

  queueStorageSpaceAvailabilityNetworkSampleRefresh(userId?: number | null, userApiKeyId?: number | null, listParams?: IListParams, options?: any): Promise<IUserOperationQueue>;

  startStorageSpaceAvailabilityNetworkSampleRefreshWorker(): void;

  stopStorageSpaceAvailabilityNetworkSampleRefreshWorker(): void;

  processStorageSpaceAvailabilityNetworkSampleRefreshQueue(options?: any): Promise<{processed: number}>;

  getStorageSpaceCleanupBlockers(listParams?: IListParams): Promise<IStorageSpaceCleanupBlockerRow[]>;

  getStorageSpaceGeneratedOutputUnknownRefs(listParams?: IListParams): Promise<IStorageSpaceGeneratedOutputRefRow[]>;

  inspectStorageSpaceGeneratedOutputRefs(listParams?: IListParams): Promise<IStorageSpaceGeneratedOutputInspectionRow[]>;

  reconcileStorageSpaceGeneratedOutputRefs(listParams?: IListParams): Promise<IStorageSpaceGeneratedOutputReconcileResult>;

  inspectStorageSpaceGeneratedOutputChildRefs(listParams?: IListParams): Promise<IStorageSpaceGeneratedOutputChildInspectionRow[]>;

  reconcileStorageSpaceGeneratedOutputChildRefs(listParams?: IListParams): Promise<IStorageSpaceGeneratedOutputChildReconcileResult>;

  getLatestStorageSpaceSnapshot(): Promise<IStorageSpaceSnapshot | null>;

  getStorageSpaceSnapshotHistory(listParams?: IListParams): Promise<IStorageSpaceSnapshotHistoryRow[]>;

  getStorageSpaceSnapshotGrowth(listParams?: IListParams): Promise<IStorageSpaceSnapshotGrowth | null>;

  refreshStorageSpaceSnapshot(userId?: number, listParams?: IListParams, options?: IStorageSpaceSnapshotDataOptions): Promise<IStorageSpaceSnapshot>;

  getStorageSpaceSnapshotData(listParams?: IListParams, options?: IStorageSpaceSnapshotDataOptions): Promise<IStorageSpaceSnapshotData>;

  queueStorageSpaceSnapshotRefresh(userId: number, userApiKeyId?: number, listParams?: IListParams, options?: any): Promise<IUserOperationQueue>;

  processStorageSpaceSnapshotRefreshQueue(options?: any): Promise<{processed: number}>;

  queueStorageObjectRemoval(userId: number, userApiKeyId: number | null, storageId: string, options?: any): Promise<IUserOperationQueue>;

  startStorageObjectRemovalQueueProcessing(options?: any): void;

  processStorageObjectRemovalQueue(options?: any): Promise<IStorageSpaceStorageObjectRemovalQueueResult>;

  removeStorageObjectIfSafe(storageId: string): Promise<IStorageSpaceStorageObjectRemovalResult>;

  getStorageObjectRemovalHistory(listParams?: IListParams): Promise<IStorageSpaceStorageObjectRemovalHistoryRow[]>;
}

export interface IStorageSpaceOverview {
  contentRowsCount: number;
  contentStorageObjectsCount: number;
  logicalContentBytes: number;
  physicalContentBytes: number;
  duplicateStorageIdsCount: number;
  duplicateContentRowsCount: number;
  fileCatalogItemsCount: number;
  fileCatalogLogicalBytes: number;
  groupPostsCount: number;
  groupPostsLogicalBytes: number;
  pinnedStorageObjectsCount: number;
  pinnedPhysicalBytes: number;
  remotePinnedStorageObjectsCount: number;
  remotePinRefsCount: number;
  generatedOutputStorageRefsCount: number;
  generatedOutputUniqueStorageIdsCount: number;
  generatedOutputKnownStorageObjectsCount: number;
  generatedOutputKnownPhysicalBytes: number;
  generatedOutputUnknownStorageIdsCount: number;
}

export interface IStorageSpaceTypeBreakdownRow {
  mimeType: string;
  extension: string;
  contentRowsCount: number;
  storageObjectsCount: number;
  logicalBytes: number;
  physicalBytes: number;
}

export interface IStorageSpaceContentRow {
  id: number;
  userId: number;
  name?: string;
  mimeType?: string;
  extension?: string;
  storageId?: string;
  size: number;
  createdAt?: Date;
}

export interface IStorageSpaceFileCatalogRow {
  id: number;
  userId?: number;
  groupId?: number;
  parentItemId?: number;
  contentId?: number;
  name?: string;
  type?: string;
  mimeType?: string;
  extension?: string;
  storageId?: string;
  size: number;
}

export interface IStorageSpaceFileCatalogFolderRow {
  id: number;
  userId?: number;
  groupId?: number;
  parentItemId?: number;
  name?: string;
  defaultFolderFor?: string;
  childFoldersCount: number;
  directFilesCount: number;
  filesCount: number;
  storageObjectsCount: number;
  logicalBytes: number;
  physicalBytes: number;
}

export interface IStorageSpaceGroupRow {
  id: number;
  name?: string;
  title?: string;
  size: number;
  availablePostsCount: number;
}

export interface IStorageSpaceGroupPostRow {
  id: number;
  groupId?: number;
  userId?: number;
  localId?: number;
  name?: string;
  publishedAt?: Date;
  groupName?: string;
  groupTitle?: string;
  logicalBytes: number;
  attachmentsCount: number;
  attachmentLogicalBytes: number;
  storageObjectsCount: number;
  physicalBytes: number;
}

export interface IStorageSpaceGeneratedOutputRow {
  source: string;
  storageRefsCount: number;
  uniqueStorageIdsCount: number;
  knownStorageObjectsCount: number;
  knownPhysicalBytes: number;
  unknownStorageIdsCount: number;
}

export interface IStorageSpaceGeneratedOutputRefRow {
  source: string;
  storageId: string | null;
  storageRefsCount: number;
}

export interface IStorageSpaceSharedStorageIdRow {
  storageId: string;
  firstContentId: number;
  storageObjectId?: number | null;
  mimeType?: string;
  extension?: string;
  contentRowsCount: number;
  usersCount: number;
  logicalBytes: number;
  physicalBytes: number;
  deduplicatedSavingsBytes: number;
  activeFileCatalogRefsCount: number;
  groupPostRefsCount: number;
  isPinned: boolean;
}

export interface IStorageSpacePinnedStorageObjectRow {
  id: number;
  storageId: string;
  storageType?: string;
  mimeType?: string;
  extension?: string;
  physicalBytes: number;
  contentRowsCount: number;
  usersCount: number;
  activeFileCatalogRefsCount: number;
  groupPostRefsCount: number;
  generatedOutputRefsCount: number;
  remotePinsCount: number;
  pinAccountsCount: number;
  pinServices?: string;
  isPinned: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IStorageSpacePreviewStorageRow {
  previewField: string;
  contentRowsCount: number;
  storageObjectRowsCount: number;
  uniqueStorageIdsCount: number;
  registeredStorageObjectsCount: number;
  unregisteredStorageIdsCount: number;
  logicalPreviewBytes: number;
  physicalPreviewBytes: number;
}

export interface IStorageSpaceAvailabilitySignalRow {
  id?: number | null;
  storageId: string;
  storageType?: string | null;
  mimeType?: string;
  extension?: string;
  physicalBytes: number;
  contentRowsCount: number;
  usersCount: number;
  activeFileCatalogRefsCount: number;
  groupPostRefsCount: number;
  generatedOutputRefsCount: number;
  localPinRefsCount: number;
  remotePinsCount: number;
  pinAccountsCount: number;
  pinServices?: string | null;
  contentPeerRowsCount: number;
  postPeerRowsCount: number;
  groupPeerRowsCount: number;
  maxContentPeersCount: number;
  maxPostPeersCount: number;
  maxGroupPeersCount: number;
  maxPeerCount: number;
  maxFullyPeerCount: number;
  isPinned: boolean;
  latestSignalAt?: Date | null;
  updatedAt?: Date | null;
}

export interface IStorageSpaceAvailabilityProviderRow {
  id?: string | null;
  multiaddrs: string[];
  protocols: string[];
  source?: string | null;
}

export interface IStorageSpaceAvailabilityNetworkSignalInspectionRow extends IStorageSpaceAvailabilitySignalRow {
  providerLookupOk: boolean;
  providersCount: number;
  providersTruncated: boolean;
  providerLookupDurationMs: number;
  providerLookupErrorMessage?: string | null;
  providers: IStorageSpaceAvailabilityProviderRow[];
  retrievalStatOk: boolean;
  retrievalStatDurationMs: number;
  retrievalType?: string | null;
  retrievalMeasuredBytes: number;
  retrievalErrorMessage?: string | null;
}

export interface IStorageSpaceAvailabilityNetworkSampleRow extends IStorageSpaceAvailabilityNetworkSignalInspectionRow {
  id: number;
  userId?: number | null;
  sampledAt?: Date | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

export interface IStorageSpaceAvailabilityNetworkSampleRefreshResult {
  sampled: number;
  durationMs: number;
  rows: IStorageSpaceAvailabilityNetworkSampleRow[];
}

export interface IStorageSpaceCleanupBlockerRow extends IStorageSpaceContentRow {
  contentRefs: IContentReferenceCounts;
  storageRefs: IStorageIdReferenceCounts;
  contentBlockers: IContentDeleteSafetyBlocker[];
  storageBlockers: IContentDeleteSafetyBlocker[];
  blockers: IContentDeleteSafetyBlocker[];
  blockerCount: number;
  safeToDestroyContent: boolean;
  safeToRemovePhysical: boolean;
}

export interface IStorageSpaceStorageObjectRemovalResult {
  storageId: string;
  storageRefs: IStorageIdReferenceCounts;
  storageBlockers: IContentDeleteSafetyBlocker[];
  blockers: IContentDeleteSafetyBlocker[];
  safeToRemovePhysical: boolean;
  removed: boolean;
  missing: boolean;
  blocked: boolean;
}

export interface IStorageSpaceStorageObjectRemovalQueueResult {
  processed: number;
  delayed?: number;
  nextProcessAt?: Date;
}

export interface IStorageSpaceStorageObjectRemovalHistoryRow {
  queueId: number;
  asyncOperationId?: number | null;
  userId?: number | null;
  userApiKeyId?: number | null;
  storageId: string;
  status: string;
  isWaiting: boolean;
  ready: boolean;
  queuedAt?: Date | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  nextProcessAt?: Date | null;
  delayMs: number;
  result?: IStorageSpaceStorageObjectRemovalResult | null;
  errorMessage?: string | null;
  updatedAt?: Date | null;
}

export interface IStorageSpaceGeneratedOutputInspectionRow extends IStorageSpaceGeneratedOutputRefRow {
  ok: boolean;
  type?: string | null;
  measuredBytes: number;
  statSize: number;
  cumulativeSize: number;
  blocksSize: number;
  errorMessage?: string | null;
}

export interface IStorageSpaceGeneratedOutputReconcileResult {
  inspected: number;
  reconciled: number;
  failed: number;
  skipped: number;
  rows: IStorageSpaceGeneratedOutputReconcileRow[];
}

export interface IStorageSpaceGeneratedOutputReconcileRow extends IStorageSpaceGeneratedOutputInspectionRow {
  reconciled: boolean;
  storageObjectId?: number | null;
}

export interface IStorageSpaceGeneratedOutputChildRefInspectionRow {
  source: string;
  parentStorageId: string;
  storageId: string;
  depth?: number;
  path?: string | null;
  name?: string | null;
  type?: string | null;
  measuredBytes: number;
  statSize: number;
  cumulativeSize: number;
  blocksSize: number;
  knownStorageObject: boolean;
  storageObjectId?: number | null;
  storageObjectBytes?: number | null;
}

export interface IStorageSpaceGeneratedOutputChildInspectionRow extends IStorageSpaceGeneratedOutputInspectionRow {
  childLimit: number;
  depthLimit?: number;
  nodeLimit?: number;
  childrenCount: number;
  inspectedChildrenCount: number;
  inspectedParentStorageIds?: string[];
  knownChildrenCount: number;
  unknownChildrenCount: number;
  childMeasuredBytes: number;
  knownChildPhysicalBytes: number;
  unknownChildMeasuredBytes: number;
  childrenTruncated: boolean;
  childErrorMessage?: string | null;
  children: IStorageSpaceGeneratedOutputChildRefInspectionRow[];
}

export interface IStorageSpaceGeneratedOutputChildReconcileResult {
  inspectedParents: number;
  inspectedChildren: number;
  reconciled: number;
  skipped: number;
  rows: IStorageSpaceGeneratedOutputChildReconcileRow[];
}

export interface IStorageSpaceGeneratedOutputChildReconcileRow extends IStorageSpaceGeneratedOutputChildRefInspectionRow {
  reconciled: boolean;
}

export interface IStorageSpaceSnapshotData {
  overview: IStorageSpaceOverview;
  typeBreakdown: IStorageSpaceTypeBreakdownRow[];
  topContents: IStorageSpaceContentRow[];
  topFileCatalogItems: IStorageSpaceFileCatalogRow[];
  fileCatalogFolders: IStorageSpaceFileCatalogFolderRow[];
  topGroups: IStorageSpaceGroupRow[];
  groupPosts: IStorageSpaceGroupPostRow[];
  generatedOutputs: IStorageSpaceGeneratedOutputRow[];
  sharedStorageIds: IStorageSpaceSharedStorageIdRow[];
  pinnedStorageObjects: IStorageSpacePinnedStorageObjectRow[];
  previewStorage: IStorageSpacePreviewStorageRow[];
  availabilitySignals: IStorageSpaceAvailabilitySignalRow[];
}

export interface IStorageSpaceSnapshotDataOptions {
  onProgress?: (progress: IStorageSpaceSnapshotProgress) => Promise<void> | void;
}

export interface IStorageSpaceSnapshotProgress {
  stage: string;
  percent: number;
  finishedStages: number;
  totalStages: number;
}

export interface IStorageSpaceSnapshot {
  id: number;
  userId?: number;
  listLimit: number;
  durationMs: number;
  data: IStorageSpaceSnapshotData;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IStorageSpaceSnapshotHistoryRow {
  id: number;
  userId?: number | null;
  listLimit: number;
  durationMs: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IStorageSpaceSnapshotGrowthMetric {
  key: string;
  latest: number;
  baseline: number;
  delta: number;
}

export interface IStorageSpaceSnapshotGrowth {
  latestSnapshot: IStorageSpaceSnapshot;
  baselineSnapshot?: IStorageSpaceSnapshot | null;
  sinceDays: number;
  usedFallbackBaseline: boolean;
  elapsedMs: number;
  overview: IStorageSpaceSnapshotGrowthMetric[];
  sections: IStorageSpaceSnapshotGrowthMetric[];
}
