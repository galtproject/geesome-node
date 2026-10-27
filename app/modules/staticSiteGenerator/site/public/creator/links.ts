export function safeCreatorUrl(value) {
    try {
        const url = new URL(value, 'https://creator.invalid');
        if (!['http:', 'https:'].includes(url.protocol)) {
            return '';
        }
        return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')
            ? url.pathname + url.search + url.hash : url.origin === 'https://creator.invalid' ? '' : url.href;
    }
    catch {
        return '';
    }
}
export function creatorLinks(values) {
    return (Array.isArray(values) ? values : []).slice(0, 30).map(item => ({ label: String(item?.label || '').slice(0, 100), url: safeCreatorUrl(item?.url), ...(/^\/ipfs\/[A-Za-z0-9]{20,200}$/.test(item?.iconUrl || '') ? {iconUrl: item.iconUrl} : {}) }))
        .filter(item => item.label && item.url);
}
