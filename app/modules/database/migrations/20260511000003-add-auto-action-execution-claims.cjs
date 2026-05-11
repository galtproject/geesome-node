'use strict';

/**
 * Database scalability review: AutoAction execution claims.
 *
 * Cron workers need a durable, short-lived claim so two node processes do not
 * select and run the same due action at the same time. Claims expire, so a
 * crashed worker leaves work retryable after the configured TTL.
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
      ALTER TABLE "autoActions"
        ADD COLUMN IF NOT EXISTS "executeClaimedAt" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "executeClaimExpiresAt" TIMESTAMP WITH TIME ZONE
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_actions_active_execute_claim_idx
        ON "autoActions" ("isActive", "executeOn", "executeClaimExpiresAt", "id")
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS auto_actions_active_execute_claim_idx
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE "autoActions"
        DROP COLUMN IF EXISTS "executeClaimExpiresAt",
        DROP COLUMN IF EXISTS "executeClaimedAt"
    `);
  },
};
