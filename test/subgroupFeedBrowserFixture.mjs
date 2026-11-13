import fs from 'node:fs/promises';
import path from 'node:path';
import {subgroupFeedFixture} from './subgroupFeedFixture.ts';
import {buildSubgroupFeed} from '../app/modules/staticSiteGenerator/subgroupFeed.ts';
import {membershipRenderData} from '../app/modules/staticSiteGenerator/membershipRenderData.ts';
import renderer from '../app/modules/staticSiteGenerator/site/index.js';
import {buildBrowserClient} from '../app/modules/staticSiteGenerator/site/browserBundle.js';

const root = path.resolve(process.env.SUBGROUP_FEED_BROWSER_EVIDENCE || 'test/.geesome-test-output/subgroup-feed-browser');
await fs.mkdir(root, {recursive: true});
for (const [name, count] of [['site',23],['empty',0],['custom',2],['legacy',2]]) {
    const fixture = subgroupFeedFixture(count);
    if (name === 'site') {
        fixture.posts[22].propertiesJson = JSON.stringify({sourceImageSet:{groupId:10,postId:42}});
    }
    if (['custom','legacy'].includes(name)) {
        let html = await fs.readFile(new URL('../examples/creator-shell.html', import.meta.url), 'utf8');
        if (name === 'legacy') {
            html = html.replace(/\s*<geesome-slot name="tabs"><\/geesome-slot>/, '');
        }
        fixture.row.data.presentation = {schemaVersion:1,template:{id:'html-shell',version:1,html},copy:{feedHeading:'Library'}};
        fixture.subgroup.config.tabLabel = 'Notes';
        fixture.tabs = [{alias:'',label:'Library',href:'/'},{alias:'feed',label:'Notes',href:'/feed/'}];
    }
    const result = await buildSubgroupFeed(fixture.app, fixture.row, fixture.subgroup, {directory:'/staging/feed',renew:async()=>{},tabs:fixture.tabs,parentPosts:new Map([['42',{imageCount:103}]])});
    for (const [file, bytes] of fixture.files) {
        const destination = path.join(root, name, 'feed', file.slice('/staging/feed/'.length));
        await fs.mkdir(path.dirname(destination), {recursive:true});
        await fs.writeFile(destination, bytes);
    }
    await fs.mkdir(path.join(root, 'ipfs'), {recursive:true});
    for (const [id, bytes] of fixture.source) {
        await fs.writeFile(path.join(root, 'ipfs', id), bytes);
    }
    const data = membershipRenderData({title:fixture.row.data.displayTitle,domain:fixture.row.domain,resourceId:fixture.row.id,brand:fixture.row.data,
        options:fixture.row.options,relativeRoot:'./',homeUrl:'./',canonicalPath:'/'},[],false);
    data.creator.tabs = fixture.tabs;
    const prepared = await renderer.prepareRender(data);
    await fs.mkdir(path.join(root,name,'public'),{recursive:true});
    await fs.writeFile(path.join(root,name,'index.html'),await prepared.renderPage('/',[]));
    await fs.writeFile(path.join(root,name,'style.css'),prepared.css);
    await fs.writeFile(path.join(root,name,'public/client.js'),await buildBrowserClient());
    if (name === 'site') {
        const sourceData = membershipRenderData({title:fixture.row.data.displayTitle,domain:fixture.row.domain,resourceId:fixture.row.id,brand:fixture.row.data,
            options:fixture.row.options,relativeRoot:'../../',homeUrl:'../../',canonicalPath:'/posts/42/'},
            [{id:'42',title:'Source image set',teaser:'Public collection preview.',free:false,media:[]}],false,true);
        const sourceRenderer = await renderer.prepareRender(sourceData);
        await fs.mkdir(path.join(root,name,'posts/42'),{recursive:true});
        await fs.writeFile(path.join(root,name,'posts/42/index.html'),await sourceRenderer.renderPage('/post/42',[]));
    }
    await fs.writeFile(path.join(root,name,'feed-manifest.json'),JSON.stringify({root:result.root,paths:result.paths}));
}
console.log(root);
