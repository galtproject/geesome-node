'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const groupsTable = await queryInterface.describeTable('groups');

    if(groupsTable['availablePostsCount']) {
      return;
    }

    return Promise.all([
      queryInterface.addColumn('groups', 'availablePostsCount', {
        type: Sequelize.INTEGER
      }).catch(() => {})
    ]);
  },

  down: (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.removeColumn('groups', 'availablePostsCount').catch(() => {}),
    ]);
  }
};
