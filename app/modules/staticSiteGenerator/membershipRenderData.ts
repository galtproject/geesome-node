export const membershipBase = '/api/v1/membership/site';

type SnapshotMedia = {url?: string; mime: string; name?: string; text?: string};
type SnapshotPost = {
	id?: string | number; date?: number; title?: string; teaser?: string; fullText?: string;
	free?: boolean; postUrl?: string; media: SnapshotMedia[];
};
type SnapshotSite = {title: string; homeUrl?: string; entryPath?: string; postsCount?: number; pageUrls?: string[]};

// The shared renderer receives only the selected variant. Never serialize the
// original snapshot object with both public and full content into site-data.
export function membershipRenderData(site: SnapshotSite, posts: SnapshotPost[], full: boolean, single = false, page = 1, pageCount = 1) {
	const project = (post: SnapshotPost) => ({
		id: post.id,
		date: post.date || 0,
		title: post.title,
		description: full || post.free ? post.fullText : post.teaser,
		path: post.postUrl,
		accessMessage: !full && !post.free ? 'Full content is available with an active subscription.' : '',
		contents: post.media.map(media => ({
			type: media.text !== undefined ? 'text' : media.mime.startsWith('image/') ? 'image' : media.mime.startsWith('video/') ? 'video' : 'file',
			view: 'contents', url: media.url, mimeType: media.mime, name: media.name,
			...(media.text !== undefined ? {text: media.text, isPlainText: true} : {})
		}))
	});
	const selected = posts.map(project);
	return {
		options: {view: 'blog', site: {title: site.title, base: site.homeUrl || membershipBase + '/', postsCount: site.postsCount ?? posts.length}},
		membership: {entryPath: site.entryPath || membershipBase + '/', scriptUrl: membershipBase + '/client.js'},
		favicon: false,
		relativeRoot: single ? '../' : './',
		pageUrls: site.pageUrls,
		currentPage: page,
		pagesCount: pageCount, postsPerPage: 20,
		currentPosts: single ? [] : selected,
		currentPost: single ? selected[0] : null,
		posts: [], indexById: {}
	};
}
