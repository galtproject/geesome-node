import assert from 'node:assert/strict';
import {renderMembershipPage} from '../app/modules/staticSiteGenerator/membershipSite.js';
import {snapshotUrl} from '../app/modules/staticSiteGenerator/membershipProjection.js';
import {runInNewContext} from 'node:vm';
import {readFileSync} from 'node:fs';
const membershipClient = readFileSync(new URL('../app/modules/staticSiteGenerator/site/public/membership.js', import.meta.url), 'utf8');
describe('membership immutable snapshot renderer', () => {
	it('exports only public text and explicit preview files without private links or embedded source objects', () => {
		const post = {id: '1', title: '<script>bad()</script>', teaser: 'PUBLIC', fullText: 'PRIVATE', free: false,
			media: [{url: 'media/preview', mime: 'image/webp', name: '"><script>bad()</script>'}],
			pageUrl: 'https://site.test/ipfs/private-set', postUrl: 'posts/1.html', secret: 'OWNER-TOKEN'};
		const html = renderMembershipPage({title: 'Creator'}, [post], false);
		assert(html.includes('PUBLIC'));
		assert(!html.includes('PRIVATE'));
		assert(!html.includes('private-set'));
		assert(!html.includes('OWNER-TOKEN'));
		assert(!html.includes('<script>bad()'));
		assert(html.includes('&lt;script&gt;bad()'));
		assert(html.includes('src="media/preview"'));
	});
	it('keeps directory-relative post and page links so a known snapshot never asks for newer content', () => {
		const html = renderMembershipPage({title: 'Creator', homeUrl: 'index.html', pageUrls: ['index.html', 'page-2.html']},
			[{id: '1', title: 'Post', teaser: 'Public', fullText: 'Full', free: false, media: [], postUrl: 'posts/1.html'}], true, false, 1, 2);
		assert(html.includes('href="posts/1.html"'));
		assert(html.includes('href="page-2.html"'));
		assert(html.includes('Full'));
	});
	it('allows only same-site HTTPS IPFS links for canonical exported URLs', () => {
		assert.equal(snapshotUrl('https://site.test/ipfs/bafyexample/', 'site.test'), 'https://site.test/ipfs/bafyexample/');
		for (const url of ['javascript:bad()', 'https://foreign.test/ipfs/bafyexample/', 'https://name:password@site.test/ipfs/bafyexample/', 'https://site.test/api/private']) {
			assert.equal(snapshotUrl(url, 'site.test'), null);
		}
	});
});

describe('snapshot account client', () => {
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
