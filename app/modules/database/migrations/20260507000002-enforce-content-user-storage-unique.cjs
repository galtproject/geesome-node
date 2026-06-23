'use strict';

/**
 * Database scalability review: content identity compatibility.
 *
 * Content remains a user-owned library row, so different users may keep
 * separate metadata rows for the same physical storageId. Production data also
 * contains legacy same-user duplicate storage rows, and forcing uniqueness here
 * can block startup before the migration chain has a chance to run.
 *
 * The former version of this migration deduped rows and created
 * contents_user_storage_unique. That constraint has been reverted: callers must
 * keep using actor-scoped deterministic lookups instead of relying on a DB
 * uniqueness invariant for Content(userId, storageId).
 */

module.exports = {
  useTransaction: false,

  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS contents_user_storage_unique
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS contents_user_storage_unique
    `);
  },
};
