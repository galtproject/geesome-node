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
other SSG themes retain hash routing. Real Newer/Older/Latest anchors work without
JavaScript. Asset/post/account links stay relative to the selected snapshot.

## Reuse

Per-variant projected input and renderer/client/style/shell fingerprints reuse
old HTML CIDs instead of repeating SSR/save. Raw private input is not part of the
public projection/cache. Global total counts/page lists are absent from stable
page data. Media are linked by existing CIDs, with no gallery traversal.

A new post normally rewrites only the public/full homepage and new post page.
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

## Stable domain delivery

For SEO, the new `/api/v1/membership/site/view/` family streams pre-rendered HTML
without redirecting to a CID. Public pages have canonical metadata for their
stable domain path; full/account HTML are noindex. All responses are
`private, no-store`, vary by Cookie/Host and bypass range/conditional cache reuse.
Safe external document navigation is allowed; Host binding and ordinary API
cross-origin restrictions remain enforced. Session changes reload the current
stable document, while immutable-CID readers use the original selector policy.

Changing the currently deployed creator-domain homepage from MicrowaveGirls SSR
to this handler is a separate **operator cutover**, after the new snapshots have
been verified. No production nginx changes are applied by this implementation.
Keep `/admin/`, existing `/api/v1/`, `/ipfs/` and any legacy assets/routing intact.
Map only the selected creator domains, never the node administrator domain.

Example shared proxy snippet (install as
`/etc/nginx/snippets/geesome-creator-proxy.conf`):

```nginx
proxy_pass https://geesome.microwavedev.io;
proxy_ssl_server_name on;
proxy_ssl_name geesome.microwavedev.io;
proxy_set_header Host $host;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_read_timeout 300s;
proxy_buffering off;
proxy_cache off;
```

Inside each creator-domain server block, after backing up its nginx file:

```nginx
location = / {
    rewrite ^ /api/v1/membership/site/view/ break;
    include /etc/nginx/snippets/geesome-creator-proxy.conf;
}
location ~ "^/(page/[1-9][0-9]*|posts/[1-9][0-9]*|account)/?$" {
    rewrite ^/(.*)$ /api/v1/membership/site/view/$1 break;
    include /etc/nginx/snippets/geesome-creator-proxy.conf;
}
location ~ "^/(style\.css|public/client\.js|media/[a-f0-9]{64}\.[a-z0-9]{1,16})$" {
    rewrite ^/(.*)$ /api/v1/membership/site/view/$1 break;
    include /etc/nginx/snippets/geesome-creator-proxy.conf;
}
```

Check location precedence against existing ^~ prefixes and test `nginx -t`
before reload. Preserve the upstream node's existing Host-preserving API route.
At the CDN, bypass caching for these session-selected documents/assets; never
configure a cache-everything rule on them. Do not cache redirects or errors.

Validate anonymous page HTML, canonical URL, old/new navigation, CSS/JS/media,
Google login, full content after verified access, logout and expired session.
Top-level links from external sites must work. Requests for unpublished post/page
ids and unknown media must return 404. The IPFS copy remains noindex through the
existing artifact headers; only public stable documents should be indexed.

For rollback restore the creator-domain proxy config. Keep the authoritative
publication manifest and immutable artifacts; restoring an old billing database
or discarding already received CIDs is unnecessary and unsafe.
