# Reliable IPFS Chat Research

## Scope

This document evaluates whether GeeSome chat can use IPFS/libp2p networking
reliably, especially when users communicate through known or bound IPFS nodes.
It focuses on preventing content loss between running GeeSome/IPFS nodes,
browser connectivity, and the boundary between transport and browser-first
end-to-end encryption (E2EE).

The central question is not whether PubSub can carry a live chat event. It can.
The question is whether a chat remains correct when a peer, browser tab, relay,
or PubSub subscription temporarily fails at the wrong moment.

The primary availability assumption is that GeeSome nodes and their IPFS nodes
normally remain running. Delayed node-to-node delivery is also useful: when a
recipient node is temporarily unreachable, the sending node should persist an
encrypted outbound queue and retry when the recipient returns. This is a
server-side ciphertext queue, not plaintext browser storage or PubSub history.

## Executive Conclusion

IPFS PubSub must not be the authoritative message store or the only delivery
path.

- PubSub messages are ephemeral. A running subscriber can still miss an event
  during mesh repair, a transient disconnect, resubscription, or process
  restart.
- Kubo bootstrap peers help a node discover and enter the network. They are not
  durable chat relays and do not retain missed messages.
- Reciprocal Kubo peering is appropriate for keeping known GeeSome nodes
  connected and improving live propagation. It still cannot guarantee that a
  PubSub event is never lost.
- A reliable design persists and pins an encrypted, signed message event before
  publishing it. PubSub or another communicator carries its content pointer and
  sequence/head. The receiving node fetches, persists, and acknowledges the
  event. Missing acknowledgements trigger retry, and periodic head reconciliation
  repairs missed notifications.
- If the recipient node is unavailable, the sender retains a persistent outbound
  queue entry and the referenced IPFS pins until remote acknowledgement or an
  explicit expiry/permanent failure policy applies.

The practical rule is:

> Treat live network events as hints that new durable state exists. Never treat
> receiving every live event as a correctness requirement.

With this design, running bound nodes can communicate reliably even when PubSub
events are lost. Reliability comes from persist-before-publish,
durable queued retry, acknowledgement, and anti-entropy reconciliation, while
peering improves latency and availability.

## What IPFS PubSub Guarantees

libp2p GossipSub creates a live mesh and forwards messages among connected
subscribers. It includes gossip, deduplication, and mesh-repair behavior that
makes active delivery reasonably resilient. These features do not make it a
durable queue.

Important limits:

- There is no retained topic history for a peer that subscribes later.
- There is no application delivery acknowledgement.
- There is no application acknowledgement that a remote node fetched and
  retained the referenced content.
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
- repair of a notification missed during a transient disconnect.

Bootstrap configuration alone is therefore insufficient for reliable chat.

### Reciprocal peering

Kubo `Peering.Peers` is a better fit for known GeeSome home nodes. Kubo attempts
to remain connected to configured peers, protects those connections from normal
connection management, and reconnects with backoff. Configure the relationship
on both nodes; asymmetric peering can be unstable under load.

Peering improves the chance and speed of live delivery. It does not replace:

- persist-and-pin before publish;
- remote acknowledgement after fetch and persistence;
- a persistent retry queue keyed by destination and idempotent event ID;
- periodic sequence/head reconciliation;
- content pinning until remote acknowledgement.

### Browsers and NAT

Browser libp2p cannot assume that it can dial any Kubo node directly. The
deployment must expose a browser-compatible secure transport such as
WebTransport, or provide a compatible WebRTC/relay path. NAT, firewalls,
certificate requirements, address advertisement, AutoNAT, hole punching, and
relay capacity must be tested in the real deployment.

For the first reliable version, the browser can use the authenticated GeeSome
HTTP/WebSocket API to submit encrypted content to its running node. Nodes can
use libp2p/Fluence for live content-pointer exchange, acknowledgement, and
head reconciliation. Direct browser libp2p can be added without changing the
message contract.

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
recipient received it.

The useful lessons for GeeSome are to distinguish local queue acceptance from
remote persistence and to keep delayed delivery independent of transient Relay
or PubSub history.

### Matrix

Matrix homeservers persist room history and clients synchronize an event graph.
Its E2EE model also treats each device as a cryptographic participant.

Matrix reinforces two relevant boundaries: delayed server-to-server delivery
must be persistent, and account identity alone is insufficient for E2EE.
Browser/device key ownership and membership-key changes must still be explicit.

