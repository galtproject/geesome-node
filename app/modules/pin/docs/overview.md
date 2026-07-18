# Pin Module

## Purpose

The `pin` module stores pinning-service accounts and sends storage pin requests, currently through Pinata-compatible `pinByHash` calls.

## Owns

- Direct-user and group-scoped pin-account records, including encrypted secret API keys.
- Current group-editor permission checks for group-scoped pin accounts.
- Pin requests through user accounts and editable group pin accounts.
- A per-account `PinStorageObject` state machine for every authorized target, including group post manifests that have no `Content` row.
- Provider-request attempts, bounded result/error details, and accepted-versus-confirmed remote state without changing local pin flags optimistically.
- A narrow auto-action allowlist for `pinByUserAccount`, `pinByGroupAccount`, and immutable-account-ID execution through `pinByAccountId`.
- Opt-in production of one-shot auto actions when a user-owned account's owner saves new content.

## Async Boundaries

- The module does not own a durable worker queue itself.
- Long-running or scheduled pinning should be driven by `autoActions` or another producer that calls the pin methods.
- Set `options.autoPin.enabled` on a user-owned account to enqueue newly saved content. `attempts` is clamped to `1..10` and defaults to `3`; optional flat `metadata` is forwarded to Pinata.
- Successful one-shot actions are deactivated. Retryable failures reuse the existing bounded retry and action-log behavior; explicitly terminal failures deactivate immediately without consuming the remaining retry budget.
- Group accounts are not triggered from the raw content hook because an upload has no group/post context. The explicit `group-post` policy queues selected post-manifest and content targets only after attachment to an eligible public post.
- Automatic account discovery walks every direct-user or group-scoped account in stable `(name, id)` cursor batches. Public account-list responses remain capped independently.
- Direct Pinata requests require content owned by the direct account owner. Group requests require an exact eligible group-post manifest or attachment; storage ID alone is never enough authorization.
- A provider-accepted request is recorded as `accepted`, not `confirmed`. Reconciliation must prove remote availability before storage-space reports it as remotely pinned.
- `requested`, `accepted`, `confirmed`, and `retryable_failure` rows block physical deletion because the remote outcome is present or uncertain. `missing` and `terminal_failure` rows do not.
- Legacy `pinned` rows remain readable as confirmed claims while unreleased environments move to the explicit states.

## Ownership

- A direct account has no `groupId`; only its `userId` owner can list, use, update, or delete it.
- A group-scoped account has a `groupId`; current group editors can list, use, update, or delete it. Its `userId` records who created the credential and owns existing auto-action rows, but does not preserve access after that user loses group edit permission.
- Group automatic policy belongs to the group account and survives creator/admin rotation. Execution reloads the account and exact eligible group-post target; it does not require the original creator to remain a group editor.
- Account scope is immutable. Create a replacement account instead of changing `groupId`, which avoids silently transferring credentials between a user and a group.
- Deleting an account removes local credentials and pending automatic work, but retains `PinStorageObject` history and never implies a remote unpin.

## Boundaries

- Do not store plain secret keys when `isEncrypted` is set.
- Do not infer confirmed remote availability from a successful HTTP response. Persist acceptance first and let provider reconciliation confirm or correct it.
- Treat `status` as authoritative. Attempt tokens prevent a late completion from overwriting a newer request for the same account and storage ID.
- Keep `Content.isPinned` and `StorageObject.isPinned` for local/derived aggregate state. A provider acceptance alone must not set either flag.
- Do not add broad auto-action access. Keep the allowlist small and permission-aware.
- Keep automatic pinning opt-in. Existing accounts and malformed/unknown account options remain manual-only.
- New pin providers should normalize status, remote IDs, errors, and account ownership before being exposed.

## Provider Request Policy

- The canonical `https://api.pinata.cloud/pinning/pinByHash` endpoint is enabled by default.
- `PIN_PROVIDER_REQUEST_TIMEOUT_MS` controls the provider timeout. It defaults to 30 seconds and is clamped to 1–120 seconds.
- Custom endpoints are disabled by default. Enable them with `PIN_ALLOW_CUSTOM_ENDPOINTS=1` and list each exact approved host (including a non-default port when needed) in comma-separated `PIN_CUSTOM_ENDPOINT_HOSTS`.
- Custom endpoints must use HTTPS and cannot contain URL credentials. Every resolved address must be public, the approved DNS result is pinned into the request connection, and redirects are disabled before API credentials are sent.
- Provider error details are bounded and configured API credentials are redacted. HTTP 408, 425, 429, 5xx, timeout, cancellation, and network errors are retryable; other HTTP responses and endpoint-policy violations are terminal.
- Module shutdown aborts in-flight provider requests. Durable retry state remains owned by `autoActions`.

## Related Docs

- [Storage Space module overview](../../storageSpace/docs/overview.md)
- [Storage module overview](../../storage/docs/overview.md)
