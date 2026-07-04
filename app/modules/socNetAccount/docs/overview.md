# Social Network Account Module

## Purpose

The `socNetAccount` module stores per-user credential and identity rows for social-network client modules, currently Telegram, Twitter/X, and Bluesky/ATProto.

## Owns

- Social account rows with network name, remote account ID, username/phone/full name, app credentials, access tokens, and session keys.
- Owner-scoped create/update and account lookup by local id or provider identity.
- Bounded account listing by network.
- Test/support database flush helpers.

## Security Boundaries

- All lookups are user-scoped.
- Create/update must not fall back to `{userId}` alone; provider identity such as `(socNet, accountId)`, `(socNet, username)`, or `(socNet, phoneNumber)` is required unless a local id is supplied.
- Encrypted credential/session values are passed through from client modules; this module stores them but does not know every provider's encryption semantics.
- Module API responses must sanitize secret credential/session fields such as API keys, access tokens, and session keys, exposing only safe `has*` flags when needed.
- Feature modules must avoid returning secret material to unauthorized callers.
- Credentialed cross-post/import flows must prove account ownership before use.

## Boundaries

- Protocol-specific login/fetch logic belongs to client modules such as `telegramClient` and `twitterClient`.
- Bluesky login, profile lookup, and account ownership verification belong to `bluesky`; this module only stores the resulting user-scoped row.
- Source/import post identity belongs to `socNetImport`, not account rows.
- Do not use this module for generic external identity proofs; use `foreignAccounts` for that.

## Related Docs

- [Social Network Import module overview](../../socNetImport/docs/overview.md)
- [Bluesky module overview](../../bluesky/docs/overview.md)
- [Telegram Client module overview](../../telegramClient/docs/overview.md)
- [Twitter Client module overview](../../twitterClient/docs/overview.md)
