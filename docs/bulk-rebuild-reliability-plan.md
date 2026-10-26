# Bulk rebuild reliability (#1422 / Microwave Girls #684)

## Contents
- Contract
- Workstreams
- Evidence
- Delivery

## Contract
Keep publication requests, image receipts, shared-file protections and cleanup journals unchanged. A healthy remote queued/maintenance wait must not exhaust publication stall time. Meaningful confirmed progress resets the persisted active stall budget; ordinary polling does not. Explicit Retry resets that budget, automatic polling/restarts do not. Cleanup is still automatic and physically verified, with bounded deferral behind foreground work.

## Workstreams
1. GeeSome (first): persist cleanupQueuedAt in existing finalization receipts; migrate missing scheduling timestamps on worker observation. Accumulate for 60 seconds idle / maximum15 minutes with foreground content-resave, render or archive work. Bypass batching for due failed/manual retries. Keep exclusive fence, source/reference checks and GC receipts. Validate unit schedule and PostgreSQL/Kubo batching/restart/retry.
2. Microwave Girls (depends on first): persist publicationActivity inside job JSON. Observe confirmed images/phase/render references; exclude known queued and maintenance waiting from the active no-progress budget. No new model, queue or schema migration. Validate20 waiting jobs across more than1 hour, genuine active stalls, progress resets and explicit retries.
3. Original agent integrates sequentially, updates this plan, commits/pushes dependency PR then Microwave Girls dev. Never merge. No production deployment or SQL mutation as validation.

## Evidence
26October production snapshot: seven completed sites in the inspected cohort;19 waiting/progressing, including627 pending resaves; no image errors in that queue snapshot. GeeSome logs show storage_maintenance_busy during exclusive retirement. Old one-hour wall-clock deadline in Microwave Girls includes queue waiting. Prior error details were reset by user Retry, so individual historic failure reasons cannot all be proven.

## Delivery
Implementation and final validation complete: GeeSome PostgreSQL/Kubo suite28 passing (59s), including20-receipt batching and restart/legacy scheduling. Microwave Girls88 unit tests and3 PostgreSQL scenarios passed. API documentation and security route inventory checks passed. Existing module/isWaiting queue index covers the bounded foreground probe. Commit/push and merge handoff pending. Active progress is confirmed image count, phase/reference transitions or render size/percent. Known queued/maintenance waits (including a correlated owned archive queue) pause the one-hour active stall budget; unknown outcomes keep existing reconciliation. Publication activity persists in job JSON and explicit Retry resets it. User merges GeeSome PR and Microwave Girls dev->main; deploy GeeSome first. Existing active jobs initialize activity on their first new observation; action_required jobs use normal owner Retry/Check.
