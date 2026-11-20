# Client release implementation evidence

Tracking: #1677. This is implementation evidence for the reviewed Windows distribution plan,
not a claim that a Windows installer has been installed/tested on Windows or published to production.

Implemented:

- Optional public-key-configured module with signed immutable stable descriptors and a small
  model-sync table, existing admin/API-key authorization, bounded exact-byte verification and pinning.
- Existing shared storage fence prevents cleanup racing verification/pin/reference commit;
  registered release references include v0/v1 CID aliases and protect retained files from retirement.
- Existing IPFS/download/upload paths reused. Public guide, public stable metadata and additive
  discovery support the trusted-node-URL-only first-install flow, including prefixed public API roots.
- No new upload pipeline, generic permission system, release dashboard or retention worker.

Verification on 2026-11-20:

- `CLIENT_RELEASE_TEST_DATABASE_URL=... CLIENT_RELEASE_TEST_KUBO_URL=... CLIENT_RELEASE_TEST_GATEWAY_URL=... npm run test:client-releases`
  against disposable PostgreSQL 16 and Kubo v0.42.0: 16 tests pass, including concurrent SQL stable
  selection, recreation/persistence, cleanup references, real pinning and exact gateway byte roundtrip.
- `npm run security:route-inventory:update` then `npm run security:route-inventory`: pass; publication
  route lists AdminAll and the two public routes are documented as public.
- Targeted apiDoc smoke including shared API definitions:
  `node_modules/.bin/apidoc -i app/modules -f '(clientReleases|api)/api\.ts$' -o <temporary-output>`: pass.
- Module import via tsx, `docker compose -f docker-compose.yml config --quiet`, and whitespace check: pass. Existing full Docker suite was not run; focused
  real PostgreSQL/Kubo and public HTTP tests cover the changed boundaries without unrelated services.

Remaining release gates:

- Original publisher retains its signing/publication keys. With #1682, ordinary node owners use
  the bundled official public key and release import; custom distributions still coordinate keys.
- Test the actual Windows installer/login/upgrade workflow before advertising stable.
- Publish only after intended client/node PRs are merged by the user and normal server release/deploy
  verification is complete. No production services or release pointers were changed by this work.

## Default trust and signed-release import (#1682)

- Node now enables `clientReleases` with the same reviewed public key already embedded in the
  official client. No PEM copy or private signing key is required for ordinary mirrors.
- Explicit `GEESOME_CLIENT_RELEASES=0` disables the module. Existing nonempty custom public-key
  configuration still overrides the default and malformed overrides fail closed. An empty key
  now selects official trust rather than disabling distribution; this is an intentional rollout change.
- `npm run client:releases:import -- --source SOURCE --node TARGET` verifies a public source's
  signed stable manifest and registers the exact unchanged descriptor using only the destination
  administrator API key. The existing destination IPFS path retrieves/verifies/pins the signed CID.
  No private-key handling, artifact re-encoding, new API route or arbitrary-URL server fetch was added.
- Tests: `npm run test:client-releases` passes 21 focused cases, including default/custom/disabled
  module initialization, the official fingerprint, real source/target HTTP import with byte/pin
  verification, idempotency, bad signatures, bounded metadata, prefix discovery and credential isolation.
- CLI help, targeted apiDoc smoke, security route inventory and diff whitespace checks pass.
  The earlier PostgreSQL/Kubo validation above remains evidence for the unchanged publication path;
  optional database/Kubo fixtures and the unrelated full suite were not rerun for this extension.
- Official source must first publish a signed release and keep its CID reachable through IPFS.
  No production import or stable promotion was performed during this implementation.
