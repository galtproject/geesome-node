import assert from 'node:assert/strict';
import {normalizeSitePresentation,sitePresentationCss} from '../app/modules/staticSiteGenerator/site/presentation.js';

describe('declarative site presentation',()=>{
    it('has neutral defaults and canonical independent manifests',()=>{
        const a=normalizeSitePresentation(),b=normalizeSitePresentation({schemaVersion:1});
        assert.deepEqual(a,b);
        a.layout.sidebar.reverse();
        assert.deepEqual(b.layout.sidebar,['membership','social-links']);
        assert(!JSON.stringify(b).match(/Patreon|Era Of|exclusive|cheaper|Lower price/i));
    });
    it('accepts bounded layout choices, editorial text and HTTPS offers as data',()=>{
        const p=normalizeSitePresentation({schemaVersion:1,theme:{accent:'#123ABC',previewSize:'compact'},layout:{columns:'single',sidebar:['social-links','membership'],main:['pagination','post-feed']},membership:{ribbon:['Own promotion'],external:{label:'Another service',url:'https://membership.example.com',accent:'#ffffff'},banner:{title:'<script>not executed</script>',text:'Literal editorial text'}}});
        assert.equal(p.theme.accent,'#123abc');
        assert.equal(p.layout.columns,'single');
        assert.equal(p.theme.previewSize,'compact');
        assert.equal(p.membership.banner.title,'<script>not executed</script>');
        assert(sitePresentationCss(p).includes('--site-accent:#123abc'));
    });
    it('rejects executable sources, CSS injection, unknown blocks and forged checkout fields',()=>{
        for(const input of [
            {},{schemaVersion:2},{schemaVersion:1,template:{id:'https://evil.test/component.vue',version:1}},
            {schemaVersion:1,template:{id:'creator',version:2}},{schemaVersion:1,script:'alert(1)'},
            {schemaVersion:1,stylesCss:'body{display:none}'},{schemaVersion:1,theme:{accent:'red;url(https://evil.test)'}},
            {schemaVersion:1,theme:{previewSize:'999999px'}},{schemaVersion:1,theme:{fontFamily:'url(https://evil.test)'}},{schemaVersion:1,layout:{main:['post-feed']}},
            {schemaVersion:1,layout:{sidebar:['membership','membership']}},{schemaVersion:1,layout:{header:['brand']}},
            {schemaVersion:1,layout:{sidebar:['iframe']}},{schemaVersion:1,membership:{address:'0xFAKE'}},
            {schemaVersion:1,membership:{external:{label:'Bad',url:'javascript:alert(1)'}}},
            {schemaVersion:1,membership:{external:{label:'Bad',url:'https://user:pass@example.com'}}},
            {schemaVersion:1,membership:{external:{label:'Bad',url:'https://example.com',iconUrl:'https://evil.test/icon.svg'}}},
            {schemaVersion:1,membership:{ribbon:['a','b','c']}},{schemaVersion:1,copy:{join:'a'.repeat(101)}},
            JSON.parse('{"schemaVersion":1,"__proto__":{"polluted":true}}')
        ]) {
            assert.throws(()=>normalizeSitePresentation(input),/site_presentation_invalid/,JSON.stringify(input));
        }
    });
});
