export function createGalleryImageLoader(items, onPreview, onError = () => {}) {
    let visible = [];
    let disposed = false;
    let warming = 0;
    const previews = new Map();
    const originals = new Map();
    const attempts = new Map();
    const retries = new Map();
    const pending = new Set();

    function load(url, priority, complete) {
        const image = new Image();
        image.fetchPriority = priority;
        const cancel = () => {
            clearTimeout(timeout);
            image.onload = null;
            image.onerror = null;
            image.removeAttribute('src');
        };
        pending.add(cancel);
        const finish = success => {
            clearTimeout(timeout);
            image.onload = null;
            image.onerror = null;
            pending.delete(cancel);
            if (!disposed) {
                complete(success);
            }
        };
        image.onload = () => finish(true);
        image.onerror = () => finish(false);
        const timeout = setTimeout(() => {
            finish(false);
            image.removeAttribute('src');
        }, 15000);
        image.src = url;
    }

    function pump() {
        if (disposed) {
            return;
        }
        for (const index of visible) {
            if (previews.has(index)) {
                continue;
            }
            previews.set(index, 'loading');
            const attempt = (attempts.get(index) || 0) + 1;
            attempts.set(index, attempt);
            load(items[index].preview, 'high', success => {
                if (success) {
                    previews.set(index, 'loaded');
                    onPreview(index, items[index].preview);
                } else if (attempt < 3) {
                    previews.set(index, 'retrying');
                    retries.set(index, setTimeout(() => {
                        retries.delete(index);
                        previews.delete(index);
                        pump();
                    }, attempt * 500));
                } else {
                    previews.set(index, 'failed');
                }
                pump();
            });
        }
        if (visible.some(index => !['loaded', 'failed'].includes(previews.get(index)))) {
            return;
        }
        for (const index of visible) {
            if (warming >= 2) {
                break;
            }
            if (originals.has(index) || !items[index].original) {
                continue;
            }
            originals.set(index, 'loading');
            warming += 1;
            load(items[index].original, 'low', success => {
                warming -= 1;
                originals.set(index, success ? 'loaded' : 'failed');
                if (previews.get(index) === 'failed') {
                    if (success) {
                        onPreview(index, items[index].original);
                    } else {
                        onError(index);
                    }
                }
                pump();
            });
        }
    }

    return {
        setVisible(indices) {
            visible = [...indices].sort((left, right) => left - right);
            pump();
        },
        retry(index) {
            if (disposed || previews.get(index) !== 'failed' || originals.get(index) !== 'failed') {
                return;
            }
            previews.delete(index);
            originals.delete(index);
            attempts.delete(index);
            pump();
        },
        dispose() {
            disposed = true;
            for (const timer of retries.values()) {
                clearTimeout(timer);
            }
            retries.clear();
            for (const cancel of pending) {
                cancel();
            }
            pending.clear();
        },
    };
}
