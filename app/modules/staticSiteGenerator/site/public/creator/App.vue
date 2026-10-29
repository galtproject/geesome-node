<script setup lang="ts">
import {computed, ref, onBeforeUnmount} from 'vue';
import {normalizeSitePresentation} from '../../presentation.js';
import CreatorLayout from './CreatorLayout.vue';
import PostCard from './PostCard.vue';
import AccountPanel from './AccountPanel.vue';
import SocialLinks from './SocialLinks.vue';
import MembershipChoice from './MembershipChoice.vue';
import PreviewGallery from './PreviewGallery.vue';
import MembershipModal from './MembershipModal.vue';
import MembershipPlans from './MembershipPlans.vue';
import CryptoCheckout from './CryptoCheckout.vue';
import {useMembershipSession} from './useMembershipSession.ts';
import {money, safeSiteUrl, accessPeriodLabel} from './api.ts';
import {date} from './presentation.ts';
import type {PublicState} from './types.ts';
const props = defineProps<{initialState: PublicState}>();
const notification = ref<{message: string; failed: boolean} | null>(null);
let notificationTimer: ReturnType<typeof setTimeout> | undefined;
function notify(value: {message: string; failed: boolean}) {
    clearTimeout(notificationTimer);
    notification.value = value;
    notificationTimer = setTimeout(() => { notification.value = null; }, 10000);
}
onBeforeUnmount(() => { clearTimeout(notificationTimer); });

const {resource, posts, nextOffset, account, checked, busy, error, modal, gallery, imageIndex,
    selectedOption, options, paymentMethod, cryptoMethods, cryptoResume, refundReason, shareStatus,
    resourceId, active, expired, activeUntil, enabled, accountPath, publicPath,
    closeModal, login, loginModal, checkout, logout, more, showGallery, sharePost,
    requestRefund, submitRefund, resumePayment, backToPlans, refreshAccess, openAccount} = useMembershipSession(props.initialState);
