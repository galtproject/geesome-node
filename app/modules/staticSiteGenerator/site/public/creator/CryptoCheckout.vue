<script setup lang="ts">
import {computed} from 'vue';
import {normalizeSitePresentation, type SitePresentation} from '../../presentation.js';
import {useCryptoCheckout, type CheckoutProps} from './useCryptoCheckout.ts';
import {accessPeriodLabel} from './api.ts';
import {cryptoStatusText, paymentAmount} from './crypto.ts';
import PaymentLoading from './PaymentLoading.vue';
import CryptoHelp from './CryptoHelp.vue';
const props = withDefaults(defineProps<CheckoutProps & {presentation?: SitePresentation}>(), {methods: () => [], resume: null});
const emit = defineEmits<{paid: []; back: []}>();
const {invoice, currency, asset, busy, previousQr, creating, error, notice, detailsElement, reservedHeight,
    networks, currencies, remaining, chosen, networkLabel, qr, selectCurrency, selectAsset, refresh, create, copy} = useCryptoCheckout(props, () => emit('paid'));
const amount = computed(() => invoice.value ? paymentAmount(invoice.value.amount, invoice.value.currency) : '');
const verificationWarning = computed(() => ['crypto_balance_outgoing_untracked', 'crypto_balance_regressed', 'crypto_balance_reorg', 'crypto_balance_finality_regressed'].includes(invoice.value?.lastError || '')
    ? 'Payment verification needs an author review. Your invoice and confirmed payments are preserved.'
    : 'Network monitoring is temporarily unavailable. Your invoice and confirmed payments are preserved.');
const price = computed(() => '$' + (invoice.value ? invoice.value.priceUsd.toFixed(2) : ((props.option.amountMinor ?? props.option.amountCents ?? 0) / 100).toFixed(2)));
const period = computed(() => accessPeriodLabel(invoice.value?.period || props.option.periodUnit || props.option.period));
const marketing = computed(() => (props.presentation || normalizeSitePresentation()).membership);
function changeNetwork(event: Event) {
    selectAsset((event.target as HTMLSelectElement).value);
}
</script>
<template>
    <div class="crypto-checkout" data-testid="crypto-checkout">
        <div class="crypto-checkout-header" data-testid="crypto-checkout-header">
            <button type="button" class="crypto-back" data-testid="crypto-back" @click="emit('back')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>Payment methods</button>
            <div v-if="marketing.banner" class="crypto-value-banner" data-testid="crypto-value-banner"><span class="crypto-value-icon" aria-hidden="true">↘</span><div><strong>{{ marketing.banner.title }}</strong><p>{{ marketing.banner.text }}</p></div></div>
        </div>
        <div class="crypto-payment">
            <h3>Pay with cryptocurrency</h3>
            <div v-if="currencies.length" class="crypto-currencies" role="group" aria-label="Currency"><button v-for="value in currencies" :key="value" type="button" :aria-pressed="currency === value" :disabled="creating" :data-testid="`crypto-currency-${value}`" @click="selectCurrency(value)">{{ value }}</button></div>
            <p v-if="invoice && !chosen?.available" class="crypto-network">Network<strong data-testid="crypto-invoice-network">{{ networkLabel }}</strong></p>
            <label v-else-if="networks.length" class="crypto-network">Network<select :value="asset" :disabled="creating" data-testid="crypto-network" @change="changeNetwork"><option v-for="method in networks" :key="method.id" :value="method.id">{{ method.networkLabel }}</option></select></label>
            <div ref="detailsElement" class="crypto-payment-details" :style="reservedHeight ? {minHeight: `${reservedHeight}px`} : undefined" :aria-busy="creating">
                <template v-if="!invoice">
                    <PaymentLoading v-if="creating" :currency="currency" :network="networkLabel" :previous-qr="previousQr" />
                    <div v-else class="crypto-qr-placeholder">
                        <p role="status" :data-testid="chosen?.available ? 'crypto-retry' : 'crypto-unavailable'">{{ chosen?.available ? 'Your payment details could not be loaded.' : currencies.length ? 'This network is currently unavailable. Choose another currency or network.' : 'Payments are currently unavailable. Please try again later.' }}</p>
                        <button v-if="chosen?.available" type="button" class="primary" :disabled="creating" data-testid="crypto-create" @click="create">Retry loading payment details</button>
                    </div>
                </template>
                <template v-else>
                    <div class="crypto-scan"><img class="crypto-qr" :src="qr" :alt="`Receiving address QR for ${invoice.currency} on ${networkLabel}`" data-testid="crypto-qr"><p class="crypto-scan-caption">Scan to pay <strong>{{ `${invoice.currency} on ${networkLabel}` }}</strong></p></div>
                    <div class="crypto-detail"><span class="crypto-detail-title">Exact amount</span><div class="crypto-copy-row"><code data-testid="crypto-amount">{{ `${amount} ${invoice.currency}` }}</code><button type="button" data-testid="crypto-copy-amount" @click="copy(amount)">Copy amount</button></div></div>
                    <div class="crypto-detail"><div class="crypto-detail-title">Receiving address<span class="crypto-network-badge">{{ networkLabel }}</span></div><div class="crypto-copy-row crypto-copy-row--address"><code data-testid="crypto-address">{{ invoice.address }}</code><button type="button" data-testid="crypto-copy-address" @click="copy(invoice.address)">Copy address</button></div></div>
                    <p class="crypto-transfer-note">{{ `Send only ${invoice.currency} on ${networkLabel}. Add wallet fees separately so the exact amount arrives.` }}</p>
                    <p v-if="invoice.lastError" role="status">{{ verificationWarning }}</p>
                    <div class="crypto-progress">
                        <p>{{ `Confirmed received: ${invoice.received} ${invoice.currency}` }}</p>
                        <div v-if="invoice.status === 'underpaid'" class="crypto-detail">Remaining to send<code data-testid="crypto-remaining">{{ `${remaining} ${invoice.currency}` }}</code><button type="button" data-testid="crypto-copy-remaining" @click="copy(remaining)">Copy remaining amount</button></div>
                        <p>{{ `Quote expires: ${new Date(invoice.expiresAt).toLocaleString('en-US')}` }}</p>
                        <div class="crypto-status-control" data-testid="crypto-status-control"><p :class="`crypto-status crypto-status--${invoice.status}`" role="status" aria-live="polite" data-testid="crypto-status">{{ cryptoStatusText[invoice.status] || invoice.status }}</p><button type="button" :disabled="busy || creating" data-testid="crypto-check" @click="refresh(true)">{{ busy ? 'Checking…' : 'Check payment status' }}</button></div>
                    </div>
                </template>
            </div>
            <p v-if="notice" role="status">{{ notice }}</p>
            <p v-if="error" role="alert" class="error-banner">{{ error }}</p>
        </div>
        <div class="crypto-sidebar">
            <aside class="crypto-plan" data-testid="crypto-benefits">
                <span class="crypto-eyebrow">Your membership</span>
                <h3>{{ invoice?.optionLabel || props.option.label || 'Membership' }}</h3>
                <div class="crypto-price"><strong>{{ price }}</strong><span>{{ ` / ${period}` }}</span></div>
                <p class="crypto-plan-intro">One payment. The whole author archive.</p>
                <ul class="crypto-benefits"><li v-for="benefit in marketing.benefits" :key="benefit.title"><span class="crypto-benefit-icon" aria-hidden="true">✓</span><div><strong>{{ benefit.title }}</strong><p>{{ benefit.text }}</p></div></li></ul>
            </aside>
            <CryptoHelp />
        </div>
    </div>
</template>
