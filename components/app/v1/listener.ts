import {IGroup} from "../../database/interface";
import {IGeesomeApp} from "../interface";

export {};

module.exports = async (geesomeApp: IGeesomeApp) => {

  const peersToIpns = {};

  const selfIpnsId = await geesomeApp.storage.getAccountIdByName('self');
  console.log('selfIpnsId', selfIpnsId);

  geesomeApp.storage['fsub'].libp2p.on('peer:disconnect', (peerDisconnect) => {
    const peerId = peerDisconnect.id._idB58String;
    if (peersToIpns[peerId]) {
      console.log('❗️ Disconected from remote node!');
    }
  });
  geesomeApp.storage['fsub'].libp2p.on('connection:start', (connectionStart) => {
    const peerId = connectionStart.id._idB58String;
    if (peersToIpns[peerId]) {
      console.log('✅️ Connected to remote node!');
      Array.from(peersToIpns[peerId]).forEach((ipnsId) => {
        subscribeToIpnsUpdates(ipnsId);
      })
    }
  });
  // geesomeApp.storage['fsub'].libp2p.on('disconnected', (disconected) => {
  //   // console.log('disconected', disconected.id._idB58String);
  //   if(disconected.id._idB58String === remoteNode) {
  //     console.log('❗️ Disconected from remote node!');
  //   }
  // });
  // geesomeApp.storage['fsub'].libp2p.on('connection:end', (connectionEnd) => {
  //   // console.log('connection:end', connectionEnd.id._idB58String);
  //   if(connectionEnd.id._idB58String === remoteNode) {
  //     console.log('❗️ Disconected from remote node!');
  //   }
  // });

  geesomeApp.database.getRemoteGroups().then(remoteGroups => {
    remoteGroups.forEach(subscribeForGroupUpdates)
  });

  geesomeApp.events.on(geesomeApp.events.NewRemoteGroup, subscribeForGroupUpdates);

  function subscribeForGroupUpdates(group: IGroup) {
    subscribeToIpnsUpdates(group.manifestStaticStorageId);
  }

  const connectionIntervals = {};

  function subscribeToIpnsUpdates(ipnsId) {
    console.log('📡 subscribeToIpnsUpdates', ipnsId);
    geesomeApp.storage.subscribeToIpnsUpdates(ipnsId, (message) => {
      handleIpnsUpdate(ipnsId, message);
    });

    if (connectionIntervals[ipnsId]) {
      clearInterval(connectionIntervals[ipnsId]);
    }

    connectionIntervals[ipnsId] = setInterval(() => {
      geesomeApp.storage.getIpnsPeers(ipnsId).then((peers) => {
        console.log(ipnsId, 'peers', peers);
        if (!peers.length) {
          subscribeToIpnsUpdates(ipnsId);
        }
        peers.forEach(peerId => {
          if (!peersToIpns[peerId]) {
            peersToIpns[peerId] = new Set();
          }
          peersToIpns[peerId].add(ipnsId);
        });
      })
    }, 5 * 60 * 1000)
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
    }).catch(() => {/* already exists */
    });
    // geesomeApp.storage['node']._ipns.cache.set(ipnsId, message.data.valueStr, { ttl: message.data.ttl })
  }
};
