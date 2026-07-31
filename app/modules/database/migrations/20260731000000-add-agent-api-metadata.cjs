'use strict';

async function hasTable(queryInterface, tableName) {
  const [rows] = await queryInterface.sequelize.query(`
    SELECT to_regclass(:tableName) AS table_name
  `, {replacements: {tableName: `"${tableName}"`}});
  return !!rows[0]?.table_name;
}

module.exports = {
  useTransaction: false,

  up: async (queryInterface) => {
    if (await hasTable(queryInterface, 'storageObjects')) {
      await queryInterface.sequelize.query(`
        ALTER TABLE "storageObjects"
          ADD COLUMN IF NOT EXISTS "sha256" VARCHAR(64)
      `);
      await queryInterface.sequelize.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS storage_objects_sha256_idx
          ON "storageObjects" ("sha256", "id")
      `);
    }

    if (await hasTable(queryInterface, 'userApiKeys')) {
      await queryInterface.sequelize.query(`
        ALTER TABLE "userApiKeys"
          ADD COLUMN IF NOT EXISTS "lastUsedAt" TIMESTAMP WITH TIME ZONE,
          ADD COLUMN IF NOT EXISTS "scopes" TEXT
      `);
    }

    if (await hasTable(queryInterface, 'userAsyncOperations')) {
      await queryInterface.sequelize.query(`
        ALTER TABLE "userAsyncOperations"
          ADD COLUMN IF NOT EXISTS "requestId" VARCHAR(128)
      `);
    }
  },

  down: async (queryInterface) => {
    if (await hasTable(queryInterface, 'storageObjects')) {
      await queryInterface.sequelize.query(`
        DROP INDEX CONCURRENTLY IF EXISTS storage_objects_sha256_idx
      `);
      await queryInterface.sequelize.query(`
        ALTER TABLE "storageObjects"
          DROP COLUMN IF EXISTS "sha256"
      `);
    }

    if (await hasTable(queryInterface, 'userApiKeys')) {
      await queryInterface.sequelize.query(`
        ALTER TABLE "userApiKeys"
          DROP COLUMN IF EXISTS "lastUsedAt",
          DROP COLUMN IF EXISTS "scopes"
      `);
    }


    if (await hasTable(queryInterface, 'userAsyncOperations')) {
      await queryInterface.sequelize.query(`
        ALTER TABLE "userAsyncOperations"
          DROP COLUMN IF EXISTS "requestId"
      `);
    }
  }
};
