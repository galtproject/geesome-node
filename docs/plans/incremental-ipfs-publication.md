# Incremental IPFS publication optimization

Tracking: #1473. Status: independently audited plan; implementation not started. This change delivers
only the plan and review; it does not implement or deploy the optimization.

## Contents

- [Source of truth and measurements](#source-of-truth-and-measurements)
- [Requirements and non-goals](#requirements-and-non-goals)
- [Design and compatibility](#design-and-compatibility)
- [Workstreams and execution order](#workstreams-and-execution-order)
- [Acceptance and verification](#acceptance-and-verification)
- [Rollout and rollback](#rollout-and-rollback)
- [Audit and decisions](#audit-and-decisions)

## Source of truth and measurements

User request: write an optimization plan and have a subagent audit it. Runtime
implementation requires a subsequent request. Preserve the accepted model: an
expired member keeps any full snapshot CID already received; access gates only
new full versions. Galleries/other URI targets are links, never recursively copied.

On 2026-10-29, live GeeSome revision `6a3bd353`, 46 Wave posts: append one
trailing space to one post title, then restore exactly the original properties.
The normal post-update/manifest/publication pipeline was exercised without a
restart. Both restored root CIDs matched their pre-experiment values. Temporary
wrappers/hooks and the container-local inspector were removed. No profiling
endpoint, configuration or permanent code change remains on production.

| Metric | Space added | Original text restored |
| --- | ---: | ---: |
| Save to ready-row hook (before commit) | 47.677 s | 21.111 s |
| Save through completed DB commit | 47.687 s | 21.148 s |
| Save to worker claim | 3.204 s | 5.108 s |
| Active build | 44.474 s | 16.003 s |
| Read/project posts | 0.342 s | 1.008 s |
| Four HTML renders | 0.124 s | 0.090 s |
| Save four HTML bodies | 0.195 s | 0.058 s |
| 198 storage copies | 28.291 s | 9.570 s |
| 110 mkdir calls | 9.893 s | 2.749 s |
| Lease UPDATE calls / total time | 207 / 3.423 s | 206 / 1.259 s |
| Two directory CID reads | 0.008 s | 0.013 s |
| Final publication transaction | 0.059 s | 0.137 s |

Each variant has 53 HTML/CSS/JS paths. Only `index.html` and one post HTML changed
in each variant: 4 regenerated files, 102 reused files total. The assembler still
links all 106 site files and 92 previews into new MFS roots: 198 copies. These
are CID/DAG-link operations, not 198 new uploads or copied gallery contents.

Timing caveats: method durations are inclusive and can overlap; do not sum nested
storage/IPFS counters. Whole-process DB/stat/CPU counters also include gateway,
payment and queue traffic. The first run had substantially greater concurrent
gateway/SQL activity. Two runs are evidence of redundant work, not a controlled
latency distribution, a p95 or proof of a fixed speedup. The initial `ready` hook
ran inside the transaction, 9/38 ms before commit completion. Future ready
measurements must end after a successfully completed DB commit; retry/cleanup
latency must be measured independently, not hidden in render time. CPU sampling showed
substantial idle/I/O waiting. Local ignored evidence is in
`test/.geesome-test-output/publication-profile/{first,restored,summary,cpu}.json`;
that directory is not a required shared test fixture or a committed artifact.

Current implementation points:

- `app/modules/staticSiteGenerator/membershipPublication.ts`: stable layout,
  file-key reuse, full fresh directory assembly, preview copy/stat, artifact set.
- `app/modules/staticSiteGenerator/membershipPublisher.ts`: previous ready
  resource manifest, per-job/token staging, lease/heartbeat, source fence,
  atomic public/full commit, retry and cleanup.
- `app/modules/storage/index.ts` and `geesome-libs/src/JsIpfsService.ts`:
  destination-existence checks and MFS copy/mkdir behavior.
- `test/creatorMembershipIntegration.test.ts`: real Postgres/Kubo, retained CIDs,
  changed source/lease, retry, cleanup and incremental file caches.

## Requirements and non-goals

Must preserve:

1. Public/full projection before rendering and strict separation of their roots,
   media and inventories; no private bytes/CIDs carried into a public root.
2. One atomic selection of the ready pair after source-version and lease-token
   validation. Readers retain the previous complete pair during build/failure.
3. Immutable old CIDs and all required artifact references across snapshot history.
   Pruning a new staging tree must not delete old pinned/shared IPFS content.
4. Stable archive pagination, relative URLs, current theme/HTML-shell contracts,
   normal source invalidation and expected current-content selection.
5. A compatible full-build path for first publication, old/incomplete manifests,
   inaccessible previous roots and explicit repair/verification.
6. No new original-file downloads, image compression or URI-target traversal for
   a text-only edit. No broad raw `rm`, garbage collection or production group cleanup.

Non-goals: changing access/payments, encrypting old snapshots, new storage service,
changing UI/pagination, making rendering parallel over its shared mutable data,
block editor/preview, or immediately reducing the 5-second worker poll interval.
Do not promise a sub-second rebuild or assume MFS cloning is constant-time.

## Design and compatibility

### Complete inventory as the trust boundary

Compute the desired public and full inventories independently from current
projected data: exact relative path -> {CID, kind} for HTML/CSS/JS and localized media,
plus the canonical directory set (including intentional empty base directories).
Reject traversal, absolute/protocol paths, duplicate/conflicting entries and
file/directory ancestor conflicts before mutating staging. An entry is either a
file or an `opaque-subtree` bound to an immutable directory CID. Current
`localMedia` accepts directory Content; preserve it without enumerating its
children. An opaque subtree is a terminal inventory boundary: no child patch or
managed-directory cleanup may enter it. Add/replace/remove that entry as a whole,
with file <-> subtree transition tests. Source CID/type bindings established by
the full writer can be reused for unchanged media; newly encountered sources
require validation. Thus a complete inventory describes managed paths and
CID-bound opaque leaves, not a recursive scan of arbitrary Content directories. Only known publisher
namespaces are eligible; template/branding/link CID references remain artifact
references, not files to recursively expand into the tree.

An old `version:2` manifest alone is NOT evidence that its root contains only the
listed files. Add a backward-compatible optional, versioned assembly/inventory
capability to publisher-owned manifest JSON. Bind it to resource, variant, root
and inventory digest. Exact encoding is an implementation deliverable; do not
bump the outer version without updating every strict version-2 reader. No SQL
schema migration is expected for an additive manifest field.

Separate three independent inputs in the assembler: previous logical layout,
previous per-file render cache, and root-clone eligibility. Ordinary forced-full
assembly keeps render cache; explicit repair may bypass damaged cached bodies
as well as cloning, while still preserving previous logical layout. Forced-full mode or
an ineligible root must NOT erase previous archive assignments/file cache.
`creatorLayout` deliberately preserves archive holes/assignments after deletion;
comparing rebuilds with different layout history would change public URLs and
invalidate root/latency parity. Compare fresh vs cloned assembly using the same
fixed desired layout and projected inventory.

The first build after upgrade uses fresh assembly if this capability is absent.
Only a successfully constructed complete tree may receive the capability. Future
clones use a previous ready job belonging to this same resource and this same
variant, with a supported, internally consistent inventory/capability. A capability
is an invariant of our writer, not an assertion accepted from an owner API/CID.
This prevents blindly inheriting untracked files from old publisher behavior.

### Assembly with two independent staging roots

For each variant:

1. Register a new `/membership-<job>-<lease>-<variant>` staging path in the job,
   as today. Never mutate a previously published root or another job's staging.
2. If eligible, copy the previous immutable variant root to that new MFS path
   once. Confirm actual Kubo copy semantics and canonical root shape with tests.
   Unsupported storage adapters use the full path; no silent Kubo-only assumption
   may break an existing backend. Prefer existing storage methods before shared
   adapter/library changes.
   Do not pre-create a destination directory if it would change cp semantics.
3. Diff previous complete inventory against desired inventory. Skip unchanged
   paths entirely: no per-path copy, mkdir or source stat. Keep file input-key
   render caching; a key miss with the same resulting CID need not rewrite bytes.
4. In staging only, remove paths absent from the desired inventory; replace changed
   files and add new ones. Handle file/directory transitions and remove stale empty
   post/page directories, preserving the exact canonical directory set. Changed
   directories/new assets remain compatible with existing supported content types.
5. Reuse previously verified media bindings for unchanged paths. Validate and
   copy newly required sources; never infer validity from a filename alone.
6. Build a new complete manifest and artifact reference set from the desired
   inventory/projection, including reused HTML/media/branding/URI roots. Never
   return only the delta or union stale inventory entries into the new manifest.
7. Obtain root CID and prove staged output matches the complete desired set under
   the writer's assembly invariant. Commit only after both variants, the source
   fence and the existing token/ownership checks succeed.

Choose assembly mode before staging mutations. An unsupported/incomplete prior
manifest or adapter uses fresh assembly immediately. Once cloning/mutation has
started, an I/O failure fails this attempt; do not retry fresh assembly inside the
same attempt or reuse the partial destination. Preserve the existing selected
pair and normal retry/backoff. On a later claim, use the newly issued lease token,
existing job-scoped cleanup of previous failed staging paths, and fresh assembly
(disable cloning for attempts > 1). This bounds clone attempts without introducing
unregistered suffix paths or deleting the other variant midway through build.

Do not convert validation failures, source changes, lost leases or permissions
into a successful fallback. Cleanup must preserve the existing token guards and
account for outstanding RPCs: a timed-out old mutation must never target a new
attempt's path. Verify late-RPC/orphan behavior explicitly; if existing cleanup
can drop a path journal before an old request can recreate it, document and fix
that recovery gap rather than claiming the new fallback handles it. Pair/head
fencing and orphan reclamation are separate guarantees. Before rollout, either
prove remote operation quiescence/abort or deliver bounded durable orphan
reconciliation that cannot remove winning or historical references. This is an
explicit release gate, not a promise made by the current cleanup implementation.

For the measured edit, target two root copies plus replacements of four files;
unchanged directories and 92 preview paths should require no new copy/stat/mkdir.
The original post/gallery asset CIDs and old snapshot references remain available.

### Lease renewal and observability

Keep the existing 120-second lease, periodic heartbeat, conditional writes and
transactional final fence. Throttle/deduplicate synchronous renewal requests
instead of issuing one UPDATE for every cached path. Use one renewal in flight,
a bounded interval materially below lease expiry, and forced checks at critical
boundaries; each operation checks a locally observed cancellation/renewal error.
Do not remove fencing or rely only on a timer that can be delayed by CPU work.
Measure separately before adjusting heartbeat/poll intervals.

Add structured, content-free build metrics: queue wait, source scan/projection,
prepare/compile, renders/hits, new HTML bytes, fresh/clone/fallback mode, copies,
mkdir/rm/stat counts, per-variant assembly duration, lease updates, root acquisition,
commit, retry/cleanup and total ready time (after successful transaction completion). Keep a bounded schema/version and
no raw titles, HTML, URLs, SQL, full root CIDs, sessions or payment data. Prefer
existing debug/metrics helpers; no always-on per-file logging, endpoint or CPU
profiler. Specify persistence/retention as part of implementation, not another
unbounded publications JSON array. CPU/whole-process totals must be labelled
separately from publication-scoped measurements.

Batch flush, direct low-level cp, shared storage-adapter changes, broader async
parallelism and reduced hydration are later measured candidates. Avoid combining
them with the initial cloning change: durability, error and adapter compatibility
need their own evidence. If geesome-libs changes become necessary, update and
verify that dependency before node, under its local workflow.

## Workstreams and execution order

| Workstream | Inputs / write scope | Output / completion gate | Dependencies |
| --- | --- | --- | --- |
| A. Baseline + metrics | Existing measurements; node SSG publisher and focused tests | Versioned, bounded build-scoped counters; deterministic fixture and comparable fresh baseline | None |
| B. Inventory contract | Current projections, manifest readers, retention rules; SSG assembler/models interfaces/docs | Canonical inventories, capability/eligibility validation, legacy full-build coverage and path checks | A's metric contract; can design in parallel with A |
| C. Delta assembly | B contract; node assembler and focused Kubo tests | Independent root cloning, changed/new/deleted paths, exact output parity, clean fallback | A+B |
| D. Lease gating | Existing worker state machine; publisher + concurrency tests | Bounded renewal count with preserved lease-loss/source-change/commit guards | A; may run in parallel with B/C with separate file ownership |
| E. Acceptance + rollout | A–D; integration/browser/docs | Correctness, request-count and repeated latency evidence; rollout/rollback instructions | A–D |

The original implementer owns integration, review and handoff. Delegate only with
explicit file ownership: C owns assembler, D owns publisher; shared interfaces
must be agreed before edits. Test/doc work can be parallel after contracts freeze.
No agent may merge a PR or deploy as part of this planning request.

## Acceptance and verification

### Correctness matrix

- Fresh vs incremental roots have equal exact file/directory inventories and
  bytes; for deterministic fixtures with identical canonical layout, equal CIDs.
  Root equality is an assertion to establish, not an assumed effect of cp.
- No-op rebuild: no renders/new body saves; clone at most once per variant; no
  per-existing-file copy/stat/mkdir. Root CID remains the same; empty-site base
  directories and a site with no media are included.
- One text edit: four file writes for the measured newest-post fixture, unchanged
  archives/assets/media untouched. Verify input-key miss yielding unchanged CID.
- Add a post at pagination boundaries; edit old archive post; hide/delete posts;
  delete all posts; remove/replace attachments and media types; rename paths;
  change theme/template/client/CSS. Desired inventories must be exact afterward.
- Public -> private and private -> public joins, free -> paid, and private link
  changes: no stale public media/paid HTML after cloning, no traversal of URI
  targets, old full snapshots still accessible under the accepted CID model.
- Incomplete/legacy/unknown capability, wrong resource/variant/root, corrupt
  inventory/path, missing root/block, partial clone/copy/removal failure: clean
  fallback or ordinary retry as appropriate; previous pair remains selected.
- Delayed RPC, lost lease, source mutation, competing workers, crash/restart and
  ambiguous DB commit: no stale or mixed pair; bounded renewal; cleanup cannot
  remove a winning/other-token tree or historical content.
- All artifact references, including reused files/media and linked CID roots,
  survive retention/GC checks. No manifest field upgrade silently disables
  existing `version===2` readers/cache or old client source-preservation behavior.

### Performance evidence

Use real disposable Kubo + Postgres with 46-post and larger deterministic
fixtures. First establish byte/root parity and counters; mocks alone cannot
prove DAG copy, canonical directories, flush/durability or failure behavior.

Compare full and incremental modes from equivalent data on the same deployed
runtime/config: warm incremental, warm forced-full baseline, and separately
labelled cold startup. Use at least five matched local repetitions, record the
individual values, median/range and failures. Five samples do not establish p95.
Keep load and profiling overhead recorded. Absolute target is a statistically
visible reduction in active build median with no correctness regressions; primary
hard gate is removing O(all paths) MFS mutations from a small edit, not an invented
seconds SLA.

For one newest-post text edit: 2 root clone calls; 4 changed path writes; no
unchanged path copies/mkdir/stat; lease UPDATE count bounded by elapsed time and
critical boundaries rather than site size. Also test no-op and bulk changes, so
fallback/full builds do not regress or hammer the DB. Exclude queue polling from
active-build comparisons, but retain end-to-end save-to-ready measurement. Distinguish cold startup from
layout reset: cold process tests still receive the same fixed logical archive
history. A real old-data migration test is a separate correctness scenario.

Required repo checks when implemented: `npm run test:creator-membership:docker`,
focused inventory/assembly tests, `npm run test:ssg-creator-types`, full relevant
membership/pagination browser checks, `npm run database:scalability:update` and
check/review. Run route inventory/API docs if observability changes an API;
otherwise keep metrics server-internal. Broaden storage/consumer tests only if
shared adapters or geesome-libs change.

## Rollout and rollback

1. Implement/verify on disposable fixtures; land through issue/PR workflow.
2. Upgrade supports current manifests and full assembly first. Establish one
   capable complete publication per resource; old ready roots stay available.
3. Enable incremental assembly for supported inventories; expose full-build
   repair/bypass through an existing owner/operator rebuild flow, without letting
   owners choose arbitrary source roots. Exact option/API is an implementation
   design item and requires documentation/tests if changed.
4. Observe counts, build medians, fallback/error/retry rates under comparable load.
   A controlled production post edit is a separate explicitly authorized step;
   restore its original data and confirm both root CIDs after the experiment.
5. On a clone/diff regression, bypass the optimization and publish a fresh pair.
   Existing selected pair remains served until success. Do not roll back by
   deleting IPFS data or truncating jobs/manifests. Confirm old-code behavior for
   additive metadata before rolling binaries back.

## Audit and decisions

Independent read-only subagent audit completed on 2026-10-29 against the plan
and actual assembler/publisher/pagination/storage/retention code. The reviewer
supports root reuse as the primary optimization and considers this plan suitable
for implementation after the following corrections, now incorporated:

| Finding | Evidence | Disposition |
| --- | --- | --- |
| P1: an extra in-job fallback path is incompatible with deterministic beginDirectory and all-path cleanup | `membershipPublisher.ts:20–40,63–70` | Resolved in plan: choose fresh before mutation if ineligible; after partial I/O failure use normal backoff/new claim token, disable cloning on attempts > 1. No mid-build all-path cleanup or unregistered attempt suffix. |
| P2: forced-full must not discard archive assignment history | `membershipPublication.ts:45–46`; `membershipPagination.ts:3–20` | Resolved: separate logical layout, render cache and clone eligibility. Fix layout history for parity/benchmark; repair can bypass bodies but must keep layout. |
| P2: media may be directory Content | `membershipPublication.ts:73–77` | Resolved: explicit CID-bound opaque-subtree terminal entries; no child patch/traversal, whole-entry removal and file/subtree transitions in acceptance matrix. |
| Recovery gate: late old RPC can recreate an old MFS path after cleanup clears its journal | `membershipPublisher.ts:20–40`; cp uses `parents:true` | Explicit remaining implementation/release gate: prove quiescence/abort or bounded durable orphan reconciliation. Existing fencing proves head safety, not absence of orphans. Do not claim this is already fixed. |
| Measurement precision: ready status hook precedes commit and cleanup | Final serial transaction in `membershipPublisher.ts` | Resolved in plan: committed-ready and cleanup are separate metrics; baseline table discloses the hook vs committed timestamps. |

The auditor also confirmed that legacy eligibility, public/full separation,
reused artifact retention, historical CID preservation, source/lease fences,
controlled repeat measurements and absence of a fixed seconds promise are
appropriate. No runtime implementation or production action occurred during
this planning/audit task.

Plan validation: TODO section helper and whitespace checks; verified source
paths and local measurement JSON. Repaired one pre-existing missing closing TODO
section marker so deterministic TODO tooling can load this new section. No
runtime tests were run for this documentation-only change.
