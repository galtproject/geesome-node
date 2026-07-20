'use strict';

/**
 * Supports cursor-paginated composition listing without scanning ordinary
 * posts or parsing propertiesJson. CONCURRENTLY requires no transaction.
 */
const INDEX_NAME = 'posts_group_type_timeline_idx';

module.exports = {
  useTransaction: false,

  up: async (queryInterface) => {
    await queryInterface.sequelize.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${INDEX_NAME}
         ON posts ("groupId", "type", "isDeleted", "status", "publishedAt", "id")`
    );
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(
      `DROP INDEX CONCURRENTLY IF EXISTS ${INDEX_NAME}`
    );
  },
};
