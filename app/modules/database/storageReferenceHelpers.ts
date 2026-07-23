import {Op, QueryTypes} from 'sequelize';
import {
  confirmedPinStorageObjectStatuses,
  protectedPinStorageObjectStatuses
} from '../pin/stateHelpers.js';

export async function getStorageObjectPinProvenance(models, sequelize, storageId) {
  const storageObjectModel = getReferenceModel(models, sequelize, ['StorageObject', 'storageObject']);
  const contentModel = getReferenceModel(models, sequelize, ['Content', 'content']);
  const pinStorageObjectModel = getReferenceModel(models, sequelize, ['PinStorageObject', 'pinStorageObject']);
  const [storageObjectPinRefs, contentPinRefs, confirmedRemotePinRefs, protectedRemotePinRefs] = await Promise.all([
    countModelReferences(storageObjectModel, {storageId, isPinned: true}),
    countModelReferences(contentModel, {
      storageId,
      isPinned: true,
      isDeleted: {[Op.ne]: true},
    }),
    countModelReferences(pinStorageObjectModel, {
      storageId,
      status: {[Op.in]: confirmedPinStorageObjectStatuses},
    }),
    countModelReferences(pinStorageObjectModel, {
      storageId,
      status: {[Op.in]: protectedPinStorageObjectStatuses},
    }),
  ]);
  const hasLocalOrLegacyPin = storageObjectPinRefs > 0 || contentPinRefs > 0;
  const hasConfirmedRemotePin = confirmedRemotePinRefs > 0;
  return {
    storageObjectPinRefs,
    contentPinRefs,
    confirmedRemotePinRefs,
    protectedRemotePinRefs,
    hasLocalOrLegacyPin,
    hasConfirmedRemotePin,
    isConfirmedPinned: hasLocalOrLegacyPin || hasConfirmedRemotePin,
    isDeletionProtected: hasLocalOrLegacyPin || protectedRemotePinRefs > 0,
  };
}

export async function countDerivedStorageIdReferences(models, sequelize, storageId, options: any = {}) {
  return countDirectDerivedStorageIdReferences(models, sequelize, storageId, options);
}

export async function countStorageObjectChildReferences(models, sequelize, storageId, options: any = {}) {
  const referenceModel = getReferenceModel(models, sequelize, ['StorageObjectReference', 'storageObjectReference']);
  if (!referenceModel) {
    return 0;
  }
  const sourceStorageIds = await getStorageObjectChildReferenceSourceIds(referenceModel, storageId);
  if (!sourceStorageIds.length) {
    return 0;
  }
  let count = 0;
  for (const sourceStorageId of sourceStorageIds) {
    const sourceVisible = await isStorageObjectReferenceSourceVisible(
      models,
      sequelize,
      referenceModel,
      sourceStorageId,
      options
    );
    if (!sourceVisible) {
      continue;
    }
    count += await referenceModel.count({
      where: {
        sourceStorageId,
        targetStorageId: storageId,
      },
    });
  }
  return count;
}

export async function countRemotePinReferences(models, sequelize, storageId) {
  const pinStorageObjectModel = getReferenceModel(models, sequelize, ['PinStorageObject', 'pinStorageObject']);
  if (!pinStorageObjectModel) {
    return 0;
  }
  return pinStorageObjectModel.count({
    where: {
      storageId,
      status: {[Op.in]: protectedPinStorageObjectStatuses},
    },
  });
}

async function isStorageObjectReferenceSourceVisible(
  models,
  sequelize,
  referenceModel,
  sourceStorageId,
  options,
  visited = new Set<string>()
) {
  if (visited.has(sourceStorageId)) {
    return false;
  }
  visited.add(sourceStorageId);
  const sourceContentRefsCount = await countStorageObjectReferenceSourceContents(models, sequelize, sourceStorageId, options);
  if (sourceContentRefsCount > 0) {
    return true;
  }
  const sourceRefsCount = await countDirectDerivedStorageIdReferences(models, sequelize, sourceStorageId, options);
  if (sourceRefsCount > 0) {
    return true;
  }
  const pinnedSourceRefsCount = await countPinnedStorageObjectReferences(models, sequelize, sourceStorageId);
  if (pinnedSourceRefsCount > 0) {
    return true;
  }
  const remotePinSourceRefsCount = await countRemotePinReferences(models, sequelize, sourceStorageId);
  if (remotePinSourceRefsCount > 0) {
    return true;
  }
  const parentStorageIds = await getStorageObjectChildReferenceSourceIds(referenceModel, sourceStorageId);
  for (const parentStorageId of parentStorageIds) {
    if (await isStorageObjectReferenceSourceVisible(models, sequelize, referenceModel, parentStorageId, options, visited)) {
      return true;
    }
  }
  return false;
}

async function countDirectDerivedStorageIdReferences(models, sequelize, storageId, options: any = {}) {
  const refCounts = await Promise.all([
    ...derivedStorageReferenceSources.map((source) => {
      return countStorageIdColumnReferences(models, sequelize, source, storageId, options);
    }),
    countLatestStaticIdHistoryFallbackReferences(models, sequelize, storageId),
  ]);
  return refCounts.reduce((sum, count) => sum + count, 0);
}

async function countStorageObjectReferenceSourceContents(models, sequelize, sourceStorageId, options: any = {}) {
  const contentModel = getReferenceModel(models, sequelize, ['Content', 'content']);
  if (!contentModel) {
    return 0;
  }
  const where: any = {storageId: sourceStorageId};
  if (options.excludeContentId) {
    where.id = {[Op.ne]: options.excludeContentId};
  }
  return contentModel.count({where});
}

async function countPinnedStorageObjectReferences(models, sequelize, storageId) {
  const storageObjectModel = getReferenceModel(models, sequelize, ['StorageObject', 'storageObject']);
  if (!storageObjectModel) {
    return 0;
  }
  return storageObjectModel.count({
    where: {
      storageId,
      isPinned: true,
    },
  });
}

async function getStorageObjectChildReferenceSourceIds(referenceModel, targetStorageId: string) {
  const rows = await referenceModel.findAll({
    attributes: ['sourceStorageId'],
    where: {targetStorageId},
    group: ['sourceStorageId'],
  });
  return rows
    .map(row => getStorageObjectChildReferenceSourceId(row))
    .filter(Boolean);
}

function getStorageObjectChildReferenceSourceId(row) {
  const data = typeof row?.toJSON === 'function' ? row.toJSON() : row;
  return data?.sourceStorageId || null;
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

async function countStorageIdColumnReferences(models, sequelize, source, storageId, options) {
  const model = getReferenceModel(models, sequelize, source.modelNames);
  if (!model) {
    return 0;
  }
  const where: any = {
    [Op.or]: source.columns.map((column) => ({[column]: storageId})),
  };
  if (options.excludeFileCatalogItemId && source.modelNames.includes('FileCatalogItem')) {
    where.id = {[Op.ne]: options.excludeFileCatalogItemId};
  }
  return model.count({
    where,
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

async function countModelReferences(model, where) {
  if (!model) {
    return 0;
  }
  return model.count({where});
}
