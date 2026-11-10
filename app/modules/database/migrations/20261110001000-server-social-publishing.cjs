'use strict';

async function exists(sequelize, name, transaction) {
  const [rows] = await sequelize.query('SELECT to_regclass(:name) AS relation', {replacements: {name: '"' + name + '"'}, transaction});
  return !!rows[0].relation;
}
module.exports = {
  up: async queryInterface => {
    const sequelize = queryInterface.sequelize;
    await sequelize.transaction(async transaction => {
      if (await exists(sequelize, 'publicationJobs', transaction)) {
        await sequelize.query('ALTER TABLE "publicationJobs" ADD COLUMN IF NOT EXISTS "serverAccountId" INTEGER, ADD COLUMN IF NOT EXISTS "accountIdentity" VARCHAR(200), ALTER COLUMN "localAccountId" DROP NOT NULL', {transaction});
      }
      if (await exists(sequelize, 'publicationDestinations', transaction)) {
        await sequelize.query('ALTER TABLE "publicationDestinations" ADD COLUMN IF NOT EXISTS "accountIdentity" VARCHAR(200), ALTER COLUMN "clientId" DROP NOT NULL, ALTER COLUMN "localAccountId" DROP NOT NULL', {transaction});
        await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS "publication_destinations_server_key_unique" ON "publicationDestinations" ("userId", "executionMode", "localKey") WHERE "executionMode" = \'server\'', {transaction});
      }
      if (await exists(sequelize, 'socNetAccounts', transaction)) {
        await sequelize.query('ALTER TABLE "socNetAccounts" ADD COLUMN IF NOT EXISTS "serverCredentialsEncrypted" TEXT', {transaction});
      }
    });
  },
  down: async queryInterface => {
    const sequelize = queryInterface.sequelize;
    await sequelize.transaction(async transaction => {
      const [jobs] = await exists(sequelize, 'publicationJobs', transaction) ? await sequelize.query('SELECT 1 FROM "publicationJobs" WHERE "executionMode"=\'server\' LIMIT 1', {transaction}) : [[]];
      const [destinations] = await exists(sequelize, 'publicationDestinations', transaction) ? await sequelize.query('SELECT 1 FROM "publicationDestinations" WHERE "executionMode"=\'server\' LIMIT 1', {transaction}) : [[]];
      const [accounts] = await exists(sequelize, 'socNetAccounts', transaction) ? await sequelize.query('SELECT 1 FROM "socNetAccounts" WHERE "serverCredentialsEncrypted" IS NOT NULL LIMIT 1', {transaction}) : [[]];
      if (jobs.length || destinations.length || accounts.length) {
        throw new Error('server_publication_data_prevents_rollback');
      }
      if (await exists(sequelize, 'publicationJobs', transaction)) {
        await sequelize.query('ALTER TABLE "publicationJobs" DROP COLUMN IF EXISTS "serverAccountId", DROP COLUMN IF EXISTS "accountIdentity", ALTER COLUMN "localAccountId" SET NOT NULL', {transaction});
      }
      await sequelize.query('DROP INDEX IF EXISTS "publication_destinations_server_key_unique"', {transaction});
      if (await exists(sequelize, 'publicationDestinations', transaction)) {
        await sequelize.query('ALTER TABLE "publicationDestinations" DROP COLUMN IF EXISTS "accountIdentity", ALTER COLUMN "clientId" SET NOT NULL, ALTER COLUMN "localAccountId" SET NOT NULL', {transaction});
      }
      if (await exists(sequelize, 'socNetAccounts', transaction)) {
        await sequelize.query('ALTER TABLE "socNetAccounts" DROP COLUMN IF EXISTS "serverCredentialsEncrypted"', {transaction});
      }
    });
  }
};
