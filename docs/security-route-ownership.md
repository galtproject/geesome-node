# Security Route Ownership Matrix

## Source Of Truth

Original request for this slice: implement the findings from the API/encryption security review before merging follow-up work. This file tracks the route ownership review from [#874](https://github.com/galtproject/geesome-node/issues/874).

The generated route/auth inventory remains [security-route-inventory.md](./security-route-inventory.md). This file is the human-reviewed ownership classification for token-only routes that rely on module-level checks.

## Reviewed Routes

| Module | Routes | Ownership Boundary | Evidence | Status |
| --- | --- | --- | --- | --- |
| `asyncOperation` | `/v1/user/get-operation-queue/:operationId`, `/v1/user/get-operation-queue-list`, `/v1/user/get-async-operation/:id`, `/v1/user/find-async-operations`, `/v1/user/cancel-async-operation/:id` | User-owned operation or queue rows. Single-row reads/cancel calls compare stored `userId` to `req.user.id`; list calls filter by `userId`. | `test/asyncOperationSecurityUnit.test.ts` covers cross-user queue reads, missing queue lookup, queue list filtering, cross-user async-operation reads, and cross-user cancellation denial. | Implemented |
| `group` | `/v1/user/group/:groupId/join`, `/v1/user/group/:groupId/leave`, `/v1/user/group/:groupId/add-admin`, `/v1/user/group/:groupId/remove-admin`, `/v1/user/group/:groupId/set-admins`, `/v1/user/group/:groupId/add-member`, `/v1/user/group/:groupId/set-members`, `/v1/user/group/:groupId/set-permissions`, `/v1/user/group/:groupId/remove-member`, `/v1/user/group/:groupId/update`, `/v1/user/group/create-post`, `/v1/user/group/update-post/:postId`, `/v1/user/group/set-read`, `/v1/user/add-friend`, `/v1/user/remove-friend` | The route actor is always `req.user.id`. Self-service join/leave pass the authenticated user as both actor and target; admin/member/post mutations pass `req.user.id` as actor and delegate group admin/member/post checks to `group` module methods; friend routes use the authenticated user as the owner of the relationship. | `test/groupApiSecurityUnit.test.ts` covers route-to-module actor forwarding so request bodies cannot spoof the acting user, and catches the remove-friend route calling the remove path. Existing `test/group.test.ts` covers group admin/edit permission denial in module flows. | Implemented |

## Remaining Review Queue

- `groupCategory`: classify category member/admin/edit boundaries for token-only category and group-section routes.
- `content`, `fileCatalog`, and `staticSiteGenerator`: classify private user storage, published content, and group-admin generation paths.
- `autoActions`, `pin`, Telegram/Twitter imports, and `socNetImport`: classify external-service execution and stored-credential boundaries.
