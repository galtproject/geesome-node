'use strict';

/**
 * Database scalability review: prepare the canonical storage-object registry
 * for ownerless/federated objects without creating user-owned Content rows.
 */

async function hasStorageObjectsTable(queryInterface) {
  const [rows] = await queryInterface.sequelize.query(`
    SELECT to_regclass('"storageObjects"') AS table_name
  `);
  return !!rows[0]?.table_name;
}

module.exports = {
  useTransaction: false,

  up: async (queryInterface) => {
    if (!(await hasStorageObjectsTable(queryInterface))) {
      return;
    }

    await queryInterface.sequelize.query(`
      ALTER TABLE "storageObjects"
        ADD COLUMN IF NOT EXISTS "identityType" VARCHAR(80),
        ADD COLUMN IF NOT EXISTS "identityId" VARCHAR(500),
        ADD COLUMN IF NOT EXISTS "identityUrl" TEXT,
        ADD COLUMN IF NOT EXISTS "identityUpdatedAt" TIMESTAMP WITH TIME ZONE
    `);

    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS storage_objects_identity_idx
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS storage_objects_identity_idx
        ON "storageObjects" ("identityType", "identityId")
        WHERE "identityType" IS NOT NULL
          AND "identityId" IS NOT NULL
    `);
  },

  down: async (queryInterface) => {
    if (!(await hasStorageObjectsTable(queryInterface))) {
      return;
    }

    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS storage_objects_identity_idx
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE "storageObjects"
        DROP COLUMN IF EXISTS "identityUpdatedAt",
        DROP COLUMN IF EXISTS "identityUrl",
        DROP COLUMN IF EXISTS "identityId",
        DROP COLUMN IF EXISTS "identityType"
    `);
  },
};
