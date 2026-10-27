<script setup lang="ts">
const props = defineProps<{currency: string; network: string; previousQr: string}>();
</script>
<template>
    <div class="crypto-loading-payment" role="status" data-testid="crypto-loading">
        <span class="crypto-sr-only">Loading payment details</span>
        <div aria-hidden="true">
            <div class="crypto-scan">
                <div class="crypto-qr-loading"><img v-if="props.previousQr" class="crypto-qr crypto-qr--muted" :src="props.previousQr" alt=""><div v-else class="crypto-qr crypto-qr--muted"></div><span class="crypto-qr-spinner" aria-hidden="true"></span></div>
                <p class="crypto-scan-caption crypto-loading-spacer-text">{{ `Scan to pay ${props.currency} on ${props.network}` }}</p>
            </div>
            <div v-for="label in ['Exact amount', 'Receiving address']" :key="label" class="crypto-detail">
                <div class="crypto-detail-title">{{ label }}<span v-if="label === 'Receiving address'" class="crypto-network-badge crypto-loading-spacer-text">{{ props.network }}</span></div>
                <div class="crypto-copy-row"><span class="crypto-loading-spacer-value"></span><span class="crypto-loading-spacer-copy"></span></div>
            </div>
            <p class="crypto-transfer-note crypto-loading-spacer-text">{{ `Send only ${props.currency} on ${props.network}. Add wallet fees separately so the exact amount arrives.` }}</p>
            <div class="crypto-progress">
                <p class="crypto-loading-spacer-text">{{ `Confirmed received: 0 ${props.currency}` }}</p>
                <p class="crypto-loading-spacer-text">Quote expires: 10/17/2026, 12:00:00 AM</p>
                <div class="crypto-status-control"><p class="crypto-status crypto-loading-spacer-text">Waiting for payment</p><span class="crypto-loading-spacer-check"></span></div>
                <p class="crypto-monitoring crypto-loading-spacer-text">Automatic monitoring ends: 10/24/2026, 12:00:00 AM. Contact the author about payments after that date.</p>
            </div>
        </div>
    </div>
</template>
