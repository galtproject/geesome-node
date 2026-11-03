<script setup lang="ts">
import {onMounted, onBeforeUnmount, ref} from 'vue';
import {date} from './presentation.ts';
const props = defineProps<{expiresAt?: string}>();
const emit = defineEmits<{continue: []}>();
const pieces = ref<{id: number; style: Record<string, string>}[]>([]);
const timers: ReturnType<typeof setTimeout>[] = [];
let preference: MediaQueryList | undefined;
const colors = ['#e7b5f5', '#b98cde', '#8ce2ba', '#f5d793', '#d287df'];
function stop() {
    timers.splice(0).forEach(clearTimeout);
    pieces.value = [];
}
function preferenceChanged() {
    if (preference?.matches) {
        stop();
    }
}
function burst(round: number) {
    for (let side = 0; side < 2; side++) {
        for (let index = 0; index < 14; index++) {
            const id = round * 28 + side * 14 + index, direction = side ? -1 : 1;
            pieces.value.push({id, style: {
                left: side ? '100%' : '0%', background: colors[id % colors.length],
                '--confetti-x': `${direction * (10 + index * 3)}vw`,
                '--confetti-peak': `${-35 - (index * 7 + round * 11) % 40}vh`,
                '--confetti-end': `${direction * (18 + index * 3)}vw`,
                '--confetti-turn': `${direction * (270 + index * 43)}deg`,
                animationDelay: `${index * 9}ms`, borderRadius: index % 3 ? '1px' : '50%',
            }});
        }
    }
}
onMounted(() => {
    preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    preference.addEventListener('change', preferenceChanged);
    if (preference.matches) {
        return;
    }
    burst(0);
    timers.push(setTimeout(() => burst(1), 300), setTimeout(() => burst(2), 650), setTimeout(stop, 2800));
});
onBeforeUnmount(() => {
    stop();
    preference?.removeEventListener('change', preferenceChanged);
});
</script>
<template>
    <div class="activation-confetti" aria-hidden="true" data-testid="activation-confetti"><i v-for="piece in pieces" :key="piece.id" :style="piece.style"></i></div>
    <div class="subscription-activated" data-testid="subscription-activated">
        <div class="activation-check" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="m8 16 5 5 11-11" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" /></svg></div>
        <h2 id="membership-dialog-title">Subscription activated</h2>
        <p id="membership-activation-description">The whole archive is now open to you.</p>
        <p v-if="props.expiresAt" class="activation-until">Access until <time :datetime="props.expiresAt">{{ date(props.expiresAt) }}</time></p>
        <button type="button" class="primary activation-continue" data-testid="activation-continue" @click="emit('continue')">Continue</button>
    </div>
</template>
