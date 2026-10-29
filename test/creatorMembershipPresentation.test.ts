import assert from 'node:assert/strict';
import {postHeading} from '../app/modules/staticSiteGenerator/site/public/creator/presentation.js';
describe('creator post title presentation', () => {
    it('formats only valid exact own-domain timestamps and preserves authored titles', () => {
        assert.deepEqual(postHeading('eraofwave.com - 2025-01-25 16:39:16','eraofwave.com'), {title:'Jan 25, 2025',dateOnly:true});
        for (const title of ['An author title', 'Other eraofwave.com - 2025-01-25 16:39:16', 'elsewhere.test - 2025-01-25 16:39:16', 'eraofwave.com - 2025-02-30 16:39:16', 'eraofwave.com - 2025-01-25 25:39:16']) {
            assert.deepEqual(postHeading(title,'eraofwave.com'), {title,dateOnly:false});
        }
        assert.equal(postHeading('eraofwave.com - 2025-01-25 16:39:16').dateOnly,false);
    });
});
