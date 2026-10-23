export function cleanupDue(row, now = Date.now()) {
    const next = row.result?.cleanupRetry?.nextAttemptAt;
    return !next || new Date(next).getTime() <= now;
}

export function cleanupFailure(row, error, now = Date.now()) {
    const failures = (row.result?.cleanupRetry?.failures || 0) + 1;
    return {status: failures >= 3 ? 'cleanup_failed' : row.status,
        result: {...row.result, cleanupRetry: {failures, resumeStatus: row.status,
            nextAttemptAt: new Date(now + [15000, 60000, 300000][Math.min(failures - 1, 2)]).toISOString()}},
        error: error.code && !error.message?.startsWith(error.code) ? `${error.code}: ${error.message}` : error.message};
}
