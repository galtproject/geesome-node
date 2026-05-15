# Group Manifest IPLD Scalability

## Research Snapshot

Checked May 15, 2026 against the current GeeSome group manifest code and primary IPFS/IPLD docs:

- IPLD Advanced Data Layouts: https://ipld.io/docs/advanced-data-layouts/
- IPLD HAMT ADL spec: https://ipld.io/specs/advanced-data-layouts/hamt/
- IPFS data-set content addressing guide: https://docs.ipfs.tech/how-to/content-addressing-data-sets/
- UnixFS specification, HAMT directory section: https://specs.ipfs.tech/unixfs/
- CARv2 specification: https://ipld.io/specs/transport/car/carv2/

## Current Shape

GeeSome has two group-post manifest layouts today:

- Legacy inline `posts`: a base36 trie keyed by `localId`, stored inside the root group manifest JSON.
- Chunked `postsIndex`: a root page directory where each page links to a separate manifest containing a sorted range of `{localId, manifestStorageId}` refs.

The inline trie is good for old path compatibility, but it is not a true IPLD-sharded data structure. The root object still grows with the number of posts, and a small post change can require loading, mutating, and rewriting a large root JSON object.

The paged `postsIndex` is the better near-term scalability layer. It keeps timeline/range order by `localId`, makes the root manifest grow by pages instead of posts, and lets remote import read chunked-only group manifests.

## Findings

1. UnixFS/HAMT directories are excellent for large unordered name lookups, but they are not a perfect fit for group timelines. They hash path names into buckets, so lookup by one key scales well, while chronological/range reads still need an ordered index above them.
2. IPLD HAMT ADLs provide deterministic sharded maps and are useful for decentralized systems because the same contents produce the same sharding shape. That is attractive for future canonical maps such as `storageId -> asset`, but the group post timeline needs ordered ranges first.
3. IPLD ADLs are optional lenses. Using one would require every GeeSome reader implementation to understand the ADL or fall back to the raw substrate. The current JSON page manifests are simpler for existing clients and can later be wrapped by an ADL-compatible reader.
4. CARv2's indexed block archive format is useful for portable snapshots, export/import, and backup distribution. It is not the live mutable group manifest format, but it could package a group manifest plus post pages and content blocks for efficient restore or peer handoff.
5. A future ordered Merkle index could use a B-tree/prolly-tree-style layout for range proofs and smaller diffs, but that should be a protocol version after the current `postsIndex` has real production measurements.

## Direction

Keep `postsIndex` as the production path for large groups now:

- Root group manifest stores group metadata and a compact page directory.
- Each post-index page stores a contiguous `localId` range.
- Regeneration rewrites only touched pages when a previous `postsIndex` exists.
- Inline `posts` remains a compatibility layer for small groups up to the 1,000-post default cutoff, explicit callers, or operators that raise `GROUP_MANIFEST_INLINE_POSTS_LIMIT`.

Near-term backlog:

1. Keep measuring restored large groups with `database:restored-pressure` and tune `GROUP_MANIFEST_INLINE_POSTS_LIMIT` only when restored pressure shows the 1,000-post default is too low or too high.
2. Promote the opt-in `group-derived-state` queue into the default write path once restored-data rehearsal passes with `GROUP_DERIVED_STATE_ASYNC=1`. The queue already records post/group manifest and static-directory checkpoint status, uses attempt-aware failure messages, processes bounded kick batches, and can run through an interval worker.
3. Keep the manual `database:derived-state-integrity` verifier as the operator safety net.

Later protocol work:

1. Add a canonical `contentAssets`/`storageObjects` table for global physical storage identity.
2. Consider HAMT/ADL maps for unordered canonical object indexes.
3. Consider an ordered Merkle/prolly-tree-style post index only if range proofs, multi-writer merge, or very large page directories become real requirements.
4. Consider CARv2 export bundles for whole-group backup/restore and migration rehearsal artifacts.
