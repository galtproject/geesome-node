# Communicator Module

## Purpose

The `communicator` module provides the network communication adapter for static-id lookup/binding, node/boot-node management, pubsub events, and peer discovery.

## Owns

- Runtime selection of the Fluence-backed communicator, with a maintenance-mode disabled implementation.
- Static ID account lookup, binding, resolution, and key lookup delegation.
- Boot-node and node-address service methods consumed by API routes.
- Authorized private-key export route for communicator key material; treat responses as secrets.
- Pubsub publish/subscribe helpers for generic topics and static-id update topics.
- Peer discovery helpers for static IDs, topics, and account/group update topics.

## Integration Boundaries

- Account key storage belongs to `accountStorage`.
- Static ID history and product-level binding decisions belong to `staticId`.
- Content/group modules should use communicator through higher-level static-ID helpers where possible.
- Maintenance mode returns safe no-op/null/empty results so the app can run without network propagation.

## Boundaries

- Treat communicator as online propagation/discovery, not durable storage.
- Do not depend on PubSub or Fluence event delivery for critical state
  transitions without database-backed state, idempotent writes, remote
  acknowledgement, retry, and sequence/head reconciliation.
- For chat, publish only a pointer to an already persisted opaque event. A
  dropped communicator event between running nodes must be recoverable through
  head comparison and missing-event fetch.
- Bootstrap peers provide discovery. Reciprocal peering can improve live
  availability, but neither is a delivery acknowledgement or retained mailbox.
- Keep disabled-mode behavior predictable for tests, maintenance, and local-only nodes.
- Avoid exposing low-level peer/network details where product-level static IDs are enough.

## Related Docs

- [Static ID module](../../../../docs/modules.md)
- [Account Storage module](../../../../docs/modules.md)
- [Reliable IPFS chat research](../../../../docs/ipfs-chat-reliability-research.md)
