import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {QueryTypes, Sequelize} from 'sequelize';
import databaseConfig from '../app/modules/database/config.js';

type MigrationModule = 'database' | 'group' | 'staticSiteGenerator' | 'socNetImport';

type CoveredMigration = {
  module: MigrationModule;
  file: string;
  verifies: string[];
};

type Requirement = {
  table: string;
  columns?: string[];
};

type ExpectedColumn = Requirement & {
  type: string;
};

type ExpectedIndex = Requirement & {
  name: string;
  columns: string[];
  unique?: boolean;
};

type CountCheck = {
  name: string;
  requirements: Requirement[];
  sql: string;
};

type AuditResult = {
  status: 'pass' | 'fail' | 'skip';
  name: string;
  details?: string;
};

type ColumnInfo = {
  column_name: string;
  data_type: string;
  udt_name: string;
};

type IndexInfo = {
  name: string;
  table_name: string;
  unique: boolean;
  valid: boolean;
  ready: boolean;
  columns: string[];
  definition: string;
  predicate: string | null;
};

type CountRow = {
  count: string | number;
};

export type MigrationCoverageProblem = {
  kind: 'missing-file' | 'uncovered-file';
  file: string;
  module?: MigrationModule;
};

const rootDir = process.cwd();
const recentMigrationFloor = '20260500000000';

const migrationDirs: Record<MigrationModule, string> = {
  database: 'app/modules/database/migrations',
  group: 'app/modules/group/migrations',
  staticSiteGenerator: 'app/modules/staticSiteGenerator/migrations',
  socNetImport: 'app/modules/socNetImport/migrations',
};

const coveredMigrations: CoveredMigration[] = [
  {
    module: 'database',
    file: '20260506000001-add-content-and-quota-indexes.cjs',
    verifies: ['content preview indexes', 'content manifest/user indexes', 'quota indexes', 'static-id dynamic lookup index'],
  },
  {
    module: 'database',
    file: '20260506000003-widen-size-columns-bigint.cjs',
    verifies: ['post/group/content-action/preview size columns are bigint'],
  },
  {
    module: 'database',
    file: '20260507000000-add-content-user-manifest-index.cjs',
    verifies: ['actor-scoped content manifest lookup index'],
  },
  {
    module: 'database',
    file: '20260507000001-add-ops-and-feed-indexes.cjs',
    verifies: ['async-operation indexes', 'auto-action indexes', 'category/feed/group-section indexes', 'static-rebind index'],
  },
  {
    module: 'database',
    file: '20260507000002-enforce-content-user-storage-unique.cjs',
    verifies: ['same-user content storage uniqueness', 'deduped content references'],
  },
  {
    module: 'database',
    file: '20260510000000-enforce-user-limit-unique.cjs',
    verifies: ['user-limit user/name uniqueness'],
  },
  {
    module: 'database',
    file: '20260510000001-enforce-file-catalog-active-path-unique.cjs',
    verifies: ['file-catalog active path uniqueness and list index'],
  },
  {
    module: 'database',
    file: '20260510000002-enforce-pin-account-owner-name-unique.cjs',
    verifies: ['pin-account per-owner name uniqueness'],
  },
  {
    module: 'database',
    file: '20260511000000-add-auto-action-user-list-index.cjs',
    verifies: ['auto-action user management list index'],
  },
  {
    module: 'database',
    file: '20260511000001-add-operation-queue-retention-indexes.cjs',
    verifies: ['async-operation queue retention indexes'],
  },
  {
    module: 'database',
    file: '20260511000002-fix-object-cache-resolve-prop-key.cjs',
    verifies: ['object cache storage/resolveProp uniqueness', 'object cache storage-only unique index removal'],
  },
  {
    module: 'database',
    file: '20260511000003-add-auto-action-execution-claims.cjs',
    verifies: ['auto-action execution claim columns and index'],
  },
  {
    module: 'database',
    file: '20260513000000-add-content-bot-user-index.cjs',
    verifies: ['content-bot user list index'],
  },
  {
    module: 'group',
    file: '20260506000000-add-post-timeline-indexes.cjs',
    verifies: ['post timeline/manifest/local-id indexes', 'post-content indexes'],
  },
  {
    module: 'group',
    file: '20260506000002-add-permission-and-membership-indexes.cjs',
    verifies: ['group permission/member/admin indexes'],
  },
  {
    module: 'group',
    file: '20260509000000-add-tag-mention-autotag-indexes.cjs',
    verifies: ['tag/mention/auto-tag indexes and references'],
  },
  {
    module: 'group',
    file: '20260509000001-add-group-read-post-cursor.cjs',
    verifies: ['groupReads readPostId column'],
  },
  {
    module: 'group',
    file: '20260510000000-enforce-post-content-position-unique.cjs',
    verifies: ['post-content position uniqueness'],
  },
  {
    module: 'group',
    file: '20260510000001-enforce-post-group-local-unique.cjs',
    verifies: ['group-local post identity uniqueness', 'group high-water localId counters'],
  },
  {
    module: 'group',
    file: '20260510000002-enforce-post-source-identity-unique.cjs',
    verifies: ['social-import post source identity uniqueness'],
  },
  {
    module: 'group',
    file: '20260511000000-add-group-creator-list-index.cjs',
    verifies: ['creator-owned group listing index'],
  },
];

