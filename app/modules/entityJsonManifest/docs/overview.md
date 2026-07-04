# Entity JSON Manifest Module

## Purpose

The `entityJsonManifest` module builds and reads GeeSome JSON manifests for content, posts, groups, categories, and related generated state.

## Owns

- Manifest generation helpers for named entities.
- Group manifest generation, including post references and scalable post-index state.
- Conversion from manifest data back into database-ready objects.
- Helpers for reading group manifest post references without forcing callers to know every manifest layout.

## Boundaries

- This module owns GeeSome/IPFS manifest shape, not ActivityPub, ATProto, RSS, or HTTP API protocol payloads.
- Database writes and product lifecycle decisions belong to caller modules such as `group`, `remoteGroup`, `content`, and `staticSiteGenerator`.
- Keep large group timelines page/index oriented; avoid reintroducing root manifests that grow with every post.
- Compatibility readers should continue to handle legacy inline post manifests while current generation prefers chunked indexes for large groups.

## Related Docs

- [Manifest examples](../../../../docs/manifests-example.md)
- [Group manifest IPLD scalability](../../../../docs/group-manifest-ipld-scalability.md)