## Baseline At Research Time

At the start of this research, the implementation was not reliable E2EE:

- `geesome-ui` saves plaintext content and asks `geesome-node` to create a post.
- `geesome-node` encrypts a manifest reference for personal chat using key
  material available on the node. The node therefore participates in plaintext
  and key handling.
- The chat page subscribes to communicator events and fetches a post by the
  received `postId`.
- The historical group listener attempted reconnect and resubscribe behavior,
  but had no remote persistence acknowledgement, retry, or head-reconciliation
  contract.
- The current communicator is Fluence-backed when enabled, with a disabled
  maintenance implementation. Its publish path is not a durable chat store.
- `geesome-libs` has a versioned opaque-envelope experiment, but it uses
  Node-specific cryptographic APIs and direct RSA key wrapping. It is not yet a
  reviewed browser group-chat protocol.

These details mean changing Fluence to Kubo PubSub would not solve delivery or
E2EE. The message and synchronization contract must be made durable first.

## Implemented Since This Research

The direct-message foundation now follows the recommended correctness boundary:

- `geesome-libs` provides browser-capable signed device bundles, opaque
  envelopes, recipient key wrapping, and encrypted recovery bundles.
- `geesome-ui` owns browser private keys and performs direct-message
  encryption/decryption locally.
- `geesome-node` persists signed opaque envelopes, deterministic local sequence
  heads, recipient indexes, receipts, and per-recipient delivery state.
- Authenticated HTTPS delivery persists before attempting remote delivery,
  retries unavailable recipients with durable leases and bounded backoff, and
  accepts recipient-identity-signed acknowledgements.
- Signed source-head reconciliation repairs missing encrypted events without
  depending on PubSub history, and an opt-in bounded worker schedules restart-safe
  repair.
- Signed user manifests advertise canonical delivery, sync, and public-device
  discovery endpoints when configured.

The remaining recommendations now apply to the MLS browser compatibility gate,
retention and aggregate quota policy, and real multi-node
browser/NAT/peering tests. Device trust, encrypted attachment lifecycle, and the
group protocol decision have moved into the implemented foundation.

## Recommended GeeSome Architecture

### Authoritative encrypted event log

Persist one immutable opaque event for each chat operation. A versioned event
contract should include:

- `eventId` or `messageId`, generated by the sending device;
- `conversationId`;
- event type and protocol version;
- sender account and sender device identifiers;
- monotonically comparable sender/conversation sequence or log-head metadata;
- creation time as advisory metadata;
- ciphertext and cryptographic suite/session metadata;
- encrypted attachment references;
- membership epoch or key-generation identifier;
- sender signature;
- optional previous-event or checkpoint references.

The node must validate only public envelope constraints, authorization,
signatures, sizes, and identifiers. It must not require plaintext or device
private keys.

### Send, acknowledgement, and repair flow

1. The browser creates the event ID, encrypts and signs the event, and stores it
   to its GeeSome node.
2. The sending node authorizes the sender, validates the opaque envelope,
   inserts it idempotently, stores/pins referenced ciphertext, and records the
   conversation sequence/head.
3. Only after that commit, the communicator publishes the event ID, ciphertext
   pointer, conversation identifier, and sequence/head.
4. The receiving node fetches the ciphertext, verifies its CID and envelope
   signature, stores/pins it, and records the event idempotently.
5. Only after remote persistence, the receiving node acknowledges the event ID
   and its latest contiguous sequence/head.
6. The sending node keeps an unacknowledged event in its persistent outbound
   queue. It retries with exponential backoff and jitter, wakes the queue when
   the peer reconnects, and resumes after a sender-node restart.
7. Both running nodes periodically exchange their latest sequence/head and
   request missing event ranges. This anti-entropy pass repairs dropped PubSub
   notifications without requiring retained PubSub history.
8. The recipient browser fetches the opaque event from its node, verifies it,
   and decrypts locally.

Losing every PubSub notification in step 3 must delay delivery, not lose data,
provided the two running nodes can perform the reconciliation in step 7.

### Repair channel

Acknowledgements and head reconciliation must use an acknowledged
request/response channel, not another unacknowledged PubSub topic. Two suitable
deployment options are:

1. An authenticated GeeSome node HTTPS endpoint whose node URL, GeeSome static
   identity, and IPFS peer ID are cryptographically bound.
2. A dedicated libp2p request/response protocol between GeeSome nodes.

