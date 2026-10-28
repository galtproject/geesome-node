import {readFileSync} from 'node:fs';
import {creatorLayout, creatorPagePaths} from './membershipPagination.js';
import {contentIpfsLinks} from './publicationLinks.js';
import {creatorLinks, safeCreatorUrl} from './site/public/creator/links.js';
import {getContentExtension} from './helpers.js';
import {siteProblem} from '../api/browserSession.js';
import {membershipRenderData, membershipBase} from './membershipRenderData.js';
import siteRenderer from './site/index.js';
import {buildBrowserClient} from './site/browserBundle.js';
import {snapshotCid, publicationDigest, membershipMetadata} from './membershipProjection.js';

const mediaName = item => `${publicationDigest(item.storageId)}.${item.extension}`;

export async function buildMembershipSnapshots(app, row, title, {renew, beginDirectory, options, description, previousManifest = null}) {
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

	const previous = previousManifest?.version === 2 ? previousManifest : null;
	const layout = creatorLayout(snapshot, previous?.layout);
	const paths = creatorPagePaths(layout);
	const manifest: any = {version: 2, public: null, full: null, layout, pagePaths: paths, pageCount: paths.length,
		files: {public: {}, full: {}}, media: {public: [], full: []}, posts: Object.fromEntries(snapshot.map(post => [post.id, []]))};
	const byId = new Map(snapshot.map(post => [String(post.id), post]));
	const bundle = await buildBrowserClient();
	const shell = readFileSync(new URL('./site/index.html', import.meta.url), 'utf8');
	const rendererSource = readFileSync(new URL('./site/index.js', import.meta.url), 'utf8');
	for (const full of [false, true]) {
		const variant = full ? 'full' : 'public';
		const directory = await beginDirectory(variant);
		await app.ms.storage.makeDir(directory);
		for (const path of ['posts', 'media', 'public', 'page', 'account']) {
			await app.ms.storage.makeDir(`${directory}/${path}`);
		}
		const copied = new Set<string>();
		await renew();
		const localMedia = async (media, prefix) => {
			const result = [];
			for (const item of media) {
				if (item.mime === 'text/uri-list') {
					result.push(...item.links.map(link => ({...item, url: link.url, text: undefined})));
					continue;
				}
				const name = mediaName(item);
				if (!copied.has(name)) {
					await renew();
					const stat = await app.ms.storage.getFileStat(item.storageId, {attempts: 0, attemptTimeout: 0, withLocal: true, size: true, timeout: 30000});
					if (!['file', 'directory'].includes(stat?.type)) {
						siteProblem(409, 'publication_content_required');
					}
					await app.ms.storage.copyFileFromId(item.storageId, `${directory}/media/${name}`);
					copied.add(name);
				}
				result.push({...item, url: `${prefix}media/${name}`});
			}
			return result;
		};
		const renderData: any = membershipRenderData({title, ...branding}, [], full);
		const {css, renderPage} = await siteRenderer.prepareRender(renderData);
		const renderVersion = publicationDigest([bundle, css, shell, rendererSource, renderData.assets]);
		const publish = async (path, input, generate) => {
			await renew();
			const key = publicationDigest([renderVersion, input]);
			const cached = previous?.files?.[variant]?.[path];
			const cid = cached?.key === key ? snapshotCid(cached.cid) : await saveHtml(await generate());
			artifacts.add(cid);
			manifest.files[variant][path] = {key, cid};
			await app.ms.storage.copyFileFromId(cid, `${directory}/${path}`);
		};
		await publish('style.css', css, () => css);
		await publish('public/client.js', bundle, () => bundle);
		const render = async (site, posts, path, route, single = false, page = 1) => {
			const data = membershipRenderData({...site, canonicalPath: '/' + path.replace(/index\.html$/, '')}, posts, full, single, page, 1);
			const canonical = `https://${row.domain}/${path.replace(/index\.html$/, '')}`;
			await publish(path, [data, route, canonical], () => {
				Object.assign(renderData, data);
				return renderPage(route, [['meta', {name: 'og:title', content: title}], ['link', {rel: 'canonical', href: canonical}],
					...((full || path === 'account/index.html') ? [['meta', {name: 'robots', content: 'noindex,nofollow'}]] : [])]);
			});
		};
		for (const post of snapshot) {
			await app.ms.storage.makeDir(`${directory}/posts/${post.id}`);
			const site = {title, ...branding, relativeRoot: '../../', homeUrl: '../../', entryPath: `${membershipBase}/posts/${post.id}/`};
			await render(site, [{...post, postUrl: './', media: await localMedia(full ? post.full : post.previews, '../../')}], `posts/${post.id}/index.html`, `/post/${post.id}`, true);
		}
		const groups = [layout.home, ...layout.archives];
		for (let index = 0; index < groups.length; index++) {
			const prefix = index === 0 ? './' : '../../';
			if (index) {
				await app.ms.storage.makeDir(`${directory}/page/${index}`);
			}
			const older = index === 0 ? layout.archives.length : index - 1;
			const navigation = {home: prefix, ...(older > 0 ? {older: `${prefix}page/${older}/`} : {}),
				...(index > 0 ? {newer: index < layout.archives.length ? `${prefix}page/${index + 1}/` : prefix} : {})};
			const site = {title, ...branding, relativeRoot: prefix, homeUrl: prefix, entryPath: index ? `${membershipBase}/page/${index}/` : `${membershipBase}/`, navigation};
			const cards = [];
			for (const id of [...groups[index]].reverse()) {
				const post = byId.get(id);
				if (!post) {
					continue;
				}
				const media = full ? [...post.previews.filter(item => item.mime !== 'text/uri-list'), ...post.full.filter(item => item.mime === 'text/uri-list')] : post.previews;
				cards.push({...post, media: await localMedia(media, prefix), postUrl: `${prefix}posts/${post.id}/`});
			}
			await render(site, cards, paths[index], index === 0 ? '/' : `/page/${index}`, false, index || 1);
		}
		const accountSite = {title, ...branding, canonicalPath: '/account/', relativeRoot: '../', homeUrl: '../', entryPath: `${membershipBase}/account/`};
		const account = membershipRenderData(accountSite, [], full);
		account.creator.path = '/account/subscription';
		await publish('account/index.html', account, () => {
			Object.assign(renderData, account);
			return renderPage('/', [['meta', {name: 'og:title', content: title}], ['meta', {name: 'robots', content: 'noindex,nofollow'}]]);
		});
		manifest.media[variant] = [...copied];
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
