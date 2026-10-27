import {siteProblem} from '../api/browserSession.js';
import {renderMembershipPage, membershipBase} from './membershipSite.js';
import {snapshotCid, publicationDigest, snapshotUrl, membershipMetadata} from './membershipProjection.js';

export async function buildMembershipSnapshots(app, row, title, {renew, beginDirectory}) {
	const snapshot = await readSnapshotPosts(app, row), artifacts = new Set<string>();
	const saveHtml = async html => {
		await renew();
		const {id} = await app.ms.storage.saveFileByData(html);
		const cid = snapshotCid(id);
		artifacts.add(cid);
		return `https://${row.domain}/ipfs/${cid}`;
	};
	for (const entry of snapshot) {
		for (const url of [...entry.full, ...entry.previews].map(media => media.url).concat(entry.pageUrl ? [entry.pageUrl] : [])) {
			artifacts.add(snapshotCid(new URL(url).pathname.split('/ipfs/')[1].split('/')[0]));
		}
	}

	const manifest: any = {public: null, full: null, pageCount: Math.max(1, Math.ceil(snapshot.length / 20)), posts: Object.fromEntries(snapshot.map(post => [post.id, []]))};
	const pageCount = manifest.pageCount;
	for (const full of [false, true]) {
		const variant = full ? 'full' : 'public';
		const directory = await beginDirectory(variant);
		await app.ms.storage.makeDir(directory);
		await app.ms.storage.makeDir(`${directory}/posts`);
		await app.ms.storage.makeDir(`${directory}/media`);
		await app.ms.storage.makeDir(`${directory}/sets`);
		const copied = new Set<string>(), previewNames = new Map<string, string>();
		await renew();
		const localMedia = async (media, prefix) => {
			const result = [];
			for (const item of media) {
				const parsed = new URL(item.url), source = parsed.pathname.split('/ipfs/')[1];
				// Copy exactly the selected leaf, never its parent directory: a
				// preview can be one image inside an otherwise paid set.
				const extension = /\.(png|jpe?g|webp|gif|avif|mp4|webm)$/i.exec(parsed.pathname)?.[1].toLowerCase()
					|| ({'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'video/mp4': 'mp4', 'video/webm': 'webm'}[item.mime] || 'bin');
				const name = `${publicationDigest(source)}.${extension}`;
				if (!copied.has(name)) {
					await renew();
					const stat = await app.ms.storage.getFileStat(source, {attempts: 0, attemptTimeout: 0, withLocal: true, size: true, timeout: 30000});
					if (stat?.type !== 'file') {
						siteProblem(409, 'publication_media_file_required');
					}
					await app.ms.storage.copyFileFromId(source, `${directory}/media/${name}`);
					copied.add(name);
				}
				previewNames.set(item.url, name);
				result.push({...item, url: `${prefix}media/${name}`});
			}
			return result;
		};
		const pageLinks = new Map<string, string>();
		for (const post of snapshot) {
			if ((full || post.free) && post.pageUrl) {
				const parsed = new URL(post.pageUrl), parts = parsed.pathname.split('/ipfs/')[1].split('/');
				const cid = parts.shift();
				await app.ms.storage.copyFileFromId(cid, `${directory}/sets/${post.id}`);
				pageLinks.set(post.id, `sets/${post.id}${parts.length ? '/' + parts.join('/') : ''}${parsed.search}${parsed.hash}`);
			}
		}
		const savePage = async (html, path) => {
			const url = await saveHtml(html);
			const cid = url.split('/ipfs/')[1];
			await app.ms.storage.copyFileFromId(cid, `${directory}/${path}`);
		};
		for (const post of snapshot) {
			const site = {title, homeUrl: '../index.html', entryPath: `${membershipBase}/posts/${post.id}/`};
			await savePage(renderMembershipPage(site, [{...post, pageUrl: pageLinks.has(post.id) ? '../' + pageLinks.get(post.id) : null, media: await localMedia(full || post.free ? post.full : post.previews, '../')}], full, true), `posts/${post.id}.html`);
		}
		for (let offset = 0; offset < Math.max(1, snapshot.length); offset += 20) {
			const pageIndex = Math.floor(offset / 20);
			const site = {title, homeUrl: 'index.html', entryPath: `${membershipBase}/`,
				pageUrls: Array.from({length: pageCount}, (_, index) => index === 0 ? 'index.html' : `page-${index + 1}.html`)};
			const cards = [];
			for (const post of snapshot.slice(offset, offset + 20)) {
				cards.push({...post, pageUrl: pageLinks.get(post.id) || null, media: await localMedia(post.previews, ''), postUrl: `posts/${post.id}.html`});
			}
			await savePage(renderMembershipPage(site, cards, full, false, pageIndex + 1, pageCount), site.pageUrls[pageIndex]);
		}
		const root = snapshotCid(await app.ms.storage.getDirectoryId(directory));
		artifacts.add(root);
		manifest[variant] = root;
		if (!full) {
			for (const post of snapshot) {
				manifest.posts[post.id] = post.previews.map(media => previewNames.get(media.url));
			}
		}

	}
	return {manifest, artifacts};
}

async function readSnapshotPosts(app, row) {
	const snapshot = [];
	let scanned = 0;
	await app.ms.group.forEachHydratedGroupPostBatch(row.groupId, {
		filters: {status: 'published'}, batchLimit: 100, maxRefs: 10000,
		listParams: {sortBy: 'publishedAt', sortDir: 'desc'}
	}, async ({groupPosts, refCount}) => {
		scanned += refCount;
		for (const post of groupPosts) {
			const metadata = membershipMetadata(post);
			if (metadata && !metadata.hidden && !post.isDeleted && post.status === 'published') {
				snapshot.push(snapshotPost(row, post));
			}
		}
	});
	if (scanned >= 10000) {
		siteProblem(409, 'publication_post_limit');
	}
	return snapshot;
}

function snapshotPost(row, post) {
	const m = membershipMetadata(post), previews = [], media = [];
	for (const item of (Array.isArray(m.previewMedia) ? m.previewMedia : []).slice(0, Math.max(1, Math.min(10, Number(m.previewCount) || 1)))) {
		const url = snapshotUrl(item.url, row.domain);
		if (url) {
			previews.push({url, mime: 'image/webp', name: 'Preview'});
		}
	}
	for (const content of post.contents || []) {
		if (/^[A-Za-z0-9]{20,200}$/.test(content.storageId || '') && /^(image|video)\//.test(content.mimeType || '')) {
			media.push({url: `https://${row.domain}/ipfs/${content.storageId}`, mime: content.mimeType, name: String(content.name || '').slice(0, 200)});
		}
	}
	return {id: String(post.id), title: String(m.title || '').slice(0, 500), teaser: String(m.teaser ?? m.description ?? '').slice(0, 10000),
		fullText: String(m.fullText ?? m.description ?? '').slice(0, 100000), free: m.free === true,
		pageUrl: snapshotUrl(m.pageUrl, row.domain), full: media, previews};
}
