# Image optimization, site replacement and local IPFS retirement

Status: audited implementation plan; no feature implementation or production deletion yet.
Tracking: [#1380](https://github.com/galtproject/geesome-node/issues/1380).
Source of truth: user decisions in this chat, 22 October 2026.

## Contents

- [Requirements and boundaries](#requirements-and-boundaries)
- [Measured evidence](#measured-evidence)
- [Current implementation audit](#current-implementation-audit)
- [Proposed persisted model and API](#proposed-persisted-model-and-api)
- [Workflow and recovery](#workflow-and-recovery)
- [Retirement and actual disk reclamation](#retirement-and-actual-disk-reclamation)
- [Implementation workstreams](#implementation-workstreams)
- [Verification and acceptance](#verification-and-acceptance)
- [Rollout and unresolved decisions](#rollout-and-unresolved-decisions)
- [Audit record](#audit-record)

## Requirements and boundaries

User requirements:

1. Optimize both the full-resolution published image and its preview. Preview-only compression leaves the original-image majority of the archive unchanged.
2. Create and persist optimized files during image saving/preparation. The HTML renderer consumes stored results; it does not encode images.
3. Support existing sets through a batch job before rebuilding. Return an ordered mapping from source content to optimized full-size and preview CIDs.
4. Rebuild the site using those results, with a new immutable link and an archive for that exact link.
5. With an explicit deletion flag, retire replaced files on **our local IPFS node**, including the **old archive**, to reclaim server disk space.
6. Switch the publication only after the replacement is complete. Preserve other users' files and shared/live publications.
7. GeeSome owns execution queues. Microwave Girls keeps per-card receipts/status and can submit several cards independently.

Implementation choices proposed by this plan:

- Preserve source content identity; create separate persisted publication renditions, not an in-place overwrite of a shared source Content record.
- Full-resolution rendition: WebP quality 95, effort 6, automatic EXIF orientation, no resizing. Preview: WebP quality 85, effort 6, existing size tiers, no enlargement.
- Version the policy and codecs. Quality numbers are codec parameters, not percentages of retained visual quality.
- Use `deleteReplacedFiles: false` by default; true includes eligible source images/previews, the replaced site, and its archive. It authorizes cleanup attempts after cutover, not deletion of shared files.
- Never delete source bytes during optimization. Source retention is a separate post-publication phase.
- Existing archives remain full copies of their sites. Do not silently exclude previews from a tar.gz to claim optimization.

Non-goals: regeneration on a GPU; deletion from third-party IPFS nodes; changing original resolution; silently optimizing every generic file upload; replacing the existing Post's title, visibility, character, publication date or manually selected/cropped previews.

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

## Current implementation audit

| Finding | Evidence | Required response |
| --- | --- | --- |
| Generation saves provider bytes unchanged. Its WebP 78 thumbnail is only for Studio cards. | [Generation storage](../../microwave-girls/app/services/imageGenerationStorage.ts), [GeeSome import](../../microwave-girls/app/services/imageGenerationGeesome.ts) | Optimize persisted publication files in GeeSome, not only local Studio thumbnails. |
| GeeSome previews keep the input format and metadata, at widths 512/1024/2048. | [Image preview driver](../app/modules/drivers/preview/image.ts) | Encode new previews explicitly as WebP and store correct MIME/extension. |
| Gallery preview URL uses original `extension`; copy code uses `previewExtension`. | [ContentList](../app/modules/staticSiteGenerator/site/public/pages/ContentList/index.js), [copyContentsToSite](../app/modules/staticSiteGenerator/index.ts) | Fix mixed PNG/WebP URLs and test real files, background requests and modal links. |
| Content-list generation reuses `/<staticId>-site`; it does not remove old files. | [prepareContentListForRender](../app/modules/staticSiteGenerator/index.ts) | Render each revision into an empty job-owned directory; otherwise PNGs remain beside new WebPs and re-enter the archive. |
| Site lookup by entity type/key does not explicitly scope the lookup by owner. | [getOrCreateStaticSite](../app/modules/staticSiteGenerator/index.ts) | Enforce owner/revision identity in replacement paths; never infer retirement ownership from an entity key alone. |
| Archive mapping protects both original/site and archive CID. No scoped retirement method exists. | [Archive module](../app/modules/archive/index.ts), [archive model](../app/modules/archive/models.ts) | Add exact-owner, exact-revision retirement, not `flushDatabase()` or a broad mapping delete. |
| Physical deletion helper calls unpin then `storage.remove(CID)`. That adapter calls MFS `files.rm('/ipfs/' + CID)`, not repository GC. | [StorageSpace](../app/modules/storageSpace/index.ts), installed `geesome-libs/src/JsIpfsService.ts` | Add an explicit tested local-retirement adapter. Do not treat current `remove(CID)` as disk reclamation. |
| Safety checks include Content/previews, derived manifests, StaticSite, ContentArchive, static bindings, pins and recorded DAG children. Reads are not a shared producer/cleanup transaction. | [Database](../app/modules/database/index.ts), [storage references](../app/modules/database/storageReferenceHelpers.ts) | Preserve these checks; add publication fencing and active/unknown-job protection before destructive steps. |
| Queue processing's promise guard is process-local; no durable atomic claim is established by that guard. | [processModuleOperationQueue](../app/modules/asyncOperation/index.ts) | New optimization/retirement work requires durable claims, leases and per-item checkpoints, including multi-process tests. |

No production configuration, file, pin or archive was changed during the audit.

## Proposed persisted model and API

Names below are proposed contracts to implement and test, not existing endpoints.

### Durable records

- Optimization batch: UUID, owner/API-key identity, caller idempotency key and canonical request hash, ordered source IDs/CID snapshot, policy version, state/lease/fencing token, progress, failure details and timestamps.
- Per-image result: source Content ID and source CID, rendition Content ID, full-size CID/format/bytes/dimensions, preview IDs/format/bytes, policy/codec identity and checkpoint. Unique owner + source CID + policy prevents repeated lossy encoding. Recognize a current-policy rendition passed back as input: return it unchanged rather than creating a derivative of a derivative, including after its source is retired.
- Keep typed root-source/rendition provenance, including owner and policy version. A policy change must use the retained root source; when it has been retired, report `source_unavailable_for_policy_upgrade` instead of silently recompressing a lossy rendition. Same-policy rebuilds remain supported without the root bytes.
- Protected asset references: source and output CIDs remain visible to deletion-safety accounting while a batch is preparing, retained, publishing or unresolved. JSON receipts alone are not sufficient live references.
- Replacement receipt: exact owner, old/new site revisions/CIDs, old/new archive CIDs, generated directory paths with expected root CIDs, ordered mapping, publication identity/version and cutover acknowledgment. Capture the old site/archive/path snapshot at replacement admission, before the existing generator can overwrite its current pointers; a missing old archive must be recorded explicitly rather than reconstructed later.
- Cleanup journal: durable, per-candidate roles and before/after reference evidence, MFS detach receipts, pin removal receipts, GC request/result and retained/failed reasons. Keep historical receipt strings out of the set of live retention references after retirement.

New tables use the repository's model-sync policy. Any changes to already deployed tables require proper release migrations and migration-integrity coverage.

### Batch preparation

`POST /v1/user/image-optimizations`

```json
{
  "requestKey": "stable-caller-key",
  "contentIds": [48165, 48166],
  "policy": "publication-webp-v1"
}
```

Validate an ordered, nonempty bounded list (proposed cap: 1000), reject duplicates/foreign/deleted/remote/unsupported inputs, check ownership and storage permissions at admission and execution. Freeze input CIDs before processing. Return `202` with durable batch/queue IDs. Reusing a key with changed input returns a conflict. Replaying an accepted request reuses the same batch, including after source retirement.

`GET /v1/user/image-optimizations/:id` returns owner-scoped status and an ordered mapping, for example:

```json
{
  "id": "batch-uuid",
  "status": "ready",
  "policy": "publication-webp-v1",
  "images": [{
    "sourceContentId": 48165,
    "contentId": 49001,
    "storageId": "optimized-full-cid",
    "previewStorageId": "optimized-medium-cid",
    "extension": "webp",
    "previewExtension": "webp",
    "width": 1344,
    "height": 1920,
    "size": 336072
  }]
}
```

CID strings and IDs above are illustrative except the measured source ID/size. Partial jobs expose per-item progress but cannot be rendered as a complete replacement.

### Render and retirement

- Extend the authenticated content-list render contract with `imageOptimizationId`. GeeSome resolves its own persisted ordered rendition mapping and verifies owner, completion, policy, source snapshot and exact requested IDs. Do not trust caller-provided replacement URLs/CID arrays.
- Render from rendition Content records; originals are not silently overwritten. Reuse renditions of the same source/policy on subsequent rebuilds.
- New Generation publication requests call the same persisted rendition service during save/preparation. Generic image uploads can retain source semantics; preview creation itself becomes WebP. A repeated import/save must reuse accepted rendition identities.
- Introduce a replacement-finalization command tied to the batch and publication receipt, with `deleteReplacedFiles`. It must prove the new site uses the exact output mapping and its archive is ready before accepting cutover/cleanup. GeeSome must verify the exact owned upstream Post/publication and its current replacement link; a caller-supplied `published: true` boolean is insufficient. An optimization batch ID alone must never authorize arbitrary site/archive deletion.
- API scopes are explicit: read status, write/prepare renditions and destructive retirement. Verify existing integration-key permissions can represent this separation; update inventory/docs and clients together.
- Advertise the contract/policy through capabilities. An older GeeSome server must yield an actionable unsupported state, never a silent unoptimized rebuild or an unsafe fallback deletion.

## Workflow and recovery

1. Microwave Girls freezes Post version, current Page CID, ordered source contents, publication metadata, selected preview identities and explicit cleanup flag in its existing per-card durable job.
2. It submits the idempotent optimization batch and polls GeeSome status without blocking other cards. Lost responses are reconciled by original request identity, not a fresh key.
3. GeeSome prepares full-size WebP and previews once, persists/pins outputs and receipts, and marks the entire ordered mapping ready. Per-image failure leaves sources intact. Cancellation preserves already accepted receipts and prevents later destructive phases.
4. Render the replacement into an empty revision-specific MFS directory. Record its exact path and final CID. Include only current files/assets; never copy new files into a legacy populated root.
5. Request and wait for the archive of the exact replacement CID. Verify persistence/pin/readability; render completion alone is insufficient. Unfinished/failed archive means **no old-file deletion**.
6. Update the existing upstream membership Post and local Post through the existing versioned saga. Preserve user-visible metadata and selection/crop policy. Replace source attachment IDs with rendition IDs through a frozen one-to-one mapping; do not overwrite custom preview selections blindly. Persist an owner-scoped Generation asset-resolution alias from the original import manifest to the rendition manifest before acknowledging cleanup. Generation gallery reads, repeat imports/publications and recovery of older accepted jobs must resolve through this alias, without rewriting original generation SHA/provenance or the accepted operation's identity/hash. Coordinate alias writers and readers with the publication/import locks. Missing or ambiguous attempt attribution blocks source retirement.
7. Record a durable cutover acknowledgment only after both sides are verified. Persist the output IDs as the next rebuild's canonical input. If either side changed concurrently, halt cleanup and reconcile.
8. With cleanup false, finish publication and retain explicit source/old-revision references. With cleanup true, queue retirement, then separately track GC/reclaimed-space evidence. Publication success must remain distinguishable from cleanup success.

State progression: `queued → optimizing → ready → rendering → archiving → ready_to_publish → cutover_confirmed → retiring → gc_pending → complete`. Failure/uncertainty states retain checkpoints and sources; `published_cleanup_blocked` or `published_cleanup_failed` must not revert a valid new link or resubmit a render.

Each external step needs a durable intent before dispatch and a replay-safe receipt afterward. Acquire renewable DB leases with fencing tokens; stale workers cannot publish results or delete files. A process-local promise or the Microwave Girls per-card lease is not a distributed cleanup fence. Do not hold an open database transaction across Sharp, HTTP, IPFS or GC work.

## Retirement and actual disk reclamation

Cleanup applies to the exact accepted replacement snapshot; it is not a global prune.

1. Freeze candidates **before** replacement loses old pointers: source full images, all source preview tiers, their retired manifests, old site root, old archive mapping/CID and all exact generated MFS roots. Deduplicate canonical CID forms.
2. Verify the new site and archive still exist, are protected, use the accepted outputs and remain the acknowledged current publication. Source/output equality must never schedule deletion.
3. Under a shared producer/retirement fence, resolve all active references, including other users, other posts/sites, selected/cropped previews, file catalog, composition dependencies, static-ID bindings and queued/running/unknown render/archive work. Include cross-service Generation import receipts: `attempt.importedManifestId` is retained in Microwave Girls and is not visible to GeeSome SQL guards. Require durable acknowledgment that all attributable readers now resolve to the replacement. Unknown reference coverage is a blocker, not evidence of zero references.
4. Transfer only the intended publication's attachments and eligible owner catalog placements to corresponding rendition Content records. Other publications remain unchanged. Retire source Content rows only through existing safety/tombstone semantics when no protected references remain. Do not force-delete them to make GC pass.
5. Detach the exact old StaticSite revision/archive mapping and obsolete live asset references with transactional compare-and-swap guards. Fence archive recreation for a retired source during cleanup. Keep audit receipts, but do not let retired receipts pretend to be active content references.
6. Unlink only journal-owned MFS paths whose **current** CID still equals their expected retired root. The first optimized rebuild may retire a legacy `/<staticId>-site`; later revisions use journal-owned unique paths. A mismatch or a path pointing at the new site is retained/blocked, never recursively removed. Also inspect owned ancillary MFS roots that can retain source files.
7. Recheck safety under the producer/cleanup fence immediately before unpin. Unpin every eligible **directly pinned** source/preview/site/archive root; unpinning a directory does not remove separate child pins. Indirect/shared pins are retained and reported. Do not call the current `remove(CID)` adapter and label it block deletion.
8. Request coalesced repository GC in a controlled background maintenance worker, not the user HTTP handler. Serialize GC per node, coordinate with writers/active leases, and avoid scanning/collecting the entire repository once per image or card.
9. Record local GC completion, reclaimed-block/byte evidence when available, and a repository-size observation. Concurrency affects disk totals; never promise an exact reclaimed byte count based on the sum of file sizes. Unsupported adapters or unavailable GC return `gc_pending/unsupported` with no claim that disk space was freed.

The existing `storageSpace` removal queue/safety checks should be reused where correct, but its adapter/claim/GC gaps must be repaired or explicitly bypassed by a tested retirement adapter. Do not enable the destructive flag until this path is verified against real Kubo.

Old archive acceptance is explicit: its exact mapping is retired, its owned direct pin and MFS references are released, GC completes, and its **unshared** blocks disappear locally. Shared chunks can remain. Verify local-only availability without a network fetch; a gateway response can fetch the CID again and is not a valid absence test. Other nodes can still serve old CIDs.

## Implementation workstreams

Implement GeeSome first, then Microwave Girls. No `geesome-libs` or `geesome-ui` changes are assumed; if a storage adapter repair requires `geesome-libs`, implement/test/release that dependency before consuming it in node, following hub ordering. Keep hub pointers on base commits only.

| Workstream | Inputs / outputs | Allowed write scope | Dependencies / completion |
| --- | --- | --- | --- |
| A. Persisted rendition service | Source IDs + policy → reusable full-size/preview records and measured outputs | GeeSome new optimization module, preview driver, contract tests | Can run alongside B; done when replay-safe mapping, quotas, MIME, dimensions and ownership pass. |
| B. Revision isolation and storage retirement | Existing reference/pin/MFS APIs → fenced revision receipts and local GC adapter | GeeSome storage/database/reference helpers, static-site revision lifecycle, archive retirement; focused tests | Can run alongside A on distinct files; shared index wiring owned by integration lead. Done when exact roots/archive can be reclaimed without touching live/shared outputs. |
| C. Backend integration/API | A+B → batch/status/render/finalization contracts and durable workers | GeeSome module wiring, API docs/security inventory, worker/recovery tests | Depends on A+B; done after PostgreSQL two-worker tests and Kubo end-to-end acceptance. |
| D. Microwave Girls integration | Verified C capabilities → optimize/wait/render/archive/cutover/cleanup receipts, Generation import aliases, checkbox and statuses | `microwave-girls` membership and Generation services/models/gateways/frontend/docs/tests | Mock contract and fixtures can be prepared alongside C; real integration waits for C. Alias persistence requires its own migration and PostgreSQL coverage. No second execution queue or global per-card slot. |
| E. Independent review and handoff | Final diffs + test evidence → audit findings, corrected plan and rollout instructions | Review artifacts/docs; fixes go to owning workstream | Original agent integrates, reviews cleanup safety, commits/pushes submodule work and hands off PRs; user merges. |

All workers preserve unrelated changes, avoid production mutations during tests, update this plan with findings/evidence, and keep generated images/reports out of Git. Do not parallel-edit shared API/module wiring without assigning one integration owner.

## Verification and acceptance

- Real codec tests: representative RGB PNG/JPEG/WebP, transparent PNG, rotated EXIF JPEG, already-small images, corrupt/unsupported/oversized inputs. Full resolution preserved after orientation; preview sizes capped; exact MIME/extensions; source bytes unchanged before authorized retirement. Three successive rebuilds must reuse identical full/preview bytes and CIDs with one encoding, including after root-source GC. A changed policy without root bytes must not silently re-encode the rendition.
- Persistence/ownership: request hash conflict, ordered mapping, owner/API-key revocation, partial failure, cancellation, source mutation, quota exhaustion, repeated saves and replay after source retirement. Batch completion requires every item, not merely the last successful file.
- PostgreSQL concurrency: two workers, lease expiry/reclaim, late response, stale worker, crash before/after every checkpoint, simultaneous rebuilds, active/unknown source jobs and cutover version conflict. A new producer reference must win over or block concurrent retirement.
- Render/archives: real PNG source + WebP preview; gallery backgrounds and modal links load; no original-extension preview 404s. Rebuild a previously populated legacy MFS root and assert no retired PNG/old assets exist in the new site/archive. Compare archive entries and file bytes to its exact site CID.
- Retirement: deletion flag false does no detach/unpin; true retires exact old archive+site and eligible source/preview pins after archive readiness and cutover. Shared/cropped/composition/user pins remain. Foreign owner/CID/path, changed root, source/output alias and incomplete archive are blocked. Retry cleanup without rerendering or deleting new outputs.
- Real disposable Kubo: pre-pin old originals/previews/site/archive, create legacy MFS links, replace, unlink/unpin, run local GC. Prove unshared old archive/site/image blocks are absent via local blockstore checks, outputs remain readable, shared content survives and a no-flag control retains old blocks. Include two-card GC coalescing and writer-safety coverage. Never use production GC as a test.
- Microwave Girls Docker Playwright: desktop/narrow checkbox on/off, optimization progress, independent multi-card submission, new link only after archive readiness, preserved Post metadata/selections, reload/recovery, cleanup pending/blocked/complete and no duplicate dispatch. Inspect screenshots and manifest assertions.
- Generation after real source GC: reload saved set/history, open full-size and preview, repeat import and publish another selection through the persisted alias, and resume an older accepted job without changing its identity or dispatching fresh generation. Foreign-owner alias access, stale alias updates and alias-transfer failure must be denied or block cleanup.
- Run focused tests first, relevant real PostgreSQL/Kubo integration, then broader Docker suites for the final cross-boundary change. Update API annotations and route inventory for handlers; update storage scalability/migration inventories if their covered models/queries change.

## Rollout and unresolved decisions

The architecture is ready for implementation planning; destructive delivery remains conditional on the tests above. Before coding its contracts, settle and record:

- Exact API scope and capability names, policy version, batch/image byte/pixel limits and production CPU/concurrency budget.
- Shared fencing mechanism spanning producer registration and retirement, without long SQL transactions. A retirement-only lock is insufficient.
- Supported IPFS adapters, exact owned MFS provenance and GC scheduling/metrics contract. Missing ownership evidence must retain data.
- Safe transfer rules for catalog placements, current/legacy Post attachments and custom/cropped preview selections. Preserving those selections takes priority over claiming every source was removed.
- Whether file-size wins below a chosen threshold reuse original bytes; transparent/animated/unsupported format policy. Any reuse must preserve correct `source === output` cleanup protection.

Deploy backend capabilities first; keep destructive cleanup disabled until disposable-node reclamation tests pass. Then deploy Microwave Girls API/frontend together. This planning step performs no production deletion.

Rollback before cutover leaves originals/sites available. After cutover but before cleanup, restoring the previous receipt/link is possible. After successful GC, source loss is intentional and cannot be undone without another retained copy; rollback must not point back to retired CIDs. Failed/orphan rendition and render directories require a separate fenced recovery cleanup, never an unbounded global prune.

## Audit record

2026-10-22, initial code/measurement audit: completed. The preview-only proposal was expanded to full-size persisted renditions. Immediate unpin/delete was rejected as insufficient for reclaiming disk. Fresh render directories, archive retirement, cutover acknowledgment, shared producer fencing and real local GC evidence are mandatory implementation gates.

Independent plan review found two P1 gaps, both incorporated into the plan:

- Rebuild output becoming the next batch's input could cause repeated lossy encoding. Resolution: typed root/rendition provenance, current-policy passthrough, explicit policy-upgrade failure without retained source, and three-rebuild/GC byte-identity tests.
- GeeSome deletion guards cannot see Generation's retained `attempt.importedManifestId`. Resolution: a durable owner-scoped import-resolution alias and cross-service acknowledgment before retirement; Generation reload/reimport/recovery after real GC are acceptance requirements. Evidence: [repeat import](../../microwave-girls/app/services/imageGenerationImport.ts), [published image reads](../../microwave-girls/app/services/imageGenerationGeesome.ts).

Independent follow-up review confirmed both P1 findings are closed at the design level. These are design resolutions, not implemented fixes. The shared fencing, consumer-alias and local-GC gates remain mandatory before enabling deletion.
