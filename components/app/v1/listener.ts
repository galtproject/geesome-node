import {IGroup} from "../../database/interface";
import {IGeesomeApp} from "../interface";

export {};

module.exports = (geesomeApp: IGeesomeApp) => {
  
  console.log('geesomeApp.storage[\'node\']._ipns.cache', );
  
  geesomeApp.database.getRemoteGroups().then(remoteGroups => {
    // console.log('remoteGroups', remoteGroups);
    remoteGroups.forEach(subscribeForGroupUpdates)
  });
  
  geesomeApp.events.on(geesomeApp.events.NewRemoteGroup, subscribeForGroupUpdates);
  
  function subscribeForGroupUpdates(group: IGroup) {
    console.log('subscribeForGroupUpdates', group.manifestStaticStorageId);
    return geesomeApp.storage.subscribeToIpnsUpdates(group.manifestStaticStorageId, (message) => {
      handleIpnsUpdate(group.manifestStaticStorageId, message);
    })
  }
  
  function handleIpnsUpdate(ipnsId, message) {
    console.log('handleIpnsUpdate');
    console.log('ipnsId', ipnsId);
    console.log('message.data', message.data);
    geesomeApp.database.addStaticIdHistoryItem({
      staticId: ipnsId,
      dynamicId: message.data.valueStr.replace('/ipfs/', ''),
      periodTimestamp: message.data.ttl,
      isActive: true,
      boundAt: message.data.validity.toString('utf8')
    });
    // geesomeApp.storage['node']._ipns.cache.set(ipnsId, message.data.valueStr, { ttl: message.data.ttl })
  }
};
