import {IGeesomeApp} from "../../app/interface";

const { testNet } = require('@fluencelabs/fluence-network-environment');
const { FluencePeer, KeyPair } = require("@fluencelabs/fluence");
import DatabaseAccountStorage from "../../accountStorage/database";
const FluenceService = require('geesome-libs/src/fluenceService');
const peerIdHelper = require('geesome-libs/src/peerIdHelper');

module.exports = async (app: IGeesomeApp) => {
    // let neighbours = await dhtApi.getNeighbours(client, nodeId, 'topic')
    let databaseAccountStorage = new DatabaseAccountStorage(app.database, app.config.storageConfig.jsNode.pass);
    await databaseAccountStorage.getOrCreateAccountStaticId('self');
    const selfPeerId = await databaseAccountStorage.getAccountPeerId('self');
    console.log('selfPeerId', peerIdHelper.peerIdToPublicBase58(selfPeerId))

    const peer = new FluencePeer();
    while (true) {
        try {
            await peer.start({
                connectTo: testNet[2],
                KeyPair: new KeyPair(selfPeerId)
            });
            return new FluenceService(databaseAccountStorage, peer, {logLevel: null /*'debug'*/});
        } catch (e) {
            console.warn('peer.start error, trying to reconnect...', e.message);
            await new Promise((resolve) => setTimeout(resolve, 5 * 1000));
        }
    }
}