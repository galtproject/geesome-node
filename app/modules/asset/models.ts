import {DataTypes, Sequelize} from 'sequelize';

export default async function (sequelize: Sequelize, databaseModels: any) {
  const Asset = sequelize.define('asset', {
    storageId: {type: DataTypes.STRING(200), allowNull: false},
    sha256: {type: DataTypes.STRING(64), allowNull: false},
    bytes: {type: DataTypes.BIGINT, allowNull: false},
    mimeType: {type: DataTypes.STRING(200), allowNull: false},
    logicalPath: {type: DataTypes.STRING(500)},
    pinStatus: {type: DataTypes.STRING(40), allowNull: false, defaultValue: 'stored'}
  } as any, {
    indexes: [
      {name: 'assets_user_storage_unique', fields: ['userId', 'storageId'], unique: true},
      {name: 'assets_user_sha_idx', fields: ['userId', 'sha256', 'id']},
      {name: 'assets_content_idx', fields: ['contentId']}
    ]
  } as any);

  const AssetIdempotencyKey = sequelize.define('assetIdempotencyKey', {
    namespace: {type: DataTypes.STRING(80), allowNull: false, defaultValue: 'assets'},
    key: {type: DataTypes.STRING(200), allowNull: false},
    requestHash: {type: DataTypes.STRING(64), allowNull: false},
    status: {type: DataTypes.STRING(40), allowNull: false, defaultValue: 'pending'},
    asyncOperationId: {type: DataTypes.INTEGER},
    errorCode: {type: DataTypes.STRING(80)}
  } as any, {
    indexes: [
      {name: 'asset_idempotency_user_namespace_key_unique', fields: ['userId', 'namespace', 'key'], unique: true},
      {name: 'asset_idempotency_asset_idx', fields: ['assetId']},
      {name: 'asset_idempotency_operation_idx', fields: ['asyncOperationId']}
    ]
  } as any);

  const AssetBatch = sequelize.define('assetBatch', {
    idempotencyKey: {type: DataTypes.STRING(200), allowNull: false},
    requestHash: {type: DataTypes.STRING(64), allowNull: false},
    status: {type: DataTypes.STRING(40), allowNull: false, defaultValue: 'pending'},
    manifestStorageId: {type: DataTypes.STRING(200)},
    manifestSha256: {type: DataTypes.STRING(64)}
  } as any, {
    indexes: [
      {name: 'asset_batches_user_key_unique', fields: ['userId', 'idempotencyKey'], unique: true},
      {name: 'asset_batches_user_created_idx', fields: ['userId', 'createdAt', 'id']},
      {name: 'asset_batches_status_updated_idx', fields: ['status', 'updatedAt', 'id']}
    ]
  } as any);

  const AssetBatchItem = sequelize.define('assetBatchItem', {
    logicalId: {type: DataTypes.STRING(200), allowNull: false},
    logicalPath: {type: DataTypes.STRING(500)},
    sha256: {type: DataTypes.STRING(64), allowNull: false},
    bytes: {type: DataTypes.BIGINT, allowNull: false},
    mimeType: {type: DataTypes.STRING(200), allowNull: false},
    status: {type: DataTypes.STRING(40), allowNull: false, defaultValue: 'missing'}
  } as any, {
    indexes: [
      {name: 'asset_batch_items_batch_logical_unique', fields: ['assetBatchId', 'logicalId'], unique: true},
      {name: 'asset_batch_items_batch_status_idx', fields: ['assetBatchId', 'status', 'id']},
      {name: 'asset_batch_items_asset_idx', fields: ['assetId']}
    ]
  } as any);

  Asset.belongsTo(databaseModels.User, {as: 'user', foreignKey: 'userId'});
  Asset.belongsTo(databaseModels.Content, {as: 'content', foreignKey: 'contentId'});
	AssetIdempotencyKey.belongsTo(databaseModels.User, {as: 'user', foreignKey: 'userId'});
  AssetIdempotencyKey.belongsTo(Asset, {as: 'asset', foreignKey: 'assetId'});
	AssetBatch.belongsTo(databaseModels.User, {as: 'user', foreignKey: 'userId'});
	AssetBatchItem.belongsTo(databaseModels.User, {as: 'user', foreignKey: 'userId'});
  AssetBatchItem.belongsTo(Asset, {as: 'asset', foreignKey: 'assetId'});
  AssetBatchItem.belongsTo(AssetBatch, {as: 'batch', foreignKey: 'assetBatchId'});
  AssetBatch.hasMany(AssetBatchItem, {as: 'items', foreignKey: 'assetBatchId'});

  await Asset.sync({});
  await AssetIdempotencyKey.sync({});
  await AssetBatch.sync({});
  await AssetBatchItem.sync({});

  return {Asset, AssetIdempotencyKey, AssetBatch, AssetBatchItem};
}
