# Storage Space Module

## Purpose

The `storageSpace` module provides operator-facing storage analysis, cached snapshots, reference inspection, cleanup blockers, availability signals, and safe storage-object removal queues.

## Owns

- Overview, type breakdown, top content, file-catalog, group, generated-output, shared-storage, pin, preview, and availability queries.
- Cached storage-space snapshots, snapshot history, and snapshot growth data.
- Generated/static output reference inspection and reconciliation.
- Availability-network sampling, sample history, summaries, and optional worker/queue processing.
- Cleanup blockers, storage-object removal queueing, final delete-safety rechecks, and removal history.

## Boundaries

- Treat most operations as analysis by default; make repair, reconciliation, network sampling, and physical removal explicit.
- Always distinguish logical bytes from deduplicated physical bytes.
- Expensive network/provider checks must stay bounded, queueable, and opt-in for production.
- Physical removal must perform a final storage-object delete-safety recheck immediately before removal.
- Keep new storage producers tied to explicit identity/trust policy before adding them as canonical storage-object identity sources.

## Related Docs

- [Database scalability review](../../../../docs/database-scalability-review.md)
- [Storage analyzer plan/status](../../../../docs/todo.md#12-storage-space-analysis-ui)
