export function publicPostShareUrl(id: string | number, domain: string | undefined, fallback: string, base: string, sectionAlias?: string) {
    if (domain && /^[a-z0-9.-]+$/i.test(domain)) {
        // Share the indexable public page even when reading a member snapshot.
        const section = sectionAlias && /^[a-z0-9-]{1,64}$/.test(sectionAlias) ? sectionAlias + '/' : '';
        return `https://${domain}/${section}posts/${encodeURIComponent(id)}/`;
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
