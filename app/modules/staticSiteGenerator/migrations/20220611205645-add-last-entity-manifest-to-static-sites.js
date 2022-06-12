'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const objectTable = await queryInterface.describeTable('staticSites');

    if(objectTable['lastEntityManifestStorageId']) {
      return;
    }

    return Promise.all([
      queryInterface.addColumn('staticSites', 'lastEntityManifestStorageId', {
        type: Sequelize.STRING(100)
      }).catch(() => {})
    ]);
  },

  down: (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.removeColumn('staticSites', 'lastEntityManifestStorageId').catch(() => {}),
    ]);
  }
};
