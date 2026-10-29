<script setup lang="ts">
import {computed, ref, onMounted} from 'vue';
import {money, accessPeriodLabel, safeSiteUrl} from './api.ts';
import {date} from './presentation.ts';
import type {CreatorResource} from './types.ts';
const props = defineProps<{resource: CreatorResource; active: boolean; expired: boolean; activeUntil?: string; busy: boolean}>();
const emit = defineEmits<{join: []}>();
const option = computed(() => [...(props.resource.options || [])].sort((a,b) => (a.amountMinor ?? a.amountCents ?? 0) - (b.amountMinor ?? b.amountCents ?? 0))[0]);
const ready = computed(() => Boolean(option.value) && (props.resource.cryptoMethods === undefined || props.resource.cryptoMethods.some(method => method.available)));
const patreonLink = computed(() => props.resource.links?.find(link => /patreon/i.test(link.label)));
const patreon = computed(() => safeSiteUrl(props.resource.patreonUrl || patreonLink.value?.url));
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
    return option.value ? `Join here · ${money(option.value.amountMinor ?? option.value.amountCents, option.value.currency)} / ${accessPeriodLabel(option.value.periodUnit || option.value.period)}` : 'Join here';
});
</script>
<template>
    <section class="membership-choice" data-testid="membership-choice" aria-label="Membership options">
        <div class="direct-choice">
            <span v-if="!active && ready && patreon" class="membership-ribbon" data-testid="membership-ribbon">Extra content<br>Lower price</span>
            <span class="choice-eyebrow">{{ active ? 'Your membership' : 'Pay with crypto' }}</span>
            <button type="button" class="primary" data-testid="join-membership" :disabled="busy || (!active && !ready)" @click="emit('join')">{{ label }}</button>
            <p v-if="active || !ready" class="choice-note">{{ active ? activeUntil ? `Access until ${date(activeUntil)}` : 'Access is active.' : 'New purchases are currently unavailable.' }}</p>
        </div>
        <template v-if="patreon">
            <span class="choice-or">{{ active ? 'Also on Patreon' : 'or' }}</span>
            <a class="patreon-link" data-testid="join-patreon" :href="patreon" target="_blank" rel="noopener noreferrer"><img v-if="patreonLink?.iconUrl && !failed" ref="icon" :src="patreonLink.iconUrl" @error="failed = true" alt="" width="20" height="20"><span>Join on Patreon</span><span aria-hidden="true">↗</span></a>
            
        </template>
    </section>
</template>
