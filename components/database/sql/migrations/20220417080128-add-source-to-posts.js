'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const objectTable = await queryInterface.describeTable('posts');

    if(objectTable['source']) {
      return;
    }

    return Promise.all([
      queryInterface.addColumn('posts', 'source', {
        type: Sequelize.STRING(200)
      }).catch(() => {}),
      queryInterface.addColumn('posts', 'sourceChannelId', {
        type: Sequelize.STRING(200)
      }).catch(() => {}),
      queryInterface.addColumn('posts', 'sourcePostId', {
        type: Sequelize.STRING(200)
      }).catch(() => {}),
      queryInterface.addColumn('posts', 'sourceDate', {
        type: Sequelize.DATE
      }).catch(() => {})
    ]);
  },

  down: async (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.removeColumn('posts', 'source').catch(() => {}),
      queryInterface.removeColumn('posts', 'sourceChannelId').catch(() => {}),
      queryInterface.removeColumn('posts', 'sourcePostId').catch(() => {}),
      queryInterface.removeColumn('posts', 'sourceDate').catch(() => {}),
    ]);
  }
};
