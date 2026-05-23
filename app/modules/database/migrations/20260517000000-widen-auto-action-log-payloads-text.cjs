'use strict';

/**
 * Runtime stability: auto-action logs store JSON payloads.
 *
 * Successful action responses and failure messages can exceed varchar(255).
 * Widen the existing log columns so successful actions do not fail only because
 * their diagnostic log payload is larger than the old default STRING column.
 */

async function hasAutoActionLogsTable(queryInterface) {
  const [rows] = await queryInterface.sequelize.query(`
    SELECT to_regclass('"autoActionLogs"') AS table_name
  `);

  return !!rows[0]?.table_name;
}

module.exports = {
  up: async (queryInterface, Sequelize) => {
    if (!(await hasAutoActionLogsTable(queryInterface))) {
      return;
    }

    await queryInterface.changeColumn('autoActionLogs', 'error', {
      type: Sequelize.TEXT
    });
    await queryInterface.changeColumn('autoActionLogs', 'response', {
      type: Sequelize.TEXT
    });
  },

  down: async (queryInterface) => {
    if (!(await hasAutoActionLogsTable(queryInterface))) {
      return;
    }

    await queryInterface.sequelize.query(`
      ALTER TABLE "autoActionLogs"
      ALTER COLUMN error TYPE varchar(255)
      USING LEFT(error, 255)
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE "autoActionLogs"
      ALTER COLUMN response TYPE varchar(255)
      USING LEFT(response, 255)
    `);
  },
};
