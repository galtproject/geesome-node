# Crypto purchase help and weekly quotes

## Contents
- [Policy](#policy)
- [Regional audit](#regional-audit)
- [Verification](#verification)

## Policy

Tracking #1483. New quotes retain their atomic crypto amount/rate snapshot for
seven days, including volatile assets. Existing stored amounts and deadlines are
not rewritten. The bounded observer/review window is fourteen days from creation
so a transfer made before the weekly deadline can confirm afterwards. Existing
late-payment review and idempotent crediting remain in force. No migration is
needed; the monitoring deadline remains in the API but is omitted from checkout
and its loading placeholder. Updated help/templates need a snapshot rebuild.

## Regional audit

Official sources reviewed 2026-10-29 by an independent audit. These are links for
users to buy into their own account/wallet and then send a supported asset/network;
they are not a merchant integration or a promise that any invoice can be purchased
for its exact fiat value. No checkout address is prefilled into a third-party site.

- PayPal belongs under **U.S. accounts** for external crypto transfers. PayPal is
  not globally U.S.-only: [UK crypto terms](https://www.paypal.com/uk/legalhub/paypal/cryptocurrencies-tnc)
  allow buying/holding but forbid external transfers. [U.S. transfers/minimums](https://www.paypal.com/us/cshelp/article/how-do-i-transfer-my-crypto-help822)
  are asset-specific and can exceed a small subscription; PYUSD is not USDC/USDT.
- [Cash App terms](https://cash.app/us/en/legal/tos) require U.S. crypto eligibility;
  some funding-related withdrawal holds last longer than the quote.
- [Venmo requirements](https://help.venmo.com/cs/articles/requirements-vhel170)
  and [crypto transfers](https://help.venmo.com/cs/articles/crypto-transfers-vhel232)
  require U.S. eligibility and verification.
- Coinbase belongs in the general list, with [regional funding methods](https://help.coinbase.com/en-gb/coinbase/getting-started/add-a-payment-method/add-and-verify-pm-emea)
  and [withdrawal holds](https://help.coinbase.com/en-gb/coinbase/trading-and-funding/sending-or-receiving-cryptocurrency/available-balance-faq).
  [MiCA restrictions](https://help.coinbase.com/en/coinbase/other-topics/other/mica-restricted-stablecoins)
  mean EEA users cannot assume USDT support.
- [MoonPay buying guide](https://support.moonpay.com/en/articles/380500-how-do-i-buy-cryptocurrency-with-moonpay)
  describes card/payment methods and purchase minimums (normally EUR20 equivalent,
  subject to asset/network). [Country exclusions](https://support.moonpay.com/en/articles/380968-moonpay-s-unsupported-countries)
  apply; buying a $4 invoice directly is not guaranteed.
- [Ramp buying flow](https://support.rampnetwork.com/en/articles/18887-buy-crypto-through-ramp-network)
  uses the user's own wallet; [availability](https://support.rampnetwork.com/en/articles/876333-where-can-i-use-ramp-network)
  and [fees](https://support.rampnetwork.com/en/articles/12634-fees-and-exchange-rates-when-buying-crypto)
  vary. It is an additional card/bank option, not an integrated payment method.
- Peer is the P2P service at app.peer.xyz. Its [buyer guide](https://docs.peer.xyz/guides/for-buyers/complete-guide-to-onboarding)
  includes European and U.S. payment rails; [offer sizes](https://docs.peer.xyz/guides/for-buyers/tiers)
  and availability vary by seller. The old /swap URL is replaced by the current app.

## Verification

SQL coverage exercises the weekly deadline, pending state on day six, an on-time
receipt confirmed after day seven, and exactly-once entitlement. Existing managed
balance/settlement cases explicitly retain pre-upgrade thirty-minute quotes to
verify that their saved deadlines remain meaningful. Browser coverage checks
regional list order and removal of the monitoring explanation/loading spacer.

Verification completed: creator membership/SQL/Kubo suite and all 57 payment
cases passed via `npm run test:creator-membership:docker`; creator Vue types,
apiDoc generation and unchanged security route inventory passed. The browser
flow verified 78 desktop/narrow captures, including grouped buying help; narrow
help and desktop checkout screenshots were visually reviewed. No production
server update, invoice mutation or live transfer was performed.
