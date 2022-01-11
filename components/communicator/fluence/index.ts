import {IGeesomeApp} from "../../app/interface";

const { testNet } = require('@fluencelabs/fluence-network-environment');
const { FluencePeer } = require("@fluencelabs/fluence");
import DatabaseAccountStorage from "../../accountStorage/database";
const FluenceService = require('geesome-libs/src/fluenceService');

module.exports = async (app: IGeesomeApp) => {
    // let neighbours = await dhtApi.getNeighbours(client, nodeId, 'topic')
    const peer = new FluencePeer();
    await peer.start({
        connectTo: testNet[2],
    });
    const databaseAccountStorage = new DatabaseAccountStorage(app.database, app.config.storageConfig.jsNode.pass);
    return new FluenceService(databaseAccountStorage, peer, {logLevel: null /*'debug'*/});
}