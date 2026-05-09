'use strict';

/**
 * Database scalability review: tag/mention/auto-tag lookup indexes.
 *
 * These tables are quiet today, but they become large-list surfaces once
 * tags, mentions, ActivityPub addressing, search, or auto-tag feeds are
 * promoted. The indexes are all non-unique and additive, so no duplicate
 * cleanup or data rewrite is required.
 *
 * Postgres-only target. CREATE INDEX CONCURRENTLY runs outside any wrapping
 * transaction. Errors propagate so deploy tooling fails loudly.
 */

const STATEMENTS = [
  // Tag lookup by public name and manifest references.
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS tags_name_idx
     ON tags ("name")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS tags_manifest_storage_idx
     ON tags ("manifestStorageId")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS tags_manifest_static_storage_idx
     ON tags ("manifestStaticStorageId")`,

  // Tag feed filters and post tag hydration.
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS tagged_posts_post_tag_idx
     ON "taggedPosts" ("postId", "tagId")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS tagged_posts_tag_post_idx
     ON "taggedPosts" ("tagId", "postId")`,

  // Mention source/target graph lookups.
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS mentions_source_post_idx
     ON mentions ("sourcePostId")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS mentions_target_post_idx
     ON mentions ("targetPostId")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS mentions_source_group_idx
     ON mentions ("sourceGroupId")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS mentions_target_group_idx
     ON mentions ("targetGroupId")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS mentions_creator_idx
     ON mentions ("creatorId")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS mentions_manifest_storage_idx
     ON mentions ("manifestStorageId")`,

  // Auto-tag rule lookup by group and tag participants.
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_tags_group_idx
     ON "autoTags" ("groupId")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_tags_result_tag_idx
     ON "autoTags" ("resultTagId")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_tags_required_tag1_idx
     ON "autoTags" ("requiredTag1Id")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_tags_required_tag2_idx
     ON "autoTags" ("requiredTag2Id")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_tags_required_tag3_idx
     ON "autoTags" ("requiredTag3Id")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_tags_required_tag4_idx
     ON "autoTags" ("requiredTag4Id")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_tags_required_tag5_idx
     ON "autoTags" ("requiredTag5Id")`,
];

const DROP_STATEMENTS = [
  `DROP INDEX CONCURRENTLY IF EXISTS auto_tags_required_tag5_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS auto_tags_required_tag4_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS auto_tags_required_tag3_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS auto_tags_required_tag2_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS auto_tags_required_tag1_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS auto_tags_result_tag_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS auto_tags_group_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS mentions_manifest_storage_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS mentions_creator_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS mentions_target_group_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS mentions_source_group_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS mentions_target_post_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS mentions_source_post_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS tagged_posts_tag_post_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS tagged_posts_post_tag_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS tags_manifest_static_storage_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS tags_manifest_storage_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS tags_name_idx`,
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
