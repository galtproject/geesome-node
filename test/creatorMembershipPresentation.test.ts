import assert from 'node:assert/strict';
import {socialLabel, postHeading} from '../app/modules/staticSiteGenerator/site/public/creator/presentation.js';
describe('creator post title presentation', () => {
    it('formats only valid exact own-domain timestamps and preserves authored titles', () => {
        assert.deepEqual(postHeading('eraofwave.com - 2025-01-25 16:39:16','eraofwave.com'), {title:'Jan 25, 2025',dateOnly:true});
        for (const title of ['An author title', 'Other eraofwave.com - 2025-01-25 16:39:16', 'elsewhere.test - 2025-01-25 16:39:16', 'eraofwave.com - 2025-02-30 16:39:16', 'eraofwave.com - 2025-01-25 25:39:16']) {
            assert.deepEqual(postHeading(title,'eraofwave.com'), {title,dateOnly:false});
        }
        assert.equal(postHeading('eraofwave.com - 2025-01-25 16:39:16').dateOnly,false);
    });
});

describe('creator social link labels', () => {
    it('expands imported domain labels without overwriting authored descriptions', () => {
        for (const [host, name] of [['ko-fi.com','Ko-fi'], ['x.com','X'], ['discord.gg','Discord'], ['bsky.app','Bluesky'], ['t.me','Telegram']]) {
            assert.equal(socialLabel(host, `https://${host}/creator`), name);
            assert.equal(socialLabel('My community', `https://${host}/creator`), 'My community');
        }
        assert.equal(socialLabel('bsky.app','https://bsky.app.attacker.test/creator'), 'bsky.app');
    });
});
