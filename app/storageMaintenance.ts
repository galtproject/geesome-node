import {createInterface} from 'node:readline';
import {withStorageFence, storageFenceSignal} from './storageLifecycle.js';

// A host process performs Docker operations. This private stdin/stdout session
// holds the ordinary storage fence inside the configured application container.
// It neither starts the application nor exposes a privileged HTTP endpoint.
export async function storageMaintenanceSession(app, input, output, {
    drainTimeoutMs = 120000, idleTimeoutMs = 90000, signal,
}: {drainTimeoutMs?: number; idleTimeoutMs?: number; signal?: AbortSignal} = {}) {
    for (const value of [drainTimeoutMs, idleTimeoutMs]) {
        if (!Number.isSafeInteger(value) || value < 1) {
            throw new Error('storage_maintenance_budget_invalid');
        }
    }
    const lines = createInterface({input, crlfDelay: Infinity});
    const commands = lines[Symbol.asyncIterator]();
    const admission = new AbortController();
    let failure = new Error('storage_maintenance_disconnected');
    const stop = (error: Error) => {
        failure = error;
        admission.abort();
        lines.close();
    };
    const abort = () => stop(new Error('storage_maintenance_cancelled'));
    const closed = () => admission.abort();
    lines.once('close', closed);
    signal?.addEventListener('abort', abort, {once: true});
    if (signal?.aborted) {
        abort();
    }
    try {
        await withStorageFence(app, 'exclusive', async assertHeld => {
            const lost = () => stop(new Error('storage_fence_lost'));
            const fenceSignal = storageFenceSignal();
            fenceSignal?.addEventListener('abort', lost, {once: true});
            let timer;
            const touch = () => {
                clearTimeout(timer);
                timer = setTimeout(() => stop(new Error('storage_maintenance_idle_timeout')), idleTimeoutMs);
            };
            try {
                await assertHeld();
                output.write('READY\n');
                touch();
                for await (const line of commands) {
                    await assertHeld();
                    if (admission.signal.aborted) {
                        throw failure;
                    }
                    if (line === 'RELEASE') {
                        return;
                    }
                    if (line !== 'CHECK') {
                        throw new Error('storage_maintenance_command_invalid');
                    }
                    output.write('HELD\n');
                    touch();
                }
                throw failure;
            } finally {
                clearTimeout(timer);
                fenceSignal?.removeEventListener('abort', lost);
            }
        }, {admissionTimeoutMs: drainTimeoutMs, signal: admission.signal});
        output.write('RELEASED\n');
    } finally {
        signal?.removeEventListener('abort', abort);
        lines.removeListener('close', closed);
        lines.close();
    }
}
