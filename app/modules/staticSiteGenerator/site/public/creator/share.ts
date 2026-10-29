export function publicPostShareUrl(id: string | number, domain: string | undefined, fallback: string, base: string) {
    if (domain && /^[a-z0-9.-]+$/i.test(domain)) {
        // The selector works before and after domain cutover and never shares a paid CID.
        return `https://${domain}/api/v1/membership/site/posts/${encodeURIComponent(id)}/`;
    }
    return new URL(fallback, base).href;
}

export async function copyPostLink(url: string, browser: Pick<Navigator, 'clipboard'>): Promise<boolean> {
    try {
        await browser.clipboard.writeText(url);
        return true;
    } catch {
        return false;
    }
}
