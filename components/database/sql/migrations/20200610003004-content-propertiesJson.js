'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const contentsTable = await queryInterface.describeTable('contents');

    if(contentsTable['propertiesJson']) {
      return;
    }

    return Promise.all([
      queryInterface.addColumn('contents', 'propertiesJson', {
        type: Sequelize.TEXT
      }).catch(() => {})
    ]);
  },

  down: (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.removeColumn('contents', 'propertiesJson').catch(() => {}),
    ]);
  }
};
