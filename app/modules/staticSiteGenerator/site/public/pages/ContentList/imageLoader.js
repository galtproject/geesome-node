export function createGalleryImageLoader(items, onPreview) {
    let visible = [];
    let disposed = false;
    let warming = 0;
    const previews = new Map();
    const originals = new Set();
    const pending = new Set();

    function load(url, priority, complete) {
        const image = new Image();
        image.fetchPriority = priority;
        const cancel = () => {
            image.onload = null;
            image.onerror = null;
            image.removeAttribute('src');
        };
        pending.add(cancel);
        const finish = success => {
            image.onload = null;
            image.onerror = null;
            pending.delete(cancel);
            if (!disposed) {
                complete(success);
            }
        };
        image.onload = () => finish(true);
        image.onerror = () => finish(false);
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
            load(items[index].preview, 'high', success => {
                previews.set(index, 'settled');
                if (success) {
                    onPreview(index, items[index].preview);
                }
                pump();
            });
        }
        if (visible.some(index => previews.get(index) !== 'settled')) {
            return;
        }
        for (const index of visible) {
            if (warming >= 2) {
                break;
            }
            if (originals.has(index) || !items[index].original) {
                continue;
            }
            originals.add(index);
            warming += 1;
            load(items[index].original, 'low', () => {
                warming -= 1;
                pump();
            });
        }
    }

    return {
        setVisible(indices) {
            visible = [...indices].sort((left, right) => left - right);
            pump();
        },
        dispose() {
            disposed = true;
            for (const cancel of pending) {
                cancel();
            }
            pending.clear();
        },
    };
}
