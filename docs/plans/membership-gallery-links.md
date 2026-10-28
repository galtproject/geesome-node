# IPFS link Content and compact creator posts

## Contents

- [Contract](#contract)
- [Delivery](#delivery)
- [Verification](#verification)

## Contract

User-approved: creator posts reuse existing immutable galleries instead of copying thousands of gallery images into the creator snapshot. The group remains canonical and private; postsContents.isPrivate controls projection. Obtained old snapshots remain usable. No separate file store or encryption.

An IPFS link is general Content with MIME text/uri-list, not a special gallery model. New bodies use gateway-independent ipfs://CID/path?query#fragment URIs, one per CRLF line. Read comments, multiple URIs per Content and multiple link Contents per post. Validate CIDs with multiformats, preserve paths/fragments, reject traversal/non-IPFS targets. Keep legacy /ipfs/CID/... bodies readable. Reading is bounded by actual bytes and time. Snapshot generation retains target roots without fetching/walking their contents.

Generic rendering uses Content.name and join-row view. view=link presents a named action; other link attachments appear as ordinary named links, on both index and post pages. Never select the first URI as a gallery. Public links must not hide subscription controls for a locked post. Public output must not reveal private targets or URI Content CIDs.

MicrowaveGirls owns gallery selection: it creates a single 'View full set' named link with view=link, retains selected image previews, and resolves full-gallery images from existing gallery data for the owner editor. Rebuild replaces only the old gallery target; unrelated IPFS link attachments survive. Prepare upgrades managed posts idempotently, including links written by the prior relative-URI implementation (_membership.galleryLinksVersion=2). It preserves group identity, crops, text and access decisions, and verifies gallery availability before detaching images. No Content rows or gallery files are deleted.

## Delivery

1. GeeSome: generic URI parser, bounded link reads, projection/rendering and root holds. Site replacement verification looks for its expected root among all links, with compatible legacy metadata handling; it never assumes a post contains exactly one link.
2. MicrowaveGirls: generic raw URI writer plus domain-owned gallery wrapper; Prepare upgrade and unrelated-link preservation.
3. Release in dependency order: GeeSome then MicrowaveGirls. No schema migration or env additions. Original agent owns sequential integration and final handoff. No automatic production upgrade or new build.

Earlier production job 58cefef2-45ca-48d0-a468-8c455f0cc338 was explicitly cancelled; its temporary directories were removed. This follow-up does not mutate production.

## Verification

Focused URI/SSR tests cover actual CIDs, paths/query/fragments, legacy encoding, multiple named links, comments/CRLF, privacy and subscription controls, and actual byte limits. Real PostgreSQL/Kubo tests cover paired snapshots and permanent target references. Storage tests cover URI JSON upload and replacement finalization. Companion tests cover migration, preview editing, regeneration, unrelated links and missing-gallery safety. Browser flows exercise gallery opening, named document links and post-payment/logout privacy at desktop/narrow widths. Evidence and final counts are recorded in the PR.

Final evidence: 34 creator-module cases on disposable PostgreSQL/Kubo plus 51 payment cases; 103 MicrowaveGirls membership cases and four PostgreSQL scenarios; 21 storage/retirement cases and a targeted two-case rerun with canonical CRLF URI upload and multiple-link root selection; strict Vue types; route/scalability inventories; 50 browser captures with both gallery and document path/fragment navigation. Known unrelated aborted-multipart stress case was excluded from the storage run. Desktop and narrow full-post screenshots were inspected.
