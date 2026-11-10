'use strict';

async function exists(sequelize, table, transaction) {
  const [rows] = await sequelize.query('SELECT to_regclass(:table) AS relation', {replacements: {table: '"' + table + '"'}, transaction});
  return !!rows[0].relation;
}

module.exports = {
  up: async queryInterface => {
    const sequelize = queryInterface.sequelize;
    await sequelize.transaction(async transaction => {
      const destinations = await exists(sequelize, 'publicationDestinations', transaction);
      if (destinations) {
        const [alternates] = await sequelize.query(`SELECT 1 FROM "publicationDestinations" WHERE COALESCE(target->>'sfwChannelId','')<>'' OR COALESCE(target->>'sfwChatId','')<>'' LIMIT 1`, {transaction});
        if (alternates.length) {
          throw new Error('publication_split_alternate_destinations_before_upgrade');
        }
        await sequelize.query(`UPDATE "publicationDestinations" SET "contentPolicy"='nsfw' WHERE "contentPolicy" IS NULL`, {transaction});
        await sequelize.query(`ALTER TABLE "publicationDestinations" ALTER COLUMN "contentPolicy" SET DEFAULT 'nsfw', ALTER COLUMN "contentPolicy" SET NOT NULL`, {transaction});
        await sequelize.query(`UPDATE "publicationDestinations" SET target=target-'sfwChannelId'-'sfwChatId'`, {transaction});
      }
      if (await exists(sequelize, 'publicationJobs', transaction)) {
        await sequelize.query(`ALTER TABLE "publicationJobs" ADD COLUMN IF NOT EXISTS "contentType" VARCHAR(20), ADD COLUMN IF NOT EXISTS "intentVersion" INTEGER`, {transaction});
        await sequelize.query(`UPDATE "publicationJobs" SET "contentType"=CASE WHEN target->'sensitive'='false'::jsonb OR (network='rule34xxx' AND target->>'rating'='s') THEN 'sfw' ELSE 'nsfw' END WHERE "contentType" IS NULL`, {transaction});
        await sequelize.query(`UPDATE "publicationJobs" SET "contentPolicy"='nsfw' WHERE "contentPolicy" IS NULL`, {transaction});
        await sequelize.query(`ALTER TABLE "publicationJobs" ALTER COLUMN "contentPolicy" SET DEFAULT 'nsfw', ALTER COLUMN "contentPolicy" SET NOT NULL`, {transaction});
        await sequelize.query(`UPDATE "publicationJobs" SET target=CASE WHEN network='rule34xxx' THEN target-'sensitive'-'rating' ELSE target-'sensitive' END`, {transaction});
      }
    });
  },
  down: async () => {
    throw new Error('publication_content_type_upgrade_is_forward_only');
  }
};
