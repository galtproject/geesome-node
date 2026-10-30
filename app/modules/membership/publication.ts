import {fn, col} from 'sequelize';
import {createGuestSelectionCache} from './guestSelectionCache.js';
import {siteProblem} from '../api/browserSession.js';
import {membershipBase} from '../staticSiteGenerator/membershipRenderData.js';
import {normalizePublicationCid} from '../staticSiteGenerator/publicationIdentity.js';
import {createMembershipPublisher, publicationState} from '../staticSiteGenerator/membershipPublisher.js';
import {registerPublicationSources} from './publicationSources.js';

export function createPublicationDelivery(app, M, membership, dependencies: any = {}) {
	const publisher = createMembershipPublisher(app, M, membership, dependencies);
	const sources = registerPublicationSources(app, M, publisher);
	const guestSelections = createGuestSelectionCache([M.resources, M.site_settings, M.publications,
		app.ms.database.models?.Group, app.ms.database.models?.CorePermission, app.ms.database.models?.User], () => membership.clock().getTime());
	app.ms.database.registerStorageIdReferenceSource?.({name: 'membership-snapshot-artifacts', count: storageId => M.publication_artifacts.count({where: {storageId}})});
	async function publicationView(resourceId) {
		const row = await membership.resource(resourceId), state = publicationState(row);
		const job = state.publicationId ? await M.publications.findByPk(state.publicationId) : null;
		return job?.status === 'ready' && job.resourceId === resourceId ? job.manifest : null;
	}
	return {
		invalidateGroup: sources.invalidateGroup,
		guestSnapshotSelection: guestSelections.get,
		runPublications: publisher.runPublications,
		startPublications: publisher.startPublications.bind(publisher),
		publicationView,
		async enqueuePublication(userId, id, body) {
			await membership.owner(userId, id);
			if (!body || typeof body.requestKey !== 'string' || !/^[A-Za-z0-9:_-]{1,160}$/.test(body.requestKey)) {
				siteProblem(400, 'publication_key_required');
			}
			const job = await publisher.enqueue(id, body.requestKey);
			return {id: job.id, status: job.status, error: job.error, path: `${membershipBase}/`};
		},
		async publicationStatus(userId, id) {
			const row = await membership.owner(userId, id), state = publicationState(row);
			const latest = await M.publications.findOne({where: {resourceId: id}, order: [['createdAt', 'DESC']]});
			return {enabled: Boolean(state.publicationId), revision: state.publicationId, status: latest?.status || 'not_prepared', error: latest?.error || null, path: `${membershipBase}/`};
		},
		async stop() {
			await publisher.stop();
			sources.stop();
			guestSelections.stop();
		},
		async isStorageIdAllowed(storageId) {
			try {
				return Boolean(await M.publication_artifacts.findByPk(normalizePublicationCid(storageId)));
			} catch {
				return false;
			}
		},
		async getStorageResponseHeaders(storageId) {
			return await this.isStorageIdAllowed(storageId) ? {'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'public, max-age=31536000, immutable'} : {};
		},
		async currentSnapshot(siteId, readerId, postId?, page = 1, account = false) {
			const row = await membership.resource(siteId);
			await membership.owner(row.ownerId, row.id, row);
			if (!row.postsEnabled) {
				siteProblem(404, 'posts_disabled');
			}
			if (postId !== undefined && !/^[1-9][0-9]*$/.test(String(postId))) {
				siteProblem(404, 'post_not_found');
			}
			if (!account && postId === undefined && (!Number.isSafeInteger(page) || page < 1)) {
				siteProblem(404, 'page_not_found');
			}
			const full = (await membership.entitlement(readerId, siteId)).active;
			const publicationId = publicationState(row).publicationId;
			// Project only selection fields, never the large file/cache inventories.
			const field = (...path) => fn('jsonb_extract_path_text', col('manifest'), ...path);
			const attributes: any[] = ['resourceId', 'status', [field('version'), 'version'],
				[field(full ? 'full' : 'public'), 'root'], [field('pageCount'), 'pageCount']];
			if (!account && postId !== undefined) {
				attributes.push([fn('jsonb_exists', fn('jsonb_extract_path', col('manifest'), 'posts'), String(postId)), 'hasPost']);
			} else if (!account) {
				attributes.push([field('pagePaths', String(page - 1)), 'pagePath']);
			}
			const selected: any = publicationId ? await M.publications.findByPk(publicationId, {attributes, raw: true}) : null;
			if (!selected || selected.status !== 'ready' || selected.resourceId !== siteId || !selected.root) {
				siteProblem(404, 'publication_not_ready');
			}
			const directory = Number(selected.version) === 2;
			let path;
			if (account) {
				path = directory ? 'account/index.html' : 'account.html';
			} else if (postId !== undefined) {
				if (!selected.hasPost) {
					siteProblem(404, 'post_not_found');
				}
				path = directory ? `posts/${postId}/index.html` : `posts/${postId}.html`;
			} else {
				if (page > Number(selected.pageCount)) {
					siteProblem(404, 'page_not_found');
				}
				path = directory ? selected.pagePath : page === 1 ? 'index.html' : `page-${page}.html`;
			}
			if (typeof path !== 'string') {
				siteProblem(404, 'page_not_found');
			}
			return `https://${row.domain}/ipfs/${selected.root}/${directory ? path.replace(/index\.html$/, '') : path}`;
		}
	};
}
