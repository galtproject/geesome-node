import assert from 'node:assert/strict';
import {CID} from 'multiformats/cid';
import {sha256} from 'multiformats/hashes/sha2';
import {creatorLayout, creatorPagePaths} from '../app/modules/staticSiteGenerator/membershipPagination.js';
import {buildMembershipSnapshots} from '../app/modules/staticSiteGenerator/membershipPublication.js';
const posts = count => Array.from({length: count}, (_, i) => ({id: String(i + 1), date: i + 1}));
describe('stable creator pagination', function () {
    this.timeout(60000);
    it('rolls only the oldest ten home posts into fixed archives', () => {
        let previous;
        for (const [total, home, archives] of [[0,0,0],[9,9,0],[10,10,0],[19,19,0],[20,10,1],[50,10,4],[51,11,4],[59,19,4],[60,10,5],[61,11,5]]) {
            const next = creatorLayout(posts(total), previous);
            assert.equal(next.home.length, home);
            assert.equal(next.archives.length, archives);
            for (let index = 0; index < (previous?.archives.length || 0); index++) {
                assert.deepEqual(next.archives[index], previous.archives[index]);
            }
            assert.deepEqual([...next.archives.flat(), ...next.home], posts(total).map(p => p.id));
            previous = next;
        }
        assert.deepEqual(creatorPagePaths(creatorLayout(posts(20))), ['index.html','page/1/index.html']);
    });
    it('retains assignment through hiding, deletion, backdating and restoration', () => {
        const original = creatorLayout(posts(50));
        const changed = posts(50).filter(p => !['2','45'].includes(p.id));
        changed.push({id:'51',date:-1});
        const next = creatorLayout(changed, original);
        assert.deepEqual(next.archives, original.archives);
        assert.equal(next.home.at(-1), '51');
        assert(next.archives[0].includes('2'));
        const restored = creatorLayout(posts(51), next);
        assert.deepEqual(restored, next);
        assert.deepEqual(creatorLayout([{id:'3',date:1},{id:'1',date:1},{id:'2',date:1}]).home,['1','2','3']);
    });
    it('reuses unchanged projected HTML and archives, invalidates edits, and never caches paid text into public output', async () => {
        const files = new Map<string, Buffer>(), dirs = new Map<string, Map<string,string>>();
        let source = posts(50).map(p => ({id:p.id,publishedAt:new Date(p.date),status:'published',contents:[],propertiesJson:JSON.stringify({membership:{title:`Post ${p.id}`,teaser:`PUBLIC ${p.id}`,fullText:`PRIVATE ${p.id}`,free:false}})}));
        let writes = 0, revision = 0;
        const app: any = {ms:{group:{forEachHydratedGroupPostBatch:async (_id,_options,fn) => fn({groupPosts:source,refCount:source.length})}, storage:{
            makeDir:async path => {
                if (!dirs.has(path)) {
                    dirs.set(path,new Map());
                }
            },
            copyFileFromId:async (cid,path) => {const parts=path.split('/');dirs.get('/'+parts[1]).set(parts.slice(2).join('/'),cid);},
            saveFileByData:async data => {writes++;const value=Buffer.from(data),id=CID.createV1(0x55,await sha256.digest(value)).toString();files.set(id,value);return {id};},
            getDirectoryId:async path => {const value=Buffer.from(JSON.stringify([...dirs.get(path)]));return CID.createV1(0x55,await sha256.digest(value)).toString();}
        }}};
        const row={id:'wave',groupId:'1',domain:'creator.test',data:{}};
        const build = async previousManifest => {
            const n=++revision;
            return buildMembershipSnapshots(app,row,'Creator',{previousManifest,options:[],description:'',renew:async()=>{},beginDirectory:async variant=>`/build-${n}-${variant}`});
        };
        const first=await build(null), before=writes;
        const replay=await build(first.manifest);
        assert.equal(writes,before,'unchanged outputs never render/save HTML again');
        assert.deepEqual(replay.manifest.files,first.manifest.files);
        source.push({id:'51',publishedAt:new Date(51),status:'published',contents:[],propertiesJson:JSON.stringify({membership:{title:'Post 51',teaser:'PUBLIC 51',fullText:'PRIVATE 51',free:false}})});
        const second=await build(replay.manifest);
        assert.equal(writes-before,4,'only public/full homepage and new post HTML are written');
        assert.deepEqual(second.manifest.layout.archives,first.manifest.layout.archives);
        assert.deepEqual(second.manifest.files.public['page/1/index.html'],first.manifest.files.public['page/1/index.html']);
        assert.deepEqual(second.manifest.files.full['posts/1/index.html'],first.manifest.files.full['posts/1/index.html']);
        const html=entry=>files.get(entry.cid).toString();
        assert(!html(second.manifest.files.public['index.html']).includes('PRIVATE'));
        assert(html(second.manifest.files.full['index.html']).includes('PRIVATE 51'));
        assert(html(second.manifest.files.public['page/1/index.html']).includes('href="../../page/2/"'));
        assert(html(second.manifest.files.public['index.html']).includes('href="./page/4/"'));
        assert(!html(second.manifest.files.public['index.html']).includes('Load more'));
        assert(!html(second.manifest.files.public['page/1/index.html']).includes('Latest publications'));
        assert(html(second.manifest.files.public['page/1/index.html']).includes('href="../../" data-testid="footer-home"'));
        assert(html(second.manifest.files.public['page/1/index.html']).includes('Powered by'));
        source[0].propertiesJson=JSON.stringify({membership:{title:'Post 1',teaser:'PUBLIC 1',fullText:'EDITED SECRET',free:false}});
        const third=await build(second.manifest);
        assert.deepEqual(third.manifest.files.public,second.manifest.files.public,'private-only edit does not invalidate public HTML');
        assert.notEqual(third.manifest.files.full['posts/1/index.html'].cid,second.manifest.files.full['posts/1/index.html'].cid);
        const branded=await buildMembershipSnapshots(app,row,'New title',{previousManifest:third.manifest,options:[],description:'',renew:async()=>{},beginDirectory:async variant=>`/brand-${variant}`});
        assert.notEqual(branded.manifest.files.public['page/1/index.html'].cid,third.manifest.files.public['page/1/index.html'].cid);
    });
});
