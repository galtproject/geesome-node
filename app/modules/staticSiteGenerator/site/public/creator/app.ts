import { defineComponent, h, ref, computed, onMounted, onBeforeUnmount, nextTick, type PropType } from 'vue';
import { membershipRequest, newRequestKey, money, safeSiteUrl, accessPeriodLabel } from './api.ts';
import { CryptoCheckout } from './CryptoCheckout.ts';
import { PreviewImage } from './media.ts';
export interface PublicState {
    resource: any;
    posts: any[];
    nextOffset: number | null;
    path: string;
    snapshot?: any;
}
export function createInitialState(input: Partial<PublicState> = {}): PublicState {
    return { resource: input.resource || {}, posts: (input as any).post ? [(input as any).post] : input.posts || [], nextOffset: input.nextOffset ?? null, path: input.path || '/', snapshot: input.snapshot };
}
const button = (text: string, click: () => unknown, props: any = {}) => h('button', { type: 'button', onClick: click, ...props }, text);
const link = (text: any, url: unknown, props: any = {}) => safeSiteUrl(url) ? h('a', { href: safeSiteUrl(url), target: '_blank', rel: 'noopener noreferrer', ...props }, text) : null;
const mediaUrl = (media: any) => typeof media === 'string' ? media : media.url || media.previewUrl;
const listOf = (value: any) => Array.isArray(value) ? value : value?.list || value?.posts || [];
const date = (value: any) => value ? new Date(value).toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' }) : '';
export const App = defineComponent({
    name: 'MembershipPublicApp',
    props: { initialState: { type: Object as PropType<PublicState>, required: true } },
    setup(props) {
        const resource = ref(props.initialState.resource), posts = ref(props.initialState.posts), nextOffset = ref(props.initialState.nextOffset);
        const account = ref<any>(null), checked = ref(false), busy = ref(false), error = ref(''), modal = ref(''), expanded = ref(false);
        const gallery = ref<any[]>([]), imageIndex = ref(0), selectedOption = ref(''), options = ref<any[]>([]);
        const paymentMethod = ref('plans'), cryptoMethods = ref<any[]>([]), cryptoResume = ref<any>(null);
        const refundInvoice = ref<any>(null), refundReason = ref(''), loginIntent = ref(''), shareStatus = ref('');
        let savedFocus: HTMLElement | null = null, refresh: ReturnType<typeof setInterval> | null = null, touchX = 0;
        let refundKey = '', previousBodyOverflow = '';
        let expiryTimer: ReturnType<typeof setTimeout> | null = null;
        let feedQueue = Promise.resolve();
        function withFeedQueue(action: () => Promise<void>) {
            const pending = feedQueue.then(action);
            feedQueue = pending.catch(() => { });
            return pending;
        }
        function clearPremium() { posts.value = posts.value.map(post => post.free ? post : { ...post, pageUrl: undefined, pageLink: undefined, premium: undefined, locked: true }); }
        const resourceId = computed(() => resource.value.id || resource.value.resourceId || 'wave');
        const publicPrefix = () => '';
        const publicPath = (path: string) => {
            const snapshot = props.initialState.snapshot;
            if (snapshot) {
                if (path === '/') {
                    return snapshot.homePath;
                }
                if (path.startsWith('/account') || path === '/login') {
                    return snapshot.accountPath;
                }
                const post = posts.value.find(item => path === `/posts/${item.id}`);
                return post?.postPath || snapshot.homePath;
            }
            return (resource.value.publicBasePath || publicPrefix()) + path;
        };
        const socialIcon = (url: unknown) => listOf(resource.value.links).find((item: any) => item.url === url)?.iconUrl || null;
        const query = () => `resource=${encodeURIComponent(resourceId.value)}`;
        const active = computed(() => Boolean(account.value?.active || account.value?.entitlement?.active || account.value?.subscription?.active));
        const expired = computed(() => Boolean(account.value?.expired || (!active.value && listOf(account.value?.invoices || account.value?.payments).some((payment: any) => ['paid', 'confirmed', 'refunded'].includes(payment.status)))));
        const activeUntil = computed(() => account.value?.activeUntil || account.value?.entitlement?.activeUntil || account.value?.subscription?.activeUntil || account.value?.expiresAt);
        const enabled = computed(() => resource.value.postsEnabled === true);
        const accountPath = computed(() => props.initialState.path.startsWith('/account'));
        function closeModal() {
            modal.value = '';
            gallery.value = [];
            error.value = '';
            document.body.style.overflow = previousBodyOverflow;
            savedFocus?.focus();
        }
        async function openModal(name: string) {
            if (!modal.value) {
                savedFocus = document.activeElement as HTMLElement;
                previousBodyOverflow = document.body.style.overflow;
            }
            modal.value = name;
            error.value = '';
            document.body.style.overflow = 'hidden';
            await nextTick();
            (document.querySelector('.membership-modal button, .membership-modal input') as HTMLElement)?.focus();
        }
        async function run(action: () => Promise<void>) {
            busy.value = true;
            error.value = '';
            try {
                await action();
            }
            catch (e: any) {
                error.value = e.message;
            }
            finally {
                busy.value = false;
            }
        }
        async function fetchPosts() {
            if (props.initialState.snapshot) {
                return;
            }
            return withFeedQueue(async () => {
                const detail = props.initialState.path.match(/^\/posts\/([^/]+)/);
                if (detail) {
                    const data = await membershipRequest(`/posts/${encodeURIComponent(detail[1])}?${query()}`);
                    posts.value = [data.post || data];
                }
                else {
                    // Refresh the entire loaded window, respecting the API's 50-post limit.
                    // Apply it atomically so later pages never retain stale paid links.
                    const count = Math.max(10, posts.value.length, nextOffset.value || 0);
                    const refreshed: any[] = [];
                    let offset = 0, next: number | null = null;
                    while (offset < count) {
                        const limit = Math.min(50, count - offset);
                        const data = await membershipRequest(`/feed?${query()}&offset=${offset}&limit=${limit}`);
                        const batch = listOf(data);
                        refreshed.push(...batch);
                        next = data.nextOffset ?? (data.hasMore ? offset + batch.length : null);
                        if (next === null || next <= offset || !batch.length) {
                            break;
                        }
                        offset = next;
                    }
                    posts.value = refreshed;
                    nextOffset.value = next;
                }
            });
        }
        async function checkAccount() {
            try {
                const data = await membershipRequest(`/account?${query()}`);
                account.value = data.reader ? data : null;
            }
            catch (e: any) {
                if (e.status === 401) {
                    account.value = null;
                }
                else {
                    throw e;
                }
            }
            checked.value = true;
            if (expiryTimer) {
                clearTimeout(expiryTimer);
            }
            const expires = new Date(account.value?.expiresAt || account.value?.activeUntil || '').getTime();
            if (Number.isFinite(expires)) {
                const delay = expires - Date.now();
                if (delay <= 0) {
                    clearPremium();
                    account.value = { ...account.value, active: false, expired: true };
                }
                else {
                    expiryTimer = setTimeout(() => { if (Date.now() >= expires) {
                        clearPremium();
                        account.value = { ...account.value, active: false, expired: true };
                    } run(updateAccess); }, Math.min(delay, 2147483647));
                }
            }
        }
        async function updateAccess() {
            try {
                await checkAccount();
                if (props.initialState.snapshot && active.value && !props.initialState.snapshot.full) {
                    location.assign(props.initialState.snapshot.entryPath);
                    return;
                }
                if (enabled.value) {
                    await fetchPosts();
                }
            }
            catch (e) {
                clearPremium();
                throw e;
            }
        }
        async function login(credential: string) {
            let signedIn = false;
            await run(async () => {
                await membershipRequest(`/auth/google?${query()}`, { credential });
                await checkAccount();
                if (!account.value) {
                    throw new Error('Could not confirm sign-in. Please try again.');
                }
                signedIn = true;
                closeModal();
            });
            if (!signedIn) {
                return;
            }
            if (props.initialState.snapshot && active.value) {
                location.assign(props.initialState.snapshot.entryPath);
                return;
            }
            const intent = loginIntent.value;
            loginIntent.value = '';
            // Session confirmation ends sign-in. Slow archive loading must not hold
            // the login dialog or checkout controls open/busy.
            if (enabled.value) {
                void fetchPosts().catch((e: any) => { clearPremium(); error.value = e.message; });
            }
            if (intent === 'checkout') {
                await checkout();
            }
        }
        async function loginModal(intent = '') {
            loginIntent.value = intent;
            await openModal('login');
            if (resource.value.e2eMockAuth) {
                return;
            }
            await run(async () => {
                const challenge = await membershipRequest('/auth/challenge');
                const w = window as any;
                if (!w.google?.accounts?.id) {
                    await new Promise<void>((resolve, reject) => {
                        const script = document.createElement('script');
                        script.src = 'https://accounts.google.com/gsi/client?hl=en';
                        script.async = true;
                        script.onload = () => resolve();
                        script.onerror = () => reject(new Error('Could not load Google sign-in. Please try again.'));
                        document.head.appendChild(script);
                    });
                }
                w.google.accounts.id.initialize({ client_id: challenge.googleClientId, nonce: challenge.nonce, callback: (response: any) => login(response.credential) });
                const container = document.getElementById('membership-google');
                if (modal.value !== 'login' || !container) {
                    return;
                }
                const width = Math.min(400, Math.floor(container.clientWidth || 400));
                w.google.accounts.id.renderButton(container, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', locale: 'en', width: String(width) });
            });
        }
        async function checkout() {
            if (!account.value) {
                await loginModal('checkout');
                return;
            }
            await openModal('checkout');
            paymentMethod.value = 'plans';
            cryptoResume.value = null;
            await run(async () => {
                const data = await membershipRequest(`/resource?${query()}`);
                cryptoMethods.value = data.cryptoMethods || [];
                options.value = listOf(data.options || data.billingOptions || data.subscriptionOptions);
                selectedOption.value = options.value[0]?.id || '';
                if (!cryptoMethods.value.some(m => m.available)) {
                    error.value = 'Payments are not available yet. Please check back soon.';
                }
            });
        }
        async function logout() { await run(async () => { await membershipRequest(`/auth/logout?${query()}`, {}); account.value = null; clearPremium(); if (props.initialState.snapshot) {
            location.assign(props.initialState.snapshot.entryPath);
            return;
        } if (enabled.value) {
            await fetchPosts();
        } }); }
        async function more() {
            await run(() => withFeedQueue(async () => {
                if (props.initialState.snapshot?.nextPage) {
                    location.assign(props.initialState.snapshot.nextPage);
                    return;
                }
                if (nextOffset.value === null) {
                    return;
                }
                const data = await membershipRequest(`/feed?${query()}&offset=${nextOffset.value}&limit=10`);
                const ids = new Set(posts.value.map(p => p.id));
                posts.value.push(...listOf(data).filter((p: any) => !ids.has(p.id)));
                nextOffset.value = data.nextOffset ?? (data.hasMore ? Number(nextOffset.value) + listOf(data).length : null);
            }));
        }
        function keydown(event: KeyboardEvent) {
            if (!modal.value) {
                return;
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                closeModal();
            }
            if (modal.value === 'gallery' && event.key === 'ArrowRight') {
                imageIndex.value = (imageIndex.value + 1) % gallery.value.length;
            }
            if (modal.value === 'gallery' && event.key === 'ArrowLeft') {
                imageIndex.value = (imageIndex.value + gallery.value.length - 1) % gallery.value.length;
            }
            if (event.key === 'Tab') {
                const nodes = Array.from(document.querySelectorAll<HTMLElement>('.membership-modal button:not([disabled]), .membership-modal a[href], .membership-modal input, .membership-modal textarea, .membership-modal select'));
                const first = nodes[0], last = nodes[nodes.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last?.focus();
                }
                else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first?.focus();
                }
            }
        }
        onMounted(() => {
            if (!props.initialState.snapshot && location.pathname.startsWith('/site/')) {
                resource.value = { ...resource.value, publicBasePath: `/site/${resourceId.value}` };
            }
            document.addEventListener('keydown', keydown);
            if (enabled.value || accountPath.value) {
                run(updateAccess);
                refresh = setInterval(() => run(updateAccess), 60000);
            }
        });
        onBeforeUnmount(() => { document.removeEventListener('keydown', keydown); if (refresh) {
            clearInterval(refresh);
        } if (expiryTimer) {
            clearTimeout(expiryTimer);
        } });
        function postCard(post: any) {
            const previews = listOf(post.previews || post.previewMedia || post.media);
            const pageUrl = post.pageUrl || post.premium?.pageUrl || post.pageLink;
            return h('article', { id: props.initialState.path.startsWith('/posts/') ? 'post-full-content' : undefined, class: 'member-post', key: post.id, 'data-testid': `post-${post.id}` }, [
                h('div', { class: `preview-grid preview-grid--${Math.min(previews.length, 3)}` }, previews.map((media: any, index: number) => h('button', {
                    type: 'button', class: 'preview-button', 'aria-label': `Open preview ${index + 1}`, 'data-testid': `preview-${index}`,
                    onClick: async () => { gallery.value = previews; imageIndex.value = index; await openModal('gallery'); },
                }, [h(PreviewImage, { src: mediaUrl(media), alt: media.alt || `${post.title} — preview ${index + 1}` })]))),
                h('div', { class: 'post-copy' }, [h('h2', [h('a', { href: publicPath(`/posts/${encodeURIComponent(post.id)}`) }, post.title)]), h('time', { datetime: post.publishedAt }, date(post.publishedAt || post.createdAt)), h('p', { class: 'post-description' }, post.description || post.publicDescription || ''),
                    ...(props.initialState.path.startsWith('/posts/') ? (post.attachments || []).map((item: any) => item.text !== undefined ? h('p', { class: 'post-description' }, item.text) : item.mime.startsWith('video/') ? h('video', { controls: true, preload: 'metadata' }, [h('source', { src: item.url, type: item.mime })]) : h('a', { class: 'attachment-link', href: item.url, target: '_blank', rel: 'noopener noreferrer' }, item.name || 'Download file')) : []),
                    h('div', { class: 'post-actions' }, [button('Share ↗', async () => { try {
                            await navigator.clipboard.writeText(new URL(publicPath(`/posts/${encodeURIComponent(post.id)}`), location.href).href);
                            shareStatus.value = 'Post link copied';
                        }
                        catch {
                            shareStatus.value = 'Open the post title to copy its address.';
                        } }, { 'data-testid': 'share-post' }),
                        pageUrl ? link('View full set ↗', pageUrl, { class: 'primary', 'data-testid': 'view-full-set' }) : button(!checked.value ? 'Checking access…' : expired.value ? 'Renew membership' : 'Subscribe to unlock', checkout, { class: 'primary', disabled: !checked.value, 'data-testid': 'subscribe-post' })]),
                    !pageUrl ? h('small', 'Membership unlocks full-set links across the entire archive.') : null]),
            ]);
        }
        const footerLinks = () => h('footer', { class: 'member-footer' }, [h('span', '© ' + resource.value.title), ...listOf(resource.value.legalLinks).map((item: any) => link(item.label, item.url))]);
        const socials = () => h('aside', { class: 'support-card', 'data-testid': 'social-links' }, [
            h('h2', 'Find me elsewhere'), link('Support on Patreon ↗', resource.value.patreonUrl || resource.value.links?.find((l: any) => /patreon/i.test(l.label))?.url, { class: 'patreon-link' }),
            !expanded.value ? h('div', { class: 'social-icons' }, listOf(resource.value.links).filter((l: any) => !/patreon/i.test(l.label)).map((item: any) => link(socialIcon(item.url) ? h('img', { src: socialIcon(item.url), alt: '', width: 20, height: 20 }) : item.label.slice(0, 2).toUpperCase(), item.url, { 'aria-label': item.label, title: item.label }))) : null,
            expanded.value ? h('ul', { class: 'full-links' }, listOf(resource.value.links).map((item: any) => h('li', [link([socialIcon(item.url) ? h('img', { src: socialIcon(item.url), alt: '', width: 20, height: 20 }) : null, `${item.label} ↗`] as any, item.url)]))) : null,
            button(expanded.value ? 'Hide links' : 'Show links', () => expanded.value = !expanded.value, { 'aria-expanded': expanded.value, 'data-testid': 'expand-links' }),
        ]);
        function accountView() {
            if (!checked.value) {
                return h('p', 'Checking your account…');
            }
            if (!account.value) {
                return h('section', { class: 'account-panel' }, [h('h2', 'Your membership'), h('p', 'Sign in to view your subscription and payment history.'), enabled.value ? button('Continue with Google', () => loginModal(), { class: 'primary' }) : h('p', 'Sign-in is currently unavailable. Existing signed-in members can still view their payment history here.')]);
            }
            const payments = listOf(account.value.invoices || account.value.payments).filter((payment: any) => payment.status !== 'expired');
            return h('section', { class: 'account-panel', 'data-testid': 'reader-account' }, [h('h2', 'Your membership'), h('p', active.value ? `Active · Access until ${date(activeUntil.value)}` : 'No active membership'), enabled.value ? button(active.value ? 'Extend membership' : 'Renew membership', checkout, { class: 'primary' }) : h('p', 'New purchases are currently unavailable.'), h('p', 'Access includes the entire archive. One-time payments do not renew automatically.'), h('h3', 'Payment history'),
                ...payments.map((payment: any) => h('div', { class: 'payment-row', key: payment.id }, [h('div', [h('strong', money(payment.amountMinor || payment.optionSnapshot?.amountCents || payment.priceMinor || 0, payment.currency)), h('p', `${date(payment.createdAt)} · ${payment.status}`)]),
                    active.value && ['confirmed', 'paid'].includes(payment.status) && !listOf(account.value.refunds).some((r: any) => r.invoiceId === payment.id) ? button('Request refund', async () => { refundInvoice.value = payment; refundReason.value = ''; refundKey = newRequestKey(); await openModal('refund'); }, { 'data-testid': `refund-${payment.id}` }) : null,
                    listOf(account.value.refunds).filter((r: any) => r.invoiceId === payment.id).map((r: any) => h('span', `Refund: ${r.status}`)),
                    payment.provider === 'direct' ? button('View crypto payment', async () => { cryptoResume.value = payment.crypto || await membershipRequest(`/crypto/invoices/${encodeURIComponent(payment.id)}`); paymentMethod.value = 'direct'; selectedOption.value = payment.optionSnapshot?.id || ''; options.value = [payment.optionSnapshot || {}]; cryptoMethods.value = resource.value.cryptoMethods || []; await openModal('checkout'); }, { 'data-testid': `crypto-resume-${payment.id}` }) : null])),
                h('h3', 'Account'), h('p', account.value.reader?.name || account.value.reader?.email || 'Google account'), button('Sign out', logout, { 'data-testid': 'reader-logout' })]);
        }
        function modalContent() {
            if (modal.value === 'gallery') {
                return [h('h2', { id: 'membership-dialog-title' }, 'Preview gallery'), h('div', { class: 'gallery-image', onTouchstart: (e: TouchEvent) => touchX = e.changedTouches[0].clientX, onTouchend: (e: TouchEvent) => { const delta = e.changedTouches[0].clientX - touchX; if (Math.abs(delta) > 40) {
                            imageIndex.value = (imageIndex.value + (delta < 0 ? 1 : gallery.value.length - 1)) % gallery.value.length;
                        } } }, [h(PreviewImage, { key: imageIndex.value, src: mediaUrl(gallery.value[imageIndex.value] || {}), alt: `Preview ${imageIndex.value + 1}`, retry: true })]), h('div', { class: 'gallery-controls' }, [gallery.value.length > 1 ? button('← Previous', () => imageIndex.value = (imageIndex.value + gallery.value.length - 1) % gallery.value.length) : null, h('span', `${imageIndex.value + 1} / ${gallery.value.length}`), gallery.value.length > 1 ? button('Next →', () => imageIndex.value = (imageIndex.value + 1) % gallery.value.length) : null])];
            }
            if (modal.value === 'login') {
                return [h('h2', { id: 'membership-dialog-title' }, 'Sign in or create an account'), h('p', 'Continue with Google to manage your membership.'), h('div', { id: 'membership-google' }), resource.value.e2eMockAuth ? button('Continue with Google', () => login('e2e-reader'), { 'data-testid': 'google-mock-login', disabled: busy.value }) : null];
            }
            if (modal.value === 'refund') {
                return [h('h2', { id: 'membership-dialog-title' }, 'Request a refund'), h('p', 'Submitting a request does not cancel your access. The author will review it.'), h('label', ['Reason', h('textarea', { value: refundReason.value, maxlength: 2000, onInput: (e: any) => refundReason.value = e.target.value, 'data-testid': 'refund-reason' })]), button('Submit request', () => run(async () => { await membershipRequest('/refunds', { resource: resourceId.value, invoiceId: refundInvoice.value.id, idempotencyKey: refundKey, reason: refundReason.value }); await checkAccount(); closeModal(); }), { class: 'primary', disabled: busy.value || !refundReason.value.trim(), 'data-testid': 'submit-refund' })];
            }
            if (paymentMethod.value === 'direct') {
                return [h('h2', { id: 'membership-dialog-title' }, 'Direct crypto payment'), h(CryptoCheckout, { resource: resourceId.value, option: options.value.find(o => o.id === selectedOption.value) || options.value[0] || {}, methods: cryptoMethods.value, resume: cryptoResume.value, onBack: () => { paymentMethod.value = 'plans'; cryptoResume.value = null; }, onPaid: () => run(updateAccess) })];
            }
            const selected = options.value.find(o => o.id === selectedOption.value);
            const directReady = cryptoMethods.value.some(m => m.available);
            const selectedTotal = selected ? money(selected.amountMinor ?? selected.amountCents, selected.currency) : '';
            return [h('span', { class: 'crypto-eyebrow' }, 'Your membership'),
                h('h2', { id: 'membership-dialog-title' }, 'Unlock every full set'),
                h('p', { class: 'membership-intro' }, `Get the entire ${resource.value.title} archive and every new post during your access period.`),
                [
                    h('div', { class: 'membership-perks' }, [h('span', '✓ Entire archive'), h('span', '✓ New posts included'), h('span', '✓ Full-set links')]),
                    h('fieldset', { class: 'membership-plans' }, [h('legend', 'Choose your access period'), ...options.value.map(option => {
                            const monthly = options.value.find(o => o.period === 'month' && o.currency === option.currency);
                            const saving = option.period === 'halfyear' && monthly ? monthly.amountCents * 6 - option.amountCents : 0;
                            return h('label', { class: ['membership-plan', selectedOption.value === option.id ? 'is-selected' : ''], 'data-testid': `membership-plan-${option.period}` }, [
                                h('input', { type: 'radio', name: 'option', value: option.id, checked: selectedOption.value === option.id, onChange: () => { selectedOption.value = option.id; } }),
                                h('span', { class: 'membership-plan-copy' }, [h('strong', accessPeriodLabel(option.period)), h('small', option.period === 'halfyear' ? `${money(Math.round(option.amountCents / 6), option.currency)} / month · paid once` : 'Full archive access')]),
                                h('span', { class: 'membership-plan-price' }, [h('strong', money(option.amountMinor ?? option.amountCents, option.currency)), saving > 0 ? h('small', { class: 'membership-saving' }, `Save ${money(saving, option.currency)}`) : null]),
                            ]);
                        })]),
                    h('p', { class: 'membership-renewal' }, 'One-time payment. No automatic renewal.'),
                    directReady ? button(`Continue to payment${selectedTotal ? ` · ${selectedTotal}` : ''} →`, () => { paymentMethod.value = 'direct'; }, { class: 'primary membership-continue', disabled: busy.value || !selectedOption.value, 'data-testid': 'direct-crypto-payment' }) : null,
                ]];
        }
        return () => h('div', { class: ['membership-site', resourceId.value === 'meat' ? 'theme-meat' : 'theme-wave', !enabled.value ? 'links-only' : ''] }, [
            h('header', { class: 'member-nav' }, [h('a', { href: publicPath('/'), class: 'brand' }, resource.value.title || 'Era Of Wave'), enabled.value ? account.value ? h('a', { href: publicPath('/account/subscription'), 'data-testid': 'account-link' }, 'My account') : button('Sign in', () => loginModal(), { 'data-testid': 'reader-login' }) : null]),
            h('section', { class: 'creator-cover', style: (resource.value.coverUrl || resource.value.cover) ? { backgroundImage: `url(${JSON.stringify((resource.value.coverUrl || resource.value.cover))})` } : {} }, [h('span', { class: 'cover-shade' })]),
            h('section', { class: 'creator-profile' }, [(resource.value.avatarUrl || resource.value.avatar) ? h('img', { class: 'creator-avatar', src: (resource.value.avatarUrl || resource.value.avatar), alt: `${resource.value.title} avatar` }) : null, h('div', [h('h1', resource.value.title), h('p', resource.value.description)]), enabled.value ? button(active.value ? `Active until ${date(activeUntil.value)}` : expired.value ? 'Renew membership' : resource.value.options?.length ? (() => { const option = [...resource.value.options].sort((a: any, b: any) => a.amountCents - b.amountCents)[0]; return `Join · ${money(option.amountCents, option.currency)} / ${accessPeriodLabel(option.period)}`; })() : 'Join membership', active.value ? () => location.assign(publicPath('/account/subscription')) : checkout, { class: 'primary', 'data-testid': 'join-membership' }) : null]),
            error.value && !modal.value ? h('div', { class: 'error-banner', role: 'alert' }, [error.value, button('Retry', () => run(updateAccess))]) : null,
            h('main', { class: 'member-layout' }, [socials(), enabled.value || accountPath.value ? h('div', { class: 'member-feed' }, [accountPath.value ? accountView() : [props.initialState.path.startsWith('/posts/') ? h('a', { href: publicPath('/'), class: 'back-link' }, '← All posts') : h('h2', { class: 'feed-heading' }, 'Latest posts'), ...posts.value.map(postCard), posts.value.length === 0 ? h('section', { class: 'account-panel' }, [h('h2', 'New work is on the way'), h('p', 'Find the latest updates through the links above.')]) : null, nextOffset.value !== null ? button(busy.value ? 'Loading…' : 'Load more', more, { class: 'load-more', disabled: busy.value, 'data-testid': 'load-more' }) : null], shareStatus.value ? h('p', { role: 'status' }, shareStatus.value) : null]) : null]), footerLinks(),
            modal.value ? h('div', { class: 'membership-backdrop', onClick: (e: any) => { if (e.target === e.currentTarget) {
                    closeModal();
                } } }, [h('section', { class: ['membership-modal', modal.value === 'gallery' ? 'gallery-modal' : paymentMethod.value === 'direct' && modal.value === 'checkout' ? 'crypto-modal' : ''], role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'membership-dialog-title', 'data-testid': `modal-${modal.value}` }, [button('×', closeModal, { class: 'modal-close', 'aria-label': 'Close dialog' }), ...modalContent(), error.value ? h('p', { role: 'alert', class: 'error-banner' }, error.value) : null])]) : null,
        ]);
    },
});
