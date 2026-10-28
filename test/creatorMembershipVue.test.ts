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
function mountCheckout(input: Parameters<typeof useCryptoCheckout>[0] = props) {
    let state: ReturnType<typeof useCryptoCheckout>;
    const renderer = createRenderer({
        createComment: () => ({}), createText: () => ({}), createElement: () => ({}),
        insert() {}, remove() {}, setText() {}, setElementText() {}, patchProp() {},
        parentNode: () => null, nextSibling: () => null,
    });
    const app = renderer.createApp(defineComponent({setup() {
        state = useCryptoCheckout(input, () => {});
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
