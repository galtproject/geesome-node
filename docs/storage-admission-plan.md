# Storage admission separation (#1563)

## Contents
- Scope and acceptance
- Parallel workstreams
- Verification and rollout
- Implementation notes

## Scope and acceptance
First stage of the reviewed architecture: bounded cancellable HTTP writer admission, fast authorized idempotent replacement reads, safe opt-in acquire/hold telemetry. Keep per-operation shared/exclusive GC protection for the full writer lifetime. Preserve existing request keys, receipts, deadlines and retained source behavior. No production mutations or batch resume.

Deferred: durable validation/execution stages, global worker scheduling, and reserved GC connection/drain design. These need additive contracts and separate rollout testing.

## Parallel workstreams
- Lifecycle owner: `app/storageLifecycle.ts` and new lifecycle-specific tests. Add optional admission budget/signal/context and bounded safe diagnostics; retain defaults for internal/background callers and refcounted children. Complete when real checkout cancellation/late release and fence invariants can be verified.
- Receipt owner: `app/modules/staticSiteGenerator/api.ts`, replacement service and focused receipt tests only. Remove outer fence solely for reviewed replacement admission, keep inner fence for new work, and preserve owner/hash checks on fast existing reads. Complete when saturated pool still permits authorized receipts and refuses wrong owner/hash.
- Coordinator: HTTP adapter integration, shared PostgreSQL/HTTP tests, documentation/inventory, full validation and final review. Integrate after both owners finish. Only coordinator commits/pushes and opens PR.

## Verification and rollout
Focused real PostgreSQL/HTTP saturation/abort/GC tests, existing image optimization/render/retirement suites, Docker full suite, apiDoc smoke and security inventory. Test against integration dev and inspect compatibility with deployed master (including its additional control pool). No migrations or client changes intended. Merge/publish/deploy are separate from this implementation; user owns merges.

## Implementation notes
- Production master has a control pool not present on dev; do not overwrite it or claim the change replaces it. Changes must apply to the shared fence core.
- Client disconnect only cancels admission that has not begun. Accepted/durable work continues with original receipts.
- Diagnostics must omit tokens, URLs, payloads, source IDs and request keys; bounded route templates/request IDs only.

- Initial implementation (superseded by the user-flow compatibility contract below):
  HTTP context used a three-second absolute admission budget,
  response-close/aborted cancellation before the first executing fence, and
  handler-owned mode only for site-replacements. No mixed save-data bypass.
- Receipt service already authorizes and validates request hash before its
  internal fence; route delegation is sufficient, without rewriting receipts.
- PostgreSQL checkout cannot physically remove an abandoned waiter; its eventual
  checkout is released without running the callback. This is not a bounded queue
  architecture or an execution-throughput fix.
- Parallel fresh sibling acquisitions already waiting at first acceptance retain
  their own pre-execution cancellation. Current audited routes use an outer fence
  or one inner acquisition; accepted executing/nested work is never cancelled by
  response loss.
- Validation in progress: 30 focused PostgreSQL/HTTP/storage/image tests passed;
  apiDoc smoke and security inventory passed. Independent review found no blocker.
- Stable compatibility: three-way application onto 7aa47b91 needs one additive
  declaration conflict resolved by retaining BOTH controlContexts and admissions.
  Preserve the stable control pool, control-lock helpers and retention changes
  during release integration; do not replace the stable file wholesale.
- Stable-base compatibility verification passed: 14 PostgreSQL/HTTP cases on
  7aa47b91 with the additive patch and both control/admission contexts preserved.
- Full Docker verification uses an exact-source test image layered over the
  preinstalled test dependency image: package.json and yarn.lock SHA256 match.
  Standard cold dependency build failed on Yarn cache extraction/network, so no
  package versions were changed to bypass it. Source fingerprints were compared
  inside the test image before the run.

