import assert from 'node:assert/strict';
import {normalizeStaticSiteOptions} from '../app/modules/staticSiteGenerator/index.js';
import {createApp} from '../app/modules/staticSiteGenerator/site/public/index.js';
import {renderToString} from 'vue/server-renderer';
import {load} from 'cheerio';
import {sanitizeHtml, sanitizeStaticSiteLayoutHtml} from '../app/htmlSafety.js';

const header = '<img src="https://pbs.twimg.com/profile_images/avatar.jpg" alt="Era Of Wave"><a href="https://eraofwave.com" target="_blank" class="header-title"><span>Era Of Wave</span><span>@EraOfWave</span></a>';

describe('static-site layout branding', () => {
    it('preserves the avatar and classes needed by gallery CSS', () => {
        const $ = load(sanitizeStaticSiteLayoutHtml(header));
        assert.equal($('img').attr('src'), 'https://pbs.twimg.com/profile_images/avatar.jpg');
        assert.equal($('img').attr('alt'), 'Era Of Wave');
        assert.equal($('a.header-title > span').length, 2);
        assert.equal($('a').attr('rel'), 'noopener noreferrer');
        assert.equal(sanitizeStaticSiteLayoutHtml('<div class="gallery-footer-note">Save images</div>'), '<div class="gallery-footer-note">Save images</div>');
    });

    it('does not broaden message and post HTML permissions', () => {
        const sanitized = sanitizeHtml(header);
        assert.equal(sanitized.includes('<img'), false);
        assert.equal(sanitized.includes('class='), false);
    });

    it('removes scripts, events, inline styles, embeds and unsafe image sources', () => {
        const sanitized = sanitizeStaticSiteLayoutHtml('<div class="safe" id="app" style="color:red" onclick="evil()"><script>evil()</script><iframe src="https://example.com"></iframe><svg onload="evil()"></svg><img src="https://example.com/avatar.png" onerror="evil()" srcset="https://evil.invalid 2x"><a href="javascript:evil()">bad</a></div>');
        assert.equal(/script|iframe|svg|onclick|onerror|srcset|style=|id=|javascript:/.test(sanitized), false);
        assert.equal(load(sanitized)('img').attr('src'), 'https://example.com/avatar.png');
        for (const src of ['javascript:alert(1)', 'data:image/svg+xml,bad', '//evil.invalid/x', 'https://user:pass@example.com/x', 'https:\\evil.invalid/x', 'java&#10;script:evil()', 'blob:https://example.com/x']) {
            assert.equal(load(sanitizeStaticSiteLayoutHtml(`<img src="${src}">`))('img').length, 0, src);
        }
    });

    it('preserves branding through production option normalization and Vue gallery rendering', async () => {
        const options = normalizeStaticSiteOptions({headerHtml: header,
            footerHtml: '<div class="gallery-footer-note">Save images</div>',
            stylesCss: '.header-title {display:flex; flex-direction:column; color:black}',
        });
        const {app} = await createApp({options, contents: [], path: '/content-list'}, '/content-list');
        const html = await renderToString(app);
        const $ = load(html);
        assert.equal($('.page-header-content img').length, 1);
        assert.equal($('.page-header-content a.header-title span').length, 2);
        assert.equal($('.gallery-footer-note').text(), 'Save images');
        assert.equal(options.stylesCss, '.header-title {display:flex; flex-direction:column; color:black}');
    });

    it('is idempotent for stored layout options', () => {
        const once = sanitizeStaticSiteLayoutHtml(header);
        assert.equal(sanitizeStaticSiteLayoutHtml(once), once);
    });
});
