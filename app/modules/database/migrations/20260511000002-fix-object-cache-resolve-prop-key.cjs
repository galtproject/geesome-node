'use strict';

/**
 * Database scalability review: object-cache key correction.
 *
 * Object cache reads include resolveProp in the lookup key, but the old
 * storageId-only unique index prevented caching both resolved and unresolved
 * variants for the same storage path. Keep the composite key and remove the
 * redundant single-column uniqueness.
 */

const EXPECTED_INDEX = 'objects_storage_resolve_prop_unique';

async function hasObjectsTable(queryInterface) {
  const [rows] = await queryInterface.sequelize.query(`
    SELECT to_regclass('objects') AS table_name
  `);
  return !!rows[0]?.table_name;
}

async function getObjectIndexes(queryInterface) {
  const [rows] = await queryInterface.sequelize.query(`
    SELECT
      index_class.relname AS name,
      pg_index.indisunique AS is_unique,
      ARRAY_AGG(attribute.attname ORDER BY indexed_column.ordinality) AS columns
    FROM pg_class table_class
      JOIN pg_index ON pg_index.indrelid = table_class.oid
      JOIN pg_class index_class ON index_class.oid = pg_index.indexrelid
      JOIN UNNEST(pg_index.indkey) WITH ORDINALITY AS indexed_column(attnum, ordinality) ON TRUE
      JOIN pg_attribute attribute
        ON attribute.attrelid = table_class.oid
        AND attribute.attnum = indexed_column.attnum
    WHERE table_class.oid = to_regclass('objects')
    GROUP BY index_class.relname, pg_index.indisunique
  `);
  return rows;
}

function columnsKey(index) {
  return normalizeColumns(index.columns).join(',');
}

function normalizeColumns(columns) {
  if (Array.isArray(columns)) {
    return columns.map((column) => String(column));
  }

  if (typeof columns !== 'string') {
    return [];
  }

  if (columns.startsWith('{') && columns.endsWith('}')) {
    const body = columns.slice(1, -1);

    if (!body) {
      return [];
    }

    return body.split(',').map((column) => column.replace(/^"|"$/g, ''));
  }

  return columns.split(',').map((column) => column.trim()).filter(Boolean);
}

function quoteIdentifier(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

async function ensureCompositeIndex(queryInterface) {
  const indexes = await getObjectIndexes(queryInterface);
  const compositeIndexes = indexes.filter((index) => (
    index.is_unique &&
    columnsKey(index) === 'storageId,resolveProp'
  ));

  if (compositeIndexes.some((index) => index.name === EXPECTED_INDEX)) {
    return;
  }

  if (compositeIndexes.length > 0) {
    await queryInterface.sequelize.query(`
      ALTER INDEX ${quoteIdentifier(compositeIndexes[0].name)}
        RENAME TO ${quoteIdentifier(EXPECTED_INDEX)}
    `);
    return;
  }

  await queryInterface.sequelize.query(`
    CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ${quoteIdentifier(EXPECTED_INDEX)}
      ON objects ("storageId", "resolveProp")
  `);
}

async function dropStorageOnlyIndexes(queryInterface) {
  const indexes = await getObjectIndexes(queryInterface);
  const storageOnlyIndexes = indexes.filter((index) => (
    index.is_unique &&
    columnsKey(index) === 'storageId'
  ));

  for (const index of storageOnlyIndexes) {
    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS ${quoteIdentifier(index.name)}
    `);
  }
}

async function normalizeResolveProp(queryInterface) {
  await queryInterface.sequelize.query(`
    UPDATE objects
    SET "resolveProp" = false
    WHERE "resolveProp" IS NULL
  `);

  await queryInterface.sequelize.query(`
    ALTER TABLE objects
      ALTER COLUMN "resolveProp" SET DEFAULT false,
      ALTER COLUMN "resolveProp" SET NOT NULL
  `);
}

module.exports = {
  useTransaction: false,

  up: async (queryInterface) => {
    if (!(await hasObjectsTable(queryInterface))) {
      return;
    }

    await normalizeResolveProp(queryInterface);
    await ensureCompositeIndex(queryInterface);
    await dropStorageOnlyIndexes(queryInterface);
  },

  down: async (queryInterface) => {
    if (!(await hasObjectsTable(queryInterface))) {
      return;
    }

    await queryInterface.sequelize.query(`
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY "storageId"
            ORDER BY "resolveProp" ASC, id ASC
          ) AS duplicate_rank
        FROM objects
        WHERE "storageId" IS NOT NULL
      )
      DELETE FROM objects object_cache
      USING ranked
      WHERE object_cache.id = ranked.id
        AND ranked.duplicate_rank > 1
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS objects_storage_id_unique
        ON objects ("storageId")
    `);
  },
};
