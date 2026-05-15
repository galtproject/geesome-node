import {pathToFileURL} from 'node:url';
import {QueryTypes} from 'sequelize';
import databaseConfig from '../app/modules/database/config.js';
import {
  collectDatabaseDerivedStateIntegrity,
  defaultRepairLimit,
  derivedStateAppModules,
  getGroupManifestDerivedStateRepairCandidates,
  getOptionsFromEnv,
  getPostManifestDerivedStateRepairCandidates,
  getStorageConfigOverride,
} from './databaseDerivedStateIntegrity.js';

const groupDerivedStateQueueModuleName = 'group-derived-state';
const defaultBatchLimit = 10;
const defaultMaxBatches = 1000;

type QueueSummary = {
  total: number;
  waiting: number;
  waitingUnclaimed: number;
  waitingLinked: number;
};

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value as any, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function getDatabaseName() {
  return String((databaseConfig as any).database || '');
}

function assertRehearsalSafety() {
  if (process.env.CONFIRM_RESTORED_BACKUP !== '1') {
    throw new Error('set CONFIRM_RESTORED_BACKUP=1 after restoring a disposable backup target');
  }
  if (!getDatabaseName()) {
    throw new Error('set DATABASE_NAME to the restored backup database name');
  }
  if (getDatabaseName() === 'geesome_node' && process.env.ALLOW_DEFAULT_DATABASE !== '1') {
    throw new Error('refusing to rehearse DATABASE_NAME=geesome_node without ALLOW_DEFAULT_DATABASE=1');
  }
}

function configureAsyncDerivedStateRehearsal() {
  process.env.GROUP_DERIVED_STATE_ASYNC = '1';
  process.env.GROUP_DERIVED_STATE_WORKER = '0';
}

async function getQueueSummary(app: any): Promise<QueueSummary> {
  const [row] = await app.ms.database.sequelize.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE "isWaiting" = true)::int AS waiting,
      COUNT(*) FILTER (WHERE "isWaiting" = true AND "asyncOperationId" IS NULL)::int AS "waitingUnclaimed",
      COUNT(*) FILTER (WHERE "isWaiting" = true AND "asyncOperationId" IS NOT NULL)::int AS "waitingLinked"
    FROM "userOperationQueues"
    WHERE module = :module
  `, {
    replacements: {module: groupDerivedStateQueueModuleName},
    type: QueryTypes.SELECT,
  }) as any[];

  return {
    total: Number(row?.total) || 0,
    waiting: Number(row?.waiting) || 0,
    waitingUnclaimed: Number(row?.waitingUnclaimed) || 0,
    waitingLinked: Number(row?.waitingLinked) || 0,
  };
}

async function enqueueRepairCandidates(app: any, options: any) {
  const limit = parsePositiveInteger(process.env.DERIVED_STATE_REPAIR_LIMIT, defaultRepairLimit);
  const postCandidates = await getPostManifestDerivedStateRepairCandidates(app, {...options, limit});
  const groupCandidates = await getGroupManifestDerivedStateRepairCandidates(app, {...options, limit});
  const postQueueIds = [];
  const groupQueueIds = [];

  for (const post of postCandidates) {
    const queue = await app.ms.group.queuePostManifestUpdate(post.userId, post.id, {process: false});
    postQueueIds.push(queue.id);
  }

  for (const group of groupCandidates) {
    const queue = await app.ms.group.queueGroupManifestUpdate(group.creatorId, group.id, {process: false});
    groupQueueIds.push(queue.id);
  }

  return {
    limit,
    postIds: postCandidates.map(post => post.id),
    groupIds: groupCandidates.map(group => group.id),
    postQueueIds,
    groupQueueIds,
  };
}

async function drainDerivedStateQueue(app: any) {
  const batchLimit = parsePositiveInteger(
    process.env.DERIVED_STATE_ASYNC_REHEARSAL_BATCH_LIMIT || process.env.GROUP_DERIVED_STATE_WORKER_BATCH_LIMIT,
    defaultBatchLimit,
  );
  const maxBatches = parsePositiveInteger(process.env.DERIVED_STATE_ASYNC_REHEARSAL_MAX_BATCHES, defaultMaxBatches);
  let processed = 0;
  let batches = 0;

  while (batches < maxBatches) {
    const result = await app.ms.group.processDerivedStateQueue({limit: batchLimit});
    batches += 1;
    processed += result.processed;
    if (result.processed === 0) {
      return {
        batchLimit,
        maxBatches,
        batches,
        processed,
        maxBatchesReached: false,
      };
    }
  }

  return {
    batchLimit,
    maxBatches,
    batches,
    processed,
    maxBatchesReached: true,
  };
}

function getIssueCounts(report) {
  return report.issues.map(issue => ({
    name: issue.name,
    count: issue.count,
  }));
}

function hasFailingIssues(report) {
  return report.issues.some(issue => issue.count > 0);
}

async function main() {
  assertRehearsalSafety();
  configureAsyncDerivedStateRehearsal();

  const options = getOptionsFromEnv();
  const appConfig: any = {
    modules: derivedStateAppModules,
    port: Number.parseInt(process.env.DERIVED_STATE_REPAIR_PORT || '0', 10) || 0,
    ...getStorageConfigOverride(),
  };
  const app = await (await import('../app/index.js')).default(appConfig);

  try {
    const initialReport = await collectDatabaseDerivedStateIntegrity(app.ms.database.sequelize, options);
    const queueBefore = await getQueueSummary(app);
    const queued = await enqueueRepairCandidates(app, options);
    const queueAfterEnqueue = await getQueueSummary(app);
    const drain = await drainDerivedStateQueue(app);
    const queueAfterDrain = await getQueueSummary(app);
    const finalReport = await collectDatabaseDerivedStateIntegrity(app.ms.database.sequelize, options);
    const result = {
      database: getDatabaseName(),
      groupId: options.groupId || null,
      postId: options.postId || null,
      asyncDerivedState: {
        GROUP_DERIVED_STATE_ASYNC: process.env.GROUP_DERIVED_STATE_ASYNC,
        GROUP_DERIVED_STATE_WORKER: process.env.GROUP_DERIVED_STATE_WORKER,
      },
      initialIssues: getIssueCounts(initialReport),
      queued,
      queueBefore,
      queueAfterEnqueue,
      drain,
      queueAfterDrain,
      finalIssues: getIssueCounts(finalReport),
    };

    console.log(JSON.stringify(result, null, 2));

    if (drain.maxBatchesReached || queueAfterDrain.waiting > 0 || hasFailingIssues(finalReport)) {
      process.exitCode = 1;
    }
  } finally {
    await app.stop();
  }
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (import.meta.url === entryPoint) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
