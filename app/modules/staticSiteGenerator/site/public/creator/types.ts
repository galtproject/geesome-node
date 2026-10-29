import type {CryptoMethod, CryptoInvoice} from './crypto.ts';
export interface MembershipOption {
    id?: string; label?: string; amountCents?: number; amountMinor?: number;
    currency?: string; period?: string; periodUnit?: string;
}
export interface CreatorLink {label: string; url: string; iconUrl?: string}
export interface PreviewMedia {url: string; alt?: string}
export interface Attachment {url?: string; mime: string; name?: string; text?: string; view?: string}
export interface CreatorPost {
    id: string | number; title: string; description?: string; publishedAt?: string;
    previews: PreviewMedia[]; attachments?: Attachment[]; free?: boolean; locked?: boolean;
    pageUrl?: string; postPath?: string;
}
export interface CreatorResource {
    id: string; title: string; domain?: string; description?: string; postsEnabled: boolean;
    coverUrl?: string; avatarUrl?: string; links?: CreatorLink[]; legalLinks?: CreatorLink[];
    patreonUrl?: string; options?: MembershipOption[]; cryptoMethods?: CryptoMethod[];
    publicBasePath?: string; e2eMockAuth?: boolean;
}
export interface MembershipInvoice {
    id: string; provider: string; status: string; amountMinor?: number; priceMinor?: number;
    currency?: string; createdAt?: string; optionSnapshot?: MembershipOption; crypto?: CryptoInvoice;
}
export interface MembershipRefund {invoiceId: string; status: string}
export interface MembershipAccount {
    reader: {id?: string; name?: string; email?: string}; active: boolean;
    activeUntil?: string; expiresAt?: string; expired?: boolean;
    invoices: MembershipInvoice[]; refunds: MembershipRefund[];
}
export interface PublicState {
    resource: CreatorResource; posts: CreatorPost[]; nextOffset: number | null; path: string;
    snapshot: {canonicalPath?: string; full: boolean; entryPath: string; homePath: string; accountPath: string; nextPage?: string; navigation?: {newer?: string; older?: string; home: string}};
}
