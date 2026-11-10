// HTTP attempts and admitted writers share this per-application activity clock.
// A new process starts conservatively busy; an old receipt cannot bypass quiet time.
const activity = new WeakMap<object, {active: number; lastActivityAt: number}>();

export function storageActivitySnapshot(app, now = Date.now()) {
    let state = activity.get(app);
    if (!state) {
        state = {active: 0, lastActivityAt: now};
        activity.set(app, state);
    }
    return {...state};
}

export function noteStorageActivity(app, now = Date.now()) {
    storageActivitySnapshot(app, now);
    activity.get(app).lastActivityAt = now;
}

export function beginStorageActivity(app, now = Date.now()) {
    noteStorageActivity(app, now);
    activity.get(app).active++;
    let ended = false;
    return (finishedAt = Date.now()) => {
        if (!ended) {
            ended = true;
            activity.get(app).active--;
            noteStorageActivity(app, finishedAt);
        }
    };
}