- Follow-up delivery is tracked in [#1565](https://github.com/galtproject/geesome-node/issues/1565): durable worker stages and reserved GC admission.
- Additional necessity review found the deployed adapter uses unpinned add followed
  by a separate pin RPC. Even awaited pinning has a between-RPC GC window. Kubo's
  native pinned-add lock can close that adapter gap; our PG fence does not protect
  against raw daemon/manual GC. Before adding a larger lifecycle framework,
  evaluate GC-safe atomic pinned writes in geesome-libs, then append-only immutable
  publication with explicit queued retirement. Automatic cross-SQL/IPFS reclamation
  still needs reference/retirement coordination; pins are not owner reference counts.
  The present admission fix remains valid and preserves existing safety while this
  simpler policy is evaluated. Official source: Kubo v0.42.0 core/coreunix/add.go,
  gc/gc.go and core/coreapi/pin.go. The adapter implementation is in library PR #166; this backend PR consumes its compatibility commit.

## Minimal pinned-write implementation (#1566)
- Implemented Kubo pinned file/directory/JSON-object import with explicit recursive
  pin confirmation in geesome-libs, then consumed immutable compatibility commit
  f990ffd, followed by e163700 for independent pin-proof policy. This preserves the previous crypto/helper base instead of introducing
  unrelated master additions. Library PR #166 replaces the exploratory draft #165.
- Kept existing immutable publication, default-retain policy and explicit retirement
  queue. No global barrier is removed; MFS and cross-SQL/IPFS deletion races retain
  application exclusion. No new lifecycle framework was introduced.
- Moved node RPC deadline/fence-loss cancellation onto imports because the helpers
  no longer invoke the separate addPin path. Local encoder fingerprint still
  matches the original fifty-site journal (Sharp 0.35.5 / vips 8.18.7).
- First broad Docker run: 910 passed, 38 pending, 5 failed. Three tests encoded the
  former admission contract and were updated to assert typed bounded refusals, no
  late receipts and explicit retry. The two chat attachment failures reproduced
  on exact pre-change admission source in a separate baseline run (0 pass / 2 fail).
- A subsequent affected-path run exposed a multipart test fixture awaiting a
  callback after nonblocking worker-lock refusal. Replaced that unbounded fixture
  wait with bounded claim retries, keeping all disconnect/capacity assertions.
- Final compatibility-base Docker verification passed: 49 tests, 3 pending. It covers real native GC, pinned imports/CID stability, HTTP admission, detached GC lifetime, multi-owner uploads, archive/render/retirement and replay. The full suite was not repeated after the focused fixes; the broad run and exact-base chat baseline remain recorded above.

## User-flow compatibility implementation

Source of truth: storage user-regression review dated 2026-11-05. Keep PR #1564
and library #166 draft while these acceptance gaps are addressed.

Parallel write scopes:
- Backend admission owner: lifecycle/API adapter and audited route registrations,
  admission HTTP tests, route contract docs. Legacy requests retain the previous
  budget; supported clients opt into a bounded short budget. Mark only proven
  pre-execution refusals, preserve disconnect protection, and test actual control
  routes/GC refusal without relaxing auth or business-effect assertions.
- MG foreground owner: Uploading/GeesomeLight, affected settings/crop/paste UI and
  frontend tests. Preserve context through waiting/Stop; unknown transport outcomes
  reconcile read-only or surface unknown, with no automatic new upload POST.
- Library proof owner: bounded independent proof checks and safe read-only retry,
  without a second import or weaker pin guarantees. Root coordinates import budget.
- Coordinator: MG backend client/BFF opt-in/metadata, separate import policy, real
  API/Docker UI integration, documentation, review, final commits and pushes.

Contract: X-Geesome-Storage-Admission-Ms opts into a 1..3000ms admission budget;
legacy budget remains 10000ms. Typed HTTP pre-execution refusals carry explicit
admissionRejected=true and executionStarted=false only at an audited boundary.
Never infer rejection from generic 503, offline, timeout or lost response. Keep
legacy safe refusal support narrowly scoped to the audited upload route.

Import budget is separate from the old 120s pin-only budget, caller-configurable
within a documented cap; pin proof has its own short bound, inherits caller/fence
cancellation, and can retry reads of the same CID without importing again.

Implementation follow-up:
- Legacy HTTP admission restored to 10 seconds; supported clients explicitly opt
  into 1..3000ms. Safe-refusal markers are privately bound to the current HTTP
  admission signal, including audited handler-owned replacement admission.
- Authenticated SQL-only login/post/content/group/site-list controls bypass writer
  admission while retaining their existing permission checks. Internal replacement
  calls retain the prior waiting policy; HTTP first admission refuses maintenance.
- Whole-import deadline defaults to 30 minutes (environment cap 24 hours), separate
  from the 120-second pin-proof policy in immutable library commit e163700.
- Proof checks retry transient reads only, max three checks/one deadline/no second
  import. Actual Kubo tests cover transient proof recovery and permission failure.
- Tests that intentionally require a 3-second refusal now send the explicit header;
  diagnostics assert correlated acquire/release and bounded output, not log count.
- Frontend retains upload context/file/crop through waiting and Stop. Lost response
  without receipt blocks replay; known 4xx preserves its useful original reason.
  Crop cancellation cannot cache deferred old bytes after selecting a new image.

Final user-flow compatibility verification (2026-11-05):
- Exact-source Docker affected-path suite: 62 passing, 3 pending. Includes actual
  PostgreSQL/HTTP acquisition, audited controls under saturation/GC, same-key
  receipts, 30 uploads across owners, pinned Kubo imports/native GC, transient and
  denied proof, archive/render/retirement, cancellation and no late execution.
- Image tests now explicitly opt into short admission where their clients have
  five-second deadlines. Two failures from the earlier snapshot were stale test
  expectations and pass in this final run; business safety assertions were kept.
- Source/package/lock/library SHA256 match inside the test image (8 checked files).
  Dependency image reuse limitation remains recorded above. apiDoc generation,
  security route inventory and diff check passed. Independent backend review
  found no further blocker. Full broad suite was not rerun; existing baseline
  chat attachment failures remain outside this patch.
- No production deployment/image publication or batch resume. Merge library #166,
  backend #1564 into dev, then reviewed stable promotion preserving control and
  retention code; publish exact-commit image and use the standard updater.
