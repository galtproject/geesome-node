'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const objectTable = await queryInterface.describeTable('groups');

    if(objectTable['groups']) {
      return;
    }
    return Promise.all([
      queryInterface.addColumn('groups', 'isDeleted', {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      }).catch(() => {})
    ]);
  },

  down: async (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.removeColumn('groups', 'isDeleted').catch(() => {}),
    ]);
  }
};
