import {Agent, request} from 'undici';
import {CID} from 'multiformats/cid';
import {gcTimeoutMs, storageRpcOptions} from './rpcDeadline.js';

// GC may emit no bytes while marking a large repository. Use request's explicit
// transport deadlines rather than native fetch's fixed five-minute header limit.
// This dispatcher belongs only to this RPC; other HTTP traffic is unchanged.
export function createKuboGc(endpoint, configuredHeaders = {}) {
    const base = new URL(`${endpoint.protocol}//${endpoint.host}:${endpoint.port}${endpoint.pathname.replace(/\/$/, '')}/`);
    return async function* gc(options: any = {}) {
        const bounded = storageRpcOptions(options, gcTimeoutMs);
        const url = new URL('repo/gc', base);
        url.searchParams.set('timeout', `${bounded.timeout}ms`);
        if (options.streamErrors !== undefined) {
            url.searchParams.set('stream-errors', String(options.streamErrors));
        }
        if (options.quiet !== undefined) {
            url.searchParams.set('quiet', String(options.quiet));
        }
        const headers = new Headers(configuredHeaders);
        for (const [name, value] of new Headers(options.headers)) {
            headers.set(name, value);
        }
        const dispatcher = new Agent({connections: 1});
        try {
            const response = await request(url, {method: 'POST', dispatcher, signal: bounded.signal,
                headers: Object.fromEntries(headers), headersTimeout: bounded.timeout + 1000,
                bodyTimeout: bounded.timeout + 1000});
            if (response.statusCode !== 200) {
                const body: any = await response.body.json();
                throw new Error(`Kubo GC HTTP ${response.statusCode}: ${body?.Message || response.statusCode}`);
            }
            let pending = '';
            const decoder = new TextDecoder();
            const parse = line => {
                const value = JSON.parse(line);
                return {err: value.Error ? new Error(value.Error) : null,
                    cid: value.Key?.['/'] ? CID.parse(value.Key['/']) : null};
            };
            for await (const chunk of response.body) {
                pending += decoder.decode(chunk, {stream: true});
                let end;
                while ((end = pending.indexOf('\n')) !== -1) {
                    const line = pending.slice(0, end).trim();
                    pending = pending.slice(end + 1);
                    if (line) {
                        yield parse(line);
                    }
                }
                if (pending.length > 1024 * 1024) {
                    throw new Error('Kubo GC response line too large');
                }
            }
            pending += decoder.decode();
            if (pending.trim()) {
                yield parse(pending);
            }
        } finally {
            await dispatcher.destroy();
        }
    };
}
