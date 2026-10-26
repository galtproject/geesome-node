export const cleanupIdleWaitMs = 60 * 1000;
export const cleanupMaxWaitMs = 15 * 60 * 1000;

// Scheduling lives in existing receipt JSON, so restarts cannot restart the wait.
export function cleanupBatchReady(rows, foregroundWaiting, now = Date.now()) {
    if (!rows.length) {
        return false;
    }
    if (rows.some(row => row.result?.cleanupRetry?.force || row.result?.cleanupRetry?.nextAttemptAt)) {
        return true; // cleanupDue already enforces persisted failure backoff.
    }
    const oldest = Math.min(...rows.map(row => {
        const queuedAt = Date.parse(row.result?.cleanupQueuedAt || '');
        return Number.isFinite(queuedAt) ? queuedAt : now;
    }));
    return now - oldest >= (foregroundWaiting ? cleanupMaxWaitMs : cleanupIdleWaitMs);
}
