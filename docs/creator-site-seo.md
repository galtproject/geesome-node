# Creator website SEO

Creator publications generate unique titles, descriptions, canonical URLs, Open
Graph and Twitter cards, a favicon when available, and public JSON-LD in the
initial HTML. Post descriptions use public teasers, including in the full variant;
paid full text and attachment URLs are never metadata inputs. Public preview alt
text uses the post title and preview number instead of uploaded filenames.

## Owner configuration

The existing provisioning and mutable site-settings APIs accept an optional `seo`
object. Omission preserves it when older clients replace other site settings;
`seo: {}` clears explicit overrides. Changes invalidate the publication source
version and require a new successful paired publication to affect served HTML.
No database migration is needed: settings live in the existing resource JSON.

```json
{
  "seo": {
    "title": "Creator — artwork and updates",
    "description": "A short public introduction describing the creator and membership.",
    "postTitleTemplate": "{siteTitle} - {postTitle}",
    "postDescriptionTemplate": "{postDescription}",
    "imageUrl": "/ipfs/PUBLIC_IMAGE_CID/card.webp",
    "imageAlt": "Creator artwork",
    "faviconUrl": "/ipfs/PUBLIC_ICON_CID",
    "adult": true
  }
}
```

Use actual uploaded image CIDs, not the placeholders above. Supply the other
required site-settings fields and the latest optimistic-lock `version` alongside
`seo`. Title is at most 200 characters, description 500, imageAlt 300, URLs 2048.
URLs must be HTTPS or root-relative, without credentials or protocol-relative
forms. Unknown fields and invalid values return `membership_seo_invalid` (400).

The home uses the configured SEO title, then the creator name. Posts default
to `{siteTitle} - {postTitle}` and use the optional
`postTitleTemplate` (200 characters) and `postDescriptionTemplate` (500 characters)
for the HTML title/description, Open Graph and Twitter cards. Supported literal
placeholders are `{siteTitle}`, `{postTitle}` and `{postDescription}`. The latter
uses only the public teaser with the description fallbacks below. Templates are
text, never executable code; unsupported placeholders are rejected. Omit a
stored template to reset its default. Archive/account pages have distinct titles.
Description falls back from the public post teaser to SEO description, group
description, then a generic creator introduction. When the group description is
empty, the configured description also supplies the visible profile introduction.
Post share images use the first explicitly public image Content CID, including
in the full/member variant. Private images and full text are never selected.
Without a public post image, the configured site share image is used, falling
back to the public avatar, then cover; the favicon falls
back to the public avatar. Choose an explicit suitable share image for predictable
cards. No image dimensions are invented. Sites without images use a summary card.
`adult` is explicit and is never inferred or enabled for every creator.

## Static discovery and rollout

Paired publications contain `sitemap.xml` and `robots.txt` as ordinary files in
the IPFS directory alongside HTML, CSS, JavaScript and media. The public sitemap
contains canonical HTTPS home, published post pages and archives. It never lists
accounts, API selectors or IPFS/full snapshot URLs. The full variant has an empty
sitemap and a robots file disallowing crawling.

Mount the **public** publication root on the creator domain through the existing
domain/IPFS gateway mechanism. Its relative paths then serve `/posts/N/`,
`/page/N/`, `/account/`, `/style.css`, `/public/client.js`, `/media/...`,
`/sitemap.xml` and `/robots.txt` automatically. Do not add per-file membership API
proxy routes. The domain binding must follow the newly published public root;
updating the binding is part of the operator's publication/cutover workflow.
Do not mount the full root as the public domain root.

The `membership/site/view` proxy family has been removed. Before upgrading a
site configured to use it, replace those proxy mappings with the public-root
mount. Preserve `/api/`, `/ipfs/`, administration and existing legacy assets.
Share copies `https://<domain>/posts/<id>/`, even from member/IPFS pages.
The site API selectors remain session-bound 302 redirects to public/full CIDs;
they never stream file bytes. On sign-in, payment refresh and logout the client
navigates through its explicit `snapshot.entryPath` selector, including when the
page was loaded from a domain mount. Login/account/payment APIs remain dynamic.
The legacy `/membership/site/client.js` is retained for old snapshot references.

Existing publications need regeneration to gain SEO and discovery files and the
updated access-selection client. Old immutable CIDs and their embedded clients
do not change. Accounts/full HTML retain noindex metadata. Immutable IPFS
artifacts retain noindex/nofollow headers and immutable caching; make sure the
domain gateway's public-root mount uses the correct indexable policy for stable
public HTML rather than blindly copying IPFS-copy noindex headers. Selector
responses/errors remain private/no-store and vary by Cookie and Host.

After deployment, configure the public description/images, regenerate the paired
publication, update the domain binding, and verify the final domain HTML and
HTTP headers, static sitemap, and real Telegram/Discord/X cards. Submit the stable
sitemap in Search Console separately. This code change does not configure the
production domain gateway or deploy a server.

## Remaining release checks

This change does not resize existing media, rewrite imported post titles, modify
production content or proxy configuration, deploy a server, or prove a successful
live payment. Optimize the large cover and previews separately, author missing
archive titles, and check mobile layout, keyboard navigation, login, subscription,
expiry and error recovery before public cutover.

## Post cards and canonical sharing (#1537)

Verified with the focused SEO/share/snapshot tests, creator typecheck, API-doc
smoke and route inventory, SQL/Kubo membership integration (95 tests) and payment checks (70 tests), and the
pagination browser flow (92 captures, including canonical clipboard links at
desktop/narrow widths). The two share-success screenshots were visually checked.
The general parity browser command currently stops at payment-provider control
list drift between the legacy Microwave Girls reference and the node renderer;
the targeted pagination/share workflow passes independently.
