export {};

const cron = require('node-cron');
const pIteration = require('p-iteration');

module.exports = (geesomeApp) => {
  
  //TODO: get from settings
  const updateOutdatedForSeconds = 60;
  const bindStaticForHours = 24;

  updateStaticIdsOfGroups();
  
  cron.schedule('* * * * *', () => {
    updateStaticIdsOfGroups();
  });
  
  async function updateStaticIdsOfGroups() {
    console.log('updateStaticIdsOfGroups');
    
    const groupsToUpdateStatic = await geesomeApp.database.getGroupWhereStaticOutdated(updateOutdatedForSeconds);
    await pIteration.forEach(groupsToUpdateStatic, async (group) => {
      console.log('bindToStaticId group', group.name, group.manifestStorageId, group.manifestStaticStorageId);
      await geesomeApp.storage.bindToStaticId(group.manifestStorageId, group.manifestStaticStorageId, bindStaticForHours);
      
      await geesomeApp.database.updateGroup(group.id, {
        staticStorageUpdatedAt: new Date()
      });
    });
  }
};
