import assert from 'assert';
import site from '../app/modules/staticSiteGenerator/site/index.js';

describe('staticSiteGenerator streaming render state', function () {
	this.timeout(10000);

	it('renders list and post pages from current page/post state without a full posts array', async () => {
		const warnings: any[] = [];
		const originalWarn = console.warn;
		console.warn = (...args) => warnings.push(args);
		const post = {
			id: 7,
			lang: 'en',
			date: new Date('2026-05-13T10:00:00Z').getTime(),
			itemTitle: 'streamed title',
			itemDescription: 'streamed intro',
			pageTitle: 'streamed page title',
			pageDescription: 'streamed page description',
			contents: [
				{
					id: 1,
					type: 'text',
					view: 'contents',
					text: 'streamed post body',
					storageId: 'text-storage-id'
				}
			]
		};
		const renderData = {
			options: {
				lang: 'en',
				view: 'blog',
				site: {
					title: 'Stream Site',
					description: 'About streaming',
					postsCount: 1,
					base: '/'
				}
			},
			posts: [],
			currentPosts: [post],
			currentPost: null,
			pagesCount: 1,
			postsPerPage: 10,
			indexById: {}
		};
		const headers = [['meta', {name: 'og:title', content: 'Stream Site'}]];

		try {
			const {renderPage} = await site.prepareRender(renderData);

			const indexHtml = await renderPage('/', headers);
			assert.equal(indexHtml.includes('streamed intro'), true);
			assert.equal(indexHtml.includes('./post/7/'), true);

			renderData.currentPosts = [];
			renderData.currentPost = post;
			const postHtml = await renderPage('/post/7', headers);
			assert.equal(postHtml.includes('streamed post body'), true);
		} finally {
			console.warn = originalWarn;
		}
		assert.equal(warnings.some(args => args.join(' ').includes('Symbol(v-scx)')), false);
	});
});
