/*
 * Copyright ©️ 2019 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2019 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {IGroup, IPost} from "../../database/interface";
import {IGeesomeApp} from "../interface";

const {getPersonalChatTopic, getIpnsUpdatesTopic} = require('@galtproject/geesome-libs/src/name');
const bs58 = require('bs58');

export {};

module.exports = async (geesomeApp: IGeesomeApp) => {

  const peersToTopic = {};

  const selfIpnsId = await geesomeApp.storage.getAccountIdByName('self');
  console.log('selfIpnsId', selfIpnsId);

  geesomeApp.storage['fsub'].libp2p.on('peer:disconnect', (peerDisconnect) => {
    const peerId = peerDisconnect.id._idB58String;
    const topic = getIpnsUpdatesTopic(peerId);
    if (peersToTopic[topic]) {
      console.log('❗️ Disconected from remote node!');
    }
  });
  geesomeApp.storage['fsub'].libp2p.on('connection:start', (connectionStart) => {
    const peerId = connectionStart.id._idB58String;
    const topic = getIpnsUpdatesTopic(peerId);
    if (peersToTopic[topic]) {
      console.log('✅️ Connected to remote node!');
      Array.from(peersToTopic[topic]).forEach((ipnsId) => {
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
  
  geesomeApp.database.getPersonalChatGroups().then(personalGroups => {
    personalGroups.forEach(subscribeForPersonalGroupUpdates)
  });

  geesomeApp.events.on(geesomeApp.events.NewRemoteGroup, subscribeForGroupUpdates);
  geesomeApp.events.on(geesomeApp.events.NewPersonalGroup, subscribeForPersonalGroupUpdates);

  function subscribeForGroupUpdates(group: IGroup) {
    subscribeToIpnsUpdates(group.manifestStaticStorageId);
  }

  async function subscribeForPersonalGroupUpdates(group: IGroup) {
    const creator = await geesomeApp.database.getUser(group.creatorId);
    const groupTopic = getPersonalChatTopic([creator.manifestStaticStorageId, group.staticStorageId], group.theme);

    console.log('📡 subscribeForPersonalGroupUpdates', groupTopic);
    geesomeApp.storage.subscribeToEvent(groupTopic, (message) => {
      handlePersonalChatUpdate(group, message);
    });

    handleUnsubscribe(groupTopic, () => {
      subscribeForPersonalGroupUpdates(group);
    })
  }

  const connectionIntervals = {};

  function subscribeToIpnsUpdates(ipnsId) {
    console.log('📡 subscribeToIpnsUpdates', ipnsId);
    geesomeApp.storage.subscribeToIpnsUpdates(ipnsId, (message) => {
      handleIpnsUpdate(ipnsId, message);
    });

    handleUnsubscribe(getIpnsUpdatesTopic(ipnsId), () => {
      subscribeToIpnsUpdates(ipnsId);
    })
  }
  
  function handleUnsubscribe(topic, callback) {
    if (connectionIntervals[topic]) {
      clearInterval(connectionIntervals[topic]);
    }

    connectionIntervals[topic] = setInterval(() => {
      geesomeApp.storage.getPeers(topic).then((peers) => {
        console.log(topic, 'peers', peers);
        if (!peers.length) {
          callback();
        }
        peers.forEach(peerId => {
          if (!peersToTopic[peerId]) {
            peersToTopic[peerId] = new Set();
          }
          peersToTopic[peerId].add(topic);
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
    }).catch(() => {/* already exists */});

    geesomeApp.database.setStaticIdPublicKey(ipnsId, bs58.encode(message.data.key)).catch(() => {/* already exists */});
  }
  
  async function handlePersonalChatUpdate(personalGroup: IGroup, message) {
    console.log('handlePersonalChatUpdate');
    // console.log('personalGroup', personalGroup);
    // console.log('message.dataJson', message.dataJson);
    
    const messageData = message.dataJson;

    // const eventGroup: IGroup = await geesomeApp.render.manifestIdToDbObject(messageData.groupId);
    //
    // console.log('personalGroup.staticStorageId', personalGroup.staticStorageId);
    // console.log('message.keyIpns', message.keyIpns);
    
    if(message.keyIpns === personalGroup.staticStorageId) {
      const dbPost = await geesomeApp.createPostByRemoteStorageId(messageData.postId, personalGroup.id, messageData.sentAt, messageData.isEncrypted);
      console.log('💬 new post in personal chat', messageData, dbPost);
    }
  }
};
