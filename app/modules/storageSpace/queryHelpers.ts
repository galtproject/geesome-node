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
  'generatedOutputStorageRefsCount',
  'generatedOutputUniqueStorageIdsCount',
  'generatedOutputKnownStorageObjectsCount',
  'generatedOutputKnownPhysicalBytes',
  'generatedOutputUnknownStorageIdsCount',
];
const numericTypeFields = ['contentRowsCount', 'storageObjectsCount', 'logicalBytes', 'physicalBytes'];
const numericContentFields = ['id', 'userId', 'size'];
const numericFileCatalogFields = ['id', 'userId', 'groupId', 'parentItemId', 'contentId', 'size'];
const numericFileCatalogFolderFields = [
  'id',
  'userId',
  'groupId',
  'parentItemId',
  'childFoldersCount',
  'directFilesCount',
  'filesCount',
  'storageObjectsCount',
  'logicalBytes',
  'physicalBytes',
];
const numericGroupFields = ['id', 'size', 'availablePostsCount'];
const numericGroupPostFields = [
  'id',
  'groupId',
  'userId',
  'localId',
  'logicalBytes',
  'attachmentsCount',
  'attachmentLogicalBytes',
  'storageObjectsCount',
  'physicalBytes',
];
const numericGeneratedOutputFields = [
  'storageRefsCount',
  'uniqueStorageIdsCount',
  'knownStorageObjectsCount',
  'knownPhysicalBytes',
  'unknownStorageIdsCount',
];

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
    ),
    ${getGeneratedOutputRefsSql()},
    generated_output_unique_refs AS (
      SELECT DISTINCT "storageId"
      FROM generated_output_refs
      WHERE "storageId" IS NOT NULL
    ),
    generated_output AS (
      SELECT
        (SELECT COUNT(*)::bigint FROM generated_output_refs WHERE "storageId" IS NOT NULL) AS "generatedOutputStorageRefsCount",
        COUNT(generated_output_unique_refs."storageId")::bigint AS "generatedOutputUniqueStorageIdsCount",
        COUNT(storage_object.id)::bigint AS "generatedOutputKnownStorageObjectsCount",
        COALESCE(SUM(COALESCE(storage_object.size, 0)), 0)::bigint AS "generatedOutputKnownPhysicalBytes",
        COUNT(*) FILTER (WHERE storage_object.id IS NULL)::bigint AS "generatedOutputUnknownStorageIdsCount"
      FROM generated_output_unique_refs
      LEFT JOIN "storageObjects" storage_object
        ON storage_object."storageId" = generated_output_unique_refs."storageId"
    )
    SELECT
      content_stats.*,
      physical_content.*,
      duplicate_content.*,
      file_catalog.*,
      group_posts.*,
      pinned_storage.*,
      generated_output.*
    FROM content_stats, physical_content, duplicate_content, file_catalog, group_posts, pinned_storage, generated_output
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

