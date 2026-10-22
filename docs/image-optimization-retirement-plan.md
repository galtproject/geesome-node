# Image saving, site replacement and local IPFS retirement

Tracking: [implementation #1382](https://github.com/galtproject/geesome-node/issues/1382), [planning #1380](https://github.com/galtproject/geesome-node/issues/1380), [Microwave Girls #595](https://github.com/MicrowaveDev/microwave-girls/issues/595).
User decisions: 22 October 2026. Implementation is under verification; no production files/pins were removed.

## Contents

- [Requirements](#requirements)
- [Measured evidence](#measured-evidence)
- [Saving contract](#saving-contract)
- [Replacement and cleanup](#replacement-and-cleanup)
- [Workstreams and verification](#workstreams-and-verification)
- [Deployment](#deployment)

## Requirements

Optimize full-resolution publication images and previews during saving, then render a fresh site and prepare its archive. An explicit `deleteReplacedFiles` flag authorizes removal of eligible replaced originals, previews, old site and old archive from our local IPFS node, after verified cutover. Shared content stays available. GeeSome owns execution queues; Microwave Girls submits independent cards and tracks existing receipts. Keep publication dates, visibility, manual preview selection and crops.

Latest user steering: Microwave Girls cleans old files and archives by default after cutover, with no UI checkbox. The backend flag remains explicit in the protocol for controlled callers and tests.

The user simplified the original audited proposal: **there is no ImageOptimizationBatch model or batch endpoint**. Use existing save-file/save-data with an optimization flag and existing per-file operation queues. A site replacement receipt remains necessary for frozen inputs, render replay, publication acknowledgment and recoverable deletion; it does not schedule an additional image batch.

## Measured evidence

Inspected immutable site `QmYWQu4zcgiBCR5ztA4PYwMyCYXLRuWngxuwnjJVH929mE` using its `clientData.js`, downloaded first original/preview, and read-only Kubo `ls --size --resolve-type` on `geesome-test`. All 236 image entries matched the manifest; no missing entries.

| Files | Count | Bytes | MiB |
| --- | ---: | ---: | ---: |
| Original PNG | 118 | 304,550,153 | 290.44 |
| Medium PNG previews | 118 | 275,980,264 | 263.20 |
| Total image files | 236 | 580,530,417 | 553.64 |

Previews account for 47.54% of image-file bytes. This is the uncompressed image payload, **not a measurement of the final tar.gz size**; application assets and tar/gzip overhead are separate.

First original: content ID `48165`, CID `bafybeibb2bccl2bbb3c5cnsepca4nkgi3dwku3cbvk6jqdqzvzioi7r3n4`, PNG RGB 8-bit, 1344×1920, no alpha, 2,738,375 bytes. Medium preview: 1024×1463, 2,524,715 bytes. Generation parameters occupy only a few KB and do not explain the multi-MB sizes.

Same-resolution encoding measurements with Sharp 0.35.0, libwebp 1.6.0, libaom 3.14.1:

| First original encoding | Bytes | Reduction | Pixel-identical decoded RGB |
| --- | ---: | ---: | --- |
| PNG level 9, adaptive filtering, no palette | 2,591,928 | 5.35% | yes |
| WebP lossless, effort 6 | 2,030,470 | 25.85% | yes |
| WebP quality 95, effort 6 | 336,072 | 87.73% | no |
| WebP quality 90, effort 6 | 221,698 | 91.90% | no |
| JPEG quality 90, mozjpeg, 4:4:4 | 425,714 | 84.45% | no |
| AVIF quality 80, effort 6, 4:4:4 | 188,339 | 93.12% | no |

The first preview encoded at its existing dimensions as WebP quality 85 is **112,182 bytes**, a **95.56%** reduction. The original-plus-preview pair becomes 448,254 bytes versus 5,263,090 bytes with full-size WebP 95 and preview WebP 85. This is one-image evidence, not a guaranteed whole-set ratio.

Inspected the full first image and 680×680 native-scale crops of the original, WebP 95/90/85, JPEG 90 and AVIF 80. Lossy versions slightly smooth fine texture; do not describe them as lossless. AVIF 80 took approximately 2.8 seconds versus 0.33 seconds for WebP 95 in this local sample; this is not a server throughput benchmark. Preserve orientation, transparency and color appearance through dedicated tests. Do not compare equal quality numbers across codecs as equal quality.

## Saving contract

- `POST /v1/user/save-file`, multipart `optimize=true`: ordinary save/convert/preview pipeline, full-resolution WebP quality 95 effort 6, EXIF orientation applied once, metadata stripped. No resolution reduction.
- `POST /v1/user/save-data`, JSON `{sourceContentId: 123, optimize: true}`: owned existing image resave; returns `status: queued`, the existing userOperationQueue id/asyncOperationId, or `status: completed` and saved Content. Poll ordinary operation-queue/async-operation endpoints. Queue module is `content-resave`.
- Preview driver stores WebP quality 85 at existing 512/1024/2048 tiers with no enlargement. Persist `previewExtension`/MIME correctly; gallery uses preview extension independently of the full image.
- Persist `publication-webp-v1` rendition provenance by owner/source CID/policy. Rebuilds and replays reuse the saved bytes; do not repeatedly lossy-encode optimized output. Unsupported new policies require a retained original, not another encode of a prior rendition.
- Inputs bounded to 64 MiB/40 million pixels, single-page supported image formats. Corrupt/animated data fails explicitly. Queue admission is serialized by the rendition row, execution by a cross-process PostgreSQL advisory lock.
- Generic uploads do not opt into full-image conversion implicitly. Generation import sets the flag; new membership publication also prepares missing renditions through the same mechanism.

## Replacement and cleanup

1. Microwave Girls freezes owned ordered source IDs, previous site/Post if rebuilding, and deletion flag in `POST /v1/user/site-replacements`; a stable request key reuses the receipt and rejects changed inputs. Capabilities are checked before preparation.
2. Submit each image to ordinary save-data. Persist each queue/result receipt before advancing; no second execution queue or global card lock. Resolve saved aliases by owner for old numeric Generation imports and manifest IDs without rewriting immutable Generation provenance.
3. Renderer resolves ready saved contents using replacementId. It uses a fresh `/ssg-revisions/UUID` directory, copies only selected files, and records/pins the immutable root. A per-replacement advisory claim and render hash prevent parallel/changed render work. Ready replays return the recorded root; CAS prevents late finish from overwriting finalized state.
4. Wait for the archive of that exact root. Atomically install the Microwave Girls numeric/manifest alias receipt. Update the same upstream Post's attachments, known non-cropped previews and page URL, preserving all other metadata. Then update the local page URL/version and acknowledge alias hash, Post ID and root through finalize.
5. GeeSome verifies renderer receipt, immutable clientData, archive readiness, Post attachment order/page URL and consumer acknowledgment. `deleteReplacedFiles=false` completes without removing old files. True enters `retiring`; publication success and cleanup status are distinct.
6. Retirement requires owner authorization, a private unencrypted membership group, unchanged finalized publication, and no active/unknown source work. PostgreSQL shared producer/exclusive cleanup fences cover storage writers and GC; no long database transaction spans media work. Retired CID tombstones prevent reintroducing removed files through Content writes.
7. Check Content, preview, catalog, Post metadata, static site/binding/history, archive, derived/DAG references, user/remote pins and other preparation references across CID v0/v1. Only exact owned revision paths and rows may be detached. Preflight external root references before MFS unlink. Pin retained/shared roots physically so global GC cannot remove SQL-only retained objects. Move eligible own catalog entries and recalculate folder sizes; other-owner catalog rows block retirement.
8. Retire old archive mapping with owner/CID compare-and-swap. Remove only verified obsolete MFS revision paths; unpin eligible CID v0 AND v1 variants. Persist per-root checkpoints. Retry cleanup without resaving/rebuilding. Recheck references before resumed GC and restore pins for new blockers.
9. Coalesce Kubo repository GC. Abort GC when fence connection is lost; check fence before terminal updates. Verify absence with offline block.stat (normal block.stat can fetch the network). Report GC time, collected blocks, before/after repo bytes and per-root absent/retained status. Unpin alone is not disk reclamation; do not claim an exact saving from logical object sizes.

Shared sources/sites can remain pinned; deletion is a best eligible cleanup, never a promise to remove files used elsewhere. Removing old files can break old immutable links intentionally after cutover. GC affects unpinned blocks on this local node only; third-party copies are outside this contract.

## Workstreams and verification

Dependency order: GeeSome save/preview and retirement contracts first, Microwave Girls integration second. Original agent owns integration and delivery. Independent audit has read-only scope.

| Workstream | Inputs / write scope | Completion evidence |
| --- | --- | --- |
| Saving | content, convert/preview drivers, rendition model | full-resolution/preview dimensions, MIME/extension, alpha, EXIF, corruption/animation rejection, repeated-output reuse |
| Replacement/retirement | new lifecycle module, SSG revisions, archive owner-CAS | real PostgreSQL/Kubo: new WebP site/archive; cleanup true/false; shared MFS-only root; v0/v1 unpin; offline old archive absence; late render rejection |
| Publisher | membership workflow, Generation import/read aliases, SQL migration | existing membership/Generation regressions, real SQL alias isolation/replay/conflicts, upgrade browser flow desktop/narrow |
| UX | Posts card rebuild button with automatic cleanup | optimization/render/upstream queue/cleanup states, automatic cleanup flag, no checkbox or extra status paragraphs, inspected screenshot sidecars/images |
| Delivery | docs, route inventory, commits/PR | apiDoc smoke, inventory checks, committed/pushed intended branches, user-owned GeeSome merge |

Audit findings incorporated: separate batch removed at user request; fresh revision directories prevent stale PNGs in new archives; full root-reference preflight precedes MFS unlink; shared roots are pinned before GC; render claims/CAS prevent terminal-state rewind; GC receives fence cancellation; JSON journals are cloned before updates; both pin CID encodings are removed; local absence checks are offline.

Verification records are summarized in the implementation PR. Temporary logs and screenshots are evidence only and stay out of Git. No production cleanup is used as a test.

## Deployment

1. Merge GeeSome implementation into dev (user action), deploy an exact tested version with imageOptimization enabled by the improve module pack. Existing new tables use model sync; this change does not require a new-table migration in GeeSome.
2. Apply Microwave Girls `20261022000100-create-image-asset-aliases.cjs` before starting the updated app. Build/restart through the documented server updater; use ordinary release promotion only after user approval/merge flow.
3. Upgrade requires GeeSome capabilities contract 1 with resave support, and local Kubo retirement support when deletion is selected. An old backend fails before source cleanup. Rollback must preserve alias/retirement tables and saved new files; never restore old deleted Content pointers by discarding the receipts.
4. Initial production verification should rebuild a small set without deletion, inspect site/archive and selected previews, then verify automatic cleanup for an owned set. Production deletion is not part of local development verification.

## Final verification record

22 October 2026: final-source PostgreSQL/Kubo run passed **55 tests**, covering
HTTP/proxy assets, save/converted metadata, archives, tombstones, optimization and
retirement, renderer queue/replay and storage-reference guards. Host codec/SSR/
reference tests passed **14 tests**. apiDoc generation and security/scalability
inventory checks passed. Microwave Girls passed 67 membership, 3 PostgreSQL,
43 Generation and 53 frontend tests, plus 2 Docker browser scenarios and visual
review of all 16 mapped desktop/narrow captures.

An earlier full Docker snapshot completed with 680 passing, 11 pending and 7
failures: three test-proxy alias failures, one legacy JPEG-preview expectation,
and three assertions comparing human error text to a code. Corrected the proxy
invocation/expectations; every affected suite passes in the final 55-test run.
The entire 26-minute suite was not repeated after these scoped corrections.
Disposable fixtures use unique source bytes to avoid unrelated old MFS roots
retaining identical test CIDs across warm reruns. Real GC verifies offline old
original/PNG-preview/site/archive absence; shared roots remain available.
