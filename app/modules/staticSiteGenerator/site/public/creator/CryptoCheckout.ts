import { defineComponent, h, ref, computed, onMounted, onBeforeUnmount, type PropType } from 'vue';
import { membershipRequest, newRequestKey, accessPeriodLabel } from './api.ts';
import { addressQr, cryptoStatusText, remainingAmount, paymentAmount, type CryptoMethod, type CryptoInvoice } from './crypto.ts';
const button = (label: string, action: () => unknown, attrs: any = {}) => h('button', { type: 'button', onClick: action, ...attrs }, label);
const benefit = (title: string, description: string) => h('li', [
    h('span', { class: 'crypto-benefit-icon', 'aria-hidden': 'true' }, '✓'),
    h('div', [h('strong', title), h('p', description)])
]);
function paymentLoading(currency: string, network: string, previousQr: string) {
    const text = (className: string, value: string) => h('p', { class: [className, 'crypto-loading-spacer-text'] }, value);
    const field = (label: string, address = false) => h('div', { class: 'crypto-detail' }, [
        h('div', { class: 'crypto-detail-title' }, [label, address ? h('span', { class: 'crypto-network-badge crypto-loading-spacer-text' }, network) : null]),
        h('div', { class: 'crypto-copy-row' }, [h('span', { class: 'crypto-loading-spacer-value' }), h('span', { class: 'crypto-loading-spacer-copy' })])
    ]);
    return h('div', { class: 'crypto-loading-payment', role: 'status', 'data-testid': 'crypto-loading' }, [
        h('span', { class: 'crypto-sr-only' }, 'Loading payment details'),
        h('div', { 'aria-hidden': 'true' }, [
            h('div', { class: 'crypto-scan' }, [h('div', { class: 'crypto-qr-loading' }, [previousQr ? h('img', { class: 'crypto-qr crypto-qr--muted', src: previousQr, alt: '' }) : h('div', { class: 'crypto-qr crypto-qr--muted' }), h('span', { class: 'crypto-qr-spinner', 'aria-hidden': 'true' })]), text('crypto-scan-caption', `Scan to pay ${currency} on ${network}`)]),
            field('Exact amount'), field('Receiving address', true),
            text('crypto-transfer-note', `Send only ${currency} on ${network}. Add wallet fees separately so the exact amount arrives.`),
            h('div', { class: 'crypto-progress' }, [
                text('', `Confirmed received: 0 ${currency}`), text('', 'Quote expires: 10/17/2026, 12:00:00 AM'),
                h('div', { class: 'crypto-status-control' }, [text('crypto-status', 'Waiting for payment'), h('span', { class: 'crypto-loading-spacer-check' })]),
                text('crypto-monitoring', 'Automatic monitoring ends: 10/24/2026, 12:00:00 AM. Contact the author about payments after that date.')
            ])
        ])
    ]);
}
export const CryptoCheckout = defineComponent({
    props: {
        resource: { type: String, required: true }, option: { type: Object, required: true },
        methods: { type: Array as PropType<CryptoMethod[]>, default: () => [] },
        resume: { type: Object as PropType<CryptoInvoice | null>, default: null }
    },
    emits: ['paid', 'back'],
    setup(props, { emit }) {
        const initial = props.methods.find(m => m.id === 'usdc-base' && m.available) || props.methods.find(m => m.available) || props.methods[0];
        const invoice = ref<CryptoInvoice | null>(props.resume);
        const currency = ref(props.resume?.currency || initial?.currency || 'ETH');
        const asset = ref(props.resume?.assetId || initial?.id || '');
        const busy = ref(false), previousQr = ref(''), creating = ref(false), error = ref(''), notice = ref('');
        const detailsElement = ref<HTMLElement | null>(null), reservedHeight = ref(0);
        function reserveHeight() { const height = detailsElement.value?.getBoundingClientRect().height || 0; if (height) {
            reservedHeight.value = Math.max(reservedHeight.value, Math.ceil(height));
        } }
        let key = newRequestKey(), timer: ReturnType<typeof setInterval> | null = null, alive = true, revision = 0, checking = false;
        const networks = computed(() => props.methods.filter(m => m.currency === currency.value));
        const currencies = computed(() => [...new Set(props.methods.map(m => m.currency))]);
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
            if (value === currency.value) {
                return;
            }
            reset();
            currency.value = value;
            asset.value = props.methods.find(m => m.currency === value && m.available)?.id || props.methods.find(m => m.currency === value)?.id || '';
            void create();
        }
        function selectAsset(value: string) {
            if (value === asset.value) {
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
                    emit('paid');
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
        function poll() { if (timer) {
            clearInterval(timer);
        } timer = setInterval(() => void refresh(), 5000); }
        async function create() {
            if (creating.value || !chosen.value?.available) {
                return;
            }
            const rev = revision;
            creating.value = true;
            error.value = '';
            try {
                // Reuse unfinished invoices when returning to checkout or switching back to a network.
                // Managed wallets reject a second unfinished invoice for the same reader and asset.
                const account = await membershipRequest(`/account?resource=${encodeURIComponent(props.resource)}`);
                if (!alive || rev !== revision) {
                    return;
                }
                let existing = account.invoices?.find((p: any) => p.provider === 'direct' && p.optionSnapshot?.id === props.option.id && p.crypto?.assetId === asset.value && ['pending', 'underpaid', 'confirming'].includes(p.crypto.status));
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
        onMounted(() => { if (invoice.value) {
            poll();
        }
        else {
            void create();
        } });
        onBeforeUnmount(() => { alive = false; if (timer) {
            clearInterval(timer);
        } });
        return () => h('div', { class: 'crypto-checkout', 'data-testid': 'crypto-checkout' }, [
            h('div', { class: 'crypto-checkout-header', 'data-testid': 'crypto-checkout-header' }, [
                h('button', { type: 'button', class: 'crypto-back', onClick: () => emit('back'), 'data-testid': 'crypto-back' }, [h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, [h('path', { d: 'm15 18-6-6 6-6' })]), 'Payment methods']),
                h('div', { class: 'crypto-value-banner', 'data-testid': 'crypto-value-banner' }, [
                    h('span', { class: 'crypto-value-icon', 'aria-hidden': 'true' }, '↘'),
                    h('div', [h('strong', 'Less than Patreon. More value here.'), h('p', 'Get your membership for less when you buy directly on this site.')])
                ])
            ]),
            h('div', { class: 'crypto-payment' }, [
                h('h3', 'Pay with cryptocurrency'),
                h('div', { class: 'crypto-currencies', role: 'group', 'aria-label': 'Currency' }, currencies.value.map(c => button(c, () => selectCurrency(c), { 'aria-pressed': currency.value === c, disabled: creating.value, 'data-testid': `crypto-currency-${c}` }))),
                h('label', { class: 'crypto-network' }, ['Network', h('select', { value: asset.value, disabled: creating.value, onChange: (e: any) => selectAsset(e.target.value), 'data-testid': 'crypto-network' }, networks.value.map(m => h('option', { value: m.id }, `${m.networkLabel}${m.available ? '' : ' — unavailable'}`)))]),
                h('div', { class: 'crypto-payment-details', ref: detailsElement, style: reservedHeight.value ? { minHeight: `${reservedHeight.value}px` } : undefined, 'aria-busy': creating.value }, [
                    !invoice.value ? (creating.value ? paymentLoading(currency.value, networkLabel.value, previousQr.value) : h('div', { class: 'crypto-qr-placeholder' }, [
                        h('p', { role: 'status', 'data-testid': chosen.value?.available ? 'crypto-retry' : 'crypto-unavailable' }, chosen.value?.available ? 'Your payment details could not be loaded.' : 'This network is currently unavailable. Choose another currency or network.'),
                        chosen.value?.available ? button('Retry loading payment details', create, { class: 'primary', disabled: creating.value, 'data-testid': 'crypto-create' }) : null
                    ])) : [
                        h('div', { class: 'crypto-scan' }, [
                            h('img', { class: 'crypto-qr', src: qr.value, alt: `Receiving address QR for ${invoice.value.currency} on ${networkLabel.value}`, 'data-testid': 'crypto-qr' }),
                            h('p', { class: 'crypto-scan-caption' }, ['Scan to pay ', h('strong', `${invoice.value.currency} on ${networkLabel.value}`)])
                        ]),
                        h('div', { class: 'crypto-detail' }, [h('span', { class: 'crypto-detail-title' }, 'Exact amount'), h('div', { class: 'crypto-copy-row' }, [h('code', { 'data-testid': 'crypto-amount' }, `${paymentAmount(invoice.value.amount, invoice.value.currency)} ${invoice.value.currency}`), button('Copy amount', () => copy(paymentAmount(invoice.value!.amount, invoice.value!.currency)), { 'data-testid': 'crypto-copy-amount' })])]),
                        h('div', { class: 'crypto-detail' }, [h('div', { class: 'crypto-detail-title' }, ['Receiving address', h('span', { class: 'crypto-network-badge' }, networkLabel.value)]), h('div', { class: 'crypto-copy-row crypto-copy-row--address' }, [h('code', { 'data-testid': 'crypto-address' }, invoice.value.address), button('Copy address', () => copy(invoice.value!.address), { 'data-testid': 'crypto-copy-address' })])]),
                        h('p', { class: 'crypto-transfer-note' }, `Send only ${invoice.value.currency} on ${networkLabel.value}. Add wallet fees separately so the exact amount arrives.`),
                        invoice.value.lastError ? h('p', { role: 'status' }, ['crypto_balance_outgoing_untracked', 'crypto_balance_regressed', 'crypto_balance_reorg', 'crypto_balance_finality_regressed'].includes(invoice.value.lastError) ? 'Payment verification needs an author review. Your invoice and confirmed payments are preserved.' : 'Network monitoring is temporarily unavailable. Your invoice and confirmed payments are preserved.') : null,
                        h('div', { class: 'crypto-progress' }, [
                            h('p', `Confirmed received: ${invoice.value.received} ${invoice.value.currency}`),
                            invoice.value.status === 'underpaid' ? h('div', { class: 'crypto-detail' }, ['Remaining to send', h('code', { 'data-testid': 'crypto-remaining' }, `${remaining.value} ${invoice.value.currency}`), button('Copy remaining amount', () => copy(remaining.value), { 'data-testid': 'crypto-copy-remaining' })]) : null,
                            h('p', `Quote expires: ${new Date(invoice.value.expiresAt).toLocaleString('en-US')}`),
                            h('div', { class: 'crypto-status-control', 'data-testid': 'crypto-status-control' }, [
                                h('p', { class: `crypto-status crypto-status--${invoice.value.status}`, role: 'status', 'aria-live': 'polite', 'data-testid': 'crypto-status' }, cryptoStatusText[invoice.value.status] || invoice.value.status),
                                button(busy.value ? 'Checking…' : 'Check payment status', () => refresh(true), { disabled: busy.value || creating.value, 'data-testid': 'crypto-check' })
                            ]),
                            invoice.value.monitoringUntil ? h('p', { class: 'crypto-monitoring' }, `Automatic monitoring ends: ${new Date(invoice.value.monitoringUntil).toLocaleString('en-US')}. Contact the author about payments after that date.`) : null
                        ])
                    ]
                ]),
                notice.value ? h('p', { role: 'status' }, notice.value) : null,
                error.value ? h('p', { role: 'alert', class: 'error-banner' }, error.value) : null
            ]),
            h('div', { class: 'crypto-sidebar' }, [h('aside', { class: 'crypto-plan', 'data-testid': 'crypto-benefits' }, [
                    h('span', { class: 'crypto-eyebrow' }, 'Your membership'),
                    h('h3', invoice.value?.optionLabel || props.option.label || 'Membership'),
                    h('div', { class: 'crypto-price' }, [h('strong', `$${invoice.value ? invoice.value.priceUsd.toFixed(2) : ((props.option.amountMinor ?? props.option.amountCents ?? 0) / 100).toFixed(2)}`), h('span', ` / ${accessPeriodLabel(invoice.value?.period || props.option.periodUnit || props.option.period)}`)]),
                    h('p', { class: 'crypto-plan-intro' }, 'One payment. The whole author archive.'),
                    h('ul', { class: 'crypto-benefits' }, [
                        benefit('Every set, unlocked', 'Browse all sets in this author’s archive during your access period.'),
                        benefit('Site-exclusive sets', 'Discover exclusive sets you won’t find on Patreon.'),
                        benefit('New releases included', 'Enjoy new sets published during your membership.'),
                        benefit('No automatic renewal', 'Pay once for your selected period. Renew whenever you want.')
                    ])
                ]),
                h('section', { class: 'crypto-help', 'data-testid': 'crypto-help', 'aria-labelledby': 'crypto-help-title' }, [
                    h('h3', { id: 'crypto-help-title' }, [h('svg', { class: 'crypto-help-icon', width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'aria-hidden': 'true' }, [h('circle', { cx: 12, cy: 12, r: 9 }), h('path', { d: 'M12 11v5' }), h('circle', { cx: 12, cy: 7.5, r: .8, fill: 'currentColor', stroke: 'none' })]), 'New to crypto?']),
                    h('p', 'Use a crypto app to buy and send your payment. Check that it supports the currency and network selected here.'),
                    h('ul', { class: 'crypto-apps' }, [
                        ['PayPal', 'Explore crypto in your PayPal account.', 'https://www.paypal.com/myaccount/crypto'],
                        ['Cash App', 'Explore Bitcoin in Cash App.', 'https://cash.app/'],
                        ['Venmo', 'Buy and transfer crypto in the Venmo app.', 'https://venmo.com/'],
                        ['Coinbase', 'Explore crypto purchases and transfers.', 'https://www.coinbase.com/'],
                        ['Peer', 'Explore peer-to-peer crypto purchases.', 'https://www.peer.xyz/swap?tab=buy']
                    ].map(([name, description, href]) => h('li', [h('a', { href, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${name} — opens in a new tab` }, [h('div', [h('strong', name), h('span', description)]), h('span', { class: 'crypto-app-visit', 'aria-hidden': 'true' }, 'Visit ↗')])]))),
                    h('p', { class: 'crypto-help-note' }, 'Availability, supported networks and fees vary by app and region. Send only the exact currency and amount on the network shown in your invoice, before the quote expires.')
                ])])
        ]);
    }
});
