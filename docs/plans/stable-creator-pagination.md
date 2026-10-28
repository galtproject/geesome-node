# Stable creator pagination

Tracking: [#1461](https://github.com/galtproject/geesome-node/issues/1461).

## Contents

- [Accepted contract](#accepted-contract)
- [Workstreams and order](#workstreams-and-order)
- [Storage and compatibility](#storage-and-compatibility)
- [Verification and delivery](#verification-and-delivery)
- [Execution record](#execution-record)

## Accepted contract

Replace Load more with crawlable Newer/Older anchors and a Latest publications link. The homepage grows from 10 to 19 posts; at 20 its oldest ten move into a new archive block. Archive block 1 is oldest, with newer blocks numbered upward. Examples: 50 -> homepage 50..41, archives 1..4; 51 -> homepage 51..41, archives unchanged; 60 -> homepage 60..51, archive 5 adds 50..41. Fewer than ten total posts are all shown.

Generate real directory URLs without .html/hash for creator pages, with normal HTML navigation and JavaScript-disabled access. Preserve generic SSG hash routing and old immutable publications. Keep public/full posts aligned and entitlement selection server-side; previously obtained complete CIDs remain usable.

Archive membership is persisted in publication manifests using first-publication order. New/backdated items join the homepage without renumbering old archives. Hidden/deleted items disappear from their assigned block without moving other posts; this may leave an existing block or homepage short after removal. Restored items return to their assigned block. Public/full use the same assignment. On initial migration order by date and deterministic id, then preserve assignments.

## Workstreams and order

1. **Layout and reuse contract** — inputs: current manifest and visible canonical posts; outputs: stable assignment helper, versioned manifest page paths and per-variant file fingerprints/CIDs; scope: staticSiteGenerator. Verify rollover boundaries and tombstones. No new tables required.
2. **Publisher** — inputs: layout and previous ready publication; outputs: directory pages, local relative assets and navigation, unchanged-output CID reuse; scope: membershipPublication/Publisher/RenderData. Depends on 1. Fingerprints include projected data and renderer/assets version, excluding unrelated global counts. The previously newest archive may need a navigation-only refresh when its next neighbour appears; older archives remain reusable.
3. **Client and delivery** — inputs: versioned paths; outputs: no-hash creator hydration, static anchors, canonical stable-domain metadata/delivery contract, old-manifest support; scope: creator Vue, shared router only under creator guard, membership routes. Depends on 1–2. Do not globally replace hash routing.
4. **Verification and rollout** — inputs: final code; outputs: SQL/IPFS tests, desktop/narrow screenshots, JS-disabled links, API docs/inventories, operator instructions and PR. Depends on 1–3. The streams are listed as agent-ready boundaries; only read-only audit work may run independently. Main implementer owns integration/push; no agent merges.

## Storage and compatibility

Use immutable IPFS snapshots and relative links. Root CID changes with a new publication; unchanged leaf outputs are reused by CID instead of SSR. Public/full output caches remain separate. Reuse only outputs from a ready publication of the same resource and matching fingerprint/schema version. Register retained artifact holds. Lease/source-version fencing stays unchanged.

Clean `/page/N/` paths inside immutable roots must work directly via index.html. Stable domain paths require explicit proxy routing to the membership public-site handler; changing a production domain homepage is an operator rollout step, not a test action. Retain existing `/api/v1/membership/site/` access and old manifest path interpretation. Do not expose a complete snapshot through a public canonical response or cache a session-selected response as public.

## Verification and delivery

Test 0/9/10/19/20/50/51/59/60/61, appended/backdated/restored/hidden/deleted posts, deterministic order, unchanged archive/post reuse, edits invalidating affected outputs, template invalidation, public/full privacy, old manifests, folder-relative paths, no hashes and HTML anchors without JS. Run strict Vue types, creator HTTP/SQL/payment tests, generated-site Playwright and API/route/scalability checks. Inspect changed screen captures. Commit/push and open a PR; production deployment, homepage cutover, payment operations and merges remain outside this implementation.

## Execution record

- 2026-10-28: plan recorded before implementation; branch based on origin/dev ae8abd5a. Existing checkout default PR #1460 remains independent and is not silently merged into this work. No production mutations.

- All four workstreams implemented. Version-2 manifests preserve archive assignments and per-variant output fingerprints/CIDs. Directory pages and memory-history creator hydration replace the new publication's hash/file routes; generic themes and old immutable manifests remain compatible.
- Validation: 37 creator membership/SQL/HTTP/Kubo cases and 56 payment cases passed with no skips. Boundaries, restoration/backdating, isolated public/full caches, private-only edits and branding invalidation are covered. An unchanged rebuild performs zero HTML saves; adding post 51 to 50 saves only four HTML files across both variants.
- Browser validation: complete suite passed 58 captures; focused final pagination suite passed eight desktop/narrow, JS-on/off captures. New archive navigation, directory posts, relative assets, no fragments, no duplicates and image visibility were checked. Visual inspection found and fixed the noscript loading overlay. The initial full run hit the existing narrow gallery raster rounding threshold; an unchanged rerun passed without changing thresholds.
- Strict creator Vue types, API documentation, security route inventory and database scalability inventory checks passed. A final read-only pagination review found no remaining blockers.
- Delivery/rollout: see [creator-pagination-rollout.md](../creator-pagination-rollout.md). No database migration or new environment settings. Rebuild v2 snapshots before any stable-domain proxy cutover. Production has not been changed. Metadata is still scanned and directory links reconstructed; CID reuse avoids repeated SSR/save, not all build work.
- Frontend distribution publication and Docker/BuildKit cache regressions passed (prepared image reuse, source invalidation and persistent server publication reuse). Proxy snippets are documented examples; live nginx configuration/reload was not performed.
