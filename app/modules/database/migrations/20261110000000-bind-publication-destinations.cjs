'use strict';

async function hasJobs(queryInterface) {
  const [rows] = await queryInterface.sequelize.query(`SELECT to_regclass('"publicationJobs"') AS name`);
  return !!rows[0]?.name;
}

module.exports = {
  up: async (queryInterface) => {
    if (!await hasJobs(queryInterface)) {
      return;
    }
    await queryInterface.sequelize.query(`ALTER TABLE "publicationJobs"
      ADD COLUMN IF NOT EXISTS "destinationId" INTEGER,
      ADD COLUMN IF NOT EXISTS "clientId" VARCHAR(200),
      ADD COLUMN IF NOT EXISTS "executionMode" VARCHAR(20)`);
  },
  down: async (queryInterface) => {
    if (!await hasJobs(queryInterface)) {
      return;
    }
    const [rows] = await queryInterface.sequelize.query(`SELECT 1 FROM "publicationJobs" WHERE "destinationId" IS NOT NULL LIMIT 1`);
    if (rows.length) {
      throw new Error('publication_destination_jobs_prevent_rollback');
    }
    await queryInterface.sequelize.query(`ALTER TABLE "publicationJobs"
      DROP COLUMN IF EXISTS "destinationId", DROP COLUMN IF EXISTS "clientId", DROP COLUMN IF EXISTS "executionMode"`);
  }
};
