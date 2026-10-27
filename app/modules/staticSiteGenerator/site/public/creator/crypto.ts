import qrcode from 'qrcode-generator';
export interface CryptoMethod {
    id: string;
    currency: string;
    network: string;
    networkLabel: string;
    available: boolean;
}
export interface CryptoInvoice {
    id: string;
    provider: 'direct';
    status: string;
    assetId: string;
    address: string;
    amount: string;
    received: string;
    expiresAt: string;
    priceUsd: number;
    optionLabel: string;
    period: string;
    currency: string;
    network: string;
    lastError?: string | null;
    monitoringUntil?: string;
}
export const cryptoStatusText: Record<string, string> = { refunded: 'Refund completed. Access from this payment has been revoked.', pending: 'Waiting for payment', confirming: 'Payment detected — waiting for network finality', paid: 'Payment confirmed. Your archive access is ready.', underpaid: 'Partial payment received. Send the remaining amount before expiry.', expired: 'Quote expired. Do not send another payment. Received funds need author review.', late_payment: 'Late payment received. The author must review it before granting access.' };
// The QR carries the exact receiving address. Amount and network remain explicit beside it;
// wallet-specific token URI handling is inconsistent, so never imply a token URI is universal.
export function addressQr(address: string): string { const qr = qrcode(0, 'M'); qr.addData(address); qr.make(); return qr.createDataURL(5, 4); }
export function remainingAmount(amount: string, received: string): string {
    const places = Math.max(amount.split('.')[1]?.length || 0, received.split('.')[1]?.length || 0);
    const atomic = (value: string) => { if (!/^\d+(\.\d+)?$/.test(value)) {
        throw Error('Invalid payment amount');
    } const [whole, fraction = ''] = value.split('.'); return BigInt(whole + fraction.padEnd(places, '0')); };
    const remaining = atomic(amount) - atomic(received);
    const units = (remaining > 0n ? remaining : 0n).toString().padStart(places + 1, '0');
    return places ? `${units.slice(0, -places)}.${units.slice(-places)}` : units;
}
// Round the payable value upward using decimal strings so copying it cannot underpay.
// Bitcoin retains satoshi precision; five places would materially overcharge small invoices.
export function paymentAmount(value: string, currency: string): string {
    if (!/^\d+(\.\d+)?$/.test(value)) {
        throw Error('Invalid payment amount');
    }
    const places = currency === 'BTC' ? 8 : 5;
    const [whole, fraction = ''] = value.split('.');
    const units = BigInt(whole + fraction.slice(0, places).padEnd(places, '0')) + (/[1-9]/.test(fraction.slice(places)) ? 1n : 0n);
    const digits = units.toString().padStart(places + 1, '0');
    return `${digits.slice(0, -places)}.${digits.slice(-places)}`.replace(/\.?0+$/, '') || '0';
}
