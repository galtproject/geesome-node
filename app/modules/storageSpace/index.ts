import debug from 'debug';
import {IGeesomeApp} from "../../interface.js";
import {ContentStorageType, IListParams, IListParamsOptions} from "../database/interface.js";
import IGeesomeStorageModule from "../storage/interface.js";
import IGeesomeStorageSpaceModule, {
  IStorageSpaceGeneratedOutputRefRow,
  IStorageSpaceGeneratedOutputInspectionRow,
  IStorageSpaceGeneratedOutputReconcileRow,
  IStorageSpaceCleanupBlockerRow,
  IStorageSpaceSnapshotData,
  IStorageSpaceSnapshotDataOptions,
  IStorageSpaceSnapshotProgress
} from "./interface.js";
import * as storageSpaceQueries from './queryHelpers.js';

const log = debug('geesome:app:storageSpace');
const maxListLimit = 10000;
const storageSpaceListParams: IListParamsOptions = {
  limit: 20,
  maxLimit: 100,
};
const storageSpaceStorageInspectionListParams: IListParamsOptions = {
  limit: 10,
  maxLimit: 25,
};
const storageSpaceCleanupBlockerListParams: IListParamsOptions = {
  limit: 10,
  maxLimit: 25,
};
const storageSpaceSnapshotQueueModuleName = 'storage-space-snapshot';
const storageSpaceSnapshotQueueKickBatchLimit = parsePositiveInteger(process.env.STORAGE_SPACE_SNAPSHOT_QUEUE_KICK_BATCH_LIMIT, 1);
const storageSpaceSnapshotQueueInitialPercent = 1;

export default async function (app: IGeesomeApp) {
  app.checkModules(['database', 'api', 'asyncOperation', 'group', 'fileCatalog', 'staticSiteGenerator', 'storage']);
  const module = new StorageSpaceModule(app);
  (await import('./api.js')).default(app, module);
  return module as IGeesomeStorageSpaceModule;
}

class StorageSpaceModule implements IGeesomeStorageSpaceModule {
  app: IGeesomeApp;

  constructor(app: IGeesomeApp) {
    this.app = app;
  }

  async getStorageSpaceOverview() {
    return storageSpaceQueries.getStorageSpaceOverview(this.app.ms.database.sequelize);
  }

  async getStorageSpaceTypeBreakdown(listParams: IListParams = {}) {
    return storageSpaceQueries.getStorageSpaceTypeBreakdown(this.app.ms.database.sequelize, getStorageSpaceListWindow(listParams));
  }

  async getStorageSpaceTopContents(listParams: IListParams = {}) {
    return storageSpaceQueries.getStorageSpaceTopContents(this.app.ms.database.sequelize, getStorageSpaceListWindow(listParams));
  }

  async getStorageSpaceTopFileCatalogItems(listParams: IListParams = {}) {
    return storageSpaceQueries.getStorageSpaceTopFileCatalogItems(this.app.ms.database.sequelize, getStorageSpaceListWindow(listParams));
  }

  async getStorageSpaceFileCatalogFolders(listParams: IListParams = {}) {
    return storageSpaceQueries.getStorageSpaceFileCatalogFolders(this.app.ms.database.sequelize, getStorageSpaceFileCatalogFolderWindow(listParams));
  }

  async getStorageSpaceTopGroups(listParams: IListParams = {}) {
    return storageSpaceQueries.getStorageSpaceTopGroups(this.app.ms.database.sequelize, getStorageSpaceListWindow(listParams));
  }

  async getStorageSpaceGroupPosts(listParams: IListParams = {}) {
    return storageSpaceQueries.getStorageSpaceGroupPosts(this.app.ms.database.sequelize, getStorageSpaceGroupPostWindow(listParams));
  }

  async getStorageSpaceGeneratedOutputs(listParams: IListParams = {}) {
    return storageSpaceQueries.getStorageSpaceGeneratedOutputs(this.app.ms.database.sequelize, getStorageSpaceListWindow(listParams));
  }

  async getStorageSpaceSharedStorageIds(listParams: IListParams = {}) {
    return storageSpaceQueries.getStorageSpaceSharedStorageIds(this.app.ms.database.sequelize, getStorageSpaceListWindow(listParams));
  }

  async getStorageSpacePinnedStorageObjects(listParams: IListParams = {}) {
    return storageSpaceQueries.getStorageSpacePinnedStorageObjects(this.app.ms.database.sequelize, getStorageSpaceListWindow(listParams));
  }

