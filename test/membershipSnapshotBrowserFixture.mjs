import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {CID} from 'multiformats/cid';
import {create as digest} from 'multiformats/hashes/digest';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { App as ReferenceApp, createInitialState } from '../../microwave-girls/frontend/public/app.ts';
import fs from 'node:fs/promises';
import path from 'node:path';
import renderer from '../app/modules/staticSiteGenerator/site/index.js';
import { buildBrowserClient } from '../app/modules/staticSiteGenerator/site/browserBundle.js';
import {creatorPresentation} from '../../microwave-girls/app/modules/membership/websitePresentation.ts';
import { membershipRenderData as baseMembershipRenderData } from '../app/modules/staticSiteGenerator/membershipRenderData.ts';
function membershipRenderData(site,...args) {
    const brand=site.brand || {};
    const presentation=creatorPresentation({id:site.resourceId},brand);
    if (presentation.membership.external) {
        presentation.membership.external.label='Support on Patreon';
    }
    presentation.membership.banner={title:'Less than Patreon. More value here.',text:'Get your membership for less when you buy directly on this site.'};
    return baseMembershipRenderData({...site,brand:{...brand,presentation}},...args);
}
const root = path.resolve(process.env.MEMBERSHIP_BROWSER_EVIDENCE || 'test/.geesome-test-output/membership-browser');
const frontendRequire = createRequire(new URL('../../microwave-girls/frontend/package.json', import.meta.url));
const { createSSRApp } = frontendRequire('vue');
const { renderToString } = frontendRequire('@vue/server-renderer');
const bundle = await buildBrowserClient();
const iconCid = name => CID.createV1(0x55,digest(0x12,createHash('sha256').update(name).digest())).toString();
const withIcons = links => links.map(link => ({...link, iconUrl: ['Other','Portfolio'].includes(link.label) ? undefined : '/ipfs/' + iconCid(link.label === 'X' ? 'twitter' : link.label === 'Ko-fi' ? 'kofi' : link.label.toLowerCase())}));
await fs.mkdir(path.join(root, 'ipfs'), {recursive: true});
for (const name of ['twitter', 'discord', 'telegram', 'kofi', 'bluesky', 'patreon']) {
    await fs.copyFile(`../microwave-girls/public/assets/${name}.${['bluesky','patreon'].includes(name) ? 'svg' : 'png'}`, path.join(root, 'ipfs', iconCid(name)));
}
const image = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240"><rect width="600" height="240" fill="#c3d8ea"/><text x="30" y="125" font-size="32">Public attachment</text></svg>';
for (const full of [false, true]) {
    const directory = path.join(root, full ? 'full' : 'public');
    await fs.mkdir(path.join(directory, 'posts'), { recursive: true });
    await fs.mkdir(path.join(directory, 'media'), { recursive: true });
    await fs.mkdir(path.join(directory, 'public'), { recursive: true });
    await fs.copyFile('../microwave-girls/public/assets/microwave-banner.png', path.join(directory, 'media/cover.png'));
    await fs.copyFile('../microwave-girls/public/assets/avatar.jpg', path.join(directory, 'media/avatar.jpg'));
    await fs.writeFile(path.join(directory, 'media', 'preview.svg'), image);
    if (full) {
        await fs.writeFile(path.join(directory, 'media', 'private.txt'), 'Private download');
    }
    await fs.writeFile(path.join(directory, 'public', 'client.js'), bundle);
    const post = { id: 1, date: Date.UTC(2026, 9, 27), title: 'Shared post template', teaser: 'Public introduction', fullText: 'Subscriber introduction', free: false,
        postUrl: 'posts/1.html', media: [{ url: 'media/preview.svg', mime: 'image/svg+xml', name: 'Public attachment' }, { url: 'media/preview.svg', mime: 'image/svg+xml', name: 'Second public attachment' }] };
    const render = async (single, page = 1) => {
        const local = { ...post, media: post.media.map(item => ({ ...item, url: (single ? '../' : '') + item.url })) };
        if (full) {
            local.media.push({mime:'text/uri-list',name:'Read manual',url:'/ipfs/bafkreihai2kno6iph4yweurfqc7owuunxc5p43kntfv2dqctkukbfntlhy/manual.pdf#page=2'});
            local.media.push({view:'link', name:'View full set', mime:'text/uri-list', text:'/ipfs/bafkreihai2kno6iph4yweurfqc7owuunxc5p43kntfv2dqctkukbfntlhy/#/', url:'/ipfs/bafkreihai2kno6iph4yweurfqc7owuunxc5p43kntfv2dqctkukbfntlhy/#/'});
        }
        if (full && single) {
            local.media.push({ url: '../media/private.txt', mime: 'text/plain', text: 'PRIVATE BODY', name: 'Private text' }, { url: '../media/private.txt', mime: 'application/octet-stream', name: 'Private download' });
        }
        const data = membershipRenderData({ title: 'Era Of Wave', resourceId: 'wave', options: [{ id: 'monthly', label: '1 month', amountCents: 400, currency: 'USD', period: 'month' }, { id: 'six', label: '6 months', amountCents: 2000, currency: 'USD', period: 'halfyear' }], brand: { coverUrl: `/${full ? 'full' : 'public'}/media/cover.png`, avatarUrl: `/${full ? 'full' : 'public'}/media/avatar.jpg`, patreonUrl: 'https://patreon.com/eraofwave', links: withIcons([{ label: 'X', url: 'https://x.com/eraofwave' }, { label: 'Discord', url: 'https://discord.gg/example' }, { label: 'Telegram', url: 'https://t.me/example' }]), legalLinks: [{ label: 'Privacy', url: 'https://example.com/privacy' }] }, homeUrl: single ? '../index.html' : 'index.html', postsCount: 21,
            entryPath: single ? '/api/v1/membership/site/posts/1' : '/api/v1/membership/site', pageUrls: ['index.html', 'page-2.html'] }, [local], full, single, page, 2);
        const prepared = await renderer.prepareRender(data);
        await fs.writeFile(path.join(directory, 'style.css'), prepared.css);
        return prepared.renderPage(single ? '/post/1' : page === 1 ? '/' : '/page/2', [['meta', { name: 'og:title', content: 'Shared group template' }]]);
    };
    const indexHtml = await render(false);
    await fs.writeFile(path.join(directory, 'index.html'), indexHtml);
    const account = JSON.parse(indexHtml.match(/<script id="site-data"[^>]*>([\s\S]*?)<\/script>/)[1]);
    account.creator.path = '/account/subscription';
    account.creator.nextOffset = null;
    account.creator.posts = [];
    account.currentPosts = [];
    const accountRender = await renderer.prepareRender(account);
    await fs.writeFile(path.join(directory, 'account.html'), await accountRender.renderPage('/', []));
    await fs.writeFile(path.join(directory, 'page-2.html'), await render(false, 2));
    await fs.writeFile(path.join(directory, 'posts', '1.html'), await render(true));
}
await fs.copyFile('app/modules/staticSiteGenerator/site/public/membership.js', path.join(root, 'membership.js'));
console.log(root);
const reference = path.join(root, 'reference');
await fs.mkdir(reference, { recursive: true });
const referenceState = createInitialState({ resource: { id: 'wave', title: 'Era Of Wave', postsEnabled: true, googleClientId: 'test-client', publicBasePath: '/reference',
        coverUrl: '/public/media/cover.png', avatarUrl: '/public/media/avatar.jpg', patreonUrl: 'https://patreon.com/eraofwave',
        links: [{ label: 'X', url: 'https://x.com/eraofwave' }, { label: 'Discord', url: 'https://discord.gg/example' }, { label: 'Telegram', url: 'https://t.me/example' }], legalLinks: [{ label: 'Privacy', url: 'https://example.com/privacy' }],
        options: [{ id: 'monthly', label: '1 month', amountCents: 400, currency: 'USD', period: 'month' }, { id: 'six', label: '6 months', amountCents: 2000, currency: 'USD', period: 'halfyear' }] },
    posts: [{ id: 1, title: 'Shared post template', description: 'Public introduction', publishedAt: new Date(Date.UTC(2026, 9, 27)).toISOString(), previews: [{ url: '/public/media/preview.svg', alt: 'Public attachment' }, { url: '/public/media/preview.svg', alt: 'Second public attachment' }], locked: true }], nextOffset: 20, path: '/' });
