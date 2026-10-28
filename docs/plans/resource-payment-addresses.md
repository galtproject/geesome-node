# Resource-scoped permanent payment addresses

Tracking: [#1453](https://github.com/galtproject/geesome-node/issues/1453).

## Contents

- [Contract](#contract)
- [Implementation and upgrade](#implementation-and-upgrade)
- [Verification](#verification)

## Contract

A Google reader must receive distinct permanent addresses for different creator resources. Renewals for one resource reuse its address, including across supported EVM networks. One seed supplies a shared monotonically increasing index space; index zero remains the service wallet. Resource selection comes from the validated invoice resource, not an untrusted reader field. No frontend, tariff, session, payout or paid-access redesign.

## Implementation and upgrade

Sequential delivery: schema/upgrade migration -> allocator/invoice admission -> SQL regression/upgrade verification -> operator documentation and PR. The implementation owns payment schema, allocator and database audit; verification owns disposable PostgreSQL fixtures only. No production deployment, seed changes, money-worker startup or live transfers are part of this change.

Assignments gain resourceId and uniqueness on wallet/reader/resource, preserving the global wallet/index unique index and permanent payout reservations. Same-resource pending invoice exclusion remains; different resources can have pending invoices for the same asset concurrently. Global reader pending cap stays ten.

Migration uses historical invoice resource and reader evidence to preserve unambiguous assignments. Shared-resource, unused or mismatched assignments retain their original key/index as NULL-resource legacy reservations; new allocation skips them. Existing invoices continue referencing their original address and frozen boundaries. Rollback fails closed if multiple assignments for a reader exist. Stop all old allocators/API/money workers before migration; preserve authoritative ledger after any new payment.

The separately deployed MicrowaveGirls index is not automatically imported: source ledger and identity migration remain separate from this schema upgrade.

## Verification

Implemented and verified on 2026-10-28:

- `npm run test:creator-membership:docker`: 34 HTTP/PostgreSQL/membership cases and 53 payment cases passed, zero skipped. New SQL cases exercise eight competing requests, two distinct resource assignments, globally unique indexes, simultaneous Wave/Meat invoices, independent settlement, network reuse and restart/renewal stability.
- Upgrade tests cover absent tables, legacy single-resource preservation, shared/unused/mismatched reservations, unchanged invoice snapshots, uniqueness, idempotent rerun and rollback rejection after multiple assignments.
- Migration-integrity audit against a migrated disposable PostgreSQL database: no failures; resource column, both assignment/index constraints, positive indexes and obsolete reader uniqueness checks passed. Migration-file coverage passed.
- Scalability inventory regenerated and checked, with no resulting inventory diff. Reviewed assignment lookup/global-index paths; both retain unique backing indexes.
- Existing balance-proof regression now explicitly renews the same resource to continue testing its address reuse/checkpoint protection; cross-resource isolation is tested separately.
- No browser/UI changes, production deployment, real seed access or live transfers. Full unrelated product suite was not run.

Evidence: `/tmp/resource-payment-tests.log`, `/tmp/resource-address-integrity.log`, `/tmp/resource-address-scale.log` (local, untracked).
