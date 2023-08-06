import {IGeesomeApp} from "../../interface";
import { Fluence } from '@fluencelabs/js-client.api';
const { testNet } = require('@fluencelabs/fluence-network-environment');

module.exports = async (app: IGeesomeApp) => {
	let peer;
	console.log('getAccountPeerId');
	console.log('getAccountPeerId done');
	(async () => {
		while (true) {
			try {
				if (peerId) {
					await Fluence.connect(relay, {
						keyPair: {
							type: 'Ed25519',
							source: Uint8Array.from(skBytes),
						},
					});
					peer = new FluencePeer();
					await peer.start({ connectTo: testNet[0], KeyPair: new KeyPair(peerId) });
				}
				return peer;
			} catch (e) {
				console.warn('peer.start error, trying to reconnect...', e);
				await new Promise((resolve) => setTimeout(resolve, 5 * 1000));
			}
		}
	})().then(r => {
		console.log('FluencePeer connected');
	});
};