# Remote Content Moderation Helpers

## Purpose

`remoteContentModeration` provides reusable policy helpers for deciding whether remote social content can become or remain a visible GeeSome post.

This is a helper area, not a bootstrapped runtime module. Protocol modules such as `activityPub` and `bluesky` import the helpers before they create, update, or keep visible posts from remote sources.

## Owns

- Normalization of moderation modes:
  - `autoImport`: allow verified user-requested/trusted source content unless a filter matches.
  - `reviewFirst`: keep remote content out of visible posts until a review/import flow accepts it.
- Bounded keyword and regex rule evaluation over:
  - post text;
  - source actor/handle/display name/domain-like values supplied by the caller;
  - target group or subscription group name.
- Rule actions:
  - `block`;
  - `quarantine`;
  - `review`.
- Importability decisions and compact summaries for route/API results.

## Boundaries

- These helpers do not store policy on their own. Owning modules decide where policy lives, such as a source subscription row or future admin settings.
- These helpers do not create review queues. If a decision is `review`, the caller must either store a review object or skip visible post creation until a review path exists.
- Regex support is intentionally bounded by rule count, pattern length, target length, invalid-pattern checks, and a small unsafe-shape guard. Do not use it as a general-purpose regex execution service.
- A passing moderation decision is not enough by itself. Callers still need source identity, ownership, signature/record verification, sanitization, idempotency, and attachment policy checks.

## Current Integrations

- `bluesky` source refreshes apply the stored subscription policy before importing projected ATProto posts through `socNetImport`.
- `bluesky` source sync applies the same policy before keeping or updating already imported posts visible.

## Related Docs

- [Bluesky module overview](../../bluesky/docs/overview.md)
- [ActivityPub and Bluesky user flows](../../activityPub/docs/activitypub-user-flows.md)
