import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { membershipRequest, newRequestKey } from './api.ts';
import { addressQr, remainingAmount, type CryptoMethod, type CryptoInvoice } from './crypto.ts';
import type { MembershipInvoice, MembershipOption } from './types.ts';
export interface CheckoutProps {
    resource: string;
    option: MembershipOption;
    methods: CryptoMethod[];
    resume: CryptoInvoice | null;
}
export function useCryptoCheckout(props: CheckoutProps, paid: () => void) {
    const availableMethods = computed(() => props.methods.filter(m => m.available));
    const initial = availableMethods.value.find(m => m.id === 'usdt-ethereum') || availableMethods.value[0];
    const invoice = ref<CryptoInvoice | null>(props.resume);
    const currency = ref(props.resume?.currency || initial?.currency || '');
    const asset = ref(props.resume?.assetId || initial?.id || '');
    const busy = ref(false), previousQr = ref(''), creating = ref(false), error = ref(''), notice = ref('');
    const detailsElement = ref<HTMLElement | null>(null), reservedHeight = ref(0);
    function reserveHeight() {
        const height = detailsElement.value?.getBoundingClientRect().height || 0;
        if (height) {
            reservedHeight.value = Math.max(reservedHeight.value, Math.ceil(height));
        }
    }
    let key = newRequestKey(), timer: ReturnType<typeof setInterval> | null = null, alive = true, revision = 0, checking = false;
    const networks = computed(() => availableMethods.value.filter(m => m.currency === currency.value));
    const currencies = computed(() => [...new Set(availableMethods.value.map(m => m.currency))]);
    const remaining = computed(() => invoice.value ? remainingAmount(invoice.value.amount, invoice.value.received) : '');
    const chosen = computed(() => props.methods.find(m => m.id === asset.value));
    const networkLabel = computed(() => props.methods.find(m => m.id === (invoice.value?.assetId || asset.value))?.networkLabel || invoice.value?.network || '');
    const qr = computed(() => invoice.value?.address ? addressQr(invoice.value.address) : '');
    function reset() {
        reserveHeight();
        previousQr.value = qr.value || previousQr.value;
        revision++;
        checking = false;
        busy.value = false;
        invoice.value = null;
        key = newRequestKey();
        error.value = '';
        notice.value = '';
        if (timer) {
            clearInterval(timer);
        }
        timer = null;
    }
    function selectCurrency(value: string) {
        const method = availableMethods.value.find(m => m.currency === value && m.id === 'usdt-ethereum')
            || availableMethods.value.find(m => m.currency === value);
        if (!method || value === currency.value) {
            return;
        }
        reset();
        currency.value = value;
        asset.value = method.id;
        void create();
    }
    function selectAsset(value: string) {
        if (value === asset.value || !networks.value.some(m => m.id === value)) {
            return;
        }
        reset();
        asset.value = value;
        void create();
    }
    async function refresh(manual = false) {
        if (checking || creating.value || !invoice.value) {
            return;
        }
        const id = invoice.value.id, rev = revision;
        checking = true;
        if (manual) {
            busy.value = true;
        }
        try {
            const data = await membershipRequest(`/crypto/invoices/${encodeURIComponent(id)}?resource=${encodeURIComponent(props.resource)}`);
            if (!alive || rev !== revision) {
                return;
            }
            const next = data.invoice || data;
            if (JSON.stringify(invoice.value) !== JSON.stringify(next)) {
                invoice.value = next;
            }
            error.value = '';
            if (invoice.value?.status === 'paid') {
                if (timer) {
                    clearInterval(timer);
                }
                timer = null;
                paid();
            }
        }
        catch (e: any) {
            if (alive && rev === revision) {
                error.value = `Status temporarily unavailable. Your invoice is preserved. ${e.message}`;
            }
        }
        finally {
            if (rev === revision) {
                checking = false;
                busy.value = false;
            }
        }
    }
    function poll() {
        if (timer) {
            clearInterval(timer);
        }
        timer = setInterval(() => void refresh(), 5000);
    }
    async function create() {
        if (creating.value || !chosen.value?.available) {
            return;
        }
        const rev = revision;
        creating.value = true;
        error.value = '';
        try {
            // Reuse unfinished invoices when returning to checkout or switching back to a network.
            // Managed wallets reject a second unfinished invoice for the same reader, resource and asset.
            const account: {
                invoices?: MembershipInvoice[];
            } = await membershipRequest(`/account?resource=${encodeURIComponent(props.resource)}`);
            if (!alive || rev !== revision) {
                return;
            }
            let existing = account.invoices?.find(p => p.provider === 'direct' && p.optionSnapshot?.id === props.option.id && p.crypto?.assetId === asset.value && ['pending', 'underpaid', 'confirming'].includes(p.crypto.status));
            // GeeSome's account projection keeps payment details on the invoice endpoint.
            // Recover an unfinished invoice before creating a new receiving quote.
            if (!existing) {
                for (const payment of account.invoices || []) {
                    if (payment.provider !== 'direct' || payment.optionSnapshot?.id !== props.option.id || payment.status !== 'pending') {
                        continue;
                    }
                    const crypto = await membershipRequest(`/crypto/invoices/${encodeURIComponent(payment.id)}`);
                    if (crypto.assetId === asset.value && ['pending', 'underpaid', 'confirming'].includes(crypto.status)) {
                        existing = { ...payment, crypto };
                        break;
                    }
                }
            }
            const data = existing ? existing.crypto : await membershipRequest('/crypto/invoices', { resource: props.resource, optionId: props.option.id, assetId: asset.value, idempotencyKey: key });
            if (alive && rev === revision) {
                reserveHeight();
                invoice.value = data.invoice || data;
                poll();
            }
        }
        catch (e: any) {
            if (alive && rev === revision) {
                error.value = e.message;
            }
        }
        finally {
            if (rev === revision) {
                creating.value = false;
            }
        }
    }
    async function copy(value: string) {
        try {
            await navigator.clipboard.writeText(value);
            notice.value = 'Copied';
        }
        catch {
            notice.value = 'Copy unavailable. Select and copy the displayed value.';
        }
    }
    onMounted(() => {
        if (invoice.value) {
            poll();
        }
        else {
            void create();
        }
    });
    onBeforeUnmount(() => {
        alive = false;
        if (timer) {
            clearInterval(timer);
        }
    });
    return { invoice, currency, asset, busy, previousQr, creating, error, notice,
        detailsElement, reservedHeight, networks, currencies, remaining, chosen,
        networkLabel, qr, selectCurrency, selectAsset, refresh, create, copy };
}
