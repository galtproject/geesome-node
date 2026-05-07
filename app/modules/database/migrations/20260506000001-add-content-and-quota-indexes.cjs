'use strict';

/**
 * Database scalability review: Slice 9 — additive index migration batch (cross-module).
 *
 * Adds safe non-unique indexes for content preview lookup, user content
 * library listing, quota accounting, content reference counting, and
 * static-ID dynamic-ID resolution. These pair with code already
 * shipped in earlier slices:
 *
 * - contents preview indexes back getSharedContentByStorageId({includePreviews: true})
 *   added in the A1 shared-content slice; without them the OR-search
 *   across {storageId, large/medium/small previewStorageId} scans the
 *   contents table.
 * - fileCatalogItems(contentId) and userContentActions(contentId) back
 *   countContentReferences from the same slice.
 * - userContentActions(userId, name, createdAt) backs the quota SUM(size)
 *   path called before every upload.
 * - staticIdHistories(dynamicId, boundAt) backs getStaticIdItemByDynamicId,
 *   which the review flags as missing a dynamicId-leading index.
 *
 * Postgres-only target. CREATE INDEX CONCURRENTLY runs outside any
 * wrapping transaction. Errors propagate so deploy tooling fails loudly.
 */

const STATEMENTS = [
  // contents preview lookups for findByPreviews / getSharedContentByStorageId({includePreviews}).
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS contents_large_preview_storage_idx
     ON contents ("largePreviewStorageId")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS contents_medium_preview_storage_idx
     ON contents ("mediumPreviewStorageId")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS contents_small_preview_storage_idx
     ON contents ("smallPreviewStorageId")`,

  // contents user library listing (user-scoped paged reads).
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS contents_user_created_idx
     ON contents ("userId", "createdAt", "id")`,

  // contents manifest lookup (getContentByManifestId currently global findOne).
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS contents_manifest_storage_idx
     ON contents ("manifestStorageId")`,

  // file catalog reference back to a content row (countContentReferences + delete refcount).
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS file_catalog_items_content_idx
     ON "fileCatalogItems" ("contentId")`,

  // quota SUM(size) by (userId, name) with an optional createdAt cutoff.
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS user_content_actions_user_name_created_idx
     ON "userContentActions" ("userId", "name", "createdAt")`,

  // content delete + accounting back-reference.
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS user_content_actions_content_idx
     ON "userContentActions" ("contentId")`,

  // staticIdHistories: getStaticIdItemByDynamicId queries by dynamicId ordered by boundAt.
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS static_id_histories_dynamic_bound_idx
     ON "staticIdHistories" ("dynamicId", "boundAt")`,
];

const DROP_STATEMENTS = [
  `DROP INDEX CONCURRENTLY IF EXISTS static_id_histories_dynamic_bound_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS user_content_actions_content_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS user_content_actions_user_name_created_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS file_catalog_items_content_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS contents_manifest_storage_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS contents_user_created_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS contents_small_preview_storage_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS contents_medium_preview_storage_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS contents_large_preview_storage_idx`,
];

module.exports = {
  useTransaction: false,

  up: async (queryInterface) => {
    for (const sql of STATEMENTS) {
      await queryInterface.sequelize.query(sql);
    }
  },

  down: async (queryInterface) => {
    for (const sql of DROP_STATEMENTS) {
      await queryInterface.sequelize.query(sql);
    }
  },
};
