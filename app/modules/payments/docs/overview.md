# Payments

Direct cryptocurrency engine included in the default module pack, extracted from microwave-girls at
`ec7841f1`. It owns the new `payments_*` invoice/refund/crypto tables. The maintained
wallet/quote/finality/observer/balance-proof/treasury/swap/journal algorithms are
preserved; imports use an isolated `ethers-v6` alias so legacy Ethereum auth stays
on ethers v4. New tables use Sequelize model sync; no source application migration
is run on GeeSome. Address reuse is allowed. Composite wallet/index/nonce
constraints match the source's final automation schema, not its initial schema.

`configureLedger()` binds resource/option models, a resource-locked transaction
callback and `grantPaidInvoice()` from membership. Confirmed settlement and access
credit commit atomically. There is no public arbitrary settle/grant callback or
endpoint. Google login never accepts a reader-selected user or site id.

## Owner defaults and group overrides

One operator seed and the existing shared reader derivation remain unchanged.
Authors configure a public EVM payout address with their existing bearer login:

- `GET /v1/user/payments/payout` returns `{payout, version}`, initially empty/zero.
- `POST /v1/user/payments/payout` accepts `{payout, version}` for the authenticated
  user only. Core group-management and active-key permissions are required.
  Body-supplied user ids are rejected; reader cookies do not authorize this API.

Groups without an explicit payout inherit their configured creator's default.
Existing per-site `crypto_treasuries` addresses stay explicit overrides. The
existing group treasury API can set an override with `{payout,version}` or reset
it with `{inherit:true,version}` (omit payout). Reset retains a versioned row to
prevent stale writes from restoring an old override. Settings expose effective
`payout`, `payoutSource` (`group`, `owner`, or null), `groupPayout`, `ownerDefault`
and the separate group `version`. The owner default's version is inside
`ownerDefault.version`. A creator can use one address for multiple groups or
choose a separate group override. No author seed is requested or stored.

The new private `payments_owner_payouts` table is keyed by core user id.
`payments_payout_addresses` permanently reserves current/historical destinations
so a changed payout can never later be allocated as a buyer deposit address.
Updates and allocation use the same PostgreSQL advisory lock. Service/deposit
addresses and malformed addresses are rejected. The common operator seed must
be configured and match the existing ledger before payout destinations are saved.
These are new model-synced tables; existing financial tables are not altered.

New managed invoices freeze effective destination, owner, source and settings
version in `snapshot.payoutDestination`. A settings edit affects subsequent
invoices. Queue admission copies that snapshot and collection planning/restart
preserves it. Already planned jobs retain their stored payout. Legacy invoices
and unplanned jobs without the snapshot continue using their explicit group
payout; they never acquire an owner default retroactively. Clearing the legacy
group override before reconciling those jobs leaves them pending with
`crypto_payout_required`. The migration rehearsal must reserve historical queued
payout destinations as well as importing the financial journals.

Do not downgrade money workers to versions that ignore inheritance/frozen
invoice destinations. Keep compatible workers and the authoritative ledger when
rolling back the browser/UI. The creator settings screen is part of the pending
client migration; this change provides backend settings APIs and contracts.

The worker flags are independently disabled by default:

- `PAYMENTS_WORKER=1`: bounded receipt/balance observation every five seconds.
- `PAYMENTS_COLLECTION_WORKER=1`: managed EVM treasury loop using its configured interval.

Each loop has its own overlap guard. Stop cancels timers and drains both loops
before the app closes the database. Worker failures emit a sanitized worker name;
invoice and collection records retain durable sanitized recovery errors.
No money loop starts from merely configuring a seed or loading the module.

Supported asset/network catalog and operator defaults are under this module's
`cryptoAssets.ts` and `config/`. Existing `DIRECT_CRYPTO_*` server settings are
preserved, including seed fingerprint/derivation and RPC cache configuration.
Private material belongs only in the server environment. New public APIs never
accept RPC URLs or signing keys. Source documentation for crypto setup/semantics:
`microwave-girls/docs/direct-crypto-payments.md` (some historical provider notes
there are obsolete; direct crypto is the only current provider).

The invoice is a time-limited quote, not automatic renewal. Stablecoins use the
frozen USD tariff; other amounts use integer atomic-unit rounding. Partial/late
payments and network outages retain state. Managed readers reuse their allocated
address across EVM networks; block windows and checkpoints prevent double credit.
Transactions are journaled before broadcast and ambiguous responses reconcile
rather than signing replacements with fresh identities.

Reader API: `/v1/payments/crypto/methods`, POST `/invoices`, GET `/invoices/:id`.
Only a valid cookie for the current site can create/read that reader's invoice.
Owner API under `/v1/payments/admin/:resource`: settings, receiving wallet,
managed treasury, connectivity test, reviews, invoice rescan/late approval. These
use the existing bearer API, core group-management permission and group creator
ownership. Collections remain an operator-enabled server worker.

Refund approval records manual action and sends nothing. Completion is an owner
attestation of an externally sent transaction, not independent transfer
verification; only then does membership revoke the matching period.

Run `npm run test:creator-membership:docker` for isolated real-SQL and fake-chain
coverage; it also runs wallet/observer/adapter regression vectors without live
Google/RPC calls or transfers. Migration/cutover is pending; do not point this
engine at the old ledger or run two signers. See the
[migration plan](../../../../docs/plans/creator-membership-migration.md).