  async getStorageSpacePreviewStorage(listParams: IListParams = {}) {
    return storageSpaceQueries.getStorageSpacePreviewStorage(this.app.ms.database.sequelize, getStorageSpaceListWindow(listParams));
  }

  async getStorageSpaceCleanupBlockers(listParams: IListParams = {}) {
    const candidates = await storageSpaceQueries.getStorageSpaceCleanupCandidateContents(
      this.app.ms.database.sequelize,
      getStorageSpaceCleanupBlockerWindow(listParams)
    );
    const rows: IStorageSpaceCleanupBlockerRow[] = [];
    for (const candidate of candidates) {
      rows.push(await getStorageSpaceCleanupBlockerRow(this.app, candidate));
    }
    return rows;
  }

  async getStorageSpaceGeneratedOutputUnknownRefs(listParams: IListParams = {}) {
    return storageSpaceQueries.getStorageSpaceGeneratedOutputUnknownRefs(this.app.ms.database.sequelize, getStorageSpaceStorageInspectionWindow(listParams));
  }

  async inspectStorageSpaceGeneratedOutputRefs(listParams: IListParams = {}) {
    const refs = await this.getStorageSpaceGeneratedOutputUnknownRefs(listParams);
    const rows: IStorageSpaceGeneratedOutputInspectionRow[] = [];
    for (const ref of refs) {
      rows.push(await inspectStorageSpaceGeneratedOutputRef(this.app.ms.storage, ref));
    }
    return rows;
  }

  async reconcileStorageSpaceGeneratedOutputRefs(listParams: IListParams = {}) {
    const inspections = await this.inspectStorageSpaceGeneratedOutputRefs(listParams);
    const rows: IStorageSpaceGeneratedOutputReconcileRow[] = [];
    for (const inspection of inspections) {
      rows.push(await reconcileStorageSpaceGeneratedOutputRef(this.app, inspection));
    }
    return getStorageSpaceGeneratedOutputReconcileResult(rows);
  }

  async getLatestStorageSpaceSnapshot() {
    const snapshot = await this.app.ms.database.models.StorageSpaceSnapshot.findOne({
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
    });
    return getStorageSpaceSnapshotResponse(snapshot);
  }

  async refreshStorageSpaceSnapshot(userId?: number, listParams: IListParams = {}, options: IStorageSpaceSnapshotDataOptions = {}) {
    const startedAt = Date.now();
    const listWindow = getStorageSpaceSnapshotListWindow(listParams);
    const data = await this.getStorageSpaceSnapshotData(listWindow, options);
    const snapshot = await this.app.ms.database.models.StorageSpaceSnapshot.create({
      userId,
      listLimit: listWindow.limit,
      durationMs: Date.now() - startedAt,
      data: JSON.stringify(data),
    });
    return getStorageSpaceSnapshotResponse(snapshot);
  }

  async getStorageSpaceSnapshotData(listParams: IListParams = {}, options: IStorageSpaceSnapshotDataOptions = {}) {
    const listWindow = getStorageSpaceSnapshotListWindow(listParams);
    if (options.onProgress) {
      return getStorageSpaceSnapshotDataWithProgress(this, listWindow, options);
    }
    return getStorageSpaceSnapshotDataInParallel(this, listWindow);
  }

  async queueStorageSpaceSnapshotRefresh(userId: number, userApiKeyId = null, listParams: IListParams = {}, options: any = {}) {
    const queue = await this.app.ms.asyncOperation.addUserOperationQueue(
      userId,
      storageSpaceSnapshotQueueModuleName,
      userApiKeyId,
      getStorageSpaceSnapshotRefreshJobInput(listParams)
    );
    if (options.process !== false) {
      this.startStorageSpaceSnapshotRefreshQueueProcessing();
    }
    return queue;
  }

  startStorageSpaceSnapshotRefreshQueueProcessing(options: any = {}) {
    const limit = parsePositiveInteger(options.limit, storageSpaceSnapshotQueueKickBatchLimit);
    void this.processStorageSpaceSnapshotRefreshQueue({limit}).catch((e) => {
      log('processStorageSpaceSnapshotRefreshQueue error', e);
    });
  }

