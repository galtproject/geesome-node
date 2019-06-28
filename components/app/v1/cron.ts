const cron = require('node-cron');
const pIteration = require('p-iteration');

module.exports = (geesomeApp) => {
  
  cron.schedule('0 * * * *', () => {
    updateStaticIdsOfGroups();
  });
  
  async function updateStaticIdsOfGroups() {
    console.log('updateStaticIdsOfGroups');
    
    const groupsToUpdateStatic = await geesomeApp.database.getGroupWhereStaticOutdated(1);
    await pIteration.forEach(groupsToUpdateStatic, async (group) => {
      console.log('bindToStaticId group', group.name);
      await geesomeApp.storage.bindToStaticId(group.manifestStorageId, group.manifestStaticStorageId, 1);
      
      await this.database.updateGroup(group.id, {
        staticStorageUpdatedAt: new Date()
      });
    });
  }
};
