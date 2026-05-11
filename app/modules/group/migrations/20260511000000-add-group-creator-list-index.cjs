'use strict';

/**
 * Database scalability review: creator-owned group listing index.
 *
 * Personal-chat and creator/type group lookups filter by creatorId, type, and
 * isDeleted. The user-facing personal-chat list also defaults to createdAt
 * ordering, so keep that path index-backed for users with many groups.
 */

async function hasGroupsTable(queryInterface) {
  const [rows] = await queryInterface.sequelize.query(`
    SELECT to_regclass('groups') AS table_name
  `);
  return !!rows[0]?.table_name;
}

module.exports = {
  useTransaction: false,

  up: async (queryInterface) => {
    if (!(await hasGroupsTable(queryInterface))) {
      return;
    }

    await queryInterface.sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS groups_creator_type_deleted_created_idx
        ON groups ("creatorId", type, "isDeleted", "createdAt", id)
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS groups_creator_type_deleted_created_idx
    `);
  },
};
