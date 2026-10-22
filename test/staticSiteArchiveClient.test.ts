import assert from 'node:assert/strict';
import {renderToString} from 'vue/server-renderer';
import {load} from 'cheerio';
import {archiveLookupUrl} from '../app/modules/staticSiteGenerator/site/public/components/ArchiveDownload/index.js';
import {createApp} from '../app/modules/staticSiteGenerator/site/public/index.js';
import {normalizeStaticSiteOptions} from '../app/modules/staticSiteGenerator/index.js';

describe('static-site archive control', () => {
    it('resolves immutable roots on path and subdomain gateways, including nested pages', () => {
        for (const hostname of ['eraofwave.com', 'eraofmeat.com']) {
            assert.equal(archiveLookupUrl({pathname: '/ipfs/bafy123/post/2/', hostname}), '/api/v1/archive/bafy123');
        }
        assert.equal(archiveLookupUrl({pathname: '/', hostname: 'bafy123.ipfs.site.test'}), '/api/v1/archive/bafy123');
        assert.equal(archiveLookupUrl({pathname: '/', hostname: 'site.test'}), null);
    });

    it('renders the download control only after explicit archive opt-in', async () => {
        for (const archive of [true, false, 'true', undefined]) {
            const options = normalizeStaticSiteOptions({archive});
            const {app} = await createApp({options, contents: [], path: '/content-list'}, '/content-list');
            const $ = load(await renderToString(app));
            assert.equal($('[data-testid="site-archive-control"]').length, archive === true ? 1 : 0);
            if (archive === true) {
                assert.equal($('[data-testid="site-archive-status"]').text().trim(), 'Archive is preparing…');
                assert.equal($('[data-testid="site-archive-download"]').length, 0);
                assert.equal($('[data-testid="site-archive-status"] svg[aria-hidden="true"]').length, 1);
            }
        }
    });
});
