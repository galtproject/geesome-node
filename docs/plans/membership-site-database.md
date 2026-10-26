# Membership site database

## Contents

- [Contract](#contract)
- [Work and dependencies](#work-and-dependencies)
- [Audit and upgrade](#audit-and-upgrade)
- [Verification](#verification)

## Contract

User requirement: store site configuration in membership database records and
remove runtime file/env configuration (#1436). This extends creator defaults
PR #1435; the original three modules and payment-worker controls remain.

Resources preserve immutable IDs, host, owner and existing private group. New
settings rows store public Google client IDs, registration, enabled and version.
All browser routes resolve the current database state, with exact Host/Origin
and existing cookie rules. No client-supplied site selector is trusted.

## Work and dependencies

1. Storage/resolution: membership models/siteSettings and async browser resolver.
   Output: indexed host + primary-key lookups; no process config cache.
2. API/authorization: operator AdminAll provisioning, owner/UserGroupManagement
   mutable settings; optimistic updates and immutable bindings. Depends on 1.
3. Verification/docs: SQL/HTTP, permission/host/nonce/live updates/import tests,
   module docs and inventories. Depends on 1–2. Read-only audit can run alongside
   documentation; implementation is handled serially in this task.

## Audit and upgrade

- No reusable confirmed-domain registry was found in staticSiteGenerator. Only
  node operators may provision hosts, after checking proxy/domain control.
  There is no claim that DNS is automatically verified. Owners cannot rebind.
- Existing resources have no new settings row and fail closed. Explicitly replay
  the prior JSON entries through provisioning, keeping site/group/owner/origin IDs
  and version zero. Existing tariffs and financial records are not recreated.
- New records/settings writes are transactional. Resource locks serialize owner
  updates; provisioning uses an advisory lock and SQL uniqueness constraints.
- Disable blocks browser sessions without deleting them; re-enable restores
  access for unexpired sessions. Registration-off allows existing identities.
- Google initialization has no startup cycle; request-time membership resolution
  rejects requests until membership is available. Core bearer auth is unchanged.
- Payment workers remain opt-in. This does not move production users, ledgers,
  public-page filtering or browser code. There is no settings UI in this stage.
- Runtime file loading is removed deliberately; keep the original configuration
  as import/rollback evidence. No existing database columns need a migration.

## Verification

- Isolated PostgreSQL/HTTP + worker boundary suite: 16 passed. Includes live
  Google client changes, registration-off, site disable/re-enable, owner/operator
  isolation, concurrent version conflict, unique hosts, durable restart reads,
  and import into an existing resource without tariff recreation.
- Payment/SQL recovery suite: 51 passed, zero skips.
- Docker Compose configuration: 2 passed.
- Existing auth/API/group/private-group/bootstrap regressions: 20 passed.
- API docs generation, security route inventory, database scalability inventory
  and diff checks passed. No production deployment, live RPC or transfers.
- Full product suite and creator UI were not run/implemented in this stage.
