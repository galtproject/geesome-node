import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createKuboGc} from '../app/modules/storage/kuboGc.js';

const cid = 'QmYWQu4zcgiBCR5ztA4PYwMyCYXLRuWngxuwnjJVH929mE';
async function collect(iterable) {
    const result = [];
    for await (const value of iterable) {
        result.push(value);
    }
    return result;
}
async function fixture(run, test) {
    const server = createServer(run);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const port = (server.address() as any).port;
        await test(createKuboGc({protocol: 'http:', host: '127.0.0.1', port, pathname: '/custom/api/'},
            {authorization: 'Bearer fixture-only-canary'}));
    } finally {
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
}

describe('dedicated Kubo GC transport', () => {
    it('streams split NDJSON, preserves authentication and sends the explicit server deadline', async () => {
        await fixture((req, res) => {
            assert.equal(req.headers.authorization, 'Bearer fixture-only-canary');
            assert.equal(req.method, 'POST');
            const url = new URL(req.url, 'http://fixture');
            assert.equal(url.pathname, '/custom/api/repo/gc');
            assert.equal(url.searchParams.get('timeout'), '1000ms');
            assert.equal(url.searchParams.get('stream-errors'), 'true');
            res.writeHead(200, {'content-type': 'application/x-ndjson'});
            res.write('{"Key":');
            setTimeout(() => res.end(JSON.stringify({'/': cid}) + '}\n{"Error":"retained block"}'), 20);
        }, async gc => {
            const values = await collect(gc({timeout: 1000, streamErrors: true}));
            assert.equal(values[0].cid.toString(), cid);
            assert.equal(values[1].err.message, 'retained block');
        });
    });
    it('aborts a stalled response and closes the connection', async () => {
        let started, closed;
        const seen = new Promise<void>(resolve => { started = resolve; });
        const disconnected = new Promise<void>(resolve => { closed = resolve; });
        await fixture((_req, res) => { res.on('close', closed); started(); }, async gc => {
            const controller = new AbortController();
            const work = collect(gc({timeout: 1000, signal: controller.signal}));
            const rejected = assert.rejects(work, /abort|cancel/i);
            await seen;
            controller.abort();
            await rejected;
            await disconnected;
        });
    });
    it('preserves Kubo HTTP errors', async () => {
        await fixture((_req, res) => res.writeHead(500).end(JSON.stringify({Message: 'fixture pin index unavailable'})),
            gc => assert.rejects(collect(gc({timeout: 1000})), /Kubo GC HTTP 500: fixture pin index unavailable/));
    });
});
