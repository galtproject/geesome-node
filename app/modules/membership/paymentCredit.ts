import {siteProblem} from '../api/browserSession.js';

const months = {month: 1, halfyear: 6, year: 12};

export function periodEnd(start: Date, period: string, anchorDay = start.getUTCDate()) {
	if (!Object.hasOwn(months, period)) {
		siteProblem(409, 'payment_period_invalid');
	}
	return monthEnd(start, months[period], anchorDay);
}

/** Quotes and eligible tariffs are frozen before funds arrive. Never use live prices here. */
export function paymentCredit(start: Date, anchorDay: number, selected, payment?) {
	const baseEnd = periodEnd(start, selected.period, anchorDay);
	if (!payment) {
		return {endsAt: baseEnd, optionId: selected.id, optionLabel: selected.label, period: selected.period, extraDays: 0, renewalAnchorDay: anchorDay};
	}
	const received = BigInt(payment.amountAtomic);
	let best = {endsAt: baseEnd, optionId: selected.id, optionLabel: selected.label, period: selected.period, extraDays: 0, renewalAnchorDay: anchorDay};
	for (const option of payment.options) {
		const due = BigInt(option.amountAtomic);
		if (due <= 0n || received < due || !Object.hasOwn(months, option.period) || months[option.period] < months[selected.period]) {
			continue;
		}
		const scaledMonths = received * BigInt(months[option.period]);
		const whole = scaledMonths / due, remainder = scaledMonths % due;
		// Refuse unrepresentable dates rather than silently issuing an invalid entitlement.
		if (whole > 100000n) {
			throw Error('crypto_credit_duration_out_of_range');
		}
		const end = monthEnd(start, Number(whole), anchorDay);
		const next = monthEnd(start, Number(whole) + 1, anchorDay);
		end.setTime(end.getTime() + Number(BigInt(next.getTime() - end.getTime()) * remainder / due));
		if (end > best.endsAt || (end.getTime() === best.endsAt.getTime() && months[option.period] > months[best.period])) {
			best = {endsAt: end, optionId: option.id, optionLabel: option.label, period: option.period,
				renewalAnchorDay: end.getUTCDate() === Math.min(anchorDay, new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate()) ? anchorDay : end.getUTCDate(),
				extraDays: (end.getTime() - periodEnd(start, option.period, anchorDay).getTime()) / 86400000};
		}
	}
	return best;
}

function monthEnd(start: Date, count: number, anchorDay: number) {
	const date = new Date(start);
	date.setUTCDate(1);
	date.setUTCMonth(date.getUTCMonth() + count);
	date.setUTCDate(Math.min(anchorDay, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()));
	return date;
}
