import {membershipRequest} from '../app/modules/staticSiteGenerator/site/public/creator/api.js';
import assert from 'node:assert/strict';
import {membershipRenderData} from '../app/modules/staticSiteGenerator/membershipRenderData.js';
import siteRenderer from '../app/modules/staticSiteGenerator/site/index.js';
import {runInNewContext} from 'node:vm';
import {readFileSync} from 'node:fs';
const membershipClient = readFileSync(new URL('../app/modules/staticSiteGenerator/site/public/membership.js', import.meta.url), 'utf8');
describe('membership snapshots using shared site templates', function () {
	this.timeout(15000);
	it('exports only public text and explicit preview files without private links or embedded source objects', async () => {
		const post = {id: '1', title: '<script>bad()</script>', teaser: 'PUBLIC', fullText: 'PRIVATE', free: false,
			media: [{url: 'media/preview', mime: 'image/webp', name: '"><script>bad()</script>'}],
			pageUrl: 'https://site.test/ipfs/private-set', postUrl: 'posts/1.html', secret: 'OWNER-TOKEN'};
		const html = await renderSnapshot({title: 'Creator'}, [post], false);
		assert(html.includes('PUBLIC'));
		assert(!html.includes('PRIVATE'));
		assert(!html.includes('private-set'));
		assert(!html.includes('OWNER-TOKEN'));
		assert(!html.includes('<script>bad()'));
		assert(html.includes('&lt;script&gt;bad()'));
		assert(html.includes('src="media/preview"'));
		const data = JSON.parse(html.match(/<script id="site-data"[^>]*>([\s\S]*?)<\/script>/)[1]);
		assert.equal(data.creator.posts[0].previews[0].url, 'media/preview');
		assert(!Object.hasOwn(data.creator.posts[0], 'fullText'));
		assert(!Object.hasOwn(data.creator.posts[0], 'secret'));
		assert(!Object.hasOwn(data.creator.posts[0], 'fullText'));
		assert(!JSON.stringify(data.creator).includes('PRIVATE'));
		assert(html.includes('class="membership-site theme-wave'));
		assert(html.includes('data-testid="subscribe-post"'));
	});
	it('keeps directory-relative post and page links so a known snapshot never asks for newer content', async () => {
		const html = await renderSnapshot({title: 'Creator', homeUrl: 'index.html', pageUrls: ['index.html', 'page-2.html']},
			[{id: '1', title: 'Post', teaser: 'Public', fullText: 'Full', free: false, media: [], postUrl: 'posts/1.html'}], true, false, 1, 2);
		assert(html.includes('href="./posts/1.html"'));
		assert(html.includes('Load more'));
		assert(html.includes('&quot;nextPage&quot;') || html.includes('"nextPage":"page-2.html"'));
		assert(html.includes('Full'));
		const single = await renderSnapshot({title: 'Creator', homeUrl: '../index.html'}, [{id: '1', title: 'Post', fullText: 'Full', media: []}], true, true);
		assert(single.includes('href="../style.css"'));
		assert(single.includes('src="../public/client.js"'));
		assert(single.includes('data-testid="post-1"'));
	});
	it('renders gallery link Content as the existing full-set action on index and post pages', async () => {
		const url = '/ipfs/bafkreihai2kno6iph4yweurfqc7owuunxc5p43kntfv2dqctkukbfntlhy/#/';
		for (const single of [false, true]) {
			const html = await renderSnapshot({title: 'Gallery'}, [{id: '1', title: 'Post', free: false,
				media: [{mime: 'text/uri-list', view:'link', name:'View full set', url}], postUrl: 'posts/1.html'}], true, single);
			assert(html.includes(`href="${url}"`));
			assert(html.includes('data-testid="content-link"'));
			assert(!html.includes('class="attachment-link"'), 'the URI is not rendered as a download or raw text');
		}
	});
	it('renders multiple named IPFS links as ordinary content on index and post pages', async () => {
		for (const single of [false, true]) {
			const html = await renderSnapshot({title:'Resources'}, [{id:'2', title:'Resources', media:[
				{mime:'text/uri-list',name:'Read manual',url:'/ipfs/bafkreihai2kno6iph4yweurfqc7owuunxc5p43kntfv2dqctkukbfntlhy/manual.pdf#page=2'},
				{mime:'text/uri-list',name:'Download source',view:'link',url:'/ipfs/bafkreihai2kno6iph4yweurfqc7owuunxc5p43kntfv2dqctkukbfntlhy/source.zip'}]}], true, single);
			assert(html.includes('Read manual'));
			assert(html.includes('Download source'));
			assert(html.includes('manual.pdf#page=2'));
			assert(!html.includes('View full set'));
			assert(!html.includes('data-testid="subscribe-post"'));
		}
	});
	it('keeps subscription controls when a paid public preview also contains public links', async () => {
		const html = await renderSnapshot({title:'Preview'}, [{id:'3',title:'Paid post',free:false,media:[
			{mime:'text/uri-list',name:'Public instructions',url:'/ipfs/bafkreihai2kno6iph4yweurfqc7owuunxc5p43kntfv2dqctkukbfntlhy/readme.txt'}]}], false);
		assert(html.includes('Public instructions'));
		assert(html.includes('data-testid="subscribe-post"'));
		assert(html.includes('Membership unlocks full-set links'));
	});
	it('renders uploaded icon CIDs as root-relative images on index and nested post pages', async () => {
		const cid = 'bafy' + 'a'.repeat(55);
		const site = {title: 'Icons', brand: {links: [
			{label: 'X', url: 'https://x.com/creator', iconUrl: `/ipfs/${cid}`},
			{label: 'Invalid icon', url: 'https://example.com', iconUrl: 'https://external.test/track.png'}
		]}};
		for (const single of [false, true]) {
			const html = await renderSnapshot(site, [{id: '1', title: 'Post', media: []}], false, single);
			assert(html.includes(`src="/ipfs/${cid}"`));
			assert(!html.includes('external.test'));
			assert(!html.includes('public/icons/'));
		}
	});
	it('renders ordinary text and file attachments with escaped text and links', async () => {
		const html = await renderSnapshot({title: 'Files'}, [{title: 'Post', teaser: '', fullText: '', free: false,
			media: [{text: '<script>unsafe</script>', mime: 'text/plain'}, {mime: 'application/zip', name: 'Archive', url: 'media/archive.zip?name="test"'}, {mime: 'video/webm', url: 'media/video.webm'}]}], true, true);
		assert(html.includes('&lt;script&gt;unsafe&lt;/script&gt;'));
		assert(!html.includes('<script>unsafe'));
		assert(html.includes('href="media/archive.zip?name=&quot;test&quot;"'));
		assert(html.includes('type="video/webm"'));
	});
});

