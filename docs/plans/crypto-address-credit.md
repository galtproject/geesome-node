# Reusable managed-address credit

Tracking: #1530 / PR #1531. This extends the initial excess-payment implementation.

## Contents

- [Source of truth](#source-of-truth)
- [Architecture](#architecture)
- [Workstreams](#workstreams)
- [Verification](#verification)
- [Upgrade and rollback](#upgrade-and-rollback)

## Source of truth

The user approved: observe deposits independently of invoice state; retain unused
confirmed deposits; when the reader reopens checkout, apply them to a fresh quote;
show partial remainder, grant the affordable longer duration and proportional excess;
never reuse deposits already credited. Specifically cover deposits after paid and
after expiry, including multiple transactions finalizing across settlement.

Existing generated EVM addresses are the target. Legacy external/pool/BTC/TRON
invoices keep their receipt-verification and owner late-review contracts.
No production DB edits, transfers, deployment or signer replacement are authorized.

## Architecture

Introduce model-synced accounts keyed by address/asset, append-only observation
records and unique invoice-consumption records. Observe lifetime gross external
receipts from the first known invoice block using the existing canonical balance
observer and own-transaction journal corrections. Persist cumulative confirmed and
consumed atomic values; available = confirmed minus consumed, never wallet balance.
The fixed observation horizon is independent of quote expiry. Proof checkpoints,
observation increments, consumption, invoice and subscription commit atomically.

A paid invoice freezes its consumed/collection amount. Later deposits remain in the
account; a new invoice consumes the unused delta and gets its own immutable treasury
job, without modifying an older signed job. A fresh quote applies current pricing
and payout settings. Expired quotes cannot automatically consume funds; reopening
creates a fresh quote. Current-quote receipts mined on time may confirm afterward.
Historical paid/refunded amounts initialize consumed credit once, under the same
resource/receipt locks. Historical ambiguity or gross-receipt regression fails closed.
New and old workers must not run concurrently through this accounting cutover.

## Workstreams

1. Account ledger/models/observer: owns new payments helper/models only; persists
   canonical proofs and exact-once consumptions. Requires real SQL/fake-chain tests.
2. Integration and treasury: routes managed balances through the account, freezes
   settlement amounts and reconciles on checkout; preserves legacy engines. Depends
   on account helper; verifies restart, expiry, collection and concurrent checkout.
3. Generated checkout: recognizes carried credit, reloads expired quotes, shows the
   unused balance and paid receipt. Depends on DTO integration; desktop/narrow QA.
4. Independent read-only review: final accounting invariants and edge cases; no
   edits/push. Root integrates, validates and owns final commit/PR handoff.

## Verification

Disposable SQL and actual canonical balance observer/RPC fakes: paid→deposit→new
quote, expiry→deposit→new quote, partial→topup, staggered finality, repeated opens,
restart, multiple resources/assets/readers, legacy baseline, collection before and
after topup, unknown nonce/reorg and rescan/new quote races. Real HTTP and generated
browser controls verify fresh-quote creation, applied balance and access refresh.
Record final evidence and review findings here. Never use a paid status SQL edit as
a settlement test.

## Upgrade and rollback

New tables use the normal model-sync flow, without destructive migrations. Preserve
existing invoices, paid periods, seeds and signed collection jobs. Stop old money
workers before upgrade. Old money workers cannot safely run after account credits
have been consumed; rollback UI only or fix forward with the authoritative ledger.

## Implementation and review evidence

The independent review found an old-scan/bootstrap race; the legacy settlement
path now rechecks account ownership under the receipt lock before granting access.
A paused-RPC SQL regression proves that the same funds cannot be credited by both
paths. Malformed historical accounts now back off individually for an hour and do
not stop healthy address observation. Other review passes found no new blockers.

Active quotes scan every 15 seconds; expired/inactive addresses scan hourly and
retain deposits beyond the former 14-day invoice window. Interactive reconciliation
uses an atomic SQL condition for 15-second spacing; provider errors retain a
30-second backoff. New checkout verifies immediately. Replaced expired quotes are
excluded from owner review actions; an old quote cannot consume the balance after
a newer quote takes over. Account projections are scoped to both reader and site.

Follow-up UI requirements: no visible quote-expiry date, no manual Apply control.
Retained credit automatically obtains a fresh quote; a paid reusable checkout keeps
polling for later funds, while successful access refresh is announced once per
invoice. The policy is “You can pay in parts. Extra funds add subscription days.”
The remainder uses the same bordered amount/copy row as the quoted amount. A
partial balance below the chosen plan's minimum still shows the remaining amount.
Server-side seven-day quote expiry remains a pricing boundary; reopening obtains
current pricing without discarding funds.

Delivery verification: real HTTP/SQL and canonical fake-RPC scenarios pass, including
paid→deposit→reopen, expired→late deposit→fresh quote, staggered finality, exactly-once
consumption, asset/resource/reader isolation, collection after topup, swept-fund
correction, historical paid baseline, old scan/bootstrap races and bounded retries.
Final focused checks: 13 checkout-controller tests pass; nine new address-credit
SQL/canonical-RPC cases pass. Creator Vue type checking, API-doc generation,
security route inventory and whitespace checks pass. The focused Docker browser
path passes with 26 mapped screenshots. The final automatic carryover, extra-day
credit and expired-funds recovery states were inspected at 1280px and 390px; no
horizontal overflow, broken visible images, manual Apply button or visible quote
expiry remains. The remainder matches the original bordered amount/copy row.
The full reference-parity browser path retains the known mismatch in the unchanged
crypto-help control ordering; it is not counted as passing coverage.

Final full verification on 2026-11-03: `npm run test:creator-membership:docker`
passed 89 creator membership/controller/HTTP tests and 70 payment tests; no payment
cases were skipped. This run includes the final automatic-application UI behavior.
Code is delivered for review, without production deployment or live transfers.
