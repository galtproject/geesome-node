import {IGroup} from "../../database/interface";
import {IGeesomeApp} from "../interface";

const {getIpnsUpdatesTopic} = require('@galtproject/geesome-libs/src/ipfsHelper')

const _ = require('lodash');

export {};

module.exports = async (geesomeApp: IGeesomeApp) => {
  
  const selfIpnsId = await geesomeApp.storage.getAccountIdByName('self');
  
  console.log('geesomeApp.storage[\'node\']._ipns.cache', );
  
  geesomeApp.database.getRemoteGroups().then(remoteGroups => {
    // console.log('remoteGroups', remoteGroups);
    remoteGroups.forEach(subscribeForGroupUpdates)
  });
  
  geesomeApp.events.on(geesomeApp.events.NewRemoteGroup, subscribeForGroupUpdates);
  
  function subscribeForGroupUpdates(group: IGroup) {
    console.log('subscribeForGroupUpdates', group.manifestStaticStorageId);
    geesomeApp.storage.subscribeToIpnsUpdates(group.manifestStaticStorageId, (message) => {
      handleIpnsUpdate(group.manifestStaticStorageId, message);
    });
    
    const checkConnectionInterval = setInterval(() => {
      geesomeApp.storage.getPubSubLs().then((subscriptions) => {
        const recordName = getIpnsUpdatesTopic(group.manifestStaticStorageId);
        let isGroupExistInSubscriptions = subscriptions.some(peer => _.includes(peer, recordName));
        console.log('subscriptions', subscriptions);
        if(isGroupExistInSubscriptions) {
          return;
        }
        console.log('group not exists in subscriptions', selfIpnsId, recordName);
        
        clearInterval(checkConnectionInterval);
        subscribeForGroupUpdates(group);
      })
    }, 60 * 1000)
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
