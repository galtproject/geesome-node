# Foreign Accounts Module

## Purpose

The `foreignAccounts` module stores user-linked external account identities and auth-message records used by authorization providers.

## Owns

- Foreign account rows with provider, address, type, title, description, and optional signature.
- Owner-scoped account create/update/list flows.
- Auth-message creation and lookup for account-proof login flows.
- Manifest hooks that attach foreign-account proofs to entity manifests.
- Registration hooks that validate supported providers and persist account data supplied during registration.

## Security Boundaries

- Account updates are owner-scoped.
- Addresses are normalized to lowercase before lookup/storage.
- Provider validation happens during registration hooks; provider-specific signature checks belong to authorization modules.
- Auth messages are proof material and should remain tied to provider, address, and user account.

## Boundaries

- This module stores account claims; it does not verify Ethereum signatures itself.
- Do not store protocol credentials here. Social-network credentials belong to `socNetAccount`.
- Keep list params bounded and owner-scoped.

## Related Docs

- [Ethereum Authorization module overview](../../ethereumAuthorization/docs/overview.md)
- [Entity JSON Manifest module overview](../../entityJsonManifest/docs/overview.md)
