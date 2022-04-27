import {IGeesomeApp} from "../../../interface";
const { testNet } = require('@fluencelabs/fluence-network-environment');
const { FluencePeer, KeyPair } = require("@fluencelabs/fluence");
const FluenceService = require('geesome-libs/src/fluenceService');

module.exports = async (app: IGeesomeApp) => {
    // let neighbours = await dhtApi.getNeighbours(client, nodeId, 'topic')
    const peer = new FluencePeer();
    while (true) {
        try {
            await peer.start({
                connectTo: testNet[2],
                KeyPair: new KeyPair(await app.ms.accountStorage.getAccountPeerId('self'))
            });
            return new FluenceService(app.ms.accountStorage, peer, {logLevel: null /*'debug'*/});
        } catch (e) {
            console.warn('peer.start error, trying to reconnect...', e.message);
            await new Promise((resolve) => setTimeout(resolve, 5 * 1000));
        }
    }
}