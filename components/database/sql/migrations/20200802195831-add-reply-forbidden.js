'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const postsTable = await queryInterface.describeTable('posts');

    if(postsTable['isReplyForbidden']) {
      return;
    }

    return Promise.all([
      queryInterface.addColumn('posts', 'isReplyForbidden', {
        type: Sequelize.BOOLEAN
      }).catch(() => {})
    ]);
  },

  down: (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.removeColumn('posts', 'isReplyForbidden').catch(() => {}),
    ]);
  }
};
