# Image saving, site replacement and local IPFS retirement

Tracking: [implementation #1382](https://github.com/galtproject/geesome-node/issues/1382), [planning #1380](https://github.com/galtproject/geesome-node/issues/1380), [Microwave Girls #595](https://github.com/MicrowaveDev/microwave-girls/issues/595).
User decisions: 22 October 2026. Implementation verified locally; merge/deployment remain user-controlled. No production files/pins were removed.

## Contents

- [Active simplification](#active-simplification--completed)
- [Requirements](#requirements)
- [Measured evidence](#measured-evidence)
- [Saving contract](#saving-contract)
- [Replacement and cleanup](#replacement-and-cleanup)
- [Workstreams and verification](#workstreams-and-verification)
- [Deployment](#deployment)

## Active simplification — completed

Latest instruction (22 October 2026): remove the separate `imageOptimization`
subsystem and reduce its five models. The user approved the redistribution below,
then explicitly requested recording it here so execution survives context compaction.
The responsibilities below are implemented in the existing modules. Baseline test
results for `326f0861` are kept separately from this refactor's verification.

### Frozen requirements

- Keep `optimize=true` in existing save-file/save-data, existing per-file operation
  queues and reusable full-size/preview WebP results. No image batch subsystem.
- Microwave Girls rebuild removes eligible old originals, previews, old site and
  **old archive automatically**, after the replacement site/archive and Post/alias
  acknowledgment are ready. No checkbox or additional UI status paragraphs.
- Preserve shared/foreign/pinned/active-job data, actual local Kubo GC and offline
  absence proof, crash recovery, replay/CAS and protection against late writes.
- Existing publisher API contracts should remain usable. Its separate numeric/
  manifest aliases and migration are consumer state and are not the five models
  being removed from GeeSome.
- No production deletion/deployment for validation; user owns all PR merges.

### Approved destination of responsibilities

| Current model/responsibility | Refactor target |
| --- | --- |
| `imageRendition` | Optimization policy/provenance and source→saved-result mapping on existing Content metadata/relations, managed by `content`. Preserve reuse without another lossy encode. |
| `imageReplacement` | Existing userOperationQueue/userAsyncOperation records hold accepted inputs, status, renderer/cutover/cleanup checkpoints and error. No new replacement table. Ensure maintenance cannot purge receipts needed for recovery/replay. |
| `imageSiteRevision` | Keep one useful version model under `staticSiteGenerator` (CID, owner, exact MFS work path, associated replacement operation). |
| `imageOptimizationReference` | Derive temporary holds from active existing jobs and their frozen inputs/checkpoints, integrated into the existing storage-reference checks. Do not drop holds without replacing their safety function. |
| `retiredStorage` | Remove the permanent global CID ban. Keep only a temporary write fence for pending destructive work; intentional retirement may mark the old Content record so restore of that record cannot revive incomplete assets. A legitimate new upload of identical bytes must not be banned forever. |

Saving belongs in `content`; revision/render/cutover belongs in
`staticSiteGenerator`; physical retirement/GC belongs in existing storage management;
job persistence/execution belongs in `asyncOperation`. A file helper/service inside
those modules is acceptable; a renamed standalone image-optimization subsystem or
an ORM facade over five replacement models is not the intended simplification.

### Execution order and completion checklist

1. Read existing async-operation schema/processor/retention and reference-source
   registration. Confirm open PR/base state. Continue the existing feature branch
   and tracking issue #1382 / PR #1383; do not rewrite pushed history.
2. Persist Content optimization provenance with owner/source/version checks and
   concurrency-safe admission to existing resave queue. Keep old-source replay
   after retirement and repeated optimized-output reuse.
3. Store site replacement state in existing operation records. Use indexed queue
   identity/request hashes and explicit CAS; decide numeric existing queue IDs vs
   UUID compatibility after checking Microwave Girls consumers. Prevent generic
   startup/retention cleanup from losing long-running or historical receipts.
4. Move the revision model and renderer hooks into staticSiteGenerator. Preserve
   isolated MFS roots, render hash excluding asyncOperationId, ready replay and
   terminal-state protection.
5. Replace reference-table holds with active-job holds (including frozen sources,
   previous site/archive, resaves, competing replacements and malformed/unknown
   jobs conservatively). Release only the current operation's holds at its saved
   detach checkpoint. Integrate this into shared-root preflight and GC rechecks.
6. Move retirement/GC to storage management and replace RetiredStorage guards with
   pending-work fences plus per-Content retirement/restore rules. Preserve other
   owners/catalog/metadata/pins, both CID encodings, GC cancellation on lost fence,
   retry checkpoints and no GC when nothing was unpinned.
7. Remove old module registration/types/routes wiring and all four unnecessary
   model definitions/references. Register compatible API handlers in their owners;
   update publisher only if the contract actually changes (GeeSome first).
8. Update this plan, implemented docs, apiDoc and security/scalability inventories.
   Test incrementally: codec/provenance/references, real PostgreSQL operation
   admission/replay/retention and render claims, real disposable Kubo removal of
   originals/previews/site/**archive**, shared MFS-only roots, repeated rebuild,
   lost fence, recovery. Add a regression for re-uploading identical retired bytes.
   Re-run publisher compatibility/SQL/browser evidence only when impacted.
9. Review final diff against these requirements, commit/push GeeSome and update
   PR #1383 title/body around the final design. Commit/push any publisher changes
   on dev, update only eligible hub pointers. Never merge PRs.

### Delivery checkpoint

- Completed the approved redistribution and checks. GeeSome branch:
  `codex/image-optimization-retirement`, PR #1383 / issue #1382. User merges the PR;
  no production deployment or deletion was performed. Microwave Girls needs no
  source change for this refactor; its existing consumer accepts queue IDs.
- Removed the standalone module and all five old model definitions. The only new
  product table is `staticSiteRevision` under staticSiteGenerator. Content owns
  policy/provenance; ordinary queue/operation rows own workflow state; storageSpace
  owns retirement/GC. No separate image batch or additional execution queue.
- Preserved short transactional admission, checkpoint CAS, successive live receipt
  updates, per-render claims and replay. Workflow receipts and waiting operations
  survive ordinary 30-day cleanup. Active inputs provide bounded temporary holds;
  unknown/overflowing work conservatively blocks deletion.
- Replaced permanent CID bans with pending-work gates and intentional per-Content
  retirement markers. Old records cannot be restored (checked before network I/O),
  while a new upload of identical bytes succeeds after cleanup. New references on
  resumed GC get actual pins; no eligible candidates means no global GC.
- Verification: broad PostgreSQL/Kubo run **72 passing**, including publisher HTTP
  paths/auth, optimization, archives, old image/preview/site/archive collection,
  shared roots, repeated rebuild reuse, lost fence and operation retention.
  Final-source focused rerun: **32 passing**, including successive checkpoints
  after the last wrapper fix; details are in the final verification section below.
- Host codec/reference/queue/cleanup checks: **22 passing**. Bootstrap/background
  worker/render checks: **12 passing**. Microwave Girls membership: **67 passing**.
  apiDoc generated; security and scalability inventories checked and reviewed.
- Repo-wide Docker suite and browser screenshot suites were not repeated for this
  module/model-only refactor. Earlier baseline evidence remains below; it is not a
  claim that the entire repository suite passed against this source.
- Preserve unrelated dirty hub/submodules. This topic branch is not eligible for
  a hub pointer update until the user merges it into the expected base branch.

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
- Inputs bounded to 64 MiB/40 million pixels, single-page supported image formats. Corrupt/animated data fails explicitly. Queue admission is serialized by the source Content row, execution by a cross-process PostgreSQL advisory lock.
- Generic uploads do not opt into full-image conversion implicitly. Generation import sets the flag; new membership publication also prepares missing renditions through the same mechanism.

## Replacement and cleanup

1. Microwave Girls freezes owned ordered source IDs, previous site/Post if rebuilding, and deletion flag in `POST /v1/user/site-replacements`; a stable request key reuses the receipt and rejects changed inputs. Capabilities are checked before preparation.
2. Submit each image to ordinary save-data. Persist each queue/result receipt before advancing; no second execution queue or global card lock. Resolve saved aliases by owner for old numeric Generation imports and manifest IDs without rewriting immutable Generation provenance.
3. Renderer resolves ready saved contents using replacementId. It uses a fresh `/ssg-revisions/UUID` directory, copies only selected files, and records/pins the immutable root. A per-replacement advisory claim and render hash prevent parallel/changed render work. Ready replays return the recorded root; CAS prevents late finish from overwriting finalized state.
4. Wait for the archive of that exact root. Atomically install the Microwave Girls numeric/manifest alias receipt. Update the same upstream Post's attachments, known non-cropped previews and page URL, preserving all other metadata. Then update the local page URL/version and acknowledge alias hash, Post ID and root through finalize.
5. GeeSome verifies renderer receipt, immutable clientData, archive readiness, Post attachment order/page URL and consumer acknowledgment. `deleteReplacedFiles=false` completes without removing old files. True enters `retiring`; publication success and cleanup status are distinct.
6. Retirement requires owner authorization, a private unencrypted membership group, unchanged finalized publication, and no active/unknown source work. PostgreSQL shared producer/exclusive cleanup fences cover storage writers and GC; no long database transaction spans media work. Pending-cleanup CID gates prevent late writes until the operation completes. A retirement marker blocks restoration of the old Content record; a new upload of identical bytes remains allowed after cleanup.
7. Check Content, preview, catalog, Post metadata, static site/binding/history, archive, derived/DAG references, user/remote pins and other preparation references across CID v0/v1. Only exact owned revision paths and rows may be detached. Preflight external root references before MFS unlink. Pin retained/shared roots physically so global GC cannot remove SQL-only retained objects. Move eligible own catalog entries and recalculate folder sizes; other-owner catalog rows block retirement.
8. Retire old archive mapping with owner/CID compare-and-swap. Remove only verified obsolete MFS revision paths; unpin eligible CID v0 AND v1 variants. Persist per-root checkpoints. Retry cleanup without resaving/rebuilding. Recheck references before resumed GC and restore pins for new blockers.
9. Coalesce Kubo repository GC. Abort GC when fence connection is lost; check fence before terminal updates. Verify absence with offline block.stat (normal block.stat can fetch the network). Report GC time, collected blocks, before/after repo bytes and per-root absent/retained status. Unpin alone is not disk reclamation; do not claim an exact saving from logical object sizes.

Shared sources/sites can remain pinned; deletion is a best eligible cleanup, never a promise to remove files used elsewhere. Removing old files can break old immutable links intentionally after cutover. GC affects unpinned blocks on this local node only; third-party copies are outside this contract.

## Workstreams and verification

Dependency order: GeeSome save/preview and retirement contracts first, Microwave Girls integration second. Original agent owns integration and delivery. Independent audit has read-only scope.

| Workstream | Inputs / write scope | Completion evidence |
| --- | --- | --- |
| Saving | content, convert/preview drivers, Content provenance | full-resolution/preview dimensions, MIME/extension, alpha, EXIF, corruption/animation rejection, repeated-output reuse |
| Replacement/retirement | existing asyncOperation/storageSpace, SSG revision model, archive owner-CAS | real PostgreSQL/Kubo: new WebP site/archive; cleanup true/false; shared MFS-only root; v0/v1 unpin; offline old archive absence; late render rejection |
| Publisher | membership workflow, Generation import/read aliases, SQL migration | existing membership/Generation regressions, real SQL alias isolation/replay/conflicts, upgrade browser flow desktop/narrow |
| UX | Posts card rebuild button with automatic cleanup | optimization/render/upstream queue/cleanup states, automatic cleanup flag, no checkbox or extra status paragraphs, inspected screenshot sidecars/images |
| Delivery | docs, route inventory, commits/PR | apiDoc smoke, inventory checks, committed/pushed intended branches, user-owned GeeSome merge |

Audit findings incorporated: separate batch removed at user request; fresh revision directories prevent stale PNGs in new archives; full root-reference preflight precedes MFS unlink; shared roots are pinned before GC; render claims/CAS prevent terminal-state rewind; GC receives fence cancellation; JSON journals are cloned before updates; both pin CID encodings are removed; local absence checks are offline.

Verification records are summarized in the implementation PR. Temporary logs and screenshots are evidence only and stay out of Git. No production cleanup is used as a test.

## Deployment

1. Merge GeeSome implementation into dev (user action), deploy an exact tested version with content/asyncOperation and the improve pack's staticSiteGenerator/archive/storageSpace modules enabled. There is no imageOptimization module; remove that name from an explicitly configured MODULES list. The only new lifecycle table, staticSiteRevision, uses model sync; no migration is needed for the four removed, unreleased model definitions.
2. Apply Microwave Girls `20261022000100-create-image-asset-aliases.cjs` before starting the updated app. Build/restart through the documented server updater; use ordinary release promotion only after user approval/merge flow.
3. Upgrade requires GeeSome capabilities contract 1 with resave support, and local Kubo retirement support when deletion is selected. An old backend fails before source cleanup. Rollback must preserve publisher aliases, Content provenance/retirement markers, existing queue/operation receipts, revision rows and saved new files; never restore old deleted Content pointers by discarding the receipts.
4. Initial production verification should rebuild a small set without deletion, inspect site/archive and selected previews, then verify automatic cleanup for an owned set. Production deletion is not part of local development verification.

## Final verification record

22 October 2026, completed module/model simplification: broad Docker validation
passed **72 tests**. After the final successive-checkpoint fix, a rebuilt source
snapshot passed **32 focused PostgreSQL/Kubo/codec/reference/queue tests**. These
verify removal of the old model registrations, numeric publisher API receipts,
owner/scoped-key boundaries, concurrent admission and checkpoint CAS/retention,
actual original/preview/site/archive removal, shared MFS-only roots, repeated
optimized-byte reuse, identical-byte re-upload and old-record restore rejection,
lost-fence cancellation and skipping GC after new references retain all candidates.
Host checks passed 22 policy/reference/queue/cleanup tests plus 12 bootstrap,
background-worker and renderer tests. Microwave Girls membership passed 67 tests
without consumer source changes. apiDoc generation and security/scalability checks
passed. Full repository and browser suites were not repeated for this refactor;
no production deployment/deletion was performed.

Baseline `326f0861`, before simplification: PostgreSQL/Kubo run passed **55 tests**, covering
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