const polished = computed(() => Boolean(props.initialState.snapshot.canonicalPath));
const presentation = computed(() => normalizeSitePresentation(resource.value.presentation));
const presentedResource = computed(() => ({...resource.value,presentation:presentation.value}));
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
    <div :class="['membership-site', presentation.layout.profile[0] === 'profile' ? 'site-profile-first' : '', presentation.theme.radius === 'square' ? 'site-square' : '', presentation.theme.density === 'compact' ? 'site-compact' : '', `site-preview-${presentation.theme.previewSize}`, presentation.layout.columns === 'single' ? 'site-single' : '', !enabled ? 'links-only' : '', polished ? 'creator-polished' : '']">
        <CreatorLayout :presentation="presentation" :resource="presentedResource" :polished="polished" :enabled="enabled" :account-path="accountPath">
            <template #brand><a :href="publicPath('/')" class="brand">{{ resource.title || 'Creator' }}</a></template>
            <template #account>
                <template v-if="enabled">
                    <a v-if="account" :href="publicPath('/account/subscription')" data-testid="account-link">My account</a>
                    <button v-else type="button" data-testid="reader-login" @click="loginModal()">Sign in</button>
                </template>
            </template>
            <template #cover>
                <section class="creator-cover" :style="coverStyle"><span class="cover-shade"></span></section>
            </template>
            <template #profile>
                <section class="creator-profile">
                    <img v-if="resource.avatarUrl" class="creator-avatar" :src="resource.avatarUrl" :alt="`${resource.title} avatar`">
                    <div><h1>{{ resource.title }}</h1><p>{{ resource.description }}</p></div>
                    <button v-if="enabled && !polished && presentation.template.id === 'creator'" type="button" class="primary" data-testid="join-membership" @click="join">{{ joinLabel }}</button>
                </section>
            </template>
            <template #membership><MembershipChoice v-if="enabled" :resource="presentedResource" :active="active" :expired="expired" :active-until="activeUntil" :busy="busy" @join="join" /></template>
            <template #social-links><SocialLinks :polished="polished" :resource="presentedResource" /></template>
            <template #posts>
                <AccountPanel v-if="accountPath" :checked="checked" :account="account" :active="active" :active-until="activeUntil" :enabled="enabled" @login="loginModal()" @checkout="checkout" @refund="requestRefund" @resume="resumePayment" @logout="logout" />
                <template v-else>
                    <a v-if="single" :href="publicPath('/')" class="back-link">← All posts</a>
                    <h2 v-else class="feed-heading">{{ navigation?.newer ? presentation.copy.archiveHeading : presentation.copy.feedHeading }}</h2>
                    <PostCard :subscribe-label="presentation.copy.subscribe" :polished="polished" :domain="resource.domain" v-for="post in posts" :key="post.id" :post="post" :single="single" :post-url="publicPath(`/posts/${encodeURIComponent(post.id)}`)" :checked="checked" :expired="expired" @gallery="showGallery" @share="sharePost" @checkout="checkout" @notify="notify" />
                    <section v-if="!posts.length" class="account-panel"><h2>New work is on the way</h2><p>Find the latest updates through the links above.</p></section>
                </template>
            </template>
            <template #status><p v-if="shareStatus" role="status">{{ shareStatus }}</p></template>
            <template #pagination>
                <template v-if="enabled && !accountPath">
                    <nav v-if="navigation && !single" class="creator-pagination" aria-label="Post pages">
                        <a v-if="navigation.newer" :href="navigation.newer" data-testid="newer-posts">← Newer posts</a>
                        <a v-if="navigation.older" :href="navigation.older" class="older-posts" data-testid="older-posts">Older posts →</a>
                    </nav>
                    <button v-else-if="!single && nextOffset !== null" type="button" class="load-more" :disabled="busy" data-testid="load-more" @click="more">{{ busy ? 'Loading…' : 'Load more' }}</button>
                </template>
            </template>
            <template #footer>
                <footer class="member-footer">
                    <template v-for="block in presentation.layout.footer" :key="block">
                        <span v-if="block === 'home' && !initialState.snapshot.canonicalPath">{{ '© ' + resource.title }}</span>
                        <span v-else-if="block === 'home'">© <a :href="publicPath('/')" data-testid="footer-home">{{ resource.title }}</a></span>
                        <span v-if="block === 'powered-by' && initialState.snapshot.canonicalPath">Powered by <a href="https://github.com/galtproject/geesome-node" target="_blank" rel="noopener noreferrer">GeeSome</a></span>
                        <template v-if="block === 'legal-links'">
                            <template v-for="(item, index) in resource.legalLinks || []" :key="index">
                                <a v-if="safeSiteUrl(item.url)" :href="safeSiteUrl(item.url) || undefined" target="_blank" rel="noopener noreferrer">{{ item.label }}</a>
                            </template>
                        </template>
                    </template>
                </footer>
            </template>
            <template #error><div v-if="error && !modal" class="error-banner" role="alert">{{ error }}<button type="button" @click="refreshAccess">Retry</button></div></template>
        </CreatorLayout>
        <MembershipModal v-if="modal" :name="modal" :direct="paymentMethod === 'direct'" :error="error" @close="closeModal">
            <PreviewGallery v-if="modal === 'gallery'" v-model:index="imageIndex" :images="gallery" />
            <template v-else-if="modal === 'login'">
                <h2 id="membership-dialog-title">{{ polished ? 'Sign in to join this site' : 'Sign in or create an account' }}</h2>
                <p>{{ polished ? 'Continue with Google to manage your membership on this site.' : 'Continue with Google to manage your membership.' }}</p>
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
                <CryptoCheckout :presentation="presentation" :resource="resourceId" :option="selected" :methods="cryptoMethods" :resume="cryptoResume" @back="backToPlans" @paid="refreshAccess" />
            </template>
            <MembershipPlans v-else :polished="polished" v-model="selectedOption" :title="resource.title" :options="options" :direct-ready="cryptoMethods.some(method => method.available)" :busy="busy" @continue="paymentMethod = 'direct'" />
        </MembershipModal>
        <Transition name="share-toast">
            <div v-if="notification" class="share-notification" :class="{'share-notification-error':notification.failed}" role="status" aria-live="polite" data-testid="share-notification">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path v-if="notification.failed" d="M12 7v6m0 4h.01"/><path v-else d="m8 12 3 3 5-6"/></svg>
                {{ notification.message }}
            </div>
        </Transition>
    </div>
</template>
