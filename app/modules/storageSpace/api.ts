import {IGeesomeApp} from "../../interface.js";
import {CorePermissionName} from "../database/interface.js";
import {IApiModuleCommonOutput} from "../api/interface.js";
import IGeesomeStorageSpaceModule from "./interface.js";

export default (app: IGeesomeApp, storageSpaceModule: IGeesomeStorageSpaceModule) => {
  /**
   * @api {get} /v1/admin/storage-space/overview Get storage-space overview
   * @apiName AdminStorageSpaceOverview
   * @apiGroup AdminStorage
   *
   * @apiUse ApiKey
   * @apiUse AuthErrors
   * @apiUse AdminErrors
   *
   * @apiDescription Read-only operator totals for logical content bytes, deduplicated physical bytes, catalog usage, group usage, and pinned storage usage.
   */
  app.ms.api.onAuthorizedGet('admin/storage-space/overview', async (req, res) => {
    if (!await canReadAdminStorageSpace(app, req.user.id, res)) {
      return;
    }
    res.send(await storageSpaceModule.getStorageSpaceOverview());
  });

  /**
   * @api {get} /v1/admin/storage-space/type-breakdown Get storage-space type breakdown
   * @apiName AdminStorageSpaceTypeBreakdown
   * @apiGroup AdminStorage
   *
   * @apiUse ApiKey
   * @apiUse AuthErrors
   * @apiUse AdminErrors
   *
   * @apiInterface (../../interface.ts) {IListQueryInput} apiQuery
   */
  app.ms.api.onAuthorizedGet('admin/storage-space/type-breakdown', async (req, res) => {
    if (!await canReadAdminStorageSpace(app, req.user.id, res)) {
      return;
    }
    res.send(await storageSpaceModule.getStorageSpaceTypeBreakdown(req.query));
  });

  /**
   * @api {get} /v1/admin/storage-space/top-contents Get largest content rows
   * @apiName AdminStorageSpaceTopContents
   * @apiGroup AdminStorage
   *
   * @apiUse ApiKey
   * @apiUse AuthErrors
   * @apiUse AdminErrors
   *
   * @apiInterface (../../interface.ts) {IListQueryInput} apiQuery
   */
  app.ms.api.onAuthorizedGet('admin/storage-space/top-contents', async (req, res) => {
    if (!await canReadAdminStorageSpace(app, req.user.id, res)) {
      return;
    }
    res.send(await storageSpaceModule.getStorageSpaceTopContents(req.query));
  });

  /**
   * @api {get} /v1/admin/storage-space/top-file-catalog-items Get largest file-catalog files
   * @apiName AdminStorageSpaceTopFileCatalogItems
   * @apiGroup AdminStorage
   *
   * @apiUse ApiKey
   * @apiUse AuthErrors
   * @apiUse AdminErrors
   *
   * @apiInterface (../../interface.ts) {IListQueryInput} apiQuery
   */
  app.ms.api.onAuthorizedGet('admin/storage-space/top-file-catalog-items', async (req, res) => {
    if (!await canReadAdminStorageSpace(app, req.user.id, res)) {
      return;
    }
    res.send(await storageSpaceModule.getStorageSpaceTopFileCatalogItems(req.query));
  });

  /**
   * @api {get} /v1/admin/storage-space/file-catalog-folders Get file-catalog folder usage
   * @apiName AdminStorageSpaceFileCatalogFolders
   * @apiGroup AdminStorage
   *
   * @apiUse ApiKey
   * @apiUse AuthErrors
   * @apiUse AdminErrors
   *
   * @apiInterface (../../interface.ts) {IListQueryInput} apiQuery
   * @apiQuery {Number} [parentItemId] Parent folder id. Omit or pass null for root folders.
   * @apiDescription Lists active file-catalog folders under the requested parent folder, sorted by descendant logical bytes, with deduplicated physical bytes for drilldown screens.
   */
  app.ms.api.onAuthorizedGet('admin/storage-space/file-catalog-folders', async (req, res) => {
    if (!await canReadAdminStorageSpace(app, req.user.id, res)) {
      return;
    }
    res.send(await storageSpaceModule.getStorageSpaceFileCatalogFolders(req.query));
  });

  /**
   * @api {get} /v1/admin/storage-space/top-groups Get largest groups
   * @apiName AdminStorageSpaceTopGroups
   * @apiGroup AdminStorage
   *
   * @apiUse ApiKey
   * @apiUse AuthErrors
   * @apiUse AdminErrors
   *
   * @apiInterface (../../interface.ts) {IListQueryInput} apiQuery
   */
  app.ms.api.onAuthorizedGet('admin/storage-space/top-groups', async (req, res) => {
    if (!await canReadAdminStorageSpace(app, req.user.id, res)) {
      return;
    }
    res.send(await storageSpaceModule.getStorageSpaceTopGroups(req.query));
  });

  /**
   * @api {get} /v1/admin/storage-space/group-posts Get group post storage usage
   * @apiName AdminStorageSpaceGroupPosts
   * @apiGroup AdminStorage
   *
   * @apiUse ApiKey
   * @apiUse AuthErrors
   * @apiUse AdminErrors
   *
   * @apiInterface (../../interface.ts) {IListQueryInput} apiQuery
   * @apiQuery {Number} [groupId] Group id. Omit to list the largest published posts across all groups.
   * @apiDescription Lists published posts sorted by logical bytes, with attachment counts and deduplicated physical bytes for group drilldown screens.
   */
  app.ms.api.onAuthorizedGet('admin/storage-space/group-posts', async (req, res) => {
    if (!await canReadAdminStorageSpace(app, req.user.id, res)) {
      return;
    }
    res.send(await storageSpaceModule.getStorageSpaceGroupPosts(req.query));
  });

  /**
   * @api {get} /v1/admin/storage-space/generated-outputs Get generated-output storage usage
   * @apiName AdminStorageSpaceGeneratedOutputs
   * @apiGroup AdminStorage
   *
   * @apiUse ApiKey
   * @apiUse AuthErrors
   * @apiUse AdminErrors
   *
   * @apiInterface (../../interface.ts) {IListQueryInput} apiQuery
   * @apiDescription Lists generated/static output storage references by source column, including DB-known physical bytes and unknown refs that still need DAG traversal or StorageObject metadata.
   */
  app.ms.api.onAuthorizedGet('admin/storage-space/generated-outputs', async (req, res) => {
    if (!await canReadAdminStorageSpace(app, req.user.id, res)) {
      return;
    }
    res.send(await storageSpaceModule.getStorageSpaceGeneratedOutputs(req.query));
  });

  /**
   * @api {get} /v1/admin/storage-space/shared-storage-ids Get shared storage IDs
   * @apiName AdminStorageSpaceSharedStorageIds
   * @apiGroup AdminStorage
   *
   * @apiUse ApiKey
   * @apiUse AuthErrors
   * @apiUse AdminErrors
   *
   * @apiInterface (../../interface.ts) {IListQueryInput} apiQuery
   * @apiDescription Lists physical storage IDs referenced by more than one content row, with logical bytes, deduplicated physical bytes, user counts, file-catalog refs, and post refs for duplicate/shared-content drilldowns.
   */
  app.ms.api.onAuthorizedGet('admin/storage-space/shared-storage-ids', async (req, res) => {
    if (!await canReadAdminStorageSpace(app, req.user.id, res)) {
      return;
    }
    res.send(await storageSpaceModule.getStorageSpaceSharedStorageIds(req.query));
  });

  /**
   * @api {get} /v1/admin/storage-space/pinned-storage-objects Get pinned storage objects
   * @apiName AdminStorageSpacePinnedStorageObjects
   * @apiGroup AdminStorage
   *
   * @apiUse ApiKey
   * @apiUse AuthErrors
   * @apiUse AdminErrors
   *
   * @apiInterface (../../interface.ts) {IListQueryInput} apiQuery
   * @apiDescription Lists canonical pinned storage objects with physical bytes and DB-visible content, file-catalog, post, and generated-output references that explain why cleanup must preserve them.
   */
  app.ms.api.onAuthorizedGet('admin/storage-space/pinned-storage-objects', async (req, res) => {
    if (!await canReadAdminStorageSpace(app, req.user.id, res)) {
      return;
    }
    res.send(await storageSpaceModule.getStorageSpacePinnedStorageObjects(req.query));
  });

  /**
   * @api {get} /v1/admin/storage-space/preview-storage Get preview storage usage
   * @apiName AdminStorageSpacePreviewStorage
   * @apiGroup AdminStorage
   *
   * @apiUse ApiKey
   * @apiUse AuthErrors
   * @apiUse AdminErrors
   *
   * @apiInterface (../../interface.ts) {IListQueryInput} apiQuery
   * @apiDescription Lists content and StorageObject preview/thumbnail storage references by preview field, including logical preview bytes, deduplicated physical preview bytes, and unregistered preview storage IDs.
   */
  app.ms.api.onAuthorizedGet('admin/storage-space/preview-storage', async (req, res) => {
    if (!await canReadAdminStorageSpace(app, req.user.id, res)) {
      return;
    }
    res.send(await storageSpaceModule.getStorageSpacePreviewStorage(req.query));
  });

  /**
   * @api {get} /v1/admin/storage-space/cleanup-blockers Get content cleanup blockers
   * @apiName AdminStorageSpaceCleanupBlockers
   * @apiGroup AdminStorage
   *
   * @apiUse ApiKey
   * @apiUse AuthErrors
   * @apiUse AdminErrors
   *
   * @apiInterface (../../interface.ts) {IListQueryInput} apiQuery
   * @apiQuery {Number} [contentId] Content id. Omit to list the largest content rows with their cleanup blockers.
   * @apiDescription Lists bounded content cleanup candidates with the same content/storage blocker keys and counts returned by database delete-safety checks.
   */
  app.ms.api.onAuthorizedGet('admin/storage-space/cleanup-blockers', async (req, res) => {
    if (!await canReadAdminStorageSpace(app, req.user.id, res)) {
      return;
    }
    res.send(await storageSpaceModule.getStorageSpaceCleanupBlockers(req.query));
  });

  /**
   * @api {get} /v1/admin/storage-space/generated-output-inspection Inspect generated-output storage refs
   * @apiName AdminStorageSpaceGeneratedOutputInspection
   * @apiGroup AdminStorage
   *
   * @apiUse ApiKey
   * @apiUse AuthErrors
   * @apiUse AdminErrors
   *
   * @apiInterface (../../interface.ts) {IListQueryInput} apiQuery
   * @apiDescription Bounded runtime inspection for generated/static output storage references that do not have StorageObject metadata yet. Calls the storage backend for file/DAG stats, so operators should use small pages.
   */
  app.ms.api.onAuthorizedGet('admin/storage-space/generated-output-inspection', async (req, res) => {
    if (!await canReadAdminStorageSpace(app, req.user.id, res)) {
      return;
    }
    res.send(await storageSpaceModule.inspectStorageSpaceGeneratedOutputRefs(req.query));
  });

  /**
   * @api {post} /v1/admin/storage-space/generated-output-reconcile Reconcile generated-output storage refs
   * @apiName AdminStorageSpaceGeneratedOutputReconcile
   * @apiGroup AdminStorage
   *
   * @apiUse ApiKey
   * @apiUse AuthErrors
   * @apiUse AdminErrors
   *
   * @apiInterface (../../interface.ts) {IListQueryInput} apiBody
   * @apiDescription Bounded repair for generated/static output storage references that do not have StorageObject metadata yet. Calls the storage backend for file/DAG stats, then writes measured refs into the canonical StorageObject registry.
   */
  app.ms.api.onAuthorizedPost('admin/storage-space/generated-output-reconcile', async (req, res) => {
    if (!await canManageAdminStorageSpace(app, req.user.id, res)) {
      return;
    }
    res.send(await storageSpaceModule.reconcileStorageSpaceGeneratedOutputRefs(req.body));
  });

  /**
   * @api {get} /v1/admin/storage-space/generated-output-child-inspection Inspect generated-output child refs
   * @apiName AdminStorageSpaceGeneratedOutputChildInspection
   * @apiGroup AdminStorage
   *
   * @apiUse ApiKey
   * @apiUse AuthErrors
   * @apiUse AdminErrors
   *
   * @apiInterface (../../interface.ts) {IListQueryInput} apiQuery
   * @apiQuery {String} [storageId] Inspect one generated-output parent storage id.
   * @apiQuery {Number} [childLimit] Maximum immediate child refs to include for each parent.
   * @apiDescription Bounded runtime inspection for immediate IPFS DAG children of generated/static output storage references. This is on-demand and intentionally excluded from cached snapshots.
   */
  app.ms.api.onAuthorizedGet('admin/storage-space/generated-output-child-inspection', async (req, res) => {
    if (!await canReadAdminStorageSpace(app, req.user.id, res)) {
      return;
    }
    res.send(await storageSpaceModule.inspectStorageSpaceGeneratedOutputChildRefs(req.query));
  });

  /**
   * @api {post} /v1/admin/storage-space/generated-output-child-reconcile Reconcile generated-output child refs
   * @apiName AdminStorageSpaceGeneratedOutputChildReconcile
   * @apiGroup AdminStorage
   *
   * @apiUse ApiKey
   * @apiUse AuthErrors
   * @apiUse AdminErrors
   *
   * @apiInterface (../../interface.ts) {IListQueryInput} apiBody
   * @apiBody {String} [storageId] Reconcile one generated-output parent storage id.
   * @apiBody {Number} [childLimit] Maximum immediate child refs to reconcile for each parent.
   * @apiDescription Bounded repair for generated/static output child refs. Calls the storage backend to list immediate DAG children, then writes measured child refs into the canonical StorageObject registry.
   */
  app.ms.api.onAuthorizedPost('admin/storage-space/generated-output-child-reconcile', async (req, res) => {
    if (!await canManageAdminStorageSpace(app, req.user.id, res)) {
      return;
    }
    res.send(await storageSpaceModule.reconcileStorageSpaceGeneratedOutputChildRefs(req.body));
  });

  /**
   * @api {get} /v1/admin/storage-space/snapshot Get latest storage-space snapshot
   * @apiName AdminStorageSpaceSnapshot
   * @apiGroup AdminStorage
   *
   * @apiUse ApiKey
   * @apiUse AuthErrors
   * @apiUse AdminErrors
   *
   * @apiDescription Returns the latest cached storage-space analyzer snapshot, or null before the first refresh.
   */
  app.ms.api.onAuthorizedGet('admin/storage-space/snapshot', async (req, res) => {
    if (!await canReadAdminStorageSpace(app, req.user.id, res)) {
      return;
    }
    res.send(await storageSpaceModule.getLatestStorageSpaceSnapshot());
  });

  /**
   * @api {post} /v1/admin/storage-space/snapshot/refresh Refresh storage-space snapshot
   * @apiName AdminStorageSpaceSnapshotRefresh
   * @apiGroup AdminStorage
   *
   * @apiUse ApiKey
   * @apiUse AuthErrors
   * @apiUse AdminErrors
   *
   * @apiInterface (../../interface.ts) {IListQueryInput} apiBody
   * @apiDescription Runs the analyzer aggregate queries once, stores the result as a cached snapshot, and returns it for operator screens.
   */
  app.ms.api.onAuthorizedPost('admin/storage-space/snapshot/refresh', async (req, res) => {
    if (!await canReadAdminStorageSpace(app, req.user.id, res)) {
      return;
    }
    res.send(await storageSpaceModule.refreshStorageSpaceSnapshot(req.user.id, req.body));
  });

  /**
   * @api {post} /v1/admin/storage-space/snapshot/refresh-async Queue storage-space snapshot refresh
   * @apiName AdminStorageSpaceSnapshotRefreshAsync
   * @apiGroup AdminStorage
   *
   * @apiUse ApiKey
   * @apiUse AuthErrors
   * @apiUse AdminErrors
   *
   * @apiInterface (../../interface.ts) {IListQueryInput} apiBody
   * @apiInterface (../asyncOperation/interface.ts) {IUserOperationQueue} apiSuccess
   * @apiDescription Queues the analyzer aggregate queries as a background operation and returns the queue item for progress polling.
   */
  app.ms.api.onAuthorizedPost('admin/storage-space/snapshot/refresh-async', async (req, res) => {
    if (!await canReadAdminStorageSpace(app, req.user.id, res)) {
      return;
    }
    res.send(await storageSpaceModule.queueStorageSpaceSnapshotRefresh(req.user.id, req.apiKey?.id || null, req.body));
  });
}

async function canReadAdminStorageSpace(app: IGeesomeApp, userId, res: IApiModuleCommonOutput) {
  if (await app.isAdminCan(userId, CorePermissionName.AdminRead)) {
    return true;
  }

  res.send(403);
  return false;
}

async function canManageAdminStorageSpace(app: IGeesomeApp, userId, res: IApiModuleCommonOutput) {
  if (await app.isAdminCan(userId, CorePermissionName.AdminAll)) {
    return true;
  }

  res.send(403);
  return false;
}
