import { DataTypes } from 'sequelize';
import defineUsers from '../../app/modules/database/models/user.js';
import definePayments from '../../app/modules/payments/models.js';
import defineMembership from '../../app/modules/membership/models.js';
import { createPayments } from '../../app/modules/payments/index.js';
import { createMembership } from '../../app/modules/membership/index.js';
import { siteProblem } from '../../app/modules/api/browserSession.js';
const databases = new WeakMap();
export async function createMembershipService({ sequelize, env, clock, cryptoObserver, cryptoAdapter }) {
	let saved = databases.get(sequelize);
	if (!saved) {
		await sequelize.getQueryInterface().dropAllTables();
		const User = await defineUsers(sequelize, {});
		const readers = sequelize.define('test_legacy_readers', { id: { type: DataTypes.UUID, primaryKey: true }, googleSub: DataTypes.STRING, email: DataTypes.STRING, name: DataTypes.STRING });
		await readers.sync({});
		saved = { User, readers, payments: await definePayments(sequelize), membership: await defineMembership(sequelize) };
		databases.set(sequelize, saved);
	}
	const sites = [{ id: 'wave', origin: 'https://eraofwave.com', groupId: 1, ownerId: 1 }, { id: 'meat', origin: 'https://eraofmeat.com', groupId: 2, ownerId: 2 }];
	const app: any = { checkUserCan: async () => {}, isAdminCan: async () => true, config: { paymentsConfig: {} }, ms: { database: { sequelize, models: { User: saved.User } }, group: {
				getLocalGroup: async (ownerId, groupId) => ({ id: Number(groupId), creatorId: ownerId, isPublic: false, isEncrypted: false, title: 'Test creator' })
			} } };
	const payments = createPayments(app, saved.payments, { env, clock, observer: cryptoObserver, adapter: cryptoAdapter });
	app.ms.payments = payments;
	app.ms.googleAuthorization = {models: {Identity: saved.readers}};
	const service = createMembership(app, saved.membership, { clock });
	payments.configureLedger({ models: saved.membership, resource: service.resource, serial: service.serial, grantPaidInvoice: service.grantPaidInvoice, fail: siteProblem, clock });
	return { ...service, async seedSites() {
		for (const site of sites) {
			if (!await saved.membership.site_settings.findByPk(site.id)) {
				await service.provisionSite(1, { ...site, googleClientId: '', enabled: false, postsEnabled: false, registrationEnabled: false, version: 0 });
			}
		}
	}, directCrypto: payments.engine, models: { ...saved.payments, ...saved.membership, readers: saved.readers } };
}