Kubo can tunnel a custom protocol to a local application with `ipfs p2p listen`
and `ipfs p2p forward`, which allows an HTTP or binary repair protocol to travel
over the existing peered IPFS connection. Kubo currently labels these commands
experimental, so this path needs version-pinned integration and reconnect/soak
tests before it is the only production repair channel.

The first implementation should keep the repair protocol independent of its
carrier. Start with authenticated HTTPS if every bound node already publishes a
reachable GeeSome URL; add the Kubo tunnel or a dedicated libp2p host when a
P2P-only path is required. In both cases, authenticate acknowledgements against
the expected GeeSome/IPFS identity rather than trusting an address alone.

### Delivery states

Expose precise states:

- `saving`: the sending node has not yet committed/pinned the content;
- `accepted-local`: durably stored and pinned by the sending node;
- `queued`: the recipient node is unavailable or has not acknowledged remote
  persistence; automatic delivery will continue under the configured policy;
- `received-remote`: fetched, verified, stored/pinned, and acknowledged by the
  receiving GeeSome node;
- `delivery-failed`: retry expired or the remote node returned a permanent
  authorization/protocol rejection;
- `read`: optional browser-level user receipt, independent of transport
  reliability.

Receipts are separate signed events. They must not mutate or reveal message
plaintext.

### Running-node reconciliation

Each GeeSome node maintains the latest contiguous sequence/head received from
each conversation peer. The reconciliation protocol must:

- compare compact sequence/head summaries;
- request missing event IDs or bounded ranges;
- tolerate duplicate requests, duplicate events, and reordered responses;
- detect a conflicting sequence/head instead of silently advancing;
- verify every fetched CID and envelope signature before acknowledgement;
- run after subscription, reconnect, and periodically while peers are connected.

If the remote node is stopped or unreachable, the message remains `queued`.
When the node returns, direct reconciliation and the outbound worker deliver the
same event idempotently. The recipient browser does not need to be open: its
GeeSome node can retain the opaque encrypted event.

### Delayed outbound delivery queue

The queue belongs to the durable chat delivery layer, not to the communicator.
The communicator reports connectivity and carries attempts, but a disabled or
restarted communicator must not erase queue state.

Each queue record should include:

- destination GeeSome static identity and expected IPFS peer ID;
- conversation and event/message IDs;
- encrypted event CID and required attachment CIDs;
- sequence/log-head metadata;
- state, attempt count, next-attempt time, and last categorized error;
- lease owner and lease expiry for safe multi-process claims;
- creation time and configurable delivery expiry.

Queue behavior must:

- enforce uniqueness by destination plus event/message ID;
- pin all referenced ciphertext while queued;
- claim work transactionally so concurrent workers do not own the same attempt;
- use bounded exponential backoff with jitter and an immediate wake-up on
  authenticated peer reconnection;
- treat network and remote-capacity failures as retryable;
- treat invalid signatures, unsupported protocol versions, and authorization
  rejection as visible permanent failures;
- remove or archive an item only after authenticated remote persistence
  acknowledgement;
- survive GeeSome and Kubo process restarts;
- enforce per-user/conversation quotas and a configurable retry deadline;
- transition an expired item to visible `delivery-failed` state without silently
  deleting its encrypted event or pins. Cleanup requires an explicit
  user/operator action or a separately documented retention policy;
- reject new queued work when quota is exhausted rather than silently evicting
  older undelivered messages;
- recheck current conversation membership and key epoch before retrying. Cancel
  an undelivered event if policy no longer permits that recipient to receive it.

For a group, delivery state is per destination node. One unavailable node must
not block acknowledgement from other nodes, and the UI should show partial
delivery clearly.

### Content durability and pinning

The sending node must retain the encrypted event and referenced attachment
ciphertext until the remote node acknowledges persistence. The receiving node
must not acknowledge an event merely because it saw its PubSub pointer.

IPFS/IPLD can store encrypted events, event batches, and attachment ciphertext.
PostgreSQL remains the efficient operational index for authorization, sequence
heads, acknowledgement state, and retries. A later retention policy may unpin
old content, but it must be explicit and independent of transport delivery.

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
protocol. The focused review selected MLS 1.0 and defined the browser, identity,
membership, ordering, and rollout constraints in
[Group Chat E2EE Protocol Decision](./chat-group-e2ee-protocol-decision.md).
The transport envelope should carry an opaque versioned protocol payload so the
storage and sync layer does not depend on one cryptographic suite.

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
4. Run acknowledgement/retry and anti-entropy workers independently of PubSub
   subscription callbacks.
