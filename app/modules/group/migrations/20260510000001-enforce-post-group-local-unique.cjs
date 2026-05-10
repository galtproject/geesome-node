'use strict';

/**
 * Database scalability review: group-local post identity cleanup.
 *
 * Group manifests and static post paths use (groupId, localId) as the stable
 * in-group post identity. Existing production rows may contain duplicates
 * from old concurrent allocation/import paths, so preserve all posts by keeping
 * the oldest row at its original localId and assigning duplicate rows new IDs
 * above the current group high-water mark. CREATE INDEX CONCURRENTLY must run
 * outside a migration transaction.
 */

module.exports = {
  useTransaction: false,

  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      WITH ranked AS (
        SELECT
          id,
          "groupId",
          "localId",
          ROW_NUMBER() OVER (
            PARTITION BY "groupId", "localId"
            ORDER BY id ASC
          ) AS duplicate_rank
        FROM posts
        WHERE "groupId" IS NOT NULL
          AND "localId" IS NOT NULL
      ),
      duplicate_posts AS (
        SELECT
          id,
          "groupId"
        FROM ranked
        WHERE duplicate_rank > 1
      ),
      group_max AS (
        SELECT
          "groupId",
          COALESCE(MAX("localId"), 0) AS max_local_id
        FROM posts
        WHERE "groupId" IS NOT NULL
        GROUP BY "groupId"
      ),
      reassigned AS (
        SELECT
          duplicate_posts.id,
          group_max.max_local_id + ROW_NUMBER() OVER (
            PARTITION BY duplicate_posts."groupId"
            ORDER BY duplicate_posts.id ASC
          ) AS new_local_id
        FROM duplicate_posts
        INNER JOIN group_max ON group_max."groupId" = duplicate_posts."groupId"
      )
      UPDATE posts
      SET "localId" = reassigned.new_local_id
      FROM reassigned
      WHERE posts.id = reassigned.id
    `);

    await queryInterface.sequelize.query(`
      WITH group_max AS (
        SELECT
          "groupId",
          COALESCE(MAX("localId"), 0) AS max_local_id
        FROM posts
        WHERE "groupId" IS NOT NULL
        GROUP BY "groupId"
      )
      UPDATE groups
      SET "publishedPostsCount" = GREATEST(COALESCE(groups."publishedPostsCount", 0), group_max.max_local_id)
      FROM group_max
      WHERE groups.id = group_max."groupId"
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS posts_group_local_unique
        ON posts ("groupId", "localId")
    `);

    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS posts_group_local_idx
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_group_local_idx
        ON posts ("groupId", "localId")
    `);

    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS posts_group_local_unique
    `);
  },
};