describe('snapshot account client', () => {
	it('maps the preserved interface to site-bound GeeSome APIs without losing invoice keys', async () => {
		const fetch = globalThis.fetch, requests: any[] = [];
		globalThis.fetch = (async (path, options) => { requests.push({path, options}); return {ok:true,json:async()=>({})}; }) as any;
		try {
			await membershipRequest('/auth/challenge');
			await membershipRequest('/auth/google?resource=wave', {resource:'wave',credential:'signed-token'});
			await membershipRequest('/crypto/invoices', {resource:'wave',optionId:'plan',assetId:'asset',idempotencyKey:'stable-key'});
			assert.deepEqual(requests.map(item=>item.path), ['/api/v1/login/google/challenge','/api/v1/login/google','/api/v1/payments/crypto/invoices']);
			assert.deepEqual(JSON.parse(requests[1].options.body), {credential:'signed-token'});
			assert.equal(JSON.parse(requests[2].options.body).idempotencyKey, 'stable-key');
			assert(requests.every(item=>item.options.credentials==='same-origin'&&item.options.cache==='no-store'));
		} finally { globalThis.fetch=fetch; }
	});

	it('renews a terminal quote key but preserves the key after an ambiguous invoice response', async () => {
		const children: any[] = [], status: any = {}, keys: string[] = [];
		let counter = 0, requests = 0;
		const element = (tag: string): any => ({tag, children: [], value: '', append(child) {
			this.children.push(child);
			if (tag === 'select' && !this.value) {
				this.value = child.value;
			}
		}, remove() {
			const index = children.indexOf(this);
			if (index >= 0) {
				children.splice(index, 1);
			}
		}});
		const open: any = {}, panel: any = {hidden: true, append: child => children.push(child),
			querySelector: () => status, querySelectorAll: () => [...children]};
		const document = {querySelector: selector => selector === '#membership-panel' ? panel : selector === '#membership-open' ? open : {dataset: {}},
			createElement: element};
		const fetch = async (url, options) => {
			let value;
			if (url.endsWith('/membership/account')) {
				value = {reader: {id: 'reader'}, active: false};
			} else if (url.endsWith('/membership/resource')) {
				value = {options: [{id: 'tariff', label: 'Monthly', amountCents: 400, currency: 'USD'}]};
			} else if (url.endsWith('/methods')) {
				value = {methods: [{id: 'asset', available: true, currency: 'ETH', networkLabel: 'Test chain'}]};
			} else {
				keys.push(JSON.parse(options.body).idempotencyKey);
				requests++;
				if (requests === 3) {
					throw Error('network response lost');
				}
				value = {id: 'invoice', status: requests === 1 ? 'expired' : 'pending', amount: '1', currency: 'ETH', network: 'test', address: 'test-address'};
			}
			return {ok: true, json: async () => value};
		};
		runInNewContext(membershipClient, {document, fetch, window: {addEventListener() {}}, crypto: {randomUUID: () => `key-${++counter}`},
			setInterval: () => 1, clearInterval() {}, location: {assign() {}}});
		await open.onclick();
		const create = children.find(item => item.textContent === 'Create payment invoice');
		assert(create);
		await create.onclick(); await create.onclick(); await create.onclick(); await create.onclick();
		assert.notEqual(keys[0], keys[1], 'an expired invoice does not permanently pin the old quote');
		assert.equal(keys[1], keys[2]);
		assert.equal(keys[2], keys[3], 'unknown outcome retries the exact key');
	});
});

