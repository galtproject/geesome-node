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

The home uses the configured SEO title, then the creator name. Posts use their
own title plus creator name, and archive/account pages have distinct titles.
Description falls back from the public post teaser to SEO description, group
description, then a generic creator introduction. When the group description is
empty, the configured description also supplies the visible profile introduction.
The share image falls back to the public avatar, then cover; the favicon falls
back to the public avatar. Choose an explicit suitable share image for predictable
cards. No image dimensions are invented. Sites without images use a summary card.
`adult` is explicit and is never inferred or enabled for every creator.

## Discovery and rollout

Paired publications contain `sitemap.xml` and `robots.txt`. The public sitemap
contains the canonical HTTPS home, published post pages and archives. It never
lists accounts, API selectors or IPFS/full snapshot URLs. Discovery from the
stable routes always uses the public variant, regardless of the reader cookie.

In addition to the existing website proxy mappings, map these exact public paths
on each configured creator host (preserving the original Host header):

- `/sitemap.xml` to `/api/v1/membership/site/view/sitemap.xml`
- `/robots.txt` to `/api/v1/membership/site/view/robots.txt`

Both support GET and HEAD. Existing publications lack discovery files and need
regeneration. Public stable HTML remains indexable. Accounts and entitled full
HTML remain noindex; immutable IPFS artifacts retain noindex/nofollow and immutable
caching. Stable content and discovery responses remain private/no-store.

After deploying the reviewed code, configure the public description/images,
regenerate the paired publication, and verify the final domain HTML and HTTP
headers, sitemap, and real Telegram/Discord/X cards. The immutable audit CID will
not change. Submit the stable sitemap in Search Console separately.

## Remaining release checks

This change does not resize existing media, rewrite imported post titles, modify
production content or proxy configuration, deploy a server, or prove a successful
live payment. Optimize the large cover and previews separately, author missing
archive titles, and check mobile layout, keyboard navigation, login, subscription,
expiry and error recovery before public cutover.
