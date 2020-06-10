'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const postsTable = await queryInterface.describeTable('posts');

    if(postsTable['isDeleted']) {
      return;
    }

    return Promise.all([
      queryInterface.addColumn('posts', 'isDeleted', {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      }).catch(() => {})
    ]);
  },

  down: (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.removeColumn('posts', 'isDeleted').catch(() => {}),
    ]);
  }
};