const expectedColumns: ExpectedColumn[] = [
  {table: 'posts', columns: ['size'], type: 'bigint'},
  {table: 'groups', columns: ['size'], type: 'bigint'},
  {table: 'userContentActions', columns: ['size'], type: 'bigint'},
  {table: 'contents', columns: ['largePreviewSize'], type: 'bigint'},
  {table: 'contents', columns: ['mediumPreviewSize'], type: 'bigint'},
  {table: 'contents', columns: ['smallPreviewSize'], type: 'bigint'},
  {table: 'groupReads', columns: ['readPostId'], type: 'integer'},
  {table: 'autoActions', columns: ['executeClaimedAt'], type: 'timestamp with time zone'},
  {table: 'autoActions', columns: ['executeClaimExpiresAt'], type: 'timestamp with time zone'},
];

const expectedIndexes: ExpectedIndex[] = [
  {name: 'contents_large_preview_storage_idx', table: 'contents', columns: ['largePreviewStorageId']},
  {name: 'contents_medium_preview_storage_idx', table: 'contents', columns: ['mediumPreviewStorageId']},
  {name: 'contents_small_preview_storage_idx', table: 'contents', columns: ['smallPreviewStorageId']},
  {name: 'contents_user_created_idx', table: 'contents', columns: ['userId', 'createdAt', 'id']},
  {name: 'contents_manifest_storage_idx', table: 'contents', columns: ['manifestStorageId']},
  {name: 'contents_user_manifest_storage_idx', table: 'contents', columns: ['userId', 'manifestStorageId']},
  {name: 'contents_user_storage_unique', table: 'contents', columns: ['userId', 'storageId'], unique: true},
  {name: 'objects_storage_resolve_prop_unique', table: 'objects', columns: ['storageId', 'resolveProp'], unique: true},
  {name: 'content_bots_user_id_idx', table: 'contentBots', columns: ['userId']},
  {name: 'file_catalog_items_content_idx', table: 'fileCatalogItems', columns: ['contentId']},
  {name: 'file_catalog_items_user_parent_list_idx', table: 'fileCatalogItems', columns: ['userId', 'parentItemId', 'isDeleted', 'type', 'createdAt', 'id']},
  {name: 'file_catalog_items_child_path_unique', table: 'fileCatalogItems', columns: ['parentItemId', 'userId', 'name'], unique: true},
  {name: 'file_catalog_items_root_path_unique', table: 'fileCatalogItems', columns: ['userId', 'name'], unique: true},
  {name: 'user_content_actions_user_name_created_idx', table: 'userContentActions', columns: ['userId', 'name', 'createdAt']},
  {name: 'user_content_actions_content_idx', table: 'userContentActions', columns: ['contentId']},
  {name: 'static_id_histories_dynamic_bound_idx', table: 'staticIdHistories', columns: ['dynamicId', 'boundAt']},
  {name: 'static_id_bindings_static_unique', table: 'staticIdBindings', columns: ['staticId'], unique: true},
  {name: 'static_id_bindings_dynamic_bound_idx', table: 'staticIdBindings', columns: ['dynamicId', 'boundAt']},
  {name: 'user_async_operations_user_process_name_created_idx', table: 'userAsyncOperations', columns: ['userId', 'inProcess', 'name', 'createdAt']},
  {name: 'user_async_operations_process_updated_idx', table: 'userAsyncOperations', columns: ['inProcess', 'updatedAt']},
  {name: 'user_operation_queues_async_operation_idx', table: 'userOperationQueues', columns: ['asyncOperationId']},
  {name: 'user_operation_queues_waiting_async_updated_idx', table: 'userOperationQueues', columns: ['isWaiting', 'asyncOperationId', 'updatedAt', 'id']},
  {name: 'auto_actions_active_execute_idx', table: 'autoActions', columns: ['isActive', 'executeOn']},
  {name: 'auto_actions_active_execute_claim_idx', table: 'autoActions', columns: ['isActive', 'executeOn', 'executeClaimExpiresAt', 'id']},
  {name: 'auto_actions_user_created_idx', table: 'autoActions', columns: ['userId', 'createdAt', 'id']},
  {name: 'groups_creator_type_deleted_created_idx', table: 'groups', columns: ['creatorId', 'type', 'isDeleted', 'createdAt', 'id']},
  {name: 'groups_static_rebind_idx', table: 'groups', columns: ['isDeleted', 'staticStorageUpdatedAt']},
  {name: 'user_limits_user_name_unique', table: 'userLimits', columns: ['userId', 'name'], unique: true},
  {name: 'category_admins_user_category_idx', table: 'categoryAdministrators', columns: ['userId', 'categoryId']},
  {name: 'category_admins_category_user_idx', table: 'categoryAdministrators', columns: ['categoryId', 'userId']},
  {name: 'category_members_user_category_idx', table: 'categoryMembers', columns: ['userId', 'categoryId']},
  {name: 'category_members_category_user_idx', table: 'categoryMembers', columns: ['categoryId', 'userId']},
  {name: 'category_groups_category_group_idx', table: 'categoryGroups', columns: ['categoryId', 'groupId']},
  {name: 'category_groups_group_category_idx', table: 'categoryGroups', columns: ['groupId', 'categoryId']},
  {name: 'category_group_membership_category_group_idx', table: 'categoryGroupsMemberships', columns: ['categoryId', 'groupId']},
  {name: 'category_group_membership_group_category_idx', table: 'categoryGroupsMemberships', columns: ['groupId', 'categoryId']},
  {name: 'group_sections_pivot_section_group_idx', table: 'groupSectionsPivots', columns: ['sectionId', 'groupId']},
  {name: 'group_sections_pivot_group_idx', table: 'groupSectionsPivots', columns: ['groupId']},
  {name: 'pin_accounts_user_name_unique', table: 'pinAccounts', columns: ['userId', 'name'], unique: true},
  {name: 'pin_accounts_group_name_unique', table: 'pinAccounts', columns: ['groupId', 'name'], unique: true},
  {name: 'posts_group_timeline_idx', table: 'posts', columns: ['groupId', 'isDeleted', 'status', 'publishedAt', 'id']},
  {name: 'posts_group_manifest_cursor_idx', table: 'posts', columns: ['groupId', 'status', 'updatedAt', 'id']},
  {name: 'posts_group_id_idx', table: 'posts', columns: ['groupId', 'id']},
  {name: 'posts_group_local_unique', table: 'posts', columns: ['groupId', 'localId'], unique: true},
  {name: 'posts_group_source_post_unique', table: 'posts', columns: ['groupId', 'source', 'sourceChannelId', 'sourcePostId'], unique: true},
  {name: 'posts_manifest_storage_id_idx', table: 'posts', columns: ['manifestStorageId']},
  {name: 'posts_contents_post_position_unique', table: 'postsContents', columns: ['postId', 'position'], unique: true},
  {name: 'posts_contents_content_idx', table: 'postsContents', columns: ['contentId']},
  {name: 'group_permissions_user_group_name_idx', table: 'groupPermissions', columns: ['userId', 'groupId', 'name']},
  {name: 'group_permissions_group_user_idx', table: 'groupPermissions', columns: ['groupId', 'userId']},
  {name: 'group_members_user_group_idx', table: 'groupMembers', columns: ['userId', 'groupId']},
  {name: 'group_members_group_user_idx', table: 'groupMembers', columns: ['groupId', 'userId']},
  {name: 'group_admins_user_group_idx', table: 'groupAdministrators', columns: ['userId', 'groupId']},
  {name: 'group_admins_group_user_idx', table: 'groupAdministrators', columns: ['groupId', 'userId']},
  {name: 'tags_name_idx', table: 'tags', columns: ['name']},
  {name: 'tags_manifest_storage_idx', table: 'tags', columns: ['manifestStorageId']},
  {name: 'tags_manifest_static_storage_idx', table: 'tags', columns: ['manifestStaticStorageId']},
  {name: 'tagged_posts_post_tag_idx', table: 'taggedPosts', columns: ['postId', 'tagId']},
  {name: 'tagged_posts_tag_post_idx', table: 'taggedPosts', columns: ['tagId', 'postId']},
  {name: 'mentions_source_post_idx', table: 'mentions', columns: ['sourcePostId']},
  {name: 'mentions_target_post_idx', table: 'mentions', columns: ['targetPostId']},
  {name: 'mentions_source_group_idx', table: 'mentions', columns: ['sourceGroupId']},
  {name: 'mentions_target_group_idx', table: 'mentions', columns: ['targetGroupId']},
  {name: 'mentions_creator_idx', table: 'mentions', columns: ['creatorId']},
  {name: 'mentions_manifest_storage_idx', table: 'mentions', columns: ['manifestStorageId']},
  {name: 'auto_tags_group_idx', table: 'autoTags', columns: ['groupId']},
  {name: 'auto_tags_result_tag_idx', table: 'autoTags', columns: ['resultTagId']},
  {name: 'auto_tags_required_tag1_idx', table: 'autoTags', columns: ['requiredTag1Id']},
  {name: 'auto_tags_required_tag2_idx', table: 'autoTags', columns: ['requiredTag2Id']},
  {name: 'auto_tags_required_tag3_idx', table: 'autoTags', columns: ['requiredTag3Id']},
  {name: 'auto_tags_required_tag4_idx', table: 'autoTags', columns: ['requiredTag4Id']},
  {name: 'auto_tags_required_tag5_idx', table: 'autoTags', columns: ['requiredTag5Id']},
];

