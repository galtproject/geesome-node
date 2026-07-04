# Invite Module

## Purpose

The `invite` module manages invite-code creation, rate-limited status checks and join flows, invite-derived permissions, limits, and optional group membership.

## Owns

- Invite records, creator ownership, active/exhausted status, usage counts, and joined-user pivots.
- Public invite status and register-by-code flows with separate status and failed-join IP rate limiters.
- Invite-created user API key generation with invite permissions.
- Optional invite-provided user limits and groups-to-join.
- Register messages used by signature-verified registration flows.
- Invite code generation with configured length and minimum entropy.
- Structured public invite API errors with error codes, retry metadata, and agent-action hints.

## Security Boundaries

- Invite creation/update requires `AdminAddUser` and creator ownership for updates.
- Invite status should expose only bounded public information.
- Join flows must run invite preflight before creating a user.
- Optional required-permission checks should fail before registration.
- Invite group joins are optional and must not make the whole registration fail when a group add is unavailable.

## Boundaries

- User creation and API key generation remain app/database responsibilities.
- Signature validation is delegated to modules such as `ethereumAuthorization`.
- Keep invite codes random and bounded; do not let clients set their own invite code.

## Related Docs

- [API module overview](../../api/docs/overview.md)
- [Ethereum Authorization module overview](../../ethereumAuthorization/docs/overview.md)
