# Twitter Client Module

## Purpose

The `twitterClient` module connects Twitter/X accounts, reads timelines/users/media, and imports tweet history into GeeSome through the shared social-network import pipeline.

## Owns

- Twitter/X credential validation and account persistence through `socNetAccount`.
- Read-only client creation from stored app/user credentials.
- User/channel lookup, timeline pagination, rate-limit-aware fetch sizing, and tweet/media parsing.
- Twitter-specific `IGeesomeSocNetImportClient` implementation for tweets, replies, reposts, media, and remote links.
- Async channel import startup, progress updates, cancellation checks, and post local-ID reversal after import.

## Integration Boundaries

- Account credentials belong to `socNetAccount`.
- Imported channel/message/post state belongs to `socNetImport` and `group`.
- Media downloads and content rows belong to `content`.
- Timeline fetch/parsing stays here; the shared import pipeline should stay protocol-agnostic.

## Boundaries

- Keep timeline pagination bounded and responsive to API rate-limit behavior.
- Preserve source identity so retries and forced imports update the intended posts.
- Do not bypass `socNetImport` for publishing imported tweets.
- Avoid logging raw timeline/media payloads outside debug-safe helpers.

## Related Docs

- [Social Network Import module overview](../../socNetImport/docs/overview.md)
- [Async Operation module overview](../../asyncOperation/docs/overview.md)
- [Content module overview](../../content/docs/overview.md)
