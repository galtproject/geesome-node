import {contentIpfsLinks} from './publicationLinks.js';
import {creatorLinks, safeCreatorUrl} from './site/public/creator/links.js';
import {getContentExtension} from './helpers.js';
import {siteProblem} from '../api/browserSession.js';
import {membershipRenderData, membershipBase} from './membershipRenderData.js';
import siteRenderer from './site/index.js';
import {buildBrowserClient} from './site/browserBundle.js';
import {snapshotCid, publicationDigest, membershipMetadata} from './membershipProjection.js';

const mediaName = item => `${publicationDigest(item.storageId)}.${item.extension}`;

export async function buildMembershipSnapshots(app, row, title, {renew, beginDirectory, options, description}) {
	const snapshot = await readSnapshotPosts(app, row), artifacts = new Set<string>();
	const brand = {...row.data};
	for (const value of [brand.coverUrl, brand.avatarUrl, ...creatorLinks(brand.links).map(link => link.iconUrl)]) {
		const url = safeCreatorUrl(value);
		const source = url && new URL(url, `https://${row.domain}`).pathname.match(/^\/ipfs\/([A-Za-z0-9]+)(?:\/|$)/)?.[1];
		if (source) {
			artifacts.add(snapshotCid(source));
		}
	}
	const branding = {brand, options, description, resourceId: row.id};
	const saveHtml = async html => {
		await renew();
		const {id} = await app.ms.storage.saveFileByData(html);
		const cid = snapshotCid(id);
		artifacts.add(cid);
		return cid;
	};
	for (const entry of snapshot) {
		for (const media of entry.full) {
			artifacts.add(snapshotCid(media.storageId));
			if (media.mime === 'text/uri-list') {
				for (const link of media.links) {
					artifacts.add(snapshotCid(link.cid));
				}
			}
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
		await app.ms.storage.makeDir(`${directory}/public`);
		const copied = new Set<string>();
		await renew();
		const localMedia = async (media, prefix) => {
			const result = [];
			for (const item of media) {
				if (item.mime === 'text/uri-list') {
					result.push(...item.links.map(link => ({...item, url: link.url, text: undefined})));
					continue;
				}
				const source = item.storageId;
				const name = mediaName(item);
				if (!copied.has(name)) {
					await renew();
					const stat = await app.ms.storage.getFileStat(source, {attempts: 0, attemptTimeout: 0, withLocal: true, size: true, timeout: 30000});
					if (!['file', 'directory'].includes(stat?.type)) {
						siteProblem(409, 'publication_content_required');
					}
					await app.ms.storage.copyFileFromId(source, `${directory}/media/${name}`);
					copied.add(name);
				}
				result.push({...item, url: `${prefix}media/${name}`});
			}
			return result;
		};
		const savePage = async (html, path) => {
			const cid = await saveHtml(html);
			await app.ms.storage.copyFileFromId(cid, `${directory}/${path}`);
		};
		const renderData = membershipRenderData({title, ...branding}, [], full, false, 1, pageCount);
		const {css, renderPage} = await siteRenderer.prepareRender(renderData);
		await savePage(css, 'style.css');
		await savePage(await buildBrowserClient(), 'public/client.js');
		const render = async (site, posts, single = false, page = 1) => {
			Object.assign(renderData, membershipRenderData(site, posts, full, single, page, pageCount));
			return renderPage(single ? `/post/${posts[0].id}` : page === 1 ? '/' : `/page/${page}`, [['meta', {name: 'og:title', content: title}]]);
		};
		for (const post of snapshot) {
			const site = {title, ...branding, postsCount: snapshot.length, homeUrl: '../index.html', entryPath: `${membershipBase}/posts/${post.id}/`};
			await savePage(await render(site, [{...post, media: await localMedia(full ? post.full : post.previews, '../')}], true), `posts/${post.id}.html`);
		}
		for (let offset = 0; offset < Math.max(1, snapshot.length); offset += 20) {
			const pageIndex = Math.floor(offset / 20);
			const site = {title, ...branding, postsCount: snapshot.length, homeUrl: 'index.html', entryPath: `${membershipBase}/`,
				pageUrls: Array.from({length: pageCount}, (_, index) => index === 0 ? 'index.html' : `page-${index + 1}.html`)};
			const cards = [];
			for (const post of snapshot.slice(offset, offset + 20)) {
				const media = full ? [...post.previews.filter(item => item.mime !== 'text/uri-list'), ...post.full.filter(item => item.mime === 'text/uri-list')] : post.previews;
				cards.push({...post, media: await localMedia(media, ''), postUrl: `posts/${post.id}.html`});
			}
			await savePage(await render(site, cards, false, pageIndex + 1), site.pageUrls[pageIndex]);
		}
		const accountData = membershipRenderData({title, ...branding, homeUrl: 'index.html', entryPath: `${membershipBase}/`}, [], full);
		accountData.creator.path = '/account/subscription';
		Object.assign(renderData, accountData);
		await savePage(await renderPage('/', [['meta', {name: 'og:title', content: title}]]), 'account.html');
		const root = snapshotCid(await app.ms.storage.getDirectoryId(directory));
		artifacts.add(root);
		manifest[variant] = root;
		if (!full) {
			for (const post of snapshot) {
				manifest.posts[post.id] = post.previews.filter(media => media.mime.startsWith('image/')).map(mediaName);
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
				snapshot.push(await snapshotPost(app, post));
			}
		}
	});
	if (scanned >= 10000) {
		siteProblem(409, 'publication_post_limit');
	}
	return snapshot;
}

async function snapshotPost(app, post) {
	const m = membershipMetadata(post), previews = [], media = [];
	for (const content of post.contents || []) {
		if (!/^[A-Za-z0-9]{20,200}$/.test(content.storageId || '')) {
			continue;
		}
		const item: any = {storageId: content.storageId, extension: getContentExtension(content), mime: String(content.mimeType || 'application/octet-stream').split(';', 1)[0].trim().toLowerCase(), name: String(content.name || '').slice(0, 200), view: content.postsContents?.view || content.view};
		if (item.mime === 'text/uri-list') {
			item.links = await contentIpfsLinks(app.ms.storage, content);
		} else if (item.mime.startsWith('text/') || item.mime.includes('rich-text')) {
			const projected = await app.ms.group.prepareContentData(content);
			item.text = projected.text;
		}
		media.push(item);
		if (content.postsContents?.isPrivate === false) {
			previews.push(item);
		}
	}
	return {id: String(post.id), date: new Date(post.publishedAt || 0).getTime(), title: String(m.title || '').slice(0, 500), teaser: String(m.teaser ?? m.description ?? '').slice(0, 10000),
		fullText: String(m.fullText ?? m.description ?? '').slice(0, 100000), free: m.free === true, full: media, previews};
}
