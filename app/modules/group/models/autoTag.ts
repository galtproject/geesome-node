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
      // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
      // { fields: ['chainAccountAddress'] },
      // { fields: ['tokensAddress'] },
      // { fields: ['tokensAddress', 'chainAccountAddress'] }
    ]
  } as any);

  AutoTag.belongsTo(models.Tag, {as: 'requiredTag1', foreignKey: 'requiredTag1Id'});
  AutoTag.belongsTo(models.Tag, {as: 'requiredTag2', foreignKey: 'requiredTag2Id'});
  AutoTag.belongsTo(models.Tag, {as: 'requiredTag3', foreignKey: 'requiredTag3Id'});
  AutoTag.belongsTo(models.Tag, {as: 'requiredTag4', foreignKey: 'requiredTag4Id'});
  AutoTag.belongsTo(models.Tag, {as: 'requiredTag5', foreignKey: 'requiredTag5Id'});

  AutoTag.belongsTo(models.Tag, {as: 'resultTag', foreignKey: 'resultTagId'});

  AutoTag.belongsTo(models.Group, {as: 'group', foreignKey: 'groupId'});
  models.User.hasMany(AutoTag, {as: 'autoTags', foreignKey: 'groupId'});

  return AutoTag.sync({});
};
