'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const groupsTable = await queryInterface.describeTable('posts');

    if(groupsTable['propertiesJson']) {
      return;
    }

    return Promise.all([
      queryInterface.addColumn('posts', 'propertiesJson', {
        type: Sequelize.TEXT
      }).catch(() => {})
    ]);
  },

  down: (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.removeColumn('posts', 'propertiesJson').catch(() => {}),
    ]);
  }
};
