import { lockCryptoAllocation, lockCryptoReceipts } from './cryptoLocks.js';
import { atomicQuote, displayAtomic } from './cryptoAmounts.js';
import { addressIdentity, normalizedAddress } from './cryptoAddressIdentity.js';
import { createCryptoTreasury } from './cryptoTreasury.js';
import { Op } from 'sequelize';
import { createHash, randomUUID } from 'node:crypto';
import { cryptoAssets, cryptoAsset, cryptoNetworks, type CryptoNetwork } from './cryptoAssets.js';
import { publicWallet, receivingAddress, validReceivingAddress } from './cryptoWallet.js';
import { createCryptoObserver, type ChainTransfer } from './cryptoObserver.js';
export function createDirectCrypto({ M, sequelize, serial, resource, grantPaidInvoice, fail, clock, env, adapter, observer = createCryptoObserver(env) }: any) {
	const treasury = createCryptoTreasury({ M, sequelize, resource, fail, clock, env, observer, adapter });
	const dto = (c: any, address: any) => ({ id: c.id, provider: 'direct', status: c.status, lastError: c.lastError || null, monitoringUntil: new Date(new Date(c.createdAt).getTime() + 7 * 86400000), assetId: c.assetId, address: address.address, amount: displayAtomic(c.snapshot.amountAtomic, c.snapshot.decimals), received: displayAtomic(c.receivedAtomic, c.snapshot.decimals), expiresAt: c.expiresAt, priceUsd: c.snapshot.amountCents / 100, optionLabel: c.snapshot.optionLabel, period: c.snapshot.period, currency: c.snapshot.currency, network: c.snapshot.network, decimals: c.snapshot.decimals, contract: c.snapshot.contract });
	const hash = (s: string) => createHash('sha256').update(s).digest('hex');
	const balanceJournalWhere = (network: string, address: string) => ({ network, [Op.or]: [{ sender: address }, { 'data.request.to': address }, { 'data.proof.to': address }] });
	async function capacity(w: any) {
		if (w.xpub) {
			return null;
		}
		const identities = w.pool.slice(w.nextIndex).map((a: string) => addressIdentity(w.network, a));
		if (!identities.length) {
			return 0;
		}
		const used = await M.crypto_addresses.count({ where: { identity: { [Op.in]: identities } } });
		return identities.length - used;
	}
	async function settings(id: string) { await resource(id); const rows = await M.crypto_wallets.findAll({ where: { resourceId: id } }); return { automation: await treasury.settings(id), wallets: await Promise.all(Object.entries(cryptoNetworks).map(async ([network, n]: any) => { const w = rows.find(w => w.network === network); return { network, label: n.label, version: w?.version || 0, enabled: w?.enabled || false, xpub: w?.xpub || '', pool: w?.pool || [], assets: w?.assets || [], nextIndex: w?.nextIndex || 0, checkedAt: w?.checkedAt || null, checkError: w?.checkError || null, remaining: w ? await capacity(w) : 0 }; })) }; }
	async function methods(id: string) {
		await resource(id);
		const rows = await M.crypto_wallets.findAll({ where: { resourceId: id, enabled: true } });
		const availableNetworks = new Set<string>(), managedNetworks = new Set<string>();
		for (const n of treasury.config.networks)
			if (await treasury.available(id, n)) {
				availableNetworks.add(n);
				managedNetworks.add(n);
			}
		for (const w of rows)
			if (w.xpub || (await capacity(w))! > 0) {
				availableNetworks.add(w.network);
			}
		return cryptoAssets.map(a => ({ id: a.id, currency: a.currency, network: a.network, networkLabel: cryptoNetworks[a.network].label, available: availableNetworks.has(a.network) && (managedNetworks.has(a.network) || rows.some(w => w.network === a.network && w.assets.includes(a.id))) }));
	}
	async function save(id: string, b: any) {
		const n = cryptoNetworks[b.network as CryptoNetwork];
		if (!n) {
			fail(400, 'crypto_network_invalid');
		}
		if (typeof b.enabled !== 'boolean' || !Number.isInteger(b.version) || b.version < 0 || !Array.isArray(b.pool) || typeof b.xpub !== 'string' || b.pool.some(s => typeof s !== 'string')) {
			fail(400, 'crypto_wallet_invalid');
		}
		let pool = Array.isArray(b.pool) ? b.pool.map((s: any) => String(s).trim()).filter(Boolean) : [];
		const xpub = String(b.xpub || '').trim();
		if (pool.length > 2000 || new Set(pool.map(s => s.toLowerCase())).size !== pool.length || pool.some(s => !validReceivingAddress(s, n.family))) {
			fail(400, 'crypto_address_invalid');
		}
		pool = pool.map(s => normalizedAddress(n.family, s));
		try {
			if (xpub) {
				publicWallet(xpub);
				receivingAddress(xpub, n.family, 0);
			}
		}
		catch {
			fail(400, 'crypto_account_public_key_required');
		}
		if (xpub && pool.length) {
			fail(400, 'crypto_choose_one_wallet_source');
		}
		const assets = Array.isArray(b.assets) ? [...new Set(b.assets)] : [];
		if (assets.some(a => !cryptoAssets.some(v => v.id === a && v.network === b.network))) {
			fail(400, 'crypto_asset_invalid');
		}
		if (b.enabled && (!assets.length || (!xpub && !pool.length))) {
			fail(400, 'crypto_wallet_required');
		}
		return serial(id, async (_r, t) => {
			let w = await M.crypto_wallets.findOne({ where: { resourceId: id, network: b.network }, transaction: t, lock: t.LOCK.UPDATE });
			if ((w?.version || 0) !== b.version) {
				fail(409, 'crypto_settings_version_conflict');
			}
			// A pool is append-only once an address has been allocated; old invoice ownership is immutable.
			if (w?.nextIndex && JSON.stringify(pool.slice(0, w.nextIndex)) !== JSON.stringify(w.pool.slice(0, w.nextIndex)) && !w.xpub) {
				fail(409, 'crypto_used_addresses_immutable');
			}
			if (w?.nextIndex && (w.xpub || '') !== xpub) {
				fail(409, 'crypto_used_wallet_immutable');
			}
			const values = { enabled: b.enabled === true, xpub: xpub || null, pool, assets, version: (w?.version || 0) + 1 };
			if (w) {
				await w.update(values, { transaction: t });
			}
			else {
				w = await M.crypto_wallets.create({ id: randomUUID(), resourceId: id, network: b.network, nextIndex: 0, ...values }, { transaction: t });
			}
			return { ok: true };
		});
	}
	async function test(id: string, network: CryptoNetwork) {
		await resource(id);
		if (!cryptoNetworks[network]) {
			fail(400, 'crypto_network_invalid');
		}
		try {
			await observer.check(network);
			await M.crypto_wallets.update({ checkedAt: clock(), checkError: null }, { where: { resourceId: id, network } });
			return { ok: true, checkedAt: clock() };
		}
		catch {
			await M.crypto_wallets.update({ checkedAt: clock(), checkError: 'crypto_network_unavailable' }, { where: { resourceId: id, network } });
			fail(503, 'crypto_network_unavailable');
		}
	}
	async function invoice(id: string, readerId: string, b: any) {
		let asset;
		try {
			asset = cryptoAsset(b.assetId);
		}
		catch {
			fail(400, 'crypto_asset_invalid');
		}
		if (typeof b.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{1,180}$/.test(b.idempotencyKey)) {
			fail(400, 'idempotency_key_required');
		}
		const requestKey = hash(`${id}:${readerId}:${b.idempotencyKey}`);
		const old = await M.crypto_invoices.findOne({ where: { requestKey } });
		if (old) {
			if (old.assetId !== asset!.id || old.snapshot.optionId !== b.optionId) {
				fail(409, 'idempotency_conflict');
			}
			return read(id, readerId, old.id);
		}
		const managed = await treasury.available(id, asset!.network);
		const configured = await M.crypto_wallets.findOne({ where: { resourceId: id, network: asset!.network, enabled: true } });
		if (!managed && (!configured || !configured.assets.includes(asset!.id))) {
			fail(409, 'crypto_method_unavailable');
		}
		let startBlock: string | undefined;
		let rate: string;
		try {
			if (observer.boundary) {
				startBlock = (await observer.boundary(asset!.network)).height;
			}
			// Membership stablecoin pricing is a fixed USD tariff, not a market conversion.
			rate = ['USDC', 'USDT'].includes(asset!.currency) ? '1' : await observer.quote(asset!.id);
			await observer.check(asset!.network);
		}
		catch {
			fail(503, 'crypto_network_unavailable');
		}
		const created = await serial(id, async (r, t) => {
			if (!r.postsEnabled) {
				fail(404, 'posts_disabled');
			}
			const previous = await M.crypto_invoices.findOne({ where: { requestKey }, transaction: t });
			if (previous) {
				if (previous.assetId !== asset!.id || previous.snapshot.optionId !== b.optionId) {
					fail(409, 'idempotency_conflict');
				}
				return previous;
			}
			// Global allocator lock also serializes pending limits across author resources.
			await lockCryptoAllocation(sequelize, t);
			if (managed && observer.scanBalances) {
				await lockCryptoReceipts(sequelize, t);
			}
			const pending = await M.crypto_invoices.count({ where: { readerId, status: { [Op.in]: ['pending', 'confirming', 'underpaid'] } }, transaction: t });
			if (pending >= 10) {
				fail(429, 'crypto_too_many_pending_invoices');
			}
			const option = await M.options.findOne({ where: { id: b.optionId, resourceId: id, enabled: true }, transaction: t });
			if (!option) {
				fail(404, 'option_not_found');
			}
			const w = await M.crypto_wallets.findOne({ where: { resourceId: id, network: asset!.network, enabled: true }, transaction: t, lock: t.LOCK.UPDATE });
			if (!managed && (!w || !w.assets.includes(asset!.id))) {
				fail(409, 'crypto_method_unavailable');
			}
			let addressRow, managedIndex: number | undefined;
			if (managed) {
				if (!await treasury.available(id, asset!.network)) {
					fail(409, 'crypto_method_unavailable');
				}
				const pending = await M.crypto_invoices.findOne({ where: { readerId, assetId: asset!.id, status: { [Op.in]: ['pending', 'confirming', 'underpaid'] } }, transaction: t });
				if (pending) {
					fail(409, 'crypto_reader_invoice_pending');
				}
				const allocated = await treasury.address(readerId, asset!.network, t);
				addressRow = allocated.address;
				managedIndex = allocated.account.index;
			}
			else {
				if (w.xpub) {
					// A shared public account has one derivation cursor across authors/networks.
					const peers = await M.crypto_wallets.findAll({ where: { xpub: w.xpub }, attributes: ['network', 'nextIndex'], transaction: t });
					const nextIndex = Math.max(w.nextIndex, ...peers.filter(p => cryptoNetworks[p.network as CryptoNetwork].family === cryptoNetworks[asset!.network].family).map(p => p.nextIndex));
					if (nextIndex > w.nextIndex) {
						await w.update({ nextIndex }, { transaction: t });
					}
				}
				for (let attempt = 0; attempt < 2000; attempt++) {
					const index = w.nextIndex;
					if (index >= 0x80000000 || (!w.xpub && index >= w.pool.length)) {
						fail(409, 'crypto_addresses_exhausted');
					}
					const address = w.xpub ? receivingAddress(w.xpub, cryptoNetworks[asset!.network].family, index) : w.pool[index];
					await w.update({ nextIndex: index + 1 }, { transaction: t });
					const identity = addressIdentity(asset!.network, address);
					// Account for identical EVM keys configured on multiple networks/resources.
					if (await M.crypto_addresses.findOne({ where: { identity }, transaction: t })) {
						continue;
					}
					try {
						addressRow = await M.crypto_addresses.create({ id: randomUUID(), identity, walletId: w.id, address, network: asset!.network, index }, { transaction: t });
						break;
					}
					catch (e) {
						throw e;
					}
				}
				if (!addressRow) {
					fail(409, 'crypto_addresses_exhausted');
				}
			}
			const uuid = randomUUID(), now = clock(), amountAtomic = atomicQuote(option.amountCents, rate!, asset!.decimals);
			if (managed) {
				if (observer.scanBalances) {
					const cursor = await M.crypto_runtime.findByPk('balance-cursor:' + addressRow.id + ':' + asset!.id, { transaction: t });
					if (cursor && BigInt(cursor.data.height) > BigInt(startBlock!)) {
						startBlock = cursor.data.height;
					}
					if (!cursor) {
						// Seed the cursor from receipt-mode history during the first balance-mode renewal.
						const height = await M.crypto_transfers.latestConfirmedHeight(addressRow.id, asset!.id, t);
						if (height && BigInt(height) > BigInt(startBlock!)) {
							startBlock = height;
						}
					}
				}
				if (!startBlock) {
					fail(503, 'crypto_boundary_required');
				}
				const previousInvoices = await M.crypto_invoices.findAll({ where: { addressId: addressRow.id, assetId: asset!.id, status: { [Op.ne]: 'paid' } }, transaction: t, lock: t.LOCK.UPDATE });
				for (const previous of previousInvoices)
					if (previous.snapshot.endBlock === undefined) {
						await previous.update({ snapshot: { ...previous.snapshot, endBlock: startBlock, endAt: now.getTime() } }, { transaction: t });
					}
			}
			const payoutDestination = managed ? await treasury.destination(id, t) : undefined;
			const snapshot = { ...(managed ? { payoutDestination } : {}), ...(managed ? { managedIndex, managedFingerprint: treasury.wallet!.fingerprint } : {}), assetId: asset!.id, currency: asset!.currency, network: asset!.network, contract: asset!.contract, decimals: asset!.decimals, amountAtomic, rateUsd: rate!, amountCents: option.amountCents, optionId: option.id, optionLabel: option.label, period: option.period, createdAt: now.getTime(), ...(startBlock ? { startBlock } : {}) };
			await M.invoices.create({ id: uuid, resourceId: id, readerId, requestKey: hash('direct:' + requestKey), optionSnapshot: option.toJSON(), providerId: 'direct:' + uuid, checkoutUrl: `https://${r.domain}/account/payments?cryptoInvoice=${uuid}`, status: 'pending' }, { transaction: t });
			return M.crypto_invoices.create({ id: uuid, resourceId: id, readerId, invoiceId: uuid, requestKey, assetId: asset!.id, addressId: addressRow.id, snapshot, status: 'pending', expiresAt: new Date(now.getTime() + 30 * 60000), nextCheckAt: now, receivedAtomic: '0' }, { transaction: t });
		});
		return read(id, readerId, created.id);
	}
	async function read(id: string, readerId: string, invoiceId: string) {
		const c = await M.crypto_invoices.findOne({ where: { id: invoiceId, resourceId: id, readerId } });
		if (!c) {
			fail(404, 'invoice_not_found');
		}
		return dto(c, await M.crypto_addresses.findByPk(c.addressId));
	}
	async function scanInvoice(c: any) {
		const lease = randomUUID(), now = clock();
		const [claimed] = await M.crypto_invoices.update({ scanLease: lease, scanLeaseUntil: new Date(now.getTime() + 180000) }, { where: { id: c.id, [Op.or]: [{ scanLease: null }, { scanLeaseUntil: { [Op.lt]: now } }] } });
		if (!claimed) {
			return;
		}
		try {
			const address = await M.crypto_addresses.findByPk(c.addressId);
			const priorTransfers = await M.crypto_transfers.findAll({ where: { cryptoInvoiceId: c.id } });
			const knownTxids = [...new Set<string>(priorTransfers.map(row => row.data.txid))];
			const balanceMode = Boolean(c.snapshot.managedFingerprint && observer.scanBalances);
			const checkpoint = balanceMode ? await M.crypto_runtime.findByPk('balance:' + c.id) : null;
			const journal = balanceMode ? await M.crypto_transactions.findAll({ where: balanceJournalWhere(c.snapshot.network, address.address), attributes: ['id', 'network', 'hash', 'sender', 'state', 'data'], limit: 1001 }) : [];
			const balanceScan = balanceMode ? await observer.scanBalances(c.snapshot, address.address, { invoiceId: c.id, expiresAt: c.expiresAt, prior: priorTransfers.map(row => row.data), journal: journal.map(row => row.toJSON()), checkpoint: checkpoint?.data }) : null;
			const found: ChainTransfer[] = balanceScan ? balanceScan.transfers : await observer.scan(c.snapshot, address.address, knownTxids);
			// Serialize billing writes; RPC/indexer work deliberately occurs outside the lock.
			await serial(c.resourceId, async (_r, t) => {
				await lockCryptoReceipts(sequelize, t);
				const current = await M.crypto_invoices.findByPk(c.id, { transaction: t, lock: t.LOCK.UPDATE });
				if (current.scanLease !== lease || !['pending', 'confirming', 'underpaid', 'expired', 'late_payment'].includes(current.status)) {
					return;
				}
				// Allocation can close this invoice while its RPC scan is in flight.
				if (balanceScan && current.snapshot.endBlock !== c.snapshot.endBlock) {
					await current.update({ scanLease: null, scanLeaseUntil: null, nextCheckAt: now }, { transaction: t });
					return;
				}
				if (balanceScan) {
					// Journal entries commit before broadcast. A new internal transfer may
					// have landed between the first journal read and the RPC block snapshot.
					const currentJournal = await M.crypto_transactions.findAll({ where: balanceJournalWhere(c.snapshot.network, address.address), attributes: ['hash'], limit: 1001, transaction: t });
					if (currentJournal.map(row => row.hash).sort().join(',') !== journal.map(row => row.hash).sort().join(',')) {
						await current.update({ scanLease: null, scanLeaseUntil: null, nextCheckAt: now }, { transaction: t });
						return;
					}
				}
				// Service-funded gas is an internal transfer, never a customer's subscription payment.
				const hashes = [...new Set(found.map(v => v.txid).filter(v => typeof v === 'string' && /^0x[0-9a-f]{64}$/i.test(v)).map(v => v.toLowerCase()))];
				const internal = new Set<string>(hashes.length ? (await M.crypto_transactions.findAll({ where: { network: c.snapshot.network, hash: { [Op.in]: hashes } }, attributes: ['hash'], transaction: t })).map(row => row.hash) : []);
				const valid = found.filter(v => !internal.has(String(v.txid).toLowerCase()) && (current.snapshot.endBlock === undefined || (typeof v.blockHeight === 'string' && BigInt(v.blockHeight) <= BigInt(current.snapshot.endBlock))) && typeof v.key === 'string' && v.key.length <= 200 && /^[0-9]+$/.test(v.atomic) && BigInt(v.atomic) > 0n && Number.isSafeInteger(v.timestamp) && ((!v.confirmed && v.timestamp === 0) || (c.snapshot.startBlock ? typeof v.blockHeight === 'string' && /^[0-9]+$/.test(v.blockHeight) && BigInt(v.blockHeight) > BigInt(c.snapshot.startBlock) : v.timestamp >= c.snapshot.createdAt)));
				const unique = [...new Map(valid.map(v => [v.key, v])).values()];
				let received = 0n, pending = 0n, onTime = 0n;
				// Only a successful complete scan may retire an orphaned receipt.
				// Preserve event ownership forever, even if it is no longer canonical.
				const observedKeys = new Set(unique.filter(v => v.confirmed).map(v => v.key));
				for (const row of await M.crypto_transfers.findAll({ where: { cryptoInvoiceId: c.id }, transaction: t })) {
					if (!observedKeys.has(row.eventKey)) {
						await row.update({ data: { ...row.data, confirmed: false } }, { transaction: t });
					}
				}
				for (const v of unique) {
					if (!v.confirmed) {
						pending += BigInt(v.atomic);
						continue;
					}
					const existing = await M.crypto_transfers.findOne({ where: { eventKey: v.key }, transaction: t });
					if (existing && existing.cryptoInvoiceId !== c.id) {
						fail(409, 'crypto_transfer_already_used');
					}
					if (existing) {
						await existing.update({ data: v }, { transaction: t });
					}
					else {
						await M.crypto_transfers.create({ id: randomUUID(), eventKey: v.key, cryptoInvoiceId: c.id, data: v }, { transaction: t });
					}
					received += BigInt(v.atomic);
					if (v.timestamp > 0 && v.timestamp <= new Date(c.expiresAt).getTime()) {
						onTime += BigInt(v.atomic);
					}
				}
				// Previously verified transfers survive temporary indexer lag, but cannot be counted twice.
				const saved = await M.crypto_transfers.findAll({ where: { cryptoInvoiceId: c.id }, transaction: t });
				received = 0n;
				onTime = 0n;
				for (const row of saved) {
					if (!row.data.confirmed) {
						continue;
					}
					received += BigInt(row.data.atomic);
					if (row.data.timestamp > 0 && row.data.timestamp <= new Date(c.expiresAt).getTime()) {
						onTime += BigInt(row.data.atomic);
					}
				}
				const due = BigInt(c.snapshot.amountAtomic), expired = now > new Date(c.expiresAt);
				let status = onTime >= due ? 'paid' : received >= due ? 'late_payment' : expired ? 'expired' : pending + received >= due ? 'confirming' : received > 0n ? 'underpaid' : 'pending';
				if (status === 'paid') {
					await grantPaidInvoice(c.invoiceId, t);
				}
				else {
					await M.invoices.update({ status: status === 'expired' ? 'expired' : 'pending' }, { where: { id: c.invoiceId, status: { [Op.ne]: 'paid' } }, transaction: t });
				}
				if (balanceScan) {
					await M.crypto_runtime.upsert({ id: 'balance:' + c.id, data: balanceScan.checkpoint }, { transaction: t });
					const cursorId = 'balance-cursor:' + c.addressId + ':' + c.assetId;
					const cursor = await M.crypto_runtime.findByPk(cursorId, { transaction: t });
					const height = balanceScan.checkpoint.confirmed?.height;
					if (height && (!cursor || BigInt(height) > BigInt(cursor.data.height))) {
						await M.crypto_runtime.upsert({ id: cursorId, data: { height } }, { transaction: t });
					}
					for (const saved of balanceScan.receipts) {
						const tx = await M.crypto_transactions.findByPk(saved.id, { transaction: t, lock: t.LOCK.UPDATE });
						if (tx && !tx.data.balanceReceipt) {
							await tx.update({ data: { ...tx.data, balanceReceipt: saved.receipt } }, { transaction: t });
						}
					}
				}
				await current.update({ status, receivedAtomic: received.toString(), lastError: null, scanLease: null, scanLeaseUntil: null, nextCheckAt: new Date(now.getTime() + (expired ? 3600000 : 15000)) }, { transaction: t });
			});
		}
		catch (error) {
			const reason = (error as any)?.code || (error as any)?.message;
			const lastError = reason === 'crypto_transfer_already_used' || (typeof reason === 'string' && /^crypto_balance_[a-z_]+$/.test(reason)) ? reason : 'crypto_network_unavailable';
			await M.crypto_invoices.update({ lastError, scanLease: null, scanLeaseUntil: null, nextCheckAt: new Date(clock().getTime() + 30000) }, { where: { id: c.id, scanLease: lease } });
		}
	}
	async function run() {
		const rows = await M.crypto_invoices.findAll({ where: { status: { [Op.in]: ['pending', 'confirming', 'underpaid', 'expired', 'late_payment'] }, nextCheckAt: { [Op.lte]: clock() }, createdAt: { [Op.gt]: new Date(clock().getTime() - 7 * 86400000) } }, order: [['nextCheckAt', 'ASC']], limit: 10 });
		for (const c of rows)
			await scanInvoice(c);
	}
	async function review(id: string, invoiceId: string) {
		return serial(id, async (_r, t) => {
			const c = await M.crypto_invoices.findOne({ where: { id: invoiceId, resourceId: id }, transaction: t, lock: t.LOCK.UPDATE });
			if (!c) {
				fail(404, 'invoice_not_found');
			}
			if (c.status === 'paid') {
				return { ok: true };
			}
			if (c.status !== 'late_payment' || BigInt(c.receivedAtomic) < BigInt(c.snapshot.amountAtomic)) {
				fail(409, 'crypto_payment_not_confirmed');
			}
			await grantPaidInvoice(c.invoiceId, t);
			await c.update({ status: 'paid' }, { transaction: t });
			return { ok: true };
		});
	}
	async function rescan(id: string, invoiceId: string) {
		const c = await M.crypto_invoices.findOne({ where: { id: invoiceId, resourceId: id } });
		if (!c) {
			fail(404, 'invoice_not_found');
		}
		if (['pending', 'confirming', 'underpaid', 'expired', 'late_payment'].includes(c.status)) {
			await scanInvoice(c);
		}
		return dto(await M.crypto_invoices.findByPk(c.id), await M.crypto_addresses.findByPk(c.addressId));
	}
	async function reviews(id: string) { const rows = await M.crypto_invoices.findAll({ where: { resourceId: id, [Op.or]: [{ status: 'late_payment' }, { status: 'expired', receivedAtomic: { [Op.ne]: '0' } }, { status: { [Op.in]: ['pending', 'underpaid', 'confirming', 'expired'] }, createdAt: { [Op.lte]: new Date(clock().getTime() - 7 * 86400000) } }] }, order: [['createdAt', 'DESC']], limit: 100 }); return { invoices: await Promise.all(rows.map(async (c) => dto(c, await M.crypto_addresses.findByPk(c.addressId)))) }; }
	return { settings, methods, save, test, invoice, read, run, review, reviews, rescan, treasury };
}
