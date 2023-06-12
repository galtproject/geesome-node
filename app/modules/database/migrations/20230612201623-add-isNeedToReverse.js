'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const objectTable = await queryInterface.describeTable('socNetImport_messages');

    if(objectTable['isNeedToReverse']) {
      return;
    }
    return Promise.all([
      queryInterface.addColumn('socNetImport_messages', 'isNeedToReverse', {
        type: Sequelize.BOOLEAN,
      }).catch(() => {})
    ]);
  },

  down: async (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.removeColumn('socNetImport_messages', 'isNeedToReverse').catch(() => {}),
    ]);
  }
};
