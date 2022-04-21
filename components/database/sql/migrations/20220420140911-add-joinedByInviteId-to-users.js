'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const objectTable = await queryInterface.describeTable('users');

    if(objectTable['users']) {
      return;
    }
    return Promise.all([
      queryInterface.addColumn('users', 'joinedByInviteId', {
        type: Sequelize.INTEGER
      }).catch(() => {})
    ]);
  },

  down: async (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.removeColumn('users', 'joinedByInviteId').catch(() => {}),
    ]);
  }
};
