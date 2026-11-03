import type {MembershipAccount} from './types.ts';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const lifetime = 5 * 60 * 1000;
const key = (resource: string) => `membership:activation:${resource}`;
function browserStore(): Store | null {
    try {
        return typeof sessionStorage === 'undefined' ? null : sessionStorage;
    }
    catch {
        return null;
    }
}
export function rememberActivation(resource: string, reader: string, invoice: string, now = Date.now(), store = browserStore()) {
    try {
        store?.setItem(key(resource), JSON.stringify({reader, invoice, createdAt: now}));
    }
    catch {
        // Private storage restrictions must never prevent the access transition.
    }
}
export function takeActivation(resource: string, account: MembershipAccount, now = Date.now(), store = browserStore()): string | null {
    try {
        const raw = store?.getItem(key(resource));
        if (!raw) {
            return null;
        }
        store!.removeItem(key(resource));
        const value = JSON.parse(raw);
        if (!account.active || value.reader !== account.reader.id || !Number.isFinite(value.createdAt)
            || now < value.createdAt || now - value.createdAt > lifetime
            || !account.invoices.some(invoice => invoice.id === value.invoice && invoice.status === 'paid')) {
            return null;
        }
        return value.invoice;
    }
    catch {
        return null;
    }
}
