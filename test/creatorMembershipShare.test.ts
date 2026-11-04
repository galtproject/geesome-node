import assert from 'node:assert/strict';
import {publicPostShareUrl, copyPostLink} from '../app/modules/staticSiteGenerator/site/public/creator/share.js';

describe('creator post sharing', () => {
    it('shares the canonical public page from a paid immutable snapshot', () => {
        assert.equal(publicPostShareUrl(12, 'creator.test', './', 'https://creator.test/ipfs/paid/posts/12/'),
            'https://creator.test/posts/12/');
    });
    it('copies directly to clipboard and reports failures honestly', async () => {
        let copied = '';
        assert.equal(await copyPostLink('https://creator.test/post', {clipboard:{writeText:async url=>{copied=url;}}} as any), true);
        assert.equal(copied, 'https://creator.test/post');
        assert.equal(await copyPostLink('https://creator.test/post', {} as any), false);
        assert.equal(await copyPostLink('https://creator.test/post', {clipboard:{writeText:async()=>{throw Error('denied');}}} as any), false);
    });
});