const referenceHtml = await renderToString(createSSRApp(ReferenceApp, { initialState: referenceState }));
const referenceBundle = await build({ stdin: { contents: `import {createSSRApp} from 'vue';import {App} from ${JSON.stringify(path.resolve('../microwave-girls/frontend/public/app.ts'))};createSSRApp(App,{initialState:JSON.parse(document.querySelector('#reference-state').textContent)}).mount('#reference-app');`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020', alias: { vue: frontendRequire.resolve('vue/dist/vue.esm-bundler.js') }, define: { 'process.env.NODE_ENV': '"production"', __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' } });
await fs.writeFile(path.join(reference, 'client.js'), referenceBundle.outputFiles[0].text);
await fs.copyFile('../microwave-girls/frontend/public/style.css', path.join(reference, 'style.css'));
await fs.writeFile(path.join(reference, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="style.css"></head><body><div id="reference-app">${referenceHtml}</div><script id="reference-state" type="application/json">${JSON.stringify(referenceState).replace(/</g, '\\u003c')}</script><script src="client.js"></script></body></html>`);
await fs.mkdir(path.join(root, 'assets'), {recursive: true});
for (const name of ['twitter', 'discord', 'telegram']) {
    await fs.copyFile(`../microwave-girls/public/assets/${name}.png`, path.join(root, 'assets', name + '.png'));
}
await fs.writeFile(path.join(root, 'reference-state.json'), JSON.stringify(referenceState));
for (const [file, statePath] of [['post.html', '/posts/1'], ['account.html', '/account/subscription']]) {
    const html = await renderToString(createSSRApp(ReferenceApp, { initialState: { ...referenceState, path: statePath, nextOffset: null } }));
    await fs.writeFile(path.join(reference, file), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="style.css"></head><body><div id="reference-app">${html}</div><script id="reference-state" type="application/json">${JSON.stringify({ ...referenceState, path: statePath, nextOffset: null }).replace(/</g, '\\u003c')}</script><script src="client.js"></script></body></html>`);
}
for (const [id, title, brand] of [['meat', 'Era Of Meat', referenceState.resource], ['newsite', 'New creator', {}]]) {
    const state = { ...referenceState, resource: { ...referenceState.resource, id, title, ...Object.fromEntries(['coverUrl', 'avatarUrl', 'links', 'patreonUrl', 'legalLinks'].map(key => [key, brand[key]])) } };
    const old = await renderToString(createSSRApp(ReferenceApp, { initialState: state }));
    const refDir = path.join(root, id + '-reference');
    await fs.mkdir(refDir, { recursive: true });
    await fs.copyFile(path.join(reference, 'client.js'), path.join(refDir, 'client.js'));
    await fs.copyFile(path.join(reference, 'style.css'), path.join(refDir, 'style.css'));
    await fs.writeFile(path.join(refDir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="style.css"></head><body><div id="reference-app">${old}</div><script id="reference-state" type="application/json">${JSON.stringify(state).replace(/</g, '\\u003c')}</script><script src="client.js"></script></body></html>`);
    const directory = path.join(root, id + '-public');
    await fs.mkdir(directory, { recursive: true });
    await fs.cp(path.join(root, 'public/public'), path.join(directory, 'public'), { recursive: true });
    const data = membershipRenderData({ title, resourceId: id, brand: {...brand, links: withIcons(brand.links || [])}, options: referenceState.resource.options, homeUrl: 'index.html', pageUrls: ['index.html', 'page-2.html'] }, [{ id: 1, date: Date.UTC(2026, 9, 27), title: 'Shared post template', teaser: 'Public introduction', free: false, postUrl: 'posts/1.html', media: [{ url: '/public/media/preview.svg', mime: 'image/svg+xml', name: 'Public attachment' }, { url: '/public/media/preview.svg', mime: 'image/svg+xml', name: 'Second public attachment' }] }], false, false, 1, 2);
    const prepared = await renderer.prepareRender(data);
    await fs.writeFile(path.join(directory, 'style.css'), prepared.css);
    await fs.writeFile(path.join(directory, 'index.html'), await prepared.renderPage('/', []));
}

assert(!/theme-meat|theme-wave|Era Of Wave/.test(await fs.readFile('app/modules/staticSiteGenerator/site/public/creator/style.css','utf8')),'Creator stylesheet has no project theme selectors');

// Materialize an actual version-2 publication rather than a hand-built pagination fixture.
{
    const {buildMembershipSnapshots} = await import('../app/modules/staticSiteGenerator/membershipPublication.ts');
    const {CID} = await import('multiformats/cid');
    const {sha256} = await import('multiformats/hashes/sha2');
    const files = new Map(), directories = new Map();
    const put = async data => {
        const value = Buffer.from(data), id = CID.createV1(0x55,await sha256.digest(value)).toString();
        files.set(id,value);return {id};
    };
    const preview = (await put(image)).id;
    const groupPosts = Array.from({length:51},(_,i)=>({id:i+1,publishedAt:new Date(Date.UTC(2026,0,1)+i*86400000),status:'published',
        propertiesJson:JSON.stringify({membership:{title:i===50?'creator.test - 2026-02-20 16:39:16':i===49?'An author-written title that is deliberately long enough to wrap neatly on a small phone without losing its meaning':`Archive post ${i+1}`,teaser:`PUBLIC ${i+1}`,fullText:`PRIVATE ${i+1}`,free:false}}),
        contents:[{storageId:preview,mimeType:'image/svg+xml',postsContents:{isPrivate:false}}]}));
    groupPosts[50].propertiesJson=JSON.stringify({...JSON.parse(groupPosts[50].propertiesJson),membership:{...JSON.parse(groupPosts[50].propertiesJson).membership,teaser:''}});
    const app = {ms:{group:{forEachHydratedGroupPostBatch:async(_group,_options,fn)=>fn({groupPosts,refCount:groupPosts.length})},storage:{
        saveFileByData:put,makeDir:async path=>{if(!directories.has(path))directories.set(path,new Map());},
        getFileStat:async()=>({type:'file'}),
        copyFileFromId:async(cid,target)=>{const parts=target.split('/');directories.get('/'+parts[1]).set(parts.slice(2).join('/'),cid);},
        getDirectoryId:async path=>(await put(JSON.stringify([...directories.get(path)]))).id
    }}};
    const publicationResource={id:'wave',groupId:'1',domain:'creator.test',data:{displayTitle:'Archive creator',coverUrl:'/public/media/cover.png',avatarUrl:'/public/media/avatar.jpg',patreonUrl:'https://patreon.com/example',links:withIcons([{label:'Patreon',url:'https://patreon.com/example'},{label:'Ko-fi',url:'https://ko-fi.com/example',iconUrl:'/ipfs/'+iconCid('kofi')},{label:'X',url:'https://x.com/example'},{label:'Discord',url:'https://discord.gg/example'},{label:'Bluesky',url:'https://bsky.app/profile/example'},{label:'Telegram',url:'https://t.me/example'},{label:'Portfolio',url:'https://example.com',iconUrl:undefined}])}};
    publicationResource.data.presentation=creatorPresentation(publicationResource,publicationResource.data);
    await buildMembershipSnapshots(app,publicationResource,'Private group members',{
        options:[{id:'monthly',label:'1 month',amountCents:400,currency:'USD',period:'month'},{id:'six',label:'6 months',amountCents:2000,currency:'USD',period:'halfyear'}],description:'',renew:async()=>{},beginDirectory:async variant=>'/pagination-'+variant
    });
    for(const variant of ['public','full']) {
        const target = path.join(root,variant==='public'?'paged':'paged-full');
        await fs.rm(target,{recursive:true,force:true});
        for(const [name,cid] of directories.get('/pagination-'+variant)) {
            await fs.mkdir(path.dirname(path.join(target,name)),{recursive:true});
            await fs.writeFile(path.join(target,name),files.get(cid));
        }
    }
}
// Exercise the social composition independently of feed length and membership state.
const socialHtml = await fs.readFile(path.join(root,'paged/index.html'),'utf8');
const socialState = JSON.parse(socialHtml.match(/<script id="site-data"[^>]*>([\s\S]*?)<\/script>/)[1]);
const patreonLink = socialState.creator.resource.links.find(link=>link.label==='Patreon');
const socialLinks = socialState.creator.resource.links.filter(link=>link.label!=='Patreon');
const extraLink = {label:'A custom creator community',url:'https://community.example.com',iconUrl:'/public/media/preview.svg'};
for (const count of [3,5,6,7]) {
    const data = structuredClone(socialState);
    data.creator.resource.links = [patreonLink,...[...socialLinks,extraLink].slice(0,count)];
    const prepared = await renderer.prepareRender(data);
    await fs.writeFile(path.join(root,'paged',`social-${count}.html`),await prepared.renderPage('/',[]));
}

for (const variant of ['no-patreon','unavailable','links-only']) {
    const data = structuredClone(socialState);
    if (variant === 'no-patreon') {
        delete data.creator.resource.patreonUrl;
        delete data.creator.resource.presentation.membership.external;
        delete data.creator.resource.presentation.membership.banner;
        data.creator.resource.presentation.membership.ribbon=[];
        data.creator.resource.links = data.creator.resource.links.filter(link=>link.label!=='Patreon');
    } else if (variant === 'links-only') {
        data.creator.resource.postsEnabled = false;
    } else {
        data.creator.resource.cryptoMethods = [];
    }
    const prepared = await renderer.prepareRender(data);
    await fs.writeFile(path.join(root,'paged',`${variant}.html`),await prepared.renderPage('/',[]));
}

for (const variant of ['custom-presentation','neutral-presentation']) {
    const data=structuredClone(socialState);
    data.creator.resource.title='Independent creator';
    if (variant==='neutral-presentation') {
        delete data.creator.resource.presentation;
        delete data.creator.resource.patreonUrl;
        data.creator.resource.links=[];
    } else {
        data.creator.resource.presentation={schemaVersion:1,theme:{accent:'#007d62',background:'#f3f4f5',surface:'#ffffff',text:'#14242c',muted:'#52646c',border:'#ccd4d8',radius:'square',density:'compact'},layout:{columns:'single',header:['account','brand'],profile:['profile'],sidebar:['social-links','membership'],footer:['home']},copy:{feedHeading:'Owner-selected heading',socialHeading:'My links'},membership:{ribbon:['Custom claim'],external:{label:'Another membership service',url:'https://membership.example.com',accent:'#ffcc00'},benefits:[{title:'<script>alert(1)</script>',text:'Literal text, not a template'}]}};
    }
    const prepared=await renderer.prepareRender(data);
    const dir=path.join(root,variant);
    await fs.mkdir(dir,{recursive:true});
    await fs.writeFile(path.join(dir,'style.css'),prepared.css);
    await fs.writeFile(path.join(dir,'index.html'),await prepared.renderPage('/',[]));
}
for (const variant of ['custom-presentation','neutral-presentation']) {
    await fs.cp(path.join(root,'paged/public'),path.join(root,variant,'public'),{recursive:true});
    await fs.cp(path.join(root,'paged/media'),path.join(root,variant,'media'),{recursive:true});
}
