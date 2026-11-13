'use strict';

module.exports = {
  up: async queryInterface => {
    await queryInterface.sequelize.query(`DO $$ BEGIN
      IF to_regclass('"publicationDestinations"') IS NOT NULL THEN
        ALTER TABLE "publicationDestinations" ADD COLUMN IF NOT EXISTS "defaultDelayMinutes" INTEGER;
      END IF;
    END $$`);
  },
  down: async queryInterface => {
    await queryInterface.sequelize.query('ALTER TABLE IF EXISTS "publicationDestinations" DROP COLUMN IF EXISTS "defaultDelayMinutes"');
  }
};
