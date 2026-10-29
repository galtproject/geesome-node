<script setup lang="ts">
import {computed, ref, onMounted} from 'vue';
import {safeSiteUrl} from './api.ts';
import type {CreatorResource} from './types.ts';
const props = defineProps<{resource: CreatorResource; polished?: boolean}>();
const failedIcons = ref(new Set<string>());
function iconFailed(url: string) { failedIcons.value = new Set([...failedIcons.value, url]); }
const images = ref<HTMLImageElement[]>([]);
onMounted(() => {
    // A cached/SSR image can fail before hydration attaches the error listener.
    for (const image of images.value) {
        if (image?.complete && !image.naturalWidth) {
            iconFailed(image.getAttribute('src') || '');
        }
    }
});
const expanded = ref(false);
const links = computed(() => props.resource.links || []);
const compactLinks = computed(() => links.value.filter(link => !/patreon/i.test(link.label)));
const patreon = computed(() => safeSiteUrl(props.resource.patreonUrl || links.value.find(link => /patreon/i.test(link.label))?.url) || undefined);
</script>
<template>
    <aside v-if="!props.polished || compactLinks.length || (!resource.postsEnabled && patreon)" class="support-card" data-testid="social-links">
        <h2>Find me elsewhere</h2>
        <a v-if="(!props.polished || !resource.postsEnabled) && patreon" :href="patreon" target="_blank" rel="noopener noreferrer" class="patreon-link"><span>Support on Patreon</span> <span aria-hidden="true">↗</span></a>
        <div v-if="props.polished || !expanded" class="social-icons">
            <template v-for="(item, index) in compactLinks" :key="index">
                <a v-if="safeSiteUrl(item.url)" :href="safeSiteUrl(item.url) || undefined" target="_blank" rel="noopener noreferrer" :aria-label="item.label" :title="item.label"><img v-if="item.iconUrl && !failedIcons.has(item.iconUrl)" ref="images" :src="item.iconUrl" @error="iconFailed(item.iconUrl)" alt="" width="20" height="20"><span v-else class="social-fallback" aria-hidden="true">{{ props.polished ? '↗' : item.label.slice(0, 2).toUpperCase() }}</span><span v-if="props.polished" class="social-label">{{ item.label }}</span></a>
            </template>
        </div>
        <ul v-if="!props.polished && expanded" class="full-links">
            <li v-for="(item, index) in links" :key="index"><a v-if="safeSiteUrl(item.url)" :href="safeSiteUrl(item.url) || undefined" target="_blank" rel="noopener noreferrer"><img v-if="item.iconUrl && !failedIcons.has(item.iconUrl)" ref="images" :src="item.iconUrl" @error="iconFailed(item.iconUrl)" alt="" width="20" height="20">{{ `${item.label} ↗` }}</a></li>
        </ul>
        <button v-if="!props.polished" type="button" :aria-expanded="expanded" data-testid="expand-links" @click="expanded = !expanded">{{ expanded ? 'Hide links' : 'Show links' }}</button>
    </aside>
</template>
