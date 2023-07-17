'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const objectTable = await queryInterface.describeTable('groups');

    if(objectTable['directoryStorageId']) {
      return;
    }

    return Promise.all([
      queryInterface.addColumn('groups', 'directoryStorageId', {
        type: Sequelize.STRING(200)
      }).catch(() => {}),
      queryInterface.addColumn('posts', 'directoryStorageId', {
        type: Sequelize.STRING(200)
      }).catch(() => {})
    ]);
  },

  down: (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.removeColumn('groups', 'directoryStorageId').catch(() => {}),
      queryInterface.removeColumn('posts', 'directoryStorageId').catch(() => {}),
    ]);
  }
};
