'use strict';

/**
 * Database scalability review: Static ID current bindings.
 *
 * StaticIdHistory stays as the audit trail, while staticIdBindings keeps one
 * current row per static id so hot resolution does not scan churn-heavy history.
 */

module.exports = {
  useTransaction: false,

  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS "staticIdBindings" (
        id SERIAL PRIMARY KEY,
        "staticId" VARCHAR(200) NOT NULL,
        "dynamicId" VARCHAR(200),
        "isActive" BOOLEAN,
        "boundAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS static_id_bindings_static_unique
        ON "staticIdBindings" ("staticId")
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS static_id_bindings_dynamic_bound_idx
        ON "staticIdBindings" ("dynamicId", "boundAt")
    `);

    await queryInterface.sequelize.query(`
      INSERT INTO "staticIdBindings" ("staticId", "dynamicId", "isActive", "boundAt", "createdAt", "updatedAt")
      SELECT
        latest."staticId",
        latest."dynamicId",
        latest."isActive",
        latest."boundAt",
        NOW(),
        NOW()
      FROM (
        SELECT DISTINCT ON ("staticId")
          "staticId",
          "dynamicId",
          "isActive",
          "boundAt",
          id
        FROM "staticIdHistories"
        WHERE "staticId" IS NOT NULL
        ORDER BY "staticId", "boundAt" DESC NULLS LAST, id DESC
      ) latest
      ON CONFLICT ("staticId") DO UPDATE
      SET
        "dynamicId" = EXCLUDED."dynamicId",
        "isActive" = EXCLUDED."isActive",
        "boundAt" = EXCLUDED."boundAt",
        "updatedAt" = NOW()
      WHERE "staticIdBindings"."boundAt" IS NULL
        OR EXCLUDED."boundAt" IS NULL
        OR EXCLUDED."boundAt" >= "staticIdBindings"."boundAt"
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS static_id_bindings_dynamic_bound_idx
    `);

    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS static_id_bindings_static_unique
    `);

    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS "staticIdBindings"
    `);
  },
};
