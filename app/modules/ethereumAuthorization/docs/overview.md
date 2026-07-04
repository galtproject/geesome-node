# Ethereum Authorization Module

## Purpose

The `ethereumAuthorization` module verifies Ethereum account ownership for login and invite/register flows by checking signed GeeSome messages.

## Owns

- Creating login auth messages for known Ethereum foreign accounts.
- Verifying auth-message signatures and returning the matching GeeSome user.
- Registration-hook validation for Ethereum foreign-account signatures.
- GeeSome message construction that binds signatures to the node static identity.

## Security Boundaries

- Login must match auth-message ID, address, foreign account, and signature.
- Registration signatures are required for Ethereum foreign accounts unless an admin registration path is explicitly allowed.
- Signature verification is delegated to `geesome-libs` Ethereum helpers.
- Dependency fallback info logs are suppressed unless they are meaningful.

## Boundaries

- This module verifies ownership; it does not store foreign account rows directly.
- Do not treat a foreign account claim as trusted until the provider-specific signature check passes.
- Keep generated auth messages short-lived at the product level when expiration semantics are added.

## Related Docs

- [Foreign Accounts module overview](../../foreignAccounts/docs/overview.md)
- [Static ID module overview](../../staticId/docs/overview.md)
