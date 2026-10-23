import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {chromium} from '@playwright/test';
import {readArchive} from '../test/helpers/archive.js';

const output = path.resolve(process.env.GEESOME_TEST_OUTPUT || 'test/.geesome-test-output');
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'geesome-offline-'));
const browser = await chromium.launch();
const screenshots = path.join(output, 'offline-browser');
const captures = [];
await fs.mkdir(screenshots, {recursive: true});

async function capture(page, name, description) {
    await page.screenshot({path: path.join(screenshots, name)});
    captures.push({file: name, description, viewport: page.viewportSize(), protocol: new URL(page.url()).protocol});
}

async function extract(name) {
    const entries = await readArchive(await fs.readFile(path.join(output, `${name}.tar.gz`)));
    const directory = path.join(temporary, name);
    for (const [relative, bytes] of entries) {
        const target = path.resolve(directory, relative);
        assert.ok(target.startsWith(directory + path.sep), 'archive path stays inside extraction directory');
        await fs.mkdir(bytes === null ? target : path.dirname(target), {recursive: true});
        if (bytes !== null) {
            await fs.writeFile(target, bytes);
        }
    }
    return {directory, entries, index: [...entries.keys()].find(name => /^[^/]+\/index.html$/.test(name))};
}

async function checkGallery(page, url, screenshot) {
    page.setDefaultTimeout(15000);
    await page.goto(url);
    await page.waitForFunction(() => Boolean(document.querySelector('#app')?.__vue_app__));
    assert.equal(await page.evaluate(() => window.injected), undefined, 'inline JSON cannot terminate its script element');
    const previewLoaded = await page.locator('.content-item').first().evaluate(async element => {
        const background = getComputedStyle(element).backgroundImage;
        const url = background.match(/^url\(["']?(.*?)["']?\)$/)?.[1];
        if (!url || !url.includes('/preview/')) {
            return false;
        }
        const image = new Image();
        image.src = url;
        await image.decode();
        return image.naturalWidth > 0;
    });
    assert.equal(previewLoaded, true, 'gallery previews load from preview/');
    await page.locator('.content-item').first().click();
    const modal = page.locator('.image-modal');
    await modal.waitFor({state: 'visible'});
    const image = modal.locator('img');
    await page.waitForFunction(() => document.querySelector('.image-modal img')?.naturalWidth > 0);
    for (const control of [image, page.getByRole('button', {name: 'Close image'})]) {
        const bounds = await control.boundingBox();
        const viewport = page.viewportSize();
        assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 &&
            bounds.x + bounds.width <= viewport.width + 1 &&
            bounds.y + bounds.height <= viewport.height + 1, 'viewer image and close control fit the viewport');
    }
    const first = await image.getAttribute('src');
    assert.ok(first.includes('content/'), 'the viewer opens the original from content/');
    await modal.locator('.arrow-right').click();
    await page.waitForFunction(first => document.querySelector('.image-modal img')?.getAttribute('src') !== first, first);
    await page.waitForFunction(() => {
        const image = document.querySelector('.image-modal img') as HTMLImageElement;
        return image.complete && image.naturalWidth > 0;
    });
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(first => document.querySelector('.image-modal img')?.getAttribute('src') === first, first);
    await image.click();
    assert.equal(await modal.isVisible(), true, 'image clicks do not close the modal');
    await capture(page, `${screenshot}-modal.png`, 'The first image is open in the viewer with its close button and previous/next arrows.');
    await page.getByRole('button', {name: 'Close image'}).click();
    await modal.waitFor({state: 'detached'});
    await page.locator('.content-item').nth(1).click();
    await modal.waitFor({state: 'visible'});
    await modal.click({position: {x: 1, y: 1}});
    await modal.waitFor({state: 'detached'});
    await capture(page, `${screenshot}-gallery.png`, 'The extracted gallery is visible after closing the image viewer.');
}

let server;
try {
    const gallery = await extract('offline-gallery');
    const group = await extract('offline-group');
    const offline = await browser.newContext({offline: true, viewport: {width: 1200, height: 800}});
    const errors = [], remote = [];
    const page = await offline.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error') {
            errors.push(message.text());
        }
    });
    page.on('request', request => {
        if (/^https?:/.test(request.url())) {
            remote.push(request.url());
        }
    });
    await checkGallery(page, pathToFileURL(path.join(gallery.directory, gallery.index)).href, 'file');
    assert.equal(await page.getByTestId('site-archive-control').count(), 0, 'already downloaded archives need no API control');
    await page.setViewportSize({width: 390, height: 844});
    await checkGallery(page, pathToFileURL(path.join(gallery.directory, gallery.index)).href, 'file-narrow');
    const post = [...group.entries.keys()].find(name => /\/post\/\d+\/index.html$/.test(name));
    await page.goto(pathToFileURL(path.join(group.directory, post)).href);
    await page.waitForFunction(() => Boolean(document.querySelector('#app')?.__vue_app__));
    await page.waitForFunction(() => document.querySelector('.post-page-content img')?.naturalWidth > 0);
    assert.equal(await page.locator('.post-page-content img').count(), 1, 'nested static post keeps its route during hydration');
    assert.deepEqual(remote, [], 'file browsing makes no HTTP/API requests');
    assert.deepEqual(errors, [], 'file browsing has no JS/CORS/hydration errors');
    await offline.close();

    const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.ico': 'image/x-icon'};
    server = createServer(async (request, response) => {
        const pathname = new URL(request.url, 'http://local.invalid').pathname;
        if (pathname.startsWith('/api/v1/archive/')) {
            response.writeHead(200, {'content-type': 'application/json'}).end(JSON.stringify({archivedStorageId: 'ready'}));
            return;
        }
        const relative = pathname.replace(/^\/ipfs\//, '').replace(/\/$/, '/index.html');
        const file = path.resolve(gallery.directory, relative);
        if (!file.startsWith(gallery.directory + path.sep)) {
            response.writeHead(403).end();
            return;
        }
        try {
            response.writeHead(200, {'content-type': mime[path.extname(file)] || 'application/octet-stream'}).end(await fs.readFile(file));
        } catch {
            response.writeHead(404).end();
        }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const online = await browser.newContext({viewport: {width: 1200, height: 800}});
    const onlinePage = await online.newPage();
    onlinePage.on('pageerror', error => errors.push(error.message));
    await checkGallery(onlinePage, `http://127.0.0.1:${server.address().port}/ipfs/${gallery.index.replace(/index.html$/, '')}`, 'http');
    await onlinePage.getByTestId('site-archive-download').waitFor({state: 'visible'});
    assert.deepEqual(errors, []);
    await online.close();
    await fs.writeFile(path.join(screenshots, 'manifest.json'), JSON.stringify(captures, null, 2));
    console.log('Offline archive browser checks passed: file:// modal/navigation/close, nested post, safe JSON, no network requests, and HTTP archive control.');
} finally {
    await browser.close();
    await new Promise<void>(resolve => server ? server.close(resolve) : resolve());
    await fs.rm(temporary, {recursive: true, force: true});
}
