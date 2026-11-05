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

- Implementation: HTTP context uses a three-second absolute admission budget,
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
