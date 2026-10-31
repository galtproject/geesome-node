import {AsyncLocalStorage} from 'node:async_hooks';
import {performance} from 'node:perf_hooks';

const scopes = new AsyncLocalStorage<any>();
const names = new Set(['authorize', 'reuse_lookup', 'source_lookup', 'source_open', 'save_content', 'input_read',
    'metadata', 'watermark', 'encode', 'preview_total', 'preview_queue', 'preview_read_encode', 'preview_read', 'preview_source_open', 'preview_metadata',
    'storage_write', 'storage_stat', 'db_lookup', 'db_add', 'manifest', 'provenance_write', 'quota_lookup']);
const counters = new Set(['inputBytes', 'encodedBytes', 'previewInputBytes', 'previewOutputBytes', 'encodedWidth', 'encodedHeight']);
const rounded = value => Math.round(Math.max(0, value) * 1000) / 1000;

export function imageResaveTimingsEnabled() {
    return process.env.GEESOME_IMAGE_RESAVE_TIMINGS === '1';
}

// Only this scope activates the probes below. No request headers/URLs/Content
// properties are accepted as labels. Timings are elapsed spans, not CPU time.
export async function withImageResaveTimings(enabled: boolean, createdAt: any, action: () => Promise<any>) {
    if (!enabled) {
        return {value: await scopes.run(undefined, action)};
    }
    const start = performance.now();
    const created = createdAt ? new Date(createdAt).getTime() : NaN;
    const queueAgeMs = Number.isFinite(created) ? Math.max(0, Date.now() - created) : null;
    const collector = {start, spans: [], bytes: {}, reused: false, truncated: false};
    const value = await scopes.run({collector, parentId: null}, action);
    return {value, timings: {schemaVersion: 1, reused: collector.reused,
        queueAgeMs,
        totalMs: rounded(performance.now() - start), spans: collector.spans, counters: collector.bytes,
        truncated: collector.truncated}};
}

export async function imageResaveSpan<T>(name: string, action: () => Promise<T>): Promise<T> {
    const scope = scopes.getStore();
    if (!scope || !names.has(name)) {
        return action();
    }
    const collector = scope.collector;
    if (collector.spans.length >= 96) {
        collector.truncated = true;
        return action();
    }
    const start = performance.now();
    const span = {id: collector.spans.length, parentId: scope.parentId, name,
        offsetMs: rounded(start - collector.start), durationMs: 0, outcome: 'error'};
    collector.spans.push(span);
    try {
        const result = await scopes.run({collector, parentId: span.id}, action);
        span.outcome = 'ok';
        return result;
    } finally {
        span.durationMs = rounded(performance.now() - start);
    }
}

export function imageResaveCounter(name: string, value: number) {
    const scope = scopes.getStore();
    if (scope && counters.has(name) && Number.isFinite(value) && value >= 0) {
        scope.collector.bytes[name] = (scope.collector.bytes[name] || 0) + value;
    }
}

export function markImageResaveReused() {
    const scope = scopes.getStore();
    if (scope) {
        scope.collector.reused = true;
    }
}

export function startImageResaveWait(name: string) {
    const scope = scopes.getStore();
    if (!scope || !names.has(name)) {
        return (_outcome = 'ok') => {};
    }
    if (scope.collector.spans.length >= 96) {
        scope.collector.truncated = true;
        return (_outcome = 'ok') => {};
    }
    const start = performance.now();
    const span = {id: scope.collector.spans.length, parentId: scope.parentId, name,
        offsetMs: rounded(start - scope.collector.start), durationMs: 0, outcome: 'error'};
    scope.collector.spans.push(span);
    let done = false;
    return (outcome = 'ok') => {
        if (!done) {
            done = true;
            span.durationMs = rounded(performance.now() - start);
            span.outcome = outcome;
        }
    };
}
