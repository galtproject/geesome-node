'use strict';

/**
 * Database scalability review: async-operation queue retention indexes.
 *
 * Finished async operations can be deleted in bounded startup batches, and the
 * linked queue rows need index-backed deletes/updates rather than table scans.
 */

async function hasUserOperationQueuesTable(queryInterface) {
  const [rows] = await queryInterface.sequelize.query(`
    SELECT to_regclass('"userOperationQueues"') AS table_name
  `);
  return !!rows[0]?.table_name;
}

module.exports = {
  useTransaction: false,

  up: async (queryInterface) => {
    if (!(await hasUserOperationQueuesTable(queryInterface))) {
      return;
    }

    await queryInterface.sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS user_operation_queues_async_operation_idx
        ON "userOperationQueues" ("asyncOperationId")
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS user_operation_queues_waiting_async_updated_idx
        ON "userOperationQueues" ("isWaiting", "asyncOperationId", "updatedAt", "id")
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS user_operation_queues_waiting_async_updated_idx
    `);

    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS user_operation_queues_async_operation_idx
    `);
  },
};
