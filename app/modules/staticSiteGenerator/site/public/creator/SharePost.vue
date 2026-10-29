<script setup lang="ts">
import {ref, onBeforeUnmount} from 'vue';
import {publicPostShareUrl, copyPostLink} from './share.ts';
const props = defineProps<{id: string | number; domain?: string; postUrl: string}>();
const emit = defineEmits<{notify: [value: {message: string; failed: boolean}]}>();
const busy = ref(false);
let active = true;
onBeforeUnmount(() => { active = false; });
async function share() {
    if (busy.value) {
        return;
    }
    busy.value = true;
    try {
        const url = publicPostShareUrl(props.id, props.domain, props.postUrl, location.href);
        const copied = await copyPostLink(url, navigator);
        if (active) {
            emit('notify', {message: copied ? 'Copied to clipboard' : 'Could not copy the link. Please try again.', failed: !copied});
        }
    } finally {
        busy.value = false;
    }
}
</script>
<template>
    <div class="post-share">
        <button type="button" class="share-button" data-testid="share-post" :disabled="busy" @click="share">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V3m-4 4 4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>
            Share
        </button>
    </div>
</template>
