import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium, expect} from '@playwright/test';
import sharp from 'sharp';
import renderer from '../app/modules/staticSiteGenerator/site/index.js';
import {buildBrowserClient} from '../app/modules/staticSiteGenerator/site/browserBundle.js';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'geesome-gallery-'));
const output = path.resolve(process.env.GEESOME_TEST_OUTPUT || 'test/.geesome-test-output', 'gallery-loading');
await fs.mkdir(output, {recursive: true});
const source = sharp({create: {width: 600, height: 800, channels: 3, background: '#5599bb'}});
const [preview, original, client] = await Promise.all([source.clone().webp().toBuffer(), source.jpeg().toBuffer(), buildBrowserClient()]);
const contents = Array.from({length: 40}, (_, index) => ({
    type: 'image', name: `Image ${index + 1}`, storageId: `original${index + 1}`, extension: 'jpg',
    previewStorageId: `preview${index + 1}`, previewExtension: 'webp',
}));
const data = {contents, defaultRoute: 'content-list', options: {site: {title: 'Gallery loading'}, archive: false}};
const prepared = await renderer.prepareRender(data);
const html = await prepared.renderPage('/content-list', []);
assert.equal(/<img[^>]+src=|background-image:url/.test(html), false, 'SSR starts no image downloads before visibility is known');
const requests = [];
const startedPreviews = new Set();
const held = [];
let holdPreviews = true;
let holdOriginals = true;
let failFirstPreview = false;
function release(kind, index) {
    const entry = held.find(entry => entry.kind === kind && entry.index === index);
    assert.ok(entry, `pending ${kind} ${index}`);
    held.splice(held.indexOf(entry), 1);
    entry.finish();
}
const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://local.invalid');
    const media = url.pathname.match(/\/(preview|content)\/(\d+)_/);
    if (media) {
        const kind = media[1], index = Number(media[2]);
        requests.push({kind, index});
        const finish = () => {
            if (failFirstPreview && kind === 'preview' && index === 1) {
                response.writeHead(404).end();
                return;
            }
            response.writeHead(200, {'content-type': kind === 'preview' ? 'image/webp' : 'image/jpeg',
                'cache-control': 'public, max-age=3600, immutable'}).end(kind === 'preview' ? preview : original);
        };
        if ((kind === 'preview' && holdPreviews) || (kind === 'content' && holdOriginals)) {
            held.push({kind, index, finish});
        } else {
            finish();
        }
        return;
    }
    const assets = {'/': ['text/html', html], '/style.css': ['text/css', prepared.css], '/public/client.js': ['text/javascript', client]};
    const asset = assets[url.pathname];
    response.writeHead(asset ? 200 : 404, {'content-type': asset?.[0] || 'text/plain'}).end(asset?.[1] || '');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
