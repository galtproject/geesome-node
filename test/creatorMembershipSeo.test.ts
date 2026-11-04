import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {creatorMetadata, creatorSitemap, normalizeCreatorSeo} from '../app/modules/staticSiteGenerator/site/creatorSeo.js';
import {membershipRenderData} from '../app/modules/staticSiteGenerator/membershipRenderData.js';
import renderer from '../app/modules/staticSiteGenerator/site/index.js';

const site = {title:'Creator',domain:'creator.test',canonicalPath:'/',brand:{avatarUrl:'/ipfs/public-avatar',seo:{description:'Public introduction',imageUrl:'/ipfs/share/card.webp',imageAlt:'Creator artwork',faviconUrl:'/ipfs/icon',adult:true}}};
const post = {id:'42',title:'A & B "story"',socialImageUrl:'/ipfs/public-post-image',teaser:'<p>Public &amp; useful</p>',fullText:'PRIVATE-CONTENT',media:[{mime:'image/webp',url:'../../media/preview.webp',name:'random-file.jpg'}]};
describe('creator website SEO', () => {
    it('renders escaped unique public titles, canonical URLs, cards and JSON-LD in the initial HTML', async () => {
        const data = membershipRenderData({...site,canonicalPath:'/posts/42/',relativeRoot:'../../'},[post],false,true);
        const html = await (await renderer.prepareRender(data)).renderPage('/post/42', [['meta',{name:'og:title',content:'Old brand-only title'}]]);
        const $ = load(html);
        assert.equal($('title').text(),'Creator - A & B "story"');
        assert.equal($('link[rel="canonical"]').attr('href'),'https://creator.test/posts/42/');
        assert.equal($('meta[property="og:title"]').attr('content'),'Creator - A & B "story"');
        assert.equal($('meta[name="og:title"]').length,0);
        assert.equal($('meta[name="description"]').attr('content'),'Public & useful');
        assert.equal($('meta[property="og:image"]').attr('content'),'https://creator.test/ipfs/public-post-image');
        assert.equal($('meta[name="twitter:card"]').attr('content'),'summary_large_image');
        assert.equal($('link[rel="icon"]').attr('href'),'https://creator.test/ipfs/icon');
        assert.equal($('meta[name="rating"]').attr('content'),'adult');
        assert.equal(JSON.parse($('script[type="application/ld+json"]').text())['@type'],'BlogPosting');
        assert.equal($('img[src="../../media/preview.webp"]').attr('alt'),'A & B "story" — preview 1');
        assert(!html.includes('PRIVATE-CONTENT'));
        assert(!html.includes('random-file.jpg'));
    });
    it('keeps full text out of metadata even for full snapshots and escapes script boundaries', async () => {
        const data = membershipRenderData({...site,brand:{seo:{description:'</script><img src=x onerror=alert(1)>Hello'}},canonicalPath:'/posts/42/'},[{...post,title:'</script><script>alert(1)</script>Story'}],true,true);
        const html = await (await renderer.prepareRender(data)).renderPage('/post/42',[['meta',{name:'robots',content:'noindex,nofollow'}]]);
        const $ = load(html);
        assert(html.includes('PRIVATE-CONTENT'));
        assert(!$('head').text().includes('PRIVATE-CONTENT'));
        assert(!$('head').html().includes('<img'));
        assert.equal($('meta[name="robots"]').attr('content'),'noindex,nofollow');
        assert.equal(JSON.parse($('script[type="application/ld+json"]').text()).headline,'Story');
    });
    it('renders a separate visible introduction, supports hiding it and retains SEO metadata', async () => {
        for (const full of [false, true]) {
            for (const description of ['A short visible introduction <b>as text</b>', '']) {
                const data = membershipRenderData({...site, brand:{...site.brand, displayDescription:description}}, [], full);
                const html = await (await renderer.prepareRender(data)).renderPage('/', []);
                const $ = load(html);
                assert.equal($('.creator-profile p').text(), description);
                assert.equal($('.creator-profile p').length, description ? 1 : 0);
                assert.equal($('.creator-profile b').length, 0);
                assert.equal($('meta[name="description"]').attr('content'), 'Public introduction');
            }
        }
        assert.equal(membershipRenderData(site, [], false).creator.resource.description, 'Public introduction');
    });
    it('uses owner metadata on home, distinct archive/account titles and safe fallbacks without inventing images', () => {
        assert.equal(creatorMetadata({...site,brand:{seo:{title:'Custom title'}}},[]).title,'Custom title');
        assert.equal(creatorMetadata({...site,canonicalPath:'/page/3/'},[]).title,'Archive 3 — Creator');
        assert.equal(creatorMetadata({...site,canonicalPath:'/account/'},[]).title,'Account — Creator');
        const empty = creatorMetadata({title:'New creator',domain:'creator.test'},[]);
        assert(empty.headers.some(([,a]) => a.name === 'description' && a.content.includes('New creator')));
        assert(!empty.headers.some(([,a]) => a.property === 'og:image'));
        assert.equal(empty.headers.find(([,a]) => a.name === 'twitter:card')[1].content,'summary');
    });
    it('rejects executable, credentialed, unbounded and unsupported SEO settings', () => {
        for (const value of [null,[],{unknown:true},{adult:'yes'},{title:' '},{description:'x'.repeat(501)},
            {imageUrl:'javascript:alert(1)'},{imageUrl:'//evil.test/card'},{imageUrl:'https://user:pass@evil.test/card'},
            {faviconUrl:'http://unsafe.test/icon'},{faviconUrl:'/\\evil.test/icon'}]) {
            assert.throws(() => normalizeCreatorSeo(value),/membership_seo_invalid/);
        }
        assert.deepEqual(normalizeCreatorSeo({imageUrl:'/ipfs/card',adult:false,title:' Title '}),{imageUrl:'/ipfs/card',adult:false,title:'Title'});
        assert.deepEqual(normalizeCreatorSeo({}),{});
    });
    it('applies owner templates to SEO and both cards using only public descriptions', async () => {
        const configured = {...site, canonicalPath:'/posts/42/',brand:{...site.brand,seo:{...site.brand.seo,
            postTitleTemplate:'{siteTitle}: {postTitle}',postDescriptionTemplate:'{postTitle} | {postDescription} | {siteTitle}'}}};
        const html = await (await renderer.prepareRender(membershipRenderData(configured,[post],true,true))).renderPage('/post/42',[]);
        const $ = load(html);
        assert.equal($('title').text(),'Creator: A & B "story"');
        for (const selector of ['meta[property="og:title"]','meta[name="twitter:title"]']) {
            assert.equal($(selector).attr('content'),$('title').text());
        }
        for (const selector of ['meta[name="description"]','meta[property="og:description"]','meta[name="twitter:description"]']) {
            assert.equal($(selector).attr('content'),'A & B "story" | Public & useful | Creator');
        }
        assert.equal($('meta[name="twitter:image"]').attr('content'),'https://creator.test/ipfs/public-post-image');
        assert.equal($('meta[property="og:image:alt"]').attr('content'),'A & B "story"');
        assert(!$('head').html().includes('PRIVATE-CONTENT'));
    });
    it('does not use member-only media as a share image and falls back to site imagery', () => {
        const {socialImageUrl: _, ...withoutPreview} = post;
        const metadata = creatorMetadata(site,[{...withoutPreview,media:[{mime:'image/webp',url:'/ipfs/PRIVATE'}]}],true);
        assert.equal(metadata.headers.find(([,a]) => a.property === 'og:image')[1].content,'https://creator.test/ipfs/share/card.webp');
        for (const value of [{postTitleTemplate:'{fullText}'},{postDescriptionTemplate:'x'.repeat(501)}]) {
            assert.throws(()=>normalizeCreatorSeo(value),/membership_seo_invalid/);
        }
        assert.equal(normalizeCreatorSeo({postTitleTemplate:'{siteTitle} | {postTitle}'}).postTitleTemplate,'{siteTitle} | {postTitle}');
    });
    it('emits stable canonical discovery URLs with escaped XML', () => {
        const xml = creatorSitemap('creator.test',['index.html','posts/42/index.html','page/1/index.html']);
        assert(xml.includes('<loc>https://creator.test/</loc>'));
        assert(xml.includes('<loc>https://creator.test/posts/42/</loc>'));
        assert(!xml.includes('/ipfs/'));
        assert(!xml.includes('/account/'));
        assert(creatorSitemap('creator.test',['a&b']).includes('a&amp;b'));
    });
});
