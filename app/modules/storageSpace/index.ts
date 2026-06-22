import debug from 'debug';
import {Op} from 'sequelize';
import {IGeesomeApp} from "../../interface.js";
import helpers from "../../helpers.js";
import {IListParams, IListParamsOptions} from "../database/interface.js";
import IGeesomeStorageSpaceModule, {
  IStorageSpaceAvailabilityNetworkSampleRefreshResult,
  IStorageSpaceAvailabilityNetworkSampleRow,
  IStorageSpaceAvailabilityNetworkSignalInspectionRow,
  IStorageSpaceCleanupBlockerRow,
  IStorageSpaceSnapshotData,
  IStorageSpaceSnapshotDataOptions,
  IStorageSpaceSnapshotGrowth,
  IStorageSpaceSnapshotProgress,
  IStorageSpaceStorageObjectRemovalHistoryRow,
  IStorageSpaceStorageObjectRemovalQueueResult,
  IStorageSpaceStorageObjectRemovalResult
} from "./interface.js";
import * as storageSpaceQueries from './queryHelpers.js';
import {
  getStorageSpaceGeneratedOutputChildReconcileResult,
  getStorageSpaceGeneratedOutputReconcileResult,
  inspectStorageSpaceAvailabilityNetworkSignal,
  inspectStorageSpaceGeneratedOutputChildRefs as inspectGeneratedOutputChildRefs,
  inspectStorageSpaceGeneratedOutputRef,
  replaceStorageSpaceGeneratedOutputChildReferences,
  reconcileStorageSpaceGeneratedOutputChildRef,
  reconcileStorageSpaceGeneratedOutputRef
} from "./storageInspectionHelpers.js";

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
const storageSpaceAvailabilityNetworkInspectionListParams: IListParamsOptions = {
  limit: 3,
  maxLimit: 10,
};
const storageSpaceChildInspectionListParams: IListParamsOptions = {
  limit: 3,
  maxLimit: 10,
};
const storageSpaceAvailabilityNetworkDefaultProviderLimit = 20;
const storageSpaceAvailabilityNetworkMaxProviderLimit = 50;
const storageSpaceAvailabilityNetworkDefaultProviderAddressLimit = 5;
const storageSpaceAvailabilityNetworkMaxProviderAddressLimit = 20;
const storageSpaceAvailabilityNetworkDefaultProviderTimeoutMs = 5000;
const storageSpaceAvailabilityNetworkMaxProviderTimeoutMs = 30000;
const storageSpaceAvailabilityNetworkDefaultStatTimeoutMs = 5000;
const storageSpaceAvailabilityNetworkMaxStatTimeoutMs = 30000;
const storageSpaceSnapshotGrowthDefaultSinceDays = 7;
const storageSpaceSnapshotOverviewGrowthFields = [
  'contentRowsCount',
  'contentStorageObjectsCount',
  'logicalContentBytes',
  'physicalContentBytes',
  'duplicateStorageIdsCount',
  'duplicateContentRowsCount',
  'fileCatalogItemsCount',
  'fileCatalogLogicalBytes',
  'groupPostsCount',
  'groupPostsLogicalBytes',
  'pinnedStorageObjectsCount',
  'pinnedPhysicalBytes',
  'remotePinnedStorageObjectsCount',
  'remotePinRefsCount',
  'generatedOutputStorageRefsCount',
  'generatedOutputUniqueStorageIdsCount',
  'generatedOutputKnownStorageObjectsCount',
  'generatedOutputKnownPhysicalBytes',
  'generatedOutputUnknownStorageIdsCount',
];
const storageSpaceSnapshotSectionGrowthFields = [
  {key: 'logical-content', field: 'logicalContentBytes'},
  {key: 'physical-content', field: 'physicalContentBytes'},
  {key: 'file-catalog', field: 'fileCatalogLogicalBytes'},
  {key: 'group-posts', field: 'groupPostsLogicalBytes'},
  {key: 'pinned-storage', field: 'pinnedPhysicalBytes'},
  {key: 'generated-output', field: 'generatedOutputKnownPhysicalBytes'},
];
const storageSpaceChildInspectionDefaultChildLimit = 50;
const storageSpaceChildInspectionMaxChildLimit = 200;
const storageSpaceChildInspectionDefaultDepthLimit = 1;
const storageSpaceChildInspectionMaxDepthLimit = 5;
const storageSpaceChildInspectionDefaultNodeLimit = 200;
const storageSpaceChildInspectionMaxNodeLimit = 1000;
const storageSpaceCleanupBlockerListParams: IListParamsOptions = {
  limit: 10,
  maxLimit: 25,
};
const storageSpaceStorageRemovalHistoryListParams: IListParamsOptions = {
  limit: 20,
  maxLimit: 100,
};
const storageSpaceAvailabilitySampleListParams: IListParamsOptions = {
  limit: 20,
  maxLimit: 100,
};
const storageSpaceSnapshotQueueModuleName = 'storage-space-snapshot';
const storageSpaceSnapshotQueueKickBatchLimit = parsePositiveInteger(process.env.STORAGE_SPACE_SNAPSHOT_QUEUE_KICK_BATCH_LIMIT, 1);
const storageSpaceSnapshotQueueInitialPercent = 1;
const storageSpaceAvailabilitySampleQueueModuleName = 'storage-space-availability-sample';
const storageSpaceAvailabilitySampleQueueKickBatchLimit = parsePositiveInteger(process.env.STORAGE_SPACE_AVAILABILITY_SAMPLE_QUEUE_KICK_BATCH_LIMIT, 1);
const storageSpaceAvailabilitySampleQueueInitialPercent = 5;
const storageSpaceAvailabilitySampleRetentionDays = parseNonNegativeInteger(process.env.STORAGE_SPACE_AVAILABILITY_SAMPLE_RETENTION_DAYS, 90);
const storageSpaceAvailabilitySampleWorkerIntervalMs = parsePositiveInteger(process.env.STORAGE_SPACE_AVAILABILITY_SAMPLE_WORKER_INTERVAL_MS, 6 * 60 * 60 * 1000);
const storageSpaceAvailabilitySampleWorkerBatchLimit = parsePositiveInteger(process.env.STORAGE_SPACE_AVAILABILITY_SAMPLE_WORKER_BATCH_LIMIT, 1);
const storageSpaceAvailabilitySampleWorkerListLimit = parsePositiveInteger(process.env.STORAGE_SPACE_AVAILABILITY_SAMPLE_WORKER_LIST_LIMIT, 3);
const storageSpaceAvailabilitySampleWorkerOffset = parseNonNegativeInteger(process.env.STORAGE_SPACE_AVAILABILITY_SAMPLE_WORKER_OFFSET, 0);
const storageSpaceAvailabilitySampleWorkerProviderLimit = parsePositiveInteger(process.env.STORAGE_SPACE_AVAILABILITY_SAMPLE_WORKER_PROVIDER_LIMIT, 10);
const storageSpaceAvailabilitySampleWorkerProviderAddressLimit = parsePositiveInteger(process.env.STORAGE_SPACE_AVAILABILITY_SAMPLE_WORKER_PROVIDER_ADDRESS_LIMIT, 2);
const storageSpaceAvailabilitySampleWorkerProviderTimeoutMs = parsePositiveInteger(process.env.STORAGE_SPACE_AVAILABILITY_SAMPLE_WORKER_PROVIDER_TIMEOUT_MS, storageSpaceAvailabilityNetworkDefaultProviderTimeoutMs);
const storageSpaceAvailabilitySampleWorkerStatTimeoutMs = parsePositiveInteger(process.env.STORAGE_SPACE_AVAILABILITY_SAMPLE_WORKER_STAT_TIMEOUT_MS, storageSpaceAvailabilityNetworkDefaultStatTimeoutMs);
const storageSpaceStorageRemovalQueueModuleName = 'storage-space-storage-removal';
const storageSpaceStorageRemovalQueueKickBatchLimit = parsePositiveInteger(process.env.STORAGE_SPACE_STORAGE_REMOVAL_QUEUE_KICK_BATCH_LIMIT, 1);
const storageSpaceStorageRemovalQueueInitialPercent = 5;
const storageSpaceStorageRemovalDelayMs = parseNonNegativeInteger(process.env.STORAGE_SPACE_STORAGE_REMOVAL_DELAY_MS, 0);
const storageSpaceStorageRemovalWorkerIntervalMs = parsePositiveInteger(process.env.STORAGE_SPACE_STORAGE_REMOVAL_WORKER_INTERVAL_MS, 60000);
const storageSpaceStorageRemovalWorkerBatchLimit = parsePositiveInteger(process.env.STORAGE_SPACE_STORAGE_REMOVAL_WORKER_BATCH_LIMIT, 5);
let storageObjectRemovalQueueWorkerTimer = null;
let storageSpaceAvailabilitySampleWorkerTimer = null;