const countChecks: CountCheck[] = [
  duplicateCheck('same-user content storage duplicates', 'contents', ['userId', 'storageId']),
  duplicateCheck('object cache storage/resolveProp duplicates', 'objects', ['storageId', 'resolveProp']),
  duplicateCheck('static-id current binding duplicates', 'staticIdBindings', ['staticId']),
  {
    name: 'object cache resolveProp values are normalized',
    requirements: [{table: 'objects', columns: ['resolveProp']}],
    sql: `
      SELECT COUNT(*) AS count
      FROM objects
      WHERE "resolveProp" IS NULL
    `,
  },
  {
    name: 'object cache storage-only unique indexes are removed',
    requirements: [{table: 'objects', columns: ['storageId']}],
    sql: `
      SELECT COUNT(*) AS count
      FROM pg_index
      JOIN pg_class table_class ON table_class.oid = pg_index.indrelid
      JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
      WHERE namespace.nspname = 'public'
        AND table_class.relname = 'objects'
        AND pg_index.indisunique
        AND ARRAY(
          SELECT pg_attribute.attname::text
          FROM unnest(pg_index.indkey) WITH ORDINALITY AS index_key(attnum, ord)
          JOIN pg_attribute
            ON pg_attribute.attrelid = table_class.oid
            AND pg_attribute.attnum = index_key.attnum
          ORDER BY index_key.ord
        ) = ARRAY['storageId']
    `,
  },
  duplicateCheck('user limit user/name duplicates', 'userLimits', ['userId', 'name']),
  duplicateCheck('pin account user/name duplicates', 'pinAccounts', ['userId', 'name']),
  duplicateCheck('pin account group/name duplicates', 'pinAccounts', ['groupId', 'name']),
  duplicateCheck('post content position duplicates', 'postsContents', ['postId', 'position']),
  duplicateCheck('post group/localId duplicates', 'posts', ['groupId', 'localId']),
  duplicateCheck('post source identity duplicates', 'posts', ['groupId', 'source', 'sourceChannelId', 'sourcePostId']),
  duplicateCheck('active file-catalog child path duplicates', 'fileCatalogItems', ['parentItemId', 'userId', 'name'], '"isDeleted" IS FALSE'),
  duplicateCheck('active file-catalog root path duplicates', 'fileCatalogItems', ['userId', 'name'], '"isDeleted" IS FALSE AND "parentItemId" IS NULL'),
  {
    name: 'static-id current bindings have matching history pairs',
    requirements: [
      {table: 'staticIdBindings', columns: ['staticId', 'dynamicId']},
      {table: 'staticIdHistories', columns: ['staticId', 'dynamicId']},
    ],
    sql: `
      SELECT COUNT(*) AS count
      FROM "staticIdBindings" binding
      LEFT JOIN "staticIdHistories" history
        ON history."staticId" = binding."staticId"
        AND history."dynamicId" IS NOT DISTINCT FROM binding."dynamicId"
      WHERE history.id IS NULL
    `,
  },
  {
    name: 'static-id current bindings match latest history dynamic ids',
    requirements: [
      {table: 'staticIdBindings', columns: ['staticId', 'dynamicId']},
      {table: 'staticIdHistories', columns: ['staticId', 'dynamicId', 'boundAt', 'id']},
    ],
    sql: `
      SELECT COUNT(*) AS count
      FROM "staticIdBindings" binding
      JOIN (
        SELECT DISTINCT ON ("staticId")
          "staticId",
          "dynamicId"
        FROM "staticIdHistories"
        WHERE "staticId" IS NOT NULL
        ORDER BY "staticId", "boundAt" DESC NULLS LAST, id DESC
      ) latest
        ON latest."staticId" = binding."staticId"
      WHERE binding."dynamicId" IS DISTINCT FROM latest."dynamicId"
    `,
  },
  relationCheck('post content rows point to posts', 'postsContents', 'postId', 'posts'),
  relationCheck('post content rows point to contents', 'postsContents', 'contentId', 'contents'),
  relationCheck('file catalog content links point to contents', 'fileCatalogItems', 'contentId', 'contents'),
  relationCheck('file catalog users point to users', 'fileCatalogItems', 'userId', 'users'),
  relationCheck('file catalog groups point to groups', 'fileCatalogItems', 'groupId', 'groups'),
  relationCheck('file catalog parents point to file catalog items', 'fileCatalogItems', 'parentItemId', 'fileCatalogItems'),
  relationCheck('file catalog linked items point to file catalog items', 'fileCatalogItems', 'linkOfId', 'fileCatalogItems'),
  relationCheck('user content actions point to contents', 'userContentActions', 'contentId', 'contents'),
  relationCheck('user content actions point to users', 'userContentActions', 'userId', 'users'),
  relationCheck('user content actions point to API keys', 'userContentActions', 'userApiKeyId', 'userApiKeys'),
  relationCheck('async operations point to contents', 'userAsyncOperations', 'contentId', 'contents'),
  relationCheck('async operations point to users', 'userAsyncOperations', 'userId', 'users'),
  relationCheck('operation queues point to async operations', 'userOperationQueues', 'asyncOperationId', 'userAsyncOperations'),
  relationCheck('operation queues point to users', 'userOperationQueues', 'userId', 'users'),
  relationCheck('operation queues point to API keys', 'userOperationQueues', 'userApiKeyId', 'userApiKeys'),
  relationCheck('auto actions point to users', 'autoActions', 'userId', 'users'),
  relationCheck('auto action logs point to users', 'autoActionLogs', 'userId', 'users'),
  relationCheck('auto action logs point to actions', 'autoActionLogs', 'actionId', 'autoActions'),
  relationCheck('auto action logs point to root actions', 'autoActionLogs', 'rootActionId', 'autoActions'),
  relationCheck('auto action next pivots point to base actions', 'nextActionsPivots', 'baseActionId', 'autoActions'),
  relationCheck('auto action next pivots point to next actions', 'nextActionsPivots', 'nextActionId', 'autoActions'),
  relationCheck('soc-net import content messages point to contents', 'socNetImport_contentMessages', 'dbContentId', 'contents'),
  relationCheck('soc-net import content messages point to channels', 'socNetImport_contentMessages', 'dbChannelId', 'socNetImport_channels'),
  relationCheck('soc-net import messages point to channels', 'socNetImport_messages', 'dbChannelId', 'socNetImport_channels'),
  relationCheck('soc-net import messages point to repost channels', 'socNetImport_messages', 'repostOfDbChannelId', 'socNetImport_channels'),
  relationCheck('soc-net import messages point to posts', 'socNetImport_messages', 'postId', 'posts'),
  relationCheck('groups avatar links point to contents', 'groups', 'avatarImageId', 'contents'),
  relationCheck('groups cover links point to contents', 'groups', 'coverImageId', 'contents'),
  relationCheck('groups creators point to users', 'groups', 'creatorId', 'users'),
  relationCheck('users avatar links point to contents', 'users', 'avatarImageId', 'contents'),
  relationCheck('categories avatar links point to contents', 'categories', 'avatarImageId', 'contents'),
  relationCheck('categories cover links point to contents', 'categories', 'coverImageId', 'contents'),
  relationCheck('tags avatar links point to contents', 'tags', 'avatarImageId', 'contents'),
  relationCheck('tags cover links point to contents', 'tags', 'coverImageId', 'contents'),
  relationCheck('mentions avatar links point to contents', 'mentions', 'avatarImageId', 'contents'),
  relationCheck('mentions cover links point to contents', 'mentions', 'coverImageId', 'contents'),
  relationCheck('posts point to groups', 'posts', 'groupId', 'groups'),
  relationCheck('posts point to users', 'posts', 'userId', 'users'),
  relationCheck('post replies point to posts', 'posts', 'replyToId', 'posts'),
  relationCheck('post reposts point to posts', 'posts', 'repostOfId', 'posts'),
  relationCheck('group reads point to groups', 'groupReads', 'groupId', 'groups'),
  relationCheck('group reads point to users', 'groupReads', 'userId', 'users'),
  relationCheck('group reads post cursors point to posts', 'groupReads', 'readPostId', 'posts'),
  relationCheck('group permissions point to groups', 'groupPermissions', 'groupId', 'groups'),
  relationCheck('group permissions point to users', 'groupPermissions', 'userId', 'users'),
  relationCheck('group members point to groups', 'groupMembers', 'groupId', 'groups'),
  relationCheck('group members point to users', 'groupMembers', 'userId', 'users'),
  relationCheck('group administrators point to groups', 'groupAdministrators', 'groupId', 'groups'),
  relationCheck('group administrators point to users', 'groupAdministrators', 'userId', 'users'),
  relationCheck('category admins point to categories', 'categoryAdministrators', 'categoryId', 'categories'),
  relationCheck('category admins point to users', 'categoryAdministrators', 'userId', 'users'),
  relationCheck('category members point to categories', 'categoryMembers', 'categoryId', 'categories'),
  relationCheck('category members point to users', 'categoryMembers', 'userId', 'users'),
  relationCheck('category groups point to categories', 'categoryGroups', 'categoryId', 'categories'),
  relationCheck('category groups point to groups', 'categoryGroups', 'groupId', 'groups'),
  relationCheck('category group memberships point to categories', 'categoryGroupsMemberships', 'categoryId', 'categories'),
  relationCheck('category group memberships point to groups', 'categoryGroupsMemberships', 'groupId', 'groups'),
  relationCheck('group sections point to users', 'groupSections', 'creatorId', 'users'),
  relationCheck('group sections point to categories', 'groupSections', 'categoryId', 'categories'),
  relationCheck('group sections point to parent sections', 'groupSections', 'parentSectionId', 'groupSections'),
  relationCheck('group-section pivots point to sections', 'groupSectionsPivots', 'sectionId', 'groupSections'),
  relationCheck('group-section pivots point to groups', 'groupSectionsPivots', 'groupId', 'groups'),
  relationCheck('tagged posts point to posts', 'taggedPosts', 'postId', 'posts'),
  relationCheck('tagged posts point to tags', 'taggedPosts', 'tagId', 'tags'),
  relationCheck('mentions source posts point to posts', 'mentions', 'sourcePostId', 'posts'),
  relationCheck('mentions target posts point to posts', 'mentions', 'targetPostId', 'posts'),
  relationCheck('mentions source groups point to groups', 'mentions', 'sourceGroupId', 'groups'),
  relationCheck('mentions target groups point to groups', 'mentions', 'targetGroupId', 'groups'),
  relationCheck('mentions creators point to users', 'mentions', 'creatorId', 'users'),
  relationCheck('auto tags point to groups', 'autoTags', 'groupId', 'groups'),
  relationCheck('auto tags result tag points to tags', 'autoTags', 'resultTagId', 'tags'),
  relationCheck('auto tags required tag 1 points to tags', 'autoTags', 'requiredTag1Id', 'tags'),
  relationCheck('auto tags required tag 2 points to tags', 'autoTags', 'requiredTag2Id', 'tags'),
  relationCheck('auto tags required tag 3 points to tags', 'autoTags', 'requiredTag3Id', 'tags'),
  relationCheck('auto tags required tag 4 points to tags', 'autoTags', 'requiredTag4Id', 'tags'),
  relationCheck('auto tags required tag 5 points to tags', 'autoTags', 'requiredTag5Id', 'tags'),
  relationCheck('pin accounts point to users', 'pinAccounts', 'userId', 'users'),
  relationCheck('pin accounts point to groups', 'pinAccounts', 'groupId', 'groups'),
  relationCheck('user limits point to users', 'userLimits', 'userId', 'users'),
  relationCheck('user limits point to admins', 'userLimits', 'adminId', 'users'),
  {
    name: 'group publishedPostsCount keeps the post localId high-water mark',
    requirements: [
      {table: 'groups', columns: ['publishedPostsCount']},
      {table: 'posts', columns: ['groupId', 'localId']},
    ],
    sql: `
      SELECT COUNT(*) AS count
      FROM groups g
      JOIN (
        SELECT "groupId", MAX("localId") AS max_local_id
        FROM posts
        WHERE "groupId" IS NOT NULL
          AND "localId" IS NOT NULL
        GROUP BY "groupId"
      ) post_high_water ON post_high_water."groupId" = g.id
      WHERE COALESCE(g."publishedPostsCount", 0) < post_high_water.max_local_id
    `,
  },
];

