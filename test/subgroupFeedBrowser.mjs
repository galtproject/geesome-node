import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from '/work/node_modules/playwright/index.mjs';

const root = '/evidence', captures = [], results = [];
const types = {'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json'};
const server = http.createServer(async (request,response) => {
    const pathname = new URL(request.url,'http://fixture.invalid').pathname;
    const file = path.resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(root + '/')) {
        response.writeHead(403).end();
        return;
    }
    try {
        const body = await fs.readFile(file);
        response.writeHead(200,{'content-type':types[path.extname(file)] || (body.toString('utf8',0,200).includes('<svg') ? 'image/svg+xml' : 'application/octet-stream')}).end(body);
    } catch {
        response.writeHead(404).end();
    }
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin = `http://127.0.0.1:${server.address().port}`, browser = await chromium.launch({headless:true});
async function capture(page,viewport,step,description) {
    const directory = path.join(root,'screenshots',viewport);
    await fs.mkdir(directory,{recursive:true});
    const file = path.join(directory,step+'.png');
    const rendered = await page.evaluate(() => ({
        width: innerWidth, height: innerHeight,
        overflowPixels: Math.max(0,document.documentElement.scrollWidth-innerWidth),
        brokenImageCount: [...document.images].filter(image=>image.complete && image.naturalWidth===0).length,
    }));
    assert.equal(rendered.overflowPixels,0,`${viewport}/${step}: horizontal overflow`);
    assert.equal(rendered.brokenImageCount,0,`${viewport}/${step}: broken images`);
    await page.screenshot({path:file,animations:'disabled'});
    captures.push({viewport,step,route:new URL(page.url()).pathname,description,rendered,file:path.relative(root,file)});
}
async function loadedImage(page) {
    const image = page.locator('.preview-grid img').first();
    await image.scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>{const image=document.querySelector('.preview-grid img');return image?.complete&&image.naturalWidth>0;});
}
try {
    for (const viewport of [{width:1280,height:1000},{width:390,height:844}]) {
        const name = viewport.width>500?'desktop':'narrow', context = await browser.newContext({viewport}), page = await context.newPage();
        const errors = [], api = [];
        page.on('pageerror',error=>errors.push(error.message));
        page.on('console',message=>{if(message.type()==='error'||/hydration/i.test(message.text()))errors.push(message.text());});
        await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{window.copiedPostUrl=value;}}}));
        await page.route('**/api/**',async route=>{api.push(new URL(route.request().url()).pathname);await route.fulfill({status:200,contentType:'application/json',body:'{"reader":null,"active":false,"invoices":[],"refunds":[]}'});});
        await page.goto(origin+'/site/feed/');
        await page.getByTestId('section-tab-feed').waitFor();
        assert.equal(await page.getByTestId('section-tab-feed').getAttribute('aria-current'),'page');
        assert.equal(await page.getByTestId('subscribe-post').count(),0);
        assert.equal(await page.getByTestId('load-more').count(),0);
        await loadedImage(page);
        await page.getByTestId('site-sections').evaluate(element=>element.scrollIntoView({block:'start'}));
        await capture(page,name,'feed','Public Feed has active section tabs above ordinary public post cards with loaded images and no access gates.');
        await page.getByTestId('post-23').getByTestId('share-post').click();
        assert.equal(await page.evaluate(()=>window.copiedPostUrl),'https://creator.example/feed/posts/23/');
        await page.getByTestId('post-23').locator('h2 a').click();
        await page.waitForURL('**/site/feed/posts/23/');
        await page.reload();
        await loadedImage(page);
        assert.equal(await page.getByTestId('post-23').count(),1);
        await page.getByTestId('site-sections').evaluate(element=>element.scrollIntoView({block:'start'}));
        await capture(page,name,'post','A directly reloaded public Feed post preserves the active Feed tab, full image and static back link.');
        await page.getByRole('link',{name:'← All posts',exact:true}).click();
        await page.waitForURL('**/site/feed/');
        await page.getByTestId('older-posts').click();
        await page.waitForURL('**/site/feed/page/2/');
        await page.reload();
        await loadedImage(page);
        assert.equal(await page.getByTestId('post-3').count(),1);
        await page.getByTestId('site-sections').evaluate(element=>element.scrollIntoView({block:'start'}));
        await capture(page,name,'pagination','Directly reloaded second Feed page uses static folder pagination, keeps Feed active and displays the older public posts.');
        await page.getByTestId('newer-posts').click();
        await page.waitForURL('**/site/feed/');
        assert.deepEqual(api,[],'Public Feed must not request membership account/feed APIs.');
        await page.getByTestId('section-tab-home').click();
        await page.waitForURL('**/site/');
        assert.equal(await page.getByTestId('section-tab-home').getAttribute('aria-current'),'page');
        await page.goto(origin+'/empty/feed/');
        await page.getByText('New work is on the way',{exact:true}).waitFor();
        await capture(page,name,'empty','An empty public subgroup keeps section navigation and shows an explicit empty Feed state.');
        await page.goto(origin+'/custom/feed/');
        await page.getByTestId('html-shell').waitFor();
        assert.equal(await page.getByTestId('section-tab-feed').textContent(),'Notes');
        await loadedImage(page);
        await page.getByTestId('site-sections').evaluate(element=>element.scrollIntoView({block:'start'}));
        await capture(page,name,'template-tabs','An editable owner HTML shell places its optional tabs slot above posts and uses the configured Notes section label.');
        await page.goto(origin+'/legacy/feed/');
        await page.getByTestId('html-shell').waitFor();
        await loadedImage(page);
        assert.equal(await page.getByTestId('site-sections').count(),0);
        assert.equal(await page.getByTestId('post-2').count(),1);
        await capture(page,name,'legacy-template','A legacy owner HTML shell without the optional tabs slot still renders its public posts and existing profile.');
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
        assert.deepEqual(errors,[]);
        results.push({viewport:name,shareUrl:'https://creator.example/feed/posts/23/',feedApiRequests:0,errors:[]});
        await context.close();
    }
    await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify({captures,results},null,2)+'\n');
    console.log(`Verified ${captures.length} public Feed screenshots and static navigation at desktop/narrow.`);
} finally {
    await browser.close();
    server.close();
}
