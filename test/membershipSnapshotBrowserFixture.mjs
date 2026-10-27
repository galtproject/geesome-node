import fs from 'node:fs/promises';
import path from 'node:path';
import renderer from '../app/modules/staticSiteGenerator/site/index.js';
import {buildBrowserClient} from '../app/modules/staticSiteGenerator/site/browserBundle.js';
import {membershipRenderData} from '../app/modules/staticSiteGenerator/membershipRenderData.ts';

const root = path.resolve(process.env.MEMBERSHIP_BROWSER_EVIDENCE || 'test/.geesome-test-output/membership-browser');
const bundle = await buildBrowserClient();
const image = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240"><rect width="600" height="240" fill="#c3d8ea"/><text x="30" y="125" font-size="32">Public attachment</text></svg>';
for (const full of [false, true]) {
    const directory = path.join(root, full ? 'full' : 'public');
    await fs.mkdir(path.join(directory, 'posts'), {recursive: true});
    await fs.mkdir(path.join(directory, 'media'), {recursive: true});
    await fs.mkdir(path.join(directory, 'public'), {recursive: true});
    await fs.writeFile(path.join(directory, 'media', 'preview.svg'), image);
    if (full) await fs.writeFile(path.join(directory, 'media', 'private.txt'), 'Private download');
    await fs.writeFile(path.join(directory, 'public', 'client.js'), bundle);
    const post = {id: 1, date: Date.UTC(2026, 9, 27), title: 'Shared post template', teaser: 'Public introduction', fullText: 'Subscriber introduction', free: false,
        postUrl: 'posts/1.html', media: [{url: 'media/preview.svg', mime: 'image/svg+xml', name: 'Public attachment'}]};
    const render = async (single, page = 1) => {
        const local = {...post, media: post.media.map(item => ({...item, url: (single ? '../' : '') + item.url}))};
        if (full && single) local.media.push({url: '../media/private.txt', mime: 'text/plain', text: 'PRIVATE BODY', name: 'Private text'},
            {url: '../media/private.txt', mime: 'application/octet-stream', name: 'Private download'});
        const data = membershipRenderData({title: 'Shared group template', homeUrl: single ? '../index.html' : 'index.html', postsCount: 21,
            entryPath: single ? '/api/v1/membership/site/posts/1' : '/api/v1/membership/site', pageUrls: ['index.html', 'page-2.html']}, [local], full, single, page, 2);
        const prepared = await renderer.prepareRender(data);
        await fs.writeFile(path.join(directory, 'style.css'), prepared.css);
        return prepared.renderPage(single ? '/post/1' : page === 1 ? '/' : '/page/2', [['meta', {name: 'og:title', content: 'Shared group template'}]]);
    };
    await fs.writeFile(path.join(directory, 'index.html'), await render(false));
    await fs.writeFile(path.join(directory, 'page-2.html'), await render(false, 2));
    await fs.writeFile(path.join(directory, 'posts', '1.html'), await render(true));
}
await fs.copyFile('app/modules/staticSiteGenerator/site/public/membership.js', path.join(root, 'membership.js'));
console.log(root);
