'use strict';

/**
 * Database scalability review: Slice 4 — first production index migration.
 *
 * Adds the safest high-value indexes for group post timelines, manifest
 * differential rebuild, social-import reversal scans, group-local lookup,
 * post-by-manifest lookup, and post-content join hydration.
 *
 * All indexes are non-unique and additive. They do not require duplicate
 * cleanup, so they are safe to land before the rest of the cleanup work.
 *
 * Postgres-only by project decision (F12). Index creation uses
 * CREATE INDEX CONCURRENTLY so deploys do not block writes against large
 * `posts` / `postsContents` tables. CONCURRENTLY cannot run inside a
 * transaction, so this migration opts out of Sequelize's wrapping
 * transaction (`useTransaction: false`).
 *
 * Migration error policy: this migration does NOT swallow failures with
 * `.catch(...)`. If any statement fails, the migration aborts so deploy
 * tooling can surface the problem. (Contrast with the legacy
 * `change-size-type.cjs` which logs and continues.)
 */

const STATEMENTS = [
  // Published timeline pages, unread counts, static/RSS newest-first scans.
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_group_timeline_idx
     ON posts ("groupId", "isDeleted", "status", "publishedAt", "id")`,

  // Group manifest differential rebuild (updatedAtGte filter) with deterministic tie-breaker.
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_group_manifest_cursor_idx
     ON posts ("groupId", "status", "updatedAt", "id")`,

  // Social-import reversal scans and cursor iteration by id within a group.
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_group_id_idx
     ON posts ("groupId", "id")`,

  // Group manifest local-post lookup by (groupId, localId).
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_group_local_idx
     ON posts ("groupId", "localId")`,

  // Post-by-manifest lookup (getPostByParams).
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_manifest_storage_id_idx
     ON posts ("manifestStorageId")`,

  // Content hydration in stable post order.
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_contents_post_position_idx
     ON "postsContents" ("postId", "position")`,

  // Reverse content-to-post lookups.
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_contents_content_idx
     ON "postsContents" ("contentId")`,
];

const DROP_STATEMENTS = [
  `DROP INDEX CONCURRENTLY IF EXISTS posts_contents_content_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS posts_contents_post_position_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS posts_manifest_storage_id_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS posts_group_local_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS posts_group_id_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS posts_group_manifest_cursor_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS posts_group_timeline_idx`,
];

module.exports = {
  // CONCURRENTLY requires running outside a transaction.
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
