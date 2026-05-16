import {Op} from 'sequelize';

export async function countDerivedStorageIdReferences(models, sequelize, storageId) {
  const refCounts = await Promise.all(derivedStorageReferenceSources.map((source) => {
    return countStorageIdColumnReferences(models, sequelize, source, storageId);
  }));
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
    columns: ['manifestStorageId'],
  },
  {
    modelNames: ['GroupCategory', 'groupCategory'],
    columns: ['staticStorageId', 'manifestStorageId', 'manifestStaticStorageId'],
  },
  {
    modelNames: ['GroupSection', 'groupSection'],
    columns: ['staticStorageId', 'manifestStorageId', 'manifestStaticStorageId'],
  },
  {
    modelNames: ['Tag', 'tag'],
    columns: ['staticStorageId', 'manifestStorageId', 'manifestStaticStorageId'],
  },
  {
    modelNames: ['Mention', 'mention'],
    columns: ['staticStorageId', 'manifestStorageId', 'manifestStaticStorageId'],
  },
  {
    modelNames: ['User', 'user'],
    columns: ['manifestStorageId', 'manifestStaticStorageId'],
  },
  {
    modelNames: ['StaticSite', 'staticSite'],
    columns: ['storageId', 'lastEntityManifestStorageId'],
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
