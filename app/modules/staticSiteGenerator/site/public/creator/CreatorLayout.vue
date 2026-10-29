<script setup lang="ts">
import HtmlShell from './HtmlShell.ts';
import type {SitePresentation} from '../../presentation.js';
import type {CreatorResource} from './types.ts';
defineProps<{presentation:SitePresentation; resource:CreatorResource; polished:boolean; enabled:boolean; accountPath:boolean}>();
</script>
<template>
    <HtmlShell v-if="presentation.template.id === 'html-shell'" :html="presentation.template.html" :site="resource">
        <template v-for="name in ['brand','account','cover','profile','membership','social-links','pagination','footer']" :key="name" #[name]><slot :name="name" /></template>
        <template #posts><div v-if="enabled || accountPath" class="member-feed"><slot name="posts" /><slot name="status" /></div></template>
    </HtmlShell>
    <template v-else>
        <header class="member-nav"><template v-for="block in presentation.layout.header" :key="block"><slot :name="block" /></template></header>
        <template v-for="block in presentation.layout.profile" :key="block"><slot :name="block" /></template>
        <slot name="error" />
        <main class="member-layout">
            <aside v-if="polished" class="creator-sidebar"><template v-for="block in presentation.layout.sidebar" :key="block"><slot :name="block" /></template></aside>
            <slot v-else name="social-links" />
            <div v-if="enabled || accountPath" class="member-feed">
                <template v-if="accountPath"><slot name="posts" /></template>
                <template v-else><template v-for="block in presentation.layout.main" :key="block"><slot :name="block === 'post-feed' ? 'posts' : block" /></template></template>
                <slot name="status" />
            </div>
        </main>
        <slot name="footer" />
    </template>
    <template v-if="presentation.template.id === 'html-shell'"><slot name="error" /></template>
</template>
