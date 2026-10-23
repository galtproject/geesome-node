# Concurrent client upload audit

## Contents

- [Contract and limits](#contract-and-limits)
- [Findings](#findings)
- [Workstreams](#workstreams)
- [Verification and delivery](#verification-and-delivery)

## Contract and limits

User requirement: several independent clients may each submit ten files. GeeSome
keeps ten simultaneous storage operations and bounded worker/SQL pools. Capacity
waiting and exclusive GC must not become false terminal client failures. Preserve
ownership, existing accepted operation IDs, destination paths, cancellation and
deletion safety. Genuine terminal errors and unknown network outcomes remain
separate from explicit pre-execution refusals; this is not a promise that every
network/provider error is retry-safe. No production changes are authorized by the
local verification workflow.

## Findings

| Finding | Impact | Repair |
| --- | --- | --- |
| Read-only POST status/catalog lookups take the write fence | Polling and refresh fail while capacity/GC is busy | Explicit read-only registration for audited owned lookups; preserve auth/scopes |
| BFF replaces explicit busy codes with generic 502 | Client cannot distinguish safe waiting from ambiguity | Preserve only exact 503 busy codes and bounded Retry-After |
| Media spends its three attempts on explicit busy replies | Multiple clients can fail without any file being accepted | Cancellable backoff with a visible waiting state; retain path and attempt budget |
| Publisher recognizes maintenance but not capacity busy | Parallel Media load can exhaust publication retry budget | Recognize both exact pre-execution busy responses |
| Existing tests exercise one owner and short queue delays | Cross-client starvation/ownership regressions can escape | Three owners × ten uploads, saturated-pool reads and GC tests |

Previous #1401 fixes multipart disconnect leaks and isolates worker election from
the ten storage slots. This audit builds on that change, without removing its
shared/exclusive fences. Long processing with no confirmed capacity response keeps
its existing timeout/reconciliation behavior; never blindly replay an unknown
upload result.

## Workstreams

| Workstream | Inputs / write scope | Output and completion | Dependencies |
| --- | --- | --- | --- |
| GeeSome protocol/read paths | API module options, async/catalog route registrations, problem headers, HTTP tests | Owned read polling available during load/GC; producers still fenced; 30-upload test | #1401 |
| Microwave Girls waiting | BFF error mapping, Media upload loop/progress, publication busy classification | Known busy waits without duplicate admission or failure budget; Stop cancels waits | Backend protocol |
| Evidence and review | Both repo docs/tests; Media mock/E2E captures | Record focused/broad test results and inspect desktop/narrow screenshots | Both implementations |

One agent owns integration and delivery. Code exploration/test preparation can be
independent across repositories; mutation and final handoff remain sequenced with
GeeSome first. Do not narrow storage safety or grow pools to match arbitrary
client counts.

## Verification and delivery

Completed on 2026-10-23. Tracking: GeeSome #1403, delivery PR #1402, and
Microwave Girls #612. No schema migration or production mutation.

- GeeSome: 32 tests passed against real disposable PostgreSQL/Kubo, covering
  multipart bytes/abort cleanup, thirty parallel uploads across three owners,
  owner-filtered/anonymous polling with a saturated pool, exclusive GC rejection
  and recovery, bounded capacity timeout, immutable assets/proxy URLs, and API
  callback/header/unversioned route contracts. Command: Docker test service,
  Mocha `test/asyncBusboy.test.ts test/imageOptimization.test.ts
  test/agentFriendlyApiIntegration.test.ts test/apiCallbackHandling.test.ts
  test/apiHeaders.test.ts test/apiUnversionPost.test.ts`, port 7772 with service
  aliases and `DATABASE_NAME=geesome_optimization_full10`. Full repository tests
  were not run.
- Security route inventory regenerated with no auth/permission classification
  change and checked clean; full apiDoc parse to temporary output passed.
- Microwave Girls: all 773 frontend tests, 27 BFF/client tests, 70 membership
  tests and 3 real PostgreSQL scenarios passed. Repeated explicit capacity
  refusals preserve the publisher failure budget and receipts. Three simulated
  ten-file clients wait four minutes without spending attempt 1; Stop cancels
  active and queued files, and accepted receipts resume without re-upload.
- `npm run e2e:docker:media-gallery`: all ten desktop/narrow browser cases
  passed. The evidence verifier accepted 34 fresh screenshots and typed
  contracts, run `7da79af8-80b4-4dd6-b0a2-5dce3448d7f8`. All captures were
  visually reviewed against their manifest descriptions, including full-sized
  waiting/recovery/Stop views on both viewports. Waiting labels wrap within the
  narrow panel, Stop stays visible, recovery restores previews, and real
  timeout/final refresh failures still use the dismissible notification.
- Whitespace checks passed in both repositories. Deploy GeeSome first, then the
  updated Microwave Girls build. Existing connections leaked by the old parser
  are released when the upgraded GeeSome process restarts.

Limits remain intentional: known busy responses can wait with cancellation;
ordinary accepted processing still uses the existing three 60-second attempt
windows when no busy response confirms capacity waiting. Unknown network
outcomes are not safe admission refusals, and path reuse alone is not an
exactly-once guarantee. Browser Stop does not cancel work already accepted by
GeeSome. Server storage concurrency remains ten total, not ten per client.
