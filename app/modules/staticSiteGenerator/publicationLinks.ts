// A link is ordinary Content. Its join-row privacy decides which projection
// receives it; a link never asks the publisher to walk the target directory.
export function galleryLink(value: unknown) {
	const text = String(value || '').trim();
	const match = /^\/ipfs\/([A-Za-z0-9]{20,200})\/#\/$/.exec(text);
	return match ? {url: text, cid: match[1]} : null;
}

export async function postGalleryLink(storage, post) {
	const links = (post.contents || []).filter(content => content.mimeType === 'text/uri-list');
	if (!links.length) {
		return null;
	}
	if (links.length !== 1 || Number(links[0].size || 0) > 1024) {
		throw new Error('publication_link_invalid');
	}
	const link = galleryLink(await storage.getFileDataText(links[0].storageId));
	if (!link) {
		throw new Error('publication_link_invalid');
	}
	return link;
}
