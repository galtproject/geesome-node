import assert from 'node:assert/strict';
import {rememberActivation, takeActivation} from '../app/modules/staticSiteGenerator/site/public/creator/activationNotice.js';

function storage() {
    const values = new Map<string, string>();
    return {getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key)};
}
const account = {reader: {id: 'reader'}, active: true, invoices: [{id: 'payment', status: 'paid', provider: 'direct'}], refunds: []};
describe('subscription activation redirect notice', () => {
    it('survives the selector redirect and is consumed once for the matching active reader/payment', () => {
        const store = storage();
        rememberActivation('wave', 'reader', 'payment', 1000, store);
        assert.equal(takeActivation('meat', account, 2000, store), null);
        assert.equal(takeActivation('wave', account, 2000, store), 'payment');
        assert.equal(takeActivation('wave', account, 2000, store), null);
    });
    it('rejects stale, future, refunded, inactive, malformed and other-reader notices', () => {
        for (const [time, value] of [[400001, account], [500, account], [2000, {...account, active: false}],
            [2000, {...account, reader: {id: 'someone-else'}}], [2000, {...account, invoices: [{id: 'payment', status: 'refunded', provider: 'direct'}]}]] as const) {
            const store = storage();
            rememberActivation('wave', 'reader', 'payment', 1000, store);
            assert.equal(takeActivation('wave', value as any, time, store), null);
            assert.equal(store.getItem('membership:activation:wave'), null);
        }
        const store = storage();
        store.setItem('membership:activation:wave', '{invalid');
        assert.equal(takeActivation('wave', account, 2000, store), null);
    });
    it('does not interrupt access when session storage is blocked', () => {
        const blocked = {getItem() {throw Error('blocked');}, setItem() {throw Error('blocked');}, removeItem() {throw Error('blocked');}};
        assert.doesNotThrow(() => rememberActivation('wave', 'reader', 'payment', 1000, blocked));
        assert.equal(takeActivation('wave', account, 2000, blocked), null);
    });
});
