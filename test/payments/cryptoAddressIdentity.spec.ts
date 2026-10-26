import test from 'node:test';
import assert from 'node:assert/strict';
import { addressIdentity, normalizedAddress } from '../../app/modules/payments/cryptoAddressIdentity.js';
test('deposit identity is shared by EVM networks and checksum casing', () => {
	const address = '0xAbCd000000000000000000000000000000000000';
	assert.equal(addressIdentity('ethereum', address), addressIdentity('base', address.toLowerCase()));
	assert.equal(addressIdentity('arbitrum', address), addressIdentity('base', address));
});
test('address normalization preserves case-sensitive Bitcoin and TRON identities', () => {
	assert.equal(normalizedAddress('bitcoin', 'BC1QEXAMPLE'), 'bc1qexample');
	for (const [network, address] of [
		['bitcoin', '1BoatSLRHtKNngkdXEeobR76b53LETtpyT'],
		['tron', 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8'],
	] as const) {
		assert.equal(normalizedAddress(network, address), address);
		assert.notEqual(addressIdentity(network, address), addressIdentity(network, address.toLowerCase()));
	}
});
