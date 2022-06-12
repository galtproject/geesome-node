'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const objectTable = await queryInterface.describeTable('staticSites');

    if(objectTable['userId']) {
      return;
    }

    return Promise.all([
      queryInterface.addColumn('staticSites', 'userId', {
        type: Sequelize.INTEGER
      }).catch(() => {})
    ]);
  },

  down: (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.removeColumn('staticSites', 'userId').catch(() => {}),
    ]);
  }
};
