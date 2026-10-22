// Run inside the existing microwave-girls Playwright image with the generated
// archive-browser fixture mounted at /evidence and this file under /work.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from '/work/node_modules/playwright/index.mjs';

const root = process.env.ARCHIVE_BROWSER_EVIDENCE || '/evidence/archive-browser';
const {storageId, archivedStorageId} = JSON.parse(await fs.readFile(path.join(root, 'site.json'), 'utf8'));
const archive = await fs.readFile(path.join(root, 'archive.tar.gz'));
const types = {'.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml'};
const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === `/api/v1/archive/${storageId}/download`) {
            res.writeHead(200, {'content-type': 'application/gzip', 'content-length': archive.length,
                'content-disposition': 'attachment; filename="gallery.tar.gz"'}).end(archive);
            return;
        }
        const relative = decodeURIComponent(url.pathname).replace(/^\/ipfs\//, '');
        const filename = path.resolve(root, 'site', relative, url.pathname.endsWith('/') ? 'index.html' : '');
        if (!filename.startsWith(path.resolve(root, 'site') + '/')) {
            res.writeHead(400).end();
            return;
        }
        const bytes = await fs.readFile(filename);
        res.writeHead(200, {'content-type': types[path.extname(filename)] || 'application/octet-stream'}).end(bytes);
    } catch {
        res.writeHead(404).end();
    }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless: true});
const manifest = [];
try {
    for (const [name, viewport] of [['desktop', {width: 1280, height: 800}], ['narrow', {width: 390, height: 844}]]) {
        const context = await browser.newContext({viewport, acceptDownloads: true});
        const page = await context.newPage();
        let state = 'pending';
        let lookupCount = 0;
        await page.route(`**/archive/${storageId}`, async route => {
            lookupCount++;
            assert.equal(new URL(route.request().url()).origin, origin);
            assert.equal(new URL(route.request().url()).pathname, `/api/v1/archive/${storageId}`);
            assert.equal(route.request().headers().authorization, undefined);
            await route.fulfill({status: state === 'pending' ? 404 : state === 'error' ? 503 : 200,
                headers: {'access-control-allow-origin': '*'}, contentType: 'application/json',
                body: JSON.stringify(state === 'ready' ? {originalStorageId: storageId, archivedStorageId} : {})});
        });
        await page.goto(`${origin}/ipfs/${storageId}/`);
        const capture = async (stateName, description) => {
            await page.getByTestId('site-archive-control').waitFor();
            const button = page.locator('[data-testid="site-archive-control"] a, [data-testid="site-archive-control"] button');
            const box = await button.boundingBox();
            assert.equal(await button.locator('svg[aria-hidden="true"]').count(), 1, 'each archive action has a decorative SVG icon');
            assert.ok(box.x + box.width >= viewport.width - 35, 'download control is at the right edge');
            assert.ok(box.y < 160 && box.x >= 0 && box.x + box.width <= viewport.width, 'control fits at the top');
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
            assert.equal(await page.locator('img').evaluateAll(images => images.some(image => !image.complete || !image.naturalWidth)), false);
            const screenshot = `${name}-${stateName}.png`;
            await page.screenshot({path: path.join(root, screenshot)});
            manifest.push({flow: 'published-site-archive', flowStep: stateName, viewport, route: page.url(), screenshot, description,
                visibleAssertions: ['Published Gallery header', 'Loaded gallery image', 'Archive control at top-right without horizontal overflow']});
        };
        await page.getByText('Archive is preparing…', {exact: false}).waitFor();
        await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
        await capture('pending', 'Published gallery with the archive preparing message and disabled download control in the top-right.');
        state = 'error';
        await page.getByRole('button', {name: 'Retry archive download', exact: true}).waitFor();
        await capture('retry', 'Published gallery remains available after archive lookup fails, with a top-right Retry archive download button.');
        state = 'ready';
        await page.getByRole('button', {name: 'Retry archive download', exact: true}).click();
        const downloadLink = page.getByTestId('site-archive-download');
        await downloadLink.waitFor();
        assert.equal(await downloadLink.evaluate(element => getComputedStyle(element).color), 'rgb(255, 255, 255)', 'download link remains readable while hovered');
        assert.equal(await downloadLink.getAttribute('href'), `/api/v1/archive/${storageId}/download`);
        await capture('ready', 'Published gallery with an active top-right Download archive link after a successful retry.');
        const downloadPromise = page.waitForEvent('download');
        await downloadLink.click();
        const download = await downloadPromise;
        assert.equal(await download.failure(), null);
        const downloaded = await fs.readFile(await download.path());
        assert.equal(createHash('sha256').update(downloaded).digest('hex'), createHash('sha256').update(archive).digest('hex'));
        assert.ok(lookupCount >= 3);
        await context.close();
    }
    await fs.writeFile(path.join(root, 'screenshots.json'), JSON.stringify(manifest, null, 2));
    console.log(`Archive browser workflow passed: ${manifest.length} screenshots, desktop/narrow, pending/retry/ready and verified download bytes.`);
} finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}
