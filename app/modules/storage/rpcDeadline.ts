import {storageFenceSignal} from '../../storageLifecycle.js';

export const pinTimeoutMs = 120000;
export const defaultImportTimeoutMs = 30 * 60 * 1000;

// The import includes transfer/encoding at Kubo; the former pin-only budget is
// not a universal limit for large or slow files. Operators can choose a bounded
// import policy without changing the short pin-proof budget.
export function storageImportTimeoutMs(environment = process.env) {
    const raw = environment.GEESOME_STORAGE_IMPORT_TIMEOUT_MS;
    if (raw === undefined) {
        return defaultImportTimeoutMs;
    }
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1 || value > 24 * 60 * 60 * 1000) {
        throw new Error('storage_import_timeout_configuration_invalid');
    }
    return value;
}
// GC has a dedicated transport with matching headers/body and RPC deadlines.
export const gcTimeoutMs = 30 * 60 * 1000;

export function storageRpcOptions(options: any = {}, maximumMs = pinTimeoutMs) {
    const timeout = Number.isFinite(options.timeout) && options.timeout > 0
        ? Math.min(options.timeout, maximumMs) : maximumMs;
    const deadline = AbortSignal.timeout(timeout);
    const signals = [options.signal, storageFenceSignal(), deadline].filter(Boolean);
    return {...options, timeout, signal: AbortSignal.any(signals)};
}

export async function storageRpc<T>(name: string, options: any, run: (options: any) => Promise<T>, maximumMs = pinTimeoutMs): Promise<T> {
    const bounded = storageRpcOptions(options, maximumMs);
    try {
        bounded.signal.throwIfAborted();
        return await run(bounded);
    } catch (cause) {
        const detail = cause?.cause?.code || cause?.code || cause?.message || String(cause);
        const reason = bounded.signal.aborted ? bounded.signal.reason : null;
        const code = reason?.name === 'TimeoutError' ? `storage_${name}_timeout`
            : reason ? `storage_${name}_cancelled` : `storage_${name}_failed`;
        throw Object.assign(new Error(`${code}: ${detail}`, {cause}), {code});
    }
}
