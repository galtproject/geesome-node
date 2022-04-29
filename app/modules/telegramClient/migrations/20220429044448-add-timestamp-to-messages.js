'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const objectTable = await queryInterface.describeTable('socNetClient_telegram_messages');

    if(objectTable['timestamp']) {
      return;
    }

    return Promise.all([
      queryInterface.addColumn('socNetClient_telegram_messages', 'timestamp', {
        type: Sequelize.INTEGER
      }).catch(() => {})
    ]);
  },

  down: (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.removeColumn('socNetClient_telegram_messages', 'timestamp').catch(() => {}),
    ]);
  }
};
