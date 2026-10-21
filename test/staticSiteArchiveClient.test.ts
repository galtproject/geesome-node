import assert from 'node:assert/strict';
import {renderToString} from 'vue/server-renderer';
import {load} from 'cheerio';
import {archiveLookupUrl} from '../app/modules/staticSiteGenerator/site/public/components/ArchiveDownload/index.js';
import {createApp} from '../app/modules/staticSiteGenerator/site/public/index.js';
import {normalizeStaticSiteOptions} from '../app/modules/staticSiteGenerator/index.js';

describe('static-site archive control', () => {
    it('resolves immutable roots on path and subdomain gateways, including nested pages', () => {
        assert.equal(archiveLookupUrl('https://node.test/api/v1/', {pathname: '/prefix/ipfs/bafy123/post/2/', hostname: 'site.test'}), 'https://node.test/api/v1/archive/bafy123');
        assert.equal(archiveLookupUrl('https://node.test/v1', {pathname: '/', hostname: 'bafy123.ipfs.site.test'}), 'https://node.test/v1/archive/bafy123');
        assert.equal(archiveLookupUrl('https://node.test/v1', {pathname: '/', hostname: 'site.test'}), null);
        assert.equal(archiveLookupUrl('https://user:pass@node.test/v1', {pathname: '/ipfs/bafy123/', hostname: 'site.test'}), null);
    });

    it('renders the download control only after explicit archive opt-in', async () => {
        for (const archive of [true, false, 'true', undefined]) {
            const options = normalizeStaticSiteOptions({archive});
            const {app} = await createApp({options, contents: [], path: '/content-list'}, '/content-list');
            const $ = load(await renderToString(app));
            assert.equal($('[data-testid="site-archive-control"]').length, archive === true ? 1 : 0);
            if (archive === true) {
                assert.equal($('[data-testid="site-archive-status"]').text().trim(), '↓ Download archive');
            }
        }
    });
});
