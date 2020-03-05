/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const postsTable = await queryInterface.describeTable('posts');

    if(postsTable['groupStorageId']) {
      return;
    }

    return Promise.all([
      queryInterface.addColumn('posts', 'groupStorageId', {
        type: Sequelize.STRING(200)
      }).catch(() => {}),
      queryInterface.addColumn('posts', 'groupStaticStorageId', {
        type: Sequelize.STRING(200)
      }).catch(() => {}),
      queryInterface.addColumn('posts', 'authorStorageId', {
        type: Sequelize.STRING(200)
      }).catch(() => {})
    ]);
  },

  down: (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.removeColumn('posts', 'groupStorageId').catch(() => {}),
      queryInterface.removeColumn('posts', 'groupStaticStorageId').catch(() => {}),
      queryInterface.removeColumn('posts', 'authorStorageId').catch(() => {})
    ]);
  }
};
