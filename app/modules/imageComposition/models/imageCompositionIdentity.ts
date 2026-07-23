import {DataTypes, Sequelize} from 'sequelize';

export default async function (sequelize: Sequelize, models) {
  const ImageCompositionIdentity = sequelize.define('imageCompositionIdentity', {
    userId: {type: DataTypes.INTEGER, allowNull: false},
    compositionId: {type: DataTypes.STRING(200), allowNull: false},
    rootContentId: {type: DataTypes.INTEGER, references: {model: models.Content, key: 'id'}, onDelete: 'RESTRICT'},
    currentContentId: {type: DataTypes.INTEGER, references: {model: models.Content, key: 'id'}, onDelete: 'RESTRICT'},
    fileCatalogItemId: {type: DataTypes.INTEGER, references: {model: models.FileCatalogItem, key: 'id'}, onDelete: 'SET NULL'},
  } as any, {
    indexes: [
      {name: 'image_composition_identities_user_composition_unique', fields: ['userId', 'compositionId'], unique: true},
      {name: 'image_composition_identities_root_content_idx', fields: ['rootContentId']},
      {name: 'image_composition_identities_current_content_idx', fields: ['currentContentId']},
      {name: 'image_composition_identities_file_catalog_item_idx', fields: ['fileCatalogItemId']},
    ],
  } as any);
  models.ImageCompositionIdentity = ImageCompositionIdentity;
  return ImageCompositionIdentity.sync({});
}
