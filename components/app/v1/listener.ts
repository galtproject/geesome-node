import {IGroup} from "../../database/interface";
import {IGeesomeApp} from "../interface";

export {};

module.exports = (geesomeApp: IGeesomeApp) => {
  
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
    console.log('message.data.valueStr', message.data.valueStr);
  }
};
