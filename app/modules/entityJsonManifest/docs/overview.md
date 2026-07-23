# Entity JSON Manifest Module

## Purpose

The `entityJsonManifest` module builds and reads GeeSome JSON manifests for users, content, posts, groups, categories, and related generated state.

## Owns

- Manifest generation helpers for named entities.
- Group manifest generation, including post references and scalable post-index state.
- Conversion from manifest data back into database-ready objects.
- User/content manifest conversion and remote identity data needed by import callers.
- Helpers for reading group manifest post references without forcing callers to know every manifest layout.

## Boundaries

- This module owns GeeSome/IPFS manifest shape, not ActivityPub, ATProto, RSS, or HTTP API protocol payloads.
- Most lifecycle writes belong to caller modules, but `manifestIdToDbObject` is not purely read-only: group/user imports register remote account/static-ID history, and post imports may create remote content rows through `content`.
- Keep large group timelines page/index oriented; avoid reintroducing root manifests that grow with every post.
- Compatibility readers should continue to handle legacy inline post manifests while current generation prefers chunked indexes for large groups.

## Related Docs

- [Manifest examples](../../../../docs/manifests-example.md)
- [Group manifest IPLD scalability](../../../../docs/group-manifest-ipld-scalability.md)
