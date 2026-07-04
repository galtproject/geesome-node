# Storage Module

## Purpose

The `storage` module wraps the configured storage backend and exposes the low-level file, directory, object, stream, pin, remove, and node-address operations used by higher-level modules.

## Owns

- Backend selection from app storage config.
- File and directory save/read operations, including streams and raw data.
- JSON object save/read helpers.
- IPFS/IPNS-style node listing, boot-node, address-list, pin, unpin, and remove operations when supported by the backend.
- Normalization of storage backend address output and suppression of noisy backend pin logs.

## Boundaries

- `storage` does not own user permissions, content ownership, database rows, or delete-safety policy.
- Feature modules should usually go through `content` or storage-object helpers when creating user-visible data.
- Storage IDs are physical references; do not infer product identity, owner, moderation status, or delete safety from a storage ID alone.
- Expensive backend/network calls should stay bounded and optional when used by operational analyzers.

## Related Docs

- [Storage-space analyzer status](../../../../docs/todo.md#12-storage-space-analysis-ui)
- [Database scalability review](../../../../docs/database-scalability-review.md)
