# IPFS pin and cleanup recovery (#1413)

## Contents

- [Contract](#contract)
- [Workstreams](#workstreams)
- [Verification and rollout](#verification-and-rollout)
- [Progress](#progress)

## Contract

Use Kubo 0.42.0 with the upstream pin-index lock fix. Preserve all reachable pins,
MFS and CIDs across migration. Production migration without a complete old-repo snapshot requires explicit operator authorization after the isolated rehearsal.
Pin calls carry caller/fence cancellation and a bounded deadline. Cleanup retries
have persisted backoff and stop with an actionable failure, without marking
unpinning as physical deletion. No new model, migration or parallel upload queue.

## Workstreams

Execute sequentially in this checkout; no delegated edits.

1. Runtime: update Compose and smoke/test images to Kubo 0.42.0; add an isolated
   0.21 -> 0.42 migration/rollback rehearsal. Input: original repo fixture. Output:
   unchanged root IDs, pins and MFS after migration, working untouched old copy.
2. RPC: preserve pin options/caller/fence signals, bound pin calls and retain
   underlying causes. Give GC a dedicated transport with matching explicit 30-minute RPC/transport deadlines; pin calls are bounded at two minutes.
   Scope: storage adapter and retirement RPCs; completion: cancellation tests.
3. Recovery: checkpoint cleanup failure count/deadline inside existing receipts,
   use backoff, stop after three consecutive failures, reset on explicit retry.
   Scope: replacement worker; completion: deterministic retry/fence tests.
4. Verification: multiple clients with ten uploads each, GC admission/abort and
   resumed writes, preserving existing shared-file retirement protections.

## Verification and rollout

Run focused unit tests, migration/rollback Docker rehearsal and real PostgreSQL /
Kubo image saving/retirement tests. Review all diffs, push a PR to dev, never merge.
Normal production upgrades require a stopped consistent snapshot. The operator
explicitly authorized migration after a successful local rehearsal without waiting
for a full production snapshot (24 October 2026); use the recorded rehearsal override.
Deploy the Kubo image separately with a persistent systemd Compose override until
the runtime/Compose PR is merged; never merge the PR on behalf of the user. Rehearsal
fixtures do not prove the complete production repository is migration-clean.
Do not downgrade the migrated directory: rollback uses the untouched old snapshot.

## Progress

- Confirmed Kubo 0.21 `streamIndex` blocked on sending its terminal error while
  holding the pinner read lock; pin writers waited 20+ minutes. Blocks were local,
  disk had 81.5 GiB free. A daemon-only restart removed the orphaned requests.
- Existing production GC completed after restart: receipt 2555, 1,405 blocks collected and 47,831,117 observed reclaimed bytes.
- Upstream: https://github.com/ipfs/boxo/pull/1140 and
  https://github.com/ipfs/kubo/releases/tag/v0.42.0 . The snapshot fix also removes
  lock ownership while emitting errors. Do not attribute this incident to pinned
  reprovider configuration: this server used defaults, and the observed blocked
  line was the terminal error send after the cancelled index traversal.

## Production procedure

1. Complete `npm run test:kubo-migration`, `npm run test:docker-images`,
   `bash test/ipfsUpgradePreflight.test.sh` and the focused PostgreSQL/Kubo suite.
2. Pull `ipfs/kubo:v0.42.0` before downtime. Record its digest. Quiesce GeeSome,
   then stop IPFS. Capture sample owned pinned CIDs and MFS root beforehand.
3. Normally restore/migrate a stopped full repository snapshot first. For this
   incident the operator explicitly chose deployment after local rehearsal,
   without a complete production snapshot. Metadata-only copies are diagnostic
   aids and must never be described as a complete rollback backup.
4. Use `.docker-deploy/kubo-compose.yml` plus a separate systemd drop-in to pin
   the Kubo image while source Compose/runtime changes await user merge. Keep
   the source checkout clean. Run the existing Compose wrapper with both files;
   leave application/PostgreSQL volumes and published web image unchanged.
5. Wait for migration and daemon readiness, verify repository v18, sample pinned
   bytes and MFS, then restart GeeSome. Inspect accepted operations and cleanup.
   Resume failed publication jobs only through existing owner Retry controls.
6. Standard future `docker-upgrade` checks old-repo snapshot presence first.
   `GEESOME_IPFS_UPGRADE_AFTER_REHEARSAL=1` is reserved for an explicitly
   authorized upgrade after the local rehearsal, as approved for this incident.

## Evidence

- Isolated v0.21 -> v0.42 migration: repository v14 -> v18; preserved pinned bytes,
  MFS and root CID; real GC and cancelled listing followed by a successful write;
  untouched v14 copy restarted successfully.
- First full integration attempt had a transient shared-retirement failure and
  cascading retry-test failure while migration/build activity overlapped. The
  focused rerun and two full 23-test runs subsequently passed. The final run also
  checks that a later failure cannot undo an already completed cleanup row.
- Production migration completed with operator authorization after rehearsal.
  Image: `ipfs/kubo@sha256:8907cb0cc1ad5798f6bb1bb1341a800990c268e021cedfa317e8aa1a33864214`.
  Kubo 0.42.0 / repository v18, matching hashes for three pinned samples and the
  MFS root, GeeSome `/v1/health` OK. Diagnostics and the metadata-only copy remain
  at `/root/geesome-node/.docker-deploy/kubo-upgrade-20261024-234113`.
- Vendor telemetry is disabled explicitly in the new Kubo configuration.

- GC transport uses an RPC-scoped Undici dispatcher and matching 30-minute
  headers/body/RPC deadlines. This preserves bounded cancellation without cutting
  a legitimate large-repository GC off at native fetch's five-minute header limit.
  Authentication, API base path, NDJSON chunking, HTTP errors and connection abort
  are covered by focused transport tests. Undici was already resolved transitively;
  it is now an exact direct dependency. Node minimum is aligned to 22.19.
- Local cancelled-GC rehearsal seeds 50 pins, cancels real GC/list requests ten
  times, then verifies another pin writer succeeds within its ten-second limit.

- Final integration run after the dedicated GC transport change: 26 passing (57s), including two clients with ten uploads each, the existing three-client upload case, cleanup recovery and cancellation. Deployment contract tests (2), upgrade preflight, API documentation and security route inventory checks passed. Application safeguards await PR merge/deployment; the production Kubo migration is complete.
