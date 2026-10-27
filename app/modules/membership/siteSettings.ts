import { randomUUID } from 'node:crypto';
import { CorePermissionName } from '../database/interface.js';
import { siteProblem } from '../api/browserSession.js';

export default function siteSettings(app, M, group, owner, publicBrand, invalidateGroup) {
	const sequelize = app.ms.database.sequelize;
	function validate(body) {
		if (!body || !Number.isSafeInteger(body.version) || body.version < 0
			|| typeof body.enabled !== 'boolean' || typeof body.registrationEnabled !== 'boolean'
			|| typeof body.postsEnabled !== 'boolean' || typeof body.googleClientId !== 'string'
			|| body.googleClientId.length > 200 || (body.googleClientId && !/^[A-Za-z0-9._-]+$/.test(body.googleClientId))) {
			siteProblem(400, 'membership_site_invalid');
		}
	}
	function view(row, settings) {
		return { id: row.id, origin: `https://${row.domain}`, groupId: row.groupId, ownerId: row.ownerId,
			postsEnabled: row.postsEnabled, ...publicBrand(row.data), enabled: settings?.enabled === true,
			googleClientId: settings?.googleClientId || '', registrationEnabled: settings?.registrationEnabled === true,
			version: settings?.version || 0 };
	}
	async function write(row, body, transaction) {
		const current = await M.site_settings.findByPk(row.id, { transaction, lock: transaction.LOCK.UPDATE });
		if (body.version !== (current?.version || 0)) {
			siteProblem(409, 'membership_site_version_conflict');
		}
		const brandingChanged = JSON.stringify(publicBrand(row.data)) !== JSON.stringify(publicBrand(body));
		await row.update({ postsEnabled: body.postsEnabled, data: {...publicBrand(body), ...(row.data?.publication ? {publication: row.data.publication} : {})} }, { transaction });
		const values = { googleClientId: body.googleClientId, enabled: body.enabled,
			registrationEnabled: body.registrationEnabled, version: body.version + 1 };
		const settings = current ? await current.update(values, { transaction })
			: await M.site_settings.create({ resourceId: row.id, ...values }, { transaction });
		if (brandingChanged) {
			await invalidateGroup(row.groupId, transaction);
		}
		return view(row, settings);
	}
	return {
		async resolveSite(host) {
			const row = await M.resources.findOne({ where: { domain: host } });
			if (!row) {
				return null;
			}
			const settings = await M.site_settings.findByPk(row.id);
			return settings?.enabled ? view(row, settings) : null;
		},
		async siteSettings(userId, id) {
			const row = await owner(userId, id);
			return view(row, await M.site_settings.findByPk(id));
		},
		async saveSiteSettings(userId, id, body) {
			await owner(userId, id);
			validate(body);
			if (Object.keys(body).some(key => !['version', 'enabled', 'googleClientId', 'registrationEnabled', 'postsEnabled', 'coverUrl', 'avatarUrl', 'links', 'patreonUrl', 'legalLinks'].includes(key))) {
				siteProblem(400, 'membership_site_invalid');
			}
			return sequelize.transaction(async transaction => {
				const row = await M.resources.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
				if (!row || row.ownerId !== userId) {
					siteProblem(403, 'owner_required');
				}
				await group(row);
				return write(row, body, transaction);
			});
		},
		async provisionSite(userId, body) {
			// This administrative capability is explicitly delegated by the node operator.
			await app.checkUserCan(userId, CorePermissionName.AdminMembershipSites);
			validate(body);
			let url;
			try {
				url = new URL(body.origin);
			} catch {
				siteProblem(400, 'membership_site_invalid');
			}
			if (url.host.length > 200 || url.protocol !== 'https:' || url.origin !== body.origin || !/^[a-z][a-z0-9-]{0,29}$/.test(body.id)
				|| !Number.isSafeInteger(body.ownerId) || body.ownerId <= 0 || !/^[1-9][0-9]*$/.test(String(body.groupId))) {
				siteProblem(400, 'membership_site_invalid');
			}
			if (!await app.isAdminCan(userId, CorePermissionName.AdminAll)) {
				await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
				if (body.ownerId !== userId) {
					siteProblem(403, 'owner_required');
				}
			}
			await group({ ownerId: body.ownerId, groupId: String(body.groupId) });
			return sequelize.transaction(async transaction => {
				// Provisioning is rare; serialize uniqueness checks including previously unseen IDs.
				await sequelize.query("SELECT pg_advisory_xact_lock(hashtextextended('membership:sites', 0))", { transaction });
				let row = await M.resources.findByPk(body.id, { transaction, lock: transaction.LOCK.UPDATE });
				if (row && (row.domain !== url.host || row.ownerId !== body.ownerId || row.groupId !== String(body.groupId))) {
					siteProblem(409, 'membership_site_binding_changed');
				}
				if (!row) {
					if (body.version !== 0 || await M.resources.findOne({ where: { domain: url.host }, transaction })
						|| await M.resources.findOne({ where: { groupId: String(body.groupId) }, transaction })) {
						siteProblem(409, 'membership_site_binding_conflict');
					}
					row = await M.resources.create({ id: body.id, domain: url.host, ownerId: body.ownerId,
						groupId: String(body.groupId), postsEnabled: false, data: {} }, { transaction });
					await M.options.bulkCreate(['month', 'halfyear'].map((period, i) => ({ id: randomUUID(), resourceId: row.id,
						period, label: i ? '6 months' : '1 month', amountCents: i ? 2000 : 400, currency: 'USD', enabled: true, version: 1 })), { transaction });
				}
				return write(row, body, transaction);
			});
		}
	};
}
