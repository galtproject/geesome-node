export {};

const cron = require('node-cron');
const pIteration = require('p-iteration');

module.exports = (geesomeApp) => {

  updateStaticIdsOfGroups();
  
  cron.schedule('* * * * *', () => {
    updateStaticIdsOfGroups();
  });
  
  async function updateStaticIdsOfGroups() {
    console.log('updateStaticIdsOfGroups');
    
    const groupsToUpdateStatic = await geesomeApp.database.getGroupWhereStaticOutdated(60);
    await pIteration.forEach(groupsToUpdateStatic, async (group) => {
      console.log('bindToStaticId group', group.name, group.manifestStorageId, group.manifestStaticStorageId);
      await geesomeApp.storage.bindToStaticId(group.manifestStorageId, group.manifestStaticStorageId, 24);
      
      await geesomeApp.database.updateGroup(group.id, {
        staticStorageUpdatedAt: new Date()
      });
    });
  }
};
