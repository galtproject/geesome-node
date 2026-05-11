'use strict';

/**
 * Database scalability review: auto-action user management list index.
 *
 * The user-facing auto-action endpoint pages by user and defaults to
 * createdAt/id ordering. Add the matching lookup index concurrently so large
 * scheduled-action histories do not require a full autoActions scan.
 */

async function hasAutoActionsTable(queryInterface) {
  const [rows] = await queryInterface.sequelize.query(`
    SELECT to_regclass('"autoActions"') AS table_name
  `);
  return !!rows[0]?.table_name;
}

module.exports = {
  useTransaction: false,

  up: async (queryInterface) => {
    if (!(await hasAutoActionsTable(queryInterface))) {
      return;
    }

    await queryInterface.sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_actions_user_created_idx
        ON "autoActions" ("userId", "createdAt", "id")
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS auto_actions_user_created_idx
    `);
  },
};