const errors = [];
const manifest = [];
const requested = kind => kind === 'preview' ? [...startedPreviews] : requests.filter(request => request.kind === kind).map(request => request.index);
function observe(page) {
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
        const match = new URL(request.url()).pathname.match(/\/preview\/(\d+)_/);
        if (match) {
            startedPreviews.add(Number(match[1]));
        }
    });
}
async function visible(page) {
    return page.getByTestId('gallery-card').evaluateAll(cards => cards.filter(card => {
        const bounds = card.getBoundingClientRect();
        return bounds.bottom > 0 && bounds.top < innerHeight;
    }).map(card => Number(card.getAttribute('data-gallery-index')) + 1));
}
async function capture(page, name, description) {
    await page.screenshot({path: path.join(output, name)});
    manifest.push({file: name, description, viewport: page.viewportSize()});
}
try {
    const context = await browser.newContext({viewport: {width: 1200, height: 650}});
    const page = await context.newPage();
    observe(page);
    await page.goto(url, {waitUntil: 'domcontentloaded'});
    await expect.poll(() => requested('preview').length).toBeGreaterThan(0);
    const initial = await visible(page);
    await expect.poll(() => requested('preview').length).toBe(initial.length);
    assert.deepEqual([...requested('preview')].sort((a, b) => a - b), initial, 'only visible previews load');
    assert.deepEqual(requested('content'), [], 'originals wait for previews');
    holdPreviews = false;
    for (const entry of [...held].filter(entry => entry.kind === 'preview' && entry.index !== initial[0])) {
        release('preview', entry.index);
    }
    await expect.poll(() => page.locator('.content-item[style*="background-image"]').count()).toBe(initial.length - 1);
    assert.deepEqual(requested('content'), [], 'one unfinished visible preview still blocks warming');
    release('preview', initial[0]);
    await expect.poll(() => requested('content').length).toBe(2);
    assert.deepEqual(requested('content'), initial.slice(0, 2), 'warm from the first visible image with concurrency two');
    release('content', initial[0]);
    await expect.poll(() => requested('content').length).toBe(3);
    assert.equal(requested('content')[2], initial[2], 'a free warm slot takes the next image');
    holdPreviews = true;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const bottom = await visible(page);
    await expect.poll(() => requested('preview').length).toBe(initial.length + bottom.length);
    for (const index of [initial[1], initial[2]]) {
        release('content', index);
    }
    await page.waitForTimeout(100);
    assert.equal(requested('content').length, 3, 'old queued originals stop and new visible previews take priority');
    holdOriginals = false;
    holdPreviews = false;
    for (const entry of [...held].filter(entry => entry.kind === 'preview')) {
        release('preview', entry.index);
    }
    await expect.poll(() => requested('content').length).toBe(3 + bottom.length);
    assert.deepEqual(requested('content').slice(3), bottom, 'only the new viewport is warmed in document order');
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => requested('content').length).toBe(initial.length + bottom.length);
    await page.getByTestId('gallery-card').first().click();
    await page.waitForFunction(() => document.querySelector('.image-modal img')?.naturalWidth > 0);
    assert.equal(requested('content').filter(index => index === 1).length, 1, 'modal reuses the warmed original');
    await capture(page, 'desktop-modal.png', 'The warmed first original is open with close and navigation controls.');
    await page.getByRole('button', {name: 'Close image'}).click();
    await capture(page, 'desktop-gallery.png', 'Visible desktop gallery previews are loaded after closing the viewer.');
    await context.close();

    requests.length = 0;
    startedPreviews.clear();
    held.length = 0;
    holdPreviews = false;
    holdOriginals = true;
    failFirstPreview = true;
    const narrow = await browser.newContext({viewport: {width: 390, height: 844}});
    await narrow.addInitScript(() => { delete window.IntersectionObserver; });
    const mobile = await narrow.newPage();
    observe(mobile);
    await mobile.goto(url, {waitUntil: 'domcontentloaded'});
    await expect.poll(() => requested('content').length).toBe(2);
    assert.deepEqual(requested('content'), [1, 2], 'preview failure does not block visible original warming');
    assert.ok(requested('preview').length < contents.length, 'mobile does not request offscreen previews');
    await mobile.evaluate(() => document.querySelector('#app').__vue_app__.unmount());
    release('content', 1);
    release('content', 2);
    await mobile.waitForTimeout(100);
    assert.equal(requested('content').length, 2, 'unmount stops queued warming');
    await narrow.close();

    await fs.mkdir(path.join(directory, 'public'));
    await fs.mkdir(path.join(directory, 'preview'));
    await fs.mkdir(path.join(directory, 'content'));
    await Promise.all([
        fs.writeFile(path.join(directory, 'index.html'), html), fs.writeFile(path.join(directory, 'style.css'), prepared.css),
        fs.writeFile(path.join(directory, 'public/client.js'), client),
        ...contents.flatMap((content, index) => [
            fs.writeFile(path.join(directory, `preview/${index + 1}_${content.previewStorageId}.webp`), preview),
            fs.writeFile(path.join(directory, `content/${index + 1}_${content.storageId}.jpg`), original),
        ]),
    ]);
    const offline = await browser.newContext({offline: true, viewport: {width: 390, height: 844}});
    const local = await offline.newPage();
    local.on('pageerror', error => errors.push(error.message));
    await local.goto(pathToFileURL(path.join(directory, 'index.html')).href);
    await expect.poll(() => local.locator('.content-item[style*="background-image"]').count()).toBeGreaterThan(0);
    await local.getByTestId('gallery-card').first().click();
    await local.waitForFunction(() => document.querySelector('.image-modal img')?.naturalWidth > 0);
    await capture(local, 'mobile-file-modal.png', 'The extracted offline gallery opens the first original on a narrow screen.');
    await local.getByRole('button', {name: 'Close image'}).click();
    await capture(local, 'mobile-file-gallery.png', 'Only visible mobile previews are loaded in the extracted offline gallery.');
    assert.equal(await local.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'mobile has no horizontal overflow');
    await offline.close();
    assert.deepEqual(errors, [], 'no browser runtime errors');
    await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log('Gallery browser checks passed: visible previews first, ordered originals (two slots), scroll priority, errors, cleanup, warm modal reuse, and file:// mobile.');
} finally {
    for (const entry of held) {
        entry.finish();
    }
    await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(directory, {recursive: true, force: true});
}
