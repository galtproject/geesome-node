import assert from 'assert';
import {ContentView} from '../app/modules/database/interface.js';

describe('rss projection', () => {
	it('hydrates only the selected feed text body', async () => {
		const textContent = {
			id: 1,
			storageId: 'text-storage',
			mimeType: 'text/html',
			extension: 'html',
			postsContents: {view: ContentView.Attachment}
		};
		const imageContent = {
			id: 2,
			storageId: 'image-storage',
			mediumPreviewStorageId: 'image-preview',
			mimeType: 'image/png',
			extension: 'png',
			previewExtension: 'png',
			postsContents: {view: ContentView.Attachment}
		};
		const jsonContent = {
			id: 3,
			storageId: 'json-storage',
			mimeType: 'application/json',
			extension: 'json',
			postsContents: {view: ContentView.Attachment}
		};
		const projectionCalls = [];
		const textHydrationCalls = [];
		const feedBatchCalls = [];
		const app: any = {
			checkModules() {},
			ms: {
				api: {
					onGet() {}
				},
				group: {
					async getLocalGroup() {
						return {
							isPublic: true,
							title: 'Feed group',
							homePage: 'https://example.test',
							description: 'Feed description'
						};
					},
					async forEachHydratedGroupPostBatch(groupId, options, onBatch) {
						feedBatchCalls.push(options);
						await onBatch({
							groupPosts: [{
								id: 10,
								localId: 11,
								publishedAt: new Date('2026-05-13T00:00:00.000Z'),
								contents: [textContent, imageContent, jsonContent]
							}]
						});
					},
					async getPostContentDataWithUrl(post, baseStorageUri, options) {
						projectionCalls.push(options);
						return post.contents.map((content) => {
							const view = content.postsContents?.view || content.view || ContentView.Contents;
							if (content.mimeType.startsWith('text/')) {
								return {id: content.id, type: 'text', view, storageId: content.storageId};
							}
							if (content.mimeType.includes('image')) {
								return {id: content.id, type: 'image', view, storageId: content.storageId, url: baseStorageUri + content.storageId};
							}
							if (content.mimeType.includes('json')) {
								return {id: content.id, type: 'json', view, storageId: content.storageId};
							}
							return null;
						}).filter((content) => !!content);
					},
					async prepareContentDataWithUrl(content, baseStorageUri, options) {
						textHydrationCalls.push({content, options});
						return {
							id: content.id,
							type: 'text',
							text: 'Feed text body',
							view: content.postsContents?.view || content.view || ContentView.Contents,
							storageId: content.storageId,
							url: baseStorageUri + content.storageId
						};
					}
				}
			}
		};
		const rssRender = await (await import('../app/modules/rss/index.js')).default(app);
		const resultXml = await rssRender.groupRss(1, 'https://node.test');

		assert.deepEqual(projectionCalls, [{includeText: false, includeJson: false}]);
		assert.equal(textHydrationCalls.length, 1);
		assert.equal(textHydrationCalls[0].content.id, textContent.id);
		assert.deepEqual(textHydrationCalls[0].options, {includeJson: false});
		assert.equal(feedBatchCalls[0].maxRefs, 100);
		assert.equal(feedBatchCalls[0].batchLimit, 100);
		assert.equal(resultXml.includes('Feed text body'), true);
		assert.equal(resultXml.includes('image-storage'), true);
	});

	it('uses explicit feed limits without restoring the old default window', async () => {
		const feedBatchCalls = [];
		const app: any = {
			checkModules() {},
			ms: {
				api: {
					onGet() {}
				},
				group: {
					async getLocalGroup() {
						return {
							isPublic: true,
							title: 'Feed group',
							homePage: 'https://example.test',
							description: 'Feed description'
						};
					},
					async forEachHydratedGroupPostBatch(groupId, options, onBatch) {
						feedBatchCalls.push(options);
						await onBatch({groupPosts: []});
					}
				}
			}
		};
		const rssRender = await (await import('../app/modules/rss/index.js')).default(app);

		await rssRender.groupRss(1, 'https://node.test', null, {limit: '5'});
		await rssRender.groupRss(1, 'https://node.test', null, {limit: '20000'});
		await rssRender.groupRss(1, 'https://node.test');

		assert.equal(feedBatchCalls[0].maxRefs, 5);
		assert.equal(feedBatchCalls[1].maxRefs, 9999);
		assert.equal(feedBatchCalls[2].maxRefs, 100);
	});
});
