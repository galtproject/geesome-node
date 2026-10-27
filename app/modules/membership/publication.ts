import {siteProblem} from '../api/browserSession.js';
import {membershipBase} from '../staticSiteGenerator/membershipRenderData.js';
import {snapshotCid} from '../staticSiteGenerator/membershipProjection.js';
import {createMembershipPublisher, publicationState} from '../staticSiteGenerator/membershipPublisher.js';
import {registerPublicationSources} from './publicationSources.js';

export function createPublicationDelivery(app, M, membership, dependencies: any = {}) {
	const publisher = createMembershipPublisher(app, M, membership, dependencies);
	const sources = registerPublicationSources(app, M, publisher);
	app.ms.database.registerStorageIdReferenceSource?.({name: 'membership-snapshot-artifacts', count: storageId => M.publication_artifacts.count({where: {storageId}})});
	async function publicationView(resourceId) {
		const row = await membership.resource(resourceId), state = publicationState(row);
		const job = state.publicationId ? await M.publications.findByPk(state.publicationId) : null;
		return job?.status === 'ready' && job.resourceId === resourceId ? job.manifest : null;
	}
	return {
		invalidateGroup: sources.invalidateGroup,
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
		},
		async isStorageIdAllowed(storageId) {
			try {
				return Boolean(await M.publication_artifacts.findByPk(snapshotCid(storageId)));
			} catch {
				return false;
			}
		},
		async getStorageResponseHeaders(storageId) {
			return await this.isStorageIdAllowed(storageId) ? {'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'public, max-age=31536000, immutable'} : {};
		},
		async currentSnapshot(siteId, readerId, postId?, page = 1) {
			const row = await membership.resource(siteId);
			await membership.owner(row.ownerId, row.id);
			if (!row.postsEnabled) {
				siteProblem(404, 'posts_disabled');
			}
			const manifest = await publicationView(siteId);
			if (!manifest) {
				siteProblem(404, 'publication_not_ready');
			}
			let path;
			if (postId !== undefined) {
				if (!/^[1-9][0-9]*$/.test(String(postId)) || !Object.hasOwn(manifest.posts, String(postId))) {
					siteProblem(404, 'post_not_found');
				}
				path = `posts/${postId}.html`;
			} else {
				if (!Number.isSafeInteger(page) || page < 1 || page > manifest.pageCount) {
					siteProblem(404, 'page_not_found');
				}
				path = page === 1 ? 'index.html' : `page-${page}.html`;
			}
			const full = (await membership.entitlement(readerId, siteId)).active;
			return `https://${row.domain}/ipfs/${manifest[full ? 'full' : 'public']}/${path}`;
		}
	};
}
