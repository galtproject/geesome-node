# Telegram Client Module

## Purpose

The `telegramClient` module connects user Telegram accounts, reads Telegram channels/users/messages, downloads media, and imports channel history into GeeSome through the shared social-network import pipeline.

## Owns

- Telegram login flows, including phone-code, QR-code, password, session key, and `socNetAccount` persistence.
- Telegram client creation from stored account data.
- User/channel lookup, channel metadata import, media download, and remote post links.
- Telegram-specific `IGeesomeSocNetImportClient` implementation for messages, replies, reposts, media, and properties.
- Async channel import startup and progress/cancellation callbacks through `asyncOperation`.

## Integration Boundaries

- Account and credential records belong to `socNetAccount`.
- Channel/message/post persistence belongs to `socNetImport` and `group`.
- Uploaded Telegram media must go through `content`.
- Protocol fetch/auth logic should stay here instead of leaking into `socNetImport`.
- Long imports must call `asyncOperation.handleOperationCancel` and update progress at safe checkpoints.

## Boundaries

- Keep session material encrypted when the selected account mode requires it.
- Keep import ranges bounded by advanced settings and existing channel state.
- Do not log full message/media payloads unless debug logging is enabled and safely summarized.
- Preserve Telegram message identity so retries update existing imported posts instead of duplicating them.

## Related Docs

- [Social Network Import module overview](../../socNetImport/docs/overview.md)
- [Async Operation module overview](../../asyncOperation/docs/overview.md)
- [Social Network Account module](../../../../docs/modules.md)
