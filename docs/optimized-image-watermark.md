# Optimized image watermark repair

## Contents

- [Contract](#contract)
- [Implementation](#implementation)
- [Verification and delivery](#verification-and-delivery)

## Contract

User request: Generation imports must include the same domain strip as Upload;
Posts rebuild must add it to existing unmarked full images and previews. Keep
optimization, existing queues, owner isolation and safe old-image/archive cleanup.
Do not add repeated strips or recompress a completed marked rendition on rebuild.
Tracking: GeeSome #1406 and Microwave Girls #613.

## Implementation

The save pipeline accepts only the existing imageWatermark convert driver with
optimize=true; other drivers remain rejected. Normalize/freeze its text, color,
background, font, spacing and size ratio. Compose before the final WebP encode,
using only lossless intermediate pixels. Previews derive from the saved full file.
Ordinary Upload keeps its output format and records the same watermark identity.

Content properties persist watermark provenance alongside the unchanged
publication-webp-v1 optimization receipt. A required marked resave cannot reuse an
unmarked optimized result. The normal content-resave queue freezes the driver;
replacement admission hashes/freezes it too and rendering requires matching
marked mappings. No new queue, model or migration is introduced.

For legacy Upload files without provenance, compare the expected bottom band and
foreground text pixels with compression tolerance. A plain black edge is not
sufficient. Matching is intentionally limited to this layout; arbitrary edited,
resized or cropped watermarks are not guaranteed to match. Recorded identity is
the normal path; visual matching is a legacy fallback only.

Microwave Girls uses the shared Upload template for Generation imports and the
owned resource identity/domain for rebuild. Capability watermark=true prevents
an old backend from silently accepting an unmarked replacement. Accepted old jobs
retain immutable inputs; a fresh rebuild after rollout repairs their output.

## Verification and delivery

Verified on 2026-10-23:

- Docker PostgreSQL/Kubo image-saving, retirement and multipart regression: 27
  tests passed. Existing old-site/image/archive retirement and shared-reference
  protection remain green.
- Final focused Docker run: five tests passed, including real multipart
  save-file with optimize=true plus the JSON watermark driver, unmarked optimized
  source repair, actual full-image/preview strip pixels and generated site CID
  mappings. A changed driver conflicts with an accepted replacement key. Repeated
  marked resaves retain the same CID without another queue job or encode.
- Four host driver tests passed, covering legacy JPEG and WebP strips, purple
  EraOfWave and translucent white EraOfMeat text, black-edge rejection, and escaped
  text markup. Legacy matching is a bounded heuristic, not general logo detection.
- Security route inventory regenerated/reviewed with no permission changes and
  checked clean; full apiDoc parsing to temporary output passed.
- Companion Microwave Girls contract tests: 19 focused gateway/preparation tests,
  71 membership tests and three PostgreSQL scenarios passed. Browser publication
  regression/evidence is documented in the companion publication workflow.
- Full repository suite was not run. No production cleanup or deployment.

Deploy GeeSome first, then Microwave Girls. No migration is required. Start a fresh
rebuild for completed old unmarked sites; accepted old jobs keep their receipts.
