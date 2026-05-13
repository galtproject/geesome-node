'use strict';

/**
 * Database scalability review: content-bot user list index.
 *
 * The Telegram content-bot API lists bots by current user with capped pages.
 * Add the matching user lookup index concurrently for upgraded databases.
 */

async function hasContentBotsTable(queryInterface) {
  const [rows] = await queryInterface.sequelize.query(`
    SELECT to_regclass('"contentBots"') AS table_name
  `);

  return !!rows[0]?.table_name;
}

module.exports = {
  useTransaction: false,

  up: async (queryInterface) => {
    if (!(await hasContentBotsTable(queryInterface))) {
      return;
    }

    await queryInterface.sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS content_bots_user_id_idx
        ON "contentBots" ("userId")
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS content_bots_user_id_idx
    `);
  },
};
