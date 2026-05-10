'use strict';

/**
 * Database scalability review: user-limit identity cleanup.
 *
 * Runtime set/get paths treat a user limit as one row per (userId, name).
 * Existing production databases may have duplicates from old repeated writes,
 * so keep the newest configured row, remove older duplicates, then enforce the
 * runtime contract with a unique index. CREATE INDEX CONCURRENTLY must run
 * outside a migration transaction.
 */

module.exports = {
  useTransaction: false,

  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY "userId", name
            ORDER BY "updatedAt" DESC NULLS LAST, id DESC
          ) AS row_num
        FROM "userLimits"
        WHERE "userId" IS NOT NULL
          AND name IS NOT NULL
      )
      DELETE FROM "userLimits" duplicate
      USING ranked
      WHERE duplicate.id = ranked.id
        AND ranked.row_num > 1
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS user_limits_user_name_unique
        ON "userLimits" ("userId", name)
        WHERE "userId" IS NOT NULL
          AND name IS NOT NULL
    `);

    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS user_limits_user_name_idx
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS user_limits_user_name_idx
        ON "userLimits" ("userId", name)
    `);

    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS user_limits_user_name_unique
    `);
  },
};
