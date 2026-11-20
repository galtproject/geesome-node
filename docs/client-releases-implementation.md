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

- Coordinate public key with client builder; operator must retain its signing key and publication key.
- Test the actual Windows installer/login/upgrade workflow before advertising stable.
- Publish only after intended client/node PRs are merged by the user and normal server release/deploy
  verification is complete. No production services or release pointers were changed by this work.