export default async function (app: IGeesomeApp) {
  app.checkModules(['database', 'api', 'asyncOperation', 'group', 'fileCatalog', 'staticSiteGenerator', 'storage']);
  const module = new StorageSpaceModule(app);
  module.startStorageSpaceAvailabilityNetworkSampleRefreshWorker();
  module.startStorageObjectRemovalQueueWorker();
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

  async getStorageSpaceAvailabilitySignals(listParams: IListParams = {}) {
    return storageSpaceQueries.getStorageSpaceAvailabilitySignals(this.app.ms.database.sequelize, getStorageSpaceListWindow(listParams));
  }

  async inspectStorageSpaceAvailabilityNetworkSignals(listParams: IListParams = {}) {
    const listWindow = getStorageSpaceAvailabilityNetworkInspectionWindow(listParams);
    const signals = await storageSpaceQueries.getStorageSpaceAvailabilitySignals(this.app.ms.database.sequelize, listWindow);
    const rows = [];
    for (const signal of signals) {
      rows.push(await inspectStorageSpaceAvailabilityNetworkSignal(this.app.ms.storage, signal, listWindow));
    }
    return rows;
  }

  async getStorageSpaceAvailabilityNetworkSamples(listParams: IListParams = {}) {
    const listWindow = getStorageSpaceAvailabilitySampleWindow(listParams);
    const rows = await this.app.ms.database.models.StorageSpaceAvailabilitySample.findAll({
      where: getStorageSpaceAvailabilitySampleWhere(listWindow),
      order: [['sampledAt', 'DESC'], ['id', 'DESC']],
      limit: listWindow.limit,
      offset: listWindow.offset,
    });
    return rows.map(row => getStorageSpaceAvailabilityNetworkSampleResponse(row));
  }

  async refreshStorageSpaceAvailabilityNetworkSamples(userId?: number, listParams: IListParams = {}): Promise<IStorageSpaceAvailabilityNetworkSampleRefreshResult> {
    const startedAt = Date.now();
    const inspections = await this.inspectStorageSpaceAvailabilityNetworkSignals(listParams);
    const rows = [];
    for (const inspection of inspections) {
      rows.push(await this.createStorageSpaceAvailabilityNetworkSample(userId, inspection));
    }
    await this.cleanupStorageSpaceAvailabilityNetworkSamples();
    return {
      sampled: rows.length,
      durationMs: Date.now() - startedAt,
      rows,
    };
  }

  async createStorageSpaceAvailabilityNetworkSample(userId: number | null | undefined, inspection: IStorageSpaceAvailabilityNetworkSignalInspectionRow) {
    const sample = await this.app.ms.database.models.StorageSpaceAvailabilitySample.create({
      userId: userId || null,
      storageId: inspection.storageId,
      sampleJson: JSON.stringify(inspection),
      providerLookupOk: inspection.providerLookupOk === true,
      providersCount: readNonNegativeNumber(inspection.providersCount),
      providersTruncated: inspection.providersTruncated === true,
      providerLookupDurationMs: readNonNegativeNumber(inspection.providerLookupDurationMs),
      providerLookupErrorMessage: inspection.providerLookupErrorMessage || null,
      retrievalStatOk: inspection.retrievalStatOk === true,
      retrievalStatDurationMs: readNonNegativeNumber(inspection.retrievalStatDurationMs),
      retrievalType: inspection.retrievalType || null,
      retrievalMeasuredBytes: readNonNegativeNumber(inspection.retrievalMeasuredBytes),
      retrievalErrorMessage: inspection.retrievalErrorMessage || null,
      sampledAt: new Date(),
    });
    return getStorageSpaceAvailabilityNetworkSampleResponse(sample);
  }

  async cleanupStorageSpaceAvailabilityNetworkSamples(options: any = {}) {
    const retentionDays = getStorageSpaceAvailabilitySampleRetentionDays(options);
    if (retentionDays <= 0) {
      return 0;
    }
    return this.app.ms.database.models.StorageSpaceAvailabilitySample.destroy({
      where: {
        sampledAt: {
          [Op.lt]: getStorageSpaceAvailabilitySampleRetentionCutoff(retentionDays, options.now),
        },
      },
    });
  }

  async queueStorageSpaceAvailabilityNetworkSampleRefresh(userId: number | null = null, userApiKeyId = null, listParams: IListParams = {}, options: any = {}) {
    const queue = await this.app.ms.asyncOperation.addUniqueUserOperationQueue(
      userId,
      storageSpaceAvailabilitySampleQueueModuleName,
      userApiKeyId,
      getStorageSpaceAvailabilitySampleRefreshJobInput(listParams, options.queueSource)
    );
    if (options.process !== false) {
      this.startStorageSpaceAvailabilityNetworkSampleRefreshQueueProcessing();
    }
    return queue;
  }

  startStorageSpaceAvailabilityNetworkSampleRefreshQueueProcessing(options: any = {}) {
    const limit = parsePositiveInteger(options.limit, storageSpaceAvailabilitySampleQueueKickBatchLimit);
    void this.processStorageSpaceAvailabilityNetworkSampleRefreshQueue({limit}).catch((e) => {
      log('processStorageSpaceAvailabilityNetworkSampleRefreshQueue error', e);
    });
  }

  startStorageSpaceAvailabilityNetworkSampleRefreshWorker() {
    if (!shouldRunStorageSpaceAvailabilitySampleWorker()) {
      return;
    }
    if (storageSpaceAvailabilitySampleWorkerTimer) {
      return;
    }

    this.kickStorageSpaceAvailabilityNetworkSampleRefreshWorker();
    storageSpaceAvailabilitySampleWorkerTimer = setInterval(() => {
      this.kickStorageSpaceAvailabilityNetworkSampleRefreshWorker();
    }, storageSpaceAvailabilitySampleWorkerIntervalMs);

    const timer: any = storageSpaceAvailabilitySampleWorkerTimer;
    if (timer.unref) {
      timer.unref();
    }
  }

  kickStorageSpaceAvailabilityNetworkSampleRefreshWorker() {
    void this.queueStorageSpaceAvailabilityNetworkSampleRefresh(
      null,
      null,
      getStorageSpaceAvailabilitySampleWorkerListParams(),
      {process: false, queueSource: 'worker'}
    ).then(() => {
      this.startStorageSpaceAvailabilityNetworkSampleRefreshQueueProcessing({
        limit: storageSpaceAvailabilitySampleWorkerBatchLimit,
      });
    }).catch((e) => {
      log('kickStorageSpaceAvailabilityNetworkSampleRefreshWorker error', e);
    });
  }

  stopStorageSpaceAvailabilityNetworkSampleRefreshWorker() {
    if (!storageSpaceAvailabilitySampleWorkerTimer) {
      return;
    }
    clearInterval(storageSpaceAvailabilitySampleWorkerTimer);
    storageSpaceAvailabilitySampleWorkerTimer = null;
  }

  async processStorageSpaceAvailabilityNetworkSampleRefreshQueue(options: any = {}) {
    const limit = parsePositiveInteger(options.limit, Number.MAX_SAFE_INTEGER);
    return this.app.ms.asyncOperation.processModuleOperationQueue(storageSpaceAvailabilitySampleQueueModuleName, {
      limit,
      getPayload: (waitingQueue) => parseStorageSpaceAvailabilitySampleRefreshJob(waitingQueue.inputJson),
      getAsyncOperationData: (_waitingQueue, job) => ({
        name: 'refresh-storage-space-availability-samples',
        channel: getStorageSpaceAvailabilitySampleRefreshJobChannel(job),
        percent: storageSpaceAvailabilitySampleQueueInitialPercent,
      }),
      run: async (waitingQueue, _asyncOperation, job) => {
        const result = await this.refreshStorageSpaceAvailabilityNetworkSamples(waitingQueue.userId, job.listParams);
        return getStorageSpaceAvailabilitySampleRefreshJobResult(result);
      },
    });
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
    const rows = [];
    for (const ref of refs) {
      rows.push(await inspectStorageSpaceGeneratedOutputRef(this.app.ms.storage, ref));
    }
    return rows;
  }

  async reconcileStorageSpaceGeneratedOutputRefs(listParams: IListParams = {}) {
    const inspections = await this.inspectStorageSpaceGeneratedOutputRefs(listParams);
    const rows = [];
    for (const inspection of inspections) {
      rows.push(await reconcileStorageSpaceGeneratedOutputRef(this.app, inspection));
    }
    return getStorageSpaceGeneratedOutputReconcileResult(rows);
  }

  async inspectStorageSpaceGeneratedOutputChildRefs(listParams: IListParams = {}) {
    const listWindow = getStorageSpaceGeneratedOutputChildInspectionWindow(listParams);
    const refs = await storageSpaceQueries.getStorageSpaceGeneratedOutputRefs(this.app.ms.database.sequelize, listWindow);
    const rows = [];
    for (const ref of refs) {
      rows.push(await inspectGeneratedOutputChildRefs(this.app, ref, listWindow));
    }
    return rows;
  }

  async reconcileStorageSpaceGeneratedOutputChildRefs(listParams: IListParams = {}) {
    const inspections = await this.inspectStorageSpaceGeneratedOutputChildRefs(listParams);
    const rows = [];
    for (const inspection of inspections) {
      const parentRows = [];
      for (const child of inspection.children) {
        parentRows.push(await reconcileStorageSpaceGeneratedOutputChildRef(this.app, child));
      }
      await replaceStorageSpaceGeneratedOutputChildReferences(this.app, inspection, parentRows);
      rows.push(...parentRows);
    }
    return getStorageSpaceGeneratedOutputChildReconcileResult(inspections.length, rows);
  }

  async getLatestStorageSpaceSnapshot() {
    const snapshot = await this.app.ms.database.models.StorageSpaceSnapshot.findOne({
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
    });
    return getStorageSpaceSnapshotResponse(snapshot);
  }

  async getStorageSpaceSnapshotGrowth(listParams: any = {}): Promise<IStorageSpaceSnapshotGrowth | null> {
    const snapshotModel = this.app.ms.database.models.StorageSpaceSnapshot;
    const latestSnapshotRow = await snapshotModel.findOne({
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
    });
    if (!latestSnapshotRow) {
      return null;
    }

    const sinceDays = getStorageSpaceSnapshotGrowthSinceDays(listParams);
    const baselineSnapshotRow = await getStorageSpaceSnapshotGrowthBaseline(snapshotModel, latestSnapshotRow, sinceDays);
    const latestSnapshot = getStorageSpaceSnapshotResponse(latestSnapshotRow);
    const baselineSnapshot = getStorageSpaceSnapshotResponse(baselineSnapshotRow);
    return {
      latestSnapshot,
      baselineSnapshot,
      sinceDays,
      usedFallbackBaseline: !!baselineSnapshotRow && !isStorageSpaceSnapshotOlderThanSinceDays(latestSnapshotRow, baselineSnapshotRow, sinceDays),
      elapsedMs: getStorageSpaceSnapshotGrowthElapsedMs(latestSnapshot, baselineSnapshot),
      overview: getStorageSpaceSnapshotOverviewGrowth(latestSnapshot?.data?.overview, baselineSnapshot?.data?.overview),
      sections: getStorageSpaceSnapshotSectionGrowth(latestSnapshot?.data?.overview, baselineSnapshot?.data?.overview),
    };
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

  async queueStorageObjectRemoval(userId: number, userApiKeyId: number | null, storageId: string, options: any = {}) {
    const delayMs = getStorageObjectRemovalDelayMs(options);
    const queue = await this.app.ms.asyncOperation.addUniqueUserOperationQueue(
      userId,
      storageSpaceStorageRemovalQueueModuleName,
      userApiKeyId,
      getStorageSpaceStorageRemovalJobInput(storageId)
    );
    if (options.process !== false && delayMs <= 0) {
      this.startStorageObjectRemovalQueueProcessing(options);
    }
    return queue;
  }

  startStorageObjectRemovalQueueProcessing(options: any = {}) {
    const limit = parsePositiveInteger(options.limit, storageSpaceStorageRemovalQueueKickBatchLimit);
    void this.processStorageObjectRemovalQueue({...options, limit}).catch((e) => {
      log('processStorageObjectRemovalQueue error', e);
    });
  }

  async processStorageObjectRemovalQueue(options: any = {}) {
    const limit = parsePositiveInteger(options.limit, Number.MAX_SAFE_INTEGER);
    let processed = 0;

    while (processed < limit) {
      const delayResult = await this.getStorageObjectRemovalQueueDelayResult(options);
      if (delayResult) {
        return {
          ...delayResult,
          processed,
        };
      }

      const result = await this.processStorageObjectRemovalQueueItem();
      processed += result.processed;
      if (result.processed <= 0) {
        return {processed};
      }
    }

    return {processed};
  }

  async processStorageObjectRemovalQueueItem() {
    return this.app.ms.asyncOperation.processModuleOperationQueue(storageSpaceStorageRemovalQueueModuleName, {
      limit: 1,
      getPayload: (waitingQueue) => parseStorageSpaceStorageRemovalJob(waitingQueue.inputJson),
      getAsyncOperationData: (_waitingQueue, job) => ({
        name: 'remove-storage-object',
        channel: getStorageSpaceStorageRemovalJobChannel(job),
        percent: storageSpaceStorageRemovalQueueInitialPercent,
      }),
      run: async (_waitingQueue, _asyncOperation, job) => this.removeStorageObjectIfSafe(job.storageId),
    });
  }

  async removeStorageObjectIfSafe(storageId: string): Promise<IStorageSpaceStorageObjectRemovalResult> {
    const deleteSafety = await this.app.ms.database.getStorageObjectDeleteSafety(storageId);
    if (!deleteSafety.safeToRemovePhysical) {
      return getStorageSpaceStorageRemovalBlockedResult(deleteSafety);
    }

    await this.app.ms.storage.unPin(storageId).catch(() => null);
    const removeResult = await removeStorageObject(this.app.ms.storage, storageId);
    return {
      ...deleteSafety,
      ...removeResult,
      blocked: false,
    };
  }

  async getStorageObjectRemovalQueueDelayResult(options: any = {}): Promise<IStorageSpaceStorageObjectRemovalQueueResult | null> {
    const delayMs = getStorageObjectRemovalDelayMs(options);
    if (delayMs <= 0) {
      return null;
    }
    const waitingQueue = await this.app.ms.asyncOperation.getWaitingOperationByModule(storageSpaceStorageRemovalQueueModuleName);
    if (!waitingQueue || isStorageObjectRemovalQueueReady(waitingQueue, delayMs)) {
      return null;
    }
    return {
      processed: 0,
      delayed: 1,
      nextProcessAt: getStorageObjectRemovalQueueProcessAt(waitingQueue, delayMs),
    };
  }

  startStorageObjectRemovalQueueWorker() {
    if (!shouldRunStorageObjectRemovalQueueWorker()) {
      return;
    }
    if (storageObjectRemovalQueueWorkerTimer) {
      return;
    }

    this.startStorageObjectRemovalQueueProcessing({limit: storageSpaceStorageRemovalWorkerBatchLimit});
    storageObjectRemovalQueueWorkerTimer = setInterval(() => {
      this.startStorageObjectRemovalQueueProcessing({limit: storageSpaceStorageRemovalWorkerBatchLimit});
    }, storageSpaceStorageRemovalWorkerIntervalMs);

    const timer: any = storageObjectRemovalQueueWorkerTimer;
    if (timer.unref) {
      timer.unref();
    }
  }

  stopStorageObjectRemovalQueueWorker() {
    if (!storageObjectRemovalQueueWorkerTimer) {
      return;
    }
    clearInterval(storageObjectRemovalQueueWorkerTimer);
    storageObjectRemovalQueueWorkerTimer = null;
  }

  stop() {
    this.stopStorageSpaceAvailabilityNetworkSampleRefreshWorker();
    this.stopStorageObjectRemovalQueueWorker();
  }

  async getStorageObjectRemovalHistory(listParams: any = {}) {
    const listWindow = getStorageSpaceListWindow(listParams, storageSpaceStorageRemovalHistoryListParams);
    const model = this.app.ms.database.sequelize.models.userOperationQueue;
    if (!model) {
      return [];
    }
    const rows = await model.findAll({
      where: {module: storageSpaceStorageRemovalQueueModuleName},
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit: listWindow.limit,
      offset: listWindow.offset,
      include: [{association: 'asyncOperation'}],
    });
    return rows.map(row => getStorageObjectRemovalHistoryRow(row, getStorageObjectRemovalDelayMs(listParams)));
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

function getStorageSpaceAvailabilityNetworkInspectionWindow(listParams: any = {}) {
  const listWindow = getStorageSpaceListWindow(listParams, storageSpaceAvailabilityNetworkInspectionListParams);
  const storageId = normalizeStorageSpaceStorageId(listParams.storageId);
  return {
    ...listWindow,
    storageId,
    offset: storageId === null ? listWindow.offset : 0,
    providerLimit: Math.min(
      parsePositiveInteger(listParams.providerLimit, storageSpaceAvailabilityNetworkDefaultProviderLimit),
      storageSpaceAvailabilityNetworkMaxProviderLimit
    ),
    providerAddressLimit: Math.min(
      parsePositiveInteger(listParams.providerAddressLimit, storageSpaceAvailabilityNetworkDefaultProviderAddressLimit),
      storageSpaceAvailabilityNetworkMaxProviderAddressLimit
    ),
    providerTimeoutMs: Math.min(
      parsePositiveInteger(listParams.providerTimeoutMs, storageSpaceAvailabilityNetworkDefaultProviderTimeoutMs),
      storageSpaceAvailabilityNetworkMaxProviderTimeoutMs
    ),
    statTimeoutMs: Math.min(
      parsePositiveInteger(listParams.statTimeoutMs, storageSpaceAvailabilityNetworkDefaultStatTimeoutMs),
      storageSpaceAvailabilityNetworkMaxStatTimeoutMs
    ),
    statWithLocal: helpers.parseBoolean(listParams.statWithLocal, false),
  };
}

function getStorageSpaceAvailabilitySampleWindow(listParams: any = {}) {
  const listWindow = getStorageSpaceListWindow(listParams, storageSpaceAvailabilitySampleListParams);
  const storageId = normalizeStorageSpaceStorageId(listParams.storageId);
  return {
    ...listWindow,
    storageId,
    offset: storageId === null ? listWindow.offset : 0,
  };
}

function getStorageSpaceGeneratedOutputChildInspectionWindow(listParams: any = {}) {
  const listWindow = getStorageSpaceListWindow(listParams, storageSpaceChildInspectionListParams);
  return {
    ...listWindow,
    storageId: normalizeStorageSpaceStorageId(listParams.storageId),
    childLimit: Math.min(
      parsePositiveInteger(listParams.childLimit, storageSpaceChildInspectionDefaultChildLimit),
      storageSpaceChildInspectionMaxChildLimit
    ),
    depthLimit: Math.min(
      parsePositiveInteger(listParams.depthLimit, storageSpaceChildInspectionDefaultDepthLimit),
      storageSpaceChildInspectionMaxDepthLimit
    ),
    nodeLimit: Math.min(
      parsePositiveInteger(listParams.nodeLimit, storageSpaceChildInspectionDefaultNodeLimit),
      storageSpaceChildInspectionMaxNodeLimit
    ),
  };
}

function getStorageSpaceSnapshotListWindow(listParams: IListParams = {}) {
  const listWindow = getStorageSpaceListWindow(listParams);
  return {
    limit: listWindow.limit,
    offset: 0,
  };
}

function getStorageSpaceSnapshotGrowthSinceDays(listParams: any = {}) {
  return parseNonNegativeInteger(listParams.sinceDays, storageSpaceSnapshotGrowthDefaultSinceDays);
}

async function getStorageSpaceSnapshotGrowthBaseline(snapshotModel, latestSnapshotRow, sinceDays) {
  const cutoff = getStorageSpaceSnapshotGrowthCutoff(latestSnapshotRow, sinceDays);
  const cutoffSnapshot = await snapshotModel.findOne({
    where: {
      id: {[Op.ne]: latestSnapshotRow.id},
      createdAt: {[Op.lte]: cutoff},
    },
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
  });
  if (cutoffSnapshot) {
    return cutoffSnapshot;
  }

  return snapshotModel.findOne({
    where: {
      id: {[Op.ne]: latestSnapshotRow.id},
    },
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
  });
}

function getStorageSpaceSnapshotGrowthCutoff(latestSnapshotRow, sinceDays) {
  const latestCreatedAt = getStorageSpaceSnapshotCreatedAt(latestSnapshotRow);
  return new Date(latestCreatedAt.getTime() - sinceDays * 24 * 60 * 60 * 1000);
}

function getStorageSpaceSnapshotCreatedAt(snapshot) {
  const data = typeof snapshot?.toJSON === 'function' ? snapshot.toJSON() : snapshot;
  return getDateOrNow(data?.createdAt);
}

function isStorageSpaceSnapshotOlderThanSinceDays(latestSnapshotRow, baselineSnapshotRow, sinceDays) {
  const cutoff = getStorageSpaceSnapshotGrowthCutoff(latestSnapshotRow, sinceDays);
  return getStorageSpaceSnapshotCreatedAt(baselineSnapshotRow).getTime() <= cutoff.getTime();
}

function getStorageSpaceSnapshotGrowthElapsedMs(latestSnapshot, baselineSnapshot) {
  if (!latestSnapshot || !baselineSnapshot) {
    return 0;
  }
  return Math.max(0, getDateOrNow(latestSnapshot.createdAt).getTime() - getDateOrNow(baselineSnapshot.createdAt).getTime());
}

function getStorageSpaceSnapshotOverviewGrowth(latestOverview: any = {}, baselineOverview: any = {}) {
  return storageSpaceSnapshotOverviewGrowthFields.map(field => getStorageSpaceSnapshotGrowthMetric(field, latestOverview?.[field], baselineOverview?.[field]));
}

function getStorageSpaceSnapshotSectionGrowth(latestOverview: any = {}, baselineOverview: any = {}) {
  return storageSpaceSnapshotSectionGrowthFields
    .map(({key, field}) => getStorageSpaceSnapshotGrowthMetric(key, latestOverview?.[field], baselineOverview?.[field]))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.latest - a.latest || a.key.localeCompare(b.key));
}

function getStorageSpaceSnapshotGrowthMetric(key, latestValue, baselineValue) {
  const latest = readNonNegativeNumber(latestValue);
  const baseline = readNonNegativeNumber(baselineValue);
  return {
    key,
    latest,
    baseline,
    delta: latest - baseline,
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
    availabilitySignals,
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
    module.getStorageSpaceAvailabilitySignals(listWindow),
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
    availabilitySignals,
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

function normalizeStorageSpaceStorageId(value) {
  if (value === null || value === undefined || value === '' || value === 'null' || value === 'undefined') {
    return null;
  }
  return String(value);
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

function getStorageSpaceAvailabilitySampleRefreshJobInput(listParams: IListParams = {}, queueSource = null) {
  const input: any = {
    type: 'refresh-availability-network-samples',
    listParams: getStorageSpaceAvailabilityNetworkInspectionWindow(listParams),
  };
  if (queueSource) {
    input['source'] = String(queueSource);
  }
  return input;
}

function parseStorageSpaceAvailabilitySampleRefreshJob(inputJson) {
  const job = typeof inputJson === 'string' ? JSON.parse(inputJson) : inputJson;
  if (job?.type !== 'refresh-availability-network-samples') {
    throw new Error('invalid_storage_space_availability_sample_job_type');
  }
  return getStorageSpaceAvailabilitySampleRefreshJobInput(job.listParams);
}

function getStorageSpaceAvailabilitySampleRefreshJobChannel(job) {
  const storageId = job.listParams.storageId || 'page';
  return `${storageSpaceAvailabilitySampleQueueModuleName}:${storageId}:limit:${job.listParams.limit}`;
}

function getStorageSpaceAvailabilitySampleRefreshJobResult(result: IStorageSpaceAvailabilityNetworkSampleRefreshResult) {
  return {
    sampled: result.sampled,
    durationMs: result.durationMs,
    sampleIds: result.rows.map(row => row.id),
    storageIds: result.rows.map(row => row.storageId),
  };
}

function shouldRunStorageSpaceAvailabilitySampleWorker() {
  return helpers.parseBoolean(
    process.env.STORAGE_SPACE_AVAILABILITY_SAMPLE_WORKER,
    false
  );
}

function getStorageSpaceAvailabilitySampleWorkerListParams() {
  return getStorageSpaceAvailabilityNetworkInspectionWindow({
    limit: storageSpaceAvailabilitySampleWorkerListLimit,
    offset: storageSpaceAvailabilitySampleWorkerOffset,
    providerLimit: storageSpaceAvailabilitySampleWorkerProviderLimit,
    providerAddressLimit: storageSpaceAvailabilitySampleWorkerProviderAddressLimit,
    providerTimeoutMs: storageSpaceAvailabilitySampleWorkerProviderTimeoutMs,
    statTimeoutMs: storageSpaceAvailabilitySampleWorkerStatTimeoutMs,
    statWithLocal: helpers.parseBoolean(process.env.STORAGE_SPACE_AVAILABILITY_SAMPLE_WORKER_STAT_WITH_LOCAL, false),
  });
}

function getStorageSpaceAvailabilitySampleRetentionDays(options: any = {}) {
  if (options.retentionDays !== undefined) {
    return parseNonNegativeInteger(options.retentionDays, storageSpaceAvailabilitySampleRetentionDays);
  }
  return storageSpaceAvailabilitySampleRetentionDays;
}

function getStorageSpaceAvailabilitySampleRetentionCutoff(retentionDays, now = new Date()) {
  const nowDate = getDateOrNow(now);
  return new Date(nowDate.getTime() - retentionDays * 24 * 60 * 60 * 1000);
}

function getDateOrNow(value) {
  const date = new Date(value || Date.now());
  if (!Number.isFinite(date.getTime())) {
    return new Date();
  }
  return date;
}

function getStorageSpaceStorageRemovalJobInput(storageId) {
  const normalizedStorageId = normalizeStorageSpaceStorageId(storageId);
  if (!normalizedStorageId) {
    throw new Error('storage_id_required');
  }
  return {
    type: 'remove-storage-object',
    storageId: normalizedStorageId,
  };
}

function getStorageObjectRemovalDelayMs(options: any = {}) {
  if (options.delayMs !== undefined) {
    return parseNonNegativeInteger(options.delayMs, storageSpaceStorageRemovalDelayMs);
  }
  return storageSpaceStorageRemovalDelayMs;
}

function shouldRunStorageObjectRemovalQueueWorker() {
  return helpers.parseBoolean(
    process.env.STORAGE_SPACE_STORAGE_REMOVAL_WORKER,
    storageSpaceStorageRemovalDelayMs > 0
  );
}

function isStorageObjectRemovalQueueReady(waitingQueue, delayMs) {
  return Date.now() >= getStorageObjectRemovalQueueProcessAt(waitingQueue, delayMs).getTime();
}

function getStorageObjectRemovalQueueProcessAt(waitingQueue, delayMs) {
  const createdAt = getStorageObjectRemovalQueueCreatedAt(waitingQueue);
  return new Date(createdAt.getTime() + delayMs);
}

function getStorageObjectRemovalQueueCreatedAt(waitingQueue) {
  const createdAt = new Date(waitingQueue?.createdAt || Date.now());
  if (!Number.isFinite(createdAt.getTime())) {
    return new Date();
  }
  return createdAt;
}

function getStorageObjectRemovalHistoryRow(row, delayMs): IStorageSpaceStorageObjectRemovalHistoryRow {
  const data = typeof row?.toJSON === 'function' ? row.toJSON() : row;
  const asyncOperation = data.asyncOperation || null;
  const result = getStorageObjectRemovalHistoryResult(asyncOperation?.output);
  const nextProcessAt = getStorageObjectRemovalQueueProcessAt(data, delayMs);
  const ready = isStorageObjectRemovalQueueReady(data, delayMs);
  return {
    queueId: data.id,
    asyncOperationId: data.asyncOperationId || asyncOperation?.id || null,
    userId: data.userId || null,
    userApiKeyId: data.userApiKeyId || null,
    storageId: getStorageObjectRemovalHistoryStorageId(data),
    status: getStorageObjectRemovalHistoryStatus(data, asyncOperation, result, ready),
    isWaiting: data.isWaiting === true,
    ready,
    queuedAt: data.createdAt || null,
    startedAt: data.startedAt || null,
    finishedAt: asyncOperation?.finishedAt || null,
    nextProcessAt: data.isWaiting === true && !ready ? nextProcessAt : null,
    delayMs,
    result,
    errorMessage: asyncOperation?.errorMessage || null,
    updatedAt: data.updatedAt || asyncOperation?.updatedAt || null,
  };
}

function getStorageObjectRemovalHistoryStorageId(row) {
  try {
    return parseStorageSpaceStorageRemovalJob(row.inputJson).storageId;
  } catch (e) {
    return null;
  }
}

function getStorageObjectRemovalHistoryResult(output): IStorageSpaceStorageObjectRemovalResult | null {
  if (!output) {
    return null;
  }
  try {
    return typeof output === 'string' ? JSON.parse(output) : output;
  } catch (e) {
    return null;
  }
}

function getStorageObjectRemovalHistoryStatus(row, asyncOperation, result, ready) {
  if (row.isWaiting === true && !asyncOperation) {
    return ready ? 'waiting' : 'delayed';
  }
  if (asyncOperation?.inProcess) {
    return 'in_process';
  }
  if (asyncOperation?.errorMessage) {
    return 'failed';
  }
  if (result?.blocked) {
    return 'blocked';
  }
  if (result?.missing) {
    return 'missing';
  }
  if (result?.removed) {
    return 'removed';
  }
  if (row.isWaiting === true) {
    return ready ? 'waiting' : 'delayed';
  }
  return 'finished';
}

function parseStorageSpaceStorageRemovalJob(inputJson) {
  const job = typeof inputJson === 'string' ? JSON.parse(inputJson) : inputJson;
  if (job?.type !== 'remove-storage-object') {
    throw new Error('invalid_storage_space_storage_removal_job_type');
  }
  return getStorageSpaceStorageRemovalJobInput(job.storageId);
}

function getStorageSpaceStorageRemovalJobChannel(job) {
  return `${storageSpaceStorageRemovalQueueModuleName}:storage:${job.storageId}`;
}

function getStorageSpaceStorageRemovalBlockedResult(deleteSafety): IStorageSpaceStorageObjectRemovalResult {
  return {
    ...deleteSafety,
    removed: false,
    missing: false,
    blocked: true,
  };
}

async function removeStorageObject(storage, storageId): Promise<{removed: boolean; missing: boolean}> {
  try {
    await storage.remove(storageId);
    return {removed: true, missing: false};
  } catch (e) {
    if (isMissingStorageObjectError(e)) {
      return {removed: false, missing: true};
    }
    throw e;
  }
}

function isMissingStorageObjectError(e) {
  const message = getStorageObjectErrorMessage(e).toLowerCase();
  return message.includes('not found') ||
    message.includes('not exist') ||
    message.includes('does not exist') ||
    message.includes('no link named');
}

function getStorageObjectErrorMessage(e) {
  return e?.message || String(e);
}

function getStorageSpaceAvailabilitySampleWhere(listWindow) {
  const where = {};
  if (listWindow.storageId) {
    where['storageId'] = listWindow.storageId;
  }
  return where;
}

function getStorageSpaceAvailabilityNetworkSampleResponse(row): IStorageSpaceAvailabilityNetworkSampleRow {
  const data = typeof row?.toJSON === 'function' ? row.toJSON() : row;
  const sample = parseStorageSpaceAvailabilitySampleJson(data?.sampleJson);
  return {
    ...sample,
    id: data.id,
    userId: data.userId || null,
    storageId: data.storageId || sample.storageId,
    providerLookupOk: data.providerLookupOk === true,
    providersCount: readNonNegativeNumber(data.providersCount),
    providersTruncated: data.providersTruncated === true,
    providerLookupDurationMs: readNonNegativeNumber(data.providerLookupDurationMs),
    providerLookupErrorMessage: data.providerLookupErrorMessage || sample.providerLookupErrorMessage || null,
    retrievalStatOk: data.retrievalStatOk === true,
    retrievalStatDurationMs: readNonNegativeNumber(data.retrievalStatDurationMs),
    retrievalType: data.retrievalType || sample.retrievalType || null,
    retrievalMeasuredBytes: readNonNegativeNumber(data.retrievalMeasuredBytes),
    retrievalErrorMessage: data.retrievalErrorMessage || sample.retrievalErrorMessage || null,
    sampledAt: data.sampledAt || null,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

function parseStorageSpaceAvailabilitySampleJson(sampleJson) {
  if (!sampleJson) {
    return {};
  }
  if (typeof sampleJson !== 'string') {
    return sampleJson;
  }
  return JSON.parse(sampleJson);
}

function readNonNegativeNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
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
  if (!data.availabilitySignals) {
    data.availabilitySignals = [];
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
    {
      key: 'availabilitySignals',
      name: 'availability-signals',
      getData: () => module.getStorageSpaceAvailabilitySignals(listWindow),
    },
  ];
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
