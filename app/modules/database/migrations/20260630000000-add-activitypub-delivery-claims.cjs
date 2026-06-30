'use strict';

/**
 * ActivityPub delivery workers need short-lived DB claims so two node
 * processes do not send the same due inbox activity at the same time.
 */

async function hasActivityPubDeliveriesTable(queryInterface) {
  const [rows] = await queryInterface.sequelize.query(`
    SELECT to_regclass('"activityPubDeliveries"') AS table_name
  `);

  return !!rows[0]?.table_name;
}

module.exports = {
  useTransaction: false,

  up: async (queryInterface) => {
    if (!(await hasActivityPubDeliveriesTable(queryInterface))) {
      return;
    }

    await queryInterface.sequelize.query(`
      ALTER TABLE "activityPubDeliveries"
        ADD COLUMN IF NOT EXISTS "deliveryClaimedAt" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "deliveryClaimExpiresAt" TIMESTAMP WITH TIME ZONE
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS activity_pub_deliveries_claim_idx
        ON "activityPubDeliveries" (state, "nextAttemptAt", "deliveryClaimExpiresAt", id)
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS activity_pub_deliveries_claim_idx
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE "activityPubDeliveries"
        DROP COLUMN IF EXISTS "deliveryClaimExpiresAt",
        DROP COLUMN IF EXISTS "deliveryClaimedAt"
    `);
  },
};
