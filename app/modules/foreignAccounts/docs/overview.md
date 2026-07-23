# Foreign Accounts Module

## Purpose

The `foreignAccounts` module stores user-linked external account claims, owner/admin provider-address lookups, and manifest proof export for authorization providers.

## Owns

- Foreign account rows with provider, address, type, title, description, and optional signature.
- Owner-scoped account create/update/list flows.
- Manifest hooks that attach foreign-account proofs to entity manifests.
- Registration hooks that validate supported providers and persist account data supplied during registration.

## Security Boundaries

- Account updates are owner-scoped.
- Addresses are normalized to lowercase before lookup/storage.
- Provider allow-list validation happens when callers invoke `beforeUserRegistering`; `afterUserRegistering` persists supplied account data.
- Provider-specific signature checks belong to authorization modules.
- Auth-message support is intended for provider login flows, but model/interface field naming should be reconciled before documenting it as a stable contract.

## Boundaries

- This module stores account claims; it does not verify Ethereum signatures itself.
- Do not store protocol credentials here. Social-network credentials belong to `socNetAccount`.
- Keep list params bounded and owner-scoped.

## Related Docs

- [Ethereum Authorization module overview](../../ethereumAuthorization/docs/overview.md)
- [Entity JSON Manifest module overview](../../entityJsonManifest/docs/overview.md)
