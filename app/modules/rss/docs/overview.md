# RSS Module

## Purpose

The `rss` module generates RSS feeds for GeeSome group posts.

## Owns

- Group RSS route URL construction.
- Public/private group feed access checks.
- Bounded post selection for feed generation.
- RSS XML serialization with channel metadata, item dates, permalinks, text snippets, and image references.
- Feed-local text body caching to avoid repeated body reads during one render.

## Boundaries

- Post listing and content projection belong to the `group` module.
- RSS generation must stay bounded by `RSS_POSTS_LIMIT`, the hard maximum, and batched post hydration.
- Feed text/HTML output is a public rendering surface; keep sanitization and escaping policy aligned with post render safety work.
- Do not use RSS feed generation as a full archive export path.

## Related Docs

- [Group module overview](../../group/docs/overview.md)
- [Rich-text content format](../../../../docs/rich-text-content-format.md)
