'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const postsTable = await queryInterface.describeTable('posts');

    if(!postsTable['replyOfId']) {
      return;
    }
    return Promise.all([
      queryInterface.renameColumn('posts', 'replyOfId', 'replyToId'),
      queryInterface.dropTable('categoryGroups')
    ]);
  },

  down: (queryInterface, Sequelize) => {
    return (async () => {})();
  }
};
