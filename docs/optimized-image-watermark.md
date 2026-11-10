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

The save pipeline uses the imageOptimize convert driver. Its optional watermark
parameter accepts the existing imageWatermark driver. Normalize/freeze its text,
color, background, font, spacing and size ratio. Compose before the final JPEG quality 95 encode for the new policy,
using only lossless intermediate pixels. Previews derive from the saved full file.
Ordinary Upload keeps its output format and records the same watermark identity.

Content properties persist watermark provenance alongside the unchanged
versioned publication image receipt. A required marked resave cannot reuse an
unmarked optimized result. The normal content-resave queue freezes the driver;
replacement admission hashes/freezes it too and rendering requires matching
marked mappings. No new queue, model or migration is introduced.

GeeSome does not inspect pixels to infer watermark presence. A supplied driver
explicitly requests addition; Content provenance skips an already recorded mark.
Ordinary legacy Upload resaves omit the driver and preserve their existing strip.
Microwave Girls supplies the driver only for three explicitly identified historical
unmarked sites, while fresh Generation imports always supply the owner driver.

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

## JPEG originals and WebP previews (#1408)

New Microwave Girls imports/rebuilds explicitly request
`driver.params.policy: publication-jpeg95-v1`. Full images use JPEG
quality 95, 4:4:4 chroma sampling for colored watermark text, and a white
background for transparency; the existing WebP preview encoder stays unchanged.
File suffix, MIME, Content metadata, generated site and archive use JPEG.

Top-level optimize/imagePolicy fields are rejected. Capabilities advertise the
supported driver profiles; new Generation imports and replacement admissions
require the imageOptimize driver and JPEG support before sending files or
creating receipts. Existing jobs without a saved policy continue WebP. There is no PNG
policy: the user's final choice supersedes the earlier PNG proposal.

Content properties retain receipts per policy while preserving the legacy
publicationImage field. A WebP result cannot satisfy a JPEG request; switching
format runs once, then subsequent JPEG rebuilds retain the CID. The old WebP
receipt remains addressable for accepted legacy work while its content is still
retained. Converting an existing WebP to JPEG does not recover lost original
detail. Automatic retirement keeps its existing cutover/reference protections.
No schema migration or new queue is needed. Final verification is recorded in
the delivery PR and companion publication workflow.

JPEG delivery verification (2026-10-23): 30 PostgreSQL/Kubo/parser/driver tests
passed, including actual JPEG MIME/suffix/bytes, 4:4:4 chroma, white transparency
background, WebP previews, watermark retention, separate WebP/JPEG receipts,
stable JPEG CIDs on repeated resaves, real multipart JPEG import and archive
entries containing .jpg originals plus .webp previews. Security route inventory
and full apiDoc smoke passed. Companion tests: 21 gateway/preparation tests,
71 membership tests, three PostgreSQL scenarios and four browser publication
cases passed. All 30 mapped desktop/narrow captures were reviewed. The browser
provider is mocked; actual encoded bytes were checked in the Kubo tests.

## Explicit historical exceptions (2026-10-23)

Removed `hasWatermarkBand` and all compression-tolerant pixel recognition.
Microwave Girls owns the historical CID list; GeeSome has no application-specific
exceptions or new flag. Existing Content watermark provenance and per-policy
receipts continue preventing repeated marking and encoding.

Verification: 30 Docker PostgreSQL/Kubo/parser/driver tests passed, including
legacy marked Upload without provenance/driver, explicit repair, stable repeated
CID, JPEG/WebP encoding, archive/site mapping and retirement regressions. Four
host encoder tests also passed after the helper rename to `addWatermark`.

## Driver-owned image optimization (2026-10-23)

The imageOptimize convert driver owns encoder/profile selection and limits.
Content contains publication/queue validation and receipts, without image codecs.
New requests use only:

```json
{"driver":{"name":"imageOptimize","module":"convert","params":{"policy":"publication-jpeg95-v1"}}}
```

Optional params.watermark is the existing imageWatermark driver envelope.
Top-level imagePolicy and optimize are rejected; no legacy request adapter or
fifth requestResave policy argument remains. New client admissions require
imageOptimizeDriver capability. Profile/version identifiers remain in Content and
frozen operation receipts to reuse the correct rendition without recompression.
Workers reconstruct the driver from accepted job snapshots; they never submit
legacy fields. Microwave Girls resumes saved preparation with the same frozen
profile and watermark using the new envelope. No new model, queue or migration.
The three historical unmarked site exceptions remain only in Microwave Girls.

Final verification after removing old-request support: 36 real Docker PostgreSQL/
Kubo/parser/driver tests and ten host codec tests passed. Direct driver upload,
resave and replacement work; top-level imagePolicy is explicitly rejected. Queued
work, stable repeated CIDs, marked previews, JPEG archive entries and automatic
retirement remain covered. Route inventory and full apiDoc parsing passed.
