export const cleanupIdleWaitMs = 60 * 1000;
// Only disk pressure may bypass foreground/quiet time; age alone never does.
export const cleanupMaxWaitMs = 15 * 60 * 1000;

// Scheduling lives in existing receipt JSON, so restarts cannot restart the wait.
export function cleanupBatchReady(rows, foregroundWaiting, now = Date.now(), activity = {active: 0, lastActivityAt: 0}, lowDisk = false) {
    if (!rows.length) {
        return false;
    }
    const oldest = Math.min(...rows.map(row => {
        const queuedAt = Date.parse(row.result?.cleanupQueuedAt || '');
        return Number.isFinite(queuedAt) ? queuedAt : now;
    }));
    if (lowDisk && now - oldest >= cleanupIdleWaitMs) {
        return true;
    }
    return !foregroundWaiting && !activity.active && now - oldest >= cleanupIdleWaitMs
        && now - activity.lastActivityAt >= cleanupIdleWaitMs;
}
