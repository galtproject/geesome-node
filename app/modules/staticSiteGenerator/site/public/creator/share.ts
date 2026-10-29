export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'manual';

export function publicPostShareUrl(id: string | number, domain: string | undefined, fallback: string, base: string) {
    if (domain && /^[a-z0-9.-]+$/i.test(domain)) {
        // The selector works before and after domain cutover and never shares a paid CID.
        return `https://${domain}/api/v1/membership/site/posts/${encodeURIComponent(id)}/`;
    }
    return new URL(fallback, base).href;
}

export async function shareLink(url: string, title: string, browser: Pick<Navigator, 'share' | 'clipboard'>): Promise<ShareResult> {
    if (browser.share) {
        try {
            await browser.share({url, title});
            return 'shared';
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                return 'cancelled';
            }
        }
    }
    try {
        await browser.clipboard.writeText(url);
        return 'copied';
    } catch {
        return 'manual';
    }
}
