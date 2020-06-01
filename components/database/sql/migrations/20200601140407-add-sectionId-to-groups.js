'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const groupsTable = await queryInterface.describeTable('groups');

    if(groupsTable['sectionId']) {
      return;
    }

    return Promise.all([
      queryInterface.addColumn('groups', 'sectionId', {
        type: Sequelize.INTEGER
      }).catch(() => {})
    ]);
  },

  down: (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.removeColumn('groups', 'sectionId').catch(() => {}),
    ]);
  }
};