async function renderSnapshot(site, posts, full, single = false, page = 1, pageCount = 1) {
	const data = membershipRenderData(site, posts, full, single, page, pageCount);
	const {renderPage} = await siteRenderer.prepareRender(data);
	return renderPage(single ? `/post/${posts[0].id}` : '/', [['meta', {name: 'og:title', content: site.title}]]);
}

describe('generic IPFS URI list Content', () => {
	it('parses genuine CIDs, paths, fragments, comments and CRLF lists without gallery assumptions', async () => {
		const {ipfsLink, ipfsUriList} = await import('../app/modules/staticSiteGenerator/publicationLinks.js');
		const cid = 'bafkreihai2kno6iph4yweurfqc7owuunxc5p43kntfv2dqctkukbfntlhy';
		const target = `ipfs://${cid}/documents/file%20name.pdf?download=1#page=3`;
		assert.deepEqual(ipfsLink(target), {cid, path:'/documents/file%20name.pdf',uri:target,url:`/ipfs/${cid}/documents/file%20name.pdf?download=1#page=3`});
		assert.equal(ipfsLink(`ipfs://${cid}`)?.url, `/ipfs/${cid}`);
		assert.equal(ipfsLink(`/ipfs/${cid}/#/`)?.uri, `ipfs://${cid}/#/`, 'old stored link remains readable');
		assert.equal(ipfsUriList(`# A comment\r\n${target}\r\nipfs://${cid}/archive.zip\r\n`).length, 2);
		for (const value of ['javascript:alert(1)', '//evil.test/ipfs/cid/#/', 'https://evil.test/gallery', 'ipfs://invalid-cid', `ipfs://${cid}/../secret`, `ipfs://${cid}/%2e%2e/secret`, `ipfs://${cid}/%2fsecret`, `ipfs://${cid}/bad%ZZ`]) {
			assert.equal(ipfsLink(value), null);
		}
		await assert.rejects(async () => ipfsUriList('x'.repeat(16385)), /publication_link_invalid/);
	});
	it('reads multiple link attachments with limits on actual bytes, not just declared size', async () => {
		const {postIpfsLinks} = await import('../app/modules/staticSiteGenerator/publicationLinks.js');
		const {Readable} = await import('node:stream');
		const content = {mimeType:'text/uri-list',storageId:'link',size:100};
		const storage = {getFileStream:async () => Readable.from([`ipfs://bafkreihai2kno6iph4yweurfqc7owuunxc5p43kntfv2dqctkukbfntlhy/manual.pdf\r\n`])};
		assert.equal((await postIpfsLinks(storage,{contents:[content,{...content,mimeType:'Text/URI-List; charset=UTF-8'}]})).length, 2);
		assert.deepEqual(await postIpfsLinks(storage,{contents:[]}), []);
		await assert.rejects(() => postIpfsLinks(storage,{contents:[{...content,size:16385}]}),/publication_link_invalid/);
		await assert.rejects(() => postIpfsLinks({getFileStream:async () => Readable.from(['x'.repeat(16385)])},{contents:[content]}),/publication_link_invalid/);
	});
});
