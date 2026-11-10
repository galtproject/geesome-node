'use strict';

async function exists(sequelize, table, transaction) {
  const [rows] = await sequelize.query('SELECT to_regclass(:table) AS relation', {replacements: {table: '"' + table + '"'}, transaction});
  return !!rows[0].relation;
}

module.exports = {
  up: async queryInterface => {
    const sequelize = queryInterface.sequelize;
    await sequelize.transaction(async transaction => {
      for (const table of ['publicationDestinations', 'publicationJobs']) {
        if (await exists(sequelize, table, transaction)) {
          await sequelize.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "contentPolicy" VARCHAR(20)`, {transaction});
        }
      }
    });
  },
  down: async queryInterface => {
    const sequelize = queryInterface.sequelize;
    await sequelize.transaction(async transaction => {
      for (const table of ['publicationDestinations', 'publicationJobs']) {
        if (await exists(sequelize, table, transaction)) {
          const [rows] = await sequelize.query(`SELECT 1 FROM "${table}" WHERE "contentPolicy" IS NOT NULL LIMIT 1`, {transaction});
          if (rows.length) {
            throw new Error('publication_content_policy_prevents_rollback');
          }
        }
      }
      for (const table of ['publicationDestinations', 'publicationJobs']) {
        if (await exists(sequelize, table, transaction)) {
          await sequelize.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "contentPolicy"`, {transaction});
        }
      }
    });
  }
};
