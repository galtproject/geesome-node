'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const postsTable = await queryInterface.describeTable('posts');

    if(postsTable['groupStorageId']) {
      return;
    }

    return Promise.all([
      queryInterface.addColumn('posts', 'groupStorageId', {
        type: Sequelize.STRING(200)
      }).catch(() => {}),
      queryInterface.addColumn('posts', 'groupStaticStorageId', {
        type: Sequelize.STRING(200)
      }).catch(() => {}),
      queryInterface.addColumn('posts', 'authorStorageId', {
        type: Sequelize.STRING(200)
      }).catch(() => {})
    ]);
  },

  down: (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.removeColumn('posts', 'groupStorageId').catch(() => {}),
      queryInterface.removeColumn('posts', 'groupStaticStorageId').catch(() => {}),
      queryInterface.removeColumn('posts', 'authorStorageId').catch(() => {})
    ]);
  }
};
