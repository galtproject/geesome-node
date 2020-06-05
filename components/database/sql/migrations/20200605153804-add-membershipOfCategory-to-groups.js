'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const groupsTable = await queryInterface.describeTable('groups');

    if(groupsTable['membershipOfCategoryId']) {
      return;
    }

    return Promise.all([
      queryInterface.addColumn('groups', 'membershipOfCategoryId', {
        type: Sequelize.INTEGER
      }).catch(() => {})
    ]);
  },

  down: (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.removeColumn('groups', 'membershipOfCategoryId').catch(() => {}),
    ]);
  }
};
