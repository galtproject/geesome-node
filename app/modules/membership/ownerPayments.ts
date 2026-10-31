import {Op} from 'sequelize';

const invoiceFields = ['id', 'resourceId', 'readerId', 'optionSnapshot', 'status', 'paidAt', 'createdAt', 'providerId'];
const refundFields = ['id', 'resourceId', 'readerId', 'invoiceId', 'reason', 'decisionReason', 'decidedBy', 'status', 'createdAt', 'updatedAt'];
const periodFields = ['invoiceId', 'startsAt', 'endsAt', 'revoked'];

/** Owner-only projections. Related records must never widen the selected resource. */
export function ownerPayments(M, identities, resource) {
	const page = (input) => ({limit: 50, offset: Math.max(0, Math.min(100000, Math.trunc(Number(input.offset) || 0)))});
	async function context(id, invoices, readerIds) {
		const invoiceIds = invoices.map(row => row.id);
		const [crypto, periods, readers] = await Promise.all([
			M.crypto_invoices.findAll({where: {resourceId: id, id: {[Op.in]: invoiceIds}}, attributes: ['id', 'snapshot']}),
			M.periods.findAll({where: {resourceId: id, invoiceId: {[Op.in]: invoiceIds}}, attributes: periodFields}),
			identities.findAll({where: {id: {[Op.in]: [...new Set(readerIds)]}}, attributes: ['id', 'name']})
		]);
		const byId = rows => new Map(rows.map(row => [row.id, row]));
		return {crypto: byId(crypto), periods: new Map(periods.map(row => [row.invoiceId, pick(row, periodFields)])),
			readers: new Map(readers.map(row => [row.id, pick(row, ['id', 'name'])]))};
	}
	function invoice(row, related) {
		const crypto = related.crypto.get(row.id);
		return {...pick(row, invoiceFields.filter(field => !['providerId', 'optionSnapshot'].includes(field))),
			optionSnapshot: pick(row.optionSnapshot || {}, ['id', 'label', 'amountCents', 'currency', 'period', 'version', 'enabled']),
			provider: String(row.providerId || '').startsWith('direct:') ? 'direct' : 'legacy',
			...(crypto ? {crypto: {network: crypto.snapshot?.network || null}} : {}),
			reader: related.readers.get(row.readerId) || null, period: related.periods.get(row.id) || null};
	}
	return {
		async ownerInvoices(id, input: any = {}) {
			await resource(id);
			const rows = await M.invoices.findAll({where: {resourceId: id}, order: [['createdAt', 'DESC'], ['id', 'DESC']],
				...page(input), attributes: invoiceFields});
			const related = await context(id, rows, rows.map(row => row.readerId));
			return rows.map(row => invoice(row, related));
		},
		async ownerRefunds(id, input: any = {}) {
			await resource(id);
			const rows = await M.refunds.findAll({where: {resourceId: id}, order: [['createdAt', 'DESC'], ['id', 'DESC']],
				...page(input), attributes: refundFields});
			const invoices = await M.invoices.findAll({where: {resourceId: id, id: {[Op.in]: rows.map(row => row.invoiceId)}}, attributes: invoiceFields});
			const related = await context(id, invoices, rows.map(row => row.readerId));
			const byId = new Map(invoices.map(row => [row.id, invoice(row, related)]));
			return rows.map(row => ({...pick(row, refundFields), invoice: byId.get(row.invoiceId) || null,
				period: related.periods.get(row.invoiceId) || null, reader: related.readers.get(row.readerId) || null}));
		}
	};
}

function pick(row, fields) {
	return Object.fromEntries(fields.map(field => [field, row[field]]));
}
