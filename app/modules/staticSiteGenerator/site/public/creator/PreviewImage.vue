<script setup lang="ts">
import {ref, onMounted} from 'vue';
const props = withDefaults(defineProps<{src: string; alt: string; retry?: boolean}>(), {retry: false});
const status = ref('loading'), attempt = ref(0), image = ref<HTMLImageElement | null>(null);
onMounted(() => {
    if (image.value?.complete) {
        status.value = image.value.naturalWidth > 0 ? 'loaded' : 'error';
    }
});
function retryImage() {
    status.value = 'loading';
    attempt.value++;
}
</script>
<template>
    <div :class="['preview-image-state', `image-${status}`]">
        <img ref="image" :key="attempt" :src="props.src + (attempt ? (props.src.includes('?') ? '&' : '?') + `previewRetry=${attempt}` : '')" :alt="props.alt" loading="lazy" @load="status = 'loaded'" @error="status = 'error'">
        <span v-if="status === 'loading'" class="image-status" role="status">Loading preview…</span>
        <div v-if="status === 'error'" class="image-status" role="status">Preview could not load.<button v-if="props.retry" type="button" data-testid="retry-preview" @click="retryImage">Retry image</button></div>
    </div>
</template>
