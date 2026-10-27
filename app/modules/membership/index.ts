import { randomUUID, createHash } from 'node:crypto';
import { CorePermissionName } from '../database/interface.js';
import { siteProblem } from '../api/browserSession.js';
import defineModels from './models.js';
import registerApi from './api.js';
import siteSettings from './siteSettings.js';
import {createPublicationDelivery} from './publication.js';
import registerPublicationApi from './publicationApi.js';
export default async function (app) {
	app.checkModules(['database', 'api', 'group', 'googleAuthorization', 'payments']);
	const module = createMembership(app, await defineModels(app.ms.database.sequelize));
	app.ms.payments.configureLedger({ models: module.models, resource: module.resource, serial: module.serial,
		grantPaidInvoice: module.grantPaidInvoice, clock: module.clock, fail: siteProblem });
	registerApi(app, module);
	registerPublicationApi(app, module);
	module.startPublications();
	app.ms.payments.startWorkers();
	return module;
}
export function createMembership(app, models, dependencies: any = {}) {
	const clock = dependencies.clock || (() => new Date());
	const sequelize = app.ms.database.sequelize;
	const M = { ...app.ms.payments.models, ...models };
	async function resource(id, transaction?) {
		const row = await M.resources.findByPk(id, { transaction, ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}) });
		if (!row) {
			siteProblem(404, 'resource_not_configured');
		}
		return row;
	}
	async function serial(id, work) {
		return sequelize.transaction(async (transaction) => work(await resource(id, transaction), transaction));
	}
	async function group(row) {
		const value = await app.ms.group.getLocalGroup(row.ownerId, row.groupId);
		if (!value || String(value.id) !== row.groupId || value.creatorId !== row.ownerId
			|| value.isPublic !== false || value.isEncrypted === true || value.isDeleted) {
			siteProblem(409, 'membership_group_invalid');
		}
		return value;
	}
	async function entitlement(readerId, id, transaction?) {
		if (!readerId) {
			return { active: false, expiresAt: null };
		}
		const periods = await M.periods.findAll({ where: { readerId, resourceId: id, revoked: false }, order: [['startsAt', 'ASC']], transaction });
		const now = clock();
		let end: Date | null = null;
		for (const period of periods) {
			const start = new Date(period.startsAt), finish = new Date(period.endsAt);
			if ((!end && start <= now && finish > now) || (end && start <= end && finish > end)) {
				end = finish;
			}
		}
		return { active: Boolean(end), expiresAt: end };
	}
	async function grantPaidInvoice(invoiceId, transaction) {
		const invoice = await M.invoices.findByPk(invoiceId, { transaction, lock: transaction.LOCK.UPDATE });
		if (!invoice) {
			siteProblem(404, 'invoice_not_found');
		}
		if (['paid', 'refunded'].includes(invoice.status) || await M.periods.findOne({ where: { invoiceId }, transaction })) {
			return;
		}
		const prior = await M.periods.findAll({ where: { resourceId: invoice.resourceId, readerId: invoice.readerId, revoked: false }, order: [['endsAt', 'DESC']], transaction });
		const continuing = prior.length && new Date(prior[0].endsAt) > clock();
		const start = continuing ? new Date(prior[0].endsAt) : clock();
		const anchorDay = continuing ? prior[0].anchorDay : start.getUTCDate();
		await M.periods.create({ id: randomUUID(), resourceId: invoice.resourceId, readerId: invoice.readerId, invoiceId,
			anchorDay, startsAt: start, endsAt: periodEnd(start, invoice.optionSnapshot.period, anchorDay), revoked: false }, { transaction });
		await invoice.update({ status: 'paid', paidAt: clock() }, { transaction });
	}
	async function owner(userId, id) {
		await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
		const row = await resource(id);
		if (row.ownerId !== userId) {
			siteProblem(403, 'owner_required');
		}
		await group(row);
		return row;
	}
	async function publicResource(id) {
		const row = await resource(id);
		const value = await group(row);
		return { id: row.id, domain: row.domain, title: value.title, description: value.description,
			postsEnabled: row.postsEnabled, ...publicBrand(row.data),
			options: await M.options.findAll({ where: { resourceId: id, enabled: true }, order: [['amountCents', 'ASC']] }),
			cryptoMethods: await app.ms.payments.engine.methods(id) };
	}
	async function project(row, post, active, publication) {
		if (!post || String(post.groupId) !== row.groupId || post.isDeleted || post.status !== 'published') {
			siteProblem(404, 'post_not_found');
		}
		const metadata = JSON.parse(post.propertiesJson || '{}').membership;
		if (!metadata || metadata.hidden === true) {
			return null;
		}
		const previewCount = Math.max(1, Math.min(10, Number(metadata.previewCount) || 1));
		// Public preview selection is explicit; never fall back to full attachments.
		const protectedPath = publication ? `/api/v1/membership/site/posts/${post.id}/` : null;
		const previews = publication ? publication.posts.find(item => item.id === String(post.id))?.previews || [] : (Array.isArray(metadata.previewMedia) ? metadata.previewMedia : []).slice(0, previewCount)
			.map(item => safePageUrl(item.url, row.domain)).filter(Boolean);
		return { id: String(post.id), title: String(metadata.title || '').slice(0, 500), description: String(metadata.free === true || active ? metadata.fullText ?? metadata.description ?? '' : metadata.teaser ?? metadata.description ?? '').slice(0, 10000),
			previews, previewCount, free: metadata.free === true, locked: metadata.free !== true && !active,
			publishedAt: post.publishedAt, ...(metadata.free === true || active ? { pageUrl: protectedPath ? `https://${row.domain}${protectedPath}` : safePageUrl(metadata.pageUrl, row.domain) } : {}) };
	}
	const module = {
		models, clock, resource, serial, entitlement, grantPaidInvoice, owner, publicResource,
		async feed(id, readerId, input: any = {}) {
			const row = await resource(id);
			await group(row);
			if (!row.postsEnabled) {
				siteProblem(404, 'posts_disabled');
			}
			const limit = Math.max(1, Math.min(50, Math.trunc(Number(input.limit) || 10)));
			const offset = Math.max(0, Math.min(100000, Math.trunc(Number(input.offset) || 0)));
			const response = await app.ms.group.getGroupPosts(row.groupId, { status: 'published' }, { limit: limit + 1, offset, sortBy: 'publishedAt', sortDir: 'desc' });
			const active = (await entitlement(readerId, id)).active;
			const posts = response.posts || response.list || [];
			const publication = await module.publicationView(id);
			return { posts: (await Promise.all(posts.slice(0, limit).map(post => project(row, post, active, publication)))).filter(Boolean), hasMore: posts.length > limit,
				nextOffset: posts.length > limit ? offset + limit : null };
		},
		async post(id, postId, readerId) {
			const row = await resource(id);
			await group(row);
			if (!row.postsEnabled || !/^[1-9][0-9]*$/.test(String(postId))) {
				siteProblem(404, 'post_not_found');
			}
			const result = await project(row, await app.ms.group.getPostPure(postId), (await entitlement(readerId, id)).active, await module.publicationView(id));
			if (!result) {
				siteProblem(404, 'post_not_found');
			}
			return result;
		},
		async account(id, reader, offset = 0) {
			await resource(id);
			if (!reader) {
				return { reader: null, active: false, expiresAt: null, invoices: [], refunds: [] };
			}
			const where = { resourceId: id, readerId: reader.id };
			const invoices = await M.invoices.findAll({ where, order: [['createdAt', 'DESC']], limit: 50, offset: Math.max(0, Math.min(100000, Math.trunc(Number(offset) || 0))) });
			return { reader, ...await entitlement(reader.id, id), invoices: invoices.map(invoice => ({ id: invoice.id, optionSnapshot: invoice.optionSnapshot,
					status: invoice.status, paidAt: invoice.paidAt, createdAt: invoice.createdAt, provider: String(invoice.providerId).startsWith('direct:') ? 'direct' : 'legacy' })),
				refunds: await M.refunds.findAll({ where, order: [['createdAt', 'DESC']], limit: 50, attributes: ['id', 'invoiceId', 'status', 'createdAt'] }) };
		},
		async ownerInvoices(id, input: any = {}) {
			await resource(id);
			return M.invoices.findAll({ where: { resourceId: id }, order: [['createdAt', 'DESC']], limit: 50,
				offset: Math.max(0, Math.min(100000, Math.trunc(Number(input.offset) || 0))),
				attributes: ['id', 'readerId', 'optionSnapshot', 'status', 'paidAt', 'createdAt'] });
		},
		async ownerRefunds(id, input: any = {}) {
			await resource(id);
			return M.refunds.findAll({ where: { resourceId: id }, order: [['createdAt', 'DESC']], limit: 50,
				offset: Math.max(0, Math.min(100000, Math.trunc(Number(input.offset) || 0))) });
		},
		async saveOption(id, body) {
			if (!Number.isInteger(body.amountCents) || body.amountCents < 100 || body.amountCents > 100000
				|| !['month', 'halfyear', 'year'].includes(body.period) || typeof body.label !== 'string' || !body.label.trim()) {
				siteProblem(400, 'option_invalid');
			}
			return serial(id, async (_row, transaction) => {
				const values = { label: body.label.slice(0, 200), amountCents: body.amountCents, currency: 'USD', period: body.period, enabled: body.enabled !== false };
				if (!body.id) {
					return M.options.create({ id: randomUUID(), resourceId: id, ...values, version: 1 }, { transaction });
				}
				const option = await M.options.findOne({ where: { id: body.id, resourceId: id }, transaction, lock: transaction.LOCK.UPDATE });
				if (!option) {
					siteProblem(404, 'option_not_found');
				}
				if (body.version !== option.version) {
					siteProblem(409, 'option_version_conflict');
				}
				return option.update({ ...values, version: option.version + 1 }, { transaction });
			});
		}
	};
	Object.assign(module, siteSettings(app, M, group, owner, publicBrand));
	Object.assign(module, createPublicationDelivery(app, M, module, dependencies));
	Object.assign(module, refundMethods(M, serial, entitlement, clock));
	return module as typeof module & ReturnType<typeof createPublicationDelivery> & ReturnType<typeof refundMethods> & ReturnType<typeof siteSettings>;
}
export function periodEnd(start: Date, period: string, anchorDay = start.getUTCDate()) {
	if (!['month', 'halfyear', 'year'].includes(period)) {
		siteProblem(409, 'payment_period_invalid');
	}
	const date = new Date(start);
	date.setUTCDate(1);
	date.setUTCMonth(date.getUTCMonth() + (period === 'year' ? 12 : period === 'halfyear' ? 6 : 1));
	date.setUTCDate(Math.min(anchorDay, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()));
	return date;
}
function safePageUrl(value, domain) {
	try {
		const url = new URL(value);
		return url.origin === `https://${domain}` && !url.username && !url.password && /^\/ipfs\/[A-Za-z0-9]+(?:\/|$)/.test(url.pathname) ? url.href : null;
	}
	catch {
		return null;
	}
}
function publicBrand(value = {}) {
	return Object.fromEntries(['coverUrl', 'avatarUrl', 'links', 'patreonUrl', 'legalLinks'].filter(key => value[key] !== undefined).map(key => [key, value[key]]));
}
function refundMethods(M, serial, entitlement, clock) {
	async function requestRefund(id: string, readerId: string, invoiceId: string, requestKey: string, reason: string) {
		return serial(id, async (_r, t) => {
			const k = createHash('sha256').update(`${readerId}:${id}:${key(requestKey)}`).digest('hex');
			const old = await M.refunds.findOne({ where: { requestKey: k }, transaction: t });
			if (old) {
				if (old.invoiceId !== invoiceId) {
					siteProblem(409, 'idempotency_conflict');
				}
				return old;
			}
			if (!(await entitlement(readerId, id, t)).active) {
				siteProblem(403, 'active_subscription_required');
			}
			const i = await M.invoices.findOne({ where: { id: invoiceId, resourceId: id, readerId, status: 'paid' }, transaction: t });
			if (!i) {
				siteProblem(404, 'payment_not_refundable');
			}
			if (await M.refunds.findOne({ where: { invoiceId }, transaction: t })) {
				siteProblem(409, 'refund_already_requested');
			}
			return M.refunds.create({ id: randomUUID(), resourceId: id, readerId, invoiceId, requestKey: k, reason: String(reason || '').slice(0, 2000), status: 'requested' }, { transaction: t });
		});
	}
	async function decideRefund(id: string, refundId: string, decision: string, reason: string, actor: string) {
		if (!['approve', 'reject'].includes(decision)) {
			siteProblem(400, 'decision_invalid');
		}
		if (!String(reason || '').trim()) {
			siteProblem(400, 'decision_reason_required');
		}
		return serial(id, async (_r, t) => {
			const f = await M.refunds.findOne({ where: { id: refundId, resourceId: id }, transaction: t, lock: t.LOCK.UPDATE });
			if (!f) {
				siteProblem(404, 'refund_not_found');
			}
			if (f.status !== 'requested') {
				return f;
			}
			// Approval never sends funds or revokes access. Commit the manual state atomically.
			return f.update({
				status: decision === 'reject' ? 'rejected' : 'action_required',
				decidedBy: actor,
				decisionReason: String(reason).slice(0, 1800) + (decision === 'approve' ? ' — Manual refund required; no transfer submitted.' : ''),
			}, { transaction: t });
		});
	}
	async function completeCryptoRefund(id: string, refundId: string, txid: string, actor: string) {
		return serial(id, async (_r, t) => {
			const f = await M.refunds.findOne({ where: { id: refundId, resourceId: id }, transaction: t, lock: t.LOCK.UPDATE });
			if (!f) {
				siteProblem(404, 'refund_not_found');
			}
			const i = await M.invoices.findByPk(f.invoiceId, { transaction: t, lock: t.LOCK.UPDATE });
			if (!String(i.providerId || '').startsWith('direct:')) {
				siteProblem(409, 'payment_provider_mismatch');
			}
			if (f.status === 'refunded') {
				return f;
			}
			if (f.status !== 'action_required') {
				siteProblem(409, 'manual_refund_not_approved');
			}
			const c = await M.crypto_invoices.findByPk(i.id, { transaction: t });
			const valid = ['ethereum', 'arbitrum', 'base'].includes(c.snapshot.network) ? /^0x[a-f0-9]{64}$/i : /^[a-f0-9]{64}$/i;
			if (!valid.test(txid)) {
				siteProblem(400, 'refund_transaction_invalid');
			}
			// An owner attestation of an independently executed refund; never initiates a transfer.
			await f.update({ status: 'refunded', decidedBy: actor, decisionReason: String(f.decisionReason || '').slice(0, 1800) + ' Manual refund transaction: ' + txid }, { transaction: t });
			await i.update({ status: 'refunded' }, { transaction: t });
			await c.update({ status: 'refunded' }, { transaction: t });
			await M.periods.update({ revoked: true }, { where: { invoiceId: i.id }, transaction: t });
			return f;
		});
	}
	return { requestRefund, decideRefund, completeCryptoRefund };
}
function key(value) {
	if (typeof value !== 'string' || !value.trim() || value.length > 180) {
		siteProblem(400, 'idempotency_key_required');
	}
	return value;
}
