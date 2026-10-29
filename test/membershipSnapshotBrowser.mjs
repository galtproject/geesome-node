import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from '/work/node_modules/playwright/index.mjs';
const root = '/evidence', captures = [], comparisons = [];
const paginationOnly = process.argv.includes('--pagination');
const reference = JSON.parse(await fs.readFile(root + '/reference-state.json', 'utf8'));
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const server = http.createServer(async (req, res) => {
    const relative = new URL(req.url, 'http://localhost').pathname;
    const target = path.resolve(root, '.' + relative + (relative.endsWith('/') ? 'index.html' : ''));
    if (!target.startsWith(root + '/')) {
        res.writeHead(403).end();
        return;
    }
    try {
        const data = await fs.readFile(target);
        res.writeHead(200, { 'content-type': types[path.extname(target)] || (data.toString('utf8',0,1024).includes('<svg') ? 'image/svg+xml' : 'application/octet-stream') }).end(data);
    }
    catch {
        res.writeHead(404).end();
    }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
async function settleCover(page) {
    await page.evaluate(async () => {
        const value = getComputedStyle(document.querySelector('.creator-cover')).backgroundImage;
        const match = value.match(/url\(["']?(.*?)["']?\)/);
        if (match) {
            const image = new Image(); image.src = match[1]; await image.decode();
        }
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    // Chromium may refine scaled CSS background images after their first decoded paint.
    await page.waitForTimeout(500);
}
const origin = `http://127.0.0.1:${server.address().port}`, browser = await chromium.launch({ headless: true });
try {
    for (const viewport of paginationOnly ? [] : [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
        const states = [];
        for (const version of ['reference', 'public']) {
            const context = await browser.newContext({ viewport });
            const page = await context.newPage(), errors = [];
            await page.addInitScript(() => Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{window.sharedUrl=value;}}}));
            let signedIn = false, paid = false, payAllowed = false, accountInvoice = false, storedInvoice = false, createCalls = 0;
            const invoice = () => ({ id: 'invoice', provider: 'direct', status: paid ? 'paid' : 'pending', amount: '4', received: '0', assetId: 'usdc-base', currency: 'USDC', network: 'base', address: '0x1111111111111111111111111111111111111111', expiresAt: '2030-01-01T00:00:00.000Z', monitoringUntil: '2030-01-08T00:00:00.000Z', priceUsd: 4, period: 'month', optionLabel: '1 month' });
            page.on('pageerror', error => errors.push(error.message));
            page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning' && /hydration/i.test(m.text())) {
                errors.push(m.text());
            } });
            await page.route('**/api/**', async (route) => {
                const pathname = new URL(route.request().url()).pathname;
                if (/\/membership\/site(?:\/posts\/1)?\/?$/.test(pathname)) {
                    return route.fulfill({ status: 302, headers: { location: `${origin}/${paid ? 'full' : 'public'}/${pathname.includes('/posts/') ? 'posts/1.html' : 'index.html'}` } });
                }
                let data;
                if (pathname.endsWith('/account')) {
                    data = { reader: signedIn ? { id: 'reader', name: 'Test reader' } : null, active: paid, expiresAt: paid ? '2030-01-01T00:00:00.000Z' : null, invoices: (accountInvoice || storedInvoice) ? [{ id: 'invoice', optionSnapshot: reference.resource.options[0], status: paid ? 'paid' : 'pending', createdAt: '2026-10-27T00:00:00.000Z', provider: 'direct', ...(version === 'reference' ? { crypto: invoice() } : {}) }] : [], refunds: [] };
                }
                else if (pathname.endsWith('/resource')) {
                    data = { ...reference.resource, cryptoMethods: [{ id: 'usdc-base', currency: 'USDC', network: 'base', networkLabel: 'Base', available: true }] };
                }
                else if (pathname.endsWith('/challenge')) {
                    data = { googleClientId: 'test-client', nonce: 'test-nonce' };
                }
                else if (pathname.endsWith('/google')) {
                    signedIn = true;
                    data = {};
                }
                else if (pathname.endsWith('/logout')) {
                    signedIn = false;
                    paid = false;
                    data = {};
                }
                else if (pathname.endsWith('/refunds')) {
                    data = { id: 'refund', status: 'requested' };
                }
                else if (/\/posts\/1$/.test(pathname)) {
                    data = reference.posts[0];
                }
                else if (pathname.endsWith('/feed')) {
                    data = new URL(page.url()).pathname.endsWith('/account.html') ? {posts:[],hasMore:false,nextOffset:null} : { posts: reference.posts, hasMore: true, nextOffset: 20 };
                }
                else if (pathname.endsWith('/invoices')) {
                    createCalls++;
                    storedInvoice = true;
                    data = invoice();
                }
                else if (pathname.endsWith('/invoices/invoice')) {
                    if (payAllowed) {
                        paid = true;
                    }
                    data = invoice();
                }
                else {
                    throw Error('Unexpected API ' + pathname);
                }
                return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
            });
            await page.route('https://accounts.google.com/gsi/client*', route => route.fulfill({ contentType: 'text/javascript', body: `window.google={accounts:{id:{initialize(value){this.callback=value.callback},renderButton(target){const button=document.createElement('button');button.textContent='Mock Google sign in';button.onclick=()=>this.callback({credential:'mock'});target.append(button)}}}};` }));
            const capture = async (name, description) => {
                await settleCover(page);
                await page.locator('img').evaluateAll(images => Promise.all(images.map(i => i.complete ? Promise.resolve() : new Promise(resolve => { i.onload = resolve; i.onerror = resolve; }))));
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'no horizontal overflow');
                assert.equal(await page.locator('img:visible').evaluateAll(images => images.some(i => !i.complete || !i.naturalWidth)), false, 'no broken images');
                const file = `${viewport.width}-${version}-${name}.png`;
                await page.screenshot({ path: path.join(root, file), fullPage: true });
                const controls = await page.locator('button:visible,a:visible,input:visible,select:visible,textarea:visible').evaluateAll(items=>items.map(item=>({tag:item.tagName,text:(item.getAttribute('aria-label')||item.textContent||'').trim(),type:item.getAttribute('type'),disabled:Boolean(item.disabled)})));
                assert.equal(await page.locator('input[type=file]').count(),0,'reader receives no upload controls');
                captures.push({ file, description, viewport, version, state: name, controls });
                if(version==='public') {
                    const original=captures.find(item=>item.version==='reference'&&item.state===name&&item.viewport.width===viewport.width);
                    assert.deepEqual(controls,original.controls,`No missing or extra controls in ${name}`);
                }
                if (version === 'public') {
                    comparisons.push({ reference: `${viewport.width}-reference-${name}.png`, actual: file, state: name, viewport });
                }
            };
            await page.goto(`${origin}/${version}/index.html`);
            await page.getByTestId('reader-login').waitFor();
            await page.getByTestId('subscribe-post').waitFor({ state: 'visible' });
            await capture('home', 'Existing creator layout: cover, avatar, links, Join price, public card and Load more.');
            await page.getByTestId('share-post').click();
            assert.equal(await page.evaluate(()=>window.sharedUrl),`${origin}/${version==='reference'?'reference/posts/1':'public/posts/1.html'}`,'Share resolves a usable immutable post URL');
            await page.goto(`${origin}/${version}/${version === 'reference' ? 'post.html' : 'posts/1.html'}`);
            await page.getByTestId('subscribe-post').waitFor({ state: 'visible' });
            await capture('post', 'Original public post detail with All posts, preview images, share and membership controls.');
            await page.getByTestId('preview-0').click();
            await page.getByRole('button', { name: 'Next →' }).click();
            await page.getByText('2 / 2', { exact: true }).waitFor();
            await capture('gallery', 'Second public preview, previous/next controls and close button match the original gallery.');
            await page.keyboard.press('Escape');
            await page.getByTestId('reader-login').click();
            await page.getByRole('button', { name: 'Mock Google sign in' }).waitFor();
            await capture('login', 'Original sign-in dialog and Google control, without extra account or payment controls.');
            await page.getByRole('button', { name: 'Mock Google sign in' }).click();
            await page.getByTestId('account-link').waitFor();
            await page.getByTestId('join-membership').click();
            await page.getByTestId('membership-plan-month').waitFor();
            await capture('plans', 'Original subscription dialog with monthly/six-month prices, benefits and one-time payment notice.');
            await page.getByTestId('direct-crypto-payment').click();
            await page.getByTestId('crypto-checkout').waitFor();
            await page.locator('.crypto-qr').waitFor();
            await capture('payment', 'Original direct crypto checkout opening: QR, network/currency selectors and plan sidebar.');
            await page.getByTestId('crypto-status-control').scrollIntoViewIfNeeded();
            await capture('payment-details','Scrolled crypto checkout exposes the receiving address, exact amount, quote expiry, confirmation status and manual check.');
            await page.getByTestId('crypto-help').scrollIntoViewIfNeeded();
            await capture('payment-help','Scrolled checkout exposes the original plan benefits and crypto help, with no missing lower content.');
            await page.getByRole('button', { name: 'Close dialog' }).click();
            await page.getByTestId('join-membership').click();
            await page.getByTestId('direct-crypto-payment').click();
            await page.locator('.crypto-qr').waitFor();
            assert.equal(createCalls, 1, 'returning to checkout resumes the same pending quote');
            paid = true;
            accountInvoice = true;
            await page.goto(`${origin}/${version === 'reference' ? 'reference' : 'full'}/account.html`);
            await page.getByTestId('reader-account').waitFor();
            await capture('account', 'Original signed-in account with expiry, payment history, refund action and sign out.');
            await page.getByTestId('refund-invoice').click();
            await capture('refund', 'Original refund dialog with explanation, reason input and submit action.');
            await page.getByRole('button', { name: 'Close dialog' }).click();
            if (version === 'public') {
                paid = false;
                accountInvoice = false;
                await page.goto(`${origin}/public/posts/1.html`);
                await page.getByTestId('join-membership').click();
                await page.getByTestId('direct-crypto-payment').click();
                await page.locator('.crypto-qr').waitFor();
                payAllowed = true;
                await page.waitForURL(url => url.pathname === '/full/posts/1.html', { timeout: 15000 });
                await page.getByText('PRIVATE BODY', { exact: true }).waitFor();
                await page.getByRole('link', { name: 'Private download', exact: true }).waitFor();
                await page.getByRole('link', {name:'Read manual',exact:true}).waitFor();
                await page.screenshot({ path: path.join(root, `${viewport.width}-full-post.png`), fullPage: true });
                captures.push({ file: `${viewport.width}-full-post.png`, description: 'Complete immutable post contains private text, a named IPFS document link, a download and the original gallery action after payment.', viewport, state: 'full-post' });
                await context.route('**/ipfs/bafkreihai2kno6iph4yweurfqc7owuunxc5p43kntfv2dqctkukbfntlhy/**', route => route.fulfill({contentType:'text/html',body:route.request().url().includes('manual.pdf') ? '<h1>Manual</h1>' : '<h1>Existing gallery</h1>'}));
                const galleryPage = page.waitForEvent('popup');
                await page.getByTestId('content-link').filter({hasText:'View full set'}).click();
                const gallery = await galleryPage;
                await gallery.getByRole('heading', {name:'Existing gallery'}).waitFor();
                assert.equal(new URL(gallery.url()).pathname, '/ipfs/bafkreihai2kno6iph4yweurfqc7owuunxc5p43kntfv2dqctkukbfntlhy/');
                await gallery.close();
                const manualPage = page.waitForEvent('popup');
                await page.getByTestId('content-link').filter({hasText:'Read manual'}).click();
                const manual = await manualPage;
                await manual.getByRole('heading', {name:'Manual',exact:true}).waitFor();
                assert.equal(new URL(manual.url()).pathname, '/ipfs/bafkreihai2kno6iph4yweurfqc7owuunxc5p43kntfv2dqctkukbfntlhy/manual.pdf');
                assert.equal(new URL(manual.url()).hash, '#page=2');
                await manual.close();
                await page.getByTestId('account-link').click();
                await page.waitForURL(url => url.pathname === '/full/account.html');
                await page.getByTestId('reader-logout').click();
                await page.waitForURL(url => url.pathname === '/public/index.html');
                assert(!await page.content().then(html => html.includes('PRIVATE BODY') || html.includes('bafkreihai2kno6iph4yweurfqc7owuunxc5p43kntfv2dqctkukbfntlhy')));
                await page.getByRole('button', { name: 'Load more' }).click();
                await page.waitForURL(url => url.pathname === '/public/page-2.html');
                assert(!await page.content().then(html => html.includes('PRIVATE BODY') || html.includes('bafkreihai2kno6iph4yweurfqc7owuunxc5p43kntfv2dqctkukbfntlhy')));
            }
            assert.deepEqual(errors, [], `${version} browser errors`);
            states.push({ version });
            await context.close();
        }
    }
    for (const viewport of paginationOnly ? [] : [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
        for (const id of ['meat', 'newsite']) {
            for (const version of ['reference', 'public']) {
                const page = await browser.newPage({ viewport });
                await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(route.request().url().includes('/account') ? { reader: null } : { posts: reference.posts, hasMore: true, nextOffset: 20 }) }));
                await page.goto(`${origin}/${id}-${version}/index.html`);
                await page.getByTestId('subscribe-post').waitFor({ state: 'visible' });
                await page.locator('img').evaluateAll(images => Promise.all(images.map(i => i.complete ? Promise.resolve() : new Promise(resolve => { i.onload = resolve; i.onerror = resolve; }))));
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
                assert.equal(await page.locator('img').evaluateAll(images => images.some(i => !i.complete || !i.naturalWidth)), false);
                await settleCover(page);
                const file = `${viewport.width}-${id}-${version}.png`;
                await page.screenshot({ path: path.join(root, file), fullPage: true });
                captures.push({ file, description: id === 'meat' ? 'Second resource uses the same layout with its red accent and resource title.' : 'Missing optional branding renders the same original fallback, with no broken cover/avatar.', viewport, version, state: id });
                if (version === 'public') {
                    comparisons.push({ reference: `${viewport.width}-${id}-reference.png`, actual: file, state: id, viewport });
                }
                await page.close();
            }
        }
    }
    for (const viewport of [{width:1280,height:900},{width:390,height:844}]) {
        for (const javaScriptEnabled of [true,false]) {
            const context = await browser.newContext({viewport,javaScriptEnabled});
            const page = await context.newPage(), errors = [];
            page.on('pageerror',error=>errors.push(error.message));
            await page.route('**/api/**', route=>route.fulfill({contentType:'application/json',body:JSON.stringify({reader:null,active:false,invoices:[],refunds:[]})}));
            const capture = async(name,description)=>{
                await page.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode().catch(()=>{}))));
                assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
                assert.equal(await page.locator('img:visible').evaluateAll(images=>images.some(image=>!image.naturalWidth)),false);
                if (!javaScriptEnabled) {
                    assert.equal(await page.locator('.preview-image-state .image-status:visible').count(),0);
                }
                if (name === 'archive') {
                    await page.locator('.member-footer').scrollIntoViewIfNeeded();
                }
                if (name === 'full-post') {
                    await page.getByTestId('post-51').locator('.post-copy').scrollIntoViewIfNeeded();
                }
                const file=`${viewport.width}-pagination-${javaScriptEnabled?'js':'nojs'}-${name}.png`;
                await page.screenshot({path:path.join(root,file),fullPage:false});
                captures.push({file,description,viewport,state:`pagination-${name}`,javaScriptEnabled});
            };
            await page.goto(`${origin}/paged/`);
            await page.getByTestId('post-51').waitFor();
            if (javaScriptEnabled) {
                await page.waitForTimeout(250);
            }
            assert.equal(new URL(page.url()).hash,'');
            assert.equal(await page.locator('.member-post').count(),11);
            assert.equal(await page.getByTestId('load-more').count(),0);
            assert.equal(await page.getByTestId('latest-posts').count(),0);
            assert.equal(await page.getByTestId('footer-home').getAttribute('href'),'./');
            assert((await page.locator('.member-footer').textContent()).includes('Powered by GeeSome'));
            assert.equal(await page.getByTestId('newer-posts').count(),0);
            assert(!await page.content().then(html=>html.includes('PRIVATE 51')));
            assert.equal(await page.locator('.creator-profile h1').textContent(),'Archive creator');
            assert.equal(await page.getByTestId('post-51').locator('h2').textContent(),'Feb 20, 2026');
            assert.equal(await page.getByTestId('post-51').locator('.post-copy>time,.post-copy>.post-description').count(),0);
            assert.equal(await page.locator('.patreon-link').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 118, 94)');
            assert.equal(await page.getByTestId('footer-home').evaluate(el=>getComputedStyle(el).textDecorationLine),'underline');
            assert.equal(await page.locator('.social-icons a').first().evaluate(el=>el.getBoundingClientRect().width),64);
            await capture('home','Creator profile uses the public display title, coral Patreon and a full-width three-column social grid with readable labels, including the repaired Bluesky butterfly.');
            await page.getByTestId('post-51').locator('.post-copy').scrollIntoViewIfNeeded();
            await capture('card','Technical own-domain timestamp is presented as one readable date, with no empty description gap and compact Share/subscription actions.');
            await page.getByTestId('post-50').locator('.post-copy').scrollIntoViewIfNeeded();
            await capture('long-title','A long authored title wraps without clipping or overflow; its text and publication date remain intact.');
            if (javaScriptEnabled) {
                await page.getByTestId('expand-links').click();
                await page.getByTestId('social-links').scrollIntoViewIfNeeded();
                await capture('social-expanded','Expanded social links retain labels, uniform icon sizes and visible underlines, including a link without an image.');
                await page.getByTestId('expand-links').click();
            }
            await page.locator('.member-footer').scrollIntoViewIfNeeded();
            await capture('home-navigation','The sole Older posts link is right aligned below the homepage, with no Newer link and with an underlined footer home link.');
            await page.getByTestId('older-posts').click();
            await page.waitForURL(url=>url.pathname==='/paged/page/4/');
            await page.getByTestId('post-40').waitFor();
            assert.equal(new URL(page.url()).hash,'');
            assert.equal(await page.locator('.member-post').count(),10);
            assert.equal(await page.getByTestId('post-41').count(),0);
            assert.equal(await page.getByTestId('newer-posts').getAttribute('href'),'../../');
            const older = page.getByTestId('older-posts');
            await older.scrollIntoViewIfNeeded();
            await capture('archive','Bottom of archive 4 shows its last post 31, correctly aligned Newer/Older navigation and visibly underlined footer links; the ten-post count and clean directory URL are verified independently.');
            if (javaScriptEnabled) {
                await older.focus();
                await page.keyboard.press('Tab');
                assert.equal(await page.getByTestId('footer-home').evaluate(el=>el === document.activeElement),true);
                assert.equal(await page.getByTestId('footer-home').evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
            }
            await older.click();
            await page.waitForURL(url=>url.pathname==='/paged/page/3/');
            await page.getByTestId('post-30').waitFor();
            await page.getByTestId('newer-posts').click();
            await page.waitForURL(url=>url.pathname==='/paged/page/4/');
            assert.equal(await page.getByTestId('footer-home').getAttribute('href'),'../../');
            await page.getByTestId('footer-home').click();
            await page.waitForURL(url=>url.pathname==='/paged/');
            await page.goto(`${origin}/paged/posts/51/`);
            await page.getByTestId('post-51').locator('h2').waitFor();
            assert.equal(await page.getByTestId('post-51').locator('h2').textContent(),'Feb 20, 2026');
            assert.equal(new URL(page.url()).hash,'');
            assert.equal(await page.locator('a.back-link').getAttribute('href'),'../../');
            if (javaScriptEnabled) {
                const icon = page.locator('.social-icons a[aria-label="Bluesky"] img');
                const iconPath = '**' + new URL(await icon.getAttribute('src'), origin).pathname;
                await page.route(iconPath, route=>route.fulfill({status:404,body:''}));
                await page.reload();
                await page.locator('.social-icons a[aria-label="Bluesky"] .social-fallback').waitFor();
                assert.equal(await page.locator('.social-icons a[aria-label="Bluesky"] img').count(),0);
                await page.getByTestId('social-links').scrollIntoViewIfNeeded();
                await capture('icon-fallback','An unavailable social image is replaced by a labelled link fallback without a broken image or a missing link.');
                await page.unroute(iconPath);
            }
            if (javaScriptEnabled) {
                for (const count of [3,5,6,7]) {
                    await page.goto(`${origin}/paged/social-${count}.html`);
                    const block = page.getByTestId('social-links');
                    await block.scrollIntoViewIfNeeded();
                    assert.equal(await block.locator('.social-icons>a').count(),count);
                    const boxes = await block.locator('.social-icons>a').evaluateAll(items=>items.map(item=>{const r=item.getBoundingClientRect();return {x:r.x,y:r.y};}));
                    for (let i=3;i<count;i++) assert(Math.abs(boxes[i].x-boxes[i%3].x)<1);
                    await capture(`social-${count}`,`${count} social links align to three stable columns on the full sidebar width; the seven-link case retains a long custom label and a square custom image.`);
                    await page.getByTestId('expand-links').click();
                    assert.equal(await block.locator('.social-icons').count(),0);
                    assert.equal(await block.locator('.full-links li').count(),count);
                    assert.equal(await block.locator('a[href="https://patreon.com/example"]').count(),1);
                    await capture(`social-${count}-expanded`,`${count} links expand into a labelled list, with one Patreon button and no duplicate icon grid.`);
                }
            }
            await page.goto(`${origin}/paged-full/posts/51/`);
            await page.getByText('PRIVATE 51',{exact:true}).waitFor();
            await page.getByTestId('post-51').locator('.post-copy').scrollIntoViewIfNeeded();
            await capture('full-post','The complete immutable post retains its full text with the same compact title and action styling.');
            assert.deepEqual(errors,[]);
            await context.close();
        }
    }
    // New checkout behavior intentionally differs from the legacy reference.
    for (const viewport of paginationOnly ? [] : [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
        const page = await browser.newPage({ viewport });
        const methods = [
            {id:'eth-ethereum',currency:'ETH',network:'ethereum',networkLabel:'Ethereum',available:true},
            {id:'usdc-base',currency:'USDC',network:'base',networkLabel:'Base',available:true},
            {id:'usdt-arbitrum',currency:'USDT',network:'arbitrum',networkLabel:'Arbitrum One',available:true},
            {id:'usdt-ethereum',currency:'USDT',network:'ethereum',networkLabel:'Ethereum',available:true},
            {id:'usdt-tron',currency:'USDT',network:'tron',networkLabel:'TRON',available:false},
            {id:'btc-bitcoin',currency:'BTC',network:'bitcoin',networkLabel:'Bitcoin',available:false},
        ];
        const assets = [];
        let resumed = false;
        const quote = assetId => ({id:'invoice',provider:'direct',status:'pending',assetId,
            currency:assetId === 'usdc-base' ? 'USDC' : 'USDT',network:assetId === 'usdc-base' ? 'base' : 'ethereum',
            amount:'4',received:'0',address:'0x1111111111111111111111111111111111111111',expiresAt:'2030-01-01T00:00:00Z',
            priceUsd:4,period:'month',optionLabel:'1 month'});
        await page.route('**/api/**', async route => {
            const pathname = new URL(route.request().url()).pathname;
            let data;
            if (pathname.endsWith('/resource')) {
                data = {...reference.resource,cryptoMethods:methods};
            } else if (pathname.endsWith('/account')) {
                data = {reader:{id:'reader',name:'Test reader'},active:false,invoices:resumed ? [{id:'invoice',provider:'direct',status:'pending',createdAt:'2026-10-28T00:00:00Z',optionSnapshot:reference.resource.options[0]}] : [],refunds:[]};
            } else if (pathname.endsWith('/feed')) {
                data = {posts:reference.posts,hasMore:false};
            } else if (pathname.endsWith('/invoices')) {
                const assetId = route.request().postDataJSON().assetId;
                assets.push(assetId);
                data = quote(assetId);
            } else if (pathname.endsWith('/invoices/invoice')) {
                data = quote('usdc-base');
            } else {
                throw Error('Unexpected checkout API ' + pathname);
            }
            return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
        });
        const captureCheckout = async (name, description) => {
            await page.locator('.crypto-qr').waitFor();
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
            assert.equal(await page.locator('img:visible').evaluateAll(images => images.some(i => !i.complete || !i.naturalWidth)), false);
            const file = `${viewport.width}-${name}.png`;
            await page.screenshot({path:path.join(root,file),fullPage:true});
            captures.push({file,description,viewport,state:name});
        };
        await page.goto(`${origin}/public/index.html`);
        await page.getByTestId('account-link').waitFor();
        await page.getByTestId('join-membership').click();
        const quoteReady = page.waitForResponse(response => response.request().method() === 'POST'
            && new URL(response.url()).pathname.endsWith('/invoices'));
        await page.getByTestId('direct-crypto-payment').click();
        await quoteReady;
        await page.locator('.crypto-qr').waitFor();
        assert.deepEqual(assets,['usdt-ethereum']);
        assert.equal(await page.getByTestId('crypto-currency-USDT').getAttribute('aria-pressed'),'true');
        assert.equal(await page.getByTestId('crypto-network').inputValue(),'usdt-ethereum');
        assert.deepEqual(await page.getByTestId('crypto-network').locator('option').allTextContents(),['Arbitrum One','Ethereum']);
        assert.equal(await page.getByTestId('crypto-currency-BTC').count(),0);
        assert(!await page.locator('.crypto-checkout').textContent().then(text => text.toLowerCase().includes('unavailable')));
        await captureCheckout('checkout-usdt-default','New checkout selects USDT Ethereum, offers only available networks, and omits unavailable BTC/TRON choices.');
        await page.getByRole('button',{name:'Close dialog'}).click();
        resumed = true;
        methods.find(m => m.id === 'usdc-base').available = false;
        await page.goto(`${origin}/public/account.html`);
        await page.getByTestId('crypto-resume-invoice').click();
        await page.locator('.crypto-qr').waitFor();
        assert.equal((await page.getByTestId('crypto-invoice-network').textContent()).toLowerCase(),'base');
        assert.equal(await page.getByTestId('crypto-network').count(),0);
        assert.equal(await page.getByTestId('crypto-currency-USDC').count(),0);
        assert.equal(await page.getByTestId('crypto-currency-BTC').count(),0);
        assert.equal(assets.length,1,'resumed invoice must not create a replacement quote');
        await captureCheckout('checkout-resume-unavailable','Existing USDC Base invoice keeps its QR and network while unavailable methods are absent from new-payment choices.');
        await page.close();
    }
    const compare = await browser.newPage();
    await compare.goto(`${origin}/reference/style.css`);
    for (const item of comparisons) {
        const result = await compare.evaluate(async ({ reference, actual }) => {
            const load = src => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; });
            const a = await load('/' + reference), b = await load('/' + actual);
            if (a.width !== b.width || a.height !== b.height) {
                return { dimensions: false, reference: [a.width, a.height], actual: [b.width, b.height] };
            }
            const canvas = document.createElement('canvas');
            canvas.width = a.width;
            canvas.height = a.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(a, 0, 0);
            const first = ctx.getImageData(0, 0, a.width, a.height).data;
            ctx.clearRect(0, 0, a.width, a.height);
            ctx.drawImage(b, 0, 0);
            const second = ctx.getImageData(0, 0, a.width, a.height).data;
            let different = 0, material = 0, maxChannelDifference = 0;
            for (let i = 0; i < first.length; i += 4) {
                const delta = Math.max(Math.abs(first[i] - second[i]), Math.abs(first[i + 1] - second[i + 1]), Math.abs(first[i + 2] - second[i + 2]));
                maxChannelDifference = Math.max(maxChannelDifference, delta);
                if (delta > 0) {
                    different++;
                }
                if (delta > 5) {
                    material++;
                }
            }
            return { dimensions: true, differentPixels: different, totalPixels: a.width * a.height, ratio: different / (a.width * a.height), materiallyDifferentPixels: material, maxChannelDifference };
        }, item);
        item.result = result;
    }
    await fs.writeFile(root + '/parity.json', JSON.stringify(comparisons, null, 2));
    assert(comparisons.every(item => item.result.dimensions && item.result.materiallyDifferentPixels === 0 && item.result.ratio < 0.0001), 'All original/new UI pairs must match in size and pixels (only 5/255 raster rounding on fewer than 0.01% pixels is allowed); see parity.json');
}
finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
    await fs.writeFile(root + '/captures.json', JSON.stringify(captures, null, 2));
    await fs.writeFile(root + '/comparisons.json', JSON.stringify(comparisons, null, 2));
}
console.log(`${captures.length} reference/creator captures verified`);
