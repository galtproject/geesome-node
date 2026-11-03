import {randomUUID} from 'node:crypto';
import {Op} from 'sequelize';
import {displayAtomic} from './cryptoAmounts.js';
import {lockCryptoReceipts} from './cryptoLocks.js';

const horizon = new Date('9999-01-01T00:00:00Z');
const openStatuses = ['pending', 'underpaid', 'confirming', 'expired', 'late_payment'];
const atomic = (value) => {
	if (typeof value !== 'string' || !/^\d{1,100}$/.test(value)) {
		throw Error('crypto_balance_evidence_invalid');
	}
	return BigInt(value);
};

/** Lifetime managed EVM deposits, independent of quote windows. All consumption uses resource + receipt locks. */
export function createCryptoAccounts({M, sequelize, serial, grantPaidInvoice, observer, clock, fail}) {
	const enabled = Boolean(observer.scanBalances);
	const journalWhere = (network, address) => ({network, [Op.or]: [{sender: address}, {'data.request.to': address}, {'data.proof.to': address}]});
	const key = (invoice) => invoice.addressId + ':' + invoice.assetId;

	async function ensure(invoice, transaction) {
		if (!enabled || !invoice.snapshot.managedFingerprint) {
			return null;
		}
		const existing = await M.crypto_accounts.findByPk(key(invoice), {transaction, lock: transaction.LOCK.UPDATE});
		if (existing) {
			if (existing.resourceId !== invoice.resourceId || existing.readerId !== invoice.readerId || existing.snapshot.managedFingerprint !== invoice.snapshot.managedFingerprint) {
				throw Error('crypto_balance_history_ambiguous');
			}
			return existing;
		}
		const history = await M.crypto_invoices.findAll({where: {addressId: invoice.addressId, assetId: invoice.assetId}, order: [['createdAt', 'ASC'], ['id', 'ASC']], limit: 1001, transaction, lock: transaction.LOCK.UPDATE});
		if (history.length > 1000 || history.some(row => row.resourceId !== invoice.resourceId || row.readerId !== invoice.readerId || row.snapshot.managedFingerprint !== invoice.snapshot.managedFingerprint)) {
			throw Error('crypto_balance_history_ambiguous');
		}
		let start = atomic(invoice.snapshot.startBlock), consumed = 0n;
		for (const row of history) {
			const boundary = atomic(row.snapshot.startBlock);
			start = boundary < start ? boundary : start;
			if (['paid', 'refunded'].includes(row.status)) {
				consumed += atomic(row.receivedAtomic);
			}
			await row.update({snapshot: {...row.snapshot, accountLedgerId: key(invoice), ...(['paid', 'refunded'].includes(row.status) ? {collectionAtomic: row.snapshot.collectionAtomic || row.receivedAtomic} : {})}}, {transaction});
		}
		const latest = history[history.length - 1];
		return M.crypto_accounts.create({id: key(invoice), resourceId: invoice.resourceId, readerId: invoice.readerId, addressId: invoice.addressId, assetId: invoice.assetId,
			snapshot: {assetId: invoice.assetId, managedFingerprint: invoice.snapshot.managedFingerprint, startBlock: String(start), network: invoice.snapshot.network, decimals: invoice.snapshot.decimals, createdAt: invoice.snapshot.createdAt, legacyConsumedAtomic: String(consumed), lastInvoiceAt: latest?.snapshot.createdAt || invoice.snapshot.createdAt},
			receivedAtomic: '0', consumedAtomic: String(consumed), activeInvoiceId: latest && openStatuses.includes(latest.status) ? latest.id : null, nextCheckAt: clock()}, {transaction});
	}

	async function register(invoice, transaction) {
		const account = await ensure(invoice, transaction);
		if (account) {
			await invoice.update({snapshot: {...invoice.snapshot, accountLedgerId: account.id}}, {transaction});
			await account.update({activeInvoiceId: invoice.id, nextCheckAt: clock(), snapshot: {...account.snapshot, lastInvoiceAt: invoice.snapshot.createdAt}}, {transaction});
		}
		return account;
	}

	async function settle(account, invoice, transaction, allowLate = false, onTime?: bigint) {
		if (['paid', 'refunded'].includes(invoice.status)) {
			return;
		}
		if (account.activeInvoiceId !== invoice.id) {
			fail(409, 'crypto_invoice_replaced');
		}
		const available = atomic(account.receivedAtomic) - atomic(account.consumedAtomic);
		const due = atomic(invoice.snapshot.amountAtomic);
		if (available < due || (!allowLate && (onTime ?? 0n) < due)) {
			fail(409, 'crypto_payment_not_confirmed');
		}
		// Late increments are not silently granted under an expired quote. A fresh
		// quote can consume all remaining value, or an owner can approve this one.
		const amount = allowLate ? available : available < onTime! ? available : onTime!;
		const credit = await grantPaidInvoice(invoice.invoiceId, transaction, {amountAtomic: String(amount), options: invoice.snapshot.creditOptions || [{id: invoice.snapshot.optionId, label: invoice.snapshot.optionLabel, period: invoice.snapshot.period, amountAtomic: invoice.snapshot.amountAtomic}]});
		if (!credit) {
			throw Error('crypto_balance_credit_inconsistent');
		}
		await M.crypto_credits.create({id: randomUUID(), accountId: account.id, invoiceId: invoice.id, amountAtomic: String(amount)}, {transaction});
		await invoice.update({status: 'paid', receivedAtomic: String(amount), lastError: null,
			snapshot: {...invoice.snapshot, collectionAtomic: String(amount), credit, observedPending: '0'}}, {transaction});
		await account.update({consumedAtomic: String(atomic(account.consumedAtomic) + amount), activeInvoiceId: null, nextCheckAt: new Date(clock().getTime() + 3600000)}, {transaction});
	}

	async function scan(input, force = false, interactive = false) {
		const lease = randomUUID(), now = clock();
		const due = force ? {} : {[Op.or]: [{nextCheckAt: {[Op.lte]: now}}, ...(interactive ? [{lastError: null, 'snapshot.observedAt': {[Op.lte]: new Date(now.getTime() - 15000).toISOString()}}] : [])]};
		const [claimed] = await M.crypto_accounts.update({scanLease: lease, scanLeaseUntil: new Date(now.getTime() + 180000)}, {where: {id: input.id,
			[Op.and]: [due, {[Op.or]: [{scanLease: null}, {scanLeaseUntil: {[Op.lt]: now}}]}]}});
		if (!claimed) {
			return;
		}
		try {
			const account = await M.crypto_accounts.findByPk(input.id);
			const address = await M.crypto_addresses.findByPk(account.addressId);
			const active = account.activeInvoiceId ? await M.crypto_invoices.findByPk(account.activeInvoiceId) : null;
			const journal = await M.crypto_transactions.findAll({where: journalWhere(account.snapshot.network, address.address), attributes: ['id', 'network', 'hash', 'sender', 'state', 'data'], limit: 1001});
			const result = await observer.scanBalances(account.snapshot, address.address, {invoiceId: account.id, expiresAt: active?.expiresAt || horizon, prior: [], journal: journal.map(row => row.toJSON()), checkpoint: account.snapshot.checkpoint});
			await serial(account.resourceId, async (_resource, transaction) => {
				await lockCryptoReceipts(sequelize, transaction);
				const current = await M.crypto_accounts.findByPk(account.id, {transaction, lock: transaction.LOCK.UPDATE});
				if (current.scanLease !== lease) {
					return;
				}
				const currentJournal = await M.crypto_transactions.findAll({where: journalWhere(account.snapshot.network, address.address), attributes: ['hash'], limit: 1001, transaction});
				if (current.activeInvoiceId !== account.activeInvoiceId || currentJournal.map(row => row.hash).sort().join(',') !== journal.map(row => row.hash).sort().join(',')) {
					await current.update({scanLease: null, scanLeaseUntil: null, nextCheckAt: clock()}, {transaction});
					return;
				}
				const total = atomic(result.checkpoint.received), consumed = atomic(current.consumedAtomic), previous = atomic(current.receivedAtomic);
				const pending = result.transfers.filter(row => !row.confirmed).reduce((sum, row) => sum + atomic(row.atomic), 0n);
				if (total < previous || total < consumed) {
					throw Error('crypto_balance_regressed');
				}
				if (total > previous) {
					await M.crypto_deposits.create({id: current.id + ':' + result.checkpoint.confirmed.height, accountId: current.id, amountAtomic: String(total - previous), proof: result.checkpoint}, {transaction});
				}
				await current.update({receivedAtomic: String(total), snapshot: {...current.snapshot, checkpoint: result.checkpoint, pendingAtomic: String(pending), observedAt: now.toISOString()},
					lastError: null, scanLease: null, scanLeaseUntil: null, nextCheckAt: new Date(now.getTime() + (active && now <= new Date(active.expiresAt) ? 15000 : 3600000))}, {transaction});
				if (result.checkpoint.confirmed) {
					await M.crypto_runtime.upsert({id: 'balance-cursor:' + current.addressId + ':' + current.assetId, data: {height: result.checkpoint.confirmed.height}}, {transaction});
				}
				for (const saved of result.receipts) {
					const tx = await M.crypto_transactions.findByPk(saved.id, {transaction, lock: transaction.LOCK.UPDATE});
					if (tx && !tx.data.balanceReceipt) {
						await tx.update({data: {...tx.data, balanceReceipt: saved.receipt}}, {transaction});
					}
				}
				if (!active) {
					return;
				}
				const invoice = await M.crypto_invoices.findByPk(active.id, {transaction, lock: transaction.LOCK.UPDATE});
				if (!openStatuses.includes(invoice.status)) {
					return;
				}
				const available = total - consumed, due = atomic(invoice.snapshot.amountAtomic);
				const timely = atomic(result.checkpoint.onTime) > consumed ? atomic(result.checkpoint.onTime) - consumed : 0n;
				if (timely >= due) {
					await settle(current, invoice, transaction, false, timely);
					return;
				}
				const status = now > new Date(invoice.expiresAt) ? available >= due ? 'late_payment' : 'expired' : pending > 0n ? 'confirming' : available > 0n ? 'underpaid' : 'pending';
				await invoice.update({status, receivedAtomic: String(available), lastError: null, snapshot: {...invoice.snapshot, observedPending: displayAtomic(String(pending), invoice.snapshot.decimals)}}, {transaction});
				await M.invoices.update({status: status === 'expired' ? 'expired' : 'pending'}, {where: {id: invoice.id}, transaction});
			});
		}
		catch (error) {
			const reason = (error as any)?.code || (error as any)?.message;
			await M.crypto_accounts.update({lastError: typeof reason === 'string' && /^crypto_balance_[a-z_]+$/.test(reason) ? reason : 'crypto_network_unavailable', scanLease: null, scanLeaseUntil: null, nextCheckAt: new Date(clock().getTime() + 30000)}, {where: {id: input.id, scanLease: lease}});
		}
	}

	async function bootstrap() {
		if (!enabled) {
			return;
		}
		const invoices = await M.crypto_invoices.findAll({where: {'snapshot.managedFingerprint': {[Op.ne]: null}, 'snapshot.accountLedgerId': null, nextCheckAt: {[Op.lte]: clock()}}, order: [['nextCheckAt', 'ASC']], limit: 10});
		for (const invoice of invoices) {
			try {
				await serial(invoice.resourceId, async (_row, transaction) => {
					await lockCryptoReceipts(sequelize, transaction);
					await ensure(invoice, transaction);
				});
			}
			catch {
				await M.crypto_invoices.update({lastError: 'crypto_balance_history_ambiguous', nextCheckAt: new Date(clock().getTime() + 3600000)}, {where: {id: invoice.id}});
			}
		}
	}

	async function run() {
		await bootstrap();
		const accounts = await M.crypto_accounts.findAll({where: {nextCheckAt: {[Op.lte]: clock()}}, order: [['nextCheckAt', 'ASC']], limit: 10});
		for (const account of accounts) {
			await scan(account);
		}
	}

	async function reconcile(invoice, force = false) {
		if (!enabled || !invoice.snapshot.managedFingerprint) {
			return false;
		}
		const account = await serial(invoice.resourceId, async (_row, transaction) => {
			await lockCryptoReceipts(sequelize, transaction);
			return ensure(invoice, transaction);
		});
		await scan(account, force, true);
		return true;
	}

	async function review(invoice) {
		return serial(invoice.resourceId, async (_row, transaction) => {
			await lockCryptoReceipts(sequelize, transaction);
			const account = await ensure(invoice, transaction);
			const current = await M.crypto_invoices.findByPk(invoice.id, {transaction, lock: transaction.LOCK.UPDATE});
			if (current.status === 'paid') {
				return {ok: true};
			}
			if (!['late_payment', 'expired'].includes(current.status) || account.lastError) {
				fail(409, 'crypto_payment_not_confirmed');
			}
			await settle(account, current, transaction, true);
			return {ok: true};
		});
	}

	return {enabled, ensure, register, run, reconcile, review};
}
