'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const objectTable = await queryInterface.describeTable('userAsyncOperations');

    if(objectTable['userAsyncOperations']) {
      return;
    }
    return Promise.all([
      queryInterface.addColumn('userAsyncOperations', 'cancel', {
        type: Sequelize.STRING(200)
      }).catch(() => {})
    ]);
  },

  down: async (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.removeColumn('userAsyncOperations', 'cancel').catch(() => {}),
    ]);
  }
};