class SchemaCache {
  private columns = new Map<string, Map<string, ColumnInfo>>();
  private indexes: Map<string, IndexInfo> | null = null;

  constructor(private sequelize: Sequelize) {}

  async tableExists(table: string): Promise<boolean> {
    const columns = await this.getColumns(table);

    return columns.size > 0;
  }

  async columnExists(table: string, column: string): Promise<boolean> {
    const columns = await this.getColumns(table);

    return columns.has(column);
  }

  async columnInfo(table: string, column: string): Promise<ColumnInfo | null> {
    const columns = await this.getColumns(table);

    return columns.get(column) || null;
  }

  async indexInfo(name: string): Promise<IndexInfo | null> {
    const indexes = await this.getIndexes();

    return indexes.get(name) || null;
  }

  private async getColumns(table: string): Promise<Map<string, ColumnInfo>> {
    const cached = this.columns.get(table);

    if (cached) {
      return cached;
    }

    const rows = await this.sequelize.query<ColumnInfo>(`
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = :table
    `, {
      replacements: {table},
      type: QueryTypes.SELECT,
    });
    const next = new Map<string, ColumnInfo>();

    for (const row of rows) {
      next.set(row.column_name, row);
    }

    this.columns.set(table, next);

    return next;
  }

  private async getIndexes(): Promise<Map<string, IndexInfo>> {
    if (this.indexes) {
      return this.indexes;
    }

    const rows = await this.sequelize.query<any>(`
      SELECT
        index_class.relname AS name,
        table_class.relname AS table_name,
        pg_index.indisunique AS unique,
        pg_index.indisvalid AS valid,
        pg_index.indisready AS ready,
        pg_get_indexdef(pg_index.indexrelid) AS definition,
        pg_get_expr(pg_index.indpred, pg_index.indrelid) AS predicate,
        ARRAY(
          SELECT pg_attribute.attname
          FROM unnest(pg_index.indkey) WITH ORDINALITY AS index_key(attnum, ord)
          JOIN pg_attribute
            ON pg_attribute.attrelid = table_class.oid
            AND pg_attribute.attnum = index_key.attnum
          ORDER BY index_key.ord
        ) AS columns
      FROM pg_index
      JOIN pg_class table_class ON table_class.oid = pg_index.indrelid
      JOIN pg_class index_class ON index_class.oid = pg_index.indexrelid
      JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
      WHERE namespace.nspname = 'public'
    `, {
      type: QueryTypes.SELECT,
    });
    const indexes = new Map<string, IndexInfo>();

    for (const row of rows) {
      indexes.set(row.name, {
        name: row.name,
        table_name: row.table_name,
        unique: Boolean(row.unique),
        valid: Boolean(row.valid),
        ready: Boolean(row.ready),
        columns: normalizeIndexColumns(row.columns),
        definition: row.definition,
        predicate: row.predicate || null,
      });
    }

    this.indexes = indexes;

    return indexes;
  }
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function normalizeIndexColumns(columns: unknown): string[] {
  if (Array.isArray(columns)) {
    return columns.map((column) => String(column));
  }

  if (typeof columns !== 'string') {
    return [];
  }

  if (columns.startsWith('{') && columns.endsWith('}')) {
    const body = columns.slice(1, -1);

    if (!body) {
      return [];
    }

    return body.split(',').map((column) => column.replace(/^"|"$/g, ''));
  }

  return columns.split(',').map((column) => column.trim()).filter(Boolean);
}

function duplicateCheck(name: string, table: string, columns: string[], extraWhere?: string): CountCheck {
  const columnPredicates = columns.map((column) => `${quoteIdentifier(column)} IS NOT NULL`);
  const whereParts = [...columnPredicates];

  if (extraWhere) {
    whereParts.push(extraWhere);
  }

  const whereClause = whereParts.join(' AND ');
  const groupBy = columns.map(quoteIdentifier).join(', ');

  return {
    name,
    requirements: [{table, columns}],
    sql: `
      SELECT COUNT(*) AS count
      FROM (
        SELECT 1
        FROM ${quoteIdentifier(table)}
        WHERE ${whereClause}
        GROUP BY ${groupBy}
        HAVING COUNT(*) > 1
      ) duplicate_groups
    `,
  };
}

function relationCheck(name: string, sourceTable: string, sourceColumn: string, targetTable: string): CountCheck {
  return {
    name,
    requirements: [
      {table: sourceTable, columns: [sourceColumn]},
      {table: targetTable, columns: ['id']},
    ],
    sql: `
      SELECT COUNT(*) AS count
      FROM ${quoteIdentifier(sourceTable)} source
      LEFT JOIN ${quoteIdentifier(targetTable)} target
        ON target.id = source.${quoteIdentifier(sourceColumn)}
      WHERE source.${quoteIdentifier(sourceColumn)} IS NOT NULL
        AND target.id IS NULL
    `,
  };
}

export function getMigrationCoverageProblems(baseDir = rootDir): MigrationCoverageProblem[] {
  const problems: MigrationCoverageProblem[] = [];
  const coveredByModule = new Map<MigrationModule, Set<string>>();

  for (const migration of coveredMigrations) {
    const files = coveredByModule.get(migration.module) || new Set<string>();
    files.add(migration.file);
    coveredByModule.set(migration.module, files);
    const migrationPath = path.join(baseDir, migrationDirs[migration.module], migration.file);

    if (!fs.existsSync(migrationPath)) {
      problems.push({
        kind: 'missing-file',
        file: migration.file,
        module: migration.module,
      });
    }
  }

  for (const moduleName of Object.keys(migrationDirs) as MigrationModule[]) {
    const directory = path.join(baseDir, migrationDirs[moduleName]);

    if (!fs.existsSync(directory)) {
      continue;
    }

    const files = fs.readdirSync(directory)
      .filter((file) => file.endsWith('.cjs'))
      .filter((file) => file >= recentMigrationFloor);
    const covered = coveredByModule.get(moduleName) || new Set<string>();

    for (const file of files) {
      if (covered.has(file)) {
        continue;
      }

      problems.push({
        kind: 'uncovered-file',
        file,
        module: moduleName,
      });
    }
  }

  return problems;
}

async function requirementSkipReason(schema: SchemaCache, requirements: Requirement[]): Promise<string | null> {
  for (const requirement of requirements) {
    const tableExists = await schema.tableExists(requirement.table);

    if (!tableExists) {
      return `missing optional table ${requirement.table}`;
    }

    if (!requirement.columns) {
      continue;
    }

    for (const column of requirement.columns) {
      const columnExists = await schema.columnExists(requirement.table, column);

      if (!columnExists) {
        return `missing optional column ${requirement.table}.${column}`;
      }
    }
  }

  return null;
}

async function auditMigrationFiles(schema: SchemaCache, sequelize: Sequelize, requireMigrationMeta: boolean): Promise<AuditResult[]> {
  const results: AuditResult[] = [];
  const coverageProblems = getMigrationCoverageProblems(rootDir);

  if (coverageProblems.length > 0) {
    results.push({
      status: 'fail',
      name: 'recent migration files are represented in the integrity audit',
      details: coverageProblems.map((problem) => `${problem.kind}: ${problem.module || 'unknown'} ${problem.file}`).join('; '),
    });
  }

  if (coverageProblems.length === 0) {
    results.push({
      status: 'pass',
      name: 'recent migration files are represented in the integrity audit',
      details: `${coveredMigrations.length} migration files covered`,
    });
  }

  if (!requireMigrationMeta) {
    results.push({
      status: 'skip',
      name: 'recent migrations are recorded in SequelizeMeta',
      details: '--skip-migration-meta was provided',
    });

    return results;
  }

  const hasMeta = await schema.tableExists('SequelizeMeta');

  if (!hasMeta) {
    results.push({
      status: 'fail',
      name: 'recent migrations are recorded in SequelizeMeta',
      details: 'SequelizeMeta table is missing; run this after applying migrations, or use --skip-migration-meta for model-sync test databases',
    });

    return results;
  }

  const metaRows = await sequelize.query<{name: string}>(`
    SELECT name
    FROM "SequelizeMeta"
  `, {
    type: QueryTypes.SELECT,
  });
  const applied = new Set(metaRows.map((row) => row.name));
  const missing = coveredMigrations
    .map((migration) => migration.file)
    .filter((file) => !applied.has(file));

  if (missing.length > 0) {
    results.push({
      status: 'fail',
      name: 'recent migrations are recorded in SequelizeMeta',
      details: missing.join(', '),
    });

    return results;
  }

  results.push({
    status: 'pass',
    name: 'recent migrations are recorded in SequelizeMeta',
    details: `${coveredMigrations.length} recent migrations applied`,
  });

  return results;
}

async function auditColumns(schema: SchemaCache): Promise<AuditResult[]> {
  const results: AuditResult[] = [];

  for (const expected of expectedColumns) {
    const skipReason = await requirementSkipReason(schema, [{table: expected.table, columns: expected.columns}]);
    const column = expected.columns![0];
    const name = `${expected.table}.${column} has type ${expected.type}`;

    if (skipReason) {
      results.push({
        status: 'skip',
        name,
        details: skipReason,
      });

      continue;
    }

    const columnInfo = await schema.columnInfo(expected.table, column);

    if (!columnInfo) {
      results.push({
        status: 'fail',
        name,
        details: 'column metadata missing after requirement check',
      });

      continue;
    }

    if (columnInfo.data_type !== expected.type) {
      results.push({
        status: 'fail',
        name,
        details: `actual type is ${columnInfo.data_type}`,
      });

      continue;
    }

    results.push({
      status: 'pass',
      name,
    });
  }

  return results;
}

async function auditIndexes(schema: SchemaCache): Promise<AuditResult[]> {
  const results: AuditResult[] = [];

  for (const expected of expectedIndexes) {
    const skipReason = await requirementSkipReason(schema, [{table: expected.table, columns: expected.columns}]);
    const name = `${expected.name} index exists`;

    if (skipReason) {
      results.push({
        status: 'skip',
        name,
        details: skipReason,
      });

      continue;
    }

    const indexInfo = await schema.indexInfo(expected.name);

    if (!indexInfo) {
      results.push({
        status: 'fail',
        name,
        details: `missing index on ${expected.table}(${expected.columns.join(', ')})`,
      });

      continue;
    }

    if (indexInfo.table_name !== expected.table) {
      results.push({
        status: 'fail',
        name,
        details: `index is on ${indexInfo.table_name}, expected ${expected.table}`,
      });

      continue;
    }

    if (!indexInfo.valid || !indexInfo.ready) {
      results.push({
        status: 'fail',
        name,
        details: 'index is not valid/ready',
      });

      continue;
    }

    if (expected.unique && !indexInfo.unique) {
      results.push({
        status: 'fail',
        name,
        details: 'index is not unique',
      });

      continue;
    }

    if (indexInfo.columns.join(',') !== expected.columns.join(',')) {
      results.push({
        status: 'fail',
        name,
        details: `actual columns are ${indexInfo.columns.join(', ')}`,
      });

      continue;
    }

    results.push({
      status: 'pass',
      name,
    });
  }

  return results;
}

async function auditCounts(schema: SchemaCache, sequelize: Sequelize): Promise<AuditResult[]> {
  const results: AuditResult[] = [];

  for (const check of countChecks) {
    const skipReason = await requirementSkipReason(schema, check.requirements);

    if (skipReason) {
      results.push({
        status: 'skip',
        name: check.name,
        details: skipReason,
      });

      continue;
    }

    const rows = await sequelize.query<CountRow>(check.sql, {
      type: QueryTypes.SELECT,
    });
    const count = Number(rows[0]?.count || 0);

    if (count > 0) {
      results.push({
        status: 'fail',
        name: check.name,
        details: `${count} row/group violation(s)`,
      });

      continue;
    }

    results.push({
      status: 'pass',
      name: check.name,
    });
  }

  return results;
}

export async function runMigrationIntegrityAudit(options: {requireMigrationMeta?: boolean} = {}): Promise<AuditResult[]> {
  const requireMigrationMeta = options.requireMigrationMeta !== false;
  const sequelize = new Sequelize({
    ...(databaseConfig as any),
    logging: false,
  });

  try {
    await sequelize.authenticate();
    const schema = new SchemaCache(sequelize);
    const results = [
      ...(await auditMigrationFiles(schema, sequelize, requireMigrationMeta)),
      ...(await auditColumns(schema)),
      ...(await auditIndexes(schema)),
      ...(await auditCounts(schema, sequelize)),
    ];

    return results;
  } finally {
    await sequelize.close();
  }
}

function printResults(results: AuditResult[]): void {
  const statusOrder = ['fail', 'skip', 'pass'];
  const sorted = [...results].sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status));

  for (const result of sorted) {
    const details = result.details ? ` - ${result.details}` : '';
    console.log(`[${result.status}] ${result.name}${details}`);
  }

  const passed = results.filter((result) => result.status === 'pass').length;
  const failed = results.filter((result) => result.status === 'fail').length;
  const skipped = results.filter((result) => result.status === 'skip').length;

  console.log(`\nMigration integrity audit: ${passed} passed, ${failed} failed, ${skipped} skipped`);
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const requireMigrationMeta = !args.has('--skip-migration-meta');
  const results = await runMigrationIntegrityAudit({requireMigrationMeta});

  printResults(results);

  const hasFailure = results.some((result) => result.status === 'fail');

  if (hasFailure) {
    process.exitCode = 1;
  }
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (import.meta.url === entryPoint) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
