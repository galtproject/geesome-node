export function atomicQuote(cents: number, priceUsd: string, decimals: number) {
	if (!Number.isSafeInteger(cents) ||
		cents <= 0 ||
		!Number.isInteger(decimals) ||
		decimals < 0 ||
		decimals > 18 ||
		!/^\d{1,16}(\.\d{1,12})?$/.test(priceUsd)) {
		throw Error('crypto_quote_invalid');
	}
	const [whole, fraction = ''] = priceUsd.split('.');
	const rate = BigInt(whole) * 10n ** 12n + BigInt(fraction.padEnd(12, '0'));
	if (rate <= 0n) {
		throw Error('crypto_quote_invalid');
	}
	const numerator = BigInt(cents) * 10n ** BigInt(decimals) * 10n ** 12n, denominator = 100n * rate;
	return ((numerator + denominator - 1n) / denominator).toString();
}
export function displayAtomic(value: string, decimals: number) {
	if (!/^\d{1,100}$/.test(value) || !Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
		throw Error('crypto_amount_invalid');
	}
	const n = BigInt(value)
		.toString()
		.padStart(decimals + 1, '0');
	return decimals
		? (n.slice(0, -decimals) + '.' + n.slice(-decimals)).replace(/\.?0+$/, '') || '0'
		: n;
}
export function usdCents(atomic: bigint, price: string, decimals = 18) {
	if (!/^\d+(\.\d{1,12})?$/.test(price)) {
		throw Error('crypto_quote_invalid');
	}
	const [whole, fraction = ''] = price.split('.');
	return ((atomic * (BigInt(whole) * 10n ** 12n + BigInt(fraction.padEnd(12, '0'))) * 100n) /
		(10n ** BigInt(decimals) * 10n ** 12n));
}
