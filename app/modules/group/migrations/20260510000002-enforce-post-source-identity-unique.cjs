'use strict';

/**
 * Database scalability review: social-import post source identity cleanup.
 *
 * Imported posts use (groupId, source, sourceChannelId, sourcePostId) as their
 * retry/idempotency key. Older databases may already have duplicate post rows
 * for the same remote item after parallel imports. Preserve every post row, but
 * keep the oldest row as the source identity owner and detach later duplicates
 * from the idempotency key before adding the unique partial index.
 */

module.exports = {
  useTransaction: false,

  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY "groupId", source, "sourceChannelId", "sourcePostId"
            ORDER BY id ASC
          ) AS duplicate_rank
        FROM posts
        WHERE "groupId" IS NOT NULL
          AND source IS NOT NULL
          AND "sourceChannelId" IS NOT NULL
          AND "sourcePostId" IS NOT NULL
      )
      UPDATE posts
      SET "sourcePostId" = NULL
      FROM ranked
      WHERE posts.id = ranked.id
        AND ranked.duplicate_rank > 1
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS posts_group_source_post_unique
        ON posts ("groupId", source, "sourceChannelId", "sourcePostId")
        WHERE "groupId" IS NOT NULL
          AND source IS NOT NULL
          AND "sourceChannelId" IS NOT NULL
          AND "sourcePostId" IS NOT NULL
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS posts_group_source_post_unique
    `);
  },
};
