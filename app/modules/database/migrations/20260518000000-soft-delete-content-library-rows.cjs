'use strict';

/**
 * Content library cleanup policy.
 *
 * Content is a user-owned library row. Deleting the last catalog reference
 * should hide the library row first, then let the storage-removal queue remove
 * physical bytes after its final reference check. Same-user storage duplicates
 * are tolerated as legacy data and resolved through actor-scoped deterministic
 * lookups rather than a Content(userId, storageId) uniqueness constraint.
 */

module.exports = {
  useTransaction: false,

  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      ALTER TABLE contents
        ADD COLUMN IF NOT EXISTS "isDeleted" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "deletedAt" timestamp with time zone
    `);

    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS contents_user_storage_unique
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      DELETE FROM contents
      WHERE "isDeleted" IS TRUE
    `);

    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS contents_user_storage_unique
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE contents
        DROP COLUMN IF EXISTS "deletedAt",
        DROP COLUMN IF EXISTS "isDeleted"
    `);
  },
};
