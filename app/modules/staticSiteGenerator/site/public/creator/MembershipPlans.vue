<script setup lang="ts">
import {computed} from 'vue';
import {money, accessPeriodLabel} from './api.ts';
import type {MembershipOption} from './types.ts';
const props = defineProps<{polished?: boolean; title: string; options: MembershipOption[]; directReady: boolean; busy: boolean}>();
const selected = defineModel<string>({required: true});
const emit = defineEmits<{continue: []}>();
const selectedTotal = computed(() => {
    const option = props.options.find(option => option.id === selected.value);
    return option ? money(option.amountMinor ?? option.amountCents, option.currency) : '';
});
function saving(option: MembershipOption) {
    const monthly = props.options.find(monthly => monthly.period === 'month' && monthly.currency === option.currency);
    return option.period === 'halfyear' && monthly ? (monthly.amountCents ?? 0) * 6 - (option.amountCents ?? 0) : 0;
}
</script>
<template>
    <span class="crypto-eyebrow">Your membership</span>
    <h2 id="membership-dialog-title">{{ props.polished ? 'Join on this site' : 'Unlock every full set' }}</h2>
    <p class="membership-intro">{{ `Get the entire ${props.title} archive and every new post during your access period.` }}</p>
    <p v-if="props.polished" class="membership-intro">Pay with crypto for access during your selected period.</p>
    <div class="membership-perks"><span>✓ Entire archive</span><span>✓ New posts included</span><span>✓ Full-set links</span></div>
    <fieldset class="membership-plans">
        <legend>Choose your access period</legend>
        <label v-for="option in props.options" :key="option.id" :class="['membership-plan', selected === option.id ? 'is-selected' : '']" :data-testid="`membership-plan-${option.period}`">
            <input v-model="selected" type="radio" name="option" :value="option.id">
            <span class="membership-plan-copy"><strong>{{ accessPeriodLabel(option.period) }}</strong><small>{{ option.period === 'halfyear' ? `${money(Math.round((option.amountCents ?? 0) / 6), option.currency)} / month · paid once` : 'Full archive access' }}</small></span>
            <span class="membership-plan-price">
                <span v-if="props.polished && saving(option) > 0" class="membership-plan-total"><del :aria-label="`Monthly equivalent: ${money((option.amountCents ?? 0) + saving(option), option.currency)}`">{{ money((option.amountCents ?? 0) + saving(option), option.currency) }}</del><strong>{{ money(option.amountMinor ?? option.amountCents, option.currency) }}</strong></span>
                <strong v-else>{{ money(option.amountMinor ?? option.amountCents, option.currency) }}</strong>
                <small v-if="saving(option) > 0" class="membership-saving">{{ `${props.polished ? 'Discount · ' : ''}Save ${money(saving(option), option.currency)}` }}</small>
            </span>
        </label>
    </fieldset>
    <p class="membership-renewal">One-time payment. No automatic renewal.</p>
    <button v-if="props.directReady" type="button" class="primary membership-continue" :disabled="props.busy || !selected" data-testid="direct-crypto-payment" @click="emit('continue')">{{ `Continue to ${props.polished ? 'crypto payment' : 'payment'}${selectedTotal ? ` · ${selectedTotal}` : ''} →` }}</button>
</template>
