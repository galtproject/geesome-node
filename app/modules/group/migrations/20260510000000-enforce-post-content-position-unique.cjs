'use strict';

/**
 * Database scalability review: post attachment order cleanup.
 *
 * PostsContents.position is the per-post attachment order used by manifests,
 * API hydration, and generated output. Existing rows may contain duplicate
 * positions from old retry/concurrency paths, so keep the newest row for each
 * (postId, position), remove older ambiguous rows, then enforce deterministic
 * ordering with a unique index. CREATE INDEX CONCURRENTLY must run outside a
 * migration transaction.
 */

module.exports = {
  useTransaction: false,

  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      WITH ranked AS (
        SELECT
          "postId",
          "contentId",
          ROW_NUMBER() OVER (
            PARTITION BY "postId", position
            ORDER BY "updatedAt" DESC NULLS LAST, "contentId" DESC
          ) AS row_num
        FROM "postsContents"
        WHERE "postId" IS NOT NULL
          AND position IS NOT NULL
      )
      DELETE FROM "postsContents" duplicate
      USING ranked
      WHERE duplicate."postId" = ranked."postId"
        AND duplicate."contentId" = ranked."contentId"
        AND ranked.row_num > 1
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS posts_contents_post_position_unique
        ON "postsContents" ("postId", position)
    `);

    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS posts_contents_post_position_idx
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_contents_post_position_idx
        ON "postsContents" ("postId", position)
    `);

    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS posts_contents_post_position_unique
    `);
  },
};
