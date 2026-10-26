import { atomicQuote } from './cryptoAmounts.js';
// Each invoice can spend only its own receipts, even when later invoices share its address.
export function nativeTransferValue(received: bigint, spent: bigint, requested: bigint, fee: bigint) {
	const remaining = received - spent - fee;
	return requested < remaining ? requested : remaining;
}
export function minimumSwapOutput(reserveCents: bigint, nativePrice: string, slippagePercent: number) {
	return ((BigInt(atomicQuote(Math.max(1, Number(reserveCents)), nativePrice, 18)) *
		BigInt(Math.round((100 - slippagePercent) * 100))) /
		10000n);
}
