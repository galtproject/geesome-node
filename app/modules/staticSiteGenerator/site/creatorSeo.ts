import {parseFragment} from 'parse5';

export type CreatorSeo = {title?: string; description?: string; postTitleTemplate?: string; postDescriptionTemplate?: string; imageUrl?: string; imageAlt?: string; faviconUrl?: string; adult?: boolean};

/** Bounded owner data; never accept arbitrary tags, scripts or credentialed URLs. */
export function normalizeCreatorSeo(value: unknown): CreatorSeo {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.keys(value).some(key => !['title','description','postTitleTemplate','postDescriptionTemplate','imageUrl','imageAlt','faviconUrl','adult'].includes(key))) {
        throw new Error('membership_seo_invalid');
    }
    const result: CreatorSeo = {};
    for (const [key, limit] of [['title',200],['description',500],['postTitleTemplate',200],['postDescriptionTemplate',500],['imageAlt',300],['imageUrl',2048],['faviconUrl',2048]] as const) {
        const item = value[key];
        if (item === undefined) {
            continue;
        }
        if (typeof item !== 'string' || !item.trim() || item.length > limit || /[\u0000-\u001f]/.test(item)) {
            throw new Error('membership_seo_invalid');
        }
        if (key.endsWith('Template') && /\{[^{}]*\}/g.test(item.replace(/\{(?:siteTitle|postTitle|postDescription)\}/g, ''))) {
            throw new Error('membership_seo_invalid');
        }
        if (key.endsWith('Url') && !publicImageUrl(item, 'https://creator.invalid')) {
            throw new Error('membership_seo_invalid');
        }
        result[key] = item.trim();
    }
    if ('adult' in value) {
        if (typeof value.adult !== 'boolean') {
            throw new Error('membership_seo_invalid');
        }
        result.adult = value.adult;
    }
    return result;
}

export function publicImageUrl(value: unknown, origin: string) {
    if (typeof value !== 'string' || /[\s\\]/.test(value) || (!value.startsWith('/') && !value.startsWith('https://')) || value.startsWith('//')) {
        return '';
    }
    try {
        const url = new URL(value, origin);
        return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch {
        return '';
    }
}

export function plainDescription(value: unknown, limit = 200) {
    const root = parseFragment(String(value || ''));
    function read(node): string {
        if (['script','style'].includes(node.tagName)) {
            return '';
        }
        return node.nodeName === '#text' ? node.value : (node.childNodes || []).map(read).join(' ');
    }
    return read(root).replace(/\s+/g, ' ').trim().slice(0, limit);
}

/** Receives public teasers, never full membership text or attachment URLs. */
export function creatorMetadata(site, posts, single = false) {
    const seo: CreatorSeo = site.brand?.seo || {};
    const brand = plainDescription(site.brand?.displayTitle || site.title, 200);
    const origin = `https://${site.domain || 'creator.invalid'}`;
    const path = site.canonicalPath || '/';
    const canonical = new URL(path, origin).href;
    const post = single ? posts[0] : null;
    const postTitle = plainDescription(post?.title, 200) || (post ? 'Post ' + post.id : '');
    const postDescription = plainDescription(post?.teaser) || plainDescription(seo.description || site.description)
        || (post ? `Read ${postTitle} by ${brand}.` : `Explore the latest posts and membership updates from ${brand}.`);
    const values = {siteTitle:brand, postTitle, postDescription};
    const applyTemplate = (template: string, limit: number) => plainDescription(template, 500).replace(/\{(siteTitle|postTitle|postDescription)\}/g, (_match, key) => values[key]).replace(/\s+/g, ' ').trim().slice(0, limit);
    const title = post ? applyTemplate(seo.postTitleTemplate || '{siteTitle} — {postTitle}', 200)
        : path === '/account/' ? `Account — ${brand}`
        : path.startsWith('/page/') ? `Archive ${path.split('/')[2]} — ${brand}` : plainDescription(seo.title, 200) || brand;
    const description = post ? applyTemplate(seo.postDescriptionTemplate || '{postDescription}', 500) : postDescription;
    const image = publicImageUrl(post?.socialImageUrl, origin) || publicImageUrl(seo.imageUrl, origin)
        || publicImageUrl(site.brand?.avatarUrl, origin) || publicImageUrl(site.brand?.coverUrl, origin);
    const favicon = publicImageUrl(seo.faviconUrl || site.brand?.avatarUrl, origin);
    const headers: [string, Record<string,string>][] = [
        ['link',{rel:'canonical',href:canonical}],
        ['meta',{name:'description',content:description}],
        ...Object.entries({'og:title':title,'og:description':description,'og:type':post ? 'article' : 'website','og:url':canonical,'og:site_name':brand})
            .map(([property,content]): [string,Record<string,string>] => ['meta',{property,content}]),
        ['meta',{name:'twitter:card',content:image ? 'summary_large_image' : 'summary'}],
        ['meta',{name:'twitter:title',content:title}],
        ['meta',{name:'twitter:description',content:description}],
    ];
    if (image) {
        const alt = publicImageUrl(post?.socialImageUrl, origin) ? postTitle : plainDescription(seo.imageAlt, 300) || `${brand} — social preview`;
        headers.push(['meta',{property:'og:image',content:image}],['meta',{property:'og:image:alt',content:alt}],
            ['meta',{name:'twitter:image',content:image}],['meta',{name:'twitter:image:alt',content:alt}]);
    }
    if (seo.adult) {
        headers.push(['meta',{name:'rating',content:'adult'}]);
    }
    const structuredData = {'@context':'https://schema.org','@type':post ? 'BlogPosting' : path === '/' ? 'WebSite' : 'WebPage',
        ...(post ? {headline:plainDescription(post.title, 200) || title, author:{'@type':'Person',name:brand}} : {name:title}),
        url:canonical,description,...(image ? {image} : {})};
    return {title,headers,favicon,structuredData};
}

export function creatorSitemap(domain: string, paths: string[]) {
    const xml = (value: string) => value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
    return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        + paths.map(path => `<url><loc>${xml(`https://${domain}/${path.replace(/index\.html$/, '')}`)}</loc></url>`).join('') + '</urlset>\n';
}
