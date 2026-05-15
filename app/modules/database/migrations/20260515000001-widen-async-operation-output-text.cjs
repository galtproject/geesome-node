'use strict';

/**
 * Database scalability review: allow async-operation result payloads to record
 * derived-state checkpoint details.
 *
 * `userAsyncOperations.output` was varchar(200), which was enough for tiny
 * status strings but too small for JSON that records post/group manifest and
 * static-directory storage ids. This is an existing-table column change, so it
 * belongs in the migration chain instead of relying on model sync.
 */

async function hasUserAsyncOperationsTable(queryInterface) {
  const [rows] = await queryInterface.sequelize.query(`
    SELECT to_regclass('"userAsyncOperations"') AS table_name
  `);
  return !!rows[0]?.table_name;
}

module.exports = {
  up: async (queryInterface, Sequelize) => {
    if (!(await hasUserAsyncOperationsTable(queryInterface))) {
      return;
    }

    await queryInterface.changeColumn('userAsyncOperations', 'output', {
      type: Sequelize.TEXT
    });
  },

  down: async (queryInterface) => {
    if (!(await hasUserAsyncOperationsTable(queryInterface))) {
      return;
    }

    await queryInterface.sequelize.query(`
      ALTER TABLE "userAsyncOperations"
      ALTER COLUMN output TYPE varchar(200)
      USING LEFT(output, 200)
    `);
  },
};
