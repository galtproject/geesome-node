'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const objectTable = await queryInterface.describeTable('groups');

    if(objectTable['homePage']) {
      return;
    }

    return Promise.all([
      queryInterface.addColumn('groups', 'homePage', {
        type: Sequelize.BOOLEAN
      }).catch(() => {})
    ]);
  },

  down: (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.removeColumn('groups', 'homePage').catch(() => {}),
    ]);
  }
};
