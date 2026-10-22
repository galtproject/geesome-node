export function archiveLookupUrl(location) {
    const pathCid = location.pathname.match(/(?:^|\/)ipfs\/([A-Za-z0-9]+)(?:\/|$)/)?.[1];
    const subdomainCid = location.hostname.match(/^([A-Za-z0-9]+)\.ipfs\./)?.[1];
    const cid = pathCid || subdomainCid;
    if (!cid) {
        return null;
    }
    return '/api/v1/archive/' + encodeURIComponent(cid);
}

const DownloadIcon = {
    template: `<svg class="archive-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4"/><path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/></svg>`,
};

export default {
    components: {DownloadIcon},
    inject: ['store'],
    data() {
        return {state: 'checking', lookup: null, timer: null, controller: null, checks: 0, disposed: false};
    },
    computed: {
        enabled() {
            return this.store.options.archive === true;
        },
        label() {
            if (this.state === 'checking' || this.state === 'pending') {
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
            this.lookup = archiveLookupUrl(window.location);
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
        <a v-if="state === 'ready'" :href="lookup + '/download'" class="archive-download-action" data-testid="site-archive-download" download><download-icon /> <span>Download archive</span></a>
        <button v-else class="archive-download-action" data-testid="site-archive-status" :disabled="state !== 'error'" :aria-busy="state === 'checking' || state === 'pending'" @click="retry">
          <svg v-if="state === 'checking'" class="archive-icon archive-icon-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9"/></svg>
          <svg v-else-if="state === 'pending'" class="archive-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
          <svg v-else-if="state === 'error'" class="archive-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7v5h-5"/><path d="M20 12a8 8 0 1 0-2.3 5.7"/></svg>
          <download-icon v-else />
          <span>{{label}}</span>
        </button>
      </div>
    `,
};
