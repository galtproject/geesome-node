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

// Keep authored names; expand technical host labels from imported profiles.
export function socialLabel(label: string, url: string) {
    try {
        const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
        const names: Record<string, string> = {'ko-fi.com': 'Ko-fi', 'x.com': 'X', 'twitter.com': 'X',
            'discord.gg': 'Discord', 'discord.com': 'Discord', 'bsky.app': 'Bluesky', 't.me': 'Telegram',
            'telegram.me': 'Telegram', 'patreon.com': 'Patreon', 'youtube.com': 'YouTube', 'youtu.be': 'YouTube',
            'instagram.com': 'Instagram', 'twitch.tv': 'Twitch', 'boosty.to': 'Boosty'};
        const name = names[host];
        if (name && (!label.trim() || label.toLowerCase().replace(/^www\./, '') === host || label.toLowerCase() === name.toLowerCase())) {
            return name;
        }
    } catch {
        // Invalid destinations are filtered separately by safeSiteUrl.
    }
    return label;
}
