import {IGeesomeApp} from "../../app/interface";

import { krasnodar } from '@fluencelabs/fluence-network-environment';
import { createClient } from '@fluencelabs/fluence';
import DatabaseAccountStorage from "../../accontStorage/database";
const FluenceService = require('geesome-libs/src/fluenceService');
const _ = require('lodash');

module.exports = async (app: IGeesomeApp) => {
    const relayNode = krasnodar[1];
    const client = await createClient(relayNode);
    // let neighbours = await dhtApi.getNeighbours(client, nodeId, 'topic')

    const databaseAccountStorage = new DatabaseAccountStorage(app.database, app.config.storageConfig.jsNode.pass);
    return new FluenceService(databaseAccountStorage, client);
}