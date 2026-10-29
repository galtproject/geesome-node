<script setup lang="ts">
const groups = [
    {title: 'Buy crypto', id: 'general', apps: [
        ['Coinbase', 'Buy crypto with a card or bank transfer in supported countries.', 'https://www.coinbase.com/'],
        ['MoonPay', 'Buy crypto with a card or supported payment app. Purchase minimums apply.', 'https://www.moonpay.com/buy'],
        ['Ramp Network', 'Buy crypto into your own wallet with a card or bank transfer.', 'https://rampnetwork.com/'],
        ['Peer', 'Peer-to-peer purchases using supported payment apps. Offers vary.', 'https://app.peer.xyz/'],
    ]},
    {title: 'U.S. accounts', id: 'us', apps: [
        ['PayPal', 'External transfers for eligible U.S. crypto accounts. Transfer minimums apply.', 'https://www.paypal.com/myaccount/crypto'],
        ['Cash App', 'Buy Bitcoin and send it to an external wallet.', 'https://cash.app/'],
        ['Venmo', 'Buy and transfer supported crypto with a verified U.S. account.', 'https://venmo.com/'],
    ]},
];
</script>
<template>
    <section class="crypto-help" data-testid="crypto-help" aria-labelledby="crypto-help-title">
        <h3 id="crypto-help-title"><svg class="crypto-help-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="7.5" r=".8" fill="currentColor" stroke="none"/></svg>New to crypto?</h3>
        <p>Buy crypto into your own wallet, then send the exact payment. Check that the app can withdraw the currency on the network selected here.</p>
        <div v-for="group in groups" :key="group.id" :data-testid="`crypto-help-${group.id}`">
            <h4>{{ group.title }}</h4>
            <ul class="crypto-apps">
                <li v-for="[name, description, href] in group.apps" :key="name"><a :href="href" target="_blank" rel="noopener noreferrer" :aria-label="`${name} — opens in a new tab`"><div><strong>{{ name }}</strong><span>{{ description }}</span></div><span class="crypto-app-visit" aria-hidden="true">Visit ↗</span></a></li>
            </ul>
        </div>
        <p class="crypto-help-note">Countries, currencies and networks vary. Purchase minimums may exceed this payment; fees and withdrawal delays can apply. Send only the exact currency and amount on the network shown in your invoice, before the quote expires.</p>
    </section>
</template>
