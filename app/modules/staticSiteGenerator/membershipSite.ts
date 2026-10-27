// Membership rendering receives an already allowlisted projection, never hydrated
// Post/Content objects. It deliberately has no storage/IPFS publication side effect.
export const membershipBase = '/api/v1/membership/site';
export function escapeMembershipHtml(value: unknown) {
	return String(value ?? '').replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
}
export function renderMembershipPage(site, posts, full: boolean, single = false, page = 1, pageCount = 1) {
	const e = escapeMembershipHtml;
	const cards = posts.map(post => `<article><h2>${e(post.title)}</h2><p class="text">${e(full || post.free ? post.fullText : post.teaser)}</p>${post.media.map(media => {
		const url = media.url;
		return media.text !== undefined ? `<p class="text">${e(media.text)}</p>` : media.mime.startsWith('video/') ? `<video controls preload="metadata" src="${e(url)}"></video>`
			: media.mime.startsWith('image/') ? `<img loading="lazy" src="${e(url)}" alt="${e(media.name)}">`
				: `<a href="${e(url)}">${e(media.name)}</a>`;
	}).join('')}${!full && !post.free ? '<p>Full content is available with an active subscription.</p>' : ''}${single ? '' : `<a href="${e(post.postUrl)}">View post</a>`}</article>`).join('');
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(site.title)}</title><style>body{max-width:72rem;margin:auto;padding:1rem;font:18px/1.5 system-ui}header,article{padding:1rem 0;border-bottom:1px solid #ccc}img,video{max-width:100%;height:auto;display:block;margin:1rem 0}.text{white-space:pre-wrap;overflow-wrap:anywhere}nav{display:flex;gap:1rem;flex-wrap:wrap}a{overflow-wrap:anywhere}</style></head><body><header><h1>${e(site.title)}</h1><nav><a href="${e(site.homeUrl || membershipBase + '/')}">Home</a><button id="membership-open" type="button">Account and subscription</button></nav></header><section id="membership-panel" hidden><p role="status"></p></section><main data-site-entry="${e(site.entryPath || membershipBase + '/')}">${cards || '<p>No published posts.</p>'}</main>${!single && pageCount > 1 ? `<nav>${page > 1 ? `<a href="${e(site.pageUrls?.[page - 2] || membershipBase + '/')}">Newer posts</a>` : ''}<span>Page ${page} of ${pageCount}</span>${page < pageCount ? `<a href="${e(site.pageUrls?.[page] || membershipBase + '/')}">Older posts</a>` : ''}</nav>` : ''}<script src="${membershipBase}/client.js" defer></script></body></html>`;
}
