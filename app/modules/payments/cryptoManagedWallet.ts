import { HDNodeWallet } from 'ethers-v6';
import { createHash } from 'node:crypto';
export function managedWallet(env: NodeJS.ProcessEnv = process.env) {
	if (!env.DIRECT_CRYPTO_SEED_PHRASE?.trim()) {
		return null;
	}
	let root: HDNodeWallet;
	try {
		root = HDNodeWallet.fromPhrase(env.DIRECT_CRYPTO_SEED_PHRASE.trim(), undefined, "m/44'/60'/0'");
	}
	catch {
		throw Error('crypto_seed_invalid');
	}
	const fingerprint = createHash('sha256').update(root.neuter().extendedKey).digest('hex');
	return {
		fingerprint,
		xpub: root.neuter().extendedKey,
		address: (index: number) => derive(index).address.toLowerCase(),
		signer: derive,
	};
	function derive(index: number) {
		if (!Number.isSafeInteger(index) || index < 0 || index >= 0x80000000) {
			throw Error('crypto_address_index_invalid');
		}
		return root.deriveChild(0).deriveChild(index);
	}
}
export type ManagedWallet = NonNullable<ReturnType<typeof managedWallet>>;
