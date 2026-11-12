import {DataTypes, Sequelize} from 'sequelize';

export default async function (sequelize: Sequelize, models) {
  const GroupSubgroup = sequelize.define('groupSubgroup', {
    parentGroupId: {type: DataTypes.INTEGER, allowNull: false, references: {model: models.Group, key: 'id'}, onDelete: 'CASCADE'},
    subgroupId: {type: DataTypes.INTEGER, allowNull: false, references: {model: models.Group, key: 'id'}, onDelete: 'CASCADE'},
    alias: {type: DataTypes.STRING(64), allowNull: false},
    config: {type: DataTypes.JSONB, allowNull: false, defaultValue: {}},
    revision: {type: DataTypes.INTEGER, allowNull: false, defaultValue: 1},
  }, {
    indexes: [
      {name: 'group_subgroup_parent_alias_unique', unique: true, fields: ['parentGroupId', 'alias']},
      {name: 'group_subgroup_parent_child_unique', unique: true, fields: ['parentGroupId', 'subgroupId']},
      {name: 'group_subgroup_child_idx', fields: ['subgroupId']},
    ],
  });
  await GroupSubgroup.sync({});
  const table = sequelize.getQueryInterface().queryGenerator.quoteTable(GroupSubgroup.getTableName());
  await sequelize.query(`DO $$ BEGIN ALTER TABLE ${table} ADD CONSTRAINT group_subgroup_not_self CHECK ("parentGroupId" <> "subgroupId"); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
  return GroupSubgroup;
}
