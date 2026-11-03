import assert from 'node:assert/strict';
import {createRenderer, defineComponent} from 'vue';
import {useCryptoCheckout} from '../app/modules/staticSiteGenerator/site/public/creator/useCryptoCheckout.ts';

const invoice = {id: 'invoice', provider: 'direct' as const, status: 'pending', assetId: 'usdc-base',
    address: '0x1111111111111111111111111111111111111111', amount: '4', received: '0', expiresAt: '2030-01-01T00:00:00Z',
    priceUsd: 4, optionLabel: '1 month', period: 'month', currency: 'USDC', network: 'base'};
const props = {resource: 'wave', option: {id: 'monthly', label: '1 month', amountCents: 400, currency: 'USD', period: 'month'},
    methods: [{id: 'usdc-base', currency: 'USDC', network: 'base', networkLabel: 'Base', available: true},
        {id: 'usdc-ethereum', currency: 'USDC', network: 'ethereum', networkLabel: 'Ethereum', available: true}], resume: null};
const flush = () => new Promise(resolve => setImmediate(resolve));

// Exercise the actual composable with Vue's mount/unmount lifecycle, without a
// browser or a payment provider. DOM/SSR/hydration parity is covered separately.
function mountCheckout(input: Parameters<typeof useCryptoCheckout>[0] = props, confirmed: () => void | Promise<void> = () => {}) {
    let state: ReturnType<typeof useCryptoCheckout>;
    const renderer = createRenderer({
        createComment: () => ({}), createText: () => ({}), createElement: () => ({}),
        insert() {}, remove() {}, setText() {}, setElementText() {}, patchProp() {},
        parentNode: () => null, nextSibling: () => null,
    });
    const app = renderer.createApp(defineComponent({setup() {
        state = useCryptoCheckout(input, confirmed);
        return () => null;
    }}));
    app.mount({});
    return {get state() { return state; }, unmount: () => app.unmount()};
}

