'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const postsTable = await queryInterface.describeTable('posts');

    if(postsTable['repliesCount']) {
      return;
    }

    return Promise.all([
      queryInterface.addColumn('posts', 'repliesCount', {
        type: Sequelize.INTEGER
      }).catch(() => {}),
      queryInterface.addColumn('posts', 'repostsCount', {
        type: Sequelize.INTEGER
      }).catch(() => {})
    ]);
  },

  down: (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.removeColumn('posts', 'repliesCount').catch(() => {}),
      queryInterface.removeColumn('posts', 'repostsCount').catch(() => {})
    ]);
  }
};
