<script setup lang="ts">
import PreviewImage from './PreviewImage.vue';
import type {PreviewMedia} from './types.ts';
const props = defineProps<{images: PreviewMedia[]}>();
const index = defineModel<number>('index', {required: true});
let touchX = 0;
function step(delta: number) {
    index.value = (index.value + delta + props.images.length) % props.images.length;
}
function touchStart(event: TouchEvent) {
    touchX = event.changedTouches[0].clientX;
}
function touchEnd(event: TouchEvent) {
    const delta = event.changedTouches[0].clientX - touchX;
    if (Math.abs(delta) > 40) {
        step(delta < 0 ? 1 : -1);
    }
}
</script>
<template>
    <h2 id="membership-dialog-title">Preview gallery</h2>
    <div class="gallery-image" @touchstart="touchStart" @touchend="touchEnd"><PreviewImage :key="index" :src="props.images[index]?.url || ''" :alt="`Preview ${index + 1}`" retry /></div>
    <div class="gallery-controls"><button v-if="props.images.length > 1" type="button" @click="step(-1)">← Previous</button><span>{{ index + 1 }} / {{ props.images.length }}</span><button v-if="props.images.length > 1" type="button" @click="step(1)">Next →</button></div>
</template>
