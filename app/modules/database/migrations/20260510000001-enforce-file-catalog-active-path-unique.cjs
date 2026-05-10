'use strict';

/**
 * Database scalability review: file-catalog active path cleanup.
 *
 * Older nodes only cleaned duplicate catalog paths opportunistically when a
 * path was read. Collapse those existing active duplicates first, preserving
 * the newest visible item for each user/parent/name path, then add partial
 * unique indexes that handle root rows separately because parentItemId is NULL.
 */

async function hasFileCatalogItemsTable(queryInterface) {
  const [rows] = await queryInterface.sequelize.query(`
    SELECT to_regclass('"fileCatalogItems"') AS table_name
  `);
  return !!rows[0]?.table_name;
}

module.exports = {
  useTransaction: false,

  up: async (queryInterface) => {
    if (!(await hasFileCatalogItemsTable(queryInterface))) {
      return;
    }

    await queryInterface.sequelize.query(`
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY "userId", "parentItemId", name
            ORDER BY "createdAt" DESC NULLS LAST, id DESC
          ) AS duplicate_rank
        FROM "fileCatalogItems"
        WHERE "isDeleted" = false
          AND "userId" IS NOT NULL
          AND name IS NOT NULL
      )
      UPDATE "fileCatalogItems" item
      SET
        "isDeleted" = true,
        "updatedAt" = NOW()
      FROM ranked
      WHERE item.id = ranked.id
        AND ranked.duplicate_rank > 1
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS file_catalog_items_user_parent_list_idx
        ON "fileCatalogItems" ("userId", "parentItemId", "isDeleted", type, "createdAt", id)
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS file_catalog_items_child_path_unique
        ON "fileCatalogItems" ("parentItemId", "userId", name)
        WHERE "isDeleted" = false
          AND "parentItemId" IS NOT NULL
          AND "userId" IS NOT NULL
          AND name IS NOT NULL
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS file_catalog_items_root_path_unique
        ON "fileCatalogItems" ("userId", name)
        WHERE "isDeleted" = false
          AND "parentItemId" IS NULL
          AND "userId" IS NOT NULL
          AND name IS NOT NULL
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS file_catalog_items_root_path_unique
    `);

    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS file_catalog_items_child_path_unique
    `);

    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS file_catalog_items_user_parent_list_idx
    `);
  },
};
