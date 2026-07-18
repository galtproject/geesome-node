import fs from 'node:fs';
import path from 'node:path';

type ModelRow = {
  area: string;
  source: string;
  model: string;
  indexes: string[];
  notes: string[];
};

type HotspotRow = {
  area: string;
  source: string;
  hotspot: string;
  observedPattern: string;
  scalabilityRisk: string;
};

const rootDir = process.cwd();
const outputPath = path.join(rootDir, 'docs/database-scalability-inventory.md');
const args = new Set(process.argv.slice(2));

function rel(filePath: string): string {
  return path.relative(rootDir, filePath);
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function has(source: string, pattern: string | RegExp): boolean {
  return typeof pattern === 'string' ? source.includes(pattern) : pattern.test(source);
}

function hasSequelizeModelIndex(source: string, modelName: string, indexName: string, fieldsPattern: string): boolean {
  const modelPattern = new RegExp(`sequelize\\.define\\('${modelName}'[\\s\\S]*?\\}\\s*,\\s*\\{([\\s\\S]*?)\\}\\s*\\);`);
  const match = source.match(modelPattern);
  const options = match?.[1] || '';

  return has(options, indexName) && has(options, fieldsPattern);
}

function joinList(items: string[]): string {
  if (items.length <= 1) {
    return items.join('');
  }
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function modelRows(): ModelRow[] {
  const postSource = read('app/modules/group/models/post.ts');
  const postEventSource = read('app/modules/group/models/postEvent.ts');
  const groupSource = read('app/modules/group/models/group.ts');
  const groupModuleSource = read('app/modules/group/index.ts');
  const contentProjectionHelperSource = read('app/modules/group/contentProjectionHelpers.ts');
  const contentSource = read('app/modules/database/models/content.ts');
  const contentModuleSource = read('app/modules/content/index.ts');
  const storageObjectSource = read('app/modules/database/models/storageObject.ts');
  const storageObjectReferenceSource = read('app/modules/database/models/storageObjectReference.ts');
  const storageSpaceSnapshotSource = read('app/modules/database/models/storageSpaceSnapshot.ts');
  const storageObjectIntegritySource = read('check/databaseStorageObjectsIntegrity.ts');
  const migrationRehearsalSource = read('bash/database-migration-rehearsal');
  const objectSource = read('app/modules/database/models/object.ts');
  const databaseValuesTestSource = read('test/databaseValues.test.ts');
  const fileCatalogModelSource = read('app/modules/fileCatalog/models.ts');
  const fileCatalogActivePathMigrationSource = read('app/modules/database/migrations/20260510000001-enforce-file-catalog-active-path-unique.cjs');
  const fileCatalogSource = read('app/modules/fileCatalog/index.ts');
  const groupPermissionSource = read('app/modules/group/models/groupPermission.ts');
  const groupReadSource = read('app/modules/group/models/groupRead.ts');
  const socNetImportSource = read('app/modules/socNetImport/models.ts');
  const socNetImportIndexSource = read('app/modules/socNetImport/index.ts');
  const staticSiteSource = read('app/modules/staticSiteGenerator/models.ts');
  const groupCategorySource = read('app/modules/groupCategory/models/groupCategory.ts');
  const groupSectionSource = read('app/modules/groupCategory/models/groupSection.ts');
  const staticIdSource = read('app/modules/staticId/models.ts');
  const staticIdIndexSource = read('app/modules/staticId/index.ts');
  const databaseModuleSource = read('app/modules/database/index.ts');
  const appSource = read('app/index.ts');
  const appConfigSource = read('app/config.ts');
  const userContentActionSource = read('app/modules/database/models/userContentAction.ts');
  const userLimitSource = read('app/modules/database/models/userLimit.ts');
  const asyncOperationSource = read('app/modules/asyncOperation/models.ts');
  const asyncOperationIndexSource = read('app/modules/asyncOperation/index.ts');
  const autoActionSource = read('app/modules/autoActions/models.ts');
  const autoActionIndexSource = read('app/modules/autoActions/index.ts');
  const autoActionCronSource = read('app/modules/autoActions/cronService.ts');
  const pinSource = read('app/modules/pin/models.ts');
  const pinIndexSource = read('app/modules/pin/index.ts');
  const pinCronSource = read('app/modules/pin/cron.ts');
  const pinCronServiceSource = read('app/modules/pin/cronService.ts');
  const foreignAccountSource = read('app/modules/foreignAccounts/models.ts');
  const foreignAccountIndexSource = read('app/modules/foreignAccounts/index.ts');
  const socNetAccountSource = read('app/modules/socNetAccount/models.ts');
  const socNetAccountIndexSource = read('app/modules/socNetAccount/index.ts');
  const tgContentBotSource = read('app/modules/tgContentBot/models.ts');
  const tgContentBotApiSource = read('app/modules/tgContentBot/api.ts');
  const tagSource = read('app/modules/group/models/tag.ts');
  const mentionSource = read('app/modules/group/models/mention.ts');
  const autoTagSource = read('app/modules/group/models/autoTag.ts');
  const activityPubModelSource = read('app/modules/activityPub/models.ts');
  const activityPubIndexSource = read('app/modules/activityPub/index.ts');
  const hasActivityPubSourceSubscriptionUnique = has(activityPubModelSource, 'activity_pub_source_subscriptions_user_remote_unique')
    && has(activityPubModelSource, "fields: ['userId', 'remoteActorId']")
    && has(activityPubModelSource, 'unique: true');
  const hasActivityPubSourceSubscriptionUserStatusIndex = has(activityPubModelSource, 'activity_pub_source_subscriptions_user_status_idx')
    && has(activityPubModelSource, "fields: ['userId', 'status', 'updatedAt']");
  const hasActivityPubSourceSubscriptionRemoteStatusIndex = has(activityPubModelSource, 'activity_pub_source_subscriptions_remote_status_idx')
    && has(activityPubModelSource, "fields: ['remoteActorId', 'status']");
  const hasActivityPubSourceSubscriptionStatusRefreshIndex = has(activityPubModelSource, 'activity_pub_source_subscriptions_status_refresh_idx')
    && has(activityPubModelSource, "fields: ['status', 'lastRefreshRequestedAt', 'id']");
  const hasActivityPubObjectLocalActorListIndex = has(activityPubModelSource, 'activity_pub_objects_local_actor_origin_published_idx')
    && has(activityPubModelSource, "fields: ['localActorId', 'origin', 'publishedAt', 'id']");
  const hasActivityPubObjectRemoteActorListIndex = has(activityPubModelSource, 'activity_pub_objects_remote_actor_origin_published_idx')
    && has(activityPubModelSource, "fields: ['remoteActorId', 'origin', 'publishedAt', 'id']");
  const hasActivityPubSourceFeedRemoteActorFilter = has(activityPubIndexSource, 'getActivityPubSourceFeedWhere')
    && has(activityPubIndexSource, 'remoteActorId: subscription.remoteActorId')
    && has(activityPubIndexSource, 'origin: ActivityPubObjectOrigin.Remote');
  const hasStaticIdCurrentBinding = has(staticIdSource, 'StaticIdBinding')
    && has(staticIdSource, 'static_id_bindings_static_unique')
    && has(staticIdSource, "fields: ['staticId']")
    && has(staticIdSource, 'static_id_bindings_dynamic_bound_idx')
    && has(staticIdSource, "fields: ['dynamicId', 'boundAt']");
  const hasStaticIdHistoryCompaction = has(staticIdSource, 'compactStaleHistory')
    && has(staticIdIndexSource, 'compactStaticIdHistory')
    && has(staticIdIndexSource, 'STATIC_ID_HISTORY_RETAINED_ROWS');
  const hasPostGroupLocalUnique = has(postSource, 'posts_group_local_unique')
    && has(postSource, "fields: ['groupId', 'localId']")
    && has(postSource, 'unique: true');
  const hasPostSourceUnique = has(postSource, 'posts_group_source_post_unique')
    && has(postSource, "fields: ['groupId', 'source', 'sourceChannelId', 'sourcePostId']")
    && has(postSource, 'unique: true');
  const hasPostContentPositionUnique = has(postSource, 'posts_contents_post_position_unique')
    && has(postSource, "fields: ['postId', 'position']")
    && has(postSource, 'unique: true');
  const hasPostContentAttachmentReasons = has(groupModuleSource, 'PostContentAttachmentReason')
    && has(groupModuleSource, 'permissionReason')
    && has(groupModuleSource, 'ActorManifestImport')
    && has(groupModuleSource, 'ActorStorage');
  const hasContentBodyProjectionCache = has(groupModuleSource, 'getProjectedContentText(app.ms.storage')
    && has(contentProjectionHelperSource, 'bodyTextCache')
    && has(contentProjectionHelperSource, 'bodyTextCacheMaxEntries');
  const hasPostEventSourceIdentityIndex = has(postEventSource, 'post_events_source_identity_idx')
    && has(postEventSource, "fields: ['groupId', 'source', 'sourceChannelId', 'sourcePostId', 'createdAt', 'id']");
  const hasBoundedAutoActionExecutor = has(autoActionIndexSource, 'limit: autoActionExecuteBatchLimit')
    && has(autoActionCronSource, 'actionIdsInQueueOrProcess');
  const hasAutoActionDbClaims = has(autoActionSource, 'executeClaimExpiresAt')
    && has(autoActionSource, 'auto_actions_active_execute_claim_idx')
    && has(autoActionIndexSource, 'claimAutoActionsToExecute')
    && has(autoActionIndexSource, 'claimDueForExecution')
    && has(autoActionSource, 'FOR UPDATE SKIP LOCKED')
    && has(autoActionCronSource, 'claimAutoActionsToExecute');
  const hasContentUserStorageLookup = has(contentSource, "fields: ['storageId', 'userId']");
  const hasContentSoftDeletePolicy = has(contentSource, 'isDeleted')
    && has(contentSource, 'deletedAt')
    && has(contentSource, 'allowNull: false')
    && has(databaseModuleSource, 'isDeleted: true')
    && has(databaseModuleSource, 'includeDeleted')
    && has(fileCatalogSource, 'app.ms.database.deleteContent(content.id)');
  const hasDeterministicSharedContentLookup = has(databaseModuleSource, 'async getSharedContentByStorageId')
    && has(databaseModuleSource, 'async getSharedContentByManifestId')
    && has(databaseModuleSource, "order: [['id', 'ASC']]")
    && has(databaseModuleSource, 'return this.getSharedContentByManifestId(manifestStorageId)');
  const hasOwnerlessContentCreateGuard = has(contentModuleSource, 'async getSharedContentByObject')
    && has(contentModuleSource, 'async getActorContentByObject')
    && has(contentModuleSource, "throw new Error('content_actor_required')");
  const hasStorageObjectRegistry = has(storageObjectSource, 'storage_objects_storage_id_unique')
    && has(storageObjectSource, "fields: ['storageId']")
    && has(storageObjectSource, 'storage_objects_medium_preview_storage_idx')
    && has(databaseModuleSource, 'syncStorageObjectForContent')
    && has(databaseModuleSource, 'getStorageObjectByStorageId')
    && has(databaseModuleSource, 'getSharedStorageMetadataByStorageId')
    && has(databaseValuesTestSource, 'getSharedStorageMetadataByStorageId(storageId)');
  const hasStorageObjectIdentity = has(storageObjectSource, 'identityType')
    && has(storageObjectSource, 'identityId')
    && has(storageObjectSource, 'storage_objects_identity_idx')
    && has(databaseModuleSource, 'syncStorageObjectIdentity')
    && has(databaseValuesTestSource, 'ownerless storage-object identity');
  const hasStorageObjectIdentityLookup = hasStorageObjectIdentity
    && has(databaseModuleSource, 'async getStorageObjectByIdentity')
    && has(databaseValuesTestSource, 'getStorageObjectByIdentity');
  const hasContentManifestStorageObjectIdentityProducer = has(contentModuleSource, 'contentManifestStorageObjectIdentityType')
    && has(contentModuleSource, 'syncContentManifestStorageObject')
    && has(contentModuleSource, 'syncStorageObjectForContent(storageObjectData)');
  const hasStorageObjectPinState = has(storageObjectSource, 'isPinned')
    && has(databaseModuleSource, 'markStorageObjectPinnedByContent')
    && has(databaseModuleSource, 'pinnedStorageObjects')
    && has(databaseModuleSource, "getContentDeleteBlocker('storage', 'pinnedStorageObjects'");
  const hasPinStorageObjectLedger = has(pinSource, 'PinStorageObject')
    && has(pinSource, 'pin_storage_objects_account_storage_unique')
    && has(pinSource, 'pin_storage_objects_status_check_idx')
    && has(pinIndexSource, 'recordPinnedStorageObject')
    && has(pinIndexSource, 'beginPinStorageObjectAttempt')
    && has(pinIndexSource, 'PinStorageObjectStatus.Accepted')
    && has(databaseModuleSource, 'remotePinRefs');
  const hasPinProviderReconciliation = has(pinSource, 'pin_storage_objects_reconcile_claim_idx')
    && has(pinSource, 'claimForReconciliation')
    && has(pinIndexSource, 'queueDuePinReconciliations')
    && has(pinIndexSource, 'processPinReconciliationQueue')
    && has(pinIndexSource, 'retryablePinReconciliationMaxDelayMs');
  const hasPinProviderReconciliationWorker = hasPinProviderReconciliation
    && has(appConfigSource, 'PIN_RECONCILIATION_WORKER')
    && has(pinCronSource, 'runImmediately: true')
    && has(pinCronServiceSource, 'sweepInProcess')
    && has(pinCronServiceSource, 'queueDuePinReconciliations')
    && has(pinCronServiceSource, 'processPinReconciliationQueue');
  const hasStorageObjectReconciliation = has(storageObjectIntegritySource, 'getCanonicalStorageObjectSql')
    && has(storageObjectIntegritySource, 'repairStorageObjects')
    && has(storageObjectIntegritySource, 'CONFIRM_STORAGE_OBJECT_REPAIR')
    && has(migrationRehearsalSource, 'database:storage-objects-integrity -- --repair');
  const hasObjectResolvePropUnique = has(objectSource, 'objects_storage_resolve_prop_unique')
    && has(objectSource, "fields: ['storageId', 'resolveProp']")
    && has(objectSource, 'unique: true');
  const hasFileCatalogPathUnique = has(fileCatalogActivePathMigrationSource, 'file_catalog_items_child_path_unique')
    && has(fileCatalogActivePathMigrationSource, 'file_catalog_items_root_path_unique')
    && has(fileCatalogActivePathMigrationSource, 'ON "fileCatalogItems" ("parentItemId", "userId", name)')
    && has(fileCatalogActivePathMigrationSource, 'ON "fileCatalogItems" ("userId", name)')
    && has(fileCatalogActivePathMigrationSource, 'CREATE UNIQUE INDEX CONCURRENTLY');
  const hasFileCatalogDefaultFolderRetry = has(fileCatalogSource, 'getOrCreateDefaultFolderFor')
    && has(fileCatalogSource, 'getAvailableFileCatalogItemName(userId, null, folderName)')
    && has(fileCatalogSource, 'isFileCatalogPathUniqueError(e)');
  const hasFileCatalogParentListIndex = has(fileCatalogModelSource, 'file_catalog_items_user_parent_list_idx')
    && has(fileCatalogModelSource, "fields: ['userId', 'parentItemId', 'isDeleted', 'type', 'createdAt', 'id']");
  const hasUserLimitUnique = has(userLimitSource, 'user_limits_user_name_unique')
    && has(userLimitSource, "fields: ['userId', 'name']")
    && has(userLimitSource, 'unique: true');
  const hasUserLimitDuplicateRetry = has(appSource, 'isUserLimitUniqueError')
    && has(appSource, 'newExistLimit');
  const hasUploadQuotaCommitLock = has(databaseModuleSource, 'addContentWithUserContentAction')
    && has(databaseModuleSource, 'checkUserContentActionLimit')
    && has(databaseModuleSource, 'Transaction.LOCK.UPDATE')
    && has(read('app/modules/content/index.ts'), 'addContentWithUserContentAction');
  const hasPinUserNameUnique = has(pinSource, 'pin_accounts_user_name_unique')
    && has(pinSource, "fields: ['userId', 'name']")
    && has(pinSource, 'unique: true');
  const hasPinGroupNameUnique = has(pinSource, 'pin_accounts_group_name_unique')
    && has(pinSource, "fields: ['groupId', 'name']")
    && has(pinSource, 'unique: true');
  const hasContentBotUserIndex = hasSequelizeModelIndex(
    tgContentBotSource,
    'contentBot',
    'content_bots_user_id_idx',
    "fields: ['userId']",
  );
  const hasAsyncOperationRetention = has(asyncOperationIndexSource, 'cleanupFinishedAsyncOperations')
    && has(asyncOperationIndexSource, 'finishedOperationCleanupBatchLimit')
    && has(asyncOperationIndexSource, 'asyncOperationId: null');

  return [
    {
      area: 'Group posts',
      source: 'app/modules/group/models/post.ts',
      model: 'Post',
      indexes: [
        'name',
        'name,isRemote unique local',
        'replyToId',
        'repostOfId',
        'source,sourceDate',
        'source,sourceChannelId',
        'source,sourceChannelId,sourcePostId',
        hasPostSourceUnique ? 'groupId,source,sourceChannelId,sourcePostId unique source identity' : 'missing group/source unique identity',
      ],
      notes: [
        has(postSource, "fields: ['groupId'") ? 'has group index' : 'missing explicit group timeline index',
        hasPostGroupLocalUnique ? 'has group/local unique identity' : (has(postSource, "fields: ['groupId', 'localId'") ? 'has group/local lookup index' : 'missing explicit group/local lookup index'),
        hasPostSourceUnique ? 'has group/source unique import identity' : 'missing group/source unique import identity',
        has(postSource, "fields: ['manifestStorageId'") ? 'has manifest lookup index' : 'missing manifest lookup index',
      ],
    },
    {
      area: 'Post contents join',
      source: 'app/modules/group/models/post.ts',
      model: 'PostsContents',
      indexes: [
        has(postSource, 'through: models.PostsContents') ? 'contentId,postId through primary key' : 'review through primary key',
        hasPostContentPositionUnique ? 'postId,position unique order index' : (has(postSource, 'posts_contents_post_position_idx') ? 'postId,position order index' : 'missing postId,position index'),
        has(postSource, 'posts_contents_content_idx') ? 'contentId reverse index' : 'missing contentId reverse index',
      ],
      notes: [
        hasPostContentPositionUnique && has(postSource, 'posts_contents_content_idx')
          ? (hasPostContentAttachmentReasons
            ? (hasContentBodyProjectionCache
              ? 'join lookup indexes present; attachment positions are unique per post; attachment authorization reasons are explicit; API timeline hydration is page-scoped; text/json body projection can reuse a bounded per-render cache'
              : 'join lookup indexes present; attachment positions are unique per post; attachment authorization reasons are explicit; API timeline hydration is page-scoped; remaining work is body projection')
            : (hasContentBodyProjectionCache
              ? 'join lookup indexes present; attachment positions are unique per post; API timeline hydration is page-scoped; text/json body projection can reuse a bounded per-render cache'
              : 'join lookup indexes present; attachment positions are unique per post; API timeline hydration is page-scoped; remaining work is body projection'))
          : (has(postSource, 'posts_contents_post_position_idx') && has(postSource, 'posts_contents_content_idx')
          ? 'join lookup indexes present; API timeline hydration is page-scoped; remaining work is attachment constraints and body projection'
        : 'review through indexes'),
      ],
    },
    {
      area: 'Post events',
      source: 'app/modules/group/models/postEvent.ts',
      model: 'PostEvent',
      indexes: [
        has(postEventSource, 'post_events_post_created_idx') ? 'postId,createdAt,id event stream' : 'missing post event stream index',
        has(postEventSource, 'post_events_group_created_idx') ? 'groupId,createdAt,id group event stream' : 'missing group event stream index',
        hasPostEventSourceIdentityIndex ? 'groupId,source,sourceChannelId,sourcePostId,createdAt,id import event stream' : 'missing source-identity event stream index',
        has(postEventSource, 'post_events_type_action_created_idx') ? 'type,action,createdAt,id event filter' : 'missing type/action event filter',
      ],
      notes: [
        hasPostEventSourceIdentityIndex
          ? 'model-sync-created append-only post event table is ready for source-identity import audit/replay rows'
        : 'source import lifecycle remains represented only by mutable Post rows',
      ],
    },
    {
      area: 'ActivityPub source subscriptions',
      source: 'app/modules/activityPub/models.ts',
      model: 'ActivityPubSourceSubscription',
      indexes: [
        hasActivityPubSourceSubscriptionUnique ? 'userId,remoteActorId unique subscription identity' : 'missing user/remote source identity',
        hasActivityPubSourceSubscriptionUserStatusIndex ? 'userId,status,updatedAt list index' : 'missing user/status list index',
        hasActivityPubSourceSubscriptionRemoteStatusIndex ? 'remoteActorId,status reverse lookup' : 'missing remote/status lookup index',
        hasActivityPubSourceSubscriptionStatusRefreshIndex ? 'status,lastRefreshRequestedAt,id poller index' : 'missing source refresh poller index',
      ],
      notes: [
        hasActivityPubSourceSubscriptionUnique && hasActivityPubSourceSubscriptionUserStatusIndex && hasActivityPubSourceSubscriptionStatusRefreshIndex && hasActivityPubSourceFeedRemoteActorFilter
          ? 'source subscriptions are model-sync-created, duplicate-resistant per user/remote actor, feed reads join through cached remote ActivityPub objects by remoteActorId, and refresh polling scans stale active subscriptions by indexed refresh time'
        : 'source subscription/feed scalability should be reviewed before broad frontend rollout',
      ],
    },
    {
      area: 'ActivityPub remote object cache',
      source: 'app/modules/activityPub/models.ts',
      model: 'ActivityPubObject',
      indexes: [
        'objectId unique canonical object identity',
        'activityId unique activity identity',
        hasActivityPubObjectLocalActorListIndex ? 'localActorId,origin,publishedAt,id group review list' : 'missing local actor remote-object review list index',
        hasActivityPubObjectRemoteActorListIndex ? 'remoteActorId,origin,publishedAt,id source feed list' : 'missing remote actor source feed list index',
      ],
      notes: [
        hasActivityPubObjectLocalActorListIndex && hasActivityPubObjectRemoteActorListIndex
          ? 'group-scoped remote-object review and source-feed reads have actor/origin/publishedAt list indexes for default sort order'
          : 'ActivityPub cached object list queries can scan the growing object cache without actor/origin list indexes',
      ],
    },
    {
      area: 'Groups',
      source: 'app/modules/group/models/group.ts',
      model: 'Group',
      indexes: [
        'name,isRemote unique local non-collateral',
        'manifestStorageId',
        'manifestStaticStorageId',
        has(groupSource, 'groups_creator_type_deleted_created_idx') ? 'creatorId,type,isDeleted,createdAt,id creator list index' : 'missing creator/type/deleted listing index',
        has(groupSource, 'groups_static_rebind_idx') ? 'isDeleted,staticStorageUpdatedAt static rebind index' : 'missing static rebind index',
      ],
      notes: [
        has(groupSource, 'groups_creator_type_deleted_created_idx') ? 'has creator listing index' : 'missing creator/type/deleted listing index',
        has(groupSource, 'group_members_user_group_idx') && has(groupSource, 'group_admins_user_group_idx')
          ? 'membership/admin through indexes present'
          : 'review membership indexes',
      ],
    },
    {
      area: 'Contents',
      source: 'app/modules/database/models/content.ts',
      model: 'Content',
      indexes: [
        hasContentUserStorageLookup
          ? 'storageId,userId non-unique ownership lookup'
          : 'missing storageId,userId ownership lookup',
        has(contentSource, 'manifestStaticStorageId') && has(contentSource, 'unique: true') ? 'manifestStaticStorageId unique' : 'manifestStaticStorageId uniqueness not found',
        has(contentSource, "fields: ['userId', 'manifestStorageId'") ? 'userId,manifestStorageId actor-scoped lookup' : 'missing actor-scoped manifest lookup index',
      ],
      notes: [
        has(contentSource, "fields: ['userId'") ? 'has user listing index' : 'missing user/created listing index',
        has(contentSource, "fields: ['manifestStorageId'") ? 'has manifest lookup index' : 'missing manifest lookup index',
        has(contentSource, "fields: ['mediumPreviewStorageId'") ? 'has preview lookup indexes' : 'missing preview lookup indexes for file/header serving',
        hasContentUserStorageLookup && hasDeterministicSharedContentLookup
          ? (hasOwnerlessContentCreateGuard
            ? (hasStorageObjectRegistry
              ? (hasContentSoftDeletePolicy
                ? 'same storageId across different users and legacy same-user duplicate rows remain valid; soft-deleted rows no longer block re-upload; actor-scoped helpers and deterministic shared reads handle duplicate candidates; shared storage reads prefer storageObject with Content fallback, shared manifest reads use id ordering, and new library rows require an actor'
                : 'same storageId across different users and legacy same-user duplicate rows remain valid; actor-scoped helpers and deterministic shared reads handle duplicate candidates; shared storage reads prefer storageObject with Content fallback, shared manifest reads use id ordering, and new library rows require an actor')
              : (hasContentSoftDeletePolicy
                ? 'same storageId across different users and legacy same-user duplicate rows remain valid; soft-deleted rows no longer block re-upload; shared storage/manifest reads use deterministic id ordering, and new library rows require an actor until canonical asset policy uses StorageObject identity'
                : 'same storageId across different users and legacy same-user duplicate rows remain valid; shared storage/manifest reads use deterministic id ordering, and new library rows require an actor until canonical asset policy uses StorageObject identity'))
            : (hasContentSoftDeletePolicy
              ? 'same storageId across different users and legacy same-user duplicate rows remain valid; soft-deleted rows no longer block re-upload; shared storage/manifest reads use deterministic id ordering while actor/canonical semantics remain caller-specific'
              : 'same storageId across different users and legacy same-user duplicate rows remain valid; shared storage/manifest reads use deterministic id ordering while actor/canonical semantics remain caller-specific'))
          : 'same storageId across users and within legacy same-user data is valid; remaining global storage/manifest findOne paths need caller-specific actor scope or canonical asset semantics',
      ],
    },
    {
      area: 'Storage objects',
      source: 'app/modules/database/models/storageObject.ts',
      model: 'StorageObject',
      indexes: [
        has(storageObjectSource, 'storage_objects_storage_id_unique') ? 'storageId unique physical identity' : 'missing storageId unique physical identity',
        hasStorageObjectIdentity
          ? (hasStorageObjectIdentityLookup
            ? (hasContentManifestStorageObjectIdentityProducer
              ? 'identityType,identityId canonical lookup with GeeSome manifest producer'
              : 'identityType,identityId canonical lookup')
            : (hasContentManifestStorageObjectIdentityProducer
              ? 'identityType,identityId ownerless/federated lookup with GeeSome manifest producer'
              : 'identityType,identityId ownerless/federated lookup'))
          : 'missing ownerless/federated identity lookup',
        has(storageObjectSource, 'storage_objects_medium_preview_storage_idx') ? 'preview storage lookup indexes' : 'missing preview storage lookup indexes',
        has(storageObjectSource, 'storage_objects_updated_idx') ? 'updatedAt,id registry scan' : 'missing updatedAt,id registry scan',
      ],
      notes: [
        hasStorageObjectRegistry
          ? (hasStorageObjectPinState
            ? (hasPinStorageObjectLedger
              ? (hasStorageObjectReconciliation
                ? (hasStorageObjectIdentity
                  ? (hasContentManifestStorageObjectIdentityProducer
                    ? (hasStorageObjectIdentityLookup
                      ? 'model-sync-created A2 on-ramp records one physical storage metadata row per storageId from content writes plus nullable ownerless/federated identity metadata; GeeSome content manifest imports seed that identity on the canonical storage object, database callers can resolve canonical rows by identity pair, public shared metadata reads prefer storageId metadata, local and restored legacy pin state remains canonical, per-account remote pin attempts are recorded separately, delete safety checks both the canonical local pin bit and protected remote-pin states, and restored-backup rehearsal repairs missing/mismatched canonical rows'
                      : 'model-sync-created A2 on-ramp records one physical storage metadata row per storageId from content writes plus nullable ownerless/federated identity metadata; GeeSome content manifest imports seed that identity on the canonical storage object, public shared metadata reads prefer it, successful pins and legacy pinned rows mark canonical storage-object state, remote pin refs are recorded separately, delete safety checks both the canonical pin bit and remote-pin ledger, and restored-backup rehearsal repairs missing/mismatched canonical rows')
                    : 'model-sync-created A2 on-ramp records one physical storage metadata row per storageId from content writes plus nullable ownerless/federated identity metadata; public shared metadata reads prefer it, successful pins and legacy pinned rows mark canonical storage-object state, remote pin refs are recorded separately, delete safety checks both the canonical pin bit and remote-pin ledger, and restored-backup rehearsal repairs missing/mismatched canonical rows')
                  : 'model-sync-created A2 on-ramp records one physical storage metadata row per storageId from content writes; public shared metadata reads prefer it, successful pins and legacy pinned rows mark canonical storage-object state, remote pin refs are recorded separately, delete safety checks both the canonical pin bit and remote-pin ledger, and restored-backup rehearsal repairs missing/mismatched canonical rows')
                : (hasStorageObjectIdentity
                  ? (hasContentManifestStorageObjectIdentityProducer
                    ? (hasStorageObjectIdentityLookup
                      ? 'model-sync-created A2 on-ramp records one physical storage metadata row per storageId from content writes plus nullable ownerless/federated identity metadata; GeeSome content manifest imports seed that identity on the canonical storage object, database callers can resolve canonical rows by identity pair, public shared metadata reads prefer storageId metadata, successful pins mark canonical storage-object state, remote pin refs are recorded separately, and delete safety checks both the canonical pin bit and remote-pin ledger'
                      : 'model-sync-created A2 on-ramp records one physical storage metadata row per storageId from content writes plus nullable ownerless/federated identity metadata; GeeSome content manifest imports seed that identity on the canonical storage object, public shared metadata reads prefer it, successful pins mark canonical storage-object state, remote pin refs are recorded separately, and delete safety checks both the canonical pin bit and remote-pin ledger')
                    : 'model-sync-created A2 on-ramp records one physical storage metadata row per storageId from content writes plus nullable ownerless/federated identity metadata; public shared metadata reads prefer it, successful pins mark canonical storage-object state, remote pin refs are recorded separately, and delete safety checks both the canonical pin bit and remote-pin ledger')
                  : 'model-sync-created A2 on-ramp records one physical storage metadata row per storageId from content writes; public shared metadata reads prefer it, successful pins mark canonical storage-object state, remote pin refs are recorded separately, and delete safety checks both the canonical pin bit and remote-pin ledger'))
              : (hasStorageObjectReconciliation
                ? 'model-sync-created A2 on-ramp records one physical storage metadata row per storageId from content writes; public shared metadata reads prefer it, successful pins and legacy pinned rows mark canonical storage-object state, delete safety checks the canonical pin bit with Content fallback, and restored-backup rehearsal repairs missing/mismatched canonical rows'
                : 'model-sync-created A2 on-ramp records one physical storage metadata row per storageId from content writes; public shared metadata reads prefer it, successful pins mark canonical storage-object state, and delete safety checks the canonical pin bit with Content fallback'))
            : 'model-sync-created A2 on-ramp records one physical storage metadata row per storageId from content writes; public shared metadata reads prefer it and fall back to Content for old rows')
          : 'canonical physical storage metadata remains represented only by user-owned Content rows',
      ],
    },
    {
      area: 'Storage object references',
      source: 'app/modules/database/models/storageObjectReference.ts',
      model: 'StorageObjectReference',
      indexes: [
        has(storageObjectReferenceSource, 'storage_object_refs_source_target_type_unique') ? 'sourceStorageId,targetStorageId,referenceType unique edge' : 'missing reference edge uniqueness',
        has(storageObjectReferenceSource, 'storage_object_refs_target_type_idx') ? 'targetStorageId,referenceType reverse lookup' : 'missing target reverse lookup',
        has(storageObjectReferenceSource, 'storage_object_refs_source_idx') ? 'sourceStorageId cleanup lookup' : 'missing source cleanup lookup',
      ],
      notes: [
        has(storageObjectReferenceSource, 'targetSize')
          ? 'model-sync-created child-reference edge table can retain generated-output parent-to-child storage links separately from user-library content rows'
          : 'generated-output child references are still analyzer-only and cannot participate in delete safety',
      ],
    },
    {
      area: 'Storage space snapshots',
      source: 'app/modules/database/models/storageSpaceSnapshot.ts',
      model: 'StorageSpaceSnapshot',
      indexes: [
        has(storageSpaceSnapshotSource, 'storage_space_snapshots_created_idx') ? 'createdAt,id latest-snapshot scan' : 'missing latest-snapshot scan index',
        has(storageSpaceSnapshotSource, 'storage_space_snapshots_user_created_idx') ? 'userId,createdAt,id operator history scan' : 'missing user snapshot history index',
      ],
      notes: [
        has(storageSpaceSnapshotSource, 'DataTypes.TEXT') && has(storageSpaceSnapshotSource, 'listLimit') && has(storageSpaceSnapshotSource, 'durationMs')
          ? 'model-sync cached storage analyzer snapshots store the bounded analyzer payload with list limit, duration, and optional refresher user'
          : 'snapshot table should store bounded analyzer payload metadata for large-node refreshes',
      ],
    },
    {
      area: 'Object cache',
      source: 'app/modules/database/models/object.ts',
      model: 'Object',
      indexes: [
        hasObjectResolvePropUnique ? 'storageId,resolveProp unique cache key' : 'missing resolveProp-aware cache key',
      ],
      notes: [
        hasObjectResolvePropUnique && has(objectSource, 'allowNull: false')
          ? 'active data-structure cache keys resolved and unresolved storage paths separately'
          : 'object cache should key by storageId plus resolveProp so resolved path reads do not collide',
      ],
    },
    {
      area: 'File catalog',
      source: 'app/modules/fileCatalog/models.ts + app/modules/database/migrations/20260510000001-enforce-file-catalog-active-path-unique.cjs',
      model: 'FileCatalogItem',
      indexes: [
        has(fileCatalogModelSource, 'file_catalog_items_content_idx') ? 'contentId reverse index' : 'missing contentId reverse index',
        hasFileCatalogParentListIndex ? 'user,parent,isDeleted,type,createdAt,id folder listing index' : 'missing folder listing index',
        hasFileCatalogPathUnique ? 'migration-backed active path uniqueness for child and root rows' : 'missing active path uniqueness',
      ],
      notes: [
        has(fileCatalogModelSource, 'file_catalog_items_content_idx') && hasFileCatalogParentListIndex && hasFileCatalogPathUnique
          ? (hasFileCatalogDefaultFolderRetry
            ? 'content reference checks, large folder listings, exact active path writes, and concurrent default upload folder creation are covered'
            : 'content reference checks, large folder listings, and exact active path writes are covered')
          : 'content delete/reference checks need a reverse content lookup index before large libraries',
      ],
    },
    {
      area: 'Static ID history',
      source: 'app/modules/staticId/models.ts',
      model: 'StaticIdHistory / StaticIdBinding',
      indexes: [
        has(staticIdSource, "fields: ['staticId', 'dynamicId'") ? 'staticId,dynamicId unique' : 'review static/dynamic unique index',
        has(staticIdSource, "fields: ['staticId', 'boundAt'") ? 'staticId,boundAt' : 'missing staticId,boundAt index',
        has(staticIdSource, "fields: ['dynamicId'") ? 'dynamicId lookup index' : 'missing dynamicId-leading lookup index',
        hasStaticIdCurrentBinding ? 'staticId unique current binding; dynamicId,boundAt current lookup' : 'missing compact current-binding table',
      ],
      notes: [
        hasStaticIdCurrentBinding && hasStaticIdHistoryCompaction
          ? 'hot static and dynamic resolution use compact current-binding rows created by model sync; StaticIdHistory keeps bounded per-static audit history and preserves the current binding'
          : (hasStaticIdCurrentBinding
          ? 'hot static and dynamic resolution use compact current-binding rows created by model sync; StaticIdHistory remains audit history and still needs retention/compaction policy'
          : (has(staticIdSource, "fields: ['dynamicId'")
          ? 'group/static manifest churn can create long history; dynamicId lookup is indexed, latest-binding/retention still open'
          : 'group/static manifest churn can create long history; getStaticIdItemByDynamicId needs dynamicId-leading index or latest-binding table'
          )
          ),
      ],
    },
    {
      area: 'Content accounting',
      source: 'app/modules/database/models/userContentAction.ts',
      model: 'UserContentAction / UserLimit',
      indexes: [
        has(userContentActionSource, "fields: ['userId'") ? 'content action user index' : 'no explicit content action indexes',
        hasUserLimitUnique ? 'user limit user,name unique' : (has(userLimitSource, "fields: ['userId', 'name'") ? 'user limit user,name index' : 'no explicit user limit user/name index'),
      ],
      notes: [
        has(userContentActionSource, 'DataTypes.BIGINT') && hasUserLimitUnique && hasUserLimitDuplicateRetry && hasUploadQuotaCommitLock
          ? 'quota checks sum UserContentAction by userId/name/createdAt before uploads, then content/action commits re-check under a UserLimit row lock; ledger size is BIGINT and UserLimit is unique per user/name after duplicate-key retry'
          : (has(userContentActionSource, 'DataTypes.BIGINT') && hasUserLimitUnique && hasUserLimitDuplicateRetry
          ? 'quota checks sum UserContentAction by userId/name/createdAt before uploads; ledger size is BIGINT; UserLimit is unique per user/name after duplicate cleanup and duplicate-key retry'
          : (has(userContentActionSource, 'DataTypes.BIGINT') && hasUserLimitUnique
          ? 'quota checks sum UserContentAction by userId/name/createdAt before uploads; ledger size is BIGINT; UserLimit is unique per user/name after duplicate cleanup'
          : (has(userContentActionSource, 'DataTypes.BIGINT')
          ? 'quota checks sum UserContentAction by userId/name/createdAt before uploads; ledger size is BIGINT; UserLimit lookup index is present but uniqueness is still separate'
          : 'quota checks sum UserContentAction by userId/name/createdAt before uploads; size remains INTEGER'))),
      ],
    },
    {
      area: 'Async operations',
      source: 'app/modules/asyncOperation/models.ts',
      model: 'UserAsyncOperation / UserOperationQueue',
      indexes: [
        has(asyncOperationSource, 'user_async_operations_user_process_name_created_idx')
          ? 'userId,inProcess,name,createdAt operation-list index'
          : 'missing user operation-list index',
        has(asyncOperationSource, 'user_async_operations_process_updated_idx')
          ? 'inProcess,updatedAt restart-sweep index'
          : 'missing inProcess restart-sweep index',
        has(asyncOperationSource, "fields: ['module', 'isWaiting']")
          ? 'queue module,isWaiting picker index'
          : 'review queue picker index',
        has(asyncOperationSource, 'user_operation_queues_async_operation_idx')
          ? 'queue asyncOperationId lifecycle index'
          : 'missing queue asyncOperationId lifecycle index',
        has(asyncOperationSource, 'user_operation_queues_waiting_async_updated_idx')
          ? 'queue isWaiting,asyncOperationId,updatedAt,id retention index'
          : 'missing queue retention index',
      ],
      notes: [
        has(asyncOperationSource, 'user_async_operations_user_process_name_created_idx') && has(asyncOperationSource, 'user_async_operations_process_updated_idx')
          && has(asyncOperationSource, 'user_operation_queues_async_operation_idx')
          && has(asyncOperationSource, 'user_operation_queues_waiting_async_updated_idx')
          ? (hasAsyncOperationRetention
            ? 'operation-list, restart-sweep, queue lifecycle, and queue retention indexes are present; finished-operation retention cleanup is bounded on startup'
            : 'operation-list, restart-sweep, queue lifecycle, and queue retention indexes are present; retention/cleanup policy remains open')
          : 'operation ledger can grow and needs lookup/sweep/queue indexes plus retention',
      ],
    },
    {
      area: 'Auto actions',
      source: 'app/modules/autoActions/models.ts',
      model: 'AutoAction',
      indexes: [
        has(autoActionSource, "fields: ['isActive']")
          ? 'isActive index'
          : 'missing isActive index',
        has(autoActionSource, 'auto_actions_active_execute_idx')
          ? 'isActive,executeOn executor index'
          : 'missing active/due executor index',
        hasAutoActionDbClaims
          ? 'isActive,executeOn,executeClaimExpiresAt,id claim index'
          : 'missing execution-claim index',
        has(autoActionSource, 'auto_actions_user_created_idx')
          ? 'userId,createdAt,id management-list index'
          : 'missing user management-list index',
      ],
      notes: [
        has(autoActionSource, 'auto_actions_active_execute_idx') && has(autoActionSource, 'auto_actions_user_created_idx')
          ? (hasBoundedAutoActionExecutor
            ? (hasAutoActionDbClaims
              ? 'due active executor scan, execution claims, and user management-list default paging are indexed; cron claims due actions atomically before queueing'
              : 'due active executor scan and user management-list default paging are indexed; executor is bounded and de-duplicated inside one node; multi-node claim locking remains separate')
            : 'due active executor scan and user management-list default paging are indexed; executor locking/batching policy remains separate')
          : 'scheduled executor and management list should have active/executeOn and user/default-order indexes',
      ],
    },
    {
      area: 'Pin accounts',
      source: 'app/modules/pin/models.ts',
      model: 'PinAccount',
      indexes: [
        hasPinUserNameUnique
          ? 'cleanup-backed userId,name unique lookup'
          : 'missing user/name unique lookup',
        hasPinGroupNameUnique
          ? 'cleanup-backed groupId,name unique lookup'
          : 'missing group/name unique lookup',
      ],
      notes: [
        hasPinUserNameUnique && hasPinGroupNameUnique
          ? (has(pinIndexSource, 'pinAccountListParams')
            ? 'runtime owner/name lookups are deterministic after duplicate-name cleanup; owner-scoped account lists are capped and ordered by allowlisted fields'
            : 'runtime owner/name lookups are deterministic after duplicate-name cleanup')
          : 'pin account lookup should start with owner id before name',
      ],
    },
    {
      area: 'Pin storage objects',
      source: 'app/modules/pin/models.ts',
      model: 'PinStorageObject',
      indexes: [
        hasPinStorageObjectLedger
          ? 'pinAccountId,storageId unique remote-pin ledger'
          : 'missing remote-pin ledger uniqueness',
        has(pinSource, 'pin_storage_objects_storage_status_idx')
          ? 'storageId,status cleanup blocker lookup'
          : 'missing storage/status lookup',
        has(pinSource, 'pin_storage_objects_status_check_idx')
          ? 'status,nextCheckAt,id reconciliation scan'
          : 'missing reconciliation scan index',
        has(pinSource, 'pin_storage_objects_reconcile_claim_idx')
          ? 'pinAccountId,reconcileClaimExpiresAt,id account claim scan'
          : 'missing account claim scan index',
      ],
      notes: [
        hasPinStorageObjectLedger
          ? (hasPinProviderReconciliation
            ? (hasPinProviderReconciliationWorker
              ? 'model-sync per-account state machine has opt-in restart and periodic provider reconciliation, expiring due-row claims, and cross-process account concurrency caps independently from local pin flags'
              : 'model-sync per-account state machine has bounded durable provider reconciliation, expiring row claims, and cross-process account concurrency caps independently from local pin flags')
            : 'model-sync per-account state machine records requested, accepted, confirmed, missing, and failed remote-pin state independently from local pin flags')
          : 'remote pins are only represented by Content/StorageObject pin booleans',
      ],
    },
    {
      area: 'Foreign accounts',
      source: 'app/modules/foreignAccounts/models.ts',
      model: 'ForeignAccount / AuthMessage',
      indexes: [
        has(foreignAccountSource, "fields: ['userId']")
          ? 'userId account-list index'
          : 'missing user account-list index',
        has(foreignAccountSource, "fields: ['userId', 'provider']")
          ? 'userId,provider lookup index'
          : 'missing user/provider lookup index',
        has(foreignAccountSource, "fields: ['provider', 'address']")
          ? 'provider,address lookup index'
          : 'missing provider/address lookup index',
        has(foreignAccountSource, "fields: ['foreignAccountId']")
          ? 'authMessage foreignAccountId index'
          : 'missing auth-message account index',
      ],
      notes: [
        has(foreignAccountIndexSource, 'foreignAccountListParams')
          ? 'user account lists are capped for the API while manifest export keeps the full internal list'
          : 'user account API lists can return every row for a user',
      ],
    },
    {
      area: 'Social network accounts',
      source: 'app/modules/socNetAccount/models.ts',
      model: 'SocNetAccount',
      indexes: [
        has(socNetAccountSource, "fields: ['userId', 'socNet', 'phoneNumber']")
          ? 'userId,socNet,phoneNumber lookup index'
          : 'missing phone account lookup index',
        has(socNetAccountSource, "fields: ['userId', 'socNet', 'username']")
          ? 'userId,socNet,username lookup index'
          : 'missing username account lookup index',
      ],
      notes: [
        has(socNetAccountIndexSource, 'socNetAccountListParams')
          ? 'user account lists are capped for the API and can filter by social network'
          : 'social account API lists can return every row for a user',
      ],
    },
    {
      area: 'Telegram content bots',
      source: 'app/modules/tgContentBot/models.ts',
      model: 'ContentBots',
      indexes: [
        hasContentBotUserIndex
          ? 'userId bot-list index'
          : 'missing user content-bot list index',
      ],
      notes: [
        has(tgContentBotApiSource, 'contentBotListParams')
          ? (hasContentBotUserIndex
            ? 'user content-bot lists are capped for the API and backed by the userId index'
            : 'user content-bot lists are capped for the API; add a userId index before this table grows materially')
          : 'content-bot API lists can return every row for a user',
      ],
    },
    {
      area: 'Group permissions',
      source: 'app/modules/group/models/groupPermission.ts',
      model: 'GroupPermission',
      indexes: [
        has(groupPermissionSource, "fields: ['userId'") || has(groupPermissionSource, "fields: ['groupId'") ? 'explicit permission index' : 'none',
      ],
      notes: [
        has(groupPermissionSource, "fields: ['userId', 'groupId', 'name']") && has(groupPermissionSource, "fields: ['groupId', 'userId']")
          ? 'permission lookup indexes present; uniqueness/share semantics still separate'
          : 'permission checks should have userId/groupId/name or groupId/userId indexes before large groups',
      ],
    },
    {
      area: 'Unread state',
      source: 'app/modules/group/models/groupRead.ts',
      model: 'GroupRead',
      indexes: [
        has(groupReadSource, "fields: ['userId', 'groupId'") ? 'userId,groupId unique' : 'review',
      ],
      notes: [
        has(groupReadSource, 'readPostId') && has(postSource, 'posts_group_timeline_idx')
          ? 'supports one read cursor per user/group; unread count can use readAt plus readPostId tie-breaker'
          : (has(postSource, 'posts_group_timeline_idx')
            ? 'supports one read cursor per user/group; count is indexed but cursor is timestamp-only'
            : 'supports one read cursor per user/group; unread count still depends on Post timeline index'),
      ],
    },
    {
      area: 'Social imports',
      source: 'app/modules/socNetImport/models.ts',
      model: 'SocNetImport*',
      indexes: [
        has(socNetImportSource, "fields: ['userId', 'dbChannelId', 'msgId']")
          ? 'channel/message source indexes present'
          : 'review source indexes',
      ],
      notes: [
        hasPostSourceUnique && has(socNetImportIndexSource, 'createPostOrUpdateSourceIdentity')
          ? 'message duplicate checks and post source identity are constraint-backed; reversal paths use lightweight post refs when present'
          : ((has(socNetImportIndexSource, 'getGroupPostRefs') || has(socNetImportIndexSource, 'forEachGroupPostRefBatch'))
            && has(socNetImportIndexSource, 'dbChannel.groupId')
            ? 'import duplicate checks are mostly indexed; reversal paths use lightweight post refs instead of hydrated timeline rows'
            : 'import duplicate checks are mostly indexed; reversal paths reuse group timeline queries'),
      ],
    },
    {
      area: 'Static sites',
      source: 'app/modules/staticSiteGenerator/models.ts',
      model: 'StaticSite',
      indexes: [
        has(staticSiteSource, 'entityId') ? 'entity/user lookup indexes present' : 'review static site indexes',
      ],
      notes: [
        'static generation scalability is dominated by group post loading, not staticSite lookup',
      ],
    },
    {
      area: 'Categories and sections',
      source: 'app/modules/groupCategory/models/groupCategory.ts',
      model: 'GroupCategory / GroupSection pivots',
      indexes: [
        has(groupCategorySource, "fields: ['name']") ? 'category name' : 'review category name index',
        has(groupSectionSource, "fields: ['name', 'categoryId']") ? 'section name,categoryId unique' : 'review section/category index',
        has(groupSectionSource, "fields: ['parentSectionId']") ? 'section parentSectionId' : 'review parent section index',
        has(groupCategorySource, 'category_groups_category_group_idx') ? 'categoryGroups categoryId,groupId' : 'missing categoryGroups category/group index',
        has(groupCategorySource, 'category_groups_group_category_idx') ? 'categoryGroups groupId,categoryId' : 'missing categoryGroups group/category index',
        has(groupSectionSource, 'group_sections_pivot_section_group_idx') ? 'groupSections sectionId,groupId' : 'missing section/group pivot index',
        has(groupSectionSource, 'group_sections_pivot_group_idx') ? 'groupSections groupId' : 'missing group section pivot index',
      ],
      notes: [
        has(groupCategorySource, 'DataTypes.BIGINT') && has(groupSectionSource, 'DataTypes.BIGINT')
          ? 'category and section aggregate size fields are BIGINT'
          : 'category/section size fields still need BIGINT review',
        has(groupCategorySource, 'category_admins_user_category_idx') && has(groupCategorySource, 'category_members_user_category_idx') && has(groupCategorySource, 'category_groups_category_group_idx')
          ? 'category admin/member/group through indexes are present'
          : 'review category pivot indexes',
        has(groupSectionSource, 'group_sections_pivot_section_group_idx') && has(groupSectionSource, 'group_sections_pivot_group_idx')
          ? 'section pivot indexes are present; feed cursor/count policy still needs review'
          : 'review section pivot indexes',
      ],
    },
    {
      area: 'Tags and mentions',
      source: 'app/modules/group/models/tag.ts',
      model: 'Tag / TaggedPosts / Mention / AutoTag',
      indexes: [
        has(tagSource, "fields: ['name'") ? 'tag name index' : 'no explicit tag indexes',
        has(tagSource, 'tagged_posts_post_tag_idx') && has(tagSource, 'tagged_posts_tag_post_idx')
          ? 'taggedPosts post/tag indexes'
          : has(tagSource, 'TaggedPosts') ? 'taggedPosts through table defined' : 'taggedPosts not found',
        has(mentionSource, "fields: ['sourcePostId'") ? 'mention FK indexes' : 'no explicit mention lookup indexes',
        has(autoTagSource, "fields: ['groupId'") ? 'autoTag group index' : 'no explicit autoTag lookup indexes',
      ],
      notes: [
        has(tagSource, 'tagged_posts_tag_post_idx') && has(mentionSource, 'mentions_target_group_idx') && has(autoTagSource, 'auto_tags_result_tag_idx')
          ? 'tag/mention/auto-tag lookup indexes are present; feed cursor/count policy still needs review before large tag surfaces'
          : 'quiet today, but tag/mention/federation filters need post/tag and source/target indexes before large feeds',
      ],
    },
  ];
}

function hotspotRows(): HotspotRow[] {
  const appSource = read('app/index.ts');
  const groupSource = read('app/modules/group/index.ts');
  const groupModelSource = read('app/modules/group/models/group.ts');
  const postEventHelperSource = read('app/modules/group/postEventHelpers.ts');
  const postEventSource = read('app/modules/group/models/postEvent.ts');
  const groupTestSource = read('test/group.test.ts');
  const manifestModuleSource = read('app/modules/entityJsonManifest/index.ts');
  const manifestHelperSource = read('app/modules/entityJsonManifest/helpers.ts');
  const manifestSource = `${manifestModuleSource}\n${manifestHelperSource}`;
  const remoteGroupSource = read('app/modules/remoteGroup/index.ts');
  const staticSiteSource = read('app/modules/staticSiteGenerator/index.ts');
  const rssSource = read('app/modules/rss/index.ts');
  const contentProjectionHelperSource = read('app/modules/group/contentProjectionHelpers.ts');
  const importSource = read('app/modules/socNetImport/index.ts');
  const categorySource = read('app/modules/groupCategory/index.ts');
  const contentSource = read('app/modules/content/index.ts');
  const contentModelSource = read('app/modules/database/models/content.ts');
  const databaseSource = read('app/modules/database/index.ts');
  const apiSource = read('app/modules/api/api.ts');
  const storageSpaceSource = read('app/modules/storageSpace/index.ts');
  const storageSpaceApiSource = read('app/modules/storageSpace/api.ts');
  const storageSpaceUsageSource = read('app/modules/storageSpace/queryHelpers.ts');
  const storageSpaceInspectionHelpersSource = read('app/modules/storageSpace/storageInspectionHelpers.ts');
  const storageReferenceHelpersSource = read('app/modules/database/storageReferenceHelpers.ts');
  const storageObjectModelSource = read('app/modules/database/models/storageObject.ts');
  const storageObjectReferenceModelSource = read('app/modules/database/models/storageObjectReference.ts');
  const storageSpaceSnapshotModelSource = read('app/modules/database/models/storageSpaceSnapshot.ts');
  const fileCatalogSource = read('app/modules/fileCatalog/index.ts');
  const inviteSource = read('app/modules/invite/index.ts');
  const staticIdSource = read('app/modules/staticId/index.ts');
  const staticIdModelSource = read('app/modules/staticId/models.ts');
  const asyncOperationSource = read('app/modules/asyncOperation/index.ts');
  const autoActionSource = read('app/modules/autoActions/index.ts');
  const autoActionModelSource = read('app/modules/autoActions/models.ts');
  const autoActionCronSource = read('app/modules/autoActions/cronService.ts');
  const pinSource = read('app/modules/pin/index.ts');
  const pinModelSource = read('app/modules/pin/models.ts');
  const foreignAccountSource = read('app/modules/foreignAccounts/index.ts');
  const foreignAccountModelSource = read('app/modules/foreignAccounts/models.ts');
  const socNetAccountSource = read('app/modules/socNetAccount/index.ts');
  const socNetAccountModelSource = read('app/modules/socNetAccount/models.ts');
  const tgContentBotSource = read('app/modules/tgContentBot/api.ts');
  const tgContentBotModelSource = read('app/modules/tgContentBot/models.ts');
  const helpersSource = read('app/helpers.ts');
  const packageSource = read('package.json');
  const restoredPressureSource = read('bash/database-restored-pressure');
  const derivedStateAsyncRehearsalSource = read('check/databaseDerivedStateAsyncRehearsal.ts');
  const derivedStateAsyncRehearsalBashSource = read('bash/database-derived-state-async-rehearsal');
  const scalabilityFixtureSource = read('check/databaseScalabilityFixture.ts');
  const scalabilityExplainSource = read('check/databaseScalabilityExplain.ts');
  const scalabilityTargetSource = read('check/databaseScalabilityTarget.ts');
  const generatedOutputPressureSource = read('check/databaseGeneratedOutputPressure.ts');
  const storageSpaceReportSource = read('check/databaseStorageSpaceReport.ts');
  const databaseValuesTestSource = read('test/databaseValues.test.ts');
  const activityPubSource = read('app/modules/activityPub/index.ts');
  const activityPubModelSource = read('app/modules/activityPub/models.ts');
  const hasTimelineIdFirstHydration = has(groupSource, 'getHydratedPostListByIds(postIds') && has(groupSource, "attributes: ['id', 'publishedAt']");
  const hasAllPostsIdFirstHydration = has(groupSource, 'getHydratedPostListByIds(pagePosts.map')
    && (has(groupSource, "attributes: ['id']") || has(groupSource, "attributes: ['id', 'publishedAt']"));
  const hasAllPostsCursorRefs = has(groupSource, 'async getAllPostRefs')
    && has(groupSource, 'async forEachAllPostRefBatch')
    && has(groupSource, 'helpers.getCursorListOrder(cursor, {sortBy, sortDir})')
    && has(groupSource, 'helpers.getCursorListOffset(cursor, offset)');
  const hasCategoryIdFirstHydration = has(categorySource, 'getHydratedPostListByIds(pagePosts.map')
    && has(categorySource, "helpers.getCursorListAttributes(['id'], cursor, sortBy)");
  const hasCategoryCursor = has(categorySource, 'helpers.getListCursorState(filters)')
    && has(categorySource, 'helpers.getNextListCursor(cursor, pagePosts, limit)')
    && has(categorySource, 'helpers.shouldIncludeListTotal(listParams, cursor)');
  const hasOptionalPostTotals = has(helpersSource, 'shouldIncludeListTotal')
    && has(groupSource, 'helpers.shouldIncludeListTotal(listParams, cursor)')
    && has(categorySource, 'helpers.shouldIncludeListTotal(listParams, cursor)');
  const hasPublicPostListLimits = has(helpersSource, 'allowedSortBy')
    && has(helpersSource, 'maxLimit')
    && has(groupSource, 'publicPostListParams')
    && has(categorySource, 'publicPostListParams');
  const hasFileCatalogListLimits = has(fileCatalogSource, 'fileCatalogPublicListParams')
    && has(fileCatalogSource, 'helpers.prepareListParams(listParams, fileCatalogPublicListParams)');
  const hasFileCatalogPublishBatchTraversal = has(fileCatalogSource, 'forEachFileCatalogChild')
    && has(fileCatalogSource, 'fileCatalogPublishBatchLimit')
    && has(fileCatalogSource, "order: [['id', 'ASC']]")
    && has(fileCatalogSource, 'id: {[Op.gt]: lastId}');
  const hasContentDeleteSafetyBlockers = has(databaseSource, 'contentBlockers')
    && has(databaseSource, 'storageBlockers')
    && has(databaseSource, 'blockers: [...contentBlockers, ...storageBlockers]');
  const hasContentDeleteSafetyHelper = has(databaseSource, 'getContentDeleteSafety')
    && has(databaseSource, 'safeToDestroyContent')
    && has(databaseSource, 'safeToRemovePhysical')
    && hasContentDeleteSafetyBlockers
    && has(fileCatalogSource, 'getContentDeleteSafety(content')
    && has(fileCatalogSource, 'allowedFileCatalogItems: 1')
    && has(fileCatalogSource, 'excludeFileCatalogItemId: fileCatalogItem.id');
  const hasContentSoftDeletePolicy = has(contentModelSource, 'isDeleted')
    && has(contentModelSource, 'deletedAt')
    && has(contentModelSource, 'where: {isDeleted: false}')
    && has(databaseSource, 'isDeleted: true')
    && has(databaseSource, 'includeDeleted')
    && has(fileCatalogSource, 'app.ms.database.deleteContent(content.id)');
  const hasStorageSpaceActiveContentFilters = has(storageSpaceUsageSource, 'WHERE "isDeleted" IS NOT TRUE')
    && has(storageSpaceUsageSource, 'content."isDeleted" IS NOT TRUE')
    && has(storageSpaceUsageSource, 'getStorageSpaceCleanupCandidateContents');
  const hasStorageObjectPinState = has(storageObjectModelSource, 'isPinned')
    && has(databaseSource, 'markStorageObjectPinnedByContent')
    && has(databaseSource, 'pinnedStorageObjects')
    && has(databaseSource, "getContentDeleteBlocker('storage', 'pinnedStorageObjects'");
  const hasPinStorageObjectLedger = has(pinModelSource, 'PinStorageObject')
    && has(pinModelSource, 'pin_storage_objects_account_storage_unique')
    && has(pinModelSource, 'pin_storage_objects_storage_status_idx')
    && has(pinModelSource, 'pin_storage_objects_status_check_idx')
    && has(pinSource, 'recordPinnedStorageObject')
    && has(pinSource, 'beginPinStorageObjectAttempt')
    && has(pinSource, 'PinStorageObjectStatus.Accepted')
    && has(storageReferenceHelpersSource, 'countRemotePinReferences')
    && has(databaseSource, 'remotePinRefs')
    && has(databaseSource, "getContentDeleteBlocker('storage', 'remotePinRefs'");
  const hasPinnedContentDeleteGuard = has(databaseSource, 'pinnedContents')
    && has(databaseSource, "getContentDeleteBlocker('content', 'pinnedContents'")
    && hasStorageObjectPinState
    && hasContentDeleteSafetyHelper;
  const hasDerivedStorageDeleteGuard = has(storageReferenceHelpersSource, 'derivedStorageReferenceSources')
    && has(storageReferenceHelpersSource, 'countDerivedStorageIdReferences')
    && has(storageReferenceHelpersSource, 'StaticSite')
    && has(storageReferenceHelpersSource, 'StaticIdBinding')
    && has(storageReferenceHelpersSource, 'countLatestStaticIdHistoryFallbackReferences')
    && has(storageReferenceHelpersSource, 'nativeStorageId')
    && has(storageReferenceHelpersSource, 'encryptedManifestStorageId')
    && has(databaseSource, 'countDerivedStorageIdReferences(this.models, this.sequelize, storageId, options)')
    && has(storageReferenceHelpersSource, 'excludeFileCatalogItemId')
    && has(databaseSource, "getContentDeleteBlocker('storage', 'derivedStorageRefs'");
  const hasStorageObjectChildReferenceGuard = has(storageObjectReferenceModelSource, 'storage_object_refs_source_target_type_unique')
    && has(storageObjectReferenceModelSource, 'storage_object_refs_target_type_idx')
    && has(databaseSource, 'replaceStorageObjectReferences')
    && has(databaseSource, 'storageObjectChildRefs')
    && has(databaseSource, "getContentDeleteBlocker('storage', 'storageObjectChildRefs'")
    && has(storageReferenceHelpersSource, 'countStorageObjectChildReferences')
    && has(storageSpaceInspectionHelpersSource, 'replaceStorageSpaceGeneratedOutputChildReferences')
    && has(storageSpaceInspectionHelpersSource, 'GeneratedOutputChild');
  const hasStorageSpaceUsageHelpers = has(storageSpaceSource, 'getStorageSpaceOverview')
    && has(storageSpaceSource, 'getStorageSpaceTypeBreakdown')
    && has(storageSpaceSource, 'getStorageSpaceTopContents')
    && has(storageSpaceSource, 'getStorageSpaceTopFileCatalogItems')
    && has(storageSpaceSource, 'getStorageSpaceFileCatalogFolders')
    && has(storageSpaceSource, 'getStorageSpaceTopGroups')
    && has(storageSpaceSource, 'getStorageSpaceGroupPosts')
    && has(storageSpaceUsageSource, 'logicalContentBytes')
    && has(storageSpaceUsageSource, 'physicalContentBytes')
    && has(storageSpaceUsageSource, 'duplicateStorageIdsCount')
    && has(storageSpaceUsageSource, 'getStorageSpaceFileCatalogFolders')
    && has(storageSpaceUsageSource, 'getStorageSpaceGroupPosts')
    && has(storageSpaceUsageSource, 'getStorageSpaceTypeBreakdown');
  const hasStorageSpaceApi = has(storageSpaceApiSource, 'admin/storage-space/overview')
    && has(storageSpaceApiSource, 'admin/storage-space/type-breakdown')
    && has(storageSpaceApiSource, 'admin/storage-space/top-contents')
    && has(storageSpaceApiSource, 'admin/storage-space/top-file-catalog-items')
    && has(storageSpaceApiSource, 'admin/storage-space/file-catalog-folders')
    && has(storageSpaceApiSource, 'admin/storage-space/top-groups')
    && has(storageSpaceApiSource, 'admin/storage-space/group-posts')
    && has(storageSpaceApiSource, 'canReadAdminStorageSpace')
    && has(storageSpaceApiSource, 'CorePermissionName.AdminRead');
  const hasStorageSpaceGeneratedOutputs = has(storageSpaceSource, 'getStorageSpaceGeneratedOutputs')
    && has(storageSpaceSource, 'generatedOutputs')
    && has(storageSpaceApiSource, 'admin/storage-space/generated-outputs')
    && has(storageSpaceUsageSource, 'getGeneratedOutputRefsSql')
    && has(storageSpaceUsageSource, 'generatedOutputKnownPhysicalBytes')
    && has(storageSpaceUsageSource, 'staticSite.storageId')
    && has(storageSpaceUsageSource, 'unknownStorageIdsCount');
  const hasStorageSpaceGeneratedOutputInspection = has(storageSpaceSource, 'inspectStorageSpaceGeneratedOutputRefs')
    && has(storageSpaceInspectionHelpersSource, 'getStorageStatMeasuredBytes')
    && has(storageSpaceSource, 'getStorageSpaceStorageInspectionWindow')
    && has(storageSpaceUsageSource, 'getStorageSpaceGeneratedOutputUnknownRefs')
    && has(storageSpaceApiSource, 'admin/storage-space/generated-output-inspection');
  const hasStorageSpaceGeneratedOutputReconcile = has(storageSpaceSource, 'reconcileStorageSpaceGeneratedOutputRefs')
    && has(storageSpaceInspectionHelpersSource, 'reconcileStorageSpaceGeneratedOutputRef')
    && has(storageSpaceInspectionHelpersSource, 'ContentStorageType.IPFS')
    && has(databaseSource, 'syncStorageObject(storageObjectData')
    && has(storageSpaceApiSource, 'admin/storage-space/generated-output-reconcile')
    && has(storageSpaceApiSource, 'CorePermissionName.AdminAll');
  const hasStorageSpaceGeneratedOutputChildRefs = has(storageSpaceSource, 'inspectStorageSpaceGeneratedOutputChildRefs')
    && has(storageSpaceSource, 'reconcileStorageSpaceGeneratedOutputChildRefs')
    && has(storageSpaceSource, 'getStorageSpaceGeneratedOutputChildInspectionWindow')
    && has(storageSpaceUsageSource, 'getStorageSpaceGeneratedOutputRefs')
    && has(storageSpaceInspectionHelpersSource, 'inspectStorageSpaceGeneratedOutputChildRefs')
    && has(storageSpaceInspectionHelpersSource, 'normalizeStorageLsEntries')
    && has(storageSpaceInspectionHelpersSource, 'reconcileStorageSpaceGeneratedOutputChildRef')
    && has(storageSpaceInspectionHelpersSource, 'replaceStorageSpaceGeneratedOutputChildReferences')
    && has(storageSpaceApiSource, 'admin/storage-space/generated-output-child-inspection')
    && has(storageSpaceApiSource, 'admin/storage-space/generated-output-child-reconcile');
  const hasRecursiveStorageSpaceGeneratedOutputChildRefs = hasStorageSpaceGeneratedOutputChildRefs
    && has(storageSpaceSource, 'depthLimit')
    && has(storageSpaceSource, 'nodeLimit')
    && has(storageSpaceInspectionHelpersSource, 'collectGeneratedOutputChildRows')
    && has(storageSpaceInspectionHelpersSource, 'inspectedParentStorageIds')
    && has(storageReferenceHelpersSource, 'isStorageObjectReferenceSourceVisible');
  const hasStorageSpaceSharedStorageIds = has(storageSpaceSource, 'getStorageSpaceSharedStorageIds')
    && has(storageSpaceSource, 'sharedStorageIds')
    && has(storageSpaceUsageSource, 'getStorageSpaceSharedStorageIds')
    && has(storageSpaceUsageSource, 'deduplicatedSavingsBytes')
    && has(storageSpaceApiSource, 'admin/storage-space/shared-storage-ids');
  const hasStorageSpacePinnedStorageObjects = has(storageSpaceSource, 'getStorageSpacePinnedStorageObjects')
    && has(storageSpaceSource, 'pinnedStorageObjects')
    && has(storageSpaceUsageSource, 'getStorageSpacePinnedStorageObjects')
    && has(storageSpaceUsageSource, 'generatedOutputRefsCount')
    && has(storageSpaceUsageSource, 'remotePinsCount')
    && has(storageSpaceApiSource, 'admin/storage-space/pinned-storage-objects');
  const hasStorageSpacePreviewStorage = has(storageSpaceSource, 'getStorageSpacePreviewStorage')
    && has(storageSpaceSource, 'previewStorage')
    && has(storageSpaceUsageSource, 'getStorageSpacePreviewStorage')
    && has(storageSpaceUsageSource, 'physicalPreviewBytes')
    && has(storageSpaceApiSource, 'admin/storage-space/preview-storage');
  const hasStorageSpaceAvailabilitySignals = has(storageSpaceSource, 'getStorageSpaceAvailabilitySignals')
    && has(storageSpaceSource, 'availabilitySignals')
    && has(storageSpaceUsageSource, 'getStorageSpaceAvailabilitySignals')
    && has(storageSpaceUsageSource, 'maxPeerCount')
    && has(storageSpaceApiSource, 'admin/storage-space/availability-signals');
  const hasStorageSpaceAvailabilityNetworkInspection = has(storageSpaceSource, 'inspectStorageSpaceAvailabilityNetworkSignals')
    && has(storageSpaceSource, 'getStorageSpaceAvailabilityNetworkInspectionWindow')
    && has(storageSpaceInspectionHelpersSource, 'inspectStorageSpaceAvailabilityNetworkSignal')
    && has(storageSpaceInspectionHelpersSource, 'findProvs')
    && has(storageSpaceInspectionHelpersSource, 'findProviders')
    && has(storageSpaceApiSource, 'admin/storage-space/availability-network-inspection');
  const hasStorageSpaceAvailabilityNetworkSamples = has(storageSpaceSource, 'getStorageSpaceAvailabilityNetworkSamples')
    && has(storageSpaceSource, 'getStorageSpaceAvailabilityNetworkSampleSummary')
    && has(storageSpaceSource, 'processStorageSpaceAvailabilityNetworkSampleRefreshQueue')
    && has(storageSpaceUsageSource, 'getStorageSpaceAvailabilityNetworkSampleSummary')
    && has(storageSpaceApiSource, 'admin/storage-space/availability-network-samples/summary');
  const hasRestoredStorageSpaceReportAvailabilityCoverage = has(packageSource, '"database:storage-space-report"')
    && has(restoredPressureSource, 'database:storage-space-report')
    && has(storageSpaceReportSource, 'getStorageSpaceAvailabilitySignals')
    && has(storageSpaceReportSource, 'getStorageSpaceAvailabilityNetworkSampleSummary')
    && has(storageSpaceReportSource, "tableExists(sequelize, 'storageSpaceAvailabilitySamples')")
    && has(storageSpaceReportSource, 'Availability Network Sample Summary');
  const hasStorageSpaceAvailabilityNetworkEvidence = hasStorageSpaceAvailabilityNetworkInspection
    && hasStorageSpaceAvailabilityNetworkSamples
    && hasRestoredStorageSpaceReportAvailabilityCoverage;
  const hasStorageSpaceCleanupBlockers = has(storageSpaceSource, 'getStorageSpaceCleanupBlockers')
    && has(storageSpaceSource, 'getStorageSpaceCleanupBlockerRow')
    && has(storageSpaceUsageSource, 'getStorageSpaceCleanupCandidateContents')
    && has(storageSpaceSource, 'blockerCount')
    && has(storageSpaceApiSource, 'admin/storage-space/cleanup-blockers');
  const hasStorageSpaceSnapshots = has(storageSpaceSnapshotModelSource, 'storageSpaceSnapshot')
    && has(storageSpaceSnapshotModelSource, 'storage_space_snapshots_created_idx')
    && has(storageSpaceSource, 'getLatestStorageSpaceSnapshot')
    && has(storageSpaceSource, 'refreshStorageSpaceSnapshot')
    && has(storageSpaceSource, 'queueStorageSpaceSnapshotRefresh')
    && has(storageSpaceSource, 'processStorageSpaceSnapshotRefreshQueue')
    && has(storageSpaceSource, 'storageSpaceSnapshotQueueModuleName')
    && has(asyncOperationSource, 'processModuleOperationQueue')
    && has(asyncOperationSource, 'moduleOperationQueuePromises')
    && has(storageSpaceApiSource, 'admin/storage-space/snapshot')
    && has(storageSpaceApiSource, 'admin/storage-space/snapshot/refresh')
    && has(storageSpaceApiSource, 'admin/storage-space/snapshot/refresh-async');
  const hasStorageSpaceSnapshotProgress = has(storageSpaceSource, 'getStorageSpaceSnapshotDataWithProgress')
    && has(storageSpaceSource, 'getStorageSpaceSnapshotProgressPercent')
    && has(storageSpaceSource, 'storage-space-snapshot-progress')
    && has(storageSpaceSource, 'updateStorageSpaceSnapshotRefreshProgress');
  const hasCategoryManagementListLimits = has(categorySource, 'categoryManagementListParams')
    && has(categorySource, 'helpers.prepareListParams(listParams, categoryManagementListParams)')
    && has(categorySource, 'app.ms.database.setDefaultListParamsValues(listParams, categoryManagementListParams)');
  const hasUserUtilityListLimits = has(staticSiteSource, 'staticSiteListParams')
    && has(staticSiteSource, 'helpers.prepareListParams(listParams, staticSiteListParams)')
    && has(staticSiteSource, 'app.ms.database.setDefaultListParamsValues(listParams, staticSiteListParams)')
    && has(staticSiteSource, 'models.StaticSite.count({ where })')
    && has(asyncOperationSource, 'operationQueueListParams')
    && has(asyncOperationSource, 'helpers.prepareListParams(listParams, operationQueueListParams)')
    && has(asyncOperationSource, 'app.ms.database.setDefaultListParamsValues(listParams, operationQueueListParams)');
  const hasInviteListLimits = has(inviteSource, 'inviteListParams')
    && has(inviteSource, 'helpers.prepareListParams(listParams, inviteListParams)')
    && has(inviteSource, 'app.ms.database.setDefaultListParamsValues(listParams, inviteListParams)')
    && has(inviteSource, 'models.Invite.count({ where })');
  const hasApiKeyListLimits = has(appSource, 'apiKeyListParams')
    && has(appSource, 'helpers.prepareListParams(listParams, apiKeyListParams)')
    && has(databaseSource, 'apiKeyListParams')
    && has(databaseSource, 'this.setDefaultListParamsValues(listParams, apiKeyListParams)');
  const hasAdminDirectoryListLimits = has(appSource, 'adminUserListParams')
    && has(appSource, 'helpers.prepareListParams(listParams, adminUserListParams)')
    && has(databaseSource, 'adminUserListParams')
    && has(databaseSource, 'this.setDefaultListParamsValues(listParams, adminUserListParams)')
    && has(databaseSource, 'adminContentListParams')
    && has(databaseSource, 'this.setDefaultListParamsValues(listParams, adminContentListParams)')
    && has(contentSource, 'adminContentListParams')
    && has(contentSource, 'helpers.prepareListParams(listParams, adminContentListParams)')
    && has(groupSource, 'adminGroupListParams')
    && has(groupSource, 'helpers.prepareListParams(listParams, adminGroupListParams)')
    && has(groupSource, 'app.ms.database.setDefaultListParamsValues(listParams, adminGroupListParams)');
  const hasUserGroupListLimits = has(groupSource, 'userGroupListParams')
    && has(groupSource, 'helpers.prepareListParams(listParams, userGroupListParams)')
    && has(groupSource, 'app.ms.database.setDefaultListParamsValues(listParams, userGroupListParams)')
    && has(groupSource, 'countMemberInGroups({where})')
    && has(groupSource, 'countAdministratorInGroups({where})')
    && has(groupSource, 'models.Group.count({where})');
  const hasUserFriendListLimits = has(groupSource, 'userFriendListParams')
    && has(groupSource, 'helpers.prepareListParams(listParams, userFriendListParams)')
    && has(databaseSource, 'userFriendListParams')
    && has(databaseSource, 'this.setDefaultListParamsValues(listParams, userFriendListParams)')
    && has(databaseSource, 'getAllUsersWhere(search)')
    && has(databaseSource, 'countFriends({where})');
  const hasAutoActionListLimits = has(autoActionSource, 'autoActionListParams')
    && has(autoActionSource, 'helpers.prepareListParams(params, autoActionListParams)')
    && has(autoActionSource, 'app.ms.database.setDefaultListParamsValues(listParams, autoActionListParams)')
    && has(autoActionSource, 'getAutoActionListWhere(userId, params)')
    && has(autoActionSource, 'helpers.prepareWhereParams(params, autoActionListFilterTypes)')
    && has(autoActionSource, 'models.AutoAction.count({where})');
  const hasPinAccountListLimits = has(pinSource, 'pinAccountListParams')
    && has(pinSource, 'helpers.prepareListParams(listParams, pinAccountListParams)')
    && has(pinSource, 'app.ms.database.setDefaultListParamsValues(listParams, pinAccountListParams)')
    && has(pinSource, 'getPinAccountListOrder(sortBy, sortDir)')
    && has(pinSource, 'limit')
    && has(pinSource, 'offset');
  const hasForeignAccountListLimits = has(foreignAccountSource, 'foreignAccountListParams')
    && has(foreignAccountSource, 'helpers.prepareListParams(listParams, foreignAccountListParams)')
    && has(foreignAccountSource, 'app.ms.database.setDefaultListParamsValues(listParams, foreignAccountListParams)')
    && has(foreignAccountSource, 'getForeignAccountListOrder(sortBy, sortDir)')
    && has(foreignAccountSource, 'beforeEntityManifestStore')
    && has(foreignAccountSource, 'getUserAccountsList(userId)');
  const hasSocNetAccountListLimits = has(socNetAccountSource, 'socNetAccountListParams')
    && has(socNetAccountSource, 'helpers.prepareListParams(listParams, socNetAccountListParams)')
    && has(socNetAccountSource, 'app.ms.database.setDefaultListParamsValues(listParams, socNetAccountListParams)')
    && has(socNetAccountSource, 'getSocNetAccountListOrder(sortBy, sortDir)')
    && has(socNetAccountSource, 'getAccountList(userId');
  const hasContentBotListLimits = has(tgContentBotSource, 'contentBotListParams')
    && has(tgContentBotSource, 'helpers.prepareListParams(req.body, contentBotListParams)')
    && has(tgContentBotSource, 'app.ms.database.setDefaultListParamsValues(listParams, contentBotListParams)')
    && has(tgContentBotSource, 'getContentBotListOrder(sortBy, sortDir)')
    && has(tgContentBotSource, 'limit')
    && has(tgContentBotSource, 'offset');
  const hasContentBotUserIndex = hasSequelizeModelIndex(
    tgContentBotModelSource,
    'contentBot',
    'content_bots_user_id_idx',
    "fields: ['userId']",
  );
  const cappedListSurfaces = [
    hasPublicPostListLimits ? 'public post feeds' : null,
    hasFileCatalogListLimits ? 'file-catalog browsing' : null,
    hasCategoryManagementListLimits ? 'category management lists' : null,
    hasUserUtilityListLimits ? 'static-site lists' : null,
    hasUserUtilityListLimits ? 'operation queue lists' : null,
    hasInviteListLimits ? 'invite lists' : null,
    hasApiKeyListLimits ? 'API-key lists' : null,
    hasAdminDirectoryListLimits ? 'admin directory lists' : null,
    hasUserGroupListLimits ? 'user group membership/chat lists' : null,
    hasUserFriendListLimits ? 'user friend lists' : null,
    hasAutoActionListLimits ? 'auto-action management lists' : null,
    hasPinAccountListLimits ? 'pin account lists' : null,
    hasForeignAccountListLimits ? 'foreign account API lists' : null,
    hasSocNetAccountListLimits ? 'social account API lists' : null,
    hasContentBotListLimits ? 'content-bot API lists' : null,
  ].filter((value): value is string => Boolean(value));
  const hasBoundedAutoActionExecutor = has(autoActionSource, 'limit: autoActionExecuteBatchLimit')
    && has(autoActionSource, "order: [['executeOn', 'ASC'], ['id', 'ASC']]")
    && has(autoActionCronSource, 'actionIdsInQueueOrProcess');
  const hasAutoActionDbClaims = has(autoActionSource, 'claimAutoActionsToExecute')
    && has(autoActionSource, 'claimDueForExecution')
    && has(autoActionModelSource, 'FOR UPDATE SKIP LOCKED')
    && has(autoActionModelSource, 'executeClaimExpiresAt')
    && has(autoActionModelSource, 'auto_actions_active_execute_claim_idx')
    && has(autoActionCronSource, 'claimAutoActionsToExecute');
  const hasAsyncOperationRetention = has(asyncOperationSource, 'cleanupFinishedAsyncOperations')
    && has(asyncOperationSource, 'finishedOperationCleanupBatchLimit')
    && has(asyncOperationSource, 'asyncOperationId: null');
  const hasGroupManifestPostRefs = has(groupSource, 'async getGroupManifestPostRefs')
    && (has(manifestSource, 'getGroupManifestPostRefs(groupData.id, filters')
      || has(manifestSource, 'getGroupManifestPostRefs(groupId, batchFilters'));
  const hasSocialImportPostRefBatches = has(importSource, 'forEachGroupPostRefBatch')
    && has(importSource, 'dbChannel.groupId')
    && has(importSource, 'reverseLocalIdBatchLimit')
    && has(groupSource, 'forEachGroupPostRefBatch')
    && !has(importSource, 'limit: 10000');
  const hasSocialImportPostRefs = ((has(importSource, 'getGroupPostRefs') && has(importSource, 'dbChannel.groupId')) || hasSocialImportPostRefBatches)
    && has(importSource, 'idGte: startReverseMessage.postId');
  const hasGroupManifestRefBatches = hasGroupManifestPostRefs
    && has(manifestSource, 'forEachGroupManifestPostRef')
    && has(groupSource, 'cursorUpdatedAt')
    && !has(manifestSource, 'limit: 9999999');
  const hasGroupManifestPostIndexSidecar = has(manifestSource, 'attachGroupManifestPostIndex')
    && has(manifestSource, 'group-post-index-page')
    && has(manifestSource, 'getGroupManifestPostRefsFromIndex')
    && has(remoteGroupSource, 'entityJsonManifest.getGroupManifestPostRefs(groupManifest)')
    && has(groupTestSource, 'chunked post index');
  const hasGroupManifestChunkedOnlyOption = hasGroupManifestPostIndexSidecar
    && has(manifestSource, 'GROUP_MANIFEST_INLINE_POSTS_LIMIT')
    && has(manifestSource, 'includeInlinePosts')
    && has(manifestSource, 'getCurrentGroupManifestPostRefs')
    && has(groupTestSource, 'includeInlinePosts: false')
    && has(groupTestSource, 'inlinePostsLimit: 1');
  const hasGroupManifestDefaultInlineCutoff = hasGroupManifestChunkedOnlyOption
    && has(manifestHelperSource, 'defaultGroupManifestInlinePostsLimit = 1000')
    && has(generatedOutputPressureSource, 'defaultGroupManifestInlinePostsLimit')
    && has(generatedOutputPressureSource, 'effectiveInlinePostsLimit')
    && has(groupTestSource, 'defaultGroupManifestInlinePostsLimit + 1');
  const hasGroupManifestDurableCursor = hasGroupManifestRefBatches
    && has(groupModelSource, 'manifestPostsCursorUpdatedAt')
    && has(groupModelSource, 'manifestPostsCursorId')
    && has(groupSource, 'manifestPostsCursorUpdatedAt')
    && has(groupSource, 'manifestPostsCursorId')
    && has(manifestSource, 'generateGroupManifestWithState')
    && has(manifestSource, 'getGroupManifestGenerationCursor')
    && has(groupTestSource, 'stores and reuses the group manifest post cursor');
  const hasGroupDerivedStateQueue = has(groupSource, "groupDerivedStateQueueModuleName = 'group-derived-state'")
    && has(groupSource, 'GROUP_DERIVED_STATE_ASYNC')
    && has(groupSource, 'queuePostManifestUpdate')
    && has(groupSource, 'queueGroupManifestUpdate')
    && has(groupSource, 'processDerivedStateQueue')
    && has(groupSource, 'runDerivedStateJob')
    && has(asyncOperationSource, 'addUniqueUserOperationQueue')
    && has(groupTestSource, 'dedupes and processes queued post manifest derived-state jobs');
  const hasGroupDerivedStateWorkerPolicy = hasGroupDerivedStateQueue
    && has(groupSource, 'GROUP_DERIVED_STATE_WORKER')
    && has(groupSource, 'GROUP_DERIVED_STATE_WORKER_BATCH_LIMIT')
    && has(groupSource, 'GROUP_DERIVED_STATE_KICK_BATCH_LIMIT')
    && has(groupSource, 'startDerivedStateQueueWorker')
    && has(groupSource, 'stopDerivedStateQueueWorker')
    && has(groupTestSource, 'kicks derived-state queue processing with a bounded batch');
  const hasGroupDerivedStateAsyncRehearsal = hasGroupDerivedStateWorkerPolicy
    && has(packageSource, 'database:derived-state-async-rehearsal')
    && has(derivedStateAsyncRehearsalBashSource, 'CONFIRM_RESTORED_BACKUP=1')
    && has(derivedStateAsyncRehearsalSource, 'GROUP_DERIVED_STATE_ASYNC')
    && has(derivedStateAsyncRehearsalSource, 'queuePostManifestUpdate')
    && has(derivedStateAsyncRehearsalSource, 'processDerivedStateQueue')
    && has(derivedStateAsyncRehearsalSource, 'collectDatabaseDerivedStateIntegrity');
  const hasGroupDerivedStateDefaultQueue = hasGroupDerivedStateAsyncRehearsal
    && has(groupSource, 'helpers.parseBoolean(process.env.GROUP_DERIVED_STATE_ASYNC, true)')
    && has(packageSource, 'GROUP_DERIVED_STATE_ASYNC=0')
    && has(groupTestSource, 'queues post manifest derived state by default when the env opt-out is absent');
  const hasGeneratedOutputPostBatchHelper = has(groupSource, 'forEachHydratedGroupPostBatch')
    && has(groupSource, 'getHydratedGroupPostBatch')
    && has(groupSource, 'getGroupPostRefs(groupId')
    && has(groupSource, 'getHydratedPostListByIds');
  const hasStaticSitePostRefBatches = hasGeneratedOutputPostBatchHelper
    && has(staticSiteSource, 'forEachHydratedGroupPostBatch(entityId')
    && has(staticSiteSource, 'generatedGroupPostBatchLimit');
  const hasStaticSiteAvailableCount = has(staticSiteSource, 'getGroupSitePostsCount')
    && has(staticSiteSource, 'availablePostsCount')
    && has(staticSiteSource, 'publishedPostsCount');
  const hasStaticSiteStreamingRender = has(staticSiteSource, 'prepareGroupSiteRenderContext')
    && has(staticSiteSource, 'renderGroupPostBatchPages')
    && has(staticSiteSource, 'currentPosts')
    && has(staticSiteSource, 'currentPost');
  const hasStaticSiteBodyCache = has(staticSiteSource, 'createStaticSiteRenderCache')
    && has(staticSiteSource, 'bodyTextCache')
    && has(staticSiteSource, 'generatedOutputCacheLimit')
    && has(staticSiteSource, 'postObjects')
    && has(contentProjectionHelperSource, 'getProjectedContentText');
  const hasRssPostRefs = hasGeneratedOutputPostBatchHelper
    && has(rssSource, 'forEachHydratedGroupPostBatch(groupId')
    && has(rssSource, 'rssPostBatchLimit');
  const hasRssContentProjection = has(rssSource, 'getPostFeedContents')
    && has(rssSource, 'includeText: false')
    && has(rssSource, 'includeJson: false');
  const hasRssBodyCache = has(rssSource, 'bodyTextCache: new Map')
    && has(rssSource, 'bodyTextCache: projectionOptions.bodyTextCache')
    && has(rssSource, 'rssBodyCacheMaxEntries')
    && has(contentProjectionHelperSource, 'getProjectedContentText');
  const hasRssFeedWindowPolicy = has(rssSource, 'rssDefaultPostsLimit')
    && has(rssSource, 'rssMaxPostsLimit')
    && has(rssSource, 'getFeedPostsLimit')
    && has(rssSource, 'options.limit');
  const hasGroupManifestDeleteUnset = has(manifestSource, 'unsetTreeNode(groupManifest.posts, post.localId)');
  const hasGroupManifestStatusUnset = has(manifestSource, 'statusNe: PostStatus.Published')
    && (has(groupSource, 'this.updateGroupManifest(userId, oldPost.groupId)')
      || has(groupSource, 'this.applyGroupManifestUpdate(userId, oldPost.groupId)'));
  const hasPostWriteTransaction = has(groupSource, 'allocatePostLocalId(postData, transaction)')
    && has(groupSource, 'this.addPost(postData, {transaction})')
    && has(groupSource, 'this.setPostContents(post.id, contents, {transaction})')
    && has(groupSource, 'this.incrementGroupCounters(post.groupId, {sizeDelta: size || 0, availableDelta: 1}, {transaction})');
  const hasPostRelationCounterRepair = has(groupSource, 'async reconcilePostRelationCounters')
    && has(groupSource, 'this.getPostsWhere({replyToId: postId})')
    && has(groupSource, 'this.getPostsWhere({repostOfId: postId})')
    && has(groupSource, 'models.Post.update({repliesCount, repostsCount}');
  const hasPostDeleteTransaction = (has(groupSource, 'this.updatePosts(postIds, {isDeleted: true}, {transaction})')
    || (has(groupSource, 'const updateData: any = {isDeleted: true}')
      && has(groupSource, 'this.updatePosts(postIds, updateData, {transaction})')))
    && has(groupSource, 'this.incrementGroupCounters(Number(groupId), deltas, {transaction})')
    && hasPostRelationCounterRepair;
  const hasPostStatusCounterReconcile = has(groupSource, 'shouldReconcileReplyCounters')
    && has(groupSource, 'shouldReconcileRepostCounters')
    && hasPostRelationCounterRepair;
  const hasSocialImportRelationCounterUpsertTest = has(groupTestSource, 'reconciles relation counters when social import upserts move targets');
  const hasSocialImportGroupCounterUpsertTest = has(groupTestSource, 'groupAfterSecondImport.availablePostsCount')
    && has(groupTestSource, 'Number(groupAfterSecondImport.size)');
  const hasSocialImportStatusLifecycleTest = has(groupTestSource, 'reconciles social import source identity when a post becomes draft')
    && has(groupTestSource, 'manifestAfterDraft.posts')
    && has(groupTestSource, 'groupAfterDraft.availablePostsCount');
  const hasSocialImportDeleteLifecycleTest = has(groupTestSource, 'reconciles social import source identity when a post is deleted')
    && has(groupTestSource, 'manifestAfterDelete.posts')
    && has(groupTestSource, 'groupAfterDelete.availablePostsCount');
  const hasSourceImportPostEvents = has(postEventSource, 'post_events_source_identity_idx')
    && has(groupSource, 'buildSourceImportPostEvent')
    && has(postEventHelperSource, 'PostEventType.SourceImport')
    && has(groupTestSource, 'PostEventAction.Deleted')
    && has(groupTestSource, 'models.PostEvent.findAll');
  const hasPostLifecycleEvents = has(postEventHelperSource, 'PostEventType.PostLifecycle')
    && has(groupSource, 'buildPostLifecycleEvent')
    && has(groupSource, 'addPostEvents')
    && has(groupTestSource, 'records post lifecycle events for ordinary post writes')
    && has(groupTestSource, 'PostEventType.PostLifecycle');
  const hasRemotePostManifestImportState = has(remoteGroupSource, 'createRemotePostByObject(userId, postObject')
    && has(groupSource, 'async createRemotePostByObject')
    && has(manifestSource, "'source', 'sourceChannelId', 'sourcePostId', 'sourceDate'")
    && has(manifestSource, 'normalizeManifestDate')
    && has(groupTestSource, 'imports remote post manifests through canonical post state');
  const hasRemotePostManifestIdempotency = has(groupSource, 'getActivePostByGroupAndManifestId')
    && has(groupSource, 'lockGroupForPostWrite(postData.groupId, transaction)')
    && has(groupTestSource, 'reuses an active remote post when the same manifest import is retried');
  const hasRemoteGroupManifestPostImport = has(remoteGroupSource, 'importGroupManifestPosts')
    && has(remoteGroupSource, 'getGroupManifestPostRefs')
    && has(remoteGroupSource, 'isGroupManifestImportComplete')
    && has(remoteGroupSource, 'skipGroupManifestUpdate: true')
    && has(groupTestSource, 'imports remote group manifest post refs idempotently');
  const hasRemoteGroupManifestReplay = has(remoteGroupSource, 'getGroupManifestImportChanges')
    && has(remoteGroupSource, 'getActiveGroupPostRefsByLocalId')
    && has(groupSource, 'deletePostsPure')
    && has(groupSource, 'clearLocalIds')
    && has(groupTestSource, 'replays remote group manifest post edits and deletes');
  const hasGroupCounterRepairTest = has(groupTestSource, 'repairs group size, availability, and local-id high-water counters')
    && has(groupTestSource, 'reconcileGroupCounters(testGroup.id)');
  const hasDeterministicSharedContentLookup = has(databaseSource, 'async getSharedContentByStorageId')
    && has(databaseSource, 'async getSharedContentByManifestId')
    && has(databaseSource, "order: [['id', 'ASC']]")
    && has(databaseSource, 'return this.getSharedContentByManifestId(manifestStorageId)');
  const hasOwnerlessContentCreateGuard = has(contentSource, 'async getSharedContentByObject')
    && has(contentSource, 'async getActorContentByObject')
    && has(contentSource, "throw new Error('content_actor_required')");
  const hasStorageObjectRegistry = has(storageObjectModelSource, 'storage_objects_storage_id_unique')
    && has(storageObjectModelSource, 'storage_objects_medium_preview_storage_idx')
    && has(databaseSource, 'syncStorageObjectForContent')
    && has(databaseSource, 'getStorageObjectByStorageId')
    && has(databaseSource, 'getSharedStorageMetadataByStorageId');
  const hasStorageObjectIdentity = has(storageObjectModelSource, 'identityType')
    && has(storageObjectModelSource, 'identityId')
    && has(storageObjectModelSource, 'storage_objects_identity_idx')
    && has(databaseSource, 'syncStorageObjectIdentity')
    && has(databaseValuesTestSource, 'ownerless storage-object identity');
  const hasStorageObjectIdentityLookup = hasStorageObjectIdentity
    && has(databaseSource, 'async getStorageObjectByIdentity')
    && has(databaseValuesTestSource, 'getStorageObjectByIdentity');
  const hasContentManifestStorageObjectIdentityProducer = has(contentSource, 'contentManifestStorageObjectIdentityType')
    && has(contentSource, 'syncContentManifestStorageObject')
    && has(contentSource, 'syncStorageObjectForContent(storageObjectData)')
    && has(groupTestSource, 'geesome-content-manifest');
  const hasPublicContentMetadataPolicy = has(contentSource, 'async getPublicContentMetadata')
    && has(contentSource, 'publicStorageMetadataFields')
    && has(contentSource, "throw createContentNotFoundError()");
  const hasCanonicalPostDbTransaction = hasPostWriteTransaction && hasPostDeleteTransaction;
  const hasStaticIdCurrentBinding = has(staticIdSource, 'models.StaticIdBinding.findOne({where: {dynamicId}')
    && has(staticIdSource, 'getStaticIdHistoryFallbackByDynamicId')
    && has(staticIdSource, 'setStaticIdBindingFromHistory')
    && has(staticIdModelSource, 'static_id_bindings_static_unique')
    && has(staticIdModelSource, 'static_id_bindings_dynamic_bound_idx');
  const hasStaticIdHistoryCompaction = has(staticIdSource, 'compactStaticIdHistory')
    && has(staticIdSource, 'STATIC_ID_HISTORY_RETAINED_ROWS')
    && has(staticIdModelSource, 'compactStaleHistory');
  const hasUploadQuotaCommitLock = has(databaseSource, 'addContentWithUserContentAction')
    && has(databaseSource, 'checkUserContentActionLimit')
    && has(databaseSource, 'Transaction.LOCK.UPDATE')
    && has(contentSource, 'addContentWithUserContentAction');
  const hasBoundedStaticRebindScan = has(groupSource, 'getGroupWhereStaticOutdated')
    && has(groupSource, 'staticRebindBatchLimit')
    && has(groupSource, "order: [['staticStorageUpdatedAt', 'ASC'], ['id', 'ASC']]")
    && has(groupSource, 'limit');
  const hasLargeFixtureExplainHarness = has(packageSource, '"database:scalability:fixture"')
    && has(packageSource, '"database:scalability:explain"')
    && has(scalabilityFixtureSource, "FIXTURE_POSTS || '100000'")
    && has(scalabilityFixtureSource, 'getFixtureContentShape')
    && has(scalabilityFixtureSource, 'normalizeFixtureContentMetadata')
    && has(scalabilityFixtureSource, 'seedFixtureCategory')
    && has(scalabilityFixtureSource, 'seedStaticIdState')
    && has(scalabilityFixtureSource, 'seedUserContentActions')
    && has(scalabilityFixtureSource, 'normalizeFixturePreviewIds')
    && has(scalabilityExplainSource, 'Category feed page')
    && has(scalabilityExplainSource, 'Static-site/RSS newest post-ref scan')
    && has(scalabilityExplainSource, 'Content preview/header lookup by preview storage ID')
    && has(scalabilityExplainSource, 'Timeline page (Published, cursor pagination)')
    && has(scalabilityExplainSource, 'Static-ID current binding by dynamicId')
    && has(scalabilityExplainSource, 'Group counter reconciliation scan (repair-only)');
  const hasGeneratedOutputPressureReport = has(packageSource, '"database:scalability:generated-output"')
    && has(generatedOutputPressureSource, 'static_body_read_candidates')
    && has(generatedOutputPressureSource, 'rss_text_read_candidates')
    && has(generatedOutputPressureSource, 'static_copy_candidates')
    && has(generatedOutputPressureSource, 'Repeated Text/JSON Bodies');
  const hasGeneratedOutputManifestPressure = hasGeneratedOutputPressureReport
    && has(generatedOutputPressureSource, 'Group Manifest Pressure')
    && has(generatedOutputPressureSource, 'GROUP_MANIFEST_INLINE_POSTS_LIMIT')
    && has(generatedOutputPressureSource, 'active_manifest_refs')
    && has(generatedOutputPressureSource, 'inlineReferenceLowerBoundBytes');
  const hasRestoredPressureGroupIdTarget = has(restoredPressureSource, 'RESTORED_GROUP_ID')
    && has(scalabilityTargetSource, 'FIXTURE_GROUP_ID')
    && has(scalabilityExplainSource, 'FIXTURE_GROUP_ID')
    && has(generatedOutputPressureSource, 'FIXTURE_GROUP_ID');
  const hasRestoredExplainOptionalProbes = has(scalabilityExplainSource, 'Skipped Probes')
    && has(scalabilityExplainSource, 'findTargetCategory')
    && has(scalabilityExplainSource, 'findSampleStaticBinding')
    && has(scalabilityExplainSource, 'findSampleContent');
  const hasActivityPubSourceFeed = has(activityPubSource, 'async function getActivityPubSourceFeed')
    && has(activityPubSource, 'getActivityPubSourceFeedWhere')
    && has(activityPubSource, 'remoteActorId: subscription.remoteActorId')
    && has(activityPubSource, 'helpers.getCursorListOrder(cursor, preparedListParams)')
    && has(activityPubSource, 'helpers.getCursorListOffset(cursor, preparedListParams.offset)')
    && has(activityPubSource, 'helpers.getNextListCursor(cursor, objectRows, preparedListParams.limit)');
  const hasActivityPubSourceFeedIndex = has(activityPubModelSource, 'activity_pub_objects_remote_actor_origin_published_idx')
    && has(activityPubModelSource, "fields: ['remoteActorId', 'origin', 'publishedAt', 'id']");

  return [
    {
      area: 'Large fixture benchmark',
      source: 'check/databaseScalabilityFixture.ts',
      hotspot: hasGeneratedOutputPressureReport ? 'database:scalability:fixture / explain / generated-output' : 'database:scalability:fixture / database:scalability:explain',
      observedPattern: hasLargeFixtureExplainHarness
        ? (hasGeneratedOutputPressureReport
          ? (hasRestoredPressureGroupIdTarget && hasRestoredExplainOptionalProbes
            ? 'seeds a 100k-post group fixture plus category, mixed image/text/json content metadata, attachment, quota, preview, and static-ID side rows, then emits current EXPLAIN ANALYZE probes and generated-output pressure signals against fixture/restored groups selected by name or id; optional category/content/static-ID probes are skipped when restored data lacks sample rows'
            : 'seeds a 100k-post group fixture plus category, mixed image/text/json content metadata, attachment, quota, preview, and static-ID side rows, then emits current EXPLAIN ANALYZE probes and generated-output pressure signals')
          : 'seeds a 100k-post group fixture plus category, attachment, quota, preview, and static-ID side rows, then emits EXPLAIN ANALYZE probes for timeline, unread, category, static/RSS, manifest, content-preview, quota, hot static-ID binding, and repair/fallback paths')
        : 'large fixture or EXPLAIN coverage is missing one or more documented hot-path probes',
      scalabilityRisk: hasLargeFixtureExplainHarness
        ? (hasGeneratedOutputPressureReport
          ? (hasRestoredPressureGroupIdTarget
            ? 'future index/query changes and generated-output body/copy pressure can be measured against production-scale fixture or a specific restored group id; generated reports remain intentionally uncommitted'
            : 'future index/query changes and generated-output body/copy pressure can be measured against production-scale fixture or restored data; generated reports remain intentionally uncommitted')
          : 'future index/query changes can be measured against production-scale fixture data instead of small test datasets; generated plan output remains intentionally uncommitted')
        : 'review conclusions can drift because large-table plans are not reproducible from repo-local commands',
    },
    {
      area: 'Generated output pressure',
      source: 'check/databaseGeneratedOutputPressure.ts',
      hotspot: 'database:scalability:generated-output',
      observedPattern: hasGeneratedOutputPressureReport
        ? (hasGeneratedOutputManifestPressure
          ? (hasRestoredPressureGroupIdTarget
            ? 'reports selected-post attachment rows, unique text/json body read candidates, RSS selected text reads, non-text storage copy candidates, and group-manifest inline/index pressure from a fixture/restored group selected by name or id'
            : 'reports selected-post attachment rows, unique text/json body read candidates, RSS selected text reads, non-text storage copy candidates, and group-manifest inline/index pressure from the fixture or a restored group')
          : 'reports selected-post attachment rows, unique text/json body read candidates, RSS selected text reads, and non-text storage copy candidates from the fixture or a restored group')
        : 'generated-output pressure measurement is missing',
      scalabilityRisk: hasGeneratedOutputPressureReport
        ? (hasGeneratedOutputManifestPressure
          ? 'the large-output follow-up can distinguish persisted-snippet pressure from cache tuning, storage-copy pressure, and large-manifest cutoff pressure before changing runtime defaults or adding schema'
          : 'the large-output follow-up can distinguish persisted-snippet pressure from cache tuning and storage-copy pressure before adding new schema')
        : 'persisted snippets or cache changes could be chosen without measuring whether repeated bodies, unique bodies, or media copies dominate',
    },
    {
      area: 'Timeline API',
      source: 'app/modules/group/index.ts',
      hotspot: 'getGroupPosts',
      observedPattern: hasTimelineIdFirstHydration
        ? (hasOptionalPostTotals
          ? 'keyset/cursor and legacy offset paths select page post IDs first, hydrate contents/reposts for the bounded page, and allow offset callers to skip totals'
          : 'keyset/cursor and legacy offset paths select page post IDs first, then hydrate contents/reposts for the bounded page')
        : (has(groupSource, 'nextCursor')
          ? 'keyset/cursor path exists, but findAll still includes contents/repost contents and legacy offset/count path remains'
          : (has(groupSource, 'include: [{association: \'contents\'') ? 'findAll with contents/repost contents include, total count, limit/offset' : 'review implementation')),
      scalabilityRisk: hasTimelineIdFirstHydration
        ? (hasOptionalPostTotals
          ? 'page selection avoids attachment joins; cursor pages and includeTotal=false skip counts, while default legacy offset callers can still request totals'
          : 'page selection avoids attachment joins; remaining risks are offset total counts and high-volume callers that request very large pages')
        : (has(groupSource, 'nextCursor')
          ? 'cursor avoids large offsets, but eager content/repost hydration can still fan out per page'
          : 'large offsets and eager content joins can scan/sort many rows before returning one page'),
    },
    {
      area: 'Global post listings',
      source: 'app/modules/group/index.ts',
      hotspot: 'getAllPosts',
      observedPattern: hasAllPostsIdFirstHydration
        ? (hasAllPostsCursorRefs
          ? 'selects cursor-aware page post refs first, then hydrates contents for the bounded page; exports can iterate lightweight refs in cursor batches'
          : 'selects page post IDs first, then hydrates contents for the bounded page')
        : (has(groupSource, 'async getAllPosts') ? 'findAll with contents include and limit/offset' : 'review implementation'),
      scalabilityRisk: hasAllPostsIdFirstHydration
        ? (hasAllPostsCursorRefs
          ? 'content joins no longer drive page selection; high-volume all-post scans can avoid offsets through cursor ref batches'
          : 'content joins no longer drive page selection, but all-group offset scans still need cursor/export projections for high-volume use')
        : 'same offset/content join risk across all groups',
    },
    {
      area: 'Unread counters',
      source: 'app/modules/group/index.ts',
      hotspot: 'getGroupUnreadPostsData',
      observedPattern: has(groupSource, 'publishedAfterCursorAt')
        ? 'count posts newer than the stored (readAt, readPostId) cursor when present, with readAt-only fallback'
        : (has(groupSource, 'publishedAtGt: groupRead.readAt') ? 'count posts newer than read cursor' : 'review implementation'),
      scalabilityRisk: has(groupSource, 'publishedAfterCursorAt') && has(read('app/modules/group/models/post.ts'), 'posts_group_timeline_idx')
        ? 'count is backed by the timeline index and can disambiguate same-timestamp posts; old readAt-only rows still use the legacy timestamp predicate'
        : (has(read('app/modules/group/models/post.ts'), 'posts_group_timeline_idx')
          ? 'count is backed by the timeline index, but read cursor remains timestamp-only'
          : 'count needs a composite post index on group/deleted/publishedAt'),
    },
    {
      area: 'Group manifest generation',
      source: 'app/modules/entityJsonManifest/index.ts',
      hotspot: 'generateGroupManifest',
      observedPattern: hasGroupManifestRefBatches
        ? (hasGroupManifestDeleteUnset && hasGroupManifestStatusUnset
          ? (hasGroupManifestPostIndexSidecar
            ? (hasGroupManifestChunkedOnlyOption
              ? (hasGroupManifestDurableCursor
                ? (hasGroupManifestDefaultInlineCutoff
                  ? 'loads the previous posts trie only for small/forced compatibility manifests, resumes changed/deleted/unpublished lightweight post refs from a durable group (updatedAt,id) cursor with same-timestamp overlap, unsets removed local IDs, dual-writes a paged post-index sidecar, and defaults large groups to chunked-only manifests above the inline cutoff'
                  : 'loads the previous posts trie for compatibility manifests, resumes changed/deleted/unpublished lightweight post refs from a durable group (updatedAt,id) cursor with same-timestamp overlap, unsets removed local IDs, dual-writes a paged post-index sidecar, and can publish chunked-only manifests through an explicit option or count limit')
                : 'loads the previous posts trie for compatibility manifests, scans changed/deleted/unpublished lightweight post refs in (updatedAt,id) cursor batches, unsets removed local IDs, dual-writes a paged post-index sidecar, and can publish chunked-only manifests through an explicit option or count limit')
              : 'loads the previous posts trie, scans changed/deleted/unpublished lightweight post refs in (updatedAt,id) cursor batches, unsets removed local IDs, and dual-writes a paged post-index sidecar')
            : 'loads the previous posts trie, scans changed/deleted/unpublished lightweight post refs in (updatedAt,id) cursor batches, then unsets removed local IDs')
          : (hasGroupManifestDeleteUnset
            ? 'loads the previous posts trie, scans changed/deleted lightweight post refs in (updatedAt,id) cursor batches, then unsets deleted local IDs'
            : 'loads the previous posts trie and scans changed lightweight post refs in (updatedAt,id) cursor batches'))
        : (hasGroupManifestPostRefs
          ? (hasGroupManifestDeleteUnset
            ? 'loads the previous posts trie, scans changed lightweight post refs and changed deleted refs, then unsets deleted local IDs'
            : 'loads the previous posts trie and scans changed lightweight post refs')
          : (has(manifestSource, 'limit: 9999999') ? 'loads effectively all matching group posts' : 'review implementation')),
      scalabilityRisk: hasGroupManifestRefBatches
        ? (hasGroupManifestPostIndexSidecar
          ? (hasGroupManifestChunkedOnlyOption
              ? (hasGroupManifestDurableCursor
                ? (hasGroupManifestDefaultInlineCutoff
                  ? (hasGroupDerivedStateDefaultQueue
                    ? 'content/repost hydration, timestamp-only watermarks, and large changed-ref windows are avoided; large groups default to chunked-only manifests above the inline cutoff, and post/group manifest rebuilds now default through a bounded durable worker queue with explicit env/test opt-outs; larger restored-data reruns, static delivery status, and page-worker tuning still need follow-up'
                    : (hasGroupDerivedStateAsyncRehearsal
                    ? 'content/repost hydration, timestamp-only watermarks, and large changed-ref windows are avoided; large groups default to chunked-only manifests above the inline cutoff, and post/group manifest rebuilds can enter a bounded durable worker queue with a guarded restored-data async rehearsal command; default-on rollout, static delivery status, and page-worker tuning still need follow-up'
                    : (hasGroupDerivedStateWorkerPolicy
                      ? 'content/repost hydration, timestamp-only watermarks, and large changed-ref windows are avoided; large groups default to chunked-only manifests above the inline cutoff, and post/group manifest rebuilds can enter a bounded durable worker queue; restored-data async rehearsal, default-on rollout, static delivery status, and page-worker tuning still need follow-up'
                    : (hasGroupDerivedStateQueue
                      ? 'content/repost hydration, timestamp-only watermarks, and large changed-ref windows are avoided; large groups default to chunked-only manifests above the inline cutoff, and post/group manifest rebuilds can enter an opt-in durable derived-state queue; default queue rollout, static delivery status, and page-worker tuning still need follow-up'
                      : 'content/repost hydration, timestamp-only watermarks, and large changed-ref windows are avoided; large groups default to chunked-only manifests above the inline cutoff, while async/page-update workers still need follow-up'))))
                  : 'content/repost hydration, timestamp-only watermarks, and large changed-ref windows are avoided; large groups can avoid the legacy inline trie when enabled, while default chunked-only rollout and page-level incremental updates still need follow-up')
                : 'content/repost hydration and large changed-ref windows are avoided; large groups can avoid the legacy inline trie when enabled, while default compatibility manifests and durable generation cursors still need follow-up')
            : 'content/repost hydration and large changed-ref windows are avoided; remote import can consume paged post indexes, but generation still keeps the legacy inline trie until old consumers can tolerate chunked-only manifests')
          : 'content/repost hydration and large changed-ref windows are avoided; rebuild still loads/copies the previous posts trie and rewrites a monolithic manifest')
        : (hasGroupManifestPostRefs
          ? 'content/repost hydration is avoided for manifest refs, but rebuild still materializes large ref windows and rewrites a monolithic manifest'
          : (has(read('app/modules/group/models/post.ts'), 'posts_group_manifest_cursor_idx')
            ? 'manifest cursor index exists, but rebuild still materializes large post sets and rewrites a monolithic manifest'
            : 'manifest rebuilds can become full-table scans and large memory spikes')),
    },
    {
      area: 'Post visibility',
      source: 'app/modules/group/index.ts',
      hotspot: 'getPostsWhere defaults',
      observedPattern: has(groupSource, "where['status'] = PostStatus.Published")
        ? 'C1: default filter isDeleted=false AND status=Published; admin override via includeAllStatuses/status/statusIn'
        : (has(groupSource, 'const where = {\n\t\t\t\tisDeleted: false') ? 'default filter isDeleted=false only' : 'review default post filters'),
      scalabilityRisk: has(groupSource, "where['status'] = PostStatus.Published")
        ? 'published default is in place; remaining risk is accidental admin override use in public/generated paths'
        : 'draft/queued posts can leak into public/feed/generated paths unless every caller adds status=published',
    },
    {
      area: 'Post writes',
      source: 'app/modules/group/index.ts',
      hotspot: 'createPost / updatePost / deletePosts',
      observedPattern: hasCanonicalPostDbTransaction
        ? (hasPostStatusCounterReconcile
          ? 'canonical create/update/delete DB state is wrapped in transactions: localId allocation, post row, attachments, tombstone flag, size, group counters, and shared reply/repost counter repair including status boundary changes'
          : 'canonical create/update/delete DB state is wrapped in transactions: localId allocation, post row, attachments, tombstone flag, size, reply/repost counts, and group counters')
        : (hasPostWriteTransaction
          ? 'canonical create/update DB state is wrapped in one transaction; delete/import transitions still need transaction boundaries'
          : 'post create/update run localId allocation, post rows, attachments, size, and counters as separate statements'),
      scalabilityRisk: hasCanonicalPostDbTransaction
        ? (hasPostStatusCounterReconcile
          ? (hasSocialImportRelationCounterUpsertTest && hasSocialImportGroupCounterUpsertTest && hasSocialImportStatusLifecycleTest && hasSocialImportDeleteLifecycleTest && hasGroupCounterRepairTest
            ? (hasGroupDerivedStateDefaultQueue
              ? 'canonical post DB partial-state risk is reduced; source-identity upserts cover relation/group counters plus draft/unpublish/delete reconciliation, with group counter repair drift coverage; post/group manifest rebuilding now defaults to the durable queue, while larger restored-data reruns and static delivery job status still need follow-up'
              : (hasGroupDerivedStateAsyncRehearsal
              ? 'canonical post DB partial-state risk is reduced; source-identity upserts cover relation/group counters plus draft/unpublish/delete reconciliation, with group counter repair drift coverage; post/group manifest rebuilding can now use an opt-in durable queue with a guarded restored-data async rehearsal command, while default sync rollout and static delivery job status still need follow-up'
              : (hasGroupDerivedStateQueue
                ? 'canonical post DB partial-state risk is reduced; source-identity upserts cover relation/group counters plus draft/unpublish/delete reconciliation, with group counter repair drift coverage; post/group manifest rebuilding can now use an opt-in durable queue, while default sync rollout and static delivery job status still need follow-up'
              : 'canonical post DB partial-state risk is reduced; source-identity upserts cover relation/group counters plus draft/unpublish/delete reconciliation, with group counter repair drift coverage; manifest/static derived work still needs transaction/job boundaries')))
            : (hasSocialImportRelationCounterUpsertTest && hasSocialImportGroupCounterUpsertTest && hasSocialImportStatusLifecycleTest && hasGroupCounterRepairTest
              ? 'canonical post DB partial-state risk is reduced; source-identity upserts cover relation/group counters and draft/unpublish reconciliation, with group counter repair drift coverage; delete tombstone policy and manifest/static derived work still need transaction/job boundaries'
            : (hasSocialImportRelationCounterUpsertTest && hasSocialImportGroupCounterUpsertTest && hasGroupCounterRepairTest
              ? 'canonical post DB partial-state risk is reduced; relation and group counters have source-identity upsert coverage plus group counter repair drift coverage, while remote delete/edit tombstones and manifest/static derived work still need transaction/job boundaries'
            : (hasSocialImportRelationCounterUpsertTest && hasSocialImportGroupCounterUpsertTest
              ? 'canonical post DB partial-state risk is reduced; relation and group counters have source-identity upsert coverage, while remote delete/edit tombstones and manifest/static derived work still need transaction/job boundaries'
              : 'canonical post DB partial-state risk is reduced and relation counters have a reusable repair helper; import/upsert lifecycle semantics and manifest/static derived work still need transaction/job boundaries'))))
          : 'canonical post DB partial-state risk is reduced; status/import/upsert transitions and manifest/static derived work still need transaction/job boundaries')
        : (hasPostWriteTransaction
          ? 'create/update partial DB state risk is reduced; delete/import transitions and manifest/static derived work still need transaction/job boundaries'
          : 'failures can leave partial post rows, attachment rows, counters, or skipped local IDs under load/retries'),
    },
    {
      area: 'Post event ledger',
      source: 'app/modules/group/index.ts',
      hotspot: 'post and source-identity import lifecycle',
      observedPattern: hasPostLifecycleEvents
        ? (hasSourceImportPostEvents
          ? 'ordinary post create/update/delete and source-identity create/update/delete transitions append PostEvent rows inside the post DB transaction'
          : 'ordinary post create/update/delete transitions append PostEvent rows inside the post DB transaction; source import events still need coverage')
        : (hasSourceImportPostEvents
          ? 'source-identity create/update/delete transitions append PostEvent rows inside the post DB transaction'
          : 'post and source-identity import lifecycle is represented only by the latest mutable Post row'),
      scalabilityRisk: hasPostLifecycleEvents
        ? (hasSourceImportPostEvents
          ? 'post and remote import replay/audit risk is reduced for canonical writes; derived manifest/static job events, delivery state, and richer revision payloads remain future work'
          : 'post replay/audit risk is reduced for canonical writes; remote import tombstone replay plus derived manifest/static job events remain future work')
        : (hasSourceImportPostEvents
          ? 'remote import tombstone replay/audit risk is reduced for source-identity upserts; the broader post revision/event model and derived manifest jobs remain future work'
          : 'remote import deletes and edits cannot be replayed or audited beyond current mutable row state'),
    },
    {
      area: 'ActivityPub source feed',
      source: 'app/modules/activityPub/index.ts',
      hotspot: 'getActivityPubSourceFeed',
      observedPattern: hasActivityPubSourceFeed
        ? 'selects cached remote ActivityPub objects by subscribed remoteActorId/origin with cursor-aware bounded pagination, deterministic id tiebreaker, optional count skipping, and sanitized preview projection reuse'
        : 'review source feed implementation',
      scalabilityRisk: hasActivityPubSourceFeedIndex
        ? 'default source feed pages can use the remoteActorId/origin/publishedAt/id index and cursor pages avoid large offsets/counts; future live timeline backfill still needs bounded fetch/queue policy'
        : 'source feeds can scan the growing ActivityPub object cache without a remote actor list index',
    },
    {
      area: 'Static site rendering',
      source: 'app/modules/staticSiteGenerator/index.ts',
      hotspot: hasStaticSiteStreamingRender ? 'renderGroupPostBatchPages' : 'prepareGroupPostsForRender',
      observedPattern: hasStaticSitePostRefBatches
        ? (hasStaticSiteStreamingRender
          ? (hasStaticSiteBodyCache
            ? 'scans lightweight post refs in cursor batches, uses an exact capped render count for pages, streams SSR through current page/post state, and reuses bounded per-render text/json body and post-object caches'
            : 'scans lightweight post refs in cursor batches, uses an exact capped render count for pages, and streams SSR through current page/post state instead of materializing one final posts array')
          : (hasStaticSiteAvailableCount
            ? 'scans lightweight post refs in cursor batches, uses availablePostsCount for rendered totals, then hydrates and renders each bounded batch'
            : 'scans lightweight post refs in cursor batches, then hydrates and renders each bounded batch'))
        : (has(staticSiteSource, 'limit: 9999') ? 'loads up to 9999 posts with contents before rendering pages' : 'review implementation'),
      scalabilityRisk: hasStaticSitePostRefBatches
        ? (hasStaticSiteStreamingRender
          ? (hasStaticSiteBodyCache
            ? 'DB hydration and final SSR post data are page-scoped; repeated text/json body reads and repeated reply/repost object conversion are cached within one render without retaining the whole site; remaining large-output pressure is media copy work and genuinely unique post bodies'
            : 'DB hydration and final SSR post data are page-scoped; remaining large-output pressure is storage body reads and media copy work')
          : (hasStaticSiteAvailableCount
            ? 'large exports still materialize final render data and copy content, but DB hydration is page-scoped and public totals no longer expose the local-ID high-water mark'
            : 'large exports still materialize final render data and copy content, but DB hydration is page-scoped'))
        : 'bounded but still heavy for media-rich groups; should batch IDs and contents',
    },
    {
      area: 'RSS rendering',
      source: 'app/modules/rss/index.ts',
      hotspot: 'groupRss',
      observedPattern: hasRssPostRefs
        ? (hasRssFeedWindowPolicy
          ? 'defaults RSS to a smaller feed window, caps explicit archive reads at the legacy maximum, scans lightweight post refs in cursor batches, then hydrates selected feed batches'
          : 'scans lightweight post refs in cursor batches, then hydrates selected feed batches')
        : (has(rssSource, 'limit: 9999') ? 'loads up to 9999 posts with contents for feed generation' : 'review implementation'),
      scalabilityRisk: hasRssPostRefs
        ? (hasRssContentProjection
          ? (hasRssFeedWindowPolicy
            ? (hasRssBodyCache
              ? 'default feed generation avoids totals, avoids the old 9999-item window, uses feed batches, reads only the selected feed text body, leaves JSON/non-feed text as metadata, and reuses a bounded feed-local body cache'
              : 'default feed generation avoids totals, avoids the old 9999-item window, uses feed batches, and reads only the selected feed text body while leaving JSON/non-feed text as metadata')
            : (hasRssBodyCache
              ? 'feed generation avoids totals, uses feed batches, reads only the selected feed text body, leaves JSON/non-feed text as metadata, and reuses a bounded feed-local body cache'
              : 'feed generation avoids totals, uses feed batches, and reads only the selected feed text body while leaving JSON/non-feed text as metadata'))
          : 'feed generation avoids total counts and the previous 9999-row hydration query; body extraction still reads selected content files')
        : 'feeds should cap lower or use a feed-specific projection',
    },
    {
      area: 'Social import reversal',
      source: 'app/modules/socNetImport/index.ts',
      hotspot: 'reverse-post import path',
      observedPattern: hasSocialImportPostRefBatches
        ? 'uses lightweight group post refs in (publishedAt,id) cursor batches'
        : (hasSocialImportPostRefs
        ? 'uses lightweight group post refs with idGte filter'
        : (has(importSource, 'idGte: startReverseMessage.postId') ? 'uses getGroupPosts with idGte filter' : 'review implementation')),
      scalabilityRisk: hasSocialImportPostRefBatches
        ? 'reversal avoids content/repost hydration and avoids the previous fixed 10000-row window; localId updates still run row-by-row'
        : (hasSocialImportPostRefs
        ? 'reversal avoids content/repost hydration; remaining risk is the large fixed window before true cursor batching'
        : (hasTimelineIdFirstHydration
        ? 'reversal scans now inherit page-scoped hydration, but should still use purpose-built groupId/id cursor scans when content is not needed'
        : 'reversal scans should use groupId/id index and avoid content joins until needed')),
    },
    {
      area: 'Remote post import',
      source: 'app/modules/remoteGroup/index.ts',
      hotspot: 'createPostByRemoteStorageId',
      observedPattern: hasRemotePostManifestImportState
        ? (hasRemotePostManifestIdempotency
          ? (hasRemoteGroupManifestPostImport
            ? (hasRemoteGroupManifestReplay
              ? 'remote group manifests compare manifest refs against active local refs, tombstone removed/replaced refs while freeing reused remote local IDs, import missing refs idempotently, preserve manifest local IDs, and skip already-complete groups; remote post manifests preserve source/date fields, claim content manifests into actor-scoped rows, reuse an active same-group manifest row on retry while refreshing the group manifest, and create new local remote posts through the canonical post DB transaction'
              : 'remote group manifests import missing post refs idempotently, preserve manifest local IDs, and skip already-complete groups, while remote post manifests preserve source/date fields, claim content manifests into actor-scoped rows, reuse an active same-group manifest row on retry while refreshing the group manifest, and create new local remote posts through the canonical post DB transaction')
            : 'remote post manifests preserve source/date fields, claim content manifests into actor-scoped rows, reuse an active same-group manifest row on retry while refreshing the group manifest, and create new local remote posts through the canonical post DB transaction')
          : 'remote post manifests preserve source/date fields, claim content manifests into actor-scoped rows, and create the local remote post through the canonical post DB transaction')
        : 'remote post manifest import bypasses at least part of the canonical post DB transaction or lacks source/date/content regression coverage',
      scalabilityRisk: hasRemotePostManifestImportState
        ? (hasRemotePostManifestIdempotency
          ? (hasRemoteGroupManifestPostImport
            ? (hasRemoteGroupManifestReplay
              ? (hasGroupManifestPostIndexSidecar
                ? (hasGroupManifestChunkedOnlyOption
                  ? (hasGroupDerivedStateDefaultQueue
                    ? 'remote manifest imports now get localId, attachment, counter, group-manifest, post-event, same-manifest retry, group-manifest post iteration, chunked-only post-index coverage, remote edit/delete replay state, and default queued post/group manifest retries consistently; remaining risk is larger restored-data reruns and static delivery job status'
                    : (hasGroupDerivedStateAsyncRehearsal
                    ? 'remote manifest imports now get localId, attachment, counter, group-manifest, post-event, same-manifest retry, group-manifest post iteration, chunked-only post-index coverage, remote edit/delete replay state, and bounded queued post/group manifest retries consistently; remaining risk is default-on rollout and static delivery job status'
                    : (hasGroupDerivedStateWorkerPolicy
                      ? 'remote manifest imports now get localId, attachment, counter, group-manifest, post-event, same-manifest retry, group-manifest post iteration, chunked-only post-index coverage, remote edit/delete replay state, and bounded queued post/group manifest retries consistently; remaining risk is restored-data async rehearsal, default-on rollout, and static delivery job status'
                    : (hasGroupDerivedStateQueue
                      ? 'remote manifest imports now get localId, attachment, counter, group-manifest, post-event, same-manifest retry, group-manifest post iteration, chunked-only post-index coverage, remote edit/delete replay state, and opt-in queued post/group manifest retries consistently; remaining risk is default async rollout and static delivery job status'
                      : 'remote manifest imports now get localId, attachment, counter, group-manifest, post-event, same-manifest retry, group-manifest post iteration, chunked-only post-index coverage, and remote edit/delete replay state consistently; remaining risk is async derived-state retries and durable generation state'))))
                  : 'remote manifest imports now get localId, attachment, counter, group-manifest, post-event, same-manifest retry, group-manifest post iteration, chunked post-index fallback, and remote edit/delete replay state consistently; remaining risk is async derived-state retries and retiring the legacy inline trie for large groups')
                : 'remote manifest imports now get localId, attachment, counter, group-manifest, post-event, same-manifest retry, group-manifest post iteration, and remote edit/delete replay state consistently; remaining risk is async derived-state retries and chunked manifest indexes')
              : 'remote manifest imports now get localId, attachment, counter, group-manifest, post-event, same-manifest retry, and group-manifest post iteration state consistently; remote edit/delete replay remains future work')
            : 'remote manifest imports now get localId, attachment, counter, group-manifest, post-event, and same-manifest retry state consistently; remote edit/delete replay remains future work')
          : 'remote manifest imports now get localId, attachment, counter, group-manifest, and post-event state consistently; duplicate manifest idempotency and remote edit/delete replay remain future work')
        : 'remote manifest imports can drift from canonical post counters/events or lose source/date metadata under large import/retry workflows',
    },
    {
      area: 'Category feeds',
      source: 'app/modules/groupCategory/index.ts',
      hotspot: 'getCategoryPosts',
      observedPattern: hasCategoryCursor
        ? (hasOptionalPostTotals
          ? 'joins group/category pivots only for page post ID selection, supports (publishedAt,id) cursor pages and includeTotal=false offset pages, then hydrates contents/group for the bounded page'
          : 'joins group/category pivots only for page post ID selection, supports (publishedAt,id) cursor pages, then hydrates contents/group for the bounded page')
        : (hasCategoryIdFirstHydration
        ? 'joins group/category pivots only for page post ID selection, then hydrates contents/group for the bounded page'
        : (has(categorySource, "association: 'categories'") ? 'joins posts through group categories with contents include and limit/offset' : 'review implementation')),
      scalabilityRisk: hasCategoryCursor
        ? (hasOptionalPostTotals
          ? 'cursor pages and explicit includeTotal=false offset pages skip counts; legacy offset callers still pay count/offset cost by default'
          : 'cursor pages skip total counts and avoid large offsets; legacy offset callers still pay count/offset cost')
        : (hasCategoryIdFirstHydration
        ? 'content joins no longer drive category page selection; pivot indexes are present, while offset/count cost and cursor migration remain open'
        : 'category feeds inherit timeline pagination/content hydration risks plus pivot-table join costs'),
    },
    {
      area: 'Content preview serving',
      source: 'app/modules/database/index.ts',
      hotspot: 'getContentByStorageId(findByPreviews)',
      observedPattern: hasDeterministicSharedContentLookup
        ? (hasOwnerlessContentCreateGuard
          ? (hasPublicContentMetadataPolicy
            ? (hasStorageObjectRegistry
              ? (hasStorageObjectIdentity
                ? (hasContentManifestStorageObjectIdentityProducer
                  ? (hasStorageObjectIdentityLookup
                    ? 'legacy/global manifest lookups still use deterministic content helpers, ownerless imports can only reuse existing shared rows, public metadata is projected, content writes maintain a storageObject registry row, storageObject can carry ownerless/federated identity metadata, remote content manifest imports seed GeeSome manifest identity there, identity-pair lookup is available for policy-specific callers, and shared storage/header reads prefer storageObject metadata with Content fallback'
                    : 'legacy/global manifest lookups still use deterministic content helpers, ownerless imports can only reuse existing shared rows, public metadata is projected, content writes maintain a storageObject registry row, storageObject can carry ownerless/federated identity metadata, remote content manifest imports seed GeeSome manifest identity there, and shared storage/header reads prefer storageObject metadata with Content fallback')
                  : 'legacy/global manifest lookups still use deterministic content helpers, ownerless imports can only reuse existing shared rows, public metadata is projected, content writes maintain a storageObject registry row, storageObject can carry ownerless/federated identity metadata, and shared storage/header reads prefer storageObject metadata with Content fallback')
                : 'legacy/global manifest lookups still use deterministic content helpers, ownerless imports can only reuse existing shared rows, public metadata is projected, content writes maintain a storageObject registry row, and shared storage/header reads prefer storageObject metadata with Content fallback')
              : 'legacy/global storage and manifest lookups delegate to deterministic shared helpers, ownerless imports can only reuse existing shared rows, public metadata is projected, and preview mode still ORs across storageId and preview storage ids')
            : 'legacy/global storage and manifest lookups delegate to deterministic shared helpers, ownerless imports can only reuse existing shared rows, and preview mode still ORs across storageId and preview storage ids')
          : 'legacy/global storage and manifest lookups delegate to deterministic shared helpers; preview mode still ORs across storageId and preview storage ids')
        : (has(databaseSource, 'largePreviewStorageId') ? 'OR lookup across storageId and preview storage ids' : 'review preview lookup path'),
      scalabilityRisk: has(read('app/modules/database/models/content.ts'), 'contents_large_preview_storage_idx')
        ? (hasDeterministicSharedContentLookup
          ? (hasOwnerlessContentCreateGuard
            ? (hasPublicContentMetadataPolicy
              ? (hasStorageObjectRegistry
                ? (hasStorageObjectIdentity
                  ? (hasContentManifestStorageObjectIdentityProducer
                    ? (hasStorageObjectIdentityLookup
                      ? 'shared reads are stable across duplicate user-owned rows, no longer create new ownerless library rows, public metadata hides private DB rows, ownerless/federated identities can live on StorageObject, GeeSome content manifests now seed that identity without ownerless Content rows, policy-specific callers can resolve canonical rows by identity pair, and shared serving prefers canonical physical metadata while preserving old-row fallback'
                      : 'shared reads are stable across duplicate user-owned rows, no longer create new ownerless library rows, public metadata hides private DB rows, ownerless/federated identities can live on StorageObject, GeeSome content manifests now seed that identity without ownerless Content rows, and shared serving prefers canonical physical metadata while preserving old-row fallback')
                    : 'shared reads are stable across duplicate user-owned rows, no longer create new ownerless library rows, public metadata hides private DB rows, ownerless/federated identities can live on StorageObject, and shared serving now prefers canonical physical metadata while preserving old-row fallback')
                  : 'shared reads are stable across duplicate user-owned rows, no longer create new ownerless library rows, public metadata hides private DB rows, and shared serving now prefers canonical physical metadata while preserving old-row fallback')
                : 'shared reads are stable across duplicate user-owned rows, no longer create new ownerless library rows, and the public metadata route no longer exposes private rows by DB id; shared reads still rely on user-library metadata until canonical asset metadata exists')
              : 'shared reads are stable across duplicate user-owned rows and no longer create new ownerless library rows, but they still read user-library metadata until canonical asset metadata exists')
            : 'shared reads are stable across duplicate user-owned rows, but they still read user-library metadata until canonical asset metadata exists')
          : 'preview columns are indexed, but public/header serving still reads across user-owned rows instead of canonical asset metadata')
        : 'preview/header serving can scan contents without preview-column indexes or canonical asset metadata',
    },
    {
      area: 'Content deletion',
      source: 'app/modules/database/index.ts + app/modules/fileCatalog/index.ts',
      hotspot: 'deleteFileCatalogItem deleteContent',
      observedPattern: applyContentSoftDeletePolicy(hasContentDeleteSafetyHelper
        ? (hasPinnedContentDeleteGuard
          ? (hasDerivedStorageDeleteGuard
            ? (hasStorageObjectChildReferenceGuard
              ? (hasPinStorageObjectLedger
                ? 'destroys catalog item first; only destroys content/physical storage after DB reference checks, exposing content/storage blocker reasons for future delayed-GC or operator reporting; checks include all known derived storage columns/current static-ID refs, visible generated-output child refs, canonical local pin state, and recorded remote pin refs'
                : 'destroys catalog item first; only destroys content/physical storage after DB reference checks, exposing content/storage blocker reasons for future delayed-GC or operator reporting; checks include all known derived storage columns/current static-ID refs, visible generated-output child refs, plus successful remote pins marked on StorageObject.isPinned and Content.isPinned')
              : (hasPinStorageObjectLedger
                ? 'destroys catalog item first; only destroys content/physical storage after DB reference checks, exposing content/storage blocker reasons for future delayed-GC or operator reporting; checks include all known derived storage columns/current static-ID refs, canonical local pin state, and recorded remote pin refs'
                : 'destroys catalog item first; only destroys content/physical storage after DB reference checks, exposing content/storage blocker reasons for future delayed-GC or operator reporting; checks include all known derived storage columns/current static-ID refs plus successful remote pins marked on StorageObject.isPinned and Content.isPinned'))
            : (hasPinStorageObjectLedger
              ? 'destroys catalog item first; only destroys content/physical storage after DB reference checks, exposing blocker reasons for future delayed-GC or operator reporting; checks include canonical local pin state and recorded remote pin refs'
              : 'destroys catalog item first; only destroys content/physical storage after DB reference checks, exposing blocker reasons for future delayed-GC or operator reporting; checks include successful remote pins marked on StorageObject.isPinned and Content.isPinned'))
          : 'destroys catalog item first; only destroys content/physical storage after DB reference checks')
        : (has(fileCatalogSource, 'storage.remove(content.storageId)') ? 'unpin/remove physical storage and destroy content row' : 'review deleteContent path'),
        hasContentSoftDeletePolicy),
      scalabilityRisk: applyContentSoftDeletePolicy(hasContentDeleteSafetyHelper
        ? (hasPinnedContentDeleteGuard
          ? (hasDerivedStorageDeleteGuard
            ? (hasStorageObjectChildReferenceGuard
              ? (hasRecursiveStorageSpaceGeneratedOutputChildRefs
                ? (hasPinStorageObjectLedger
                  ? 'same-storage, preview, known DB-visible derived storage columns, current static-ID refs, canonical local pin state, recorded remote pin refs, and durable generated-output child refs with still-visible source ancestors are covered; async garbage collection still needs a fuller lifecycle'
                  : 'same-storage, preview, known DB-visible derived storage columns, current static-ID refs, canonical local pin state, and durable generated-output child refs with still-visible source ancestors are covered; remote pin reconciliation and async garbage collection still need a fuller lifecycle')
                : (hasPinStorageObjectLedger
                  ? 'same-storage, preview, known DB-visible derived storage columns, current static-ID refs, canonical local pin state, recorded remote pin refs, and durable generated-output child refs with still-visible source parents are covered; deeper recursive DAG traversal and async garbage collection still need a fuller lifecycle'
                  : 'same-storage, preview, known DB-visible derived storage columns, current static-ID refs, canonical local pin state, and durable generated-output child refs with still-visible source parents are covered; deeper recursive DAG traversal, remote pin reconciliation, and async garbage collection still need a fuller lifecycle'))
              : (hasPinStorageObjectLedger
                ? 'same-storage, preview, known DB-visible derived storage columns, current static-ID refs, canonical local pin state, and recorded remote pin refs are covered; IPFS DAG child refs inside generated output and async garbage collection still need a fuller lifecycle'
                : 'same-storage, preview, known DB-visible derived storage columns, current static-ID refs, and canonical local pin state are covered; IPFS DAG child refs inside generated output, remote pin reconciliation, and async garbage collection still need a fuller lifecycle'))
            : (hasPinStorageObjectLedger
              ? 'DB row references, canonical local pin state, and recorded remote pin refs are covered; generated output and async garbage collection still need a fuller lifecycle'
              : 'DB row references and canonical local pin state are covered; generated output, remote pin reconciliation, and async garbage collection still need a fuller lifecycle'))
            : 'DB row references are covered; generated output, durable pin state, and async garbage collection still need a fuller lifecycle')
        : 'same storageId rows, post attachments, generated output, and pins need reference checks before physical deletion',
        hasContentSoftDeletePolicy),
    },
    {
      area: 'Storage space analysis',
      source: 'app/modules/storageSpace/queryHelpers.ts + app/modules/storageSpace/storageInspectionHelpers.ts + app/modules/storageSpace/api.ts + app/modules/database/models/storageSpaceSnapshot.ts',
      hotspot: 'storage analyzer aggregate helpers',
      observedPattern: applyStorageSpaceActiveContentPolicy(hasStorageSpaceUsageHelpers
        ? (hasStorageSpaceApi
          ? (hasStorageSpaceSnapshots
            ? (hasStorageSpaceGeneratedOutputs
              ? (hasStorageSpaceSnapshotProgress
                ? (hasStorageSpaceGeneratedOutputInspection
                  ? (hasStorageSpaceGeneratedOutputReconcile
                    ? (hasStorageSpaceSharedStorageIds
                      ? (hasStorageSpacePinnedStorageObjects
                        ? (hasStorageSpacePreviewStorage
                          ? (hasStorageSpaceCleanupBlockers
                            ? (hasStorageSpaceGeneratedOutputChildRefs
                              ? (hasRecursiveStorageSpaceGeneratedOutputChildRefs
                                ? (hasPinStorageObjectLedger
                                  ? (hasStorageSpaceAvailabilitySignals
                                    ? (hasStorageSpaceAvailabilityNetworkEvidence
                                      ? 'read-only helpers, AdminRead API routes, model-sync cached snapshots, file-catalog folder, group-post, generated-output source, shared-storage, pinned-object, preview-storage, availability-signal, on-demand availability-network inspection, persisted availability-network sample summary, restored-report availability evidence, on-demand cleanup-blocker, and generated-output child-ref drilldowns plus bounded generated-ref/recursive-child storage inspection and AdminAll metadata/reference reconciliation expose staged progress while reporting overview totals, MIME/type breakdowns, largest content rows, largest catalog files/folders, largest groups, largest published posts, DB-visible generated/static refs, duplicate/shared storage IDs, pinned StorageObject refs, remote pin refs, DB-visible availability/popularity signals, live provider/stat samples, cached sample summaries, preview/thumbnail overhead, cleanup safety blockers, persisted StorageObject bytes for measured generated refs, and durable DAG child refs'
                                      : 'read-only helpers, AdminRead API routes, model-sync cached snapshots, file-catalog folder, group-post, generated-output source, shared-storage, pinned-object, preview-storage, availability-signal, on-demand cleanup-blocker, and generated-output child-ref drilldowns plus bounded generated-ref/recursive-child storage inspection and AdminAll metadata/reference reconciliation expose staged progress while reporting overview totals, MIME/type breakdowns, largest content rows, largest catalog files/folders, largest groups, largest published posts, DB-visible generated/static refs, duplicate/shared storage IDs, pinned StorageObject refs, remote pin refs, DB-visible availability/popularity signals, preview/thumbnail overhead, cleanup safety blockers, persisted StorageObject bytes for measured generated refs, and durable DAG child refs; cached provider/retrieval sample summaries or restored-report availability evidence remain')
                                    : 'read-only helpers, AdminRead API routes, model-sync cached snapshots, file-catalog folder, group-post, generated-output source, shared-storage, pinned-object, preview-storage, on-demand cleanup-blocker, and generated-output child-ref drilldowns plus bounded generated-ref/recursive-child storage inspection and AdminAll metadata/reference reconciliation expose staged progress while reporting overview totals, MIME/type breakdowns, largest content rows, largest catalog files/folders, largest groups, largest published posts, DB-visible generated/static refs, duplicate/shared storage IDs, pinned StorageObject refs, remote pin refs, preview/thumbnail overhead, cleanup safety blockers, persisted StorageObject bytes for measured generated refs, and durable DAG child refs')
                                  : 'read-only helpers, AdminRead API routes, model-sync cached snapshots, file-catalog folder, group-post, generated-output source, shared-storage, pinned-object, preview-storage, on-demand cleanup-blocker, and generated-output child-ref drilldowns plus bounded generated-ref/recursive-child storage inspection and AdminAll metadata/reference reconciliation expose staged progress while reporting overview totals, MIME/type breakdowns, largest content rows, largest catalog files/folders, largest groups, largest published posts, DB-visible generated/static refs, duplicate/shared storage IDs, pinned StorageObject refs, preview/thumbnail overhead, cleanup safety blockers, persisted StorageObject bytes for measured generated refs, and durable DAG child refs')
                                : 'read-only helpers, AdminRead API routes, model-sync cached snapshots, file-catalog folder, group-post, generated-output source, shared-storage, pinned-object, preview-storage, on-demand cleanup-blocker, and generated-output child-ref drilldowns plus bounded generated-ref/child storage inspection and AdminAll metadata/reference reconciliation expose staged progress while reporting overview totals, MIME/type breakdowns, largest content rows, largest catalog files/folders, largest groups, largest published posts, DB-visible generated/static refs, duplicate/shared storage IDs, pinned StorageObject refs, preview/thumbnail overhead, cleanup safety blockers, persisted StorageObject bytes for measured generated refs, and durable immediate DAG child refs')
                              : 'read-only helpers, AdminRead API routes, model-sync cached snapshots, file-catalog folder, group-post, generated-output source, shared-storage, pinned-object, preview-storage, and on-demand cleanup-blocker drilldowns plus bounded generated-ref storage inspection and AdminAll metadata reconciliation expose staged progress while reporting overview totals, MIME/type breakdowns, largest content rows, largest catalog files/folders, largest groups, largest published posts, DB-visible generated/static refs, duplicate/shared storage IDs, pinned StorageObject refs, preview/thumbnail overhead, cleanup safety blockers, and persisted StorageObject bytes for measured generated refs')
                            : 'read-only helpers, AdminRead API routes, model-sync cached snapshots, file-catalog folder, group-post, generated-output source, shared-storage, pinned-object, and preview-storage drilldowns plus bounded generated-ref storage inspection and AdminAll metadata reconciliation expose staged progress while reporting overview totals, MIME/type breakdowns, largest content rows, largest catalog files/folders, largest groups, largest published posts, DB-visible generated/static refs, duplicate/shared storage IDs, pinned StorageObject refs, preview/thumbnail overhead, and persisted StorageObject bytes for measured generated refs')
                          : 'read-only helpers, AdminRead API routes, model-sync cached snapshots, file-catalog folder, group-post, generated-output source, shared-storage, and pinned-object drilldowns plus bounded generated-ref storage inspection and AdminAll metadata reconciliation expose staged progress while reporting overview totals, MIME/type breakdowns, largest content rows, largest catalog files/folders, largest groups, largest published posts, DB-visible generated/static refs, duplicate/shared storage IDs, pinned StorageObject refs, and persisted StorageObject bytes for measured generated refs')
                        : 'read-only helpers, AdminRead API routes, model-sync cached snapshots, file-catalog folder, group-post, generated-output source, and shared-storage drilldowns plus bounded generated-ref storage inspection and AdminAll metadata reconciliation expose staged progress while reporting overview totals, MIME/type breakdowns, largest content rows, largest catalog files/folders, largest groups, largest published posts, DB-visible generated/static refs, duplicate/shared storage IDs, and persisted StorageObject bytes for measured generated refs')
                      : 'read-only helpers, AdminRead API routes, model-sync cached snapshots, file-catalog folder, group-post, generated-output source drilldowns, bounded generated-ref storage inspection, and AdminAll metadata reconciliation expose staged progress while reporting overview totals, MIME/type breakdowns, largest content rows, largest catalog files/folders, largest groups, largest published posts, DB-visible generated/static refs, and persisted StorageObject bytes for measured generated refs')
                    : 'read-only helpers, AdminRead API routes, model-sync cached snapshots, file-catalog folder, group-post, generated-output source drilldowns, and bounded generated-ref storage inspection expose staged progress while reporting overview totals, MIME/type breakdowns, largest content rows, largest catalog files/folders, largest groups, largest published posts, DB-visible generated/static refs, and runtime measured bytes for missing StorageObject refs')
                  : 'read-only helpers, AdminRead API routes, model-sync cached snapshots, file-catalog folder, group-post, and generated-output source drilldowns, and asyncOperation-owned refresh queue jobs expose staged progress while reporting overview totals, MIME/type breakdowns, largest content rows, largest catalog files/folders, largest groups, largest published posts, and DB-visible generated/static refs with logical bytes, known physical bytes, and unknown DAG refs separated')
                : 'read-only helpers, AdminRead API routes, model-sync cached snapshots, file-catalog folder, group-post, and generated-output source drilldowns, and asyncOperation-owned refresh queue jobs expose overview totals, MIME/type breakdowns, largest content rows, largest catalog files/folders, largest groups, largest published posts, and DB-visible generated/static refs while separating logical bytes, known physical bytes, and unknown DAG refs')
              : 'read-only helpers, AdminRead API routes, model-sync cached snapshots, file-catalog folder and group-post drilldowns, and asyncOperation-owned refresh queue jobs expose overview totals, MIME/type breakdowns, largest content rows, largest catalog files/folders, largest groups, and largest published posts while separating logical content bytes from deduplicated physical storage bytes')
            : 'read-only helpers and AdminRead API routes expose overview totals, MIME/type breakdowns, largest content rows, largest catalog files/folders, largest groups, and largest published posts while separating logical content bytes from deduplicated physical storage bytes')
          : 'read-only helpers expose overview totals, MIME/type breakdowns, largest content rows, largest catalog files/folders, largest groups, and largest published posts while separating logical content bytes from deduplicated physical storage bytes')
        : 'storage usage is still inferred from unrelated content, file-catalog, and group screens',
        hasStorageSpaceActiveContentFilters),
      scalabilityRisk: applyStorageSpaceActiveContentPolicy(hasStorageSpaceUsageHelpers
        ? (hasStorageSpaceApi
          ? (hasStorageSpaceSnapshots
            ? (hasStorageSpaceGeneratedOutputs
              ? (hasStorageSpaceSnapshotProgress
                ? (hasStorageSpaceGeneratedOutputInspection
                  ? (hasStorageSpaceGeneratedOutputReconcile
                    ? (hasStorageSpaceSharedStorageIds
                      ? (hasStorageSpacePinnedStorageObjects
                        ? (hasStorageSpacePreviewStorage
                          ? (hasStorageSpaceCleanupBlockers
                            ? (hasStorageSpaceGeneratedOutputChildRefs
                              ? (hasRecursiveStorageSpaceGeneratedOutputChildRefs
                                ? (hasPinStorageObjectLedger
                                  ? (hasStorageSpaceAvailabilitySignals
                                    ? (hasStorageSpaceAvailabilityNetworkEvidence
                                      ? 'backend aggregate, API, cached snapshot, staged async refresh progress, file-catalog folder drilldown, group-post drilldown, DB-visible generated/static ref accounting, duplicate/shared storage-id drilldown, pinned-object/remote-pin drilldown, availability signals from local pins/remote pin rows/stored peer counts, on-demand live provider/stat sampling, persisted async sample history/summary, restored-report availability evidence, preview-storage overhead drilldown, on-demand cleanup-blocker drilldown, bounded recursive runtime storage-stat/child-DAG inspection, explicit metadata reconciliation, recursive child StorageObject reconciliation, durable generated-output child delete blockers, and recorded remote pin blockers are present; remaining work is production tuning after observing real DHT/provider lookup cost'
                                      : 'backend aggregate, API, cached snapshot, staged async refresh progress, file-catalog folder drilldown, group-post drilldown, DB-visible generated/static ref accounting, duplicate/shared storage-id drilldown, pinned-object/remote-pin drilldown, availability signals from local pins/remote pin rows/stored peer counts, preview-storage overhead drilldown, on-demand cleanup-blocker drilldown, bounded recursive runtime storage-stat/child-DAG inspection, explicit metadata reconciliation, recursive child StorageObject reconciliation, durable generated-output child delete blockers, and recorded remote pin blockers are present; live/sampled IPFS provider/retrieval summaries or restored-report evidence remain')
                                    : 'backend aggregate, API, cached snapshot, staged async refresh progress, file-catalog folder drilldown, group-post drilldown, DB-visible generated/static ref accounting, duplicate/shared storage-id drilldown, pinned-object/remote-pin drilldown, preview-storage overhead drilldown, on-demand cleanup-blocker drilldown, bounded recursive runtime storage-stat/child-DAG inspection, explicit metadata reconciliation, recursive child StorageObject reconciliation, durable generated-output child delete blockers, and recorded remote pin blockers are present; restored-data query evidence and delayed garbage collection remain')
                                  : 'backend aggregate, API, cached snapshot, staged async refresh progress, file-catalog folder drilldown, group-post drilldown, DB-visible generated/static ref accounting, duplicate/shared storage-id drilldown, pinned-object drilldown, preview-storage overhead drilldown, on-demand cleanup-blocker drilldown, bounded recursive runtime storage-stat/child-DAG inspection, explicit metadata reconciliation, recursive child StorageObject reconciliation, and durable generated-output child delete blockers are present; restored-data query evidence, remote pin reconciliation, and delayed garbage collection remain')
                                : 'backend aggregate, API, cached snapshot, staged async refresh progress, file-catalog folder drilldown, group-post drilldown, DB-visible generated/static ref accounting, duplicate/shared storage-id drilldown, pinned-object drilldown, preview-storage overhead drilldown, on-demand cleanup-blocker drilldown, bounded runtime storage-stat/child-DAG inspection, explicit metadata reconciliation, immediate child StorageObject reconciliation, and durable generated-output child delete blockers are present; restored-data query evidence, deeper DAG recursion, remote pin reconciliation, and delayed garbage collection remain')
                              : 'backend aggregate, API, cached snapshot, staged async refresh progress, file-catalog folder drilldown, group-post drilldown, DB-visible generated/static ref accounting, duplicate/shared storage-id drilldown, pinned-object drilldown, preview-storage overhead drilldown, on-demand cleanup-blocker drilldown, bounded runtime storage-stat inspection, and explicit metadata reconciliation are present; restored-data query evidence and fuller DAG child-ref reconciliation remain')
                            : 'backend aggregate, API, cached snapshot, staged async refresh progress, file-catalog folder drilldown, group-post drilldown, DB-visible generated/static ref accounting, duplicate/shared storage-id drilldown, pinned-object drilldown, preview-storage overhead drilldown, bounded runtime storage-stat inspection, and explicit metadata reconciliation are present; restored-data query evidence, cleanup blocker drilldowns, and fuller DAG child-ref reconciliation remain')
                          : 'backend aggregate, API, cached snapshot, staged async refresh progress, file-catalog folder drilldown, group-post drilldown, DB-visible generated/static ref accounting, duplicate/shared storage-id drilldown, pinned-object drilldown, bounded runtime storage-stat inspection, and explicit metadata reconciliation are present; restored-data query evidence, cleanup blocker drilldowns, preview drilldowns, and fuller DAG child-ref reconciliation remain')
                        : 'backend aggregate, API, cached snapshot, staged async refresh progress, file-catalog folder drilldown, group-post drilldown, DB-visible generated/static ref accounting, duplicate/shared storage-id drilldown, bounded runtime storage-stat inspection, and explicit metadata reconciliation are present; restored-data query evidence, cleanup blocker drilldowns, and fuller DAG child-ref reconciliation remain')
                      : 'backend aggregate, API, cached snapshot, staged async refresh progress, file-catalog folder drilldown, group-post drilldown, DB-visible generated/static ref accounting, bounded runtime storage-stat inspection, and explicit metadata reconciliation are present; restored-data query evidence and fuller DAG child-ref reconciliation remain')
                    : 'backend aggregate, API, cached snapshot, staged async refresh progress, file-catalog folder drilldown, group-post drilldown, DB-visible generated/static ref accounting, and bounded runtime storage-stat inspection are present; restored-data query evidence and persisted DAG metadata reconciliation remain')
                  : 'backend aggregate, API, cached snapshot, staged async refresh progress, file-catalog folder drilldown, group-post drilldown, and DB-visible generated/static ref accounting are present; true IPFS DAG byte traversal for unknown directory/manifest refs and restored-data query evidence remain')
                : 'backend aggregate, API, cached snapshot, generic async refresh queue, file-catalog folder drilldown, group-post drilldown, and DB-visible generated/static ref accounting are present; true IPFS DAG byte traversal for unknown directory/manifest refs, restored-data query evidence, and finer per-query progress remain')
              : 'backend aggregate, API, cached snapshot, generic async refresh queue, file-catalog folder drilldown, and first group-post drilldown seams are present; generated-output DAG accounting, restored-data query evidence, and finer per-query progress remain')
            : 'backend aggregate and API seams are present; cached/background snapshots, generated-output DAG accounting, and frontend drilldown UI remain')
          : 'first backend aggregate seam is present; API routes, cached/background snapshots, generated-output DAG accounting, and frontend drilldown UI remain')
        : 'operators cannot identify large catalogs/groups/files without ad hoc queries, and duplicate storageId rows risk misleading physical-size reports',
        hasStorageSpaceActiveContentFilters),
    },
    {
      area: 'File catalog publish',
      source: 'app/modules/fileCatalog/index.ts',
      hotspot: 'publishFolder / makeFolderChildrenStorageDirsAndCopyFiles',
      observedPattern: hasFileCatalogPublishBatchTraversal
        ? 'recursively scans child folders and files in id-ordered batches before copying storage files'
        : 'recursive folder publish calls the paged browsing helper for child folders/files',
      scalabilityRisk: hasFileCatalogPublishBatchTraversal
        ? 'large folder publishes avoid the public browsing cap and avoid one unbounded child read per folder'
        : 'large folders can publish only the default page or require an unsafe unbounded child query',
    },
    {
      area: 'Quota checks',
      source: 'app/modules/content/index.ts',
      hotspot: 'checkFileSizeAndSaveByStream',
      observedPattern: hasUploadQuotaCommitLock
        ? 'quota sum before upload stream, then content row and upload action commit under a locked UserLimit re-check'
        : (has(contentSource, 'getUserLimitRemained') ? 'quota sum before upload stream, action recorded after content creation' : 'review quota path'),
      scalabilityRisk: has(read('app/modules/database/models/userContentAction.ts'), 'user_content_actions_user_name_created_idx')
        ? (hasUploadQuotaCommitLock
          ? 'visible content/action commits are serialized against the active limit; bytes can still be streamed before final commit rejection, so true pre-stream reservation remains future work'
          : 'accounting SUM is indexed, but concurrent uploads can still pass before reservation/action recording')
        : 'unindexed accounting sums and concurrent uploads can make quota checks slow and race-prone',
    },
    {
      area: 'Async operation ledger',
      source: 'app/modules/asyncOperation/index.ts',
      hotspot: 'getUserAsyncOperationList / closeAllAsyncOperation / cleanupFinishedAsyncOperations',
      observedPattern: has(asyncOperationSource, "order: [['createdAt', 'DESC']]") && has(asyncOperationSource, 'where: {inProcess: true}')
        ? (hasAsyncOperationRetention
          ? 'lists by user/inProcess/name ordered by createdAt, closes in-process rows on startup, and deletes old finished rows in a bounded batch'
          : 'lists by user/inProcess/name ordered by createdAt and closes all in-process rows on startup')
        : 'review async operation list/sweep implementation',
      scalabilityRisk: has(read('app/modules/asyncOperation/models.ts'), 'user_async_operations_process_updated_idx')
        && has(read('app/modules/asyncOperation/models.ts'), 'user_operation_queues_async_operation_idx')
        && has(read('app/modules/asyncOperation/models.ts'), 'user_operation_queues_waiting_async_updated_idx')
        ? (hasAsyncOperationRetention
          ? 'lookup, startup sweep, queue lifecycle, and finished-row retention cleanup are present; operation history beyond the latest window is intentionally temporary'
          : 'lookup, startup sweep, and queue lifecycle indexes are present; finished-operation retention remains open')
        : 'operation list and restart sweep can scan a growing ledger',
    },
    {
      area: 'Auto action executor',
      source: 'app/modules/autoActions/index.ts',
      hotspot: 'claimAutoActionsToExecute',
      observedPattern: has(autoActionSource, 'getDueAutoActionWhere') && has(autoActionSource, 'executeOn: {[Op.lte]: now}')
        ? (hasAutoActionDbClaims
          ? 'cron atomically claims active due actions in deterministic executeOn/id batches with expiring DB claims before queueing'
          : (hasBoundedAutoActionExecutor
            ? 'periodic executor selects active due actions in deterministic executeOn/id batches and cron de-dupes queued/running action ids'
            : 'periodic executor selects active actions due before now'))
        : 'review auto-action executor query',
      scalabilityRisk: has(read('app/modules/autoActions/models.ts'), 'auto_actions_active_execute_idx')
        ? (hasAutoActionDbClaims
          ? 'due/active scan and claim lookup are indexed; multi-node workers skip rows already claimed until the claim expires'
          : (hasBoundedAutoActionExecutor
            ? 'due/active range scan is indexed and per-node duplicate/batch pressure is bounded; multi-node claim locking remains separate'
            : 'due/active range scan is indexed; batching and duplicate executor locking remain separate scheduler concerns'))
        : 'executor can scan active rows without executeOn range support',
    },
    {
      area: 'Auto action management list',
      source: 'app/modules/autoActions/index.ts',
      hotspot: 'getUserActions',
      observedPattern: hasAutoActionListLimits
        ? 'filters by user plus known fields, applies endpoint sort allowlists/default pages, and returns count-only totals'
        : 'loads matching user actions without endpoint-specific list defaults',
      scalabilityRisk: has(read('app/modules/autoActions/models.ts'), 'auto_actions_user_created_idx')
        ? (hasAutoActionListLimits
          ? 'default user/createdAt/id pages are indexed and capped; alternate sort fields stay bounded by the page cap'
          : 'user-list index exists, but endpoint paging/filter policy should be verified')
        : 'large per-user auto-action histories can scan and sort without a user/default-order index',
    },
    {
      area: 'Pin account lookup/list',
      source: 'app/modules/pin/index.ts',
      hotspot: 'getUserAccount / getGroupAccount / getUserAccountsList / getGroupAccountsList',
      observedPattern: has(pinSource, 'where: {userId, groupId: null, name}') && has(pinSource, 'findOne({where: {groupId, name}}')
        ? (hasPinAccountListLimits
          ? (has(pinSource, 'getAutoPinAccountsInBatches')
            ? 'separates direct-user and group-scoped account lookups, caps public list pages, and discovers automatic policies through stable cursor batches'
            : 'separates direct-user and group-scoped account lookups and caps public list pages')
          : 'separates direct-user and group-scoped account lookups by owner id plus name')
        : 'review pin account lookup implementation',
      scalabilityRisk: has(pinModelSource, 'pin_accounts_user_name_unique') && has(pinModelSource, 'pin_accounts_group_name_unique')
        ? (hasPinAccountListLimits
          ? 'owner/name lookups and bounded owner-scoped lists are backed by the owner/name indexes'
          : 'owner/name lookups are indexed and uniqueness-backed')
        : 'owner/name lookup cannot use the legacy name-leading uniqueness well',
    },
    {
      area: 'Foreign account list',
      source: 'app/modules/foreignAccounts/index.ts',
      hotspot: 'getUserAccountsList',
      observedPattern: hasForeignAccountListLimits
        ? 'API calls list user foreign accounts with allowlisted sort fields, default pages, and a lower cap; manifest export calls the same helper without list params to keep the full account set'
        : 'lists every foreign account for the user',
      scalabilityRisk: has(foreignAccountModelSource, "fields: ['userId']")
        ? (hasForeignAccountListLimits
          ? 'user account API pages are bounded and backed by the userId index while manifest generation remains complete'
          : 'userId lookup is indexed, but the API can still return every account for the user')
        : 'large per-user foreign account lists can scan without a userId index',
    },
    {
      area: 'Social account list',
      source: 'app/modules/socNetAccount/index.ts',
      hotspot: 'getAccountList',
      observedPattern: hasSocNetAccountListLimits
        ? 'API calls list user social-network accounts with allowlisted sort fields, default pages, a lower cap, and backward-compatible socNet filters'
        : 'lists every social-network account for the user',
      scalabilityRisk: has(socNetAccountModelSource, "fields: ['userId', 'socNet', 'username']")
        ? (hasSocNetAccountListLimits
          ? 'user social-account API pages are bounded and user/socNet lookups keep their composite indexes'
          : 'user/socNet lookups are indexed, but the API can still return every account for the user')
        : 'large per-user social-account lists can scan without a userId-leading index',
    },
    {
      area: 'Content bot list',
      source: 'app/modules/tgContentBot/api.ts',
      hotspot: 'content-bot/list',
      observedPattern: hasContentBotListLimits
        ? 'API calls list current-user content bots with allowlisted sort fields, default pages, and a lower cap'
        : 'lists every content bot for the user',
      scalabilityRisk: hasContentBotUserIndex
        ? (hasContentBotListLimits
          ? 'user content-bot API pages are bounded and backed by the userId index'
          : 'userId lookup is indexed, but the API can still return every content bot for the user')
        : (hasContentBotListLimits
          ? 'API pages are bounded, but a userId-leading index should be added before this table grows materially'
          : 'large per-user content-bot lists can scan without a userId-leading index'),
    },
    {
      area: 'List parameter normalization',
      source: 'app/helpers.ts',
      hotspot: 'prepareListParams',
      observedPattern: has(helpersSource, 'parseNonNegativeInteger') && has(helpersSource, 'sanitizeSortDir') && has(helpersSource, 'sanitizeSortBy')
        ? (cappedListSurfaces.length
          ? `normalizes limit/offset, clamps sort direction, enforces endpoint sort allowlists, supports includeTotal opt-out, and caps ${joinList(cappedListSurfaces)} below the global export ceiling`
          : 'normalizes limit/offset to non-negative integers, caps limit, allowlists simple sort columns, and clamps sort direction')
        : 'review list parameter normalization',
      scalabilityRisk: has(helpersSource, 'parseNonNegativeInteger') && has(helpersSource, 'sanitizeSortDir') && has(helpersSource, 'sanitizeSortBy')
        ? (cappedListSurfaces.length
          ? `${joinList(cappedListSurfaces)} use endpoint allowlists and lower caps; post feeds can opt out of totals; remaining endpoints still need endpoint-specific policies`
          : 'bad public list params are normalized before Sequelize; endpoint-specific sort allowlists and lower public max page sizes remain open')
        : 'negative offsets/limits and arbitrary sort params can reach large-list queries',
    },
    {
      area: 'Static rebind scan',
      source: 'app/modules/group/index.ts',
      hotspot: 'getGroupWhereStaticOutdated',
      observedPattern: hasBoundedStaticRebindScan
        ? 'filters non-deleted groups whose staticStorageUpdatedAt is older than the threshold, ordered oldest-first in a capped batch'
        : (has(groupSource, 'staticStorageUpdatedAt') && has(groupSource, 'Op.lt')
        ? 'filters non-deleted groups whose staticStorageUpdatedAt is older than the threshold'
        : 'review static rebind scan implementation'),
      scalabilityRisk: hasBoundedStaticRebindScan
        ? 'scan predicate is indexed and bounded for manual/ops use; cron remains disabled and should become event-driven before high churn'
        : (has(read('app/modules/group/models/group.ts'), 'groups_static_rebind_idx')
        ? 'scan predicate is indexed; cron remains disabled and should probably become event-driven before high churn'
        : 'minute-level scan would range-scan groups without a static-rebind index'),
    },
    {
      area: 'Static ID resolution',
      source: 'app/modules/staticId/index.ts',
      hotspot: 'getStaticIdItemByDynamicId',
      observedPattern: hasStaticIdCurrentBinding
        ? 'current-binding lookup by dynamicId with a guarded history fallback/lazy fill for model-sync upgrades'
        : (has(staticIdSource, 'findOne({where: {dynamicId}') ? 'dynamicId lookup ordered by boundAt' : 'review staticId dynamic lookup'),
      scalabilityRisk: hasStaticIdCurrentBinding
        ? (hasStaticIdHistoryCompaction
        ? 'hot static-ID resolution uses compact current rows; bounded per-static history cleanup preserves current bindings while capping new churn'
        : 'hot static-ID resolution uses compact current rows; audit-history retention still needs policy')
        : (has(staticIdModelSource, "fields: ['dynamicId'")
        ? 'dynamicId lookup is indexed, but manifest churn still needs latest-binding and retention policy'
        : 'manifest churn can grow history while dynamicId lookups lack a dynamicId-leading index'
        ),
    },
  ];
}

function applyContentSoftDeletePolicy(text: string, enabled: boolean): string {
  if (!enabled) {
    return text;
  }
  return text
    .replace(
      /destroys catalog item first; only destroys content\/physical storage/g,
      'destroys catalog item first; soft-deletes unreferenced content rows and only queues/removes physical storage'
    )
    .replace(
      /unpin\/remove physical storage and destroy content row/g,
      'unpin/remove physical storage and soft-delete content row'
    )
    .replace(
      /async garbage collection still needs a fuller lifecycle/g,
      'physical garbage collection is queued/rechecked after soft delete; broader lifecycle audit remains'
    );
}

function applyStorageSpaceActiveContentPolicy(text: string, enabled: boolean): string {
  if (!enabled) {
    return text;
  }
  return text
    .replace(/reporting overview totals/g, 'reporting active-content overview totals')
    .replace(/expose overview totals/g, 'expose active-content overview totals')
    .replace(/backend aggregate, API/g, 'active-content-aware backend aggregate, API')
    .replace(/backend aggregate exists/g, 'active-content-aware backend aggregate exists');
}

function render(): string {
  const models = modelRows();
  const hotspots = hotspotRows();

  const lines = [
    '# Database Scalability Inventory',
    '',
    '## Source Of Truth',
    '',
    'Original request for this slice: add a review of database scalability for storing hundreds of thousands of posts and content records in groups.',
    '',
    'This file is generated by `npm run database:scalability:update`. Do not hand-edit the tables; update `check/databaseScalabilityInventory.ts` or the source code and regenerate.',
    '',
    '## Summary',
    '',
    `- Model/query areas reviewed: ${models.length}`,
    `- Query hotspots reviewed: ${hotspots.length}`,
    '- Primary risk area: group post timelines and generated manifests at 100k+ posts per group.',
    '- Current review doc: [database-scalability-review.md](database-scalability-review.md).',
    '',
    '## Model Index Inventory',
    '',
    '| Area | Model | Current Index Signals | Review Notes | Source |',
    '| --- | --- | --- | --- | --- |',
  ];

  for (const row of models) {
    lines.push(`| ${escapeCell(row.area)} | ${escapeCell(row.model)} | ${escapeCell(row.indexes.join('; '))} | ${escapeCell(row.notes.join('; '))} | \`${escapeCell(row.source)}\` |`);
  }

  lines.push(
    '',
    '## Query Hotspots',
    '',
    '| Area | Hotspot | Observed Pattern | Scalability Risk | Source |',
    '| --- | --- | --- | --- | --- |',
  );

  for (const row of hotspots) {
    lines.push(`| ${escapeCell(row.area)} | ${escapeCell(row.hotspot)} | ${escapeCell(row.observedPattern)} | ${escapeCell(row.scalabilityRisk)} | \`${escapeCell(row.source)}\` |`);
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

const generated = render();

if (args.has('--write')) {
  fs.writeFileSync(outputPath, generated);
  console.log(`wrote ${rel(outputPath)}`);
} else if (args.has('--check')) {
  const existing = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
  if (existing !== generated) {
    console.error(`${rel(outputPath)} is out of date. Run npm run database:scalability:update.`);
    process.exit(1);
  }
  console.log(`${rel(outputPath)} is up to date`);
} else {
  process.stdout.write(generated);
}
