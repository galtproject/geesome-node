# Social Network Account Module

## Purpose

The `socNetAccount` module stores per-user credential and identity rows for social-network integrations such as Telegram, Twitter/X, and future credentialed Bluesky flows.

## Owns

- Social account rows with network name, remote account ID, username/phone/full name, app credentials, access tokens, and session keys.
- Owner-scoped create/update and account lookup.
- Bounded account listing by network.
- Test/support database flush helpers.

## Security Boundaries

- All lookups are user-scoped.
- Encrypted credential/session values are passed through from client modules; this module stores them but does not know every provider's encryption semantics.
- Feature modules must avoid returning secret material to unauthorized callers.
- Credentialed cross-post/import flows must prove account ownership before use.

## Boundaries

- Protocol-specific login/fetch logic belongs to client modules such as `telegramClient`, `twitterClient`, and future credentialed `bluesky` paths.
- Source/import post identity belongs to `socNetImport`, not account rows.
- Do not use this module for generic external identity proofs; use `foreignAccounts` for that.

## Related Docs

- [Social Network Import module overview](../../socNetImport/docs/overview.md)
- [Telegram Client module overview](../../telegramClient/docs/overview.md)
- [Twitter Client module overview](../../twitterClient/docs/overview.md)
