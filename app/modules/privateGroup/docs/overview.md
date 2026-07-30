# Private Group Module

## Purpose

The `privateGroup` module owns policy that distinguishes browser-encrypted
private groups from public publishing groups while reusing the group, post,
post-content, post-event, and reconciliation foundations.

The initial capability:

- identifies new private groups with `GroupType.PrivateGroup`;
- keeps creation disabled by default until `PRIVATE_GROUP_ENABLED=1` is set;
- normalizes them to non-public, closed, encrypted groups;
- routes completed private post manifests through
  `afterPrivatePostManifestUpdate` instead of public post hooks;
- keeps shared post mutation under the original author's control;
- leaves legacy `GroupType.PersonalChat` and browser-first direct `ChatEvent`
  behavior unchanged.

## Boundary

This module is the integration point for later versioned member-device keys,
membership/key epochs, private delivery policy, and encrypted-post callbacks.
It must not receive plaintext messages, plaintext attachments, attachment keys,
or browser private keys.

Modules that intentionally process private posts must implement the private hook
explicitly. Public integrations must continue to use
`afterPostManifestUpdate`; they are not called for private-group posts.

## Current Limitations

The module does not yet create browser-facing private groups, store device-key
membership, run membership/key transitions, or migrate legacy chat events.
Those capabilities remain gated by the secure-chat implementation plan and
multi-node browser verification.

Enabling the initial capability is intended for development and compatibility
testing. It does not make private group chat ready for users.