  async processStorageSpaceSnapshotRefreshQueue(options: any = {}) {
    const limit = parsePositiveInteger(options.limit, Number.MAX_SAFE_INTEGER);
    return this.app.ms.asyncOperation.processModuleOperationQueue(storageSpaceSnapshotQueueModuleName, {
      limit,
      getPayload: (waitingQueue) => parseStorageSpaceSnapshotRefreshJob(waitingQueue.inputJson),
      getAsyncOperationData: (_waitingQueue, job) => ({
        name: 'refresh-storage-space-snapshot',
        channel: getStorageSpaceSnapshotRefreshJobChannel(job),
        percent: storageSpaceSnapshotQueueInitialPercent,
      }),
      run: async (waitingQueue, _asyncOperation, job) => {
        const snapshot = await this.refreshStorageSpaceSnapshot(waitingQueue.userId, job.listParams, {
          onProgress: (progress) => updateStorageSpaceSnapshotRefreshProgress(this.app, _asyncOperation, progress),
        });
        return getStorageSpaceSnapshotRefreshJobResult(snapshot);
      },
    });
  }
}

function parseNonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(value as any, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value as any, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function getListLimitCap(defaultParams: IListParamsOptions) {
  const cap = parseNonNegativeInteger(defaultParams.maxLimit, maxListLimit);
  return Math.min(cap, maxListLimit);
}

function getStorageSpaceListWindow(listParams: IListParams = {}, defaultParams = storageSpaceListParams) {
  const limitCap = getListLimitCap(defaultParams);
  return {
    limit: Math.min(parseNonNegativeInteger(listParams.limit, defaultParams.limit), limitCap),
    offset: parseNonNegativeInteger(listParams.offset, 0),
  };
}

function getStorageSpaceStorageInspectionWindow(listParams: IListParams = {}) {
  return getStorageSpaceListWindow(listParams, storageSpaceStorageInspectionListParams);
}

function getStorageSpaceSnapshotListWindow(listParams: IListParams = {}) {
  const listWindow = getStorageSpaceListWindow(listParams);
  return {
    limit: listWindow.limit,
    offset: 0,
  };
}

async function getStorageSpaceSnapshotDataInParallel(module: StorageSpaceModule, listWindow): Promise<IStorageSpaceSnapshotData> {
  const [
    overview,
    typeBreakdown,
    topContents,
    topFileCatalogItems,
    fileCatalogFolders,
    topGroups,
    groupPosts,
    generatedOutputs,
    sharedStorageIds,
    pinnedStorageObjects,
    previewStorage,
  ] = await Promise.all([
    module.getStorageSpaceOverview(),
    module.getStorageSpaceTypeBreakdown(listWindow),
    module.getStorageSpaceTopContents(listWindow),
    module.getStorageSpaceTopFileCatalogItems(listWindow),
    module.getStorageSpaceFileCatalogFolders(listWindow),
    module.getStorageSpaceTopGroups(listWindow),
    module.getStorageSpaceGroupPosts(listWindow),
    module.getStorageSpaceGeneratedOutputs(listWindow),
    module.getStorageSpaceSharedStorageIds(listWindow),
    module.getStorageSpacePinnedStorageObjects(listWindow),
    module.getStorageSpacePreviewStorage(listWindow),
  ]);

  return {
    overview,
    typeBreakdown,
    topContents,
    topFileCatalogItems,
    fileCatalogFolders,
    topGroups,
    groupPosts,
    generatedOutputs,
    sharedStorageIds,
    pinnedStorageObjects,
    previewStorage,
  } as IStorageSpaceSnapshotData;
}

async function getStorageSpaceSnapshotDataWithProgress(module: StorageSpaceModule, listWindow, options: IStorageSpaceSnapshotDataOptions): Promise<IStorageSpaceSnapshotData> {
  const data: any = {};
  const stages = getStorageSpaceSnapshotStages(module, listWindow);

  for (const [stageIndex, stage] of stages.entries()) {
    data[stage.key] = await stage.getData();
    await notifyStorageSpaceSnapshotProgress(options, stage.name, stageIndex, stages.length);
  }

  return data as IStorageSpaceSnapshotData;
}

function getStorageSpaceFileCatalogFolderWindow(listParams: any = {}) {
  const listWindow = getStorageSpaceListWindow(listParams);
  return {
    ...listWindow,
    parentItemId: parseNullableStorageSpaceId(listParams.parentItemId),
  };
}

function getStorageSpaceGroupPostWindow(listParams: any = {}) {
  const listWindow = getStorageSpaceListWindow(listParams);
  return {
    ...listWindow,
    groupId: parseNullableStorageSpaceId(listParams.groupId),
  };
}

function getStorageSpaceCleanupBlockerWindow(listParams: any = {}) {
  const listWindow = getStorageSpaceListWindow(listParams, storageSpaceCleanupBlockerListParams);
  const contentId = parseNullableStorageSpaceId(listParams.contentId);
  return {
    ...listWindow,
    contentId,
    offset: contentId === null ? listWindow.offset : 0,
  };
}

function parseNullableStorageSpaceId(value) {
  if (value === null || value === undefined || value === '' || value === 'null' || value === 'undefined') {
    return null;
  }
  return parseNonNegativeInteger(value, null);
}

function getStorageSpaceSnapshotRefreshJobInput(listParams: IListParams = {}) {
  return {
    type: 'refresh',
    listParams: getStorageSpaceSnapshotListWindow(listParams),
  };
}

function parseStorageSpaceSnapshotRefreshJob(inputJson) {
  const job = typeof inputJson === 'string' ? JSON.parse(inputJson) : inputJson;
  if (job?.type !== 'refresh') {
    throw new Error('invalid_storage_space_snapshot_job_type');
  }
  return {
    type: job.type,
    listParams: getStorageSpaceSnapshotListWindow(job.listParams),
  };
}

function getStorageSpaceSnapshotRefreshJobChannel(job) {
  return `${storageSpaceSnapshotQueueModuleName}:refresh:limit:${job.listParams.limit}`;
}

function getStorageSpaceSnapshotRefreshJobResult(snapshot) {
  return {
    snapshotId: snapshot.id,
    listLimit: snapshot.listLimit,
    durationMs: snapshot.durationMs,
    createdAt: snapshot.createdAt,
  };
}

async function updateStorageSpaceSnapshotRefreshProgress(app: IGeesomeApp, asyncOperation, progress: IStorageSpaceSnapshotProgress) {
  await app.ms.asyncOperation.updateUserAsyncOperation(asyncOperation.id, {
    percent: progress.percent,
    output: JSON.stringify(getStorageSpaceSnapshotProgressOutput(progress)),
  });
}

function getStorageSpaceSnapshotResponse(snapshot) {
  if (!snapshot) {
    return null;
  }

  const snapshotData = typeof snapshot.toJSON === 'function' ? snapshot.toJSON() : snapshot;
  return {
    id: snapshotData.id,
    userId: snapshotData.userId,
    listLimit: snapshotData.listLimit,
    durationMs: snapshotData.durationMs,
    data: parseStorageSpaceSnapshotData(snapshotData.data),
    createdAt: snapshotData.createdAt,
    updatedAt: snapshotData.updatedAt,
  };
}

function parseStorageSpaceSnapshotData(data) {
  if (!data) {
    return null;
  }
  if (typeof data !== 'string') {
    return normalizeStorageSpaceSnapshotData(data);
  }

  return normalizeStorageSpaceSnapshotData(JSON.parse(data));
}

function normalizeStorageSpaceSnapshotData(data) {
  if (!data.fileCatalogFolders) {
    data.fileCatalogFolders = [];
  }
  if (!data.groupPosts) {
    data.groupPosts = [];
  }
  if (!data.generatedOutputs) {
    data.generatedOutputs = [];
  }
  if (!data.sharedStorageIds) {
    data.sharedStorageIds = [];
  }
  if (!data.pinnedStorageObjects) {
    data.pinnedStorageObjects = [];
  }
  if (!data.previewStorage) {
    data.previewStorage = [];
  }
  return data;
}

async function inspectStorageSpaceGeneratedOutputRef(storage: IGeesomeStorageModule, ref: IStorageSpaceGeneratedOutputRefRow) {
  try {
    const stat = await storage.getFileStat(ref.storageId, {
      attempts: 1,
      attemptTimeout: 5000,
      withLocal: true,
      size: true,
    });
    return {
      ...ref,
      ok: true,
      type: stat?.type || null,
      measuredBytes: getStorageStatMeasuredBytes(stat),
      statSize: parseStorageStatNumber(stat?.size),
      cumulativeSize: parseStorageStatNumber(stat?.cumulativeSize),
      blocksSize: parseStorageStatNumber(stat?.blocksSize),
      errorMessage: null,
    };
  } catch (e) {
    return {
      ...ref,
      ok: false,
      type: null,
      measuredBytes: 0,
      statSize: 0,
      cumulativeSize: 0,
      blocksSize: 0,
      errorMessage: getStorageInspectionErrorMessage(e),
    };
  }
}

async function notifyStorageSpaceSnapshotProgress(options: IStorageSpaceSnapshotDataOptions, stage: string, stageIndex: number, totalStages: number) {
  if (!options.onProgress) {
    return null;
  }
  return options.onProgress({
    stage,
    totalStages,
    finishedStages: stageIndex + 1,
    percent: getStorageSpaceSnapshotProgressPercent(stageIndex, totalStages),
  });
}

function getStorageSpaceSnapshotProgressPercent(stageIndex: number, totalStages: number) {
  return Math.round(10 + ((stageIndex + 1) / totalStages) * 85);
}

function getStorageSpaceSnapshotProgressOutput(progress: IStorageSpaceSnapshotProgress) {
  return {
    type: 'storage-space-snapshot-progress',
    ...progress,
  };
}

function getStorageSpaceSnapshotStages(module: StorageSpaceModule, listWindow) {
  return [
    {
      key: 'overview',
      name: 'overview',
      getData: () => module.getStorageSpaceOverview(),
    },
    {
      key: 'typeBreakdown',
      name: 'type-breakdown',
      getData: () => module.getStorageSpaceTypeBreakdown(listWindow),
    },
    {
      key: 'topContents',
      name: 'top-contents',
      getData: () => module.getStorageSpaceTopContents(listWindow),
    },
    {
      key: 'topFileCatalogItems',
      name: 'top-file-catalog-items',
      getData: () => module.getStorageSpaceTopFileCatalogItems(listWindow),
    },
    {
      key: 'fileCatalogFolders',
      name: 'file-catalog-folders',
      getData: () => module.getStorageSpaceFileCatalogFolders(listWindow),
    },
    {
      key: 'topGroups',
      name: 'top-groups',
      getData: () => module.getStorageSpaceTopGroups(listWindow),
    },
    {
      key: 'groupPosts',
      name: 'group-posts',
      getData: () => module.getStorageSpaceGroupPosts(listWindow),
    },
    {
      key: 'generatedOutputs',
      name: 'generated-outputs',
      getData: () => module.getStorageSpaceGeneratedOutputs(listWindow),
    },
    {
      key: 'sharedStorageIds',
      name: 'shared-storage-ids',
      getData: () => module.getStorageSpaceSharedStorageIds(listWindow),
    },
    {
      key: 'pinnedStorageObjects',
      name: 'pinned-storage-objects',
      getData: () => module.getStorageSpacePinnedStorageObjects(listWindow),
    },
    {
      key: 'previewStorage',
      name: 'preview-storage',
      getData: () => module.getStorageSpacePreviewStorage(listWindow),
    },
  ];
}

function getStorageStatMeasuredBytes(stat) {
  return parseStorageStatNumber(
    stat?.cumulativeSize ?? stat?.size ?? stat?.fileSize ?? stat?.blocksSize
  );
}

function parseStorageStatNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

function getStorageInspectionErrorMessage(error) {
  return error?.message || String(error);
}

async function getStorageSpaceCleanupBlockerRow(app: IGeesomeApp, candidate): Promise<IStorageSpaceCleanupBlockerRow> {
  const deleteSafety = await app.ms.database.getContentDeleteSafety(candidate.id);
  return {
    ...candidate,
    contentRefs: deleteSafety.contentRefs,
    storageRefs: deleteSafety.storageRefs,
    contentBlockers: deleteSafety.contentBlockers,
    storageBlockers: deleteSafety.storageBlockers,
    blockers: deleteSafety.blockers,
    blockerCount: deleteSafety.blockers.length,
    safeToDestroyContent: deleteSafety.safeToDestroyContent,
    safeToRemovePhysical: deleteSafety.safeToRemovePhysical,
  };
}

async function reconcileStorageSpaceGeneratedOutputRef(app: IGeesomeApp, inspection: IStorageSpaceGeneratedOutputInspectionRow) {
  if (!inspection.ok) {
    return {
      ...inspection,
      reconciled: false,
      storageObjectId: null,
    };
  }
  const storageObject = await app.ms.database.syncStorageObject({
    storageId: inspection.storageId,
    storageType: ContentStorageType.IPFS,
    size: inspection.measuredBytes,
  });
  return {
    ...inspection,
    reconciled: !!storageObject,
    storageObjectId: storageObject?.id || null,
  };
}

function getStorageSpaceGeneratedOutputReconcileResult(rows: IStorageSpaceGeneratedOutputReconcileRow[]) {
  return {
    rows,
    inspected: rows.length,
    reconciled: rows.filter(row => row.reconciled).length,
    failed: rows.filter(row => !row.ok).length,
    skipped: rows.filter(row => row.ok && !row.reconciled).length,
  };
}
