import { createCryptoTransactionJournal, safeError } from './cryptoTransactionJournal.js';
import { nativeTransferValue, minimumSwapOutput } from './cryptoCollectionAmounts.js';
import type { CryptoCollection, CollectionInState, CollectionContext, } from './cryptoCollectionTypes.js';
import { addressIdentity } from './cryptoAddressIdentity.js';
import { Op, cast, col, fn, json, where } from 'sequelize';
import { lockCryptoAllocation, withCryptoCollectionLock } from './cryptoLocks.js';
import { randomUUID } from 'node:crypto';
import { cryptoAsset, type CryptoNetwork } from './cryptoAssets.js';
import { validReceivingAddress } from './cryptoWallet.js';
import { atomicQuote, usdCents } from './cryptoAmounts.js';
import { managedWallet } from './cryptoManagedWallet.js';
import { automationConfig, type EvmNetwork } from './cryptoAutomationConfig.js';
import { createEvmAdapter } from './cryptoEvm.js';
type TreasuryOptions = {
	// Sequelize models and connection manager are supplied by the membership module.
	M: any;
	sequelize: any;
	resource: (id: string) => Promise<unknown>;
	fail: (status: number, code: string) => never;
	clock: () => Date;
	env: NodeJS.ProcessEnv;
	observer: {
		quote: (assetId: string) => Promise<string>;
	};
	adapter?: ReturnType<typeof createEvmAdapter>;
};
export function createCryptoTreasury({ M, sequelize, resource, fail, clock, env, observer, adapter, }: TreasuryOptions) {
	const config = automationConfig(env), wallet = managedWallet(env);
	const evm = adapter || createEvmAdapter(env, { config, wallet });
	async function bind(t: any) {
		if (!wallet) {
			fail(409, 'crypto_seed_required');
		}
		if (await M.crypto_addresses.findOne({
			where: { address: wallet.address(0) },
			transaction: t,
		})) {
			fail(409, 'crypto_service_address_already_allocated');
		}
		const [row] = await M.crypto_runtime.findOrCreate({
			where: { id: 'wallet' },
			defaults: { data: { fingerprint: wallet.fingerprint } },
			transaction: t,
		});
		if (row.data.fingerprint !== wallet.fingerprint) {
			fail(409, 'crypto_seed_changed');
		}
	}
	async function settings(id: string) {
		const row = await M.crypto_treasuries.findByPk(id);
		const state = wallet ? await M.crypto_runtime.findByPk('wallet') : null;
		const runtime = await M.crypto_runtime.findAll({
			where: { id: { [Op.in]: config.networks.map((n) => 'service:' + n) } },
		});
		const failures = await M.crypto_collections.findAll({
			where: {
				state: { [Op.ne]: 'done' },
				lastError: { [Op.ne]: null },
				'data.resourceId': id,
			},
			attributes: ['id', 'network', 'state', 'lastError'],
			limit: 10,
			order: [['updatedAt', 'DESC']],
		});
		return {
			configured: Boolean(wallet),
			walletMatches: !state || state.data.fingerprint === wallet?.fingerprint,
			payout: row?.payout || '',
			version: row?.version || 0,
			serviceAddress: wallet?.address(0) || null,
			networks: config.networks,
			service: runtime.map((r) => ({ network: r.id.slice(8), ...r.data })),
			failures: failures.map((r) => r.toJSON()),
		};
	}
	async function save(id: string, b: any) {
		await resource(id);
		if (!validReceivingAddress(b.payout, 'evm') ||
			!Number.isSafeInteger(b.version) ||
			b.version < 0) {
			fail(400, 'crypto_payout_invalid');
		}
		if (!wallet) {
			fail(409, 'crypto_seed_required');
		}
		if (b.payout.toLowerCase() === wallet.address(0)) {
			fail(400, 'crypto_payout_is_service');
		}
		await sequelize.transaction(async (t) => {
			await lockCryptoAllocation(sequelize, t);
			await bind(t);
			if (await M.crypto_addresses.findOne({
				where: { address: b.payout.toLowerCase() },
				transaction: t,
			})) {
				fail(400, 'crypto_payout_is_deposit');
			}
			const current = await M.crypto_treasuries.findByPk(id, {
				transaction: t,
				lock: t.LOCK.UPDATE,
			});
			if ((current?.version || 0) !== b.version) {
				fail(409, 'crypto_settings_version_conflict');
			}
			const values = { payout: b.payout.toLowerCase(), version: b.version + 1 };
			if (current) {
				await current.update(values, { transaction: t });
			}
			else {
				await M.crypto_treasuries.create({ id, ...values }, { transaction: t });
			}
		});
		return { ok: true };
	}
	async function available(id: string, n: string) {
		if (!wallet || !config.networks.some((network) => network === n)) {
			return false;
		}
		const state = await M.crypto_runtime.findByPk('wallet');
		return ((!state || state.data.fingerprint === wallet.fingerprint) &&
			Boolean(await M.crypto_treasuries.findByPk(id)));
	}
	async function address(readerId: string, network: string, t: any) {
		await bind(t);
		let account = await M.crypto_hd_accounts.findOne({
			where: { walletFingerprint: wallet!.fingerprint, readerId },
			transaction: t,
		});
		if (account) {
			return {
				account,
				address: await M.crypto_addresses.findByPk(account.addressId, { transaction: t }),
			};
		}
		const last = await M.crypto_hd_accounts.max('index', {
			where: { walletFingerprint: wallet!.fingerprint },
			transaction: t,
		});
		let index = Math.max(1, Number(last || 0) + 1), row: any;
		for (let tries = 0; tries < 2000; tries++, index++) {
			const value = wallet!.address(index);
			const identity = addressIdentity(network as CryptoNetwork, value);
			if (await M.crypto_addresses.findOne({ where: { identity }, transaction: t })) {
				continue;
			}
			if (await M.crypto_treasuries.findOne({ where: { payout: value }, transaction: t })) {
				continue;
			}
			row = await M.crypto_addresses.create({
				id: randomUUID(),
				identity,
				walletId: 'managed:' + wallet!.fingerprint,
				address: value,
				network,
				index,
			}, { transaction: t });
			break;
		}
		if (!row) {
			throw Error('crypto_addresses_exhausted');
		}
		account = await M.crypto_hd_accounts.create({
			id: randomUUID(),
			walletFingerprint: wallet!.fingerprint,
			readerId,
			addressId: row.id,
			index,
		}, { transaction: t });
		return { account, address: row };
	}
	// Called only inside the existing session advisory lock in run().
	const { send, pending } = createCryptoTransactionJournal({ M, evm });
	async function sample(n: EvmNetwork) {
		const slot = Math.floor(clock().getTime() / config.feeSampleIntervalMs), id = n + ':' + slot;
		if (!(await M.crypto_fee_samples.findByPk(id))) {
			const fee = await evm.fees(n);
			let price: string | null = null;
			try {
				price = await observer.quote('eth-' + n);
			}
			catch {
				/* Gas history does not depend on USD quote availability. */
			}
			await M.crypto_fee_samples.create({
				id,
				network: n,
				createdAt: clock(),
				data: {
					gasPrice: String(fee.gasPrice),
					maxFeePerGas: String(fee.maxFeePerGas || fee.gasPrice),
					priceUsd: price,
					timestamp: clock().getTime(),
				},
			});
		}
		await M.crypto_fee_samples.destroy({
			where: { createdAt: { [Op.lt]: new Date(clock().getTime() - config.feeHistoryMs) } },
		});
	}
	async function eligible(n: EvmNetwork, fee: bigint, price: string, nativeTransfer = false) {
		const current = await evm.fees(n);
		// Native transfers use the configured ERC20 reference, matching the cheap-gas trigger.
		if (nativeTransfer) {
			const reference = BigInt(current.maxFeePerGas || current.gasPrice) * BigInt(config.erc20BenchmarkGas);
			if (reference > fee) {
				fee = reference;
			}
		}
		if (fee < BigInt(atomicQuote(config.transferThresholdCents, price, 18))) {
			return true;
		}
		const rows = await M.crypto_fee_samples.findAll({
			where: {
				network: n,
				createdAt: { [Op.gte]: new Date(clock().getTime() - config.feeHistoryMs) },
			},
			order: [['createdAt', 'ASC']],
		});
		// A single startup observation is not evidence of a weekly minimum.
		if (rows.length < 2) {
			return false;
		}
		const minimum = rows.reduce((min, r) => (BigInt(r.data.gasPrice) < min ? BigInt(r.data.gasPrice) : min), BigInt(rows[0].data.gasPrice));
		return BigInt(current.gasPrice) <= minimum;
	}
	async function processJob(job: CryptoCollection) {
		const context: CollectionContext = {
			n: job.network,
			asset: cryptoAsset(job.data.assetId),
			price: await observer.quote('eth-' + job.network),
			deposit: wallet!.address(job.data.index),
			service: wallet!.address(0),
		};
		if (job.data.fingerprint !== wallet!.fingerprint) {
			throw Error('crypto_seed_changed');
		}
		switch (job.state) {
			case 'new':
				return planCollection(job, context);
			case 'reserve':
			case 'payout':
				return processTransferStep(job, context);
			case 'swap':
				return processSwapStep(job, context);
		}
	}
	async function planCollection(job: CollectionInState<'new'>, ctx: CollectionContext) {
		const { n, asset, price, deposit, service } = ctx;
		const d = job.data;
		const balance = await evm.balance(n, deposit, asset.id), amount = BigInt(d.amount);
		if (balance < amount) {
			throw Error('crypto_deposit_balance_changed');
		}
		const destination = await M.crypto_treasuries.findByPk(d.resourceId);
		if (!destination) {
			throw Error('crypto_payout_required');
		}
		const serviceBalance = await evm.balance(n, service);
		const low = serviceBalance < BigInt(atomicQuote(config.serviceLowCents, price, 18));
		const reserve = low
			? min(amount, BigInt(atomicQuote(config.serviceRefillCents, await observer.quote(asset.id), asset.decimals)))
			: 0n;
		const request = evm.transfer(destination.payout, asset.contract ? amount : 0n, asset.contract);
		const estimate = await evm.prepare(n, d.index, request);
		if (!(await eligible(n, BigInt(estimate.fee), price, !asset.contract))) {
			throw Error('crypto_waiting_for_fee');
		}
		await job.update({
			state: 'reserve',
			data: {
				...d,
				payout: destination.payout,
				reserve: String(reserve),
				remainder: String(amount - reserve),
				transferFee: estimate.fee,
			},
		});
		return;
	}
	async function processTransferStep(job: CollectionInState<'reserve' | 'payout'>, ctx: CollectionContext) {
		const { n, asset, price, deposit, service } = ctx;
		const d = job.data;
		// Another native payment may have restored gas while this token job was deferred.
		if (job.state === 'reserve' &&
			asset.contract &&
			BigInt(d.reserve) > 0n &&
			!(await M.crypto_transactions.findByPk(job.id + ':reserve')) &&
			(await evm.balance(n, service)) >=
				BigInt(atomicQuote(config.serviceLowCents, price, 18))) {
			await job.update({ data: { ...d, reserve: '0', remainder: d.amount } });
			return;
		}
		const reserveStep = job.state === 'reserve', amount = BigInt(reserveStep ? d.reserve : d.remainder), to = reserveStep ? service : d.payout;
		if (amount > 0n) {
			let value = amount, maxFee: bigint | undefined;
			if (asset.contract) {
				if (!(await M.crypto_transactions.findByPk(job.id + ':' + job.state))) {
					const estimate = await evm.prepare(n, d.index, evm.transfer(to, amount, asset.contract));
					if (!(await eligible(n, BigInt(estimate.fee), price))) {
						throw Error('crypto_waiting_for_fee');
					}
					const gas = BigInt(estimate.fee);
					// Native subscription proceeds are not a gas reserve: fund each token step independently.
					const funding = await M.crypto_transactions.findAll({
						where: {
							id: { [Op.like]: job.id + ':gas:' + job.state + ':%' },
							state: 'confirmed',
						},
					});
					const funded = funding.reduce((sum, row) => sum + BigInt(row.data.request.value), 0n);
					const needed = gas > funded ? gas - funded : 0n;
					if (needed) {
						const sequence = await M.crypto_transactions.count({
							where: { network: n, sender: service },
						});
						if (!(await send(n, job.id + ':gas:' + job.state + ':' + sequence, 0, evm.transfer(deposit, needed)))) {
							return;
						}
					}
					maxFee = funded;
				}
			}
			else {
				const existingTx = await M.crypto_transactions.findByPk(job.id + ':' + job.state);
				if (!existingTx) {
					const signed = await evm.prepare(n, d.index, evm.transfer(to, 0n));
					if (!(await eligible(n, BigInt(signed.fee), price, true))) {
						throw Error('crypto_waiting_for_fee');
					}
					const prior = await M.crypto_transactions.findAll({
						where: {
							id: { [Op.like]: job.id + ':%' },
							sender: deposit,
							state: 'confirmed',
						},
					});
					const spent = prior.reduce((sum, row) => sum + BigInt(row.data.request.value) + BigInt(row.data.fee), 0n);
					value = nativeTransferValue(BigInt(d.amount), spent, amount, BigInt(signed.fee));
					maxFee = BigInt(signed.fee);
					if (value <= 0n) {
						if (reserveStep) {
							throw Error('crypto_reserve_below_fee');
						}
						await job.update({ state: 'done', lastError: null });
						return;
					}
				}
			}
			const req = evm.transfer(to, value, asset.contract);
			if (!(await send(n, job.id + ':' + job.state, d.index, req, asset.contract
				? { contract: asset.contract, to, amount: String(value) }
				: undefined, maxFee))) {
				return;
			}
		}
		await job.update({
			state: reserveStep && amount > 0n && asset.contract
				? 'swap'
				: reserveStep
					? 'payout'
					: 'done',
			lastError: null,
		});
		return;
	}
	async function processSwapStep(job: CollectionInState<'swap'>, ctx: CollectionContext) {
		const { n, asset, price } = ctx;
		const d = job.data;
		if (await M.crypto_transactions.findByPk(job.id + ':swap')) {
			if (await send(n, job.id + ':swap', 0, {})) {
				await job.update({ state: 'payout' });
			}
			return;
		}
		const amount = BigInt(d.reserve);
		const reserveCents = usdCents(amount, await observer.quote(asset.id), asset.decimals);
		const minimum = minimumSwapOutput(reserveCents, price, config.slippagePercent);
		const result = await evm.swap(n, asset.id, amount, minimum);
		const estimate = await evm.prepare(n, 0, result.request);
		if (BigInt(estimate.fee) > BigInt(atomicQuote(config.maxSwapFeeCents, price, 18))) {
			throw Error('crypto_swap_fee_too_high');
		}
		if (result.kind === 'swap') {
			if (BigInt(result.expectedOut) < minimum) {
				throw Error('crypto_swap_price_invalid');
			}
		}
		const id = job.id + ':' + result.kind;
		if (!(await send(n, id, 0, result.request, undefined, BigInt(estimate.fee)))) {
			return;
		}
		if (result.kind === 'swap') {
			await job.update({ state: 'payout' });
		}
	}
	async function run() {
		if (!wallet) {
			return;
		}
		await withCryptoCollectionLock(sequelize, async () => {
			await sequelize.transaction(async (t) => bind(t));
			// Enqueue only finalized, credited invoices belonging to the managed wallet.
			const invoices = await M.crypto_invoices.findAll({
				where: {
					status: 'paid',
					'snapshot.managedFingerprint': wallet.fingerprint,
					'$collection.id$': null,
				},
				include: [
					{
						model: M.crypto_collections,
						as: 'collection',
						attributes: [],
						required: false,
						// Existing collection IDs are strings; invoice IDs are UUIDs.
						on: where(cast(col('collection.invoiceId'), 'uuid'), Op.eq, col('payments_crypto_invoices.id')),
					},
				],
				order: [['createdAt', 'ASC']],
				limit: 50,
			});
			for (const invoice of invoices) {
				const s = invoice.snapshot;
				if (s.managedFingerprint !== wallet.fingerprint ||
					!config.networks.includes(s.network)) {
					continue;
				}
				await M.crypto_collections.findOrCreate({
					where: { invoiceId: invoice.id },
					defaults: {
						id: invoice.id,
						network: s.network,
						state: 'new',
						data: {
							resourceId: invoice.resourceId,
							assetId: s.assetId,
							index: s.managedIndex,
							fingerprint: s.managedFingerprint,
							amount: invoice.receivedAtomic,
						},
					},
				});
			}
			for (const n of config.networks as EvmNetwork[]) {
				try {
					// Fee observation and receipt recovery must not depend on one another succeeding.
					let sampleError: string | null = null;
					try {
						await sample(n);
					}
					catch (error) {
						sampleError = safeError(error);
					}
					if (await pending(n)) {
						continue;
					}
					if (sampleError) {
						throw Error(sampleError);
					}
					const serviceBalance = await evm.balance(n, wallet.address(0)), price = await observer.quote('eth-' + n);
					await M.crypto_runtime.upsert({
						id: 'service:' + n,
						data: {
							balanceAtomic: String(serviceBalance),
							balanceCents: String(usdCents(serviceBalance, price)),
							needsFunding: serviceBalance === 0n,
							checkedAt: clock().toISOString(),
							lastError: null,
						},
					});
					const job = await M.crypto_collections.findOne({
						where: {
							network: n,
							state: { [Op.in]: ['new', 'reserve', 'payout', 'swap'] },
							[Op.and]: where(fn('COALESCE', cast(json('data.retryAt'), 'bigint'), 0), Op.lte, clock().getTime()),
						},
						order: [['createdAt', 'ASC']],
					});
					if (job) {
						try {
							await processJob(job);
							await job.update({
								lastError: null,
								data: { ...job.data, retryAt: null },
							});
						}
						catch (error) {
							const code = safeError(error), terminal = [
								'crypto_transaction_failed',
								'crypto_token_transfer_unverified',
								'crypto_deposit_balance_changed',
								'crypto_seed_changed',
							].includes(code);
							await job.update({
								state: terminal ? 'action_required' : job.state,
								lastError: code,
								data: {
									...job.data,
									retryAt: clock().getTime() + config.collectionRetryIntervalMs,
								},
							});
						}
					}
				}
				catch (error) {
					await M.crypto_runtime.upsert({
						id: 'service:' + n,
						data: { lastError: safeError(error), checkedAt: clock().toISOString() },
					});
				}
			}
		});
	}
	return { wallet, config, settings, save, available, address, run };
}
const min = (a: bigint, b: bigint) => (a < b ? a : b);
