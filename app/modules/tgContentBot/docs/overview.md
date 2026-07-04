# Telegram Content Bot Module

## Purpose

The `tgContentBot` module runs registered Telegram webhook bots for photo upload, GeeSome content saving, description/OCR metadata, inline description search, and gateway/IPFS link sharing.

## Owns

- Telegram bot registration and event handlers through `MultiTelegramBot`.
- Bot/user/description models for Telegram bot access, saved content metadata, and inline search.
- Bot token encryption/hash storage, webhook setup, command registration, bot listing, and user-add API flows.
- Photo download from Telegram, content saving through the `content` module, and generated IPFS/gateway links.
- Description editing through callback/text command state.
- OCR-style image text extraction using Tesseract for saved-photo descriptions.
- Upload quota accounting through the content module.

## Integration Boundaries

- User-facing file persistence belongs to `content`.
- Telegram bot access state belongs to the bot models in this module.
- This is separate from `telegramClient`; it handles bot uploads, not full account/channel import.
- Current inline search is scoped by bot and search text, not by individual Telegram user.

## Boundaries

- Validate Telegram-user mapping before accepting uploads.
- Keep OCR and Telegram download work bounded; avoid turning the bot into an unbounded background processor.
- Do not trust Telegram MIME or file metadata without content-module validation.
- Avoid leaking bot tokens or unapproved user IDs in logs.

## Related Docs

- [Content module overview](../../content/docs/overview.md)
- [Storage module overview](../../storage/docs/overview.md)
