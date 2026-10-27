import {randomUUID, createHash} from 'node:crypto';
import {Op} from 'sequelize';
import ipfsHelper from 'geesome-libs/src/ipfsHelper.js';
import {siteProblem} from '../api/browserSession.js';
import {renderMembershipPage, membershipBase} from '../staticSiteGenerator/membershipSite.js';
export const snapshotCid = value => typeof value === 'string' ? ipfsHelper.ipfsHashToCid(value).toString() : ipfsHelper.cidToIpfsHash(value);
export const publicationDigest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function membershipMetadata(post) {
	try { return JSON.parse(post.propertiesJson || '{}').membership || null; } catch { return null; }
}
export function snapshotUrl(value, domain) {
	try {
		const url = new URL(value);
		return url.origin === `https://${domain}` && !url.username && !url.password && /^\/ipfs\/[A-Za-z0-9]+(?:\/|$)/.test(url.pathname) ? url.href : null;
	} catch { return null; }
}
export function createPublicationDelivery(app, M, membership, dependencies: any = {}) {
	const clock = membership.clock, database = app.ms.database.sequelize;
	let timer, running = false;
	app.ms.database.registerStorageIdReferenceSource?.({name: 'membership-snapshot-artifacts', count: storageId => M.publication_artifacts.count({where: {storageId}})});
	async function invalidateGroup(groupId, transaction?) {
		const resource = await M.resources.findOne({where: {groupId: String(groupId)}, transaction, attributes: ['id']});
		if (resource) {
			await M.publication_heads.increment('sourceVersion', {by: 1, where: {resourceId: resource.id}, transaction});
		}
	}
	const postModel = app.ms.database.models.Post;
	if (postModel?.addHook) {
		postModel.removeHook('afterSave', 'membership-publication-source');
		postModel.addHook('afterSave', 'membership-publication-source', async (post, options) => {
			await invalidateGroup(post.groupId, options.transaction);
			if (post.previous('groupId') && String(post.previous('groupId')) !== String(post.groupId)) {
				await invalidateGroup(post.previous('groupId'), options.transaction);
			}
		});
		for (const hook of ['afterBulkUpdate', 'afterDestroy', 'afterBulkDestroy']) {
			postModel.removeHook(hook, 'membership-publication-source');
			postModel.addHook(hook, 'membership-publication-source', async (...args) => {
				const options = args[args.length - 1];
				await M.publication_heads.increment('sourceVersion', {by: 1, where: {}, transaction: options?.transaction});
			});
		}
	}
	async function currentPosts(row) {
		const all = [];
		for (let offset = 0; offset < 10000; offset += 100) {
			const value = await app.ms.group.getGroupPosts(row.groupId, {status: 'published'}, {limit: 100, offset, sortBy: 'publishedAt', sortDir: 'desc'});
			const posts = value.posts || value.list || [];
			for (const post of posts) {
				const m = membershipMetadata(post);
				if (m && !m.hidden && !post.isDeleted && post.status === 'published') {
					all.push(post);
				}
			}
			if (posts.length < 100) {
				return all;
			}
		}
		siteProblem(409, 'publication_post_limit');
	}
	function fingerprint(post) {
		return publicationDigest([String(post.id), String(post.groupId), post.status, post.isDeleted,
			membershipMetadata(post), (post.contents || []).map(c => [String(c.id), c.storageId, c.mimeType])]);
	}
	async function snapshotPost(row, post) {
		const m = membershipMetadata(post), previews = [], media = [];
		for (const item of (Array.isArray(m.previewMedia) ? m.previewMedia : []).slice(0, Math.max(1, Math.min(10, Number(m.previewCount) || 1)))) {
			const url = snapshotUrl(item.url, row.domain);
			if (url) {
				previews.push({url, mime: 'image/webp', name: 'Preview'});
			}
		}
		const hydrated = await app.ms.group.getPostPure(post.id);
		if (!hydrated || String(hydrated.groupId) !== row.groupId) {
			siteProblem(409, 'publication_source_changed');
		}
		for (const content of hydrated.contents || []) {
			if (/^[A-Za-z0-9]{20,200}$/.test(content.storageId || '') && /^(image|video)\//.test(content.mimeType || '')) {
				media.push({url: `https://${row.domain}/ipfs/${content.storageId}`, mime: content.mimeType, name: String(content.name || '').slice(0, 200)});
			}
		}
		return {id: String(post.id), title: String(m.title || '').slice(0, 500), teaser: String(m.teaser ?? m.description ?? '').slice(0, 10000),
			fullText: String(m.fullText ?? m.description ?? '').slice(0, 100000), free: m.free === true,
			pageUrl: snapshotUrl(m.pageUrl, row.domain), full: media, previews};
	}
	async function cleanupStaging(job) {
		await database.transaction(async transaction => {
			// Wait for any in-flight publication commit before deciding to remove
			// directories. An unlocked read could see the old building state.
			const fresh = await M.publications.findByPk(job.id, {transaction, lock: transaction.LOCK.UPDATE});
			if (!fresh || fresh.status === 'ready' || fresh.leaseToken !== job.leaseToken) {
				return;
			}
			for (const path of fresh.stagingPaths || []) {
				if (!new RegExp(`^/membership-${job.id}-[a-f0-9-]{36}-(public|full)$`).test(path)) {
					throw new Error('invalid_publication_staging_path');
				}
				try {
					await app.ms.storage.node.files.rm(path, {recursive: true});
				} catch (error) {
					if (error?.code !== 'ERR_NOT_FOUND' && !/does not exist|not found/i.test(error?.message || '')) {
						throw error;
					}
				}
			}
			await fresh.update({stagingPaths: []}, {transaction});
			job.stagingPaths = [];
		});
	}
	async function build(job) {
		const renew = async () => {
			const [count] = await M.publications.update({leaseUntil: new Date(clock().getTime() + 120000)}, {where: {id: job.id, leaseToken: job.leaseToken, status: 'building'}});
			if (!count) {
				siteProblem(409, 'publication_lease_lost');
			}
		};
		let heartbeatError, heartbeatWork = Promise.resolve();
		const heartbeat = setInterval(() => {
			heartbeatWork = heartbeatWork.then(renew).catch(error => { heartbeatError = error; });
		}, dependencies.publicationHeartbeatMs || 30000);
		heartbeat.unref();
		try {
			await cleanupStaging(job);
			const row = await membership.resource(job.resourceId);
			await membership.owner(row.ownerId, row.id);
			const head = await M.publication_heads.findByPk(row.id), sourceVersion = head.sourceVersion;
			const posts = await currentPosts(row), snapshot = [], artifacts = new Set<string>();
			const saveHtml = async html => {
				await renew();
				const {id} = await app.ms.storage.saveFileByData(html);
				const cid = snapshotCid(id);
				artifacts.add(cid);
				return `https://${row.domain}/ipfs/${cid}`;
			};
			for (const post of posts) {
				const [renewed] = await M.publications.update({leaseUntil: new Date(clock().getTime() + 120000)}, {where: {id: job.id, leaseToken: job.leaseToken, status: 'building'}});
				if (!renewed) {
					siteProblem(409, 'publication_lease_lost');
				}
				const entry = await snapshotPost(row, post);
				for (const url of [...entry.full, ...entry.previews].map(media => media.url).concat(entry.pageUrl ? [entry.pageUrl] : [])) {
					artifacts.add(snapshotCid(new URL(url).pathname.split('/ipfs/')[1].split('/')[0]));
				}
				snapshot.push(entry);
			}
			const info = await membership.publicResource(row.id);
			const manifest: any = {sourceVersion, posts: snapshot.map(post => ({id: post.id})), pages: [], sourceHash: publicationDigest(posts.map(fingerprint))};
			const pageCount = Math.max(1, Math.ceil(snapshot.length / 20));
			for (const full of [false, true]) {
				const variant = full ? 'full' : 'public';
				const directory = `/membership-${job.id}-${job.leaseToken}-${variant}`;
				job.stagingPaths = [...job.stagingPaths, directory];
				const [registered] = await M.publications.update({stagingPaths: job.stagingPaths}, {where: {id: job.id, leaseToken: job.leaseToken, status: 'building'}});
				if (!registered) {
					siteProblem(409, 'publication_lease_lost');
				}
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
					const site = {title: info.title, homeUrl: '../index.html', entryPath: `${membershipBase}/posts/${post.id}/`};
					await savePage(renderMembershipPage(site, [{...post, pageUrl: pageLinks.has(post.id) ? '../' + pageLinks.get(post.id) : null, media: await localMedia(full || post.free ? post.full : post.previews, '../')}], full, true), `posts/${post.id}.html`);
				}
				for (let offset = 0; offset < Math.max(1, snapshot.length); offset += 20) {
					const pageIndex = Math.floor(offset / 20);
					const site = {title: info.title, homeUrl: 'index.html', entryPath: `${membershipBase}/`,
						pageUrls: Array.from({length: pageCount}, (_, index) => index === 0 ? 'index.html' : `page-${index + 1}.html`)};
					const cards = [];
					for (const post of snapshot.slice(offset, offset + 20)) {
						cards.push({...post, pageUrl: pageLinks.get(post.id) || null, media: await localMedia(post.previews, ''), postUrl: `posts/${post.id}.html`});
					}
					await savePage(renderMembershipPage(site, cards, full, false, pageIndex + 1, pageCount), site.pageUrls[pageIndex]);
				}
				const root = snapshotCid(await app.ms.storage.getDirectoryId(directory));
				artifacts.add(root);
				for (const post of manifest.posts) {
					post[variant] = `https://${row.domain}/ipfs/${root}/posts/${post.id}.html`;
					if (!full) {
						const source = snapshot.find(item => item.id === post.id);
						post.previews = source.previews.map(media => `https://${row.domain}/ipfs/${root}/media/${previewNames.get(media.url)}`);
					}
				}
				for (let page = 0; page < pageCount; page++) {
					manifest.pages[page] ||= {};
					manifest.pages[page][variant] = `https://${row.domain}/ipfs/${root}/${page === 0 ? 'index.html' : `page-${page + 1}.html`}`;
				}
			}

			if (publicationDigest((await currentPosts(row)).map(fingerprint)) !== manifest.sourceHash) {
				siteProblem(409, 'publication_source_changed');
			}
			await membership.serial(row.id, async (_row, transaction) => {
				const fresh = await M.publications.findByPk(job.id, {transaction, lock: transaction.LOCK.UPDATE});
				const currentHead = await M.publication_heads.findByPk(row.id, {transaction, lock: transaction.LOCK.UPDATE});
				if (heartbeatError) {
					throw heartbeatError;
				}
				if (fresh.leaseToken !== job.leaseToken || fresh.status !== 'building' || currentHead.sourceVersion !== sourceVersion) {
					siteProblem(409, 'publication_source_changed');
				}
				for (const storageId of artifacts) {
					await M.publication_artifacts.findOrCreate({where: {storageId}, defaults: {publicationId: job.id, resourceId: row.id}, transaction});
				}
				await fresh.update({status: 'ready', manifest, sourceVersion, leaseToken: null, leaseUntil: null, error: null}, {transaction});
				const previous = currentHead.publicationId ? await M.publications.findByPk(currentHead.publicationId, {transaction}) : null;
				if (!previous || new Date(previous.createdAt) <= new Date(fresh.createdAt)) {
					await currentHead.update({publicationId: job.id, enabled: true}, {transaction});
				}
			});
		} finally {
			clearInterval(heartbeat);
			await heartbeatWork;
			await cleanupStaging(job);
		}
	}
	return {
		invalidateGroup,
		async enqueuePublication(userId, id, body) {
			await membership.owner(userId, id);
			if (!body || typeof body.requestKey !== 'string' || !/^[A-Za-z0-9:_-]{1,160}$/.test(body.requestKey)) {
				siteProblem(400, 'publication_key_required');
			}
			const [head] = await M.publication_heads.findOrCreate({where: {resourceId: id}, defaults: {sourceVersion: 0, enabled: false}});
			const [job] = await M.publications.findOrCreate({where: {resourceId: id, requestKey: body.requestKey}, defaults: {id: randomUUID(), status: 'queued', sourceVersion: head.sourceVersion}});
			return {id: job.id, status: job.status, error: job.error, path: `${membershipBase}/`};
		},
		async publicationView(resourceId) {
			const head = await M.publication_heads.findByPk(resourceId);
			if (!head?.enabled || !head.publicationId) {
				return null;
			}
			const job = await M.publications.findByPk(head.publicationId);
			return job?.status === 'ready' ? job.manifest : {posts: []};
		},

		async publicationStatus(userId, id) {
			await membership.owner(userId, id);
			const head = await M.publication_heads.findByPk(id), latest = await M.publications.findOne({where: {resourceId: id}, order: [['createdAt', 'DESC']]});
			return {enabled: head?.enabled === true, revision: head?.publicationId || null, status: latest?.status || 'not_prepared', error: latest?.error || null, path: `${membershipBase}/`};
		},
		async runPublications() {
			if (running) {
				return;
			}
			running = true;
			try {
				const heads = await M.publication_heads.findAll({where: {enabled: true}, order: [['checkedAt', 'ASC'], ['resourceId', 'ASC']], limit: 5});
				for (const head of heads) {
					const previous = await M.publications.findByPk(head.publicationId);
					if (previous?.sourceVersion !== head.sourceVersion) {
						await M.publications.findOrCreate({where: {resourceId: head.resourceId, requestKey: `auto:${head.sourceVersion}`}, defaults: {id: randomUUID(), status: 'queued', sourceVersion: head.sourceVersion}});
					}
					await head.update({checkedAt: clock()});
				}
				const job = await database.transaction(async transaction => {
					const row = await M.publications.findOne({where: {[Op.or]: [{status: 'queued', [Op.or]: [{nextAttemptAt: null}, {nextAttemptAt: {[Op.lte]: clock()}}]}, {status: 'building', leaseUntil: {[Op.lt]: clock()}}]}, order: [['createdAt', 'ASC']], transaction, lock: transaction.LOCK.UPDATE, skipLocked: true});
					return row?.update({status: 'building', attempts: row.attempts + 1, leaseToken: randomUUID(), leaseUntil: new Date(clock().getTime() + 120000)}, {transaction});
				});
				if (job) {
					try { await build(job); } catch (error) {
						await M.publications.update({status: job.attempts < 3 ? 'queued' : 'failed', nextAttemptAt: new Date(clock().getTime() + 10000), error: typeof error?.code === 'string' ? error.code : 'publication_build_failed', leaseToken: null, leaseUntil: null}, {where: {id: job.id, leaseToken: job.leaseToken, status: 'building'}});
					}
				}
			} finally { running = false; }
		},
		startPublications() {
			if (!timer) {
				timer = setInterval(() => this.runPublications().catch(() => {}), 5000); timer.unref();
			}
		},
		async stop() {
			clearInterval(timer); timer = null;
			while (running) {
				await new Promise(resolve => setTimeout(resolve, 20));
			}
			for (const hook of ['afterSave', 'afterBulkUpdate', 'afterDestroy', 'afterBulkDestroy']) {
				postModel?.removeHook(hook, 'membership-publication-source');
			}
		},
		async isStorageIdAllowed(storageId) {
			// Deliberately permanent: a paid snapshot already obtained by CID is
			// retained after subscription expiry, deletion or subsequent updates.
			try { return Boolean(await M.publication_artifacts.findByPk(snapshotCid(storageId))); } catch { return false; }
		},
		async getStorageResponseHeaders(storageId) {
			if (!await this.isStorageIdAllowed(storageId)) {
				return {};
			}
			return {'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'public, max-age=31536000, immutable'};
		},
		async currentSnapshot(siteId, readerId, postId?, page = 1) {
			const row = await membership.resource(siteId);
			await membership.owner(row.ownerId, row.id);
			if (!row.postsEnabled) {
				siteProblem(404, 'posts_disabled');
			}
			const head = await M.publication_heads.findByPk(siteId), job = head?.publicationId ? await M.publications.findByPk(head.publicationId) : null;
			if (!head?.enabled || job?.status !== 'ready' || job.resourceId !== siteId) {
				siteProblem(404, 'publication_not_ready');
			}
			const full = (await membership.entitlement(readerId, siteId)).active;
			if (postId !== undefined) {
				if (!/^[1-9][0-9]*$/.test(String(postId))) {
					siteProblem(404, 'post_not_found');
				}
				const entry = job.manifest.posts.find(post => post.id === String(postId));
				if (!entry) {
					siteProblem(404, 'post_not_found');
				}
				return entry[full ? 'full' : 'public'];
			}
			if (!Number.isSafeInteger(page) || page < 1 || !job.manifest.pages[page - 1]) {
				siteProblem(404, 'page_not_found');
			}
			return job.manifest.pages[page - 1][full ? 'full' : 'public'];
		}
	};
}
