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

function joinList(items: string[]): string {
  if (items.length <= 1) {
    return items.join('');
  }
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function modelRows(): ModelRow[] {
  const postSource = read('app/modules/group/models/post.ts');
  const groupSource = read('app/modules/group/models/group.ts');
  const contentSource = read('app/modules/database/models/content.ts');
  const objectSource = read('app/modules/database/models/object.ts');
  const fileCatalogModelSource = read('app/modules/fileCatalog/models.ts');
  const groupPermissionSource = read('app/modules/group/models/groupPermission.ts');
  const groupReadSource = read('app/modules/group/models/groupRead.ts');
  const socNetImportSource = read('app/modules/socNetImport/models.ts');
  const socNetImportIndexSource = read('app/modules/socNetImport/index.ts');
  const staticSiteSource = read('app/modules/staticSiteGenerator/models.ts');
  const groupCategorySource = read('app/modules/groupCategory/models/groupCategory.ts');
  const groupSectionSource = read('app/modules/groupCategory/models/groupSection.ts');
  const staticIdSource = read('app/modules/staticId/models.ts');
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
  const tagSource = read('app/modules/group/models/tag.ts');
  const mentionSource = read('app/modules/group/models/mention.ts');
  const autoTagSource = read('app/modules/group/models/autoTag.ts');
  const hasPostGroupLocalUnique = has(postSource, 'posts_group_local_unique')
    && has(postSource, "fields: ['groupId', 'localId']")
    && has(postSource, 'unique: true');
  const hasPostSourceUnique = has(postSource, 'posts_group_source_post_unique')
    && has(postSource, "fields: ['groupId', 'source', 'sourceChannelId', 'sourcePostId']")
    && has(postSource, 'unique: true');
  const hasPostContentPositionUnique = has(postSource, 'posts_contents_post_position_unique')
    && has(postSource, "fields: ['postId', 'position']")
    && has(postSource, 'unique: true');
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
  const hasFileCatalogParentListIndex = has(fileCatalogModelSource, 'file_catalog_items_user_parent_list_idx')
    && has(fileCatalogModelSource, "fields: ['userId', 'parentItemId', 'isDeleted', 'type', 'createdAt', 'id']");
  const hasUserLimitUnique = has(userLimitSource, 'user_limits_user_name_unique')
    && has(userLimitSource, "fields: ['userId', 'name']")
    && has(userLimitSource, 'unique: true');
  const hasUserLimitDuplicateRetry = has(appSource, 'isUserLimitUniqueError')
    && has(appSource, 'newExistLimit');
  const hasPinUserNameUnique = has(pinSource, 'pin_accounts_user_name_unique')
    && has(pinSource, "fields: ['userId', 'name']")
    && has(pinSource, 'unique: true');
  const hasPinGroupNameUnique = has(pinSource, 'pin_accounts_group_name_unique')
    && has(pinSource, "fields: ['groupId', 'name']")
    && has(pinSource, 'unique: true');
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
          ? 'content reference checks, large folder listings, and exact active path writes are covered'
          : 'content delete/reference checks need a reverse content lookup index before large libraries',
      ],
    },
    {
      area: 'Static ID history',
      source: 'app/modules/staticId/models.ts',
      model: 'StaticIdHistory',
      indexes: [
        has(staticIdSource, "fields: ['staticId', 'dynamicId'") ? 'staticId,dynamicId unique' : 'review static/dynamic unique index',
        has(staticIdSource, "fields: ['staticId', 'boundAt'") ? 'staticId,boundAt' : 'missing staticId,boundAt index',
        has(staticIdSource, "fields: ['dynamicId'") ? 'dynamicId lookup index' : 'missing dynamicId-leading lookup index',
      ],
      notes: [
        has(staticIdSource, "fields: ['dynamicId'")
          ? 'group/static manifest churn can create long history; dynamicId lookup is indexed, latest-binding/retention still open'
          : 'group/static manifest churn can create long history; getStaticIdItemByDynamicId needs dynamicId-leading index or latest-binding table',
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
        has(userContentActionSource, 'DataTypes.BIGINT') && hasUserLimitUnique && hasUserLimitDuplicateRetry
          ? 'quota checks sum UserContentAction by userId/name/createdAt before uploads; ledger size is BIGINT; UserLimit is unique per user/name after duplicate cleanup and duplicate-key retry'
          : (has(userContentActionSource, 'DataTypes.BIGINT') && hasUserLimitUnique
          ? 'quota checks sum UserContentAction by userId/name/createdAt before uploads; ledger size is BIGINT; UserLimit is unique per user/name after duplicate cleanup'
          : (has(userContentActionSource, 'DataTypes.BIGINT')
          ? 'quota checks sum UserContentAction by userId/name/createdAt before uploads; ledger size is BIGINT; UserLimit lookup index is present but uniqueness is still separate'
          : 'quota checks sum UserContentAction by userId/name/createdAt before uploads; size remains INTEGER')),
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
          ? 'runtime owner/name lookups are deterministic after duplicate-name cleanup'
          : 'pin account lookup should start with owner id before name',
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
  const manifestSource = read('app/modules/entityJsonManifest/index.ts');
  const staticSiteSource = read('app/modules/staticSiteGenerator/index.ts');
  const rssSource = read('app/modules/rss/index.ts');
  const importSource = read('app/modules/socNetImport/index.ts');
  const categorySource = read('app/modules/groupCategory/index.ts');
  const contentSource = read('app/modules/content/index.ts');
  const databaseSource = read('app/modules/database/index.ts');
  const fileCatalogSource = read('app/modules/fileCatalog/index.ts');
  const inviteSource = read('app/modules/invite/index.ts');
  const staticIdSource = read('app/modules/staticId/index.ts');
  const asyncOperationSource = read('app/modules/asyncOperation/index.ts');
  const autoActionSource = read('app/modules/autoActions/index.ts');
  const autoActionModelSource = read('app/modules/autoActions/models.ts');
  const autoActionCronSource = read('app/modules/autoActions/cronService.ts');
  const pinSource = read('app/modules/pin/index.ts');
  const pinModelSource = read('app/modules/pin/models.ts');
  const helpersSource = read('app/helpers.ts');
  const hasTimelineIdFirstHydration = has(groupSource, 'getHydratedPostListByIds(postIds') && has(groupSource, "attributes: ['id', 'publishedAt']");
  const hasAllPostsIdFirstHydration = has(groupSource, 'getHydratedPostListByIds(pagePosts.map') && has(groupSource, "attributes: ['id']");
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
  const hasRssPostRefs = hasGeneratedOutputPostBatchHelper
    && has(rssSource, 'forEachHydratedGroupPostBatch(groupId')
    && has(rssSource, 'rssPostBatchLimit');
  const hasGroupManifestDeleteUnset = has(manifestSource, 'unsetTreeNode(groupManifest.posts, post.localId)');
  const hasGroupManifestStatusUnset = has(manifestSource, 'statusNe: PostStatus.Published')
    && has(groupSource, 'this.updateGroupManifest(userId, oldPost.groupId)');
  const hasPostWriteTransaction = has(groupSource, 'allocatePostLocalId(postData, transaction)')
    && has(groupSource, 'this.addPost(postData, {transaction})')
    && has(groupSource, 'this.setPostContents(post.id, contents, {transaction})')
    && has(groupSource, 'this.incrementGroupCounters(post.groupId, {sizeDelta: size || 0, availableDelta: 1}, {transaction})');
  const hasPostDeleteTransaction = has(groupSource, 'this.updatePosts(postIds, {isDeleted: true}, {transaction})')
    && has(groupSource, 'this.incrementGroupCounters(Number(groupId), deltas, {transaction})')
    && has(groupSource, 'await models.Post.update({repliesCount}, {where: {id: replyToId}, transaction})')
    && has(groupSource, 'await models.Post.update({repostsCount}, {where: {id: repostOfId}, transaction})');
  const hasPostStatusCounterReconcile = has(groupSource, 'shouldReconcileReplyCounters')
    && has(groupSource, 'shouldReconcileRepostCounters');
  const hasDeterministicSharedContentLookup = has(databaseSource, 'async getSharedContentByStorageId')
    && has(databaseSource, 'async getSharedContentByManifestId')
    && has(databaseSource, "order: [['id', 'ASC']]")
    && has(databaseSource, 'return this.getSharedContentByManifestId(manifestStorageId)');
  const hasCanonicalPostDbTransaction = hasPostWriteTransaction && hasPostDeleteTransaction;

  return [
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
        ? 'selects page post IDs first, then hydrates contents for the bounded page'
        : (has(groupSource, 'async getAllPosts') ? 'findAll with contents include and limit/offset' : 'review implementation'),
      scalabilityRisk: hasAllPostsIdFirstHydration
        ? 'content joins no longer drive page selection, but all-group offset scans still need cursor/export projections for high-volume use'
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
          ? 'canonical create/update/delete DB state is wrapped in transactions: localId allocation, post row, attachments, tombstone flag, size, group counters, and reply/repost counts including status boundary changes'
          : 'canonical create/update/delete DB state is wrapped in transactions: localId allocation, post row, attachments, tombstone flag, size, reply/repost counts, and group counters')
        : (hasPostWriteTransaction
          ? 'canonical create/update DB state is wrapped in one transaction; delete/import transitions still need transaction boundaries'
          : 'post create/update run localId allocation, post rows, attachments, size, and counters as separate statements'),
      scalabilityRisk: hasCanonicalPostDbTransaction
        ? (hasPostStatusCounterReconcile
          ? 'canonical post DB partial-state risk is reduced; import/upsert transitions and manifest/static derived work still need transaction/job boundaries'
          : 'canonical post DB partial-state risk is reduced; status/import/upsert transitions and manifest/static derived work still need transaction/job boundaries')
        : (hasPostWriteTransaction
          ? 'create/update partial DB state risk is reduced; delete/import transitions and manifest/static derived work still need transaction/job boundaries'
          : 'failures can leave partial post rows, attachment rows, counters, or skipped local IDs under load/retries'),
    },
    {
      area: 'Static site rendering',
      source: 'app/modules/staticSiteGenerator/index.ts',
      hotspot: 'prepareGroupPostsForRender',
      observedPattern: hasStaticSitePostRefBatches
        ? 'scans lightweight post refs in cursor batches, then hydrates and renders each bounded batch'
        : (has(staticSiteSource, 'limit: 9999') ? 'loads up to 9999 posts with contents before rendering pages' : 'review implementation'),
      scalabilityRisk: hasStaticSitePostRefBatches
        ? 'large exports still materialize final render data and copy content, but DB hydration is page-scoped'
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
        ? 'feed generation avoids total counts and the previous 9999-row hydration query; body extraction still reads selected content files'
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
      observedPattern: has(contentSource, 'getUserLimitRemained') ? 'quota sum before upload stream, action recorded after content creation' : 'review quota path',
      scalabilityRisk: has(read('app/modules/database/models/userContentAction.ts'), 'user_content_actions_user_name_created_idx')
        ? 'accounting SUM is indexed, but concurrent uploads can still pass before reservation/action recording'
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
      area: 'Pin account lookup',
      source: 'app/modules/pin/index.ts',
      hotspot: 'getUserAccount / getGroupAccount',
      observedPattern: has(pinSource, 'findOne({where: {userId, name}}') && has(pinSource, 'findOne({where: {groupId, name}}')
        ? 'looks up pin accounts by owner id plus name'
        : 'review pin account lookup implementation',
      scalabilityRisk: has(pinModelSource, 'pin_accounts_user_name_unique') && has(pinModelSource, 'pin_accounts_group_name_unique')
        ? 'owner/name lookups are indexed and uniqueness-backed'
        : 'owner/name lookup cannot use the legacy name-leading uniqueness well',
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
      observedPattern: has(groupSource, 'staticStorageUpdatedAt') && has(groupSource, 'Op.lt')
        ? 'filters non-deleted groups whose staticStorageUpdatedAt is older than the threshold'
        : 'review static rebind scan implementation',
      scalabilityRisk: has(read('app/modules/group/models/group.ts'), 'groups_static_rebind_idx')
        ? 'scan predicate is indexed; cron remains disabled and should probably become event-driven before high churn'
        : 'minute-level scan would range-scan groups without a static-rebind index',
    },
    {
      area: 'Static ID resolution',
      source: 'app/modules/staticId/index.ts',
      hotspot: 'getStaticIdItemByDynamicId',
      observedPattern: has(staticIdSource, 'findOne({where: {dynamicId}') ? 'dynamicId lookup ordered by boundAt' : 'review staticId dynamic lookup',
      scalabilityRisk: has(read('app/modules/staticId/models.ts'), "fields: ['dynamicId'")
        ? 'dynamicId lookup is indexed, but manifest churn still needs latest-binding and retention policy'
        : 'manifest churn can grow history while dynamicId lookups lack a dynamicId-leading index',
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
