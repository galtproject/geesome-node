# Pin Module

## Purpose

The `pin` module stores pinning-service accounts and sends storage pin requests, currently through Pinata-compatible `pinByHash` calls.

## Owns

- User and group pin-account records, including encrypted secret API keys.
- Permission checks for group-owned pin accounts.
- Pin requests through user accounts and editable group pin accounts.
- Pin result recording in `PinStorageObject` when the model is available.
- Marking content and canonical storage objects as pinned after successful remote pin requests.
- A narrow auto-action allowlist for `pinByUserAccount` and `pinByGroupAccount`.
- Opt-in production of one-shot auto actions when a user-owned account's owner saves new content.

## Async Boundaries

- The module does not own a durable worker queue itself.
- Long-running or scheduled pinning should be driven by `autoActions` or another producer that calls the pin methods.
- Set `options.autoPin.enabled` on a user-owned account to enqueue newly saved content. `attempts` is clamped to `1..10` and defaults to `3`; optional flat `metadata` is forwarded to Pinata.
- Successful one-shot actions are deactivated. Failed actions reuse the existing bounded retry and action-log behavior.
- Group accounts are not triggered from the raw content hook because an upload has no group/post context. A future group policy must select the group account only after content is attached to an eligible post.
- The current Pinata path only pins storage IDs backed by content owned by the pin-account owner; storage ID alone is not enough authorization.
- Remote pin results should be recorded so storage-space analysis and cleanup safety can see remote pin state.

## Boundaries

- Do not store plain secret keys when `isEncrypted` is set.
- Do not infer pin safety from a successful HTTP response alone; keep DB state in sync.
- Do not add broad auto-action access. Keep the allowlist small and permission-aware.
- Keep automatic pinning opt-in. Existing accounts and malformed/unknown account options remain manual-only.
- New pin providers should normalize status, remote IDs, errors, and account ownership before being exposed.

## Related Docs

- [Storage Space module overview](../../storageSpace/docs/overview.md)
- [Storage module overview](../../storage/docs/overview.md)
