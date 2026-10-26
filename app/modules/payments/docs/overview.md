# Payments

Optional direct cryptocurrency engine extracted from microwave-girls at
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
