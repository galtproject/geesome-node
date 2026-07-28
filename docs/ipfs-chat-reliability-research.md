# Reliable IPFS Chat Research

## Scope

This document evaluates whether GeeSome chat can use IPFS/libp2p networking
reliably, especially when users communicate through known or bound IPFS nodes.
It focuses on message delivery, offline recovery, browser connectivity, and the
boundary between transport and browser-first end-to-end encryption (E2EE).

The central question is not whether PubSub can carry a live chat event. It can.
The question is whether a chat remains correct when a peer, browser tab, relay,
or PubSub subscription is unavailable at the wrong moment.

## Executive Conclusion

IPFS PubSub must not be the authoritative message store or the only delivery
path.

- PubSub messages are ephemeral. A subscriber that is offline or disconnected
  can miss them, and PubSub does not provide history or a durable consumer
  cursor.
- Kubo bootstrap peers help a node discover and enter the network. They are not
  durable chat relays and do not retain missed messages.
- Reciprocal Kubo peering is appropriate for keeping known GeeSome nodes
  connected and improving live propagation. It still cannot guarantee that a
  PubSub event is never lost.
- A reliable design persists an encrypted, signed, append-only message event
  before acknowledging it. PubSub or another communicator then carries a small
  wake-up notification. Recipients recover missed events from the durable log by
  cursor.

The practical rule is:

> Treat live network events as hints that new durable state exists. Never treat
> receiving every live event as a correctness requirement.

With this design, bound nodes can communicate reliably even when PubSub events
are lost. Reliability comes from store-and-forward and reconciliation, while
peering improves latency and availability.

## What IPFS PubSub Guarantees

libp2p GossipSub creates a live mesh and forwards messages among connected
subscribers. It includes gossip, deduplication, and mesh-repair behavior that
makes active delivery reasonably resilient. These features do not make it a
durable queue.

Important limits:

- There is no retained topic history for a peer that subscribes later.
- There is no application delivery acknowledgement.
- There is no per-recipient durable cursor.
- There is no guaranteed global ordering.
- Repeated message identifiers are deduplicated only within bounded caches.
- A network partition, process restart, suspended browser, or temporary
  subscription failure can lose a notification.

IPFS documentation explicitly describes PubSub messages as ephemeral. IPNS over
PubSub adds a persistence layer because PubSub itself does not retain records.
The libp2p documentation similarly describes discovery as an external concern
and the mesh as a live propagation mechanism.

Kubo also warns that its PubSub configuration is optimized for IPNS. An
application needing custom validation, message identity, or deduplication should
consider a dedicated libp2p PubSub service. A dedicated service can improve
control and isolation, but it still needs durable application storage for chat.

## Bootstrap, Peering, And Reachability

### Bootstrap peers

Kubo bootstrap addresses are initial discovery entry points. They help a node
find peers after startup. Adding a GeeSome node to another node's bootstrap list
does not create:

- a permanent connection;
- a reciprocal trust relationship;
- a message mailbox;
- replay of events published while either node was offline.

Bootstrap configuration alone is therefore insufficient for reliable chat.

### Reciprocal peering

Kubo `Peering.Peers` is a better fit for known GeeSome home nodes. Kubo attempts
to remain connected to configured peers, protects those connections from normal
connection management, and reconnects with backoff. Configure the relationship
on both nodes; asymmetric peering can be unstable under load.

Peering improves the chance and speed of live delivery. It does not replace:

- persistent encrypted message storage;
- send acknowledgement after persistence;
- retry with an idempotency key;
- cursor-based catch-up after reconnection;
- replication and retention policy.

### Browsers and NAT

Browser libp2p cannot assume that it can dial any Kubo node directly. The
deployment must expose a browser-compatible secure transport such as
WebTransport, or provide a compatible WebRTC/relay path. NAT, firewalls,
certificate requirements, address advertisement, AutoNAT, hole punching, and
relay capacity must be tested in the real deployment.

For the first reliable version, the browser can use the authenticated GeeSome
HTTP/WebSocket API for durable send and sync while nodes use libp2p/Fluence for
optional low-latency hints and replication. Direct browser libp2p can be added
without changing the message contract.

## Patterns From Working Systems

### OrbitDB

OrbitDB combines an append-only replicated log with libp2p networking. Its sync
protocol exchanges durable log heads when peers join, while PubSub announces
new changes. If an announcement is missed, peers can still reconcile from the
log.

This is the most directly reusable architecture for GeeSome:

1. persist signed events;
2. exchange or request the latest durable position;
3. use PubSub only to reduce update latency;
4. reconcile after reconnect.

GeeSome does not need to adopt OrbitDB wholesale. PostgreSQL can hold the
operational encrypted event log, while IPLD checkpoints or batches can provide
portable, content-addressed replication later.

### Berty/Wesh

