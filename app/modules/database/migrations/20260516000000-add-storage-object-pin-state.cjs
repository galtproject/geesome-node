'use strict';

/**
 * Database scalability review: move local physical pin state onto the
 * canonical storage-object registry while keeping Content.isPinned as the
 * compatibility marker for current library rows.
 */

async function hasStorageObjectsTable(queryInterface) {
  const [rows] = await queryInterface.sequelize.query(`
    SELECT to_regclass('"storageObjects"') AS table_name
  `);
  return !!rows[0]?.table_name;
}

module.exports = {
  up: async (queryInterface) => {
    if (!(await hasStorageObjectsTable(queryInterface))) {
      return;
    }

    await queryInterface.sequelize.query(`
      ALTER TABLE "storageObjects"
      ADD COLUMN IF NOT EXISTS "isPinned" BOOLEAN NOT NULL DEFAULT false
    `);
  },

  down: async (queryInterface) => {
    if (!(await hasStorageObjectsTable(queryInterface))) {
      return;
    }

    await queryInterface.sequelize.query(`
      ALTER TABLE "storageObjects"
      DROP COLUMN IF EXISTS "isPinned"
    `);
  },
};
