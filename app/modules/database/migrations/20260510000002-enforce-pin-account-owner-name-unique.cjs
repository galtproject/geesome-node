'use strict';

/**
 * Database scalability review: pin-account owner/name cleanup.
 *
 * Runtime reads pin accounts by either (userId, name) or (groupId, name), but
 * the old unique index also included nullable owner columns and did not make
 * either lookup deterministic. Preserve existing duplicate credentials by
 * renaming the duplicate rows, then enforce the two runtime lookup contracts.
 */

async function hasPinAccountsTable(queryInterface) {
  const [rows] = await queryInterface.sequelize.query(`
    SELECT to_regclass('"pinAccounts"') AS table_name
  `);
  return !!rows[0]?.table_name;
}

function duplicateNameExpression(tableAlias) {
  return `
    LEFT(${tableAlias}.name, GREATEST(0, 100 - LENGTH(' duplicate ' || ${tableAlias}.id::text)))
      || ' duplicate '
      || ${tableAlias}.id::text
  `;
}

module.exports = {
  useTransaction: false,

  up: async (queryInterface) => {
    if (!(await hasPinAccountsTable(queryInterface))) {
      return;
    }

    await queryInterface.sequelize.query(`
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY "userId", name
            ORDER BY "updatedAt" DESC NULLS LAST, "createdAt" DESC NULLS LAST, id DESC
          ) AS duplicate_rank
        FROM "pinAccounts"
        WHERE "userId" IS NOT NULL
          AND name IS NOT NULL
      )
      UPDATE "pinAccounts" account
      SET
        name = ${duplicateNameExpression('account')},
        "updatedAt" = NOW()
      FROM ranked
      WHERE account.id = ranked.id
        AND ranked.duplicate_rank > 1
    `);

    await queryInterface.sequelize.query(`
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY "groupId", name
            ORDER BY "updatedAt" DESC NULLS LAST, "createdAt" DESC NULLS LAST, id DESC
          ) AS duplicate_rank
        FROM "pinAccounts"
        WHERE "groupId" IS NOT NULL
          AND name IS NOT NULL
      )
      UPDATE "pinAccounts" account
      SET
        name = ${duplicateNameExpression('account')},
        "updatedAt" = NOW()
      FROM ranked
      WHERE account.id = ranked.id
        AND ranked.duplicate_rank > 1
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS pin_accounts_user_name_unique
        ON "pinAccounts" ("userId", name)
        WHERE "userId" IS NOT NULL
          AND name IS NOT NULL
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS pin_accounts_group_name_unique
        ON "pinAccounts" ("groupId", name)
        WHERE "groupId" IS NOT NULL
          AND name IS NOT NULL
    `);

    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS pin_accounts_user_name_idx
    `);

    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS pin_accounts_group_name_idx
    `);

    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS pin_accounts_name_user_id_group_id
    `);
  },

  down: async (queryInterface) => {
    if (!(await hasPinAccountsTable(queryInterface))) {
      return;
    }

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS pin_accounts_name_user_id_group_id
        ON "pinAccounts" (name, "userId", "groupId")
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS pin_accounts_user_name_idx
        ON "pinAccounts" ("userId", name)
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS pin_accounts_group_name_idx
        ON "pinAccounts" ("groupId", name)
    `);

    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS pin_accounts_group_name_unique
    `);

    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS pin_accounts_user_name_unique
    `);
  },
};
