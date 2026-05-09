/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */
import {Sequelize, DataTypes} from 'sequelize';

export default async function (sequelize: Sequelize, models) {

  const AutoTag = sequelize.define('autoTag', {
    // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
    isGlobal: {
      type: DataTypes.BOOLEAN
    },
    requiredTagsCount: {
      type: DataTypes.INTEGER
    }
  } as any, {
    indexes: [
      { name: 'auto_tags_group_idx', fields: ['groupId'] },
      { name: 'auto_tags_result_tag_idx', fields: ['resultTagId'] },
      { name: 'auto_tags_required_tag1_idx', fields: ['requiredTag1Id'] },
      { name: 'auto_tags_required_tag2_idx', fields: ['requiredTag2Id'] },
      { name: 'auto_tags_required_tag3_idx', fields: ['requiredTag3Id'] },
      { name: 'auto_tags_required_tag4_idx', fields: ['requiredTag4Id'] },
      { name: 'auto_tags_required_tag5_idx', fields: ['requiredTag5Id'] },
    ]
  } as any);

  AutoTag.belongsTo(models.Tag, {as: 'requiredTag1', foreignKey: 'requiredTag1Id'});
  AutoTag.belongsTo(models.Tag, {as: 'requiredTag2', foreignKey: 'requiredTag2Id'});
  AutoTag.belongsTo(models.Tag, {as: 'requiredTag3', foreignKey: 'requiredTag3Id'});
  AutoTag.belongsTo(models.Tag, {as: 'requiredTag4', foreignKey: 'requiredTag4Id'});
  AutoTag.belongsTo(models.Tag, {as: 'requiredTag5', foreignKey: 'requiredTag5Id'});

  AutoTag.belongsTo(models.Tag, {as: 'resultTag', foreignKey: 'resultTagId'});

  AutoTag.belongsTo(models.Group, {as: 'group', foreignKey: 'groupId'});
  models.Group.hasMany(AutoTag, {as: 'autoTags', foreignKey: 'groupId'});

  return AutoTag.sync({});
};
