import type {MembershipAccount, MembershipInvoice, MembershipRefund} from './types.ts';
export const date = (value?: string) => value ? new Date(value).toLocaleDateString('en-US', {timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric'}) : '';

// GeeSome's account DTO has one entitlement and one invoice list. Normalize it
// once at the transport boundary so components do not guess response shapes.
export function normalizeAccount(value: {
    reader: MembershipAccount['reader']; active?: boolean; expiresAt?: string; activeUntil?: string;
    invoices?: MembershipInvoice[]; refunds?: MembershipRefund[];
}): MembershipAccount {
    return {reader: value.reader, active: value.active === true, activeUntil: value.expiresAt || value.activeUntil,
        expiresAt: value.expiresAt, invoices: value.invoices || [], refunds: value.refunds || []};
}
