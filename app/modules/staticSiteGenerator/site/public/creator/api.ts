export const membershipPrefix = '/api/v1';
export async function membershipRequest(path: string, body?: any) {
    const input = new URL(path, 'https://creator.invalid');
    const routes: Record<string, string> = { '/auth/challenge': '/login/google/challenge', '/auth/google': '/login/google', '/auth/logout': '/browser-session/logout' };
    const target = routes[input.pathname] || (input.pathname.startsWith('/crypto/') ? '/payments' + input.pathname : '/membership' + input.pathname);
    const payload = body ? Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'resource')) : undefined;
    const response = await fetch(membershipPrefix + target, { method: payload ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', headers: payload ? { 'Content-Type': 'application/json' } : undefined, body: payload ? JSON.stringify(payload) : undefined });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw Object.assign(new Error(data.message || data.code || 'Request failed. Please try again.'), { status: response.status });
    }
    return data;
}
export function newRequestKey() {
    if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    // getRandomValues remains available on local HTTP test hosts without secure-context randomUUID.
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function safeExternalUrl(value: unknown): string | null {
    try {
        const url = new URL(String(value));
        return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
    }
    catch {
        return null;
    }
}
// Public API links may be relative to the creator-site origin, including in SSR.
export function safeSiteUrl(value: unknown): string | null {
    if (typeof value === 'string' && /^(?:\.\.?\/|#)/.test(value)) {
        try {
            const url = new URL(value, 'https://snapshot.invalid/root/index.html');
            return url.origin === 'https://snapshot.invalid' ? value : null;
        }
        catch {
            return null;
        }
    }
    if (typeof value !== 'string' || !value.startsWith('/')) {
        return safeExternalUrl(value);
    }
    try {
        const url = new URL(value, 'https://creator-site.invalid');
        return url.origin === 'https://creator-site.invalid' ? url.pathname + url.search + url.hash : null;
    }
    catch {
        return null;
    }
}
export function money(amount: number = 0, currency = 'USD') { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount / 100); }
export const accessPeriodLabel = (period: string = '') => period === 'halfyear' ? '6 months' : period === 'month' ? '1 month' : period === 'year' ? '1 year' : period;
