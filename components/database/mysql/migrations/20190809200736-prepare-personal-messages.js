'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const groupsTable = await queryInterface.describeTable('groups');
    
    if(groupsTable['creatorId']) {
      return;
    }
    
    return Promise.all([
      queryInterface.addColumn('groups', 'creatorId', {
        type: Sequelize.INTEGER
      }),
      queryInterface.addColumn('groups', 'isEncrypted', {
        type: Sequelize.BOOLEAN
      }),
      queryInterface.addColumn('users', 'isRemote', {
        type: Sequelize.BOOLEAN
      }),
      queryInterface.addColumn('posts', 'authorStaticStorageId', {
        type: Sequelize.STRING(200)
      }),
      queryInterface.addColumn('posts', 'encryptedManifestStorageId', {
        type: Sequelize.TEXT
      }),
      queryInterface.addColumn('posts', 'isEncrypted', {
        type: Sequelize.BOOLEAN
      }),
      queryInterface.addColumn('posts', 'isRemote', {
        type: Sequelize.BOOLEAN
      }),
      queryInterface.addColumn('contents', 'isRemote', {
        type: Sequelize.BOOLEAN
      }),
      queryInterface.addColumn('contents', 'isEncrypted', {
        type: Sequelize.BOOLEAN
      }),
      queryInterface.addColumn('contents', 'encryptedManifestStorageId', {
        type: Sequelize.TEXT
      })
    ]);
  },

  down: async (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.removeColumn('groups', 'creatorId'),
      queryInterface.removeColumn('users', 'isRemote'),
      queryInterface.removeColumn('posts', 'authorStaticStorageId'),
      queryInterface.removeColumn('posts', 'isRemote'),
      queryInterface.removeColumn('contents', 'isRemote')
    ]);
  }
};
