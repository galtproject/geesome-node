<script setup lang="ts">
import {computed} from 'vue';
import PostCard from './PostCard.vue';
import AccountPanel from './AccountPanel.vue';
import SocialLinks from './SocialLinks.vue';
import PreviewGallery from './PreviewGallery.vue';
import MembershipModal from './MembershipModal.vue';
import MembershipPlans from './MembershipPlans.vue';
import CryptoCheckout from './CryptoCheckout.vue';
import {useMembershipSession} from './useMembershipSession.ts';
import {money, safeSiteUrl, accessPeriodLabel} from './api.ts';
import {date} from './presentation.ts';
import type {PublicState} from './types.ts';
const props = defineProps<{initialState: PublicState}>();
const {resource, posts, nextOffset, account, checked, busy, error, modal, gallery, imageIndex,
    selectedOption, options, paymentMethod, cryptoMethods, cryptoResume, refundReason, shareStatus,
    resourceId, active, expired, activeUntil, enabled, accountPath, publicPath,
    closeModal, login, loginModal, checkout, logout, more, showGallery, sharePost,
    requestRefund, submitRefund, resumePayment, backToPlans, refreshAccess, openAccount} = useMembershipSession(props.initialState);
const navigation = computed(() => props.initialState.snapshot.navigation);
const single = computed(() => props.initialState.path.startsWith('/posts/'));
const selected = computed(() => options.value.find(option => option.id === selectedOption.value) || options.value[0] || {});
const joinLabel = computed(() => {
    if (active.value) {
        return `Active until ${date(activeUntil.value)}`;
    }
    if (expired.value) {
        return 'Renew membership';
    }
    const option = [...(resource.value.options || [])].sort((a, b) => (a.amountCents ?? 0) - (b.amountCents ?? 0))[0];
    return option ? `Join · ${money(option.amountCents, option.currency)} / ${accessPeriodLabel(option.period)}` : 'Join membership';
});
const coverStyle = computed(() => resource.value.coverUrl ? {backgroundImage: `url(${JSON.stringify(resource.value.coverUrl)})`} : {});
function join() {
    return active.value ? openAccount() : checkout();
}
</script>
<template>
    <div :class="['membership-site', resourceId === 'meat' ? 'theme-meat' : 'theme-wave', !enabled ? 'links-only' : '']">
        <header class="member-nav">
            <a :href="publicPath('/')" class="brand">{{ resource.title || 'Era Of Wave' }}</a>
            <template v-if="enabled"><a v-if="account" :href="publicPath('/account/subscription')" data-testid="account-link">My account</a><button v-else type="button" data-testid="reader-login" @click="loginModal()">Sign in</button></template>
        </header>
        <section class="creator-cover" :style="coverStyle"><span class="cover-shade"></span></section>
        <section class="creator-profile">
            <img v-if="resource.avatarUrl" class="creator-avatar" :src="resource.avatarUrl" :alt="`${resource.title} avatar`">
            <div><h1>{{ resource.title }}</h1><p>{{ resource.description }}</p></div>
            <button v-if="enabled" type="button" class="primary" data-testid="join-membership" @click="join">{{ joinLabel }}</button>
        </section>
        <div v-if="error && !modal" class="error-banner" role="alert">{{ error }}<button type="button" @click="refreshAccess">Retry</button></div>
        <main class="member-layout">
            <SocialLinks :resource="resource" />
            <div v-if="enabled || accountPath" class="member-feed">
                <AccountPanel v-if="accountPath" :checked="checked" :account="account" :active="active" :active-until="activeUntil" :enabled="enabled" @login="loginModal()" @checkout="checkout" @refund="requestRefund" @resume="resumePayment" @logout="logout" />
                <template v-else>
                    <a v-if="single" :href="publicPath('/')" class="back-link">← All posts</a>
                    <h2 v-else class="feed-heading">{{ navigation?.newer ? 'Archive' : 'Latest posts' }}</h2>
                    <PostCard v-for="post in posts" :key="post.id" :post="post" :single="single" :post-url="publicPath(`/posts/${encodeURIComponent(post.id)}`)" :checked="checked" :expired="expired" @gallery="showGallery" @share="sharePost" @checkout="checkout" />
                    <section v-if="!posts.length" class="account-panel"><h2>New work is on the way</h2><p>Find the latest updates through the links above.</p></section>
                    <nav v-if="navigation && !single" class="creator-pagination" aria-label="Post pages">
                        <a v-if="navigation.newer" :href="navigation.newer" data-testid="newer-posts">← Newer posts</a>
                        <a v-if="navigation.newer" :href="navigation.home" data-testid="latest-posts">Latest publications</a>
                        <a v-if="navigation.older" :href="navigation.older" data-testid="older-posts">Older posts →</a>
                    </nav>
                    <button v-else-if="!single && nextOffset !== null" type="button" class="load-more" :disabled="busy" data-testid="load-more" @click="more">{{ busy ? 'Loading…' : 'Load more' }}</button>
                </template>
                <p v-if="shareStatus" role="status">{{ shareStatus }}</p>
            </div>
        </main>
        <footer class="member-footer"><span>{{ '© ' + resource.title }}</span><template v-for="(item, index) in resource.legalLinks || []" :key="index"><a v-if="safeSiteUrl(item.url)" :href="safeSiteUrl(item.url) || undefined" target="_blank" rel="noopener noreferrer">{{ item.label }}</a></template></footer>
        <MembershipModal v-if="modal" :name="modal" :direct="paymentMethod === 'direct'" :error="error" @close="closeModal">
            <PreviewGallery v-if="modal === 'gallery'" v-model:index="imageIndex" :images="gallery" />
            <template v-else-if="modal === 'login'">
                <h2 id="membership-dialog-title">Sign in or create an account</h2>
                <p>Continue with Google to manage your membership.</p>
                <div id="membership-google"></div>
                <button v-if="resource.e2eMockAuth" type="button" :disabled="busy" data-testid="google-mock-login" @click="login('e2e-reader')">Continue with Google</button>
            </template>
            <template v-else-if="modal === 'refund'">
                <h2 id="membership-dialog-title">Request a refund</h2>
                <p>Submitting a request does not cancel your access. The author will review it.</p>
                <label>Reason<textarea v-model="refundReason" maxlength="2000" data-testid="refund-reason"></textarea></label>
                <button type="button" class="primary" :disabled="busy || !refundReason.trim()" data-testid="submit-refund" @click="submitRefund">Submit request</button>
            </template>
            <template v-else-if="paymentMethod === 'direct'">
                <h2 id="membership-dialog-title">Direct crypto payment</h2>
                <CryptoCheckout :resource="resourceId" :option="selected" :methods="cryptoMethods" :resume="cryptoResume" @back="backToPlans" @paid="refreshAccess" />
            </template>
            <MembershipPlans v-else v-model="selectedOption" :title="resource.title" :options="options" :direct-ready="cryptoMethods.some(method => method.available)" :busy="busy" @continue="paymentMethod = 'direct'" />
        </MembershipModal>
    </div>
</template>
