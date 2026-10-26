import { createRequire } from 'node:module';
import { Interface, getAddress } from 'ethers-v6';
import { cryptoNetworks, cryptoAsset } from './cryptoAssets.js';
import { type EvmNetwork, type automationConfig } from './cryptoAutomationConfig.js';
import { type managedWallet } from './cryptoManagedWallet.js';
import { type createCryptoRpc } from './cryptoRpc.js';
import { rpcInteger } from './cryptoRpcValues.js';
import { readBoundedText } from './boundedResponse.js';
const token = new Interface([
	'function allowance(address,address) view returns (uint256)',
	'function approve(address,uint256) returns (bool)',
]);
// ABI from the verified AggregationRouterV6 deployment at the configured router address.
const routerInterface = new Interface(createRequire(import.meta.url)('./config/oneinch-v6-swap-abi.json'));
const addressMask = (1n << 160n) - 1n;
const native = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
type SwapOptions = {
	env: NodeJS.ProcessEnv;
	config: ReturnType<typeof automationConfig>;
	wallet: ReturnType<typeof managedWallet>;
	rpc: Pick<ReturnType<typeof createCryptoRpc>, 'call'>;
	fetcher: typeof fetch;
};
type SwapRequest = {
	to: string;
	value: bigint;
	data: string;
};
type SwapResult = {
	kind: 'reset' | 'approve';
	request: SwapRequest;
} | {
	kind: 'swap';
	request: SwapRequest;
	expectedOut: string;
};
export function createCryptoSwap({ env, config, wallet, rpc, fetcher }: SwapOptions) {
	const call = (network: EvmNetwork, method: string, params: unknown[] = []) => rpc.call(network, method, params);
	return async function swap(n: EvmNetwork, assetId: string, amount: bigint, minimumNative?: bigint): Promise<SwapResult> {
		if (!env.DIRECT_CRYPTO_ONEINCH_API_KEY) {
			throw Error('crypto_swap_key_required');
		}
		const asset = cryptoAsset(assetId);
		if (!asset.contract || asset.network !== n) {
			throw Error('crypto_swap_asset_invalid');
		}
		const from = wallet!.address(0), router = getAddress(config.oneInchRouter).toLowerCase();
		const allowance = rpcInteger(await call(n, 'eth_call', [
			{ to: asset.contract, data: token.encodeFunctionData('allowance', [from, router]) },
			'latest',
		]));
		if (allowance < amount) {
			return {
				kind: allowance > 0n ? 'reset' : 'approve',
				request: {
					to: asset.contract,
					data: token.encodeFunctionData('approve', [
						router,
						allowance > 0n ? 0n : amount,
					]),
					value: 0n,
				},
			};
		}
		const url = new URL(`${config.oneInchUrl}/${cryptoNetworks[n].chainId}/swap`);
		for (const [key, value] of Object.entries({
			src: asset.contract,
			dst: native,
			amount: String(amount),
			from,
			origin: from,
			receiver: from,
			...(minimumNative
				? { minReturn: String(minimumNative) }
				: { slippage: String(config.slippagePercent) }),
			disableEstimate: 'false',
			allowPartialFill: 'false',
		}))
			url.searchParams.set(key, value);
		const r = await fetcher(url.href, {
			headers: { Authorization: 'Bearer ' + env.DIRECT_CRYPTO_ONEINCH_API_KEY },
			redirect: 'error',
			signal: AbortSignal.timeout(config.rpcTimeoutMs),
		});
		if (!r.ok) {
			throw Error('crypto_swap_unavailable');
		}
		const data = JSON.parse(await readBoundedText(r, { limitBytes: 1024 * 1024, timeoutMs: config.rpcTimeoutMs }));
		if (!data.tx ||
			String(data.tx.from).toLowerCase() !== from ||
			String(data.tx.to).toLowerCase() !== router ||
			rpcIntegerOrDecimal(data.tx.value) !== 0n ||
			!/^0x[0-9a-f]{8,}$/i.test(data.tx.data) ||
			!/^\d+$/.test(String(data.dstAmount)) ||
			BigInt(data.dstAmount) <= 0n) {
			throw Error('crypto_swap_response_invalid');
		}
		const minimum = minimumNative ||
			(BigInt(data.dstAmount) * BigInt(Math.round((100 - config.slippagePercent) * 100))) /
				10000n;
		validateSwapCalldata(data.tx.data, asset.contract, from, amount, minimum);
		return {
			kind: 'swap',
			request: { to: router, value: 0n, data: data.tx.data },
			expectedOut: String(data.dstAmount),
		};
	};
}
/** Bind the source, amount, native output, recipient and minimum return before signing. */
export function validateSwapCalldata(calldata: string, contract: string, from: string, amount: bigint, minimum: bigint) {
	let parsed;
	try {
		parsed = routerInterface.parseTransaction({ data: calldata });
	}
	catch {
		throw Error('crypto_swap_calldata_invalid');
	}
	if (!parsed) {
		throw Error('crypto_swap_calldata_invalid');
	}
	const a = parsed.args;
	let source: string, destination = from, input: bigint, minimumOutput: bigint, nativeOutput = false;
	if (parsed.name === 'swap') {
		source = a.desc.srcToken.toLowerCase();
		destination = a.desc.dstReceiver.toLowerCase();
		input = a.desc.amount;
		minimumOutput = a.desc.minReturnAmount;
		nativeOutput = a.desc.dstToken.toLowerCase() === native;
		if (a.desc.flags !== 0n) {
			throw Error('crypto_swap_calldata_invalid');
		}
	}
	else if (parsed.name.startsWith('unoswap')) {
		source = '0x' + (a.token & addressMask).toString(16).padStart(40, '0');
		input = a.amount;
		minimumOutput = a.minReturn;
		if (a.to !== undefined) {
			destination = '0x' + (a.to & addressMask).toString(16).padStart(40, '0');
		}
		nativeOutput = ((a.dex3 ?? a.dex2 ?? a.dex) & (1n << 252n)) !== 0n;
		// Permit2 is never authorized by this module.
		if (a.token >> 160n !== 0n) {
			throw Error('crypto_swap_calldata_invalid');
		}
	}
	else {
		source = '0x' + (a.srcToken & addressMask).toString(16).padStart(40, '0');
		input = a.inputAmount;
		minimumOutput = a.outputAmount;
		if (a.recipient !== undefined) {
			destination = a.recipient.toLowerCase();
		}
		nativeOutput = a.dstToken.toLowerCase() === native;
		if (a.srcToken >> 160n !== 0n) {
			throw Error('crypto_swap_calldata_invalid');
		}
	}
	if (source !== contract ||
		destination !== from ||
		input !== amount ||
		minimumOutput < minimum ||
		!nativeOutput) {
		throw Error('crypto_swap_calldata_invalid');
	}
}
function rpcIntegerOrDecimal(value: unknown) {
	if (typeof value !== 'string' || !/^(0x[0-9a-f]+|\d+)$/i.test(value)) {
		throw Error('crypto_swap_response_invalid');
	}
	return BigInt(value);
}
