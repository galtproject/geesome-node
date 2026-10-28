# Bounded image preview policy (#1447)

## Contents

- [Contract](#contract)
- [Work order](#work-order)
- [Verification](#verification)

## Contract

Ordinary static-image previews use WebP quality 85/effort 3 and fit within
512/1024/2048 square bounds without enlargement. Generate each effective size
once per preview set. Preserve existing stored preview CIDs and immutable sites;
reads/site rebuilds reuse ready content. Full-resolution publication image policies
are separate and unchanged. Icons use existing raw uploads without previews.
Bound active encodes, waiting work, source bytes/pixels, and encoding/input time.
No environment switches, model migrations, production deployment or deletion.

## Work order

1. GeeSome driver: shared policy, bounded execution and cancellation; content path:
   reuse results for equal effective dimensions. Write scope: drivers/content/tests.
2. MicrowaveGirls: raw icon multipart uploads and regression tests, preserving
   existing CID reuse. Write scope: membership icon publisher/tests/docs only.
3. Verify actual Sharp output and cleanup/capacity behavior, upload/content/site
   integration and unchanged full-image codecs; update evidence and open PR.

The companion change can be implemented independently; deploy GeeSome then the
companion. The primary agent owns integration and delivery. No subagents required.

## Verification

Use real portrait/landscape/alpha/orientation images, duplicate small rendition
counts, injected errors and stalled input. Assert queue rejection/recovery and
original bytes unchanged. Check raw multipart fields and saved CID reuse. Run
content/static-site regressions and relevant SQL/Kubo contracts with disposable
services. Do not add timing-sensitive speed assertions or regenerate old CIDs.

## Delivery evidence

Implemented the shared quality/effort/bounds policy, a two-slot process-wide
metadata/encode queue with 32 bounded waiters, 10-second queue/active deadlines,
native Sharp timeout, 64 MiB/40 MP source limits, and per-set stored-result reuse.
The raw icon companion changes only membership multipart fields and its tests.
There are no schema changes, environment variables or automatic regeneration.

55 targeted preview/content/header/API/codec tests pass. They cover real alpha,
orientation, portrait/landscape bounds, exact encoder output, queue overflow and
recovery, queue expiry, stalled input, oversized bytes/pixels, late filesystem
errors after rejection, one/two effective rendition sets, retry after failure
and reuse of existing stored CIDs. The gallery fixture was updated to exercise
its real viewport loader rather than expecting SSR to fetch images eagerly.

46 PostgreSQL/Kubo/HTTP/image-saving/retirement/static-client checks pass, including
a raw multipart icon upload with original-byte equality and idempotent Content
reuse. Watermarked preview expectations now follow the new 1024-long-side bound;
full-image dimensions remain unchanged. Driver TypeScript checking and security/
scalability inventories pass. All 101 MicrowaveGirls membership tests pass.

The full integration run additionally timed out in the unchanged test
`releases ten aborted multipart requests and accepts ten subsequent uploads`.
The failure was reproduced on original dev 5130834b in an isolated source copy
with disposable PostgreSQL/Kubo (diagnostic timeout 30 seconds). The final targeted
run excludes that single pre-existing test; do not report the full suite as green.
No production updates, publication retries or data cleanup were performed.
