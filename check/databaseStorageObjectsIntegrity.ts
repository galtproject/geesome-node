import {pathToFileURL} from 'node:url';
import {QueryTypes, Sequelize} from 'sequelize';
import databaseConfig from '../app/modules/database/config.js';

type CountRow = {
  count: string | number;
};

type IntegrityReport = {
  missingStorageObjects: number;
  mismatchedStorageObjects: number;
};

const storageObjectColumns = [
  'storageType',
  'mimeType',
  'extension',
  'size',
  'largePreviewStorageId',
  'largePreviewSize',
  'mediumPreviewStorageId',
  'mediumPreviewSize',
  'smallPreviewStorageId',
  'smallPreviewSize',
  'previewMimeType',
  'previewExtension',
];

async function run(): Promise<void> {
  const shouldRepair = process.argv.includes('--repair');

  if (shouldRepair && process.env.CONFIRM_STORAGE_OBJECT_REPAIR !== '1' && process.env.CONFIRM_RESTORED_BACKUP !== '1') {
    throw new Error('storage_object_repair_requires_CONFIRM_STORAGE_OBJECT_REPAIR_or_CONFIRM_RESTORED_BACKUP');
  }

  const sequelize = new Sequelize({
    ...(databaseConfig as any),
    logging: false,
  });

  try {
    await sequelize.authenticate();
    let report = await getIntegrityReport(sequelize);

    if (shouldRepair && (report.missingStorageObjects > 0 || report.mismatchedStorageObjects > 0)) {
      await repairStorageObjects(sequelize);
      report = await getIntegrityReport(sequelize);
    }

    console.log('Storage object integrity:');
    console.log(`  missing storageObjects: ${report.missingStorageObjects}`);
    console.log(`  mismatched storageObjects: ${report.mismatchedStorageObjects}`);

    if (report.missingStorageObjects > 0 || report.mismatchedStorageObjects > 0) {
      process.exitCode = 1;
      console.error('Run with --repair after backup/approval to reconcile storageObjects from contents.');
    }
  } finally {
    await sequelize.close();
  }
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (import.meta.url === entryPoint) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

async function getIntegrityReport(sequelize: Sequelize): Promise<IntegrityReport> {
  const canonicalSql = getCanonicalStorageObjectSql();
  const missingStorageObjects = await getCount(sequelize, `
    SELECT COUNT(*) AS count
    FROM (${canonicalSql}) canonical
    LEFT JOIN "storageObjects" storage_object
      ON storage_object."storageId" = canonical."storageId"
    WHERE storage_object.id IS NULL
  `);
  const mismatchedStorageObjects = await getCount(sequelize, `
    SELECT COUNT(*) AS count
    FROM (${canonicalSql}) canonical
    JOIN "storageObjects" storage_object
      ON storage_object."storageId" = canonical."storageId"
    WHERE ${getMismatchPredicate()}
  `);

  return {missingStorageObjects, mismatchedStorageObjects};
}

async function repairStorageObjects(sequelize: Sequelize): Promise<void> {
  const canonicalSql = getCanonicalStorageObjectSql();
  const insertColumns = ['storageId', ...storageObjectColumns, 'isPinned', 'createdAt', 'updatedAt'];
  const insertColumnSql = insertColumns.map(quoteIdentifier).join(', ');
  const selectColumnSql = [
    'canonical."storageId"',
    ...storageObjectColumns.map((column) => `canonical.${quoteIdentifier(column)}`),
    'canonical."isPinned"',
    'NOW()',
    'NOW()',
  ].join(', ');
  const updateColumnSql = [
    ...storageObjectColumns.map((column) => {
      const quoted = quoteIdentifier(column);

      return `${quoted} = EXCLUDED.${quoted}`;
    }),
    '"isPinned" = "storageObjects"."isPinned" OR EXCLUDED."isPinned"',
    '"updatedAt" = NOW()',
  ].join(',\n      ');

  await sequelize.query(`
    INSERT INTO "storageObjects" (${insertColumnSql})
    SELECT ${selectColumnSql}
    FROM (${canonicalSql}) canonical
    ON CONFLICT ("storageId") DO UPDATE SET
      ${updateColumnSql}
  `);
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function getCanonicalStorageObjectSql(): string {
  const contentColumns = storageObjectColumns.map((column) => quoteIdentifier(column)).join(', ');

  return `
    WITH canonical_content AS (
      SELECT DISTINCT ON ("storageId")
        "storageId",
        ${contentColumns}
      FROM contents
      WHERE "storageId" IS NOT NULL
      ORDER BY "storageId", id ASC
    ),
    pinned_content AS (
      SELECT
        "storageId",
        BOOL_OR(COALESCE("isPinned", false)) AS "isPinned"
      FROM contents
      WHERE "storageId" IS NOT NULL
      GROUP BY "storageId"
    )
    SELECT
      canonical_content.*,
      COALESCE(pinned_content."isPinned", false) AS "isPinned"
    FROM canonical_content
    LEFT JOIN pinned_content
      ON pinned_content."storageId" = canonical_content."storageId"
  `;
}

function getMismatchPredicate(): string {
  const metadataPredicates = storageObjectColumns.map((column) => {
    return `storage_object.${quoteIdentifier(column)} IS DISTINCT FROM canonical.${quoteIdentifier(column)}`;
  });

  return [
    ...metadataPredicates,
    '(canonical."isPinned" IS TRUE AND storage_object."isPinned" IS DISTINCT FROM TRUE)',
  ].join('\n        OR ');
}

async function getCount(sequelize: Sequelize, sql: string): Promise<number> {
  const rows = await sequelize.query<CountRow>(sql, {type: QueryTypes.SELECT});

  return Number(rows[0]?.count || 0);
}
