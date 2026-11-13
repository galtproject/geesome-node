import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildSubgroupFeed} from '../app/modules/staticSiteGenerator/subgroupFeed.js';
import {parseHtmlShell} from '../app/modules/staticSiteGenerator/site/htmlShell.js';
import {subgroupFeedFixture} from './subgroupFeedFixture.js';
import {publicPostShareUrl} from '../app/modules/staticSiteGenerator/site/public/creator/share.js';

describe('public subgroup Feed rendering', function () {
	this.timeout(30000);
	it('links only visible source collections in the same parent snapshot at every route depth', async () => {
		const fixture = subgroupFeedFixture();
		fixture.posts[22].propertiesJson = JSON.stringify({sourceImageSet: {groupId: 10, postId: 42}});
		fixture.posts[21].propertiesJson = JSON.stringify({sourceImageSet: {groupId: 10, postId: 43}});
		fixture.posts[20].propertiesJson = JSON.stringify({sourceImageSet: {groupId: 99, postId: 42}});
		fixture.posts[0].propertiesJson = JSON.stringify({sourceImageSet: {groupId: 10, postId: 42}});
		await buildSubgroupFeed(fixture.app, fixture.row, fixture.subgroup, {directory: '/linked', renew: async () => {}, tabs: fixture.tabs, parentPosts: new Map([['42', {imageCount: 103}]])});
		for (const [path, href] of [['index.html', '../posts/42/'], ['posts/23/index.html', '../../../posts/42/'], ['page/2/index.html', '../../../posts/42/']]) {
			const html = fixture.files.get('/linked/' + path).toString();
			assert(html.includes(`href="${href}"`));
			assert(html.includes('Image set (103 pics)'));
			assert(!html.includes('posts/43/'));
		}
		const hidden = fixture.files.get('/linked/posts/22/index.html').toString();
		const foreign = fixture.files.get('/linked/posts/21/index.html').toString();
		assert(!hidden.includes('Image set (103 pics)'));
		assert(!foreign.includes('Image set (103 pics)'));
	});
	it('uses the verified collection total instead of selected Feed images and falls back without a count', async () => {
		const fixture = subgroupFeedFixture(2);
		fixture.posts[0].propertiesJson = JSON.stringify({sourceImageSet: {groupId: 10, postId: 42}});
		fixture.posts[1].propertiesJson = JSON.stringify({sourceImageSet: {groupId: 10, postId: 43}});
		await buildSubgroupFeed(fixture.app, fixture.row, fixture.subgroup, {directory: '/counts', renew: async () => {}, tabs: fixture.tabs,
			parentPosts: new Map([['42', {imageCount: 103}], ['43', {}]])});
		const html = fixture.files.get('/counts/index.html').toString();
		const state = JSON.parse(html.match(/<script id="site-data"[^>]*>([\s\S]*?)<\/script>/)[1]).creator;
		assert.equal(state.posts.find(post => post.id === '1').previews.length, 1);
		assert.equal(state.posts.find(post => post.id === '1').attachments[0].name, 'Image set (103 pics)');
		assert.equal(state.posts.find(post => post.id === '2').attachments[0].name, 'Image set');
	});
	it('renders native public rich text and ordered images through the existing group projection and creator cards', async () => {
		const fixture = subgroupFeedFixture();
		const result = await buildSubgroupFeed(fixture.app, fixture.row, fixture.subgroup, {directory: '/staging/feed', renew: async () => {}, tabs: fixture.tabs});
		const html = fixture.files.get('/staging/feed/index.html').toString();
		assert.deepEqual(fixture.hydrated, [20]);
		assert(html.includes('Public update 23'));
		assert(html.includes('An independent caption 23.'));
		assert(html.includes('data-testid="post-23"'));
		assert(!html.includes('PRIVATE-ATTACHMENT-CANARY'));
		assert(!html.includes('subscribe-post'));
		assert(!html.includes('data-testid="load-more"'));
		assert(html.indexOf('data-testid="site-sections"') < html.indexOf('<article'));
		assert(!html.includes('class="feed-heading"'));
		assert(html.includes('href="../" data-testid="section-tab-home"'));
		assert(html.includes('href="../feed/" aria-current="page" data-testid="section-tab-feed"'));
		assert(html.includes('href="./page/2/"'));
		assert(html.includes('href="./posts/23/"'));
		const state = JSON.parse(html.match(/<script id="site-data"[^>]*>([\s\S]*?)<\/script>/)[1]).creator;
		assert.equal(state.section.alias, 'feed');
		assert.equal(state.nextOffset, null);
		assert(state.posts.every(post => post.free && !post.locked));
		assert(state.posts[0].previews[0].url.startsWith('./media/'));
		assert(fixture.files.has('/staging/feed/' + state.posts[0].previews[0].url.slice(2)));
		assert(result.artifacts.has(fixture.image.id));
		assert(!result.artifacts.has(fixture.secret.id));
		assert.equal(result.paths.length, 25);
	});
	it('keeps static pagination, direct posts, assets and root tabs relative to the mounted alias', async () => {
		const fixture = subgroupFeedFixture();
		await buildSubgroupFeed(fixture.app, fixture.row, fixture.subgroup, {directory: '/staging/feed', renew: async () => {}, tabs: fixture.tabs});
		const archive = fixture.files.get('/staging/feed/page/2/index.html').toString();
		assert(archive.includes('href="../../" data-testid="newer-posts"'));
		assert(archive.includes('href="../../../" data-testid="section-tab-home"'));
		assert(archive.includes('href="../../style.css"'));
		assert(archive.includes('src="../../public/client.js"'));
		const single = fixture.files.get('/staging/feed/posts/23/index.html').toString();
		assert(single.includes('href="../../" class="back-link"'));
		assert(single.includes('href="../../../feed/" aria-current="page"'));
		assert(single.includes('src="../../media/'));
		assert(!single.includes('Older posts'));
		assert.equal(publicPostShareUrl(23, 'creator.example', '../../posts/23/', 'https://creator.example/ipfs/root/feed/', 'feed'), 'https://creator.example/feed/posts/23/');
		assert.equal(publicPostShareUrl(23, 'creator.example', '../../posts/23/', 'https://creator.example/ipfs/root/'), 'https://creator.example/posts/23/');
	});
	it('renders an empty public Feed and retains backwards compatible optional HTML tabs', async () => {
		const fixture = subgroupFeedFixture(0);
		const example = readFileSync(new URL('../examples/creator-shell.html', import.meta.url), 'utf8');
		const oldShell = example.replace(/\s*<geesome-slot name="tabs"><\/geesome-slot>/, '');
		parseHtmlShell(oldShell);
		fixture.row.data.presentation = {schemaVersion: 1, template: {id: 'html-shell', version: 1, html: oldShell}} as any;
		await buildSubgroupFeed(fixture.app, fixture.row, fixture.subgroup, {directory: '/staging/legacy', renew: async () => {}, tabs: fixture.tabs});
		assert(fixture.files.get('/staging/legacy/index.html').toString().includes('class="feed-heading"'));
		fixture.row.data.presentation = {schemaVersion: 1, template: {id: 'html-shell', version: 1, html: oldShell.replace('<geesome-slot name="posts">', '<geesome-slot name="tabs"></geesome-slot><geesome-slot name="posts">')}} as any;
		const result = await buildSubgroupFeed(fixture.app, fixture.row, fixture.subgroup, {directory: '/staging/empty', renew: async () => {}, tabs: fixture.tabs});
		assert.deepEqual(result.paths, ['index.html']);
		const html = fixture.files.get('/staging/empty/index.html').toString();
		assert(html.includes('New work is on the way'));
		assert(html.includes('data-testid="html-shell"'));
		assert(html.includes('data-testid="section-tab-feed"'));
		assert(!html.includes('<geesome-slot'));
	});
	it('fails closed on an unavailable child and uses the shared alias contract', async () => {
		for (const update of [{isPublic: false}, {isEncrypted: true}, {isDeleted: true}, {creatorId: 99}]) {
			const fixture = subgroupFeedFixture(0);
			Object.assign(fixture.subgroup.group, update);
			await assert.rejects(buildSubgroupFeed(fixture.app, fixture.row, fixture.subgroup, {directory: '/staging/reject', renew: async () => {}, tabs: fixture.tabs}), /publication_subgroup_unavailable/);
			assert.equal(fixture.files.size, 0);
		}
		const fixture = subgroupFeedFixture(0);
		fixture.subgroup.alias = '2026';
		await buildSubgroupFeed(fixture.app, fixture.row, fixture.subgroup, {directory: '/staging/numeric', renew: async () => {}, tabs: []});
		assert(fixture.files.has('/staging/numeric/index.html'));
	});
});