Berty is an offline-first peer-to-peer messenger. Its Wesh protocol builds
group communication on IPFS/libp2p and an OrbitDB-derived replicated log rather
than relying on transient PubSub events alone. The project also warns that parts
of the protocol remain unstable or not fully hardened, so it is an architecture
reference rather than a drop-in security dependency.

### Waku

Waku separates live Relay from Store-based historical recovery. Lightpush
acknowledges that one peer accepted a message, not that the whole network or
recipient received it. Clients query stores to recover history and should not
assume one store is always available.

The useful lesson is to expose different delivery states instead of one
ambiguous "sent" state.

### Matrix

Matrix homeservers persist room history and clients synchronize an event graph.
Its E2EE model also treats each device as a cryptographic participant. This
supports offline delivery and multi-device use because history synchronization
and key distribution are explicit protocol concerns.

The useful lesson is that account identity alone is insufficient. Device
identity, device trust, key rotation, and removed-device behavior must be part
of the GeeSome protocol.

## Current GeeSome Behavior

The current implementation is not reliable E2EE:

- `geesome-ui` saves plaintext content and asks `geesome-node` to create a post.
- `geesome-node` encrypts a manifest reference for personal chat using key
  material available on the node. The node therefore participates in plaintext
  and key handling.
- The chat page subscribes to communicator events and fetches a post by the
  received `postId`.
- The historical group listener attempted reconnect and resubscribe behavior,
  but had no durable cursor, acknowledgement, or replay contract.
- The current communicator is Fluence-backed when enabled, with a disabled
  maintenance implementation. Its publish path is not a durable chat store.
- `geesome-libs` has a versioned opaque-envelope experiment, but it uses
  Node-specific cryptographic APIs and direct RSA key wrapping. It is not yet a
  reviewed browser group-chat protocol.

These details mean changing Fluence to Kubo PubSub would not solve delivery or
E2EE. The message and synchronization contract must be made durable first.

## Recommended GeeSome Architecture

### Authoritative encrypted event log

Persist one immutable opaque event for each chat operation. A versioned event
contract should include:

- `eventId` or `messageId`, generated by the sending device;
- `conversationId`;
- event type and protocol version;
- sender account and sender device identifiers;
- sender sequence and/or logical ordering metadata;
- creation time as advisory metadata;
- ciphertext and cryptographic suite/session metadata;
- encrypted attachment references;
- membership epoch or key-generation identifier;
- sender signature;
- optional previous-event or checkpoint references.

The node must validate only public envelope constraints, authorization,
signatures, sizes, and identifiers. It must not require plaintext or device
private keys.

### Send and acknowledgement flow

1. The browser creates the event ID, encrypts and signs the event, and stores it
   in a local outbox before network transmission.
2. The browser sends the same event ID on every retry.
3. A GeeSome node authorizes the sender, validates the opaque envelope, and
   inserts it idempotently.
4. The node acknowledges durable local acceptance only after the transaction
   commits.
5. Replication workers forward the opaque event to the configured home/group
   replicas.
6. The communicator publishes only an event pointer, conversation identifier,
   and durable position as a live hint.
7. A recipient uses the hint or normal polling/streaming wake-up to request all
   events after its durable cursor.
8. The browser verifies, decrypts, and advances its device cursor.

Losing every PubSub notification in step 6 must delay delivery, not lose data.

### Delivery states

Expose precise states:

- `pending`: retained in the browser outbox;
- `accepted`: durably stored by the first node;
- `replicated`: stored by the configured minimum number of replicas;
- `delivered`: fetched and acknowledged by a recipient device;
- `read`: explicitly marked by a recipient device when enabled.

Receipts are separate signed events. They must not mutate or reveal message
plaintext.

### Offline and multi-device sync

Each device maintains a durable conversation cursor. The sync API must:

- return events after a cursor in deterministic order;
- support bounded pages and continuation cursors;
- tolerate duplicate requests and duplicate events;
- identify retention gaps that require a checkpoint/full resync;
- synchronize membership and key epochs before decrypting later messages;
- keep per-device delivery state separate from account-level state.

### Store-and-forward replicas

Each conversation needs an explicit availability policy. A reasonable first
policy is:

- the sender's home node accepts the event;
- the recipient's home node or a group home node receives an encrypted replica;
- the sender can require a configurable replication count before displaying
  `replicated`;
- retention and quota failures are reported, never hidden behind a successful
  PubSub publish.

IPFS/IPLD can store encrypted event batches and attachment ciphertext. Pinning
and replication must last at least as long as the conversation retention policy.
PostgreSQL remains the efficient operational index for authorization, cursors,
delivery state, and retries.

### Encrypted attachments

The browser encrypts every attachment with a random content key before upload.
Only ciphertext is added to IPFS. The message envelope contains:

