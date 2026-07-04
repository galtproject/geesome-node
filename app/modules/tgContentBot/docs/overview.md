# Telegram Content Bot Module

## Purpose

The `tgContentBot` module runs Telegram bot flows that let approved Telegram users upload photos, save them as GeeSome content, search saved descriptions, and share IPFS links.

## Owns

- Telegram bot registration and event handlers through `MultiTelegramBot`.
- Bot/user/description models for Telegram bot access, saved content metadata, and inline search.
- Photo download from Telegram, content saving through the `content` module, and generated IPFS/gateway links.
- Description editing through callback/text command state.
- OCR-style image text extraction using Tesseract for saved-photo descriptions.

## Integration Boundaries

- User-facing file persistence belongs to `content`.
- Telegram bot access state belongs to the bot models in this module.
- This is separate from `telegramClient`; it handles bot uploads, not full account/channel import.
- Search and inline-query behavior should only expose content associated with the bot/user rules.

## Boundaries

- Validate bot users before accepting uploads or returning inline results.
- Keep OCR and Telegram download work bounded; avoid turning the bot into an unbounded background processor.
- Do not trust Telegram MIME or file metadata without content-module validation.
- Avoid leaking bot tokens or unapproved user IDs in logs.

## Related Docs

- [Content module overview](../../content/docs/overview.md)
- [Storage module overview](../../storage/docs/overview.md)
