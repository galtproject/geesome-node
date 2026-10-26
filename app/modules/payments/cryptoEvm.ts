import { Interface, keccak256, getAddress, type TransactionRequest } from 'ethers-v6';
import { cryptoNetworks, cryptoAsset } from './cryptoAssets.js';
import { createCryptoRpc } from './cryptoRpc.js';
import { automationConfig, type EvmNetwork } from './cryptoAutomationConfig.js';
import { managedWallet } from './cryptoManagedWallet.js';
import { createCryptoSwap } from './cryptoSwap.js';
import { quantity, rpcInteger } from './cryptoRpcValues.js';
export { quantity, rpcInteger } from './cryptoRpcValues.js';
const token = new Interface([
	'function balanceOf(address) view returns (uint256)',
	'function transfer(address,uint256) returns (bool)',
	'event Transfer(address indexed from,address indexed to,uint256 value)',
]);
const l1Oracle = new Interface(['function getL1Fee(bytes) view returns (uint256)']);
export type EvmAdapterOptions = {
	config?: ReturnType<typeof automationConfig>;
	wallet?: ReturnType<typeof managedWallet>;
	rpc?: Pick<ReturnType<typeof createCryptoRpc>, 'call'>;
	fetcher?: typeof fetch;
};
export function createEvmAdapter(env: NodeJS.ProcessEnv = process.env, options: EvmAdapterOptions = {}) {
	const config = options.config || automationConfig(env), wallet = options.wallet || managedWallet(env), rpc = options.rpc || createCryptoRpc(env, options.fetcher || fetch, config), fetcher = options.fetcher || fetch;
	const call = (n: EvmNetwork, m: string, p: unknown[] = []) => rpc.call(n, m, p);
	const balance = async (n: EvmNetwork, address: string, assetId?: string) => {
		const contract = assetId ? cryptoAsset(assetId).contract : null;
		return contract
			? rpcInteger(await call(n, 'eth_call', [
				{ to: contract, data: token.encodeFunctionData('balanceOf', [address]) },
				'latest',
			]))
			: rpcInteger(await call(n, 'eth_getBalance', [address, 'latest']));
	};
	const transfer = (to: string, amount: bigint, contract?: string | null): TransactionRequest => contract
		? { to: contract, data: token.encodeFunctionData('transfer', [to, amount]), value: 0n }
		: { to, value: amount, data: '0x' };
	async function fees(n: EvmNetwork) {
		const block = await call(n, 'eth_getBlockByNumber', ['latest', false]);
		const gasPrice = rpcInteger(await call(n, 'eth_gasPrice'));
		if (block?.baseFeePerGas !== undefined) {
			const tip = rpcInteger(await call(n, 'eth_maxPriorityFeePerGas'));
			return {
				gasPrice,
				maxFeePerGas: rpcInteger(block.baseFeePerGas) * 2n + tip,
				maxPriorityFeePerGas: tip,
			};
		}
		return { gasPrice };
	}
	async function prepare(n: EvmNetwork, index: number, request: TransactionRequest) {
		const signer = wallet!.signer(index), f = await fees(n), sender = signer.address.toLowerCase();
		const tx: TransactionRequest = {
			to: getAddress(String(request.to)),
			data: request.data || '0x',
			value: BigInt(request.value || 0),
			from: sender,
		};
		const gas = rpcInteger(await call(n, 'eth_estimateGas', [
			{ from: sender, to: tx.to, data: tx.data, value: quantity(BigInt(tx.value || 0)) },
			'latest',
			{ [sender]: { balance: '0x' + 'f'.repeat(64) } },
		]));
		tx.gasLimit = (gas * BigInt(config.gasSafetyPercent) + 99n) / 100n;
		tx.chainId = cryptoNetworks[n].chainId;
		tx.nonce = Number(rpcInteger(await call(n, 'eth_getTransactionCount', [sender, 'pending'])));
		if ('maxFeePerGas' in f) {
			tx.type = 2;
			tx.maxFeePerGas = f.maxFeePerGas;
			tx.maxPriorityFeePerGas = f.maxPriorityFeePerGas;
		}
		else {
			tx.type = 0;
			tx.gasPrice = f.gasPrice;
		}
		const raw = await signer.signTransaction(tx), hash = keccak256(raw);
		let fee = BigInt(tx.gasLimit) * BigInt(tx.maxFeePerGas || tx.gasPrice || 0);
		if (n === 'base') {
			fee +=
				(rpcInteger(await call(n, 'eth_call', [
					{
						to: '0x420000000000000000000000000000000000000F',
						data: l1Oracle.encodeFunctionData('getL1Fee', [raw]),
					},
					'latest',
				])) *
					BigInt(config.gasSafetyPercent) +
					99n) /
					100n;
		}
		return {
			raw,
			hash,
			sender,
			nonce: String(tx.nonce),
			fee: fee.toString(),
			request: {
				to: String(tx.to).toLowerCase(),
				value: String(tx.value || 0),
				data: tx.data,
			},
			gasPrice: f.gasPrice.toString(),
		};
	}
	async function receipt(n: EvmNetwork, hash: string) {
		const r = await call(n, 'eth_getTransactionReceipt', [hash]);
		if (!r) {
			return null;
		}
		if (String(r.transactionHash).toLowerCase() !== hash.toLowerCase()) {
			throw Error('crypto_receipt_invalid');
		}
		const finalized = await call(n, 'eth_getBlockByNumber', ['finalized', false]);
		if (!finalized || rpcInteger(r.blockNumber) > rpcInteger(finalized.number)) {
			return null;
		}
		const block = await call(n, 'eth_getBlockByNumber', [r.blockNumber, false]);
		if (!block || String(block.hash).toLowerCase() !== String(r.blockHash).toLowerCase()) {
			throw Error('crypto_receipt_reorg');
		}
		return { ok: rpcInteger(r.status) === 1n, receipt: r };
	}
	async function broadcast(n: EvmNetwork, raw: string) {
		const hash = keccak256(raw);
		const result = await call(n, 'eth_sendRawTransaction', [raw]);
		if (String(result).toLowerCase() !== hash) {
			throw Error('crypto_broadcast_hash_invalid');
		}
		return hash;
	}
	const swap = createCryptoSwap({ env, config, wallet, rpc, fetcher });
	return { call, balance, transfer, fees, prepare, receipt, broadcast, swap };
}
