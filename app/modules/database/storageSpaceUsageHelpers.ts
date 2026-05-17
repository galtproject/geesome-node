import {QueryTypes} from 'sequelize';

const numericOverviewFields = [
  'contentRowsCount',
  'contentStorageObjectsCount',
  'logicalContentBytes',
  'physicalContentBytes',
  'duplicateStorageIdsCount',
  'duplicateContentRowsCount',
  'fileCatalogItemsCount',
  'fileCatalogLogicalBytes',
  'groupPostsCount',
  'groupPostsLogicalBytes',
  'pinnedStorageObjectsCount',
  'pinnedPhysicalBytes',
];
const numericTypeFields = ['contentRowsCount', 'storageObjectsCount', 'logicalBytes', 'physicalBytes'];
const numericContentFields = ['id', 'userId', 'size'];
const numericFileCatalogFields = ['id', 'userId', 'groupId', 'parentItemId', 'contentId', 'size'];
const numericGroupFields = ['id', 'size', 'availablePostsCount'];

export async function getStorageSpaceOverview(sequelize, options: any = {}) {
  const rows = await sequelize.query(`
    WITH content_stats AS (
      SELECT
        COUNT(*)::bigint AS "contentRowsCount",
        COALESCE(SUM(COALESCE(size, 0)), 0)::bigint AS "logicalContentBytes"
      FROM contents
    ),
    physical_content AS (
      SELECT
        COUNT(*)::bigint AS "contentStorageObjectsCount",
        COALESCE(SUM(size), 0)::bigint AS "physicalContentBytes"
      FROM (
        SELECT "storageId", MAX(COALESCE(size, 0))::bigint AS size
        FROM contents
        WHERE "storageId" IS NOT NULL
        GROUP BY "storageId"
      ) storage_rows
    ),
    duplicate_content AS (
      SELECT
        COUNT(*)::bigint AS "duplicateStorageIdsCount",
        COALESCE(SUM(row_count - 1), 0)::bigint AS "duplicateContentRowsCount"
      FROM (
        SELECT "storageId", COUNT(*)::bigint AS row_count
        FROM contents
        WHERE "storageId" IS NOT NULL
        GROUP BY "storageId"
        HAVING COUNT(*) > 1
      ) duplicates
    ),
    file_catalog AS (
      SELECT
        COUNT(*)::bigint AS "fileCatalogItemsCount",
        COALESCE(SUM(COALESCE(content.size, item.size, 0)), 0)::bigint AS "fileCatalogLogicalBytes"
      FROM "fileCatalogItems" item
      LEFT JOIN contents content ON content.id = item."contentId"
      WHERE item."isDeleted" IS NOT TRUE
        AND item.type = :fileType
    ),
    group_posts AS (
      SELECT
        COUNT(*)::bigint AS "groupPostsCount",
        COALESCE(SUM(COALESCE(size, 0)), 0)::bigint AS "groupPostsLogicalBytes"
      FROM posts
      WHERE "isDeleted" IS NOT TRUE
        AND status = :publishedStatus
    ),
    pinned_storage AS (
      SELECT
        COUNT(*)::bigint AS "pinnedStorageObjectsCount",
        COALESCE(SUM(COALESCE(size, 0)), 0)::bigint AS "pinnedPhysicalBytes"
      FROM "storageObjects"
      WHERE "isPinned" = true
    )
    SELECT
      content_stats.*,
      physical_content.*,
      duplicate_content.*,
      file_catalog.*,
      group_posts.*,
      pinned_storage.*
    FROM content_stats, physical_content, duplicate_content, file_catalog, group_posts, pinned_storage
  `, {
    replacements: getStorageSpaceQueryReplacements(options),
    type: QueryTypes.SELECT,
  });

  return normalizeNumericFields(rows[0] || {}, numericOverviewFields);
}

