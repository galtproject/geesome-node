# RSS Module

## Purpose

The `rss` module generates bounded public RSS XML feeds for GeeSome group posts.

## Owns

- Group RSS route URL construction.
- Anonymous feed access checks that reject non-public groups.
- Bounded post selection for feed generation.
- RSS XML serialization with channel metadata, item dates, permalinks, text snippets, and image references.
- Feed-local text body caching to avoid repeated body reads during one render.

## Boundaries

- Post listing and content projection belong to the `group` module.
- RSS generation must stay bounded by `RSS_POSTS_LIMIT`, the hard maximum, and batched post hydration.
- Authenticated private-feed permission checks are not implemented here yet.
- RSS descriptions currently render selected post text and image tags inside CDATA, so treat this as a public rendering surface before expanding HTML output.
- Do not use RSS feed generation as a full archive export path.

## Related Docs

- [Group module overview](../../group/docs/overview.md)
- [Rich-text content format](../../../../docs/rich-text-content-format.md)
