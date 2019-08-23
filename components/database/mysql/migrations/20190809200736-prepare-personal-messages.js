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
      }).catch(() => {}),
      queryInterface.addColumn('groups', 'isEncrypted', {
        type: Sequelize.BOOLEAN
      }).catch(() => {}),
      queryInterface.addColumn('groups', 'theme', {
        type: Sequelize.STRING(200)
      }).catch(() => {}),
      queryInterface.addColumn('users', 'isRemote', {
        type: Sequelize.BOOLEAN
      }).catch(() => {}),
      queryInterface.addColumn('posts', 'authorStaticStorageId', {
        type: Sequelize.STRING(200)
      }).catch(() => {}),
      queryInterface.addColumn('posts', 'encryptedManifestStorageId', {
        type: Sequelize.TEXT
      }).catch(() => {}),
      queryInterface.addColumn('posts', 'isEncrypted', {
        type: Sequelize.BOOLEAN
      }).catch(() => {}),
      queryInterface.addColumn('posts', 'isRemote', {
        type: Sequelize.BOOLEAN
      }).catch(() => {}),
      queryInterface.addColumn('contents', 'isRemote', {
        type: Sequelize.BOOLEAN
      }).catch(() => {}),
      queryInterface.addColumn('contents', 'isEncrypted', {
        type: Sequelize.BOOLEAN
      }).catch(() => {}),
      queryInterface.addColumn('contents', 'encryptedManifestStorageId', {
        type: Sequelize.TEXT
      }).catch(() => {})
    ]);
  },

  down: async (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.removeColumn('groups', 'creatorId'),
      queryInterface.removeColumn('groups', 'isEncrypted'),
      queryInterface.removeColumn('groups', 'theme'),
      queryInterface.removeColumn('users', 'isRemote'),
      queryInterface.removeColumn('posts', 'authorStaticStorageId'),
      queryInterface.removeColumn('posts', 'encryptedManifestStorageId'),
      queryInterface.removeColumn('posts', 'isEncrypted'),
      queryInterface.removeColumn('posts', 'isRemote'),
      queryInterface.removeColumn('contents', 'isRemote'),
      queryInterface.removeColumn('contents', 'isEncrypted'),
      queryInterface.removeColumn('contents', 'encryptedManifestStorageId')
    ]);
  }
};
