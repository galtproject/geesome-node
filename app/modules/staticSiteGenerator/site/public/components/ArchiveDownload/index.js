export function archiveLookupUrl(apiBase, location) {
    const pathCid = location.pathname.match(/(?:^|\/)ipfs\/([A-Za-z0-9]+)(?:\/|$)/)?.[1];
    const subdomainCid = location.hostname.match(/^([A-Za-z0-9]+)\.ipfs\./)?.[1];
    const cid = pathCid || subdomainCid;
    if (!cid || !apiBase) {
        return null;
    }
    const url = new URL(apiBase);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        return null;
    }
    return apiBase.replace(/\/+$/, '') + '/archive/' + encodeURIComponent(cid);
}

export default {
    inject: ['store'],
    data() {
        return {state: 'checking', lookup: null, timer: null, controller: null, checks: 0, disposed: false};
    },
    computed: {
        enabled() {
            return this.store.options.archive === true;
        },
        label() {
            if (this.state === 'pending') {
                return 'Archive is preparing…';
            }
            if (this.state === 'error') {
                return 'Retry archive download';
            }
            if (this.state === 'unavailable') {
                return 'Archive unavailable';
            }
            return 'Download archive';
        },
    },
    mounted() {
        if (!this.enabled) {
            return;
        }
        try {
            this.lookup = archiveLookupUrl(this.store.options.archiveApiBase, window.location);
        } catch (_error) {
            this.lookup = null;
        }
        if (!this.lookup) {
            this.state = 'unavailable';
            return;
        }
        this.checkArchive();
    },
    beforeUnmount() {
        this.disposed = true;
        clearTimeout(this.timer);
        this.controller?.abort();
    },
    methods: {
        async checkArchive() {
            clearTimeout(this.timer);
            this.controller?.abort();
            this.controller = new AbortController();
            const timeout = setTimeout(() => this.controller.abort(), 8000);
            this.state = 'checking';
            try {
                const response = await fetch(this.lookup, {credentials: 'omit', signal: this.controller.signal, cache: 'no-store'});
                if (this.disposed) {
                    return;
                }
                if (response.status === 404) {
                    this.state = 'pending';
                    if (++this.checks < 20) {
                        this.timer = setTimeout(() => this.checkArchive(), 3000);
                    } else {
                        this.state = 'error';
                    }
                    return;
                }
                if (!response.ok || !(await response.json()).archivedStorageId) {
                    throw new Error('archive_not_available');
                }
                this.state = 'ready';
            } catch (_error) {
                if (!this.disposed) {
                    this.state = 'error';
                }
            } finally {
                clearTimeout(timeout);
            }
        },
        retry() {
            this.checks = 0;
            this.checkArchive();
        },
    },
    template: `
      <div v-if="enabled" class="archive-download" data-testid="site-archive-control">
        <a v-if="state === 'ready'" :href="lookup + '/download'" class="archive-download-action" data-testid="site-archive-download" download>↓ Download archive</a>
        <button v-else class="archive-download-action" data-testid="site-archive-status" :disabled="state !== 'error'" :aria-busy="state === 'checking' || state === 'pending'" @click="retry">↓ {{label}}</button>
        <span class="archive-download-message" role="status" v-if="state === 'pending'">Your archive will be available here shortly.</span>
      </div>
    `,
};