- the ciphertext CID;
- authenticated media metadata needed for rendering;
- integrity information;
- the attachment key wrapped by the selected E2EE session protocol.

The node may enforce ciphertext size and retention limits without learning the
file contents. Missing pins or blobs must produce recoverable delivery errors.

### Topic and metadata privacy

Encryption does not hide topic names, peer relationships, timing, or payload
size. Do not derive public topic names directly from usernames, static IDs, or
human-readable group names. Prefer opaque, rotatable topic identifiers or direct
streams. Apply padding or batching only after measuring the threat and cost.

### Cryptographic protocol choice

Do not turn the existing envelope experiment into a custom production group
protocol without a focused review. Choose and document a maintained,
browser-capable implementation of MLS, Matrix's established device/session
model, or another reviewed protocol. The transport envelope should carry an
opaque versioned protocol payload so the storage and sync layer does not depend
on one cryptographic suite.

Required decisions include:

- device enrollment and verification;
- account recovery and device revocation;
- forward secrecy and post-compromise expectations;
- one-to-one and group-session behavior;
- membership removal and key epoch changes;
- attachment key derivation/wrapping;
- metadata leakage;
- protocol upgrade and legacy-conversation migration.

## Bound-Node Deployment Recommendation

For known GeeSome nodes:

1. Configure reciprocal Kubo `Peering.Peers`; do not rely on bootstrap entries
   as connection pinning.
2. Keep bootstrap nodes for initial wider-network discovery.
3. Advertise and test reachable transports, TLS certificates, relays, AutoNAT,
   and hole punching where direct connectivity is expected.
4. Run a persistent store-and-forward worker independently of PubSub
   subscriptions.
5. Reconcile durable cursors on startup, reconnect, and periodically while
   connected.
6. Monitor peer connection state, replication lag, oldest unreplicated event,
   retry counts, retention failures, and cursor gaps.
7. Apply rate limits, quotas, authorization, and spam controls before accepting
   durable events.

This arrangement is reliable under lost PubSub events because PubSub is not part
of the correctness boundary.

## Required Reliability Tests

The implementation is not complete until deterministic tests cover:

- sender and recipient offline independently and together;
- 100% of live PubSub/communicator hints dropped;
- duplicate, delayed, and reordered hints and sync responses;
- node restart immediately before and after durable acknowledgement;
- browser refresh, suspended tab, local outbox restart, and retry;
- network partition followed by cursor reconciliation;
- asymmetric and reciprocal peering under reconnect pressure;
- direct, relayed, NAT-restricted, and unavailable peer paths;
- two recipient devices with different durable cursors;
- device addition, removal, compromise, and key rotation;
- group membership change during offline sending;
- replica unavailable, database/storage full, and retention expiry;
- encrypted attachment missing, corrupted, oversized, or unpinned;
- invalid signatures, unauthorized senders, replay, and message-ID collision;
- confirmation that the node and transport cannot recover plaintext.

## Recommended Delivery Phases

1. Freeze a transport-independent event, cursor, acknowledgement, and
   replication contract.
2. Implement idempotent opaque event persistence and cursor backfill in
   `geesome-node`.
3. Add local browser outbox and sync behavior before enabling live hints.
4. Select and integrate the reviewed browser E2EE/device protocol.
5. Add encrypted attachments, membership epochs, device trust, and recovery.
6. Add communicator hints and reciprocal node peering as latency improvements.
7. Add IPLD encrypted-log checkpoints/replication after the operational path is
   proven.
8. Migrate or explicitly retire legacy server-encrypted chats.

## Sources

- [IPFS: IPNS and PubSub persistence](https://docs.ipfs.tech/concepts/ipns/)
- [libp2p: Publish/Subscribe](https://docs.libp2p.io/concepts/pubsub/)
- [libp2p GossipSub v1.1 specification](https://github.com/libp2p/specs/blob/master/pubsub/gossipsub/gossipsub-v1.1.md)
- [libp2p PubSub delivery semantics discussion](https://github.com/libp2p/notes/issues/19)
- [libp2p security considerations](https://docs.libp2p.io/concepts/security/security-considerations/)
- [Kubo configuration: Bootstrap, Peering, PubSub, and transports](https://github.com/ipfs/kubo/blob/master/docs/config.md)
- [libp2p hole punching](https://docs.libp2p.io/concepts/hole-punching/)
- [OrbitDB Sync API](https://api.orbitdb.org/module-Sync.html)
- [Berty repository](https://github.com/berty/berty)
- [Wesh protocol repository](https://github.com/berty/weshnet)
- [Waku protocols](https://docs.waku.org/learn/concepts/protocols/)
- [Waku node storage and synchronization options](https://docs.waku.org/run-node/config-options)
- [Matrix client-server and E2EE specification](https://spec.matrix.org/latest/client-server-api/)
