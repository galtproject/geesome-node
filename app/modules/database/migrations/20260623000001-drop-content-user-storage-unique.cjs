'use strict';

/**
 * Drop the reverted Content(userId, storageId) uniqueness constraint.
 *
 * Production restores can contain valid legacy duplicate rows for one user and
 * storageId. The runtime model no longer declares contents_user_storage_unique,
 * but databases that already applied the older migration still need the index
 * removed explicitly.
 */

module.exports = {
  useTransaction: false,

  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS contents_user_storage_unique
    `);
  },

  down: async () => {},
};
