import { Interface } from 'ethers-v6';
import { cryptoAsset, type CryptoNetwork } from './cryptoAssets.js';
import { quantity, rpcInteger } from './cryptoRpcValues.js';
import type { ChainTransfer } from './cryptoObserver.js';
const token = new Interface(['function balanceOf(address) view returns (uint256)']);
const oracle = new Interface(['function getOperatorFee(uint256) view returns (uint256)']);
const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const hash = (v: unknown) => {
	if (typeof v !== 'string' || !/^0x[0-9a-f]{64}$/i.test(v)) {
		throw Error('crypto_balance_evidence_invalid');
	}
	return v.toLowerCase();
};
const integer = (v: unknown) => {
	if (typeof v !== 'string' || !/^\d+$/.test(v)) {
		throw Error('crypto_balance_evidence_invalid');
	}
	return BigInt(v);
};
type Block = {
	height: bigint;
	hash: string;
	timestamp: number;
};
export type BalanceContext = {
	invoiceId: string;
	expiresAt: string | Date;
	prior: ChainTransfer[];
	journal: any[];
	checkpoint?: any;
};
export type BalanceScan = {
	transfers: ChainTransfer[];
	checkpoint: any;
	receipts: {
		id: string;
		receipt: any;
	}[];
};
export function createCryptoBalanceObserver(call: (n: CryptoNetwork, m: string, p: any[]) => Promise<any>, check: (n: CryptoNetwork) => Promise<unknown>) {
	async function scan(snapshot: any, address: string, ctx: BalanceContext): Promise<BalanceScan> {
		const asset = cryptoAsset(snapshot.assetId), n = asset.network;
		if (!snapshot.managedFingerprint || !['ethereum', 'arbitrum', 'base'].includes(n) || !/^0x[0-9a-f]{40}$/i.test(address)) {
			throw Error('crypto_balance_account_invalid');
		}
		address = address.toLowerCase();
		const start = integer(snapshot.startBlock), expires = new Date(ctx.expiresAt).getTime();
		if (!Number.isSafeInteger(expires) || expires <= 0 || ctx.journal.length > 1000) {
			throw Error('crypto_balance_evidence_invalid');
		}
		await check(n);
		const blocks = new Map<string, Block>();
		async function block(tag: string): Promise<Block> {
			const saved = blocks.get(tag);
			if (saved) {
				return saved;
			}
			const raw = await call(n, 'eth_getBlockByNumber', [tag, false]);
			if (!raw) {
				throw Error('crypto_balance_block_unavailable');
			}
			const b = { height: rpcInteger(raw.number), hash: hash(raw.hash), timestamp: Number(rpcInteger(raw.timestamp)) * 1000 };
			if (!Number.isSafeInteger(b.timestamp) || b.timestamp <= 0 || (tag.startsWith('0x') && b.height !== rpcInteger(tag))) {
				throw Error('crypto_balance_evidence_invalid');
			}
			const sameHeight = blocks.get(quantity(b.height));
			if (sameHeight && sameHeight.hash !== b.hash) {
				throw Error('crypto_balance_reorg');
			}
			blocks.set(tag, b);
			blocks.set(quantity(b.height), b);
			return b;
		}
		const latest = await block('latest'), finalized = await block('finalized');
		if (finalized.height > latest.height || start > latest.height) {
			throw Error('crypto_balance_block_unavailable');
		}
		const ceiling = snapshot.endBlock === undefined ? latest.height : integer(snapshot.endBlock);
		const end = await block(quantity(ceiling < latest.height ? ceiling : latest.height));
		const base = await block(quantity(start));
		if (end.height < start) {
			throw Error('crypto_balance_window_invalid');
		}
		const confirmed = end.height < finalized.height ? end : await block(quantity(finalized.height));
		if (ctx.checkpoint?.confirmed && BigInt(ctx.checkpoint.confirmed.height) >= start) {
			if (confirmed.height < BigInt(ctx.checkpoint.confirmed.height)) {
				throw Error('crypto_balance_finality_regressed');
			}
			if (base.hash !== ctx.checkpoint.base.hash || (await block(quantity(BigInt(ctx.checkpoint.confirmed.height)))).hash !== ctx.checkpoint.confirmed.hash) {
				throw Error('crypto_balance_reorg');
			}
		}
		const states = new Map<string, {
			balance: bigint;
			nonce: bigint;
		}>();
		async function state(b: Block) {
			const key = quantity(b.height), saved = states.get(key);
			if (saved) {
				return saved;
			}
			const cached = [ctx.checkpoint?.base, ctx.checkpoint?.confirmed, ctx.checkpoint?.latest, ctx.checkpoint?.cutoff].find(p => p?.height === String(b.height) && p.hash === b.hash && p.balance !== undefined && p.nonce !== undefined);
			if (cached) {
				const s = { balance: integer(cached.balance), nonce: integer(cached.nonce) };
				states.set(key, s);
				return s;
			}
			const balance = rpcInteger(asset.contract ? await call(n, 'eth_call', [{ to: asset.contract, data: token.encodeFunctionData('balanceOf', [address]) }, key]) : await call(n, 'eth_getBalance', [address, key]));
			const nonce = rpcInteger(await call(n, 'eth_getTransactionCount', [address, key]));
			const s = { balance, nonce };
			states.set(key, s);
			return s;
		}
		const initial = await state(base), operations: {
			height: bigint;
			sender: string;
			to: string;
			value: bigint;
			ok: boolean;
			fee: bigint;
			logs: any[];
		}[] = [], receipts: BalanceScan['receipts'] = [];
		for (const tx of ctx.journal) {
			// Cached receipts are finalized proofs from the server's own transaction journal.
			let r = tx.data.balanceReceipt;
			if (r?.blockNumber && rpcInteger(r.blockNumber) <= start) {
				continue;
			}
			if (!r) {
				r = await call(n, 'eth_getTransactionReceipt', [tx.hash]);
			}
			if (!r) {
				if ((!asset.contract && String(tx.data.request.to).toLowerCase() === address && integer(tx.data.request.value) > 0n) || (asset.contract && tx.data.proof?.contract === asset.contract && String(tx.data.proof.to).toLowerCase() === address)) {
					throw Error('crypto_balance_internal_pending');
				}
				continue;
			}
			const height = rpcInteger(r.blockNumber);
			if (height > end.height) {
				continue;
			}
			if (hash(r.transactionHash) !== hash(tx.hash) || (await block(quantity(height))).hash !== hash(r.blockHash)) {
				throw Error('crypto_balance_reorg');
			}
			const status = rpcInteger(r.status);
			if (status > 1n) {
				throw Error('crypto_balance_evidence_invalid');
			}
			if (height <= finalized.height && !tx.data.balanceReceipt) {
				receipts.push({ id: tx.id, receipt: r });
			}
			if (height <= start) {
				continue;
			}
			const sender = String(tx.sender).toLowerCase(), to = String(tx.data.request.to).toLowerCase();
			let fee = 0n;
			if (!asset.contract && sender === address) {
				fee = rpcInteger(r.gasUsed) * rpcInteger(r.effectiveGasPrice);
				if (n === 'base') {
					// L1 data cost is separate from execution gas on Base. Ask the historical
					// oracle for operator fees so protocol upgrades do not change our arithmetic.
					fee += rpcInteger(r.l1Fee);
					if (r.operatorFeeScalar !== undefined || r.operatorFeeConstant !== undefined) {
						fee += rpcInteger(await call(n, 'eth_call', [{ to: '0x420000000000000000000000000000000000000F', data: oracle.encodeFunctionData('getOperatorFee', [rpcInteger(r.gasUsed)]) }, quantity(height)]));
					}
				}
			}
			operations.push({ height, sender, to, value: integer(tx.data.request.value), ok: status === 1n, fee, logs: r.logs || [] });
		}
		const totals = new Map<string, bigint>();
		async function total(b: Block): Promise<bigint> {
			if (b.height <= start) {
				return 0n;
			}
			const key = quantity(b.height), saved = totals.get(key);
			if (saved !== undefined) {
				return saved;
			}
			const current = await state(b);
			let amount = current.balance - initial.balance, nonces = 0n;
			for (const op of operations) {
				if (op.height > b.height) {
					continue;
				}
				if (op.sender === address) {
					nonces++;
				}
				if (asset.contract) {
					if (!op.ok) {
						continue;
					}
					for (const log of op.logs) {
						if (String(log.address).toLowerCase() !== asset.contract || log.topics?.[0]?.toLowerCase() !== transferTopic) {
							continue;
						}
						if (log.removed === true || log.topics.length !== 3) {
							throw Error('crypto_balance_evidence_invalid');
						}
						const from = hash(log.topics[1]), to = hash(log.topics[2]), value = BigInt(hash(log.data));
						if (from === '0x' + address.slice(2).padStart(64, '0')) {
							amount += value;
						}
						if (to === '0x' + address.slice(2).padStart(64, '0')) {
							amount -= value;
						}
					}
				}
				else {
					if (op.sender === address) {
						amount += op.fee + (op.ok ? op.value : 0n);
					}
					if (op.to === address && op.ok) {
						amount -= op.value;
					}
				}
			}
			if (current.nonce - initial.nonce !== nonces) {
				throw Error('crypto_balance_outgoing_untracked');
			}
			if (amount < 0n) {
				throw Error('crypto_balance_regressed');
			}
			totals.set(key, amount);
			return amount;
		}
		let cutoff = confirmed;
		if (confirmed.height > start && confirmed.timestamp > expires) {
			let lo = start, hi = confirmed.height;
			while (lo < hi) {
				const mid = (lo + hi + 1n) / 2n;
				if ((await block(quantity(mid))).timestamp <= expires) {
					lo = mid;
				}
				else {
					hi = mid - 1n;
				}
			}
			cutoff = await block(quantity(lo));
		}
		const finalTotal = confirmed.height > start ? await total(confirmed) : 0n;
		const onTime = cutoff.height > start && cutoff.timestamp <= expires ? await total(cutoff) : 0n;
		const latestTotal = await total(end);
		const prior = ctx.prior.filter(p => p.confirmed), priorOnTime = prior.filter(p => p.timestamp <= expires).reduce((sum, p) => sum + integer(p.atomic), 0n), priorLate = prior.filter(p => p.timestamp > expires).reduce((sum, p) => sum + integer(p.atomic), 0n);
		if (finalTotal < onTime || latestTotal < finalTotal || onTime < priorOnTime || finalTotal - onTime < priorLate) {
			throw Error('crypto_balance_regressed');
		}
		const transfers: ChainTransfer[] = [...prior];
		const add = (kind: string, amount: bigint, b: Block, confirmed: boolean) => {
			if (!amount) {
				return;
			}
			transfers.push({ key: `balance:${asset.id}:${address}:${start}:${b.height}:${kind}`, txid: '', atomic: String(amount), confirmed, timestamp: confirmed ? b.timestamp : 0, blockHeight: String(b.height), ...({ balanceProof: { base: { height: String(base.height), hash: base.hash, balance: String(initial.balance) }, end: { height: String(b.height), hash: b.hash }, kind } } as any) });
		};
		add('on-time', onTime - priorOnTime, cutoff, true);
		add('late', finalTotal - onTime - priorLate, confirmed, true);
		add('pending', latestTotal - finalTotal, end, false);
		// Numeric block tags can be served across a reorg. Recheck every anchor used
		// before exposing any observations for the database settlement transaction.
		for (const [tag, b] of blocks)
			if (tag.startsWith('0x')) {
				const current = await call(n, 'eth_getBlockByNumber', [tag, false]);
				if (!current || hash(current.hash) !== b.hash) {
					throw Error('crypto_balance_reorg');
				}
			}
		const point = async (b: Block) => { const s = await state(b); return { height: String(b.height), hash: b.hash, balance: String(s.balance), nonce: String(s.nonce) }; };
		return { transfers, receipts, checkpoint: { kind: 'balance', assetId: asset.id, address, base: await point(base), confirmed: confirmed.height >= start ? await point(confirmed) : null, latest: await point(end), cutoff: cutoff.height >= start ? await point(cutoff) : null, received: String(finalTotal), onTime: String(onTime) } };
	}
	return { scan };
}