describe('creator Vue checkout controller', () => {
    const originalFetch = globalThis.fetch;
    const originalSetInterval = globalThis.setInterval, originalClearInterval = globalThis.clearInterval;
    let checkout: ReturnType<typeof mountCheckout> | undefined;
    afterEach(() => {
        checkout?.unmount();
        checkout = undefined;
        globalThis.fetch = originalFetch;
        globalThis.setInterval = originalSetInterval;
        globalThis.clearInterval = originalClearInterval;
    });
    it('defaults to USDT Ethereum and excludes unavailable currencies and networks', async () => {
        const assets: string[] = [];
        globalThis.fetch = async (_url, init) => {
            if (init?.method !== 'POST') {
                return Response.json({invoices: []});
            }
            const body = JSON.parse(String(init.body));
            assets.push(body.assetId);
            return Response.json({...invoice, assetId: body.assetId, currency: 'USDT', network: 'ethereum'});
        };
        checkout = mountCheckout({...props, methods: [...props.methods,
            {id: 'usdt-tron', currency: 'USDT', network: 'tron', networkLabel: 'TRON', available: false},
            {id: 'btc-bitcoin', currency: 'BTC', network: 'bitcoin', networkLabel: 'Bitcoin', available: false},
            {id: 'usdt-arbitrum', currency: 'USDT', network: 'arbitrum', networkLabel: 'Arbitrum One', available: true},
            {id: 'usdt-ethereum', currency: 'USDT', network: 'ethereum', networkLabel: 'Ethereum', available: true}]});
        await flush(); await flush();
        assert.equal(checkout.state.currency.value, 'USDT');
        assert.equal(checkout.state.asset.value, 'usdt-ethereum');
        assert.deepEqual(checkout.state.currencies.value, ['USDC', 'USDT']);
        assert.deepEqual(checkout.state.networks.value.map(m => m.id), ['usdt-arbitrum', 'usdt-ethereum']);
        checkout.state.selectCurrency('BTC');
        checkout.state.selectAsset('usdt-tron');
        await flush();
        assert.deepEqual(assets, ['usdt-ethereum']);
    });
    it('falls back to an available method and does not create a quote when all methods are unavailable', async () => {
        const assets: string[] = [];
        globalThis.fetch = async (_url, init) => {
            if (init?.method !== 'POST') {
                return Response.json({invoices: []});
            }
            assets.push(JSON.parse(String(init.body)).assetId);
            return Response.json(invoice);
        };
        checkout = mountCheckout({...props, methods: [{id: 'usdt-ethereum', currency: 'USDT', network: 'ethereum', networkLabel: 'Ethereum', available: false}, props.methods[0]]});
        await flush(); await flush();
        assert.deepEqual(assets, ['usdc-base']);
        checkout.unmount();
        checkout = mountCheckout({...props, methods: props.methods.map(m => ({...m, available: false}))});
        await flush(); await flush();
        assert.deepEqual(checkout.state.currencies.value, []);
        assert.deepEqual(checkout.state.networks.value, []);
        assert.equal(checkout.state.asset.value, '');
        assert.deepEqual(assets, ['usdc-base']);
    });
    it('preserves the asset and QR of a resumed invoice even when its method is no longer available', () => {
        globalThis.fetch = async () => { throw Error('no new quote expected'); };
        checkout = mountCheckout({...props, resume: invoice, methods: [
            {...props.methods[0], available: false},
            {id: 'usdt-ethereum', currency: 'USDT', network: 'ethereum', networkLabel: 'Ethereum', available: true}]});
        assert.equal(checkout.state.invoice.value?.id, invoice.id);
        assert.equal(checkout.state.asset.value, 'usdc-base');
        assert.equal(checkout.state.currency.value, 'USDC');
        assert.equal(checkout.state.networkLabel.value, 'Base');
        assert.ok(checkout.state.qr.value);
        assert.deepEqual(checkout.state.currencies.value, ['USDT']);
    });
    it('recovers the pending invoice projection without creating a second quote and stops polling on unmount', async () => {
        const routes: string[] = [];
        const timers = new Set<ReturnType<typeof setInterval>>();
        globalThis.setInterval = ((handler: () => void, timeout: number) => {
            const timer = originalSetInterval(handler, timeout);
            timers.add(timer);
            return timer;
        }) as typeof setInterval;
        globalThis.clearInterval = timer => {
            timers.delete(timer as ReturnType<typeof setInterval>);
            originalClearInterval(timer);
        };

        globalThis.fetch = async (url, init) => {
            routes.push(String(url));
            assert.notEqual(init?.method, 'POST');
            return Response.json(String(url).endsWith('/membership/account')
                ? {invoices: [{id: 'invoice', provider: 'direct', status: 'pending', optionSnapshot: props.option}]}
                : invoice);
        };
        checkout = mountCheckout();
        await flush(); await flush();
        assert.equal(checkout.state.invoice.value?.id, 'invoice');
        assert.deepEqual(routes, ['/api/v1/membership/account', '/api/v1/payments/crypto/invoices/invoice']);
        assert.equal(timers.size, 1);
        checkout.unmount();
        assert.equal(timers.size, 0);
        checkout = undefined;
    });
    it('reuses the quote key after a lost response and creates a new key only when the selected asset changes', async () => {
        const keys: string[] = [];
        globalThis.fetch = async (_url, init) => {
            if (init?.method !== 'POST') {
                return Response.json({invoices: []});
            }
            const body = JSON.parse(String(init.body));
            keys.push(body.idempotencyKey);
            if (keys.length === 1) {
                throw Error('response lost');
            }
            return Response.json({...invoice, assetId: body.assetId});
        };
        checkout = mountCheckout();
        await flush(); await flush();
        assert.equal(checkout.state.invoice.value, null);
        await checkout.state.create();
        assert.equal(keys[0], keys[1]);
        checkout.state.selectAsset('usdc-ethereum');
        await flush(); await flush();
        assert.notEqual(keys[1], keys[2]);
        assert.equal(checkout.state.invoice.value?.assetId, 'usdc-ethereum');
    });
    it('keeps polling a paid invoice until access refresh succeeds', async () => {
        const timers = new Set<ReturnType<typeof setInterval>>();
        globalThis.setInterval = ((handler, delay) => {
            const timer = originalSetInterval(handler, delay);
            timers.add(timer);
            return timer;
        }) as typeof setInterval;
        globalThis.clearInterval = timer => {
            timers.delete(timer as ReturnType<typeof setInterval>);
            originalClearInterval(timer);
        };
        globalThis.fetch = async () => Response.json({...invoice, status: 'paid'});
        let attempts = 0;
        checkout = mountCheckout({...props, resume: invoice}, async () => {
            if (++attempts === 1) {
                throw Error('account unavailable');
            }
        });
        await checkout.state.refresh();
        assert.equal(timers.size, 1);
        assert.match(checkout.state.error.value, /account unavailable/);
        await checkout.state.refresh();
        assert.equal(attempts, 2);
        assert.equal(timers.size, 0);
        assert.equal(checkout.state.error.value, '');
    });
    it('replaces an expired reusable quote and applies saved credit without reusing the expired id', async () => {
        const routes: string[] = [];
        globalThis.fetch = async (url, init) => {
            routes.push(`${init?.method || 'GET'} ${url}`);
            if (String(url).includes('/resource')) {
                return Response.json({cryptoMethods: props.methods});
            }
            if (init?.method === 'POST') {
                return Response.json({...invoice, id: 'replacement', reusableAddress: true, availableCredit: '1', received: '1', status: 'underpaid'});
            }
            return Response.json({invoices: [{id: 'expired', provider: 'direct', status: 'expired', optionSnapshot: props.option}]});
        };
        checkout = mountCheckout({...props, resume: {...invoice, id: 'expired', reusableAddress: true, status: 'expired', expiresAt: '2020-01-01T00:00:00Z'}});
        await flush(); await flush();
        assert.equal(checkout.state.invoice.value?.id, 'replacement');
        assert.equal(checkout.state.remaining.value, '3');
        assert.deepEqual(routes, ['GET /api/v1/membership/resource', 'GET /api/v1/membership/account', 'POST /api/v1/payments/crypto/invoices']);
    });
    it('uses the authenticated bounded reconciliation action for a reusable-address check', async () => {
        const calls: any[] = [];
        globalThis.fetch = async (url, init) => {
            calls.push([String(url), init?.method]);
            return Response.json({...invoice, reusableAddress: true, received: '2', availableCredit: '2', status: 'underpaid'});
        };
        checkout = mountCheckout({...props, resume: {...invoice, reusableAddress: true}});
        await checkout.state.refresh(true);
        assert.deepEqual(calls, [['/api/v1/payments/crypto/invoices/invoice/reconcile', 'POST']]);
        assert.equal(checkout.state.remaining.value, '2');
    });
    it('prefers retained funds once, preserving the asset/key on retry and respecting later manual selection', async () => {
        const attempts: {assetId: string; idempotencyKey: string}[] = [];
        globalThis.fetch = async (_url, init) => {
            if (init?.method !== 'POST') {
                return Response.json({invoices: [], paymentBalances: [{assetId: 'usdc-base', availableCredit: '3', pending: '0'}]});
            }
            const body = JSON.parse(String(init.body)); attempts.push(body);
            if (attempts.length === 1) {
                throw Error('response lost');
            }
            return Response.json({...invoice, assetId: body.assetId});
        };
        checkout = mountCheckout({...props, methods: [...props.methods, {id: 'usdt-ethereum', currency: 'USDT', network: 'ethereum', networkLabel: 'Ethereum', available: true}]});
        await flush(); await flush();
        await checkout.state.create();
        assert.deepEqual(attempts.map(value => value.assetId), ['usdc-base', 'usdc-base']);
        assert.equal(attempts[0].idempotencyKey, attempts[1].idempotencyKey);
        checkout.state.selectAsset('usdc-ethereum');
        await flush(); await flush();
        assert.equal(attempts[2].assetId, 'usdc-ethereum');
        assert.notEqual(attempts[1].idempotencyKey, attempts[2].idempotencyKey);
    });
    it('automatically applies unused funds from a paid reusable invoice to a fresh quote', async () => {
        const posts: string[] = [];
        globalThis.fetch = async (url, init) => {
            if (String(url).includes('/resource')) {
                return Response.json({cryptoMethods: props.methods});
            }
            if (init?.method === 'POST') {
                posts.push(String(url));
                return Response.json({...invoice, id: 'automatic', reusableAddress: true, received: '3', availableCredit: '3', status: 'underpaid'});
            }
            return Response.json({invoices: [{id: 'invoice', provider: 'direct', status: 'paid', optionSnapshot: props.option}]});
        };
        checkout = mountCheckout({...props, resume: {...invoice, status: 'paid', reusableAddress: true, availableCredit: '3'}});
        await flush(); await flush(); await flush();
        assert.equal(checkout.state.invoice.value?.id, 'automatic');
        assert.equal(checkout.state.remaining.value, '1');
        assert.deepEqual(posts, ['/api/v1/payments/crypto/invoices']);
    });
    it('keeps reusable paid checkout polling and automatically consumes a later balance once', async () => {
        let available = '0', created = false, grants = 0, quotes = 0;
        const timers = new Set<number>();
        let sequence = 0;
        globalThis.setInterval = ((_handler, _delay) => {const id = ++sequence; timers.add(id); return id;}) as any;
        globalThis.clearInterval = (id => {timers.delete(Number(id));}) as any;
        globalThis.fetch = async (url, init) => {
            const path = String(url);
            if (path.includes('/resource')) {
                return Response.json({cryptoMethods: props.methods});
            }
            if (path.endsWith('/account')) {
                return Response.json({invoices: [{id: 'invoice', provider: 'direct', status: 'paid', optionSnapshot: props.option}]});
            }
            if (path.endsWith('/invoices') && init?.method === 'POST') {
                quotes++; created = true; available = '0';
            }
            return Response.json({...invoice, id: created ? 'automatic-next' : 'invoice', reusableAddress: true, status: 'paid', availableCredit: available});
        };
        checkout = mountCheckout({...props, resume: {...invoice, reusableAddress: true}}, async () => {grants++;});
        await checkout.state.refresh(); await checkout.state.refresh();
        assert.equal(grants, 1);
        assert.equal(timers.size, 1);
        available = '4';
        await checkout.state.refresh();
        assert.equal(quotes, 1);
        assert.equal(checkout.state.invoice.value?.id, 'automatic-next');
        await checkout.state.refresh(); await checkout.state.refresh();
        assert.equal(grants, 2);
        assert.equal(quotes, 1);
        assert.equal(timers.size, 1);
    });
    it('automatically refreshes an expired reusable quote even with no saved funds', async () => {
        globalThis.fetch = async (url, init) => {
            const path = String(url);
            if (path.includes('/resource')) {
                return Response.json({cryptoMethods: props.methods});
            }
            if (path.endsWith('/account')) {
                return Response.json({invoices: []});
            }
            return Response.json(path.endsWith('/reconcile')
                ? {...invoice, reusableAddress: true, status: 'expired', availableCredit: '0'}
                : {...invoice, id: 'renewed-empty', reusableAddress: true});
        };
        checkout = mountCheckout({...props, resume: {...invoice, reusableAddress: true}});
        await checkout.state.refresh();
        assert.equal(checkout.state.invoice.value?.id, 'renewed-empty');
        assert.equal(checkout.state.invoice.value?.status, 'pending');
    });
    it('ignores an invoice creation response received after unmount', async () => {
        let resolve!: (response: Response) => void;
        globalThis.fetch = async (_url, init) => init?.method === 'POST'
            ? new Promise<Response>(done => { resolve = done; }) : Response.json({invoices: []});
        checkout = mountCheckout();
        await flush();
        const state = checkout.state;
        checkout.unmount();
        checkout = undefined;
        resolve(Response.json(invoice));
        await flush(); await flush();
        assert.equal(state.invoice.value, null);
    });
});
