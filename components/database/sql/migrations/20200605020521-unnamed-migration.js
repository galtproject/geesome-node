'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.addIndex('groupSections', ['name', 'categoryId'], { unique: true}).catch(() => {})
    ]);
  },

  down: (queryInterface, Sequelize) => {

  }
};