export async function getStorageSpaceFileCatalogFolders(sequelize, listParams: any = {}) {
  const rows = await sequelize.query(`
    WITH RECURSIVE scoped_folders AS (
      SELECT
        folder.id,
        folder."userId",
        folder."groupId",
        folder."parentItemId",
        folder.name,
        folder."defaultFolderFor"
      FROM "fileCatalogItems" folder
      WHERE folder."isDeleted" IS NOT TRUE
        AND folder.type = :folderType
        AND folder."parentItemId" IS NOT DISTINCT FROM :parentItemId
    ),
    folder_tree AS (
      SELECT
        scoped_folders.id AS "folderId",
        scoped_folders.id AS "itemId"
      FROM scoped_folders

      UNION ALL

      SELECT
        folder_tree."folderId",
        child.id AS "itemId"
      FROM folder_tree
      JOIN "fileCatalogItems" child ON child."parentItemId" = folder_tree."itemId"
      WHERE child."isDeleted" IS NOT TRUE
    ),
    folder_logical_stats AS (
      SELECT
        folder_tree."folderId",
        COUNT(item.id) FILTER (WHERE item.type = :fileType)::bigint AS "filesCount",
        COALESCE(
          SUM(COALESCE(content.size, item.size, 0)) FILTER (WHERE item.type = :fileType),
          0
        )::bigint AS "logicalBytes"
      FROM folder_tree
      JOIN "fileCatalogItems" item ON item.id = folder_tree."itemId"
      LEFT JOIN contents content ON content.id = item."contentId"
      GROUP BY folder_tree."folderId"
    ),
    folder_storage_rows AS (
      SELECT
        folder_tree."folderId",
        content."storageId",
        MAX(COALESCE(content.size, item.size, 0))::bigint AS size
      FROM folder_tree
      JOIN "fileCatalogItems" item ON item.id = folder_tree."itemId"
      JOIN contents content ON content.id = item."contentId"
      WHERE item.type = :fileType
        AND content."storageId" IS NOT NULL
      GROUP BY folder_tree."folderId", content."storageId"
    ),
    folder_physical_stats AS (
      SELECT
        "folderId",
        COUNT(*)::bigint AS "storageObjectsCount",
        COALESCE(SUM(size), 0)::bigint AS "physicalBytes"
      FROM folder_storage_rows
      GROUP BY "folderId"
    ),
    direct_child_stats AS (
      SELECT
        folder.id AS "folderId",
        COUNT(child.id) FILTER (WHERE child.type = :folderType)::bigint AS "childFoldersCount",
        COUNT(child.id) FILTER (WHERE child.type = :fileType)::bigint AS "directFilesCount"
      FROM scoped_folders folder
      LEFT JOIN "fileCatalogItems" child
        ON child."parentItemId" = folder.id
        AND child."isDeleted" IS NOT TRUE
      GROUP BY folder.id
    )
    SELECT
      folder.id,
      folder."userId",
      folder."groupId",
      folder."parentItemId",
      folder.name,
      folder."defaultFolderFor",
      COALESCE(direct_child_stats."childFoldersCount", 0)::bigint AS "childFoldersCount",
      COALESCE(direct_child_stats."directFilesCount", 0)::bigint AS "directFilesCount",
      COALESCE(folder_logical_stats."filesCount", 0)::bigint AS "filesCount",
      COALESCE(folder_physical_stats."storageObjectsCount", 0)::bigint AS "storageObjectsCount",
      COALESCE(folder_logical_stats."logicalBytes", 0)::bigint AS "logicalBytes",
      COALESCE(folder_physical_stats."physicalBytes", 0)::bigint AS "physicalBytes"
    FROM scoped_folders folder
    LEFT JOIN folder_logical_stats ON folder_logical_stats."folderId" = folder.id
    LEFT JOIN folder_physical_stats ON folder_physical_stats."folderId" = folder.id
    LEFT JOIN direct_child_stats ON direct_child_stats."folderId" = folder.id
    ORDER BY COALESCE(folder_logical_stats."logicalBytes", 0) DESC, folder.id ASC
    LIMIT :limit OFFSET :offset
  `, {
    replacements: getStorageSpaceFileCatalogFolderQueryReplacements(listParams),
    type: QueryTypes.SELECT,
  });

  return rows.map(row => normalizeNumericFields(row, numericFileCatalogFolderFields));
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

export async function getStorageSpaceGroupPosts(sequelize, listParams: any = {}) {
  const rows = await sequelize.query(`
    WITH scoped_posts AS (
      SELECT
        post.id,
        post."groupId",
        post."userId",
        post."localId",
        post.name,
        post."publishedAt",
        COALESCE(post.size, 0)::bigint AS "logicalBytes",
        group_row.name AS "groupName",
        group_row.title AS "groupTitle"
      FROM posts post
      LEFT JOIN groups group_row ON group_row.id = post."groupId"
      WHERE post."isDeleted" IS NOT TRUE
        AND post.status = :publishedStatus
        AND (:groupId IS NULL OR post."groupId" = :groupId)
      ORDER BY COALESCE(post.size, 0) DESC, post.id ASC
      LIMIT :limit OFFSET :offset
    ),
    post_content_rows AS (
      SELECT
        scoped_posts.id AS "postId",
        content."storageId",
        COALESCE(content.size, 0)::bigint AS size
      FROM scoped_posts
      JOIN "postsContents" post_content ON post_content."postId" = scoped_posts.id
      JOIN contents content ON content.id = post_content."contentId"
    ),
    post_content_stats AS (
      SELECT
        "postId",
        COUNT(*)::bigint AS "attachmentsCount",
        COALESCE(SUM(size), 0)::bigint AS "attachmentLogicalBytes"
      FROM post_content_rows
      GROUP BY "postId"
    ),
    post_storage_rows AS (
      SELECT
        "postId",
        "storageId",
        MAX(size)::bigint AS size
      FROM post_content_rows
      WHERE "storageId" IS NOT NULL
      GROUP BY "postId", "storageId"
    ),
    post_storage_stats AS (
      SELECT
        "postId",
        COUNT(*)::bigint AS "storageObjectsCount",
        COALESCE(SUM(size), 0)::bigint AS "physicalBytes"
      FROM post_storage_rows
      GROUP BY "postId"
    )
    SELECT
      scoped_posts.id,
      scoped_posts."groupId",
      scoped_posts."userId",
      scoped_posts."localId",
      scoped_posts.name,
      scoped_posts."publishedAt",
      scoped_posts."groupName",
      scoped_posts."groupTitle",
      scoped_posts."logicalBytes",
      COALESCE(post_content_stats."attachmentsCount", 0)::bigint AS "attachmentsCount",
      COALESCE(post_content_stats."attachmentLogicalBytes", 0)::bigint AS "attachmentLogicalBytes",
      COALESCE(post_storage_stats."storageObjectsCount", 0)::bigint AS "storageObjectsCount",
      COALESCE(post_storage_stats."physicalBytes", 0)::bigint AS "physicalBytes"
    FROM scoped_posts
    LEFT JOIN post_content_stats ON post_content_stats."postId" = scoped_posts.id
    LEFT JOIN post_storage_stats ON post_storage_stats."postId" = scoped_posts.id
    ORDER BY scoped_posts."logicalBytes" DESC, scoped_posts.id ASC
  `, {
    replacements: getStorageSpaceGroupPostQueryReplacements(listParams),
    type: QueryTypes.SELECT,
  });

  return rows.map(row => normalizeNumericFields(row, numericGroupPostFields));
}

export async function getStorageSpaceGeneratedOutputs(sequelize, listParams: any = {}) {
  const rows = await sequelize.query(`
    WITH ${getGeneratedOutputRefsSql()},
    source_refs AS (
      SELECT
        source,
        COUNT(*)::bigint AS "storageRefsCount",
        COUNT(DISTINCT "storageId")::bigint AS "uniqueStorageIdsCount"
      FROM generated_output_refs
      WHERE "storageId" IS NOT NULL
      GROUP BY source
    ),
    source_unique_storage AS (
      SELECT DISTINCT
        source,
        "storageId"
      FROM generated_output_refs
      WHERE "storageId" IS NOT NULL
    ),
    source_storage AS (
      SELECT
        source_unique_storage.source,
        source_unique_storage."storageId",
        storage_object.id IS NOT NULL AS "isKnownStorageObject",
        COALESCE(storage_object.size, 0)::bigint AS size
      FROM source_unique_storage
      LEFT JOIN "storageObjects" storage_object
        ON storage_object."storageId" = source_unique_storage."storageId"
    ),
    source_storage_stats AS (
      SELECT
        source,
        COUNT(*) FILTER (WHERE "isKnownStorageObject")::bigint AS "knownStorageObjectsCount",
        COALESCE(SUM(size) FILTER (WHERE "isKnownStorageObject"), 0)::bigint AS "knownPhysicalBytes",
        COUNT(*) FILTER (WHERE NOT "isKnownStorageObject")::bigint AS "unknownStorageIdsCount"
      FROM source_storage
      GROUP BY source
    )
    SELECT
      source_refs.source,
      source_refs."storageRefsCount",
      source_refs."uniqueStorageIdsCount",
      COALESCE(source_storage_stats."knownStorageObjectsCount", 0)::bigint AS "knownStorageObjectsCount",
      COALESCE(source_storage_stats."knownPhysicalBytes", 0)::bigint AS "knownPhysicalBytes",
      COALESCE(source_storage_stats."unknownStorageIdsCount", 0)::bigint AS "unknownStorageIdsCount"
    FROM source_refs
    LEFT JOIN source_storage_stats ON source_storage_stats.source = source_refs.source
    ORDER BY COALESCE(source_storage_stats."knownPhysicalBytes", 0) DESC, source_refs."storageRefsCount" DESC, source_refs.source ASC
    LIMIT :limit OFFSET :offset
  `, {
    replacements: getStorageSpaceListQueryReplacements(listParams),
    type: QueryTypes.SELECT,
  });

  return rows.map(row => normalizeNumericFields(row, numericGeneratedOutputFields));
}

function getStorageSpaceListQueryReplacements(listParams) {
  return {
    ...getStorageSpaceQueryReplacements(),
    limit: listParams.limit,
    offset: listParams.offset,
  };
}

function getStorageSpaceFileCatalogFolderQueryReplacements(listParams) {
  return {
    ...getStorageSpaceListQueryReplacements(listParams),
    parentItemId: listParams.parentItemId,
    folderType: 'folder',
  };
}

function getStorageSpaceGroupPostQueryReplacements(listParams) {
  return {
    ...getStorageSpaceListQueryReplacements(listParams),
    groupId: listParams.groupId,
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

function getGeneratedOutputRefsSql() {
  return `
    generated_output_refs AS (
      SELECT 'post.storageId' AS source, post."storageId"
      FROM posts post
      WHERE post."isDeleted" IS NOT TRUE
        AND post."storageId" IS NOT NULL

      UNION ALL

      SELECT 'post.directoryStorageId' AS source, post."directoryStorageId" AS "storageId"
      FROM posts post
      WHERE post."isDeleted" IS NOT TRUE
        AND post."directoryStorageId" IS NOT NULL

      UNION ALL

      SELECT 'post.manifestStorageId' AS source, post."manifestStorageId" AS "storageId"
      FROM posts post
      WHERE post."isDeleted" IS NOT TRUE
        AND post."manifestStorageId" IS NOT NULL

      UNION ALL

      SELECT 'post.encryptedManifestStorageId' AS source, post."encryptedManifestStorageId" AS "storageId"
      FROM posts post
      WHERE post."isDeleted" IS NOT TRUE
        AND post."encryptedManifestStorageId" IS NOT NULL

      UNION ALL

      SELECT 'group.storageId' AS source, group_row."storageId"
      FROM groups group_row
      WHERE group_row."isDeleted" IS NOT TRUE
        AND group_row."storageId" IS NOT NULL

      UNION ALL

      SELECT 'group.directoryStorageId' AS source, group_row."directoryStorageId" AS "storageId"
      FROM groups group_row
      WHERE group_row."isDeleted" IS NOT TRUE
        AND group_row."directoryStorageId" IS NOT NULL

      UNION ALL

      SELECT 'group.manifestStorageId' AS source, group_row."manifestStorageId" AS "storageId"
      FROM groups group_row
      WHERE group_row."isDeleted" IS NOT TRUE
        AND group_row."manifestStorageId" IS NOT NULL

      UNION ALL

      SELECT 'group.encryptedManifestStorageId' AS source, group_row."encryptedManifestStorageId" AS "storageId"
      FROM groups group_row
      WHERE group_row."isDeleted" IS NOT TRUE
        AND group_row."encryptedManifestStorageId" IS NOT NULL

      UNION ALL

      SELECT 'fileCatalogItem.nativeStorageId' AS source, item."nativeStorageId" AS "storageId"
      FROM "fileCatalogItems" item
      WHERE item."isDeleted" IS NOT TRUE
        AND item."nativeStorageId" IS NOT NULL

      UNION ALL

      SELECT 'fileCatalogItem.manifestStorageId' AS source, item."manifestStorageId" AS "storageId"
      FROM "fileCatalogItems" item
      WHERE item."isDeleted" IS NOT TRUE
        AND item."manifestStorageId" IS NOT NULL

      UNION ALL

      SELECT 'staticSite.storageId' AS source, site."storageId"
      FROM "staticSites" site
      WHERE site."storageId" IS NOT NULL

      UNION ALL

      SELECT 'staticSite.lastEntityManifestStorageId' AS source, site."lastEntityManifestStorageId" AS "storageId"
      FROM "staticSites" site
      WHERE site."lastEntityManifestStorageId" IS NOT NULL
    )
  `;
}
