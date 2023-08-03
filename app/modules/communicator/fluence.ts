import {IGeesomeApp} from "../../interface";
const FluenceService = require('geesome-libs/src/fluenceService');

module.exports = async (app: IGeesomeApp) => {
    // let neighbours = await dhtApi.getNeighbours(client, nodeId, 'topic')
    let peer = await require('./setupFluencePeer')(app);
    const fluenceService = new FluenceService(app.ms.accountStorage, peer, {logLevel: null /*'debug'*/});
    fluenceService.setup = async () => {
        fluenceService.setPeer(await require('./setupFluencePeer')(app));
        try {
            fluenceService.registerEvents();
        } catch (e) {
        }
    }
    fluenceService.stop = async () => {

    }
    return fluenceService;
}