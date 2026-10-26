import { createHash } from 'node:crypto';
import { cryptoNetworks, type CryptoNetwork } from './cryptoAssets.js';
export function normalizedAddress(family: string, address: string) {
	return family === 'evm' || (family === 'bitcoin' && /^bc1/i.test(address))
		? address.toLowerCase()
		: address;
}
export function addressIdentity(network: CryptoNetwork, address: string) {
	const family = cryptoNetworks[network].family;
	return createHash('sha256')
		.update(family + ':' + normalizedAddress(family, address))
		.digest('hex');
}
