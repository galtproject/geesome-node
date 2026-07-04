# Pin Module

## Purpose

The `pin` module stores pinning-service accounts and sends storage pin requests, currently through Pinata-compatible `pinByHash` calls.

## Owns

- User and group pin-account records, including encrypted secret API keys.
- Permission checks for group-owned pin accounts.
- Pin requests for user-owned or group-owned content storage IDs.
- Pin result recording in `PinStorageObject` when the model is available.
- Marking content and canonical storage objects as pinned after successful remote pin requests.
- A narrow auto-action allowlist for `pinByUserAccount` and `pinByGroupAccount`.

## Async Boundaries

- The module does not own a durable worker queue itself.
- Long-running or scheduled pinning should be driven by `autoActions` or another producer that calls the pin methods.
- Pinning requires the content row to belong to the account owner; storage ID alone is not enough authorization.
- Remote pin results should be recorded so storage-space analysis and cleanup safety can see remote pin state.

## Boundaries

- Do not store plain secret keys when `isEncrypted` is set.
- Do not infer pin safety from a successful HTTP response alone; keep DB state in sync.
- Do not add broad auto-action access. Keep the allowlist small and permission-aware.
- New pin providers should normalize status, remote IDs, errors, and account ownership before being exposed.

## Related Docs

- [Storage Space module overview](../../storageSpace/docs/overview.md)
- [Storage module overview](../../storage/docs/overview.md)
