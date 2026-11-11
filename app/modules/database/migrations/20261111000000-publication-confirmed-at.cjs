'use strict';

module.exports = {
  useTransaction: false,
  up: async queryInterface => {
    const sequelize = queryInterface.sequelize;
    const [rows] = await sequelize.query(`SELECT to_regclass('"publicationJobs"') AS relation`);
    if (!rows[0].relation) {
      return;
    }
    await sequelize.query(`ALTER TABLE "publicationJobs" ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMP WITH TIME ZONE`);
    // Posted is terminal; historical updatedAt records its accepted acknowledgement.
    await sequelize.query(`UPDATE "publicationJobs" SET "confirmedAt"="updatedAt" WHERE status='posted' AND "confirmedAt" IS NULL`);
    await sequelize.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS publication_jobs_owner_destination_confirmed_idx ON "publicationJobs" ("userId", "destinationId", "confirmedAt") WHERE status='posted'`);
  },
  down: async queryInterface => {
    await queryInterface.sequelize.query('DROP INDEX CONCURRENTLY IF EXISTS publication_jobs_owner_destination_confirmed_idx');
    await queryInterface.sequelize.query('ALTER TABLE "publicationJobs" DROP COLUMN IF EXISTS "confirmedAt"');
  }
};
