import { lockCryptoAllocation } from './cryptoLocks.js';
import { validReceivingAddress } from './cryptoWallet.js';
export function createPayoutSettings({ M, sequelize, resource, wallet, bind, fail }) {
	async function reserve(address, transaction) {
		await M.payout_addresses.findOrCreate({ where: { address: address.toLowerCase() }, transaction });
	}
	async function validate(address, transaction) {
		if (!validReceivingAddress(address, 'evm')) {
			fail(400, 'crypto_payout_invalid');
		}
		if (!wallet) {
			fail(409, 'crypto_seed_required');
		}
		if (address.toLowerCase() === wallet.address(0)) {
			fail(400, 'crypto_payout_is_service');
		}
		if (await M.crypto_addresses.findOne({ where: { address: address.toLowerCase() }, transaction })) {
			fail(400, 'crypto_payout_is_deposit');
		}
	}
	function version(value) {
		if (!Number.isSafeInteger(value) || value < 0) {
			fail(400, 'crypto_payout_invalid');
		}
	}
	async function update(Model, where, address, expected, transaction) {
		const current = await Model.findOne({ where, transaction, lock: transaction.LOCK.UPDATE });
		if ((current?.version || 0) !== expected) {
			fail(409, 'crypto_settings_version_conflict');
		}
		// Keep previous destinations reserved even after settings change.
		if (current?.payout) {
			await reserve(current.payout, transaction);
		}
		const values = { payout: address, version: expected + 1 };
		if (current) {
			await current.update(values, { transaction });
		}
		else {
			await Model.create({ ...where, ...values }, { transaction });
		}
	}
	async function ownerDefault(userId, transaction?) {
		const row = await M.owner_payouts.findByPk(userId, { transaction });
		return { payout: row?.payout || '', version: row?.version || 0 };
	}
	async function resolve(id, transaction?) {
		const site = await resource(id, transaction);
		const group = await M.crypto_treasuries.findByPk(id, { transaction });
		const inherited = await ownerDefault(site.ownerId, transaction);
		const address = group?.payout || inherited.payout;
		return { payout: address || '', payoutSource: group?.payout ? 'group' : inherited.payout ? 'owner' : null,
			groupPayout: group?.payout || '', version: group?.version || 0, ownerDefault: inherited, ownerId: site.ownerId };
	}
	return {
		ownerDefault,
		resolve,
		async saveOwnerDefault(userId, body) {
			if (!Number.isSafeInteger(userId) || userId <= 0 || !body
				|| Object.keys(body).some(key => !['payout', 'version'].includes(key))) {
				fail(400, 'crypto_payout_invalid');
			}
			version(body.version);
			await sequelize.transaction(async (transaction) => {
				await lockCryptoAllocation(sequelize, transaction);
				await validate(body.payout, transaction);
				await bind(transaction);
				const address = body.payout.toLowerCase();
				await reserve(address, transaction);
				await update(M.owner_payouts, { userId }, address, body.version, transaction);
			});
			return { ok: true };
		},
		async saveGroup(id, body) {
			await resource(id);
			if (!body) {
				fail(400, 'crypto_payout_invalid');
			}
			version(body.version);
			const inherit = body.inherit === true;
			if (inherit && body.payout !== undefined) {
				fail(400, 'crypto_payout_invalid');
			}
			await sequelize.transaction(async (transaction) => {
				await lockCryptoAllocation(sequelize, transaction);
				let address = '';
				if (!inherit) {
					await validate(body.payout, transaction);
					await bind(transaction);
					address = body.payout.toLowerCase();
					await reserve(address, transaction);
				}
				await update(M.crypto_treasuries, { id }, address, body.version, transaction);
			});
			return { ok: true };
		},
		async destination(id, transaction) {
			const effective = await resolve(id, transaction);
			if (!effective.payout) {
				fail(409, 'crypto_payout_required');
			}
			await validate(effective.payout, transaction);
			await reserve(effective.payout, transaction);
			return { resourceId: id, ownerId: effective.ownerId, payout: effective.payout,
				source: effective.payoutSource, version: effective.payoutSource === 'group' ? effective.version : effective.ownerDefault.version };
		},
		async isReserved(address, transaction) {
			return Boolean(await M.payout_addresses.findByPk(address, { transaction })
				|| await M.owner_payouts.findOne({ where: { payout: address }, transaction }));
		}
	};
}
