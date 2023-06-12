'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const objectTable = await queryInterface.describeTable('socNetImport_message');

    if(objectTable['isNeedToReverse']) {
      return;
    }
    return Promise.all([
      queryInterface.addColumn('socNetImport_message', 'isNeedToReverse', {
        type: Sequelize.BOOLEAN,
      }).catch(() => {})
    ]);
  },

  down: async (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.removeColumn('socNetImport_message', 'isNeedToReverse').catch(() => {}),
    ]);
  }
};
