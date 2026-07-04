# Async Operation Module

## Purpose

The `asyncOperation` module tracks user-visible long-running work and provides the shared queue primitives used by modules that should not block HTTP requests.

## Owns

- `UserAsyncOperation` records for progress, cancellation, completion, errors, output, and optional content links.
- `UserOperationQueue` records for queued module jobs with stable input hashes and user/API-key ownership.
- Generic queue processing through `processModuleOperationQueue`, including creating async-operation rows, linking them to queue rows, closing completed jobs, and recording errors.
- User APIs for reading operation status and waiting queue items.
- Startup cleanup that closes stale in-process operations and removes old finished operations.

## Queue Boundaries

- Queue module names are owned by the producer module, not by `asyncOperation`.
- Producers provide payload parsing, async-operation metadata, and the actual `run` callback.
- Duplicate suppression is input-hash based when producers use `addUniqueUserOperationQueue`.
- Processing is bounded by the caller-provided `limit` and guarded per module by an in-process set.
- Cancellation is cooperative: long-running producers must call `handleOperationCancel` at safe checkpoints.

## Boundaries

- Do not put product-specific fetch/render/import logic here.
- Do not bypass user ownership when exposing operation or queue rows.
- Avoid storing large outputs directly; use bounded JSON summaries or content links.
- New queue producers should document their module name, input shape, retry behavior, and worker trigger.

## Related Docs

- [Module docs index](../../../../docs/modules.md)
