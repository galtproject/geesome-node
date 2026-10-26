# Owner default payout

Tracking: [#1429](https://github.com/galtproject/geesome-node/issues/1429).

## Contents

- [Contract](#contract)
- [Implementation and audit](#implementation-and-audit)
- [Verification](#verification)

## Contract

One operator seed remains shared by the node. A private payout default belongs to
an authenticated core user; multiple creator sites owned by that user may inherit
it. Existing `payments_crypto_treasuries` rows with nonempty payout remain
explicit group/site overrides. An explicit inherit action clears the override
while retaining its optimistic version, without changing any group binding.
Owner defaults never grant group permissions or reader access.

GET/POST `/v1/user/payments/payout` operate only on `req.user.id` and require the
existing core group-management permission, including the active key's permission
boundary. Body-supplied owner IDs are rejected. Existing group owner endpoints
retain their authorization and accept `{inherit:true,version}` to reset a group.
Settings expose effective address, source and separate default/override versions.

Public EVM addresses are validated and normalized; defaults cannot name the
service or an allocated deposit wallet. The common allocator also reserves owner
defaults. Edits use the same global allocation lock as receiving-address creation
and preserve version conflicts. New defaults use a new model-synced table; do not
alter existing financial tables or copy source production migrations.

New managed invoice snapshots freeze effective payout and origin/version. A
later owner/default/override edit affects only newly created managed invoices.
Collection admission carries the frozen destination into durable job data;
planned jobs retain their destination across restarts. Legacy invoices/jobs
without the new snapshot retain their group-specific fallback; do not silently
route historical money through a newly introduced owner default. If the old group
payout has been cleared, leave the legacy job pending for explicit reconciliation.

## Implementation and audit

1. Add private owner default model and shared payout validation/version helpers.
2. Resolve group override then owner default for settings/availability/new invoices.
3. Preserve payout snapshots through queue admission and collection planning;
   reserve default addresses in the existing shared reader allocator.
4. Add self-only HTTP APIs, exact route docs, authorization inventory and real SQL
   regression cases. Existing Google sessions do not authorize payout changes.
5. Record results and remaining UI/migration work before commit/PR handoff.

Audit focus: account ownership, creator/key permissions, optimistic updates,
legacy group payout compatibility, exact invoice/job recovery, concurrent address
allocation and no live signing/network operations in tests. This implements backend
settings APIs; the creator settings screen and production cutover remain separate
from the already pending client migration.

## Verification

Implemented the owner default and permanent destination reservation models,
self-only bearer APIs, effective group settings and explicit inheritance reset.
New managed invoices and queued collections carry immutable payout snapshots;
legacy jobs retain the group-only fallback. Core `not_permitted` errors now keep
the shared API's HTTP 403 mapping inside the creator endpoint wrapper.

Verification uses the isolated creator PostgreSQL wrapper, real HTTP routes and
fake chain/signing adapters. Added real SQL checks for two owners/three groups,
concurrent version conflicts, service/deposit-address rejection, permanent
reservation of former payout addresses, immutable invoices, restart and legacy
fallback. HTTP checks cover reader cookie/bearer denial, self-only reads/writes,
body user-id rejection and foreign-group refusal. No live transfer or RPC occurs.

The wrapper runs 13 creator/worker cases and 51 payment cases (the previous 49
plus two owner payout SQL scenarios) with no skipped cases. Payment files now
run serially so independent SQL fixtures do not reset the same disposable DB
concurrently. API documentation and security inventory are regenerated. Full
product suite and browser UI were not run; the UI remains pending client work.
