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

// Presentation only: recognize precisely the legacy publisher's own domain/date title.
export function postHeading(title: string, domain?: string) {
    const match = /^([a-z0-9.-]+) - (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/i.exec(title);
    if (!match || !domain || match[1].toLowerCase() !== domain.toLowerCase()) {
        return {title, dateOnly: false};
    }
    const value = new Date(`${match[2]}T${match[3]}Z`);
    if (!Number.isFinite(value.getTime()) || value.toISOString().slice(0,19) !== `${match[2]}T${match[3]}`) {
        return {title, dateOnly: false};
    }
    return {title: date(value.toISOString()), dateOnly: true};
}
