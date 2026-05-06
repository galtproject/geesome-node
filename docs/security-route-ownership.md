# Security Route Ownership Matrix

## Source Of Truth

Original request for this slice: implement the findings from the API/encryption security review before merging follow-up work. This file tracks the route ownership review from [#874](https://github.com/galtproject/geesome-node/issues/874).

The generated route/auth inventory remains [security-route-inventory.md](./security-route-inventory.md). This file is the human-reviewed ownership classification for token-only routes that rely on module-level checks.

## Reviewed Routes

| Module | Routes | Ownership Boundary | Evidence | Status |
| --- | --- | --- | --- | --- |
| `asyncOperation` | `/v1/user/get-operation-queue/:operationId`, `/v1/user/get-operation-queue-list`, `/v1/user/get-async-operation/:id`, `/v1/user/find-async-operations`, `/v1/user/cancel-async-operation/:id` | User-owned operation or queue rows. Single-row reads/cancel calls compare stored `userId` to `req.user.id`; list calls filter by `userId`. | `test/asyncOperationSecurityUnit.test.ts` covers cross-user queue reads, missing queue lookup, queue list filtering, cross-user async-operation reads, and cross-user cancellation denial. | Implemented |

## Remaining Review Queue

- `group` and `groupCategory`: classify member/admin/edit boundaries for each token-only group mutation route.
- `content`, `fileCatalog`, and `staticSiteGenerator`: classify private user storage, published content, and group-admin generation paths.
- `autoActions`, `pin`, Telegram/Twitter imports, and `socNetImport`: classify external-service execution and stored-credential boundaries.
