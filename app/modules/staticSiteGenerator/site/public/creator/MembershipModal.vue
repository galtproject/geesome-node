<script setup lang="ts">
const props = defineProps<{name: string; direct: boolean; error: string}>();
const emit = defineEmits<{close: []}>();
</script>
<template>
    <div class="membership-backdrop" @click.self="emit('close')">
        <section :class="['membership-modal', props.name === 'activated' ? 'activation-modal' : props.name === 'gallery' ? 'gallery-modal' : props.direct && props.name === 'checkout' ? 'crypto-modal' : '']" role="dialog" aria-modal="true" aria-labelledby="membership-dialog-title" :aria-describedby="props.name === 'activated' ? 'membership-activation-description' : undefined" :data-testid="`modal-${props.name}`">
            <button type="button" class="modal-close" data-testid="membership-close" aria-label="Close dialog" @click="emit('close')">×</button>
            <slot />
            <p v-if="props.error" role="alert" class="error-banner">{{ props.error }}</p>
        </section>
    </div>
</template>
