import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { membershipRequest, newRequestKey } from './api.ts';
import { useMembershipModal } from './useMembershipModal.ts';
import { normalizeAccount } from './presentation.ts';
import type { CryptoMethod, CryptoInvoice } from './crypto.ts';
import type { PublicState, MembershipAccount, MembershipOption, MembershipInvoice, PreviewMedia } from './types.ts';
export function useMembershipSession(initialState: PublicState) {
    const resource = ref(initialState.resource), posts = ref(initialState.posts), nextOffset = ref(initialState.nextOffset);
    const account = ref<MembershipAccount | null>(null), checked = ref(false), busy = ref(false), error = ref('');
    const { modal, gallery, imageIndex, closeModal, openModal } = useMembershipModal(error);
    const selectedOption = ref(''), options = ref<MembershipOption[]>([]);
    const paymentMethod = ref('plans'), cryptoMethods = ref<CryptoMethod[]>([]), cryptoResume = ref<CryptoInvoice | null>(null);
    const refundInvoice = ref<MembershipInvoice | null>(null), refundReason = ref(''), loginIntent = ref(''), shareStatus = ref('');
    let refresh: ReturnType<typeof setInterval> | null = null;
    let refundKey = '';
    let expiryTimer: ReturnType<typeof setTimeout> | null = null;
    function clearPremium() { posts.value = posts.value.map(post => post.free ? post : { ...post, pageUrl: undefined, locked: true }); }
    const resourceId = computed(() => resource.value.id);
    const publicPath = (path: string) => {
        const snapshot = initialState.snapshot;
        if (path === '/') {
            return snapshot.homePath;
        }
        if (path.startsWith('/account') || path === '/login') {
            return snapshot.accountPath;
        }
        const post = posts.value.find(item => path === `/posts/${item.id}`);
        return post?.postPath || snapshot.homePath;
    };
    // A mounted domain always serves the public directory. Access changes must
    // resolve the full/public CID through the selector, rather than reload it.
    const selectionPath = () => initialState.snapshot.entryPath;
    const query = () => `resource=${encodeURIComponent(resourceId.value)}`;
    const active = computed(() => Boolean(account.value?.active));
    const expired = computed(() => Boolean(account.value?.expired || (!active.value && (account.value?.invoices || []).some(payment => ['paid', 'confirmed', 'refunded'].includes(payment.status)))));
    const activeUntil = computed(() => account.value?.activeUntil);
    const enabled = computed(() => resource.value.postsEnabled === true);
    const accountPath = computed(() => initialState.path.startsWith('/account'));
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
    async function checkAccount() {
        try {
            const data = await membershipRequest(`/account?${query()}`);
            account.value = data.reader ? normalizeAccount(data) : null;
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
                if (account.value) {
                    account.value.active = false;
                    account.value.expired = true;
                }
            }
            else {
                expiryTimer = setTimeout(() => {
                    if (Date.now() >= expires) {
                        clearPremium();
                        if (account.value) {
                    account.value.active = false;
                    account.value.expired = true;
                }
                    }
                    run(updateAccess);
                }, Math.min(delay, 2147483647));
            }
        }
    }
    async function updateAccess() {
        try {
            await checkAccount();
            if (active.value && !initialState.snapshot.full) {
                location.assign(selectionPath());
                return;
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
        if (active.value) {
            location.assign(selectionPath());
            return;
        }
        const intent = loginIntent.value;
        loginIntent.value = '';
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
            options.value = data.options || [];
            selectedOption.value = options.value[0]?.id || '';
            if (!cryptoMethods.value.some(m => m.available)) {
                error.value = 'Payments are not available yet. Please check back soon.';
            }
        });
    }
    async function logout() {
        await run(async () => {
            await membershipRequest(`/auth/logout?${query()}`, {});
            account.value = null;
            clearPremium();
            location.assign(selectionPath());
        });
    }
    async function more() {
        if (initialState.snapshot.nextPage) {
            location.assign(initialState.snapshot.nextPage);
        }
    }
    onMounted(() => {
        if (enabled.value || accountPath.value) {
            run(updateAccess);
            refresh = setInterval(() => run(updateAccess), 60000);
        }
    });
    onBeforeUnmount(() => {
        if (refresh) {
            clearInterval(refresh);
        }
        if (expiryTimer) {
            clearTimeout(expiryTimer);
        }
    });
    async function showGallery(previews: PreviewMedia[], index: number) {
        gallery.value = previews;
        imageIndex.value = index;
        await openModal('gallery');
    }
    async function sharePost(id: string | number) {
        try {
            await navigator.clipboard.writeText(new URL(publicPath(`/posts/${encodeURIComponent(id)}`), location.href).href);
            shareStatus.value = 'Post link copied';
        }
        catch {
            shareStatus.value = 'Open the post title to copy its address.';
        }
    }
    async function requestRefund(payment: MembershipInvoice) {
        refundInvoice.value = payment;
        refundReason.value = '';
        refundKey = newRequestKey();
        await openModal('refund');
    }
    async function submitRefund() {
        if (!refundInvoice.value) {
            return;
        }
        const invoiceId = refundInvoice.value.id;
        await run(async () => {
            await membershipRequest('/refunds', { resource: resourceId.value, invoiceId, idempotencyKey: refundKey, reason: refundReason.value });
            await checkAccount();
            closeModal();
        });
    }
    async function resumePayment(payment: MembershipInvoice) {
        cryptoResume.value = payment.crypto || await membershipRequest(`/crypto/invoices/${encodeURIComponent(payment.id)}`);
        paymentMethod.value = 'direct';
        selectedOption.value = payment.optionSnapshot?.id || '';
        options.value = [payment.optionSnapshot || {}];
        cryptoMethods.value = resource.value.cryptoMethods || [];
        await openModal('checkout');
    }
    function backToPlans() {
        paymentMethod.value = 'plans';
        cryptoResume.value = null;
    }
    function refreshAccess() {
        return run(updateAccess);
    }
    function openAccount() {
        location.assign(publicPath('/account/subscription'));
    }
    return { resource, posts, nextOffset, account, checked, busy, error, modal, gallery, imageIndex,
        selectedOption, options, paymentMethod, cryptoMethods, cryptoResume, refundReason, shareStatus,
        resourceId, active, expired, activeUntil, enabled, accountPath, publicPath,
        closeModal, login, loginModal, checkout, logout, more, showGallery, sharePost,
        requestRefund, submitRefund, resumePayment, backToPlans, refreshAccess, openAccount };
}
