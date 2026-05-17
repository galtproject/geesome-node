import {Op, QueryTypes} from 'sequelize';

export async function countDerivedStorageIdReferences(models, sequelize, storageId) {
  const refCounts = await Promise.all([
    ...derivedStorageReferenceSources.map((source) => {
      return countStorageIdColumnReferences(models, sequelize, source, storageId);
    }),
    countLatestStaticIdHistoryFallbackReferences(models, sequelize, storageId),
  ]);
  return refCounts.reduce((sum, count) => sum + count, 0);
}

const derivedStorageReferenceSources = [
  {
    modelNames: ['Post', 'post'],
    columns: [
      'storageId',
      'directoryStorageId',
      'staticStorageId',
      'manifestStorageId',
      'manifestStaticStorageId',
      'encryptedManifestStorageId',
      'groupStorageId',
      'groupStaticStorageId',
      'authorStorageId',
      'authorStaticStorageId',
    ],
  },
  {
    modelNames: ['Group', 'group'],
    columns: [
      'storageId',
      'directoryStorageId',
      'staticStorageId',
      'manifestStorageId',
      'manifestStaticStorageId',
      'encryptedManifestStorageId',
    ],
  },
  {
    modelNames: ['FileCatalogItem', 'fileCatalogItem'],
    columns: ['manifestStorageId', 'nativeStorageId'],
  },
  {
    modelNames: ['GroupCategory', 'groupCategory', 'Category', 'category'],
    columns: ['storageId', 'staticStorageId', 'manifestStorageId', 'manifestStaticStorageId'],
  },
  {
    modelNames: ['GroupSection', 'groupSection'],
    columns: ['storageId', 'staticStorageId', 'manifestStorageId', 'manifestStaticStorageId', 'encryptedManifestStorageId'],
  },
  {
    modelNames: ['Tag', 'tag'],
    columns: ['storageId', 'staticStorageId', 'manifestStorageId', 'manifestStaticStorageId'],
  },
  {
    modelNames: ['Mention', 'mention'],
    columns: ['storageId', 'staticStorageId', 'manifestStorageId', 'manifestStaticStorageId'],
  },
  {
    modelNames: ['User', 'user'],
    columns: ['manifestStorageId', 'manifestStaticStorageId'],
  },
  {
    modelNames: ['StaticSite', 'staticSite'],
    columns: ['storageId', 'lastEntityManifestStorageId'],
  },
  {
    modelNames: ['StaticIdBinding', 'staticIdBinding'],
    columns: ['dynamicId'],
  },
];

async function countStorageIdColumnReferences(models, sequelize, source, storageId) {
  const model = getReferenceModel(models, sequelize, source.modelNames);
  if (!model) {
    return 0;
  }
  return model.count({
    where: {
      [Op.or]: source.columns.map((column) => ({[column]: storageId})),
    },
  });
}

async function countLatestStaticIdHistoryFallbackReferences(models, sequelize, storageId) {
  const historyModel = getReferenceModel(models, sequelize, ['StaticIdHistory', 'staticIdHistory']);
  const bindingModel = getReferenceModel(models, sequelize, ['StaticIdBinding', 'staticIdBinding']);
  if (!historyModel || !bindingModel) {
    return 0;
  }
  const rows = await sequelize.query(`
    SELECT COUNT(*) AS count
    FROM (
      SELECT DISTINCT ON ("staticId")
        "staticId",
        "dynamicId"
      FROM "staticIdHistories"
      WHERE "staticId" IS NOT NULL
      ORDER BY "staticId", "boundAt" DESC NULLS LAST, id DESC
    ) latest_history
    LEFT JOIN "staticIdBindings" binding
      ON binding."staticId" = latest_history."staticId"
    WHERE binding.id IS NULL
      AND latest_history."dynamicId" = :storageId
  `, {
    replacements: {storageId},
    type: QueryTypes.SELECT,
  });
  return Number(rows[0]?.count || 0);
}

function getReferenceModel(models, sequelize, modelNames) {
  for (const modelName of modelNames) {
    if (models[modelName]) {
      return models[modelName];
    }
    if (sequelize.models[modelName]) {
      return sequelize.models[modelName];
    }
  }
  return null;
}
