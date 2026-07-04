# Social Network Import Module

## Purpose

The `socNetImport` module is the shared import pipeline for social-network channels, messages, related replies/reposts, local group creation, imported post identity, and import progress.

## Owns

- Local database channels and imported message records for social-network drivers.
- Channel metadata import and local group creation/reinitialization for imported sources.
- Import-range preparation, existing-message detection, source-identity lookup, and idempotent post publishing.
- Related reply/repost handling before publishing the main imported post.
- Async-operation opening for channel imports while the concrete client module runs the import loop.
- Local-ID reversal helpers for imported channels that need chronological correction.

## Async Boundaries

- This module opens async-operation records but does not own a generic durable queue for every import.
- Driver modules such as `telegramClient`, `twitterClient`, and `bluesky` provide concrete clients, fetch messages/feed items, and call `importChannelPosts`.
- Long imports must call back into `asyncOperation` for cancellation/progress through the concrete driver/client.
- Source identity is `(group/channel source fields + sourcePostId)`; retries must update the matching imported post instead of creating duplicates.

## Boundaries

- Keep protocol-specific fetch/auth logic in the driver modules.
- Store imported content through `content` and publish posts through `group` so delete safety, counters, manifests, and source identity stay consistent.
- Do not log full message/content payloads unless debug logging is enabled and payloads are safely summarized.
- New drivers must implement the `IGeesomeSocNetImportClient` contract and define source identity, reply/repost mapping, content conversion, and remote post links.

## Related Docs

- [Group module overview](../../group/docs/overview.md)
- [Content module overview](../../content/docs/overview.md)
- [Bluesky module overview](../../bluesky/docs/overview.md)
