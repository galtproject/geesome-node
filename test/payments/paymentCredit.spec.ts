import test from 'node:test';
import assert from 'node:assert/strict';
import {paymentCredit, periodEnd} from '../../app/modules/membership/paymentCredit.js';

const start = new Date('2026-01-31T12:00:00Z');
const selected = {id: 'month', label: '1 month', period: 'month'};
const options = [{...selected, amountAtomic: '4000000'}, {id: 'halfyear', label: '6 months', period: 'halfyear', amountAtomic: '20000000'}];
test('credit preserves calendar anchors and selects the longer affordable frozen tariff', () => {
	assert.equal(paymentCredit(start, 31, selected).endsAt.toISOString(), '2026-02-28T12:00:00.000Z');
	const credit = paymentCredit(start, 31, selected, {amountAtomic: '20000000', options});
	assert.equal(credit.optionId, 'halfyear');
	assert.equal(credit.endsAt.toISOString(), '2026-07-31T12:00:00.000Z');
	assert.equal(credit.extraDays, 0);
});
test('credit converts excess to exact proportional calendar time without float amount arithmetic', () => {
	const credit = paymentCredit(start, 31, selected, {amountAtomic: '6000000', options});
	assert.equal(credit.endsAt.toISOString(), '2026-03-16T00:00:00.000Z');
	assert.equal(credit.extraDays, 15.5);
	assert.equal(periodEnd(credit.endsAt, 'month', credit.renewalAnchorDay).toISOString(), '2026-04-16T00:00:00.000Z');
	const tiny = paymentCredit(start, 31, selected, {amountAtomic: '4000001', options});
	assert.equal(tiny.renewalAnchorDay, 31);
	assert.equal(tiny.endsAt.getTime() - paymentCredit(start, 31, selected).endsAt.getTime(), 669);
});
test('credit never reduces time at a badly priced longer tariff and handles repeated calendar months', () => {
	const credit = paymentCredit(start, 31, selected, {amountAtomic: '30000000', options: [options[0], {...options[1], amountAtomic: '30000000'}]});
	assert.equal(credit.optionId, 'month');
	assert.equal(credit.endsAt.toISOString(), '2026-09-15T12:00:00.000Z');
	assert.throws(() => paymentCredit(start, 31, selected, {amountAtomic: '9'.repeat(90), options}), /duration_out_of_range/);
});
