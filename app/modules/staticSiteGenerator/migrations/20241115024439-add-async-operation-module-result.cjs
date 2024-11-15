'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log(await queryInterface.showAllTables());
    const objectTable = await queryInterface.describeTable('userAsyncOperations');

    if(objectTable['module']) {
      return;
    }

    return Promise.all([
      queryInterface.addColumn('userAsyncOperations', 'module', {
        type: Sequelize.STRING(200)
      }).catch(() => {}),
      queryInterface.addColumn('userAsyncOperations', 'output', {
        type: Sequelize.STRING(200)
      }).catch(() => {})
    ]);
  },

  down: (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.removeColumn('userAsyncOperations', 'module').catch(() => {}),
      queryInterface.removeColumn('userAsyncOperations', 'output').catch(() => {}),
    ]);
  }
};
