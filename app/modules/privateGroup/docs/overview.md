# Private Group Module

## Purpose

The `privateGroup` module owns policy that distinguishes browser-encrypted
private groups from public publishing groups while reusing the group, post,
post-content, post-event, and reconciliation foundations.

The current capability:

- identifies new private groups with `GroupType.PrivateGroup`;
- keeps creation disabled by default until `PRIVATE_GROUP_ENABLED=1` is set;
- normalizes them to non-public, closed, encrypted groups;
- routes completed private post manifests through
  `afterPrivatePostManifestUpdate` instead of public post hooks;
- keeps shared post mutation under the original author's control;
- stores immutable, monotonically versioned snapshots of the private group's
  account membership and registered non-revoked public device bundles;
- serializes snapshot updates under the group row lock, rejects stale expected
  versions, and returns the current snapshot for an idempotent retry;
- requires every accepted private-group post to bind to the current membership
  snapshot in the same transaction that creates the post;
- rejects stale snapshot versions, authors absent from the selected snapshot,
  and remote private-post imports that do not yet carry a verified membership
  contract;
- exposes authenticated membership read and compare-and-set refresh routes for
  browser clients while keeping authorization in the module;
- leaves legacy `GroupType.PersonalChat` and browser-first direct `ChatEvent`
  behavior unchanged.

## Boundary

This module is the integration point for versioned member-device keys, later
membership/key epochs, private delivery policy, and encrypted-post callbacks.
It must not receive plaintext messages, plaintext attachments, attachment keys,
or browser private keys.

Membership snapshots are not MLS epochs. They record the deterministic public
device set that an accepted browser protocol transition can reference later.
Historical snapshots retain copied public bundles so revoking a device does not
rewrite the membership facts attached to older encrypted posts.

Modules that intentionally process private posts must implement the private hook
explicitly. Public integrations must continue to use
`afterPostManifestUpdate`; they are not called for private-group posts.

## Current Limitations

The module does not yet run membership/key transitions, replicate native
private posts, expose a private-group chat UI, or migrate legacy chat events.
Those capabilities remain gated by the secure-chat implementation plan and
multi-node browser verification.

Enabling the initial capability is intended for development and compatibility
testing. It does not make private group chat ready for users.
