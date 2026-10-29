<script setup lang="ts">
import {computed, ref, onMounted} from 'vue';
import {presentationForeground} from '../../presentation.js';
import {money, accessPeriodLabel, safeSiteUrl} from './api.ts';
import {date} from './presentation.ts';
import type {CreatorResource} from './types.ts';
const props = defineProps<{resource: CreatorResource; active: boolean; expired: boolean; activeUntil?: string; busy: boolean}>();
const emit = defineEmits<{join: []}>();
const option = computed(() => [...(props.resource.options || [])].sort((a,b) => (a.amountMinor ?? a.amountCents ?? 0) - (b.amountMinor ?? b.amountCents ?? 0))[0]);
const ready = computed(() => Boolean(option.value) && (props.resource.cryptoMethods === undefined || props.resource.cryptoMethods.some(method => method.available)));
const offer = computed(() => props.resource.presentation?.membership.external);
const externalUrl = computed(() => safeSiteUrl(offer.value?.url));
const ribbon = computed(() => props.resource.presentation?.membership.ribbon || []);
const offerStyle = computed(() => ({background:offer.value?.accent || '#e3e3e3', color:presentationForeground(offer.value?.accent || '#e3e3e3')}));
const icon = ref<HTMLImageElement | null>(null), failed = ref(false);
onMounted(() => {
    if (icon.value?.complete && !icon.value.naturalWidth) {
        failed.value = true;
    }
});
const label = computed(() => {
    if (props.active) {
        return 'My membership';
    }
    if (props.expired) {
        return 'Renew membership';
    }
    return option.value ? `${props.resource.presentation?.copy.join || 'Join here'} · ${money(option.value.amountMinor ?? option.value.amountCents, option.value.currency)} / ${accessPeriodLabel(option.value.periodUnit || option.value.period)}` : props.resource.presentation?.copy.join || 'Join here';
});
</script>
<template>
    <section class="membership-choice" data-testid="membership-choice" aria-label="Membership options">
        <div class="direct-choice">
            <span v-if="!active && ready && ribbon.length" class="membership-ribbon" data-testid="membership-ribbon"><template v-for="(line,index) in ribbon" :key="index"><br v-if="index">{{ line }}</template></span>
            <span class="choice-eyebrow">{{ active ? 'Your membership' : 'Pay with crypto' }}</span>
            <button type="button" class="primary" data-testid="join-membership" :disabled="busy || (!active && !ready)" @click="emit('join')">{{ label }}</button>
            <p v-if="active || !ready" class="choice-note">{{ active ? activeUntil ? `Access until ${date(activeUntil)}` : 'Access is active.' : 'New purchases are currently unavailable.' }}</p>
        </div>
        <template v-if="externalUrl">
            <span class="choice-or">{{ active ? 'Elsewhere' : 'or' }}</span>
            <a class="external-membership-link" data-testid="join-external" :style="offerStyle" :href="externalUrl" target="_blank" rel="noopener noreferrer"><img v-if="offer?.iconUrl && !failed" ref="icon" :src="offer.iconUrl" @error="failed = true" alt="" width="20" height="20"><span>{{ offer?.label }}</span><span aria-hidden="true">↗</span></a>
            
        </template>
    </section>
</template>
