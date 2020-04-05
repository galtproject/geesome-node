'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.renameColumn('posts', 'replyOfId', 'replyToId'),
      queryInterface.dropTable('categoryGroups')
    ]);
  },

  down: (queryInterface, Sequelize) => {
    return (async () => {})();
  }
};
