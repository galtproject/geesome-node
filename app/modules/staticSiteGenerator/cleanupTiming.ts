// Stored in the existing replacement receipt, including failed/interrupted runs.
export async function cleanupPhase(rows, name, run, now = Date.now, assertHeld = async () => {}) {
    const startedAt = now();
    for (const row of rows) {
        const previous = row.result?.cleanupTiming?.[name];
        await assertHeld();
        await row.update({result: {...row.result, cleanupTiming: {...row.result?.cleanupTiming,
            [name]: {startedAt: new Date(startedAt).toISOString(), attempts: (previous?.attempts || 0) + 1,
                ...(previous?.startedAt && !previous?.finishedAt ? {interruptedAt: previous.startedAt} : {})}}}});
    }
    try {
        const result = await run();
        await finish(null);
        return result;
    } catch (error) {
        await finish(error);
        throw error;
    }
    async function finish(error) {
        const finishedAt = now();
        for (const row of rows) {
            await assertHeld();
            await row.update({result: {...row.result, cleanupTiming: {...row.result?.cleanupTiming,
                [name]: {...row.result?.cleanupTiming?.[name], finishedAt: new Date(finishedAt).toISOString(),
                    durationMs: Math.max(0, finishedAt - startedAt), outcome: error ? 'failed' : 'complete',
                    ...(error ? {error: String(error.code || error.message || error).slice(0, 200)} : {})}}}});
        }
    }
}
