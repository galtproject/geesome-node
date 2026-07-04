# Remote Group Module

## Purpose

The `remoteGroup` module imports GeeSome groups and posts from remote GeeSome manifest storage IDs or static IDs.

## Owns

- Resolving a remote group static ID to the current manifest storage ID when needed.
- Creating local remote-group rows from GeeSome group manifests.
- Importing missing published post refs from remote group manifests.
- Removing stale local imported posts when the remote manifest no longer references them.
- Preserving remote `localId` values, manifest storage IDs, and group counters during replay.

## Integration Boundaries

- Manifest parsing belongs to `entityJsonManifest`.
- Local group/post writes, counters, and manifest-derived state belong to `group`.
- Static ID resolution belongs to `staticId` and `communicator`.
- Raw manifest/object reads belong to `storage`.

## Boundaries

- This module imports GeeSome manifest data, not ActivityPub/ATProto remote social objects.
- Keep remote group import idempotent: repeated imports should converge local state to the remote manifest.
- Use batched post-ref reads for large groups and avoid full post hydration when only refs are needed.
- Reconcile counters after edit/delete replay so imported state remains consistent.

## Related Docs

- [Entity JSON Manifest module overview](../../entityJsonManifest/docs/overview.md)
- [Group module overview](../../group/docs/overview.md)
- [Group manifest IPLD scalability](../../../../docs/group-manifest-ipld-scalability.md)
