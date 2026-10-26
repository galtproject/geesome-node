# Creator membership migration to GeeSome

Tracking: [#1425](https://github.com/galtproject/geesome-node/issues/1425).

## Contents

1. [Requirements and scope](#requirements-and-scope)
2. [Architecture and contracts](#architecture-and-contracts)
3. [Plan audit](#plan-audit)
4. [Workstreams and delivery order](#workstreams-and-delivery-order)
5. [Migration and rollout](#migration-and-rollout)
6. [Acceptance and verification](#acceptance-and-verification)
7. [Implementation record](#implementation-record)

## Requirements and scope

User requirements: move Google authentication, direct cryptocurrency payments and group-scoped paid access from microwave-girls into reusable GeeSome modules. Existing eraofwave.com Google origin/client configuration works and must remain usable. Buyers must have no upload/publication permissions. Preserve Wave/Meat separation, existing paid periods, invoice identity, receiving addresses and recovery journals. The eventual website is generated from Group/Post.

Stage 1 delivers three opt-in backend modules, private reader identities linked to core users, site-bound browser sessions, a direct-payment engine and membership APIs, with executable local integration evidence. It does not deploy, switch DNS/proxies, import production funds/state, activate live workers or delete the still-running microwave-girls implementation. Those removal/cutover steps follow migration rehearsal and explicit deployment work. Existing password/Ethereum bearer login remains unchanged. No new payment provider or automatic subscription renewal.

Source snapshots will be recorded below. Source of truth is executable source rather than historical membership/provider docs. Never read live secrets into reports or fixtures.

## Architecture and contracts

- `googleAuthorization`: validates Google ID tokens; privately maps immutable Google subject to a core user; issues/revokes site-bound opaque cookie sessions. Core user creation bypasses public profile/static-ID generation and grants no core permissions. Private Google name/email/subject live outside public user manifests. Do not use editable/publicly exported ForeignAccount claims as login identities. Do not auto-link by email.
- Shared browser-session primitives belong to `api`, and are consumed explicitly by the new site endpoints. Do not enable cookies on all legacy authorized APIs. Browser users get no bearer key, and cannot invoke core upload/admin endpoints. Existing password/Ethereum workflows continue using bearer credentials.
- `payments`: owns immutable invoice snapshots and crypto allocation, chain observation, finality, transaction/nonce journals, collection/swap recovery and refunds. Port the maintained direct-payment implementation, preserving arithmetic/derivation/fingerprint/event ownership rather than replacing it with a mock payment callback. Keep ethers v6 isolated from legacy ethers v4.
- `membership`: owns sites bound to existing non-public, unencrypted groups, tariffs, periods, entitlement and safe feed projection. Paid invoice settlement and period creation happen in one resource-locked DB transaction, at most once per invoice. Readers are not inserted into group member pivots. Group ACL remains unchanged.
- A canonical HTTPS origin maps to one site. Reject unknown Host and cross-origin mutations; trust only the actual configured Host passed by a trusted reverse proxy, never arbitrary forwarded headers or browser-selected site IDs. Sessions carry a site identifier; one core identity may have separate cookies/sessions for Wave and Meat.
- Public endpoints have explicit allowlisted response DTOs. Never spread untrusted group/site JSON into financial configuration. Feed exposes previews; full legacy Page URLs are returned only for free posts or an active period. This preserves the existing link-gating behavior; it does not claim protected IPFS bytes.
- Proposed routes: `/v1/login/google`, `/v1/browser-session`, `/v1/browser-session/logout`; `/v1/membership/resource`, `/feed`, `/posts/:id`, `/account`, `/refunds`; `/v1/payments/crypto/methods`, `/invoices`, `/invoices/:id`; owner APIs use existing bearer authorization and resource/group ownership. Exact delivered routes are documented with the modules.
- Optional modules load after `group`/`api`/`database`; payments before membership; Google initialization has no membership dependency. Runtime enablement, site config and payment workers fail closed by default. No signing/observer loops start merely because a seed exists.

## Plan audit

Audit performed before implementation against the local source:

1. **Registration privacy (blocking):** `registerUser()` publishes a User manifest and `entityJsonManifest` includes email. Use a private core-user row with randomized non-identifying name, no email/password/profile keys, and separate private verified identity. No manifest generation/hooks on reader creation.
2. **Account confusion (blocking):** ForeignAccounts supports user-edited claims and public export; provider/address indexes are not unique. New verified identities require a unique provider/subject key, concurrent registration protection and no email-based merge.
3. **Cookies/privilege boundary (blocking):** legacy bearer login copies user permissions into API keys. Reader login must not call `handleAuthResult()` or issue an ordinary key. Explicit session endpoints enforce configured origin/site, expiry, revocation, mutation origin checks and no-store responses. Session possession must not authorize generic routes.
4. **Payment semantics (blocking):** current implementation includes managed balance proofs and outgoing signer journals, not just invoice creation. Preserve the full crypto engine and isolated v6 dependencies. Address reuse is supported: do not copy the obsolete addressId-unique constraint from the initial crypto schema. Preserve final-state composite uniqueness from the automation migration.
5. **Exactly-once periods (blocking):** serialize by site, lock invoice, unique invoiceId in periods, preserve calendar anchor-day rules and atomic payment/period commit. Refresh entitlement on every access. Refund request/approval alone must not revoke access or send funds; manual completion revokes only that invoice period.
6. **Group access (blocking):** closed-group membership may allow posting. Never add buyers as ordinary members. Owner-only operations require group creator ownership and core permissions, not mere Google login.
7. **Immutable bytes (separate delivery):** current full sets are public plaintext CID sites; link gating does not revoke copied URLs. New public site projection and private original delivery are required later. Existing CIDs cannot be made secret retroactively.
8. **Migration safety (blocking before cutover):** UUIDs, frozen invoices, seed fingerprint, address indexes, checkpoints and journals must survive. A dump import is insufficient without final-state constraints and reconciliation. Do not run old and new money workers together. Preserve originals and prepare rollback that respects any newly signed transaction.
9. **Schema conventions:** new GeeSome tables use model sync; existing source production migrations are evidence for final schema, not migrations to execute on unrelated GeeSome tables. No production table alteration in stage 1.
10. **Operations:** tests use local PostgreSQL, fake Google issuer/JWKS and fake chain adapters. No production startup/updater, DNS edits, real transfers or seed access. Worker errors must be observable and stop must drain work.

## Workstreams and delivery order

The original implementer owns integration, audit, commit/push and PR handoff. These boundaries also support later delegated execution; no parallel edits are required now.

| Stream | Inputs | Outputs / write scope | Dependencies | Completion and verification |
| --- | --- | --- | --- | --- |
| A: identities/sessions | Existing API wrappers, Google verification contract | `api/browserSession*`, `googleAuthorization/`, focused tests | Site resolver contract | Valid/invalid identity, concurrent login, private core user, expiry/logout/origin/site isolation, no upload token |
| B: direct payments | microwave-girls crypto source/config/final schema | `payments/`, isolated deps, crypto regressions | Resource/transaction callbacks | Existing arithmetic/wallet/observer/journal tests plus real SQL settlement/recovery |
| C: group membership | Group/Post ACL, source entitlement/refunds | `membership/`, group projection, real SQL tests | A+B | Real verified login -> invoice -> fake confirmed chain payment -> exactly one period; isolation/refund/expiry |
| D: integration/audit | A+B+C | Config/types, API docs, inventories, module docs, this plan | A+B+C | Module bootstrap/stop, HTTP/API evidence, regression checks, final security self-review |
| E: migration/cutover | Approved production inventory/backup | Rehearsal/import tooling, proxy mapping, source cleanup | D, future deployment task | Reconcile all counts/amounts/checkpoints; single worker ownership; only then remove old routes/workers |
| F: generated creator site | Group/Post and entitlement API | Safe SSG theme/projection, private original serving | D | No paid bytes/URLs in public build; canonical routes; desktop/mobile UI flows |

A and B can be developed independently after freezing the resource/session contracts. C follows their contracts. D is sequential integration. E precedes deletion from microwave-girls. F is a subsequent website phase.

## Migration and rollout

1. Back up original DB and separately protect operator secrets. Inventory readers, resources/groups, tariffs, invoices, periods, refunds and all crypto tables/checkpoints/journals. Verify deployed source versions rather than assuming the workstation equals production.
2. Rehearse on an isolated DB with workers/signing/network disabled. Map legacy reader UUIDs to new private identities/core users and resources to real groups. Preserve external IDs and immutable snapshots; compare semantic totals and per-reader expiry.
3. Run mocked end-to-end flows through eraofwave-style Host routing. Prepare exact reverse-proxy mappings for the existing public API, including owner APIs, before switching any browser endpoint.
4. Stop old money workers, capture the final delta and reconcile unknown operations. Import once, validate fingerprint/address cursors and finality boundaries. Start new observer before separately authorizing collection. Never run both ledgers/signers.
5. Switch the site's API. Preserve or explicitly expire old sessions; subscriptions survive re-login through Google subject mapping. Observe errors and billing parity.
6. Only after cutover acceptance remove billing/auth code and workers from microwave-girls. Keep a documented publication client to GeeSome. Rollback must use the authoritative current ledger, never a stale pre-payment DB snapshot.

## Acceptance and verification

- Google valid credential creates/reuses one private core identity; invalid audience/issuer/signature/expiry and replay protection failures reject. Existing password/Ethereum code remains untouched.
- Same user can access both sites with distinct sessions, but no period/invoice/session leaks between sites; unknown Host and cross-origin mutations reject. No public profile/email/identity manifests are created.
- No reader API key is issued; cookies are accepted only on explicit new endpoints. Upload/admin API remains bearer-only; privileged owner operations enforce original core and group ownership checks.
- Tariff snapshots are immutable per invoice, payment/period credit is atomic and idempotent, expiry uses a controllable clock, refunds are manual with invoice-specific revocation.
- Ported crypto regression vectors pass; real PostgreSQL model constraints/concurrency are tested, with no live RPC/Google calls or transfers.
- Update apiDoc + security route inventory. Review modules/load order/stop behavior, document worker enablement and known pending migration/SSG work. Run relevant existing auth/group tests and diff hygiene.

## Implementation record

- 2026-10-26: plan and audit written before implementation. GeeSome branch created from fetched `origin/dev` at `7258b19a`. microwave-girls source initially `ec7841f1`; recheck before porting. Production not inspected or modified.
- Status: A-D implemented and locally verified; E-F pending. Stage 1 is not production cutover and does not remove source billing code.
- Delivered `googleAuthorization`, `payments`, `membership`, shared explicit browser sessions, opt-in config/module loading and documented owner/reader APIs. No changes to existing bearer handlers or Group/Post schemas.
- Authentication uses the official Google library with a one-use browser/site nonce; test JWTs use local RSA keys and the actual library verifier. Registration serializes by immutable subject, creates no public profile, and issues no bearer key.
- Ported the complete maintained crypto engine and fake-chain regression vectors. SQL table-specific operations now live in model helpers. Final schema includes reusable managed addresses, wallet/index uniqueness and nonce journals; ethers v6 is isolated from existing v4.
- Verification: `npm run test:creator-membership:docker` passed 12 Mocha cases (real HTTP/Postgres flow plus worker lifecycle) and 49 node:test cases (42 crypto vectors and 7 real SQL managed/recovery scenarios), with zero skipped cases in that command. Existing auth/API/private-group/bootstrap focused regression: 20 passed. apiDoc generation, security route inventory, scalability inventory and diff hygiene passed. Full Docker product suite and browser UI flows were not run; this stage changes backend APIs and leaves the existing browser application untouched.
- Separate implementation audit: corrected stale source table names in SQL/Sequelize joins; retained independent observer/collection overlap guards and drain-on-stop; redacted unexpected site API errors before the shared logger; made disabled modules/workers fail closed; kept duplicate-email accounts separate and validated actual signature/audience/issuer/nonce failures.
- Cutover audit: current browser login does not yet request/pass the new nonce. Routes, native post ids and bounded account-history responses also differ. A blind reverse-proxy switch is unsafe; update/adapt and browser-test the client first. Public previews must be materialized from the old chosen preview state and local hidden flags. Existing public plaintext CIDs remain outside membership enforcement.
- Source checkout advanced concurrently to `449b610b`; reviewed its membership diff: only publication-render recovery changed, outside this extracted crypto/auth/refund contract. The crypto source/configs retain the recorded `ec7841f1` provenance.
- No production data/config/seed, live Google account, RPC or transfer was used. Existing microwave-girls logic remains the production owner until stream E is accepted.
