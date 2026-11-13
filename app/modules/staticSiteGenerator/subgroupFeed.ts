import {normalizeSourceImageSet} from '../socNetPublishing/sourceImageSet.js';
import {membershipRenderData, membershipBase} from './membershipRenderData.js';
import siteRenderer from './site/index.js';
import {buildBrowserClient} from './site/browserBundle.js';
import {plainDescription} from './site/creatorSeo.js';
import {normalizeSitePresentation} from './site/presentation.js';
import {normalizePublicationCid, hashPublicationInput} from './publicationIdentity.js';
import {contentIpfsLinks} from './publicationLinks.js';
import helpers from './helpers.js';
import {normalizeSubgroupAlias} from '../group/subgroupConfig.js';
import {richTextToPlainText} from '../../richText.js';

type FeedTab = {alias: string; label: string; href: string};
const postsPerPage = 20;

/** Render an already validated public child without reading its parent's posts. */
export async function buildSubgroupFeed(app, resourceRow, subgroup, {directory, renew, tabs, parentPosts = new Map<string, {imageCount?: number}>()}: {directory: string; renew: () => Promise<unknown>; tabs: FeedTab[]; parentPosts?: Map<string, {imageCount?: number}>}) {
	const {group, alias, subgroupId} = subgroup;
	normalizeSubgroupAlias(alias);
	if (!group || Number(group.id) !== Number(subgroupId) || Number(group.creatorId) !== Number(resourceRow.ownerId)
		|| group.type !== 'channel' || group.isPublic !== true || group.isEncrypted || group.isRemote || group.isDeleted) {
		throw new Error('publication_subgroup_unavailable');
	}
	const storage = app.ms.storage, artifacts = new Set<string>(), paths: string[] = [];
	const posts = [];
	let scanned = 0;
	await app.ms.group.forEachHydratedGroupPostBatch(subgroupId, {
		filters: {status: 'published'}, batchLimit: 100, maxRefs: 10000,
		listParams: {sortBy: 'publishedAt', sortDir: 'desc'}
	}, async ({groupPosts, refCount}) => {
		await renew();
		scanned += refCount;
		for (const post of groupPosts) {
			if (!Number.isSafeInteger(Number(post.id)) || Number(post.id) < 1) {
				throw new Error('publication_post_invalid');
			}
			if (Number(post.groupId) !== Number(subgroupId) || post.status !== 'published' || post.isDeleted || post.isRemote) {
				continue;
			}
			const contents = (post.contents || []).filter(content => !content.isDeleted && !content.isEncrypted && content.postsContents?.isPrivate !== true);
			const projected = helpers.sanitizeStaticSiteContents(await app.ms.group.getPostContentDataWithUrl({...post, contents}, ''));
			const text = projected.filter(content => content.type === 'text' && content.mimeType !== 'text/uri-list')
				.map(content => content.json ? richTextToPlainText(content.json) : content.mimeType === 'text/html' ? plainDescription(content.text, 100000) : String(content.text || '')).join('\n\n');
			const [heading = '', ...paragraphs] = text.split(/\r?\n/);
			const description = [heading.slice(200), ...paragraphs].join('\n').trim().slice(0, 100000);
			const media = [];
			for (const content of projected) {
				const mime = String(content.mimeType || 'application/octet-stream').split(';', 1)[0].toLowerCase();
				if (mime === 'text/uri-list') {
					for (const link of await contentIpfsLinks(storage, content)) {
						artifacts.add(normalizePublicationCid(link.cid));
						media.push({mime, url: link.url, name: String(content.name || '').slice(0, 200), view: content.view});
					}
				} else if (content.type !== 'text') {
					media.push({mime, storageId: normalizePublicationCid(content.storageId), extension: helpers.getContentExtension(content), name: String(content.name || '').slice(0, 200)});
				}
			}
			let sourceImageSet;
			try {
				const source = normalizeSourceImageSet(JSON.parse(post.propertiesJson || '{}').sourceImageSet);
				if (source.groupId === Number(resourceRow.groupId) && parentPosts.has(String(source.postId))) {
					sourceImageSet = source;
				}
			} catch {}
			posts.push({sourceImageSet, id: String(post.id), date: new Date(post.publishedAt || 0).getTime(), title: heading.trim().slice(0, 200) || `Post ${post.id}`,
				teaser: description, fullText: description, free: true, media});
		}
	});
	if (scanned >= 10000) {
		throw new Error('publication_post_limit');
	}
	await renew();
	await storage.makeDir(directory);
	await storage.makeDir(`${directory}/media`);
	await storage.makeDir(`${directory}/public`);
	const copied = new Map<string, string>();
	for (const post of posts) {
		for (const item of post.media) {
			if (!item.storageId) {
				continue;
			}
			if (!copied.has(item.storageId)) {
				const path = `media/${hashPublicationInput(item.storageId)}.${item.extension}`;
				await renew();
				await storage.copyFileFromId(item.storageId, `${directory}/${path}`);
				copied.set(item.storageId, path);
				artifacts.add(item.storageId);
			}
		}
	}
	const title = resourceRow.data?.displayTitle || resourceRow.title || 'Creator';
	const label = subgroup.config?.tabLabel || group.title || group.name || 'Feed';
	const brand = {...resourceRow.data, presentation: normalizeSitePresentation(resourceRow.data?.presentation)};
	const branding = {title, brand, domain: resourceRow.domain, description: resourceRow.data?.displayDescription || '', resourceId: resourceRow.id, options: resourceRow.options || []};
	const pageCount = Math.max(1, Math.ceil(posts.length / postsPerPage));
	const renderData: any = membershipRenderData(branding, [], false);
	const {renderPage, css} = await siteRenderer.prepareRender(renderData);
	const write = async (path: string, body: string) => {
		await renew();
		const cid = normalizePublicationCid((await storage.saveFileByData(body)).id);
		artifacts.add(cid);
		const parent = path.slice(0, path.lastIndexOf('/'));
		if (parent) {
			await storage.makeDir(`${directory}/${parent}`);
		}
		await storage.copyFileFromId(cid, `${directory}/${path}`);
	};
	await write('style.css', css);
	await write('public/client.js', await buildBrowserClient());
	const render = async (selected, path: string, prefix: string, single = false, page = 1) => {
		const parentRoot = prefix === './' ? '../' : prefix + '../';
		const navigation = {home: prefix,
			...(page > 1 ? {newer: page === 2 ? prefix : `${prefix}page/${page - 1}/`} : {}),
			...(page < pageCount ? {older: `${prefix}page/${page + 1}/`} : {})};
		const cards = selected.map(post => ({...post, postUrl: `${prefix}posts/${post.id}/`,
			media: [...post.media.map(item => item.storageId ? {mime: item.mime, name: item.name, url: prefix + copied.get(item.storageId)} : item),
				...(post.sourceImageSet ? [{mime: 'text/uri-list', view: 'link', name: sourceImageSetLabel(parentPosts.get(String(post.sourceImageSet.postId))), url: `${parentRoot}posts/${post.sourceImageSet.postId}/`}] : [])]}));
		const canonicalPath = `/${alias}/${path.replace(/index\.html$/, '')}`;
		const data: any = membershipRenderData({...branding, relativeRoot: prefix, homeUrl: parentRoot, entryPath: membershipBase + '/', canonicalPath, navigation}, cards, false, single, page, pageCount);
		for (const post of data.creator.posts) {
			post.postPath = `${prefix}posts/${post.id}/`;
			delete post.pageUrl;
		}
		data.creator.section = {kind: 'group-feed', alias, label, homePath: prefix};
		data.creator.tabs = tabs;
		data.creator.snapshot.accountPath = `${parentRoot}account/`;
		data.creator.nextOffset = null;
		Object.assign(renderData, data);
		await write(path, await renderPage(single ? `/post/${selected[0].id}` : page === 1 ? '/' : `/page/${page}`, []));
		paths.push(path);
	};
	for (let index = 0; index < pageCount; index++) {
		await render(posts.slice(index * postsPerPage, (index + 1) * postsPerPage), index ? `page/${index + 1}/index.html` : 'index.html', index ? '../../' : './', false, index + 1);
	}
	for (const post of posts) {
		await render([post], `posts/${post.id}/index.html`, '../../', true);
	}
	await renew();
	const root = normalizePublicationCid(await storage.getDirectoryId(directory));
	artifacts.add(root);
	return {root, artifacts, paths};
}

function sourceImageSetLabel(source) {
	const count = source?.imageCount;
	return Number.isSafeInteger(count) && count > 0 ? `Image set (${count} pics)` : 'Image set';
}
