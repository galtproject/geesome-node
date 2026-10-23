// Standalone, no-IPFS renderer fixture for the archive control browser workflow.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import renderer from '../app/modules/staticSiteGenerator/site/index.js';
import {buildBrowserClient} from '../app/modules/staticSiteGenerator/site/browserBundle.js';
import {normalizeStaticSiteOptions} from '../app/modules/staticSiteGenerator/index.ts';

const root = path.resolve(process.env.ARCHIVE_BROWSER_EVIDENCE || 'test/.geesome-test-output/relative-archive-browser');
const storageId = 'bafyrelativearchivefixture01';
const site = path.join(root, 'site', storageId);
await fs.mkdir(path.join(site, 'content'), {recursive: true});
await fs.mkdir(path.join(site, 'preview'), {recursive: true});
await fs.cp('app/modules/staticSiteGenerator/site/public', path.join(site, 'public'), {recursive: true});
await fs.writeFile(path.join(site, 'public', 'client.js'), await buildBrowserClient());
const data = {defaultRoute: 'content-list', contents: [{id: 1, type: 'image', name: 'Rendered gallery image',
    storageId: 'imageFixture', previewStorageId: 'imageFixture', extension: 'svg'}],
    options: normalizeStaticSiteOptions({archive: true, archiveApiBase: 'http://127.0.0.1:2052/api/v1',
        headerHtml: '<h2>Published Gallery</h2>', site: {title: 'Published Gallery'}})};
const prepared = await renderer.prepareRender(data);
await fs.writeFile(path.join(site, 'index.html'), await prepared.renderPage('/content-list', [['meta', {name: 'og:title', content: 'Published Gallery'}]]));
await fs.writeFile(path.join(site, 'style.css'), prepared.css);
await fs.writeFile(path.join(site, 'clientData.js'), 'export default ' + JSON.stringify(data));
await fs.writeFile(path.join(site, 'content', '1_imageFixture.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#71918a"/><circle cx="300" cy="200" r="110" fill="#dcebe3"/></svg>');
await fs.copyFile(path.join(site, 'content', '1_imageFixture.svg'), path.join(site, 'preview', '1_imageFixture.svg'));
execFileSync('tar', ['-czf', path.join(root, 'archive.tar.gz'), '-C', path.join(root, 'site'), storageId]);
await fs.writeFile(path.join(root, 'site.json'), JSON.stringify({storageId, archivedStorageId: 'bafyfixturearchivebytes01'}));
console.log(root);
