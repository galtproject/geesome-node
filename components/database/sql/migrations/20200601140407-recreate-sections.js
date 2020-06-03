'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('groupSections');
  },

  down: (queryInterface, Sequelize) => {

  }
};
