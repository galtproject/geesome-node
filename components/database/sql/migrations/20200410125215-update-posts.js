'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const postsTable = await queryInterface.describeTable('postsContents');

    if(postsTable['view']) {
      return;
    }

    return Promise.all([
      queryInterface.addColumn('postsContents', 'view', {
        type: Sequelize.STRING(200)
      }).catch(() => {})
    ]);
  },

  down: (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.removeColumn('postsContents', 'view').catch(() => {})
    ]);
  }
};