export async function getStorageSpaceTypeBreakdown(sequelize, listParams: any = {}) {
  const rows = await sequelize.query(`
    WITH logical_types AS (
      SELECT
        COALESCE("mimeType", :unknownValue) AS "mimeType",
        COALESCE(extension, :unknownValue) AS extension,
        COUNT(*)::bigint AS "contentRowsCount",
        COALESCE(SUM(COALESCE(size, 0)), 0)::bigint AS "logicalBytes"
      FROM contents
      GROUP BY COALESCE("mimeType", :unknownValue), COALESCE(extension, :unknownValue)
    ),
    physical_type_rows AS (
      SELECT
        COALESCE("mimeType", :unknownValue) AS "mimeType",
        COALESCE(extension, :unknownValue) AS extension,
        "storageId",
        MAX(COALESCE(size, 0))::bigint AS size
      FROM contents
      WHERE "storageId" IS NOT NULL
      GROUP BY COALESCE("mimeType", :unknownValue), COALESCE(extension, :unknownValue), "storageId"
    ),
    physical_types AS (
      SELECT
        "mimeType",
        extension,
        COUNT(*)::bigint AS "storageObjectsCount",
        COALESCE(SUM(size), 0)::bigint AS "physicalBytes"
      FROM physical_type_rows
      GROUP BY "mimeType", extension
    )
    SELECT
      logical_types."mimeType",
      logical_types.extension,
      logical_types."contentRowsCount",
      COALESCE(physical_types."storageObjectsCount", 0)::bigint AS "storageObjectsCount",
      logical_types."logicalBytes",
      COALESCE(physical_types."physicalBytes", 0)::bigint AS "physicalBytes"
    FROM logical_types
    LEFT JOIN physical_types
      ON physical_types."mimeType" = logical_types."mimeType"
      AND physical_types.extension = logical_types.extension
    ORDER BY logical_types."logicalBytes" DESC, logical_types."contentRowsCount" DESC, logical_types."mimeType" ASC
    LIMIT :limit OFFSET :offset
  `, {
    replacements: getStorageSpaceListQueryReplacements(listParams),
    type: QueryTypes.SELECT,
  });

  return rows.map(row => normalizeNumericFields(row, numericTypeFields));
}

export async function getStorageSpaceTopContents(sequelize, listParams: any = {}) {
  const rows = await sequelize.query(`
    SELECT
      id,
      "userId",
      name,
      "mimeType",
      extension,
      "storageId",
      COALESCE(size, 0)::bigint AS size,
      "createdAt"
    FROM contents
    ORDER BY COALESCE(size, 0) DESC, id ASC
    LIMIT :limit OFFSET :offset
  `, {
    replacements: getStorageSpaceListQueryReplacements(listParams),
    type: QueryTypes.SELECT,
  });

  return rows.map(row => normalizeNumericFields(row, numericContentFields));
}

export async function getStorageSpaceTopFileCatalogItems(sequelize, listParams: any = {}) {
  const rows = await sequelize.query(`
    SELECT
      item.id,
      item."userId",
      item."groupId",
      item."parentItemId",
      item."contentId",
      item.name,
      item.type,
      COALESCE(content."mimeType", :unknownValue) AS "mimeType",
      COALESCE(content.extension, :unknownValue) AS extension,
      content."storageId",
      COALESCE(content.size, item.size, 0)::bigint AS size
    FROM "fileCatalogItems" item
    LEFT JOIN contents content ON content.id = item."contentId"
    WHERE item."isDeleted" IS NOT TRUE
      AND item.type = :fileType
    ORDER BY COALESCE(content.size, item.size, 0) DESC, item.id ASC
    LIMIT :limit OFFSET :offset
  `, {
    replacements: getStorageSpaceListQueryReplacements(listParams),
    type: QueryTypes.SELECT,
  });

  return rows.map(row => normalizeNumericFields(row, numericFileCatalogFields));
}

export async function getStorageSpaceTopGroups(sequelize, listParams: any = {}) {
  const rows = await sequelize.query(`
    SELECT
      id,
      name,
      title,
      COALESCE(size, 0)::bigint AS size,
      COALESCE("availablePostsCount", 0)::bigint AS "availablePostsCount"
    FROM groups
    WHERE "isDeleted" IS NOT TRUE
    ORDER BY COALESCE(size, 0) DESC, id ASC
    LIMIT :limit OFFSET :offset
  `, {
    replacements: getStorageSpaceListQueryReplacements(listParams),
    type: QueryTypes.SELECT,
  });

  return rows.map(row => normalizeNumericFields(row, numericGroupFields));
}

function getStorageSpaceListQueryReplacements(listParams) {
  return {
    ...getStorageSpaceQueryReplacements(),
    limit: listParams.limit,
    offset: listParams.offset,
  };
}

function getStorageSpaceQueryReplacements(options: any = {}) {
  return {
    fileType: options.fileType || 'file',
    publishedStatus: options.publishedStatus || 'published',
    unknownValue: 'unknown',
  };
}

function normalizeNumericFields(row, fields: string[]) {
  const result = {...row};
  fields.forEach((field) => {
    result[field] = Number(result[field] || 0);
  });
  return result;
}
