import {pathToFileURL} from 'node:url';
import {QueryTypes, Sequelize} from 'sequelize';
import databaseConfig from '../app/modules/database/config.js';

type CountRow = {
  count: string | number;
};

type IntegrityReport = {
  missingStorageObjects: number;
  mismatchedStorageObjects: number;
  missingPreviewStorageObjects: number;
  mismatchedPreviewStorageObjects: number;
  missingPreviewReferences: number;
  mismatchedPreviewReferences: number;
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

    if (shouldRepair && hasIntegrityIssues(report)) {
      await repairStorageObjects(sequelize);
      await repairPreviewStorageObjects(sequelize);
      await repairPreviewStorageObjectReferences(sequelize);
      report = await getIntegrityReport(sequelize);
    }

    console.log('Storage object integrity:');
    console.log(`  missing storageObjects: ${report.missingStorageObjects}`);
    console.log(`  mismatched storageObjects: ${report.mismatchedStorageObjects}`);
    console.log(`  missing preview storageObjects: ${report.missingPreviewStorageObjects}`);
    console.log(`  mismatched preview storageObjects: ${report.mismatchedPreviewStorageObjects}`);
    console.log(`  missing preview references: ${report.missingPreviewReferences}`);
    console.log(`  mismatched preview references: ${report.mismatchedPreviewReferences}`);

    if (hasIntegrityIssues(report)) {
      process.exitCode = 1;
      console.error('Run with --repair after backup/approval to reconcile storageObjects and preview references from contents.');
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
  const previewCanonicalSql = getCanonicalPreviewStorageObjectSql();
  const previewReferenceSql = getCanonicalPreviewStorageObjectReferenceSql();
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
  const missingPreviewStorageObjects = await getCount(sequelize, `
    SELECT COUNT(*) AS count
    FROM (${previewCanonicalSql}) canonical
    LEFT JOIN "storageObjects" storage_object
      ON storage_object."storageId" = canonical."storageId"
    WHERE storage_object.id IS NULL
  `);
  const mismatchedPreviewStorageObjects = await getCount(sequelize, `
    SELECT COUNT(*) AS count
    FROM (${previewCanonicalSql}) canonical
    JOIN "storageObjects" storage_object
      ON storage_object."storageId" = canonical."storageId"
    WHERE ${getPreviewStorageObjectMismatchPredicate()}
  `);
  const missingPreviewReferences = await getCount(sequelize, `
    SELECT COUNT(*) AS count
    FROM (${previewReferenceSql}) canonical
    LEFT JOIN "storageObjectReferences" storage_object_reference
      ON storage_object_reference."sourceStorageId" = canonical."sourceStorageId"
      AND storage_object_reference."targetStorageId" = canonical."targetStorageId"
      AND storage_object_reference."referenceType" = canonical."referenceType"
    WHERE storage_object_reference.id IS NULL
  `);
  const mismatchedPreviewReferences = await getCount(sequelize, `
    SELECT COUNT(*) AS count
    FROM (${previewReferenceSql}) canonical
    JOIN "storageObjectReferences" storage_object_reference
      ON storage_object_reference."sourceStorageId" = canonical."sourceStorageId"
      AND storage_object_reference."targetStorageId" = canonical."targetStorageId"
      AND storage_object_reference."referenceType" = canonical."referenceType"
    WHERE ${getPreviewReferenceMismatchPredicate()}
  `);

  return {
    missingStorageObjects,
    mismatchedStorageObjects,
    missingPreviewStorageObjects,
    mismatchedPreviewStorageObjects,
    missingPreviewReferences,
    mismatchedPreviewReferences,
  };
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

async function repairPreviewStorageObjects(sequelize: Sequelize): Promise<void> {
  const canonicalSql = getCanonicalPreviewStorageObjectSql();
  const insertColumns = ['storageId', 'storageType', 'mimeType', 'extension', 'size', 'createdAt', 'updatedAt'];
  const insertColumnSql = insertColumns.map(quoteIdentifier).join(', ');
  const selectColumnSql = [
    'canonical."storageId"',
    'canonical."storageType"',
    'canonical."mimeType"',
    'canonical."extension"',
    'canonical."size"',
    'NOW()',
    'NOW()',
  ].join(', ');
  const updateColumnSql = [
    '"storageType" = EXCLUDED."storageType"',
    '"mimeType" = EXCLUDED."mimeType"',
    '"extension" = EXCLUDED."extension"',
    '"size" = EXCLUDED."size"',
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

async function repairPreviewStorageObjectReferences(sequelize: Sequelize): Promise<void> {
  const canonicalSql = getCanonicalPreviewStorageObjectReferenceSql();
  const insertColumns = [
    'sourceStorageId',
    'targetStorageId',
    'referenceType',
    'source',
    'name',
    'targetType',
    'targetSize',
    'createdAt',
    'updatedAt',
  ];
  const insertColumnSql = insertColumns.map(quoteIdentifier).join(', ');
  const selectColumnSql = [
    'canonical."sourceStorageId"',
    'canonical."targetStorageId"',
    'canonical."referenceType"',
    'canonical."source"',
    'canonical."name"',
    'canonical."targetType"',
    'canonical."targetSize"',
    'NOW()',
    'NOW()',
  ].join(', ');
  const updateColumnSql = [
    '"source" = EXCLUDED."source"',
    '"name" = EXCLUDED."name"',
    '"targetType" = EXCLUDED."targetType"',
    '"targetSize" = EXCLUDED."targetSize"',
    '"updatedAt" = NOW()',
  ].join(',\n      ');

  await sequelize.query(`
    INSERT INTO "storageObjectReferences" (${insertColumnSql})
    SELECT ${selectColumnSql}
    FROM (${canonicalSql}) canonical
    ON CONFLICT ("sourceStorageId", "targetStorageId", "referenceType") DO UPDATE SET
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
        AND "isDeleted" IS NOT TRUE
      ORDER BY "storageId", id ASC
    ),
    pinned_content AS (
      SELECT
        "storageId",
        BOOL_OR(COALESCE("isPinned", false)) AS "isPinned"
      FROM contents
      WHERE "storageId" IS NOT NULL
        AND "isDeleted" IS NOT TRUE
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

function getCanonicalPreviewStorageObjectSql(): string {
  return `
    WITH preview_refs AS (${getContentPreviewReferenceRowsSql()})
    SELECT DISTINCT ON ("storageId")
      "storageId",
      "storageType",
      "mimeType",
      "extension",
      "size"
    FROM preview_refs
    WHERE "sourceStorageId" IS NOT NULL
      AND "storageId" IS NOT NULL
      AND "storageId" <> "sourceStorageId"
      AND NOT EXISTS (
        SELECT 1
        FROM contents original_content
        WHERE original_content."storageId" = preview_refs."storageId"
          AND original_content."isDeleted" IS NOT TRUE
      )
    ORDER BY "storageId", "contentId" ASC, "previewOrder" ASC
  `;
}

function getCanonicalPreviewStorageObjectReferenceSql(): string {
  return `
    WITH preview_refs AS (${getContentPreviewReferenceRowsSql()})
    SELECT DISTINCT ON ("sourceStorageId", "storageId", "referenceType")
      "sourceStorageId",
      "storageId" AS "targetStorageId",
      "referenceType",
      "source",
      "name",
      "mimeType" AS "targetType",
      "size" AS "targetSize"
    FROM preview_refs
    WHERE "sourceStorageId" IS NOT NULL
      AND "storageId" IS NOT NULL
      AND "storageId" <> "sourceStorageId"
    ORDER BY "sourceStorageId", "storageId", "referenceType", "contentId" ASC, "previewOrder" ASC
  `;
}

function getContentPreviewReferenceRowsSql(): string {
  return `
    SELECT
      id AS "contentId",
      "storageId" AS "sourceStorageId",
      "largePreviewStorageId" AS "storageId",
      "storageType",
      "previewMimeType" AS "mimeType",
      "previewExtension" AS "extension",
      "largePreviewSize" AS "size",
      'largePreviewStorageId' AS "source",
      'large' AS "name",
      'preview' AS "referenceType",
      1 AS "previewOrder"
    FROM contents
    WHERE "isDeleted" IS NOT TRUE
    UNION ALL
    SELECT
      id AS "contentId",
      "storageId" AS "sourceStorageId",
      "mediumPreviewStorageId" AS "storageId",
      "storageType",
      "previewMimeType" AS "mimeType",
      "previewExtension" AS "extension",
      "mediumPreviewSize" AS "size",
      'mediumPreviewStorageId' AS "source",
      'medium' AS "name",
      'preview' AS "referenceType",
      2 AS "previewOrder"
    FROM contents
    WHERE "isDeleted" IS NOT TRUE
    UNION ALL
    SELECT
      id AS "contentId",
      "storageId" AS "sourceStorageId",
      "smallPreviewStorageId" AS "storageId",
      "storageType",
      "previewMimeType" AS "mimeType",
      "previewExtension" AS "extension",
      "smallPreviewSize" AS "size",
      'smallPreviewStorageId' AS "source",
      'small' AS "name",
      'preview' AS "referenceType",
      3 AS "previewOrder"
    FROM contents
    WHERE "isDeleted" IS NOT TRUE
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

function getPreviewStorageObjectMismatchPredicate(): string {
  return [
    'storage_object."storageType" IS DISTINCT FROM canonical."storageType"',
    'storage_object."mimeType" IS DISTINCT FROM canonical."mimeType"',
    'storage_object."extension" IS DISTINCT FROM canonical."extension"',
    'storage_object."size" IS DISTINCT FROM canonical."size"',
  ].join('\n        OR ');
}

function getPreviewReferenceMismatchPredicate(): string {
  return [
    'storage_object_reference."source" IS DISTINCT FROM canonical."source"',
    'storage_object_reference."name" IS DISTINCT FROM canonical."name"',
    'storage_object_reference."targetType" IS DISTINCT FROM canonical."targetType"',
    'storage_object_reference."targetSize" IS DISTINCT FROM canonical."targetSize"',
  ].join('\n        OR ');
}

function hasIntegrityIssues(report: IntegrityReport): boolean {
  return report.missingStorageObjects > 0
    || report.mismatchedStorageObjects > 0
    || report.missingPreviewStorageObjects > 0
    || report.mismatchedPreviewStorageObjects > 0
    || report.missingPreviewReferences > 0
    || report.mismatchedPreviewReferences > 0;
}

async function getCount(sequelize: Sequelize, sql: string): Promise<number> {
  const rows = await sequelize.query<CountRow>(sql, {type: QueryTypes.SELECT});

  return Number(rows[0]?.count || 0);
}
