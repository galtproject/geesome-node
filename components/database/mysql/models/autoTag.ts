/*
 * Copyright ©️ 2018 Galt•Space Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka),
 * [Dima Starodubcev](https://github.com/xhipster),
 * [Valery Litvin](https://github.com/litvintech) by
 * [Basic Agreement](http://cyb.ai/QmSAWEG5u5aSsUyMNYuX2A2Eaz4kEuoYWUkVBRdmu9qmct:ipfs)).
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) and
 * Galt•Space Society Construction and Terraforming Company by
 * [Basic Agreement](http://cyb.ai/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS:ipfs)).
 */

module.exports = async function (sequelize, models) {
  const Sequelize = require('sequelize');

  const AutoTag = sequelize.define('autoTag', {
    // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
    isGlobal: {
      type: Sequelize.BOOLEAN
    },
    requiredTagsCount: {
      type: Sequelize.INTEGER
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
