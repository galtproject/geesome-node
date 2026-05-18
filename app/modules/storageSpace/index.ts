import debug from 'debug';
import {IGeesomeApp} from "../../interface.js";
import {IListParams, IListParamsOptions} from "../database/interface.js";
import IGeesomeStorageSpaceModule, {
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
const storageSpaceSnapshotQueueModuleName = 'storage-space-snapshot';
const storageSpaceSnapshotQueueKickBatchLimit = parsePositiveInteger(process.env.STORAGE_SPACE_SNAPSHOT_QUEUE_KICK_BATCH_LIMIT, 1);
const storageSpaceSnapshotQueueInitialPercent = 1;

export default async function (app: IGeesomeApp) {
  app.checkModules(['database', 'api', 'asyncOperation', 'group', 'fileCatalog', 'staticSiteGenerator']);
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

function getStorageSpaceListWindow(listParams: IListParams = {}) {
  const limitCap = getListLimitCap(storageSpaceListParams);
  return {
    limit: Math.min(parseNonNegativeInteger(listParams.limit, storageSpaceListParams.limit), limitCap),
    offset: parseNonNegativeInteger(listParams.offset, 0),
  };
}

function getStorageSpaceSnapshotListWindow(listParams: IListParams = {}) {
  const listWindow = getStorageSpaceListWindow(listParams);
  return {
    limit: listWindow.limit,
    offset: 0,
  };
}

async function getStorageSpaceSnapshotDataInParallel(module: StorageSpaceModule, listWindow): Promise<IStorageSpaceSnapshotData> {
  const [overview, typeBreakdown, topContents, topFileCatalogItems, fileCatalogFolders, topGroups, groupPosts, generatedOutputs] = await Promise.all([
    module.getStorageSpaceOverview(),
    module.getStorageSpaceTypeBreakdown(listWindow),
    module.getStorageSpaceTopContents(listWindow),
    module.getStorageSpaceTopFileCatalogItems(listWindow),
    module.getStorageSpaceFileCatalogFolders(listWindow),
    module.getStorageSpaceTopGroups(listWindow),
    module.getStorageSpaceGroupPosts(listWindow),
    module.getStorageSpaceGeneratedOutputs(listWindow),
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
  return data;
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
  ];
}
