import assert from 'assert';
import {ContentView} from '../app/modules/database/interface.js';
import {createStaticSiteRenderCache, getModule} from '../app/modules/staticSiteGenerator/index.js';

describe('staticSiteGenerator projection cache', () => {
	it('reuses converted referenced post objects within one render', async () => {
		const hydratedPostIds = [];
		const app: any = {
			ms: {
				group: {
					async getPostContentDataWithUrl(post, baseStorageUri, options) {
						hydratedPostIds.push(post.id);
						if (!post.contents?.length) {
							return [];
						}
						return post.contents.map(content => ({
							id: content.id,
							type: 'text',
							text: content.text,
							view: ContentView.Contents,
							storageId: content.storageId,
							url: baseStorageUri + content.storageId
						}));
					}
				},
				storage: {
					async nodeLs() {
						return [];
					},
					async copyFileFromId() {
						return null;
					}
				}
			}
		};
		const staticSiteGenerator: any = await getModule(app, {});
		const renderCache = createStaticSiteRenderCache();
		const options = {
			lang: 'en',
			post: {
				titleLength: 100,
				descriptionLength: 400
			}
		};
		const referencedPost = {
			id: 10,
			localId: 10,
			publishedAt: new Date('2026-05-13T10:00:00Z'),
			contents: [{
				id: 100,
				text: 'referenced post body',
				storageId: 'referenced-text'
			}]
		};
		const firstPost = {
			id: 1,
			localId: 1,
			publishedAt: new Date('2026-05-13T11:00:00Z'),
			contents: [],
			repostOf: referencedPost
		};
		const secondPost = {
			id: 2,
			localId: 2,
			publishedAt: new Date('2026-05-13T12:00:00Z'),
			contents: [],
			repostOf: referencedPost
		};

		const firstObject = await staticSiteGenerator.postToObj(options, '/site', firstPost, renderCache);
		const secondObject = await staticSiteGenerator.postToObj(options, '/site', secondPost, renderCache);

		assert.deepEqual(hydratedPostIds, [1, 10, 2]);
		assert.equal(firstObject.repostOf, secondObject.repostOf);
		assert.equal(secondObject.repostOf.contents[0].text, 'referenced post body');
	});
});
