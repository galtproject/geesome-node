<script setup lang="ts">
const apps = [
    ['PayPal', 'Explore crypto in your PayPal account.', 'https://www.paypal.com/myaccount/crypto'],
    ['Cash App', 'Explore Bitcoin in Cash App.', 'https://cash.app/'],
    ['Venmo', 'Buy and transfer crypto in the Venmo app.', 'https://venmo.com/'],
    ['Coinbase', 'Explore crypto purchases and transfers.', 'https://www.coinbase.com/'],
    ['Peer', 'Explore peer-to-peer crypto purchases.', 'https://www.peer.xyz/swap?tab=buy'],
];
</script>
<template>
    <section class="crypto-help" data-testid="crypto-help" aria-labelledby="crypto-help-title">
        <h3 id="crypto-help-title"><svg class="crypto-help-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="7.5" r=".8" fill="currentColor" stroke="none"/></svg>New to crypto?</h3>
        <p>Use a crypto app to buy and send your payment. Check that it supports the currency and network selected here.</p>
        <ul class="crypto-apps">
            <li v-for="[name, description, href] in apps" :key="name"><a :href="href" target="_blank" rel="noopener noreferrer" :aria-label="`${name} — opens in a new tab`"><div><strong>{{ name }}</strong><span>{{ description }}</span></div><span class="crypto-app-visit" aria-hidden="true">Visit ↗</span></a></li>
        </ul>
        <p class="crypto-help-note">Availability, supported networks and fees vary by app and region. Send only the exact currency and amount on the network shown in your invoice, before the quote expires.</p>
    </section>
</template>
