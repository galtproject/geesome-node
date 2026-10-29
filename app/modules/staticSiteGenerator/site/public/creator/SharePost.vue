<script setup lang="ts">
import {ref} from 'vue';
import {publicPostShareUrl, shareLink} from './share.ts';
const props = defineProps<{id: string | number; title: string; domain?: string; postUrl: string}>();
const busy = ref(false), status = ref(''), manualUrl = ref('');
async function share() {
    if (busy.value) {
        return;
    }
    busy.value = true;
    status.value = '';
    manualUrl.value = '';
    try {
        const url = publicPostShareUrl(props.id, props.domain, props.postUrl, location.href);
        const result = await shareLink(url, props.title, navigator);
        status.value = result === 'copied' ? 'Link copied' : result === 'shared' ? 'Shared' : result === 'manual' ? 'Copy this post link:' : '';
        if (result === 'manual') {
            manualUrl.value = url;
        }
    } finally {
        busy.value = false;
    }
}
function selectLink(event: Event) { (event.target as HTMLInputElement).select(); }
</script>
<template>
    <div class="post-share">
        <button type="button" class="share-button" data-testid="share-post" :disabled="busy" @click="share">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V3m-4 4 4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>
            Share
        </button>
        <span v-if="status" role="status" class="share-status">{{ status }}</span>
        <input v-if="manualUrl" :value="manualUrl" readonly aria-label="Post link to copy" data-testid="share-link" @focus="selectLink" @click="selectLink">
    </div>
</template>
