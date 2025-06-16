'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.changeColumn('contents', 'size', {
        type: Sequelize.BIGINT()
      }).catch((e) => console.error(e)),
      queryInterface.changeColumn('fileCatalogItems', 'size', {
        type: Sequelize.BIGINT()
      }).catch((e) => console.error(e)),
    ]);
  },

  down: (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.changeColumn('contents', 'size', {
        type: Sequelize.INTEGER()
      }).catch((e) => console.error(e)),
      queryInterface.changeColumn('fileCatalogItems', 'size', {
        type: Sequelize.INTEGER()
      }).catch((e) => console.error(e)),
    ]);
  }
};
