import {DataTypes} from 'sequelize';

export default async function defineComicPageOperation(sequelize, models) {
  const model = sequelize.define('comicPageOperation', {
    userId: {type: DataTypes.INTEGER, allowNull: false},
    idempotencyKey: {type: DataTypes.STRING(200), allowNull: false},
    comicId: {type: DataTypes.STRING(100), allowNull: false},
    pageId: {type: DataTypes.STRING(100), allowNull: false},
    pageRevision: {type: DataTypes.INTEGER, allowNull: false},
    requestHash: {type: DataTypes.STRING(71), allowNull: false},
    status: {type: DataTypes.STRING(20), allowNull: false},
    claimToken: DataTypes.STRING(100),
    claimExpiresAt: DataTypes.DATE,
    recoveryJson: DataTypes.TEXT,
    receiptJson: DataTypes.TEXT,
    errorCode: DataTypes.STRING(100),
    contentId: {type: DataTypes.INTEGER, references: {model: models.Content, key: 'id'}, onDelete: 'RESTRICT'},
    fileCatalogItemId: {type: DataTypes.INTEGER, references: {model: models.FileCatalogItem, key: 'id'}, onDelete: 'SET NULL'},
  }, {indexes: [
    {name: 'comic_page_operation_user_key_unique', unique: true, fields: ['userId', 'idempotencyKey']},
    {name: 'comic_page_operation_version_unique', unique: true, fields: ['userId', 'comicId', 'pageId', 'pageRevision']},
    {name: 'comic_page_operation_content_idx', fields: ['contentId']},
    {name: 'comic_page_operation_catalog_idx', fields: ['fileCatalogItemId']},
  ]});
  models.ComicPageOperation = model;
  return model.sync({});
}
