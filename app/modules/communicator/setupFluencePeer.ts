import {IGeesomeApp} from "../../interface";
const { FluencePeer, KeyPair } = require("@fluencelabs/fluence");
const { testNet } = require('@fluencelabs/fluence-network-environment');

module.exports = async (app: IGeesomeApp) => {
	let peer;
	const peerId = await app.ms.accountStorage.getAccountPeerId('self');
	while (true) {
		try {
			if (peerId) {
				peer = new FluencePeer();
				await peer.start({ connectTo: testNet[2], KeyPair: new KeyPair(peerId) });
			}
			return peer;
		} catch (e) {
			console.warn('peer.start error, trying to reconnect...', e);
			await new Promise((resolve) => setTimeout(resolve, 5 * 1000));
		}
	}
};