import {DataTypes} from 'sequelize';

export default async function (sequelize, models) {
  const ContentDependency = sequelize.define('contentDependency', {
    parentContentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {model: models.Content, key: 'id'},
      onDelete: 'CASCADE',
    },
    childContentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {model: models.Content, key: 'id'},
      onDelete: 'RESTRICT',
    },
    role: {type: DataTypes.STRING(100), allowNull: false},
    position: {type: DataTypes.INTEGER, allowNull: false},
  } as any, {
    indexes: [
      {name: 'content_dependencies_parent_role_position_unique', fields: ['parentContentId', 'role', 'position'], unique: true},
      {name: 'content_dependencies_child_role_idx', fields: ['childContentId', 'role', 'id']},
      {name: 'content_dependencies_parent_child_idx', fields: ['parentContentId', 'childContentId']},
    ],
  } as any);
  models.ContentDependency = ContentDependency;
  return ContentDependency.sync({});
}