5. Reconcile sequence/log heads after subscription, reconnect, and periodically
   while connected.
6. Provide an authenticated request/response repair channel over bound GeeSome
   HTTPS endpoints or a tested dedicated libp2p/Kubo tunnel protocol.
7. Monitor peer connection state, queue depth/age, oldest unacknowledged event,
   retry counts, permanent failures, head divergence, fetch/pin failures, and
   reconciliation lag.
8. Apply rate limits, quotas, authorization, and spam controls before accepting
   durable events.

This arrangement is reliable under lost PubSub events because PubSub is not part
of the correctness boundary.

## Required Reliability Tests

The implementation is not complete until deterministic tests cover:

- 100% of live PubSub/communicator hints dropped;
- duplicate, delayed, and reordered hints, acknowledgements, and reconciliation
  responses;
- node restart immediately before and after durable acknowledgement;
- brief network partition between otherwise running nodes followed by head
  reconciliation;
- recipient GeeSome/IPFS node stopped, queued delivery retained, and successful
  delivery after it restarts;
- sender GeeSome node restarted with queued delivery resuming exactly once;
- concurrent queue workers, expired leases, duplicate attempts, and idempotent
  remote acceptance;
- queue quota, expiry, permanent rejection, and membership-removal cancellation;
- asymmetric and reciprocal peering under reconnect pressure;
- direct, relayed, NAT-restricted, and unavailable peer paths;
- remote fetch/pin failure followed by retry without false acknowledgement;
- database/storage full before local or remote acknowledgement;
- encrypted attachment missing, corrupted, oversized, or unpinned;
- invalid signatures, unauthorized senders, replay, and message-ID collision;
- confirmation that the node and transport cannot recover plaintext.

Out of scope for this phase:

- infinite delivery retention without quota or expiry;
- composing/sending from a browser while its own GeeSome node is unavailable;
- multi-device history catch-up unrelated to browser-first E2EE key ownership.

## Recommended Delivery Phases

1. Freeze a transport-independent event, sequence/head, acknowledgement, retry,
   and reconciliation contract.
2. Implement idempotent opaque event persistence and pin-before-publish in
   `geesome-node`.
3. Implement the acknowledged repair carrier and remote persistence receipt.
4. Implement the persistent encrypted outbound queue, worker leases, backoff,
   visible retry-deadline/quota policy, and restart recovery.
5. Implement periodic head reconciliation for live and returning nodes.
6. Select and integrate the reviewed browser E2EE/device protocol.
7. Add encrypted attachments and browser key ownership.
8. Add communicator hints and reciprocal Kubo peering without making either the
   correctness boundary.
9. Add IPLD encrypted-log checkpoints if measurements show that range
   reconciliation needs them.
10. Migrate or explicitly retire legacy server-encrypted chats.

## Sources

- [IPFS: IPNS and PubSub persistence](https://docs.ipfs.tech/concepts/ipns/)
- [libp2p: Publish/Subscribe](https://docs.libp2p.io/concepts/pubsub/)
- [libp2p GossipSub v1.1 specification](https://github.com/libp2p/specs/blob/master/pubsub/gossipsub/gossipsub-v1.1.md)
- [libp2p PubSub delivery semantics discussion](https://github.com/libp2p/notes/issues/19)
- [libp2p security considerations](https://docs.libp2p.io/concepts/security/security-considerations/)
- [Kubo configuration: Bootstrap, Peering, PubSub, and transports](https://github.com/ipfs/kubo/blob/master/docs/config.md)
- [Kubo CLI: experimental custom P2P protocol tunnels](https://docs.ipfs.tech/reference/kubo/cli/#ipfs-p2p-listen)
- [libp2p hole punching](https://docs.libp2p.io/concepts/hole-punching/)
- [OrbitDB Sync API](https://api.orbitdb.org/module-Sync.html)
- [Berty repository](https://github.com/berty/berty)
- [Wesh protocol repository](https://github.com/berty/weshnet)
- [Waku protocols](https://docs.waku.org/learn/concepts/protocols/)
- [Waku node storage and synchronization options](https://docs.waku.org/run-node/config-options)
- [Matrix client-server and E2EE specification](https://spec.matrix.org/latest/client-server-api/)
