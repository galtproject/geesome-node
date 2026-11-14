'use strict';

module.exports = {
  up: async queryInterface => {
    await queryInterface.sequelize.query(`DO $$ BEGIN
      IF to_regclass('"publicationDestinations"') IS NOT NULL THEN
        ALTER TABLE "publicationDestinations" ADD COLUMN IF NOT EXISTS "shuffleEnabled" BOOLEAN NOT NULL DEFAULT true;
        ALTER TABLE "publicationDestinations" ADD COLUMN IF NOT EXISTS "randomDelayEnabled" BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE "publicationDestinations" ADD COLUMN IF NOT EXISTS "randomDelayNextCheckAt" TIMESTAMP WITH TIME ZONE;
      END IF;
    END $$`);
  },
  down: async queryInterface => {
    await queryInterface.sequelize.query('ALTER TABLE IF EXISTS "publicationDestinations" DROP COLUMN IF EXISTS "randomDelayNextCheckAt"');
    await queryInterface.sequelize.query('ALTER TABLE IF EXISTS "publicationDestinations" DROP COLUMN IF EXISTS "randomDelayEnabled"');
    await queryInterface.sequelize.query('ALTER TABLE IF EXISTS "publicationDestinations" DROP COLUMN IF EXISTS "shuffleEnabled"');
  }
};
