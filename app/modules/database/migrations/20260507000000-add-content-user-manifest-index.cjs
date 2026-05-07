'use strict';

/**
 * Database scalability review: actor-scoped content manifest lookup.
 *
 * Post attachment by manifest ID now resolves through the acting user's
 * Content row, creating/importing that actor-owned row when needed. This
 * index backs getContentByManifestAndUserId(manifestStorageId, userId)
 * without making manifest IDs globally unique.
 *
 * Postgres-only target. CREATE INDEX CONCURRENTLY runs outside any
 * wrapping transaction. Errors propagate so deploy tooling fails loudly.
 */

module.exports = {
  useTransaction: false,

  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS contents_user_manifest_storage_idx
        ON contents ("userId", "manifestStorageId")
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS contents_user_manifest_storage_idx
    `);
  },
};
