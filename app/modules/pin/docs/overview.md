# Pin Module

## Purpose

The `pin` module stores pinning-service accounts and sends storage pin requests, currently through Pinata-compatible `pinByHash` calls.

## Owns

- User and group pin-account records, including encrypted secret API keys.
- Permission checks for group-owned pin accounts.
- Pin requests through user accounts and editable group pin accounts.
- Pin result recording in `PinStorageObject` when the model is available.
- Marking content and canonical storage objects as pinned after successful remote pin requests.
- A narrow auto-action allowlist for `pinByUserAccount`, `pinByGroupAccount`, and immutable-account-ID execution through `pinByAccountId`.
- Opt-in production of one-shot auto actions when a user-owned account's owner saves new content.

## Async Boundaries

- The module does not own a durable worker queue itself.
- Long-running or scheduled pinning should be driven by `autoActions` or another producer that calls the pin methods.
- Set `options.autoPin.enabled` on a user-owned account to enqueue newly saved content. `attempts` is clamped to `1..10` and defaults to `3`; optional flat `metadata` is forwarded to Pinata.
- Successful one-shot actions are deactivated. Retryable failures reuse the existing bounded retry and action-log behavior; explicitly terminal failures deactivate immediately without consuming the remaining retry budget.
- Group accounts are not triggered from the raw content hook because an upload has no group/post context. The explicit `group-post` policy queues selected post-manifest and content targets only after attachment to an eligible public post.
- The current Pinata path only pins storage IDs backed by content owned by the pin-account owner; storage ID alone is not enough authorization.
- Remote pin results should be recorded so storage-space analysis and cleanup safety can see remote pin state.

## Boundaries

- Do not store plain secret keys when `isEncrypted` is set.
- Do not infer pin safety from a successful HTTP response alone; keep DB state in sync.
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
