import assert from 'node:assert/strict';
import {publicPostShareUrl, shareLink} from '../app/modules/staticSiteGenerator/site/public/creator/share.js';

describe('creator post sharing', () => {
    it('shares a public selector rather than the paid immutable snapshot', () => {
        assert.equal(publicPostShareUrl(12, 'creator.test', './', 'https://creator.test/ipfs/paid/posts/12/'),
            'https://creator.test/api/v1/membership/site/posts/12/');
    });
    it('uses native sharing, handles cancellation, and falls back after a share failure', async () => {
        let copied = '';
        const browser: any = {share: async data => { assert.equal(data.url, 'https://creator.test/post'); }, clipboard: {writeText: async url => {copied=url;}}};
        assert.equal(await shareLink('https://creator.test/post', 'Post', browser), 'shared');
        browser.share = async () => {throw Object.assign(Error('cancel'), {name:'AbortError'});};
        assert.equal(await shareLink('https://creator.test/post', 'Post', browser), 'cancelled');
        assert.equal(copied, '');
        browser.share = async () => {throw Error('unavailable');};
        assert.equal(await shareLink('https://creator.test/post', 'Post', browser), 'copied');
        assert.equal(copied, 'https://creator.test/post');
    });
    it('offers manual copying when clipboard is missing or denied', async () => {
        assert.equal(await shareLink('https://creator.test/post', 'Post', {} as any), 'manual');
        assert.equal(await shareLink('https://creator.test/post', 'Post', {clipboard:{writeText:async()=>{throw Error('denied');}}} as any), 'manual');
    });
});
