import test from 'node:test';
import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import { HDKey } from '@scure/bip32';
import { bech32m } from '@scure/base';
import { atomicQuote, displayAtomic, publicWallet, receivingAddress, validReceivingAddress } from '../../app/modules/payments/cryptoWallet.js';
const zpub = 'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
test('BIP84 published account vectors derive first two receiving addresses', () => {
	assert.equal(receivingAddress(zpub, 'bitcoin', 0), 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
	assert.equal(receivingAddress(zpub, 'bitcoin', 1), 'bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g');
	assert.throws(() => publicWallet('zpub6jftahH18ngZxLmXaKw3GSZzZsszmt9WqedkyZdezFtWRFBZqsQH5hyUmb4pCEeZGmVfQuP5bedXTB8is6fTv19U1GQRyQUKQGUTzyHACMF'));
	assert.throws(() => receivingAddress(zpub, 'bitcoin', 0x80000000));
	assert.throws(() => receivingAddress(zpub, 'evm', 0));
});
test('watch-only EVM account derivation matches standard Hardhat mnemonic address', () => {
	const seed = pbkdf2Sync('test test test test test test test test test test test junk', 'mnemonic', 2048, 64, 'sha512');
	const account = HDKey.fromMasterSeed(Uint8Array.from(seed)).derive("m/44'/60'/0'");
	assert.equal(receivingAddress(account.publicExtendedKey, 'evm', 0), '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266');
	assert.throws(() => publicWallet(account.privateExtendedKey));
	assert.throws(() => receivingAddress(account.publicExtendedKey, 'bitcoin', 0));
});
test('mainnet pools accept legacy/SegWit/Taproot and reject checksum/network errors', () => {
	for (const addr of ['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', receivingAddress(zpub, 'bitcoin', 0), bech32m.encode('bc', [1, ...bech32m.toWords(new Uint8Array(32).fill(7))])])
		assert.equal(validReceivingAddress(addr, 'bitcoin'), true);
	assert.equal(validReceivingAddress(bech32m.encode('tb', [1, ...bech32m.toWords(new Uint8Array(32).fill(7))]), 'bitcoin'), false);
	assert.equal(validReceivingAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb', 'bitcoin'), false);
	assert.equal(validReceivingAddress('0x52908400098527886E0F7030069857D2E4169EE7', 'evm'), true);
	assert.equal(validReceivingAddress('0x52908400098527886E0F7030069857D2E4169Ee7', 'evm'), false);
	assert.equal(validReceivingAddress('0x' + '0'.repeat(40), 'evm'), false);
	assert.equal(validReceivingAddress('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', 'tron'), true);
});
test('quotes round up exactly in atomic units including depeg and sub-cent precision', () => {
	assert.equal(atomicQuote(500, '60000', 8), '8334');
	assert.equal(atomicQuote(500, '3000', 18), '1666666666666667');
	assert.equal(atomicQuote(500, '0.98', 6), '5102041');
	assert.equal(atomicQuote(1, '0.000000000001', 18), '10000000000000000000000000000');
	assert.equal(displayAtomic('0', 6), '0');
	assert.equal(displayAtomic('5102041', 6), '5.102041');
	assert.equal(displayAtomic('100', 0), '100');
	for (const rate of ['0', 'NaN', '1e6', '-1', '1.0000000000001'])
		assert.throws(() => atomicQuote(500, rate, 6));
	assert.throws(() => atomicQuote(1, '1', 10000000));
});
test('TRON standard account derivation matches Ledger published abandon-mnemonic vector', () => {
	// https://github.com/LedgerHQ/app-tron/blob/develop/README.md
	const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
	const seed = pbkdf2Sync(mnemonic, 'mnemonic', 2048, 64, 'sha512');
	const account = HDKey.fromMasterSeed(Uint8Array.from(seed)).derive("m/44'/195'/0'");
	assert.equal(receivingAddress(account.publicExtendedKey, 'tron', 0), 'TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH');
});
