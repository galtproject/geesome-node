import { HDKey } from '@scure/bip32';
import { base58check, bech32, bech32m } from '@scure/base';
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { sha256 } from '@noble/hashes/sha256';
import { createHash } from 'node:crypto';
const b58 = base58check(sha256);
export function publicWallet(value: string) {
	if (typeof value !== 'string' || value.length > 200) {
		throw Error('crypto_public_key_invalid');
	}
	let key: HDKey;
	try {
		const bytes = b58.decode(value), version = Buffer.from(bytes.slice(0, 4)).readUInt32BE();
		if (![0x0488b21e, 0x04b24746].includes(version)) {
			throw Error();
		}
		key = HDKey.fromExtendedKey(value, { public: version, private: 0x0488ade4 });
	}
	catch {
		throw Error('crypto_public_key_invalid');
	}
	// Require an account export, not a master key or an already-derived address key.
	if (key.privateKey || key.depth !== 3 || key.index < 0x80000000) {
		throw Error('crypto_account_public_key_required');
	}
	return key;
}
export function receivingAddress(xpub: string, family: 'evm' | 'tron' | 'bitcoin', index: number) {
	if (!Number.isSafeInteger(index) || index < 0 || index >= 0x80000000) {
		throw Error('crypto_address_index_invalid');
	}
	const account = publicWallet(xpub);
	// Bitcoin automated provisioning is deliberately BIP84 only. xpub cannot
	// identify its script type; zpub explicitly identifies native SegWit.
	if (family === 'bitcoin' && !xpub.startsWith('zpub')) {
		throw Error('crypto_bitcoin_zpub_required');
	}
	if (family !== 'bitcoin' && !xpub.startsWith('xpub')) {
		throw Error('crypto_account_xpub_required');
	}
	const pub = account.deriveChild(0).deriveChild(index).publicKey!;
	if (family === 'bitcoin') {
		const digest = createHash('ripemd160').update(sha256(pub)).digest();
		return bech32.encode('bc', [0, ...bech32.toWords(Uint8Array.from(digest))]);
	}
	const uncompressed = secp256k1.ProjectivePoint.fromHex(pub).toRawBytes(false);
	const address = keccak_256(uncompressed.slice(1)).slice(-20);
	return family === 'evm' ? '0x' + Buffer.from(address).toString('hex') : b58.encode(Uint8Array.from([0x41, ...address]));
}
export function validReceivingAddress(value: string, family: string) {
	if (typeof value !== 'string') {
		return false;
	}
	if (family === 'evm') {
		if (!/^0x[0-9a-f]{40}$/i.test(value) || /^0x0{40}$/i.test(value)) {
			return false;
		}
		const plain = value.slice(2);
		if (plain === plain.toLowerCase() || plain === plain.toUpperCase()) {
			return true;
		}
		const hash = Buffer.from(keccak_256(Uint8Array.from(Buffer.from(plain.toLowerCase())))).toString('hex');
		return [...plain].every((c, i) => !/[a-f]/i.test(c) || c === (parseInt(hash[i], 16) >= 8 ? c.toUpperCase() : c.toLowerCase()));
	}
	try {
		if (family === 'tron') {
			const v = b58.decode(value);
			return v.length === 21 && v[0] === 0x41 && v.slice(1).some(b => b !== 0);
		}
		if (family !== 'bitcoin') {
			return false;
		}
		if (/^[13]/.test(value)) {
			const v = b58.decode(value);
			return v.length === 21 && [0, 5].includes(v[0]);
		}
		const codec = value.toLowerCase().startsWith('bc1p') ? bech32m : bech32;
		const v = codec.decode(value as any), version = v.words[0], program = codec.fromWords(v.words.slice(1));
		return v.prefix === 'bc' && ((version === 0 && [20, 32].includes(program.length)) || (version === 1 && program.length === 32));
	}
	catch {
		return false;
	}
}
export { atomicQuote, displayAtomic } from './cryptoAmounts.js';
