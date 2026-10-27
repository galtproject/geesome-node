<script setup lang="ts">
import {computed} from 'vue';
import {money} from './api.ts';
import {date} from './presentation.ts';
import type {MembershipAccount, MembershipInvoice} from './types.ts';
const props = defineProps<{checked: boolean; account: MembershipAccount | null; active: boolean; activeUntil?: string; enabled: boolean}>();
const emit = defineEmits<{login: []; checkout: []; refund: [payment: MembershipInvoice]; resume: [payment: MembershipInvoice]; logout: []}>();
const payments = computed(() => (props.account?.invoices || []).filter(payment => payment.status !== 'expired'));
function refunds(payment: MembershipInvoice) {
    return (props.account?.refunds || []).filter(refund => refund.invoiceId === payment.id);
}
</script>
<template>
    <p v-if="!props.checked">Checking your account…</p>
    <section v-else-if="!props.account" class="account-panel">
        <h2>Your membership</h2>
        <p>Sign in to view your subscription and payment history.</p>
        <button v-if="props.enabled" type="button" class="primary" @click="emit('login')">Continue with Google</button>
        <p v-else>Sign-in is currently unavailable. Existing signed-in members can still view their payment history here.</p>
    </section>
    <section v-else class="account-panel" data-testid="reader-account">
        <h2>Your membership</h2>
        <p>{{ props.active ? `Active · Access until ${date(props.activeUntil)}` : 'No active membership' }}</p>
        <button v-if="props.enabled" type="button" class="primary" @click="emit('checkout')">{{ props.active ? 'Extend membership' : 'Renew membership' }}</button>
        <p v-else>New purchases are currently unavailable.</p>
        <p>Access includes the entire archive. One-time payments do not renew automatically.</p>
        <h3>Payment history</h3>
        <div v-for="payment in payments" :key="payment.id" class="payment-row">
            <div><strong>{{ money(payment.amountMinor || payment.optionSnapshot?.amountCents || payment.priceMinor || 0, payment.currency) }}</strong><p>{{ date(payment.createdAt) }} · {{ payment.status }}</p></div>
            <button v-if="props.active && ['confirmed', 'paid'].includes(payment.status) && !refunds(payment).length" type="button" :data-testid="`refund-${payment.id}`" @click="emit('refund', payment)">Request refund</button>
            <span v-for="(refund, index) in refunds(payment)" :key="index">Refund: {{ refund.status }}</span>
            <button v-if="payment.provider === 'direct'" type="button" :data-testid="`crypto-resume-${payment.id}`" @click="emit('resume', payment)">View crypto payment</button>
        </div>
        <h3>Account</h3>
        <p>{{ props.account.reader?.name || props.account.reader?.email || 'Google account' }}</p>
        <button type="button" data-testid="reader-logout" @click="emit('logout')">Sign out</button>
    </section>
</template>
