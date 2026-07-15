import {IGeesomeApp} from "../../interface.js";
import FluenceService from "geesome-libs/src/fluenceService/index.js";

export default async (app: IGeesomeApp) => {
    // let neighbours = await dhtApi.getNeighbours(client, nodeId, 'topic')
    const fluenceService = new FluenceService(app.ms.accountStorage, {logLevel: null /*'debug'*/});
    const peerId = await app.ms.accountStorage.getAccountPeerId('self');
    if (peerId) {
        await fluenceService.initClient({
            type: "Ed25519",
            source: peerId.privKey.bytes
        });
    }
    const stopClient = fluenceService.stop.bind(fluenceService);
    let stopPromise: Promise<any> | null = null;
    fluenceService.stop = () => {
        if (!stopPromise) {
            stopPromise = fluenceService.client
                ? Promise.resolve().then(stopClient)
                : Promise.resolve();
        }
        return stopPromise;
    };
    return fluenceService;
}
