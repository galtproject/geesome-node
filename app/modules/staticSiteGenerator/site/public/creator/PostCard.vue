<script setup lang="ts">
import PreviewImage from './PreviewImage.vue';
import {safeSiteUrl} from './api.ts';
import {date} from './presentation.ts';
import type {CreatorPost, PreviewMedia} from './types.ts';
const props = defineProps<{post: CreatorPost; single: boolean; postUrl: string; checked: boolean; expired: boolean}>();
const emit = defineEmits<{gallery: [previews: PreviewMedia[], index: number]; share: [id: string | number]; checkout: []}>();
</script>
<template>
    <article :id="props.single ? 'post-full-content' : undefined" class="member-post" :data-testid="`post-${props.post.id}`">
        <div :class="`preview-grid preview-grid--${Math.min(props.post.previews.length, 3)}`">
            <button v-for="(media, index) in props.post.previews" :key="index" type="button" class="preview-button" :aria-label="`Open preview ${index + 1}`" :data-testid="`preview-${index}`" @click="emit('gallery', props.post.previews, index)">
                <PreviewImage :src="media.url" :alt="media.alt || `${props.post.title} — preview ${index + 1}`" />
            </button>
        </div>
        <div class="post-copy">
            <h2><a :href="props.postUrl">{{ props.post.title }}</a></h2>
            <time :datetime="props.post.publishedAt">{{ date(props.post.publishedAt) }}</time>
            <p class="post-description">{{ props.post.description || '' }}</p>
            <template v-if="props.single">
                <template v-for="(item, index) in props.post.attachments || []" :key="index">
                    <p v-if="item.text !== undefined" class="post-description">{{ item.text }}</p>
                    <video v-else-if="item.mime.startsWith('video/')" controls preload="metadata"><source :src="item.url" :type="item.mime"></video>
                    <a v-else class="attachment-link" :href="item.url" target="_blank" rel="noopener noreferrer">{{ item.name || 'Download file' }}</a>
                </template>
            </template>
            <div class="post-actions">
                <button type="button" data-testid="share-post" @click="emit('share', props.post.id)">Share ↗</button>
                <a v-if="props.post.pageUrl && safeSiteUrl(props.post.pageUrl)" :href="safeSiteUrl(props.post.pageUrl) || undefined" target="_blank" rel="noopener noreferrer" class="primary" data-testid="view-full-set">View full set ↗</a>
                <button v-else type="button" class="primary" :disabled="!props.checked" data-testid="subscribe-post" @click="emit('checkout')">{{ !props.checked ? 'Checking access…' : props.expired ? 'Renew membership' : 'Subscribe to unlock' }}</button>
            </div>
            <small v-if="!props.post.pageUrl">Membership unlocks full-set links across the entire archive.</small>
        </div>
    </article>
</template>
