# Stable creator pagination rollout

Tracking: [#1461](https://github.com/galtproject/geesome-node/issues/1461).

## Generated layout

Homepage contains 10–19 posts, or all posts if fewer than ten. At twenty visible
unarchived posts, the oldest ten become the next numbered archive. For 51 posts,
home has 51..41 and archive 4 has 40..31; for 60, home has 60..51 and archive 5
has 50..41. Archive 1 retains 10..1.

Assignments persist in the paired publication's version-2 JSON manifest, shared
by public/full. New/backdated posts join the unarchived tail; dates do not move
existing assignments. Hidden/deleted posts are omitted but keep their positions;
restoration returns them to their old block. Removal can leave a shorter block
or homepage; old blocks are never refilled by shifting the archive.

Clean immutable paths are `/ipfs/<CID>/`, `/page/N/`, `/posts/N/`, `/account/`.
The suffix paths are relative to the selected CID. Each is a real folder with an
index.html. Creator hydration uses memory history and does not add fragments;
other SSG themes retain hash routing. Real Newer/Older anchors and the copyright creator name linking home work
without JavaScript. The new footer reads © Creator · Powered by GeeSome, with
GeeSome linking to the project repository; no separate Latest button is shown. Asset/post/account links stay relative to the selected snapshot.

## Reuse

Per-variant projected input and renderer/client/style/shell fingerprints reuse
old HTML CIDs instead of repeating SSR/save. Raw private input is not part of the
public projection/cache. Global total counts/page lists are absent from stable
page data. Media are linked by existing CIDs, with no gallery traversal.

A new post normally rewrites the public/full homepage, new post page and public
sitemap.
On rollover the new archive is written and the previous newest archive's Newer
link changes from home to its new neighbour; older archives remain reusable.
Branding/tariffs/template changes invalidate affected outputs. Reading the current
canonical post metadata and reconstructing directory links still occurs; this is
not a claim of constant-time database scanning. All reused CIDs retain artifact
holds and source-version/lease fencing is unchanged.

## Deploy and rebuild

Merge/update the node through the normal deployment workflow, then use **Rebuild
website snapshots**. No SQL migration, seed change, new env variable or payment
worker activation is needed. Old manifests still select their original .html
paths, and obtained immutable CIDs retain their original client/content.

The existing `/api/v1/membership/site/` selector remains available and redirects
to the session-selected immutable directory. `/site/page/N/`, `/site/posts/N/`
and `/site/account/` do the same. Legacy `?page=1` means home; `?page=2` selects
archive 1 in a version-2 publication.

## Static domain delivery

Mount the public publication's IPFS directory as the creator domain root using
the existing domain gateway. HTML pages, CSS, JavaScript, media, sitemap and robots
are ordinary files resolved relative to that root. There is no membership file
proxy. Update the domain binding when the public publication CID changes.

The former `/api/v1/membership/site/view/` family has been removed (#1492). If a
site was configured with those per-page/asset mappings, switch it to the public
root mount before upgrading. Preserve `/admin/`, `/api/`, `/ipfs/` and any legacy
assets/routing; apply only to creator domains, not the node administrator domain.

Keep the session-bound `/api/v1/membership/site/`, `/site/posts/N/`,
`/site/page/N/` and `/site/account/` selectors for discovering the current
public/full snapshot. They issue private/no-store 302 redirects after checking
site/session/entitlement and never proxy the selected file bytes. Their HEAD
responses use the same selection policy. Generated clients use these selectors
for sign-in, access refresh and logout; ordinary navigation stays directory-relative.
The old snapshot-account JavaScript route remains for immutable legacy clients.

At domain cutover, verify canonical stable URLs, indexable public-domain headers,
static CSS/JS/media/discovery files, archive links, account/login, full content
selection after payment, logout and expiry. Direct IPFS copies retain noindex;
the public-domain mount must use its intended indexing policy. No production
proxy or domain binding is changed by this implementation.

For rollback restore the prior domain binding or gateway configuration. Retain
the publication manifests and obtained immutable artifacts; no billing database
rollback or deletion of snapshots is required.
