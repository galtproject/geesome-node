'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const objectTable = await queryInterface.describeTable('objects');

    if(objectTable['resolveProp']) {
      return;
    }

    return Promise.all([
      queryInterface.addColumn('objects', 'resolveProp', {
        type: Sequelize.BOOLEAN
      }).catch(() => {})
    ]);
  },

  down: (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.removeColumn('objects', 'resolveProp').catch(() => {}),
    ]);
  }
};
