import {galleryLink} from './publicationLinks.js';
import {safeCreatorUrl, creatorLinks} from './site/public/creator/links.js';
export const membershipBase = '/api/v1/membership/site';

type SnapshotMedia = {url?: string; mime: string; name?: string; text?: string};
type SnapshotPost = {
	id?: string | number; date?: number; title?: string; teaser?: string; fullText?: string;
	free?: boolean; postUrl?: string; media: SnapshotMedia[];
};
type SnapshotSite = {brand?: any; description?: string; resourceId?: string; options?: any[]; title: string; homeUrl?: string; entryPath?: string; postsCount?: number; pageUrls?: string[]};

// The shared renderer receives only the selected variant. Never serialize the
// original snapshot object with both public and full content into site-data.
export function membershipRenderData(site: SnapshotSite, posts: SnapshotPost[], full: boolean, single = false, page = 1, pageCount = 1) {
	const brand = site.brand || {};
	const branding = {description: String(site.description || '').slice(0, 10000), coverUrl: safeCreatorUrl(brand.coverUrl), avatarUrl: safeCreatorUrl(brand.avatarUrl),
		links: creatorLinks(brand.links), legalLinks: creatorLinks(brand.legalLinks), patreonUrl: safeCreatorUrl(brand.patreonUrl)};
	const options = (site.options || []).map(option => ({id: option.id, label: option.label, amountCents: option.amountCents, currency: option.currency, period: option.period}));
	const nextPage = !single ? site.pageUrls?.[page] || null : null;
	const creator = {
		resource: {id: site.resourceId || 'wave', title: site.title, postsEnabled: true, ...branding, options},
		posts: posts.map(post => ({id: post.id, title: post.title, description: full || post.free ? post.fullText : post.teaser,
			publishedAt: post.date ? new Date(post.date).toISOString() : null, free: post.free === true, locked: !full && !post.free,
			previews: post.media.filter(media => media.mime.startsWith('image/')).map(media => ({url: media.url, alt: media.name})),
			attachments: post.media.filter(media => !media.mime.startsWith('image/') && media.mime !== 'text/uri-list').map(media => ({url: media.url, mime: media.mime, name: media.name, ...(media.text !== undefined ? {text: media.text} : {})})),
			postPath: post.postUrl ? './' + post.postUrl : '#post-full-content', ...((full || post.free) ? {pageUrl: galleryLink(post.media.find(media => media.mime === 'text/uri-list')?.text)?.url || (post.postUrl ? './' + post.postUrl : '#post-full-content')} : {})})),
		path: single ? `/posts/${posts[0]?.id}` : '/', nextOffset: nextPage ? page * 20 : null,
		snapshot: {full, entryPath: site.entryPath || membershipBase + '/', homePath: site.homeUrl || membershipBase + '/',
			accountPath: single ? '../account.html' : 'account.html', nextPage}
	};
	return {
		creator,
		options: {view: 'blog', site: {title: site.title, base: site.homeUrl || membershipBase + '/', postsCount: site.postsCount ?? posts.length}},
		membership: {entryPath: site.entryPath || membershipBase + '/', scriptUrl: membershipBase + '/client.js'},
		favicon: false,
		relativeRoot: single ? '../' : './',
		pageUrls: site.pageUrls,
		currentPage: page,
		pagesCount: pageCount, postsPerPage: 20,
		currentPosts: [], currentPost: null,
		posts: [], indexById: {}
	};
}
