// Uses the existing local Playwright image; the rendered fixture is mounted at /evidence.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from '/work/node_modules/playwright/index.mjs';

const root = '/evidence', captures = [];
const types = {'.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.txt': 'text/plain'};
const server = http.createServer(async (req, res) => {
    const relative = new URL(req.url, 'http://localhost').pathname;
    const target = path.resolve(root, '.' + relative);
    if (!target.startsWith(root + '/')) return res.writeHead(403).end();
    try { res.writeHead(200, {'content-type': types[path.extname(target)] || 'application/octet-stream'}).end(await fs.readFile(target)); }
    catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless: true});
try {
    for (const viewport of [{width: 1280, height: 900}, {width: 390, height: 844}]) {
        const context = await browser.newContext({viewport});
        const page = await context.newPage(), errors = [];
        let signedIn = false, paid = false;
        const requests = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning' && /hydration/i.test(message.text())) errors.push(message.text()); });
        await page.route('**/api/v1/**', async route => {
            const pathname = new URL(route.request().url()).pathname;
            requests.push(pathname);
            if (pathname.endsWith('/client.js')) return route.fulfill({contentType: 'text/javascript', body: await fs.readFile(path.join(root, 'membership.js'), 'utf8')});
            if (/\/membership\/site(?:\/posts\/1)?\/?$/.test(pathname)) return route.fulfill({status: 302, headers: {location: `${origin}/${paid ? 'full' : 'public'}/${pathname.includes('/posts/') ? 'posts/1.html' : 'index.html'}`}});
            let data;
            if (pathname.endsWith('/membership/account')) data = {reader: signedIn ? {id: 'reader'} : null, active: paid};
            else if (pathname.endsWith('/membership/resource')) data = {options: [{id: 'monthly', label: 'Monthly', amountCents: 400, currency: 'USD'}]};
            else if (pathname.endsWith('/login/google/challenge')) data = {googleClientId: 'test-client', nonce: 'test-nonce'};
            else if (pathname.endsWith('/login/google')) { signedIn = true; data = {}; }
            else if (pathname.endsWith('/browser-session/logout')) { signedIn = false; paid = false; data = {}; }
            else if (pathname.endsWith('/methods')) data = {methods: [{id: 'asset', available: true, currency: 'TEST', networkLabel: 'Mock chain'}]};
            else if (pathname.endsWith('/invoices')) data = {id: 'invoice', status: 'pending', amount: '4', currency: 'TEST', network: 'Mock chain', address: 'mock-address'};
            else if (pathname.endsWith('/invoices/invoice')) { paid = true; data = {id: 'invoice', status: 'paid'}; }
            else throw Error('Unexpected mock API path: ' + pathname);
            return route.fulfill({contentType: 'application/json', body: JSON.stringify(data)});
        });
        await page.route('https://accounts.google.com/gsi/client', route => route.fulfill({contentType: 'text/javascript', body: `window.google={accounts:{id:{initialize(value){this.callback=value.callback},renderButton(target){const button=document.createElement('button');button.textContent='Mock Google sign in';button.onclick=()=>this.callback({credential:'mock'});target.append(button)}}}};`}));
        const capture = async (name, description) => {
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'page has no horizontal overflow');
            assert.equal(await page.locator('img').evaluateAll(images => images.some(image => !image.complete || !image.naturalWidth)), false, 'all visible attachment images load');
            const file = `${viewport.width}-${name}.png`;
            await page.screenshot({path: path.join(root, file), fullPage: true});
            captures.push({file, description, viewport});
        };
        await page.goto(`${origin}/public/index.html`);
        await page.waitForFunction(() => Boolean(document.querySelector('#app')?.__vue_app__));
        assert.equal(await page.locator('#base-list-layout').count(), 1);
        assert(!await page.content().then(html => html.includes('PRIVATE BODY')));
        await page.getByRole('link', {name: '2', exact: true}).click();
        await page.waitForURL(url => url.pathname === '/public/page-2.html');
        await page.locator('.post-date').click();
        await page.waitForURL(url => url.pathname === '/public/posts/1.html').catch(error => { throw Error(`${error.message}; current=${page.url()}; requests=${JSON.stringify(requests)}`); });
        assert.equal(await page.locator('#vuepress-theme-blog__post-layout').count(), 1);
        await capture('public-post', 'Shared post template shows public attachment and subscription notice, without private body.');
        await page.getByRole('button', {name: 'Account and subscription'}).click();
        await page.getByRole('button', {name: 'Sign in with Google'}).click();
        await Promise.all([page.waitForEvent('domcontentloaded'), page.getByRole('button', {name: 'Mock Google sign in'}).click()]);
        await page.waitForURL(url => url.pathname === '/public/posts/1.html').catch(error => { throw Error(`${error.message}; current=${page.url()}; requests=${JSON.stringify(requests)}`); });
        await page.getByRole('button', {name: 'Account and subscription'}).click();
        await page.getByRole('button', {name: 'Create payment invoice'}).waitFor();
        await capture('account', 'Account component shows signed-in unpaid subscription choices using mocked payment methods.');
        await page.getByRole('button', {name: 'Create payment invoice'}).click();
        await page.waitForURL(url => url.pathname === '/full/posts/1.html', {timeout: 15000});
        await page.getByText('PRIVATE BODY', {exact: true}).waitFor();
        await page.getByRole('link', {name: 'Private download'}).waitFor();
        await capture('full-post', 'Same shared post template shows full text and private download after mocked payment confirmation.');
        await page.getByRole('button', {name: 'Account and subscription'}).click();
        await page.getByRole('button', {name: 'Sign out', exact: true}).click();
        await page.waitForURL(url => url.pathname === '/public/posts/1.html').catch(error => { throw Error(`${error.message}; current=${page.url()}; requests=${JSON.stringify(requests)}`); });
        assert.equal(await page.getByText('PRIVATE BODY', {exact: true}).count(), 0);
        assert.deepEqual(errors, [], 'SSR hydration and account controls report no browser errors');
        await context.close();
    }
} finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
    await fs.writeFile(path.join(root, 'captures.json'), JSON.stringify(captures, null, 2));
}
console.log(`${captures.length} shared-template browser captures verified`);
