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
      queryInterface.addColumn('groups', 'theme', {
        type: Sequelize.STRING(200)
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
      queryInterface.removeColumn('groups', 'creatorId').catch(() => {}),
      queryInterface.removeColumn('groups', 'isEncrypted').catch(() => {}),
      queryInterface.removeColumn('groups', 'theme').catch(() => {}),
      queryInterface.removeColumn('users', 'isRemote').catch(() => {}),
      queryInterface.removeColumn('posts', 'authorStaticStorageId').catch(() => {}),
      queryInterface.removeColumn('posts', 'encryptedManifestStorageId').catch(() => {}),
      queryInterface.removeColumn('posts', 'isEncrypted').catch(() => {}),
      queryInterface.removeColumn('posts', 'isRemote').catch(() => {}),
      queryInterface.removeColumn('contents', 'isRemote').catch(() => {}),
      queryInterface.removeColumn('contents', 'isEncrypted').catch(() => {}),
      queryInterface.removeColumn('contents', 'encryptedManifestStorageId').catch(() => {})
    ]);
  }
};
