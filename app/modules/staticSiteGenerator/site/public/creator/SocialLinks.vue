<script setup lang="ts">
import {computed, ref} from 'vue';
import {safeSiteUrl} from './api.ts';
import type {CreatorResource} from './types.ts';
const props = defineProps<{resource: CreatorResource}>();
const expanded = ref(false);
const links = computed(() => props.resource.links || []);
const compactLinks = computed(() => links.value.filter(link => !/patreon/i.test(link.label)));
const patreon = computed(() => safeSiteUrl(props.resource.patreonUrl || links.value.find(link => /patreon/i.test(link.label))?.url) || undefined);
</script>
<template>
    <aside class="support-card" data-testid="social-links">
        <h2>Find me elsewhere</h2>
        <a v-if="patreon" :href="patreon" target="_blank" rel="noopener noreferrer" class="patreon-link">Support on Patreon ↗</a>
        <div v-if="!expanded" class="social-icons">
            <template v-for="(item, index) in compactLinks" :key="index">
                <a v-if="safeSiteUrl(item.url)" :href="safeSiteUrl(item.url) || undefined" target="_blank" rel="noopener noreferrer" :aria-label="item.label" :title="item.label"><img v-if="item.iconUrl" :src="item.iconUrl" alt="" width="20" height="20"><template v-else>{{ item.label.slice(0, 2).toUpperCase() }}</template></a>
            </template>
        </div>
        <ul v-if="expanded" class="full-links">
            <li v-for="(item, index) in links" :key="index"><a v-if="safeSiteUrl(item.url)" :href="safeSiteUrl(item.url) || undefined" target="_blank" rel="noopener noreferrer"><img v-if="item.iconUrl" :src="item.iconUrl" alt="" width="20" height="20">{{ `${item.label} ↗` }}</a></li>
        </ul>
        <button type="button" :aria-expanded="expanded" data-testid="expand-links" @click="expanded = !expanded">{{ expanded ? 'Hide links' : 'Show links' }}</button>
    </aside>
</template>
