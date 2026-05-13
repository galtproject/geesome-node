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
  const contentSource = read('app/modules/database/models/content.ts');
  const objectSource = read('app/modules/database/models/object.ts');
  const fileCatalogModelSource = read('app/modules/fileCatalog/models.ts');
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
  const userContentActionSource = read('app/modules/database/models/userContentAction.ts');
  const userLimitSource = read('app/modules/database/models/userLimit.ts');
  const asyncOperationSource = read('app/modules/asyncOperation/models.ts');
  const asyncOperationIndexSource = read('app/modules/asyncOperation/index.ts');
  const autoActionSource = read('app/modules/autoActions/models.ts');
  const autoActionIndexSource = read('app/modules/autoActions/index.ts');
  const autoActionCronSource = read('app/modules/autoActions/cronService.ts');
  const pinSource = read('app/modules/pin/models.ts');
  const pinIndexSource = read('app/modules/pin/index.ts');
  const foreignAccountSource = read('app/modules/foreignAccounts/models.ts');
  const foreignAccountIndexSource = read('app/modules/foreignAccounts/index.ts');
  const socNetAccountSource = read('app/modules/socNetAccount/models.ts');
  const socNetAccountIndexSource = read('app/modules/socNetAccount/index.ts');
  const tgContentBotSource = read('app/modules/tgContentBot/models.ts');
  const tgContentBotApiSource = read('app/modules/tgContentBot/api.ts');
  const tagSource = read('app/modules/group/models/tag.ts');
  const mentionSource = read('app/modules/group/models/mention.ts');
  const autoTagSource = read('app/modules/group/models/autoTag.ts');
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
  const hasContentUserStorageUnique = has(contentSource, 'contents_user_storage_unique')
    && has(contentSource, "fields: ['userId', 'storageId']")
    && has(contentSource, 'unique: true');
  const hasDeterministicSharedContentLookup = has(databaseModuleSource, 'async getSharedContentByStorageId')
    && has(databaseModuleSource, 'async getSharedContentByManifestId')
    && has(databaseModuleSource, "order: [['id', 'ASC']]")
    && has(databaseModuleSource, 'return this.getSharedContentByManifestId(manifestStorageId)');
  const hasObjectResolvePropUnique = has(objectSource, 'objects_storage_resolve_prop_unique')
    && has(objectSource, "fields: ['storageId', 'resolveProp']")
    && has(objectSource, 'unique: true');
  const hasFileCatalogPathUnique = has(fileCatalogModelSource, 'file_catalog_items_child_path_unique')
    && has(fileCatalogModelSource, 'file_catalog_items_root_path_unique')
    && has(fileCatalogModelSource, "fields: ['parentItemId', 'userId', 'name']")
    && has(fileCatalogModelSource, "fields: ['userId', 'name']")
    && has(fileCatalogModelSource, 'unique: true');
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
          ? 'join lookup indexes present; attachment positions are unique per post; API timeline hydration is page-scoped; remaining work is body projection'
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
        hasContentUserStorageUnique
          ? 'userId,storageId unique ownership constraint plus storageId,userId lookup'
          : 'storageId,userId non-unique ownership lookup',
        has(contentSource, 'manifestStaticStorageId') && has(contentSource, 'unique: true') ? 'manifestStaticStorageId unique' : 'manifestStaticStorageId uniqueness not found',
        has(contentSource, "fields: ['userId', 'manifestStorageId'") ? 'userId,manifestStorageId actor-scoped lookup' : 'missing actor-scoped manifest lookup index',
      ],
      notes: [
        has(contentSource, "fields: ['userId'") ? 'has user listing index' : 'missing user/created listing index',
        has(contentSource, "fields: ['manifestStorageId'") ? 'has manifest lookup index' : 'missing manifest lookup index',
        has(contentSource, "fields: ['mediumPreviewStorageId'") ? 'has preview lookup indexes' : 'missing preview lookup indexes for file/header serving',
        hasContentUserStorageUnique && hasDeterministicSharedContentLookup
          ? 'same storageId across different users remains valid; same-user duplicates are guarded by cleanup-backed uniqueness; shared storage/manifest reads use deterministic id ordering while actor/canonical semantics remain caller-specific'
          : (hasContentUserStorageUnique
          ? 'same storageId across different users remains valid; same-user duplicates are guarded by cleanup-backed uniqueness; remaining global storage/manifest findOne paths need actor scope or canonical asset semantics'
          : 'same storageId across different users is valid; remaining global storage/manifest findOne paths need caller-specific actor scope or canonical asset semantics'),
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
      source: 'app/modules/fileCatalog/models.ts',
      model: 'FileCatalogItem',
      indexes: [
        has(fileCatalogModelSource, 'file_catalog_items_content_idx') ? 'contentId reverse index' : 'missing contentId reverse index',
        hasFileCatalogParentListIndex ? 'user,parent,isDeleted,type,createdAt,id folder listing index' : 'missing folder listing index',
        hasFileCatalogPathUnique ? 'cleanup-backed active path uniqueness for child and root rows' : 'missing active path uniqueness',
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
  const postEventHelperSource = read('app/modules/group/postEventHelpers.ts');
  const postEventSource = read('app/modules/group/models/postEvent.ts');
  const groupTestSource = read('test/group.test.ts');
  const manifestSource = read('app/modules/entityJsonManifest/index.ts');
  const remoteGroupSource = read('app/modules/remoteGroup/index.ts');
  const staticSiteSource = read('app/modules/staticSiteGenerator/index.ts');
  const rssSource = read('app/modules/rss/index.ts');
  const importSource = read('app/modules/socNetImport/index.ts');
  const categorySource = read('app/modules/groupCategory/index.ts');
  const contentSource = read('app/modules/content/index.ts');
  const databaseSource = read('app/modules/database/index.ts');
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
  const scalabilityFixtureSource = read('check/databaseScalabilityFixture.ts');
  const scalabilityExplainSource = read('check/databaseScalabilityExplain.ts');
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
  const hasRssPostRefs = hasGeneratedOutputPostBatchHelper
    && has(rssSource, 'forEachHydratedGroupPostBatch(groupId')
    && has(rssSource, 'rssPostBatchLimit');
  const hasRssContentProjection = has(rssSource, 'getPostFeedContents')
    && has(rssSource, 'includeText: false')
    && has(rssSource, 'includeJson: false');
  const hasGroupManifestDeleteUnset = has(manifestSource, 'unsetTreeNode(groupManifest.posts, post.localId)');
  const hasGroupManifestStatusUnset = has(manifestSource, 'statusNe: PostStatus.Published')
    && has(groupSource, 'this.updateGroupManifest(userId, oldPost.groupId)');
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
    && has(scalabilityFixtureSource, 'seedFixtureCategory')
    && has(scalabilityFixtureSource, 'seedStaticIdState')
    && has(scalabilityFixtureSource, 'seedUserContentActions')
    && has(scalabilityFixtureSource, 'normalizeFixturePreviewIds')
    && has(scalabilityExplainSource, 'Category feed page')
    && has(scalabilityExplainSource, 'Static-site/RSS newest post-ref scan')
    && has(scalabilityExplainSource, 'Content preview/header lookup by preview storage ID')
    && has(scalabilityExplainSource, 'Timeline page (Published, cursor pagination)');

  return [
    {
      area: 'Large fixture benchmark',
      source: 'check/databaseScalabilityFixture.ts',
      hotspot: 'database:scalability:fixture / database:scalability:explain',
      observedPattern: hasLargeFixtureExplainHarness
        ? 'seeds a 100k-post group fixture plus category, attachment, quota, preview, and static-ID side rows, then emits EXPLAIN ANALYZE probes for timeline, unread, category, static/RSS, manifest, content-preview, quota, and static-ID hot paths'
        : 'large fixture or EXPLAIN coverage is missing one or more documented hot-path probes',
      scalabilityRisk: hasLargeFixtureExplainHarness
        ? 'future index/query changes can be measured against production-scale fixture data instead of small test datasets; generated plan output remains intentionally uncommitted'
        : 'review conclusions can drift because large-table plans are not reproducible from repo-local commands',
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
          ? 'loads the previous posts trie, scans changed/deleted/unpublished lightweight post refs in (updatedAt,id) cursor batches, then unsets removed local IDs'
          : (hasGroupManifestDeleteUnset
            ? 'loads the previous posts trie, scans changed/deleted lightweight post refs in (updatedAt,id) cursor batches, then unsets deleted local IDs'
            : 'loads the previous posts trie and scans changed lightweight post refs in (updatedAt,id) cursor batches'))
        : (hasGroupManifestPostRefs
          ? (hasGroupManifestDeleteUnset
            ? 'loads the previous posts trie, scans changed lightweight post refs and changed deleted refs, then unsets deleted local IDs'
            : 'loads the previous posts trie and scans changed lightweight post refs')
          : (has(manifestSource, 'limit: 9999999') ? 'loads effectively all matching group posts' : 'review implementation')),
      scalabilityRisk: hasGroupManifestRefBatches
        ? 'content/repost hydration and large changed-ref windows are avoided; rebuild still loads/copies the previous posts trie and rewrites a monolithic manifest'
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
            ? 'canonical post DB partial-state risk is reduced; source-identity upserts cover relation/group counters plus draft/unpublish/delete reconciliation, with group counter repair drift coverage; manifest/static derived work still needs transaction/job boundaries'
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
      area: 'Static site rendering',
      source: 'app/modules/staticSiteGenerator/index.ts',
      hotspot: hasStaticSiteStreamingRender ? 'renderGroupPostBatchPages' : 'prepareGroupPostsForRender',
      observedPattern: hasStaticSitePostRefBatches
        ? (hasStaticSiteStreamingRender
          ? 'scans lightweight post refs in cursor batches, uses an exact capped render count for pages, and streams SSR through current page/post state instead of materializing one final posts array'
          : (hasStaticSiteAvailableCount
            ? 'scans lightweight post refs in cursor batches, uses availablePostsCount for rendered totals, then hydrates and renders each bounded batch'
            : 'scans lightweight post refs in cursor batches, then hydrates and renders each bounded batch'))
        : (has(staticSiteSource, 'limit: 9999') ? 'loads up to 9999 posts with contents before rendering pages' : 'review implementation'),
      scalabilityRisk: hasStaticSitePostRefBatches
        ? (hasStaticSiteStreamingRender
          ? 'DB hydration and final SSR post data are page-scoped; remaining large-output pressure is storage body reads and media copy work'
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
        ? 'scans lightweight post refs in cursor batches, then hydrates selected feed batches'
        : (has(rssSource, 'limit: 9999') ? 'loads up to 9999 posts with contents for feed generation' : 'review implementation'),
      scalabilityRisk: hasRssPostRefs
        ? (hasRssContentProjection
          ? 'feed generation avoids totals, uses feed batches, and reads only the selected feed text body while leaving JSON/non-feed text as metadata'
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
              ? 'remote manifest imports now get localId, attachment, counter, group-manifest, post-event, same-manifest retry, group-manifest post iteration, and remote edit/delete replay state consistently; remaining risk is async derived-state retries and chunked manifest indexes'
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
        ? 'legacy/global storage and manifest lookups delegate to deterministic shared helpers; preview mode still ORs across storageId and preview storage ids'
        : (has(databaseSource, 'largePreviewStorageId') ? 'OR lookup across storageId and preview storage ids' : 'review preview lookup path'),
      scalabilityRisk: has(read('app/modules/database/models/content.ts'), 'contents_large_preview_storage_idx')
        ? (hasDeterministicSharedContentLookup
        ? 'shared reads are stable across duplicate user-owned rows, but they still read user-library metadata until canonical asset metadata exists'
        : 'preview columns are indexed, but public/header serving still reads across user-owned rows instead of canonical asset metadata')
        : 'preview/header serving can scan contents without preview-column indexes or canonical asset metadata',
    },
    {
      area: 'Content deletion',
      source: 'app/modules/fileCatalog/index.ts',
      hotspot: 'deleteFileCatalogItem deleteContent',
      observedPattern: has(fileCatalogSource, 'safeToDestroyContent') && has(fileCatalogSource, 'safeToRemovePhysical')
        ? 'destroys catalog item first; only destroys content/physical storage after DB reference checks'
        : (has(fileCatalogSource, 'storage.remove(content.storageId)') ? 'unpin/remove physical storage and destroy content row' : 'review deleteContent path'),
      scalabilityRisk: has(fileCatalogSource, 'safeToDestroyContent') && has(fileCatalogSource, 'safeToRemovePhysical')
        ? 'DB row references are covered; generated output, durable pin state, and async garbage collection still need a fuller lifecycle'
        : 'same storageId rows, post attachments, generated output, and pins need reference checks before physical deletion',
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
      observedPattern: has(pinSource, 'findOne({where: {userId, name}}') && has(pinSource, 'findOne({where: {groupId, name}}')
        ? (hasPinAccountListLimits
          ? 'looks up pin accounts by owner id plus name and lists owner-scoped accounts with allowlisted sort fields, default pages, and a lower cap'
          : 'looks up pin accounts by owner id plus name')
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
