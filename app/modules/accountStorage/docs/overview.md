# Account Storage Module

## Purpose

The `accountStorage` module stores local and remote static-id account key records used by static identity, communicator, and group binding flows.

## Owns

- Local peer/static-id account creation with encrypted private keys and public keys.
- Remote static account records with public keys only.
- Name, user, and group scoped static-id lookup helpers.
- Static-id public key and encrypted private-key lookup.
- Static account rename, group binding updates, and deletion helpers.

## Security Boundaries

- Local private keys are encrypted with the configured app/storage pass before persistence.
- Remote accounts must not contain private keys.
- Static-id account ownership checks should use user/group scoped helpers before binding or deleting.
- The module has no public API by default; callers should go through higher-level static ID flows.

## Boundaries

- Static ID history and current binding state belong to `staticId`.
- Online publication/discovery belongs to `communicator`.
- Do not treat account name alone as proof of ownership when user/group scope is required.

## Related Docs

- [Static ID module overview](../../staticId/docs/overview.md)
- [Communicator module overview](../../communicator/docs/overview.md)
