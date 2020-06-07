'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const groupsTable = await queryInterface.describeTable('groups');

    if(groupsTable['isShowAuthors']) {
      return;
    }

    return Promise.all([
      queryInterface.addColumn('groups', 'isShowAuthors', {
        type: Sequelize.BOOLEAN
      }).catch(() => {})
    ]);
  },

  down: (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.removeColumn('groups', 'isShowAuthors').catch(() => {}),
    ]);
  }
};
