# Group Chat E2EE Protocol Decision

Status: accepted architecture; browser implementation library remains gated by
the compatibility spike below.

## Decision

GeeSome group chat will use Messaging Layer Security 1.0 (MLS), defined by
[RFC 9420](https://www.rfc-editor.org/rfc/rfc9420.html), with the service split
described by the
[MLS architecture](https://www.rfc-editor.org/rfc/rfc9750.html).

The initial interoperable profile is:

- MLS protocol version 1.0;
- `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519` (`0x0001`);
- encrypted handshake messages after group creation;
- BasicCredential values carrying the versioned GeeSome device binding;
- external joins, pre-shared keys, group reinitialization, and custom MLS
  extensions disabled until separately reviewed.

Each browser device is a separate MLS client and group leaf. GeeSome account
identity groups those devices for product UX and authorization, but devices do
not share one MLS leaf or private state.

GeeSome nodes provide the MLS Authentication Service and Delivery Service
boundaries:

- The Authentication Service validates the existing signed GeeSome device
  bundle and binds its account ID, device ID, signing key, and bundle version to
  an MLS credential.
- The Delivery Service stores and routes opaque MLS messages, KeyPackages, and
  recipient-specific Welcome messages. It sequences membership commits but
  cannot decrypt application data or manufacture a valid browser credential.

The existing signed append-only chat event log remains the durable transport.
MLS replaces neither persistence nor delivery repair. PubSub, WebSockets, and
communicator events remain optional wake-up hints.

## Why MLS

MLS provides the missing group primitive instead of extending direct-message
recipient key wrapping into a custom group protocol:

- membership changes advance an explicit cryptographic epoch;
- adding and removing clients rotates future group secrets;
- each device has independent credentials and state;
- TreeKEM scales group updates without encrypting every message separately for
  every recipient;
- forward secrecy and post-compromise security have specified update behavior;
- proposals, commits, Welcome messages, and application messages are typed
  protocol objects that can remain opaque to the node.

Matrix is an important operational reference for device verification,
cross-device UX, durable synchronization, and withheld-key behavior. Embedding
Matrix Olm/Megolm directly would also import Matrix room state, device-list,
cross-signing, key-backup, and homeserver contracts that duplicate GeeSome's
existing identity and event log. It is therefore not the selected wire protocol.

A hand-built sender-key or pairwise-fanout group scheme is rejected. It would
make GeeSome responsible for defining and reviewing membership agreement,
concurrent updates, skipped-key handling, forward secrecy, and recovery.

## Browser Implementation Gate

[OpenMLS](https://openmls.tech/) is the provisional implementation candidate.
It is maintained, implements MLS 1.0, supports WebAssembly, and exposes
application-provided cryptography and storage boundaries. It is not accepted as
a production dependency until a small browser spike proves all of the following:

1. A pinned release builds for the browsers supported by `geesome-ui` without
   Node cryptography or filesystem APIs.
2. Two independent browser contexts can create a group, exchange application
   messages, add a device, remove it, and process Welcome and Commit messages.
3. Browser persistence can reload group state after a tab close and browser
   restart, while old epoch secrets are deleted through the storage provider.
4. The binding exposes the proposal, commit, pending-commit discard, export,
   import, and error information needed by the ordering rules below.
5. Serialized protocol values round-trip through a fixture shared by
   `geesome-libs`, `geesome-ui`, and a node-side opaque framing validator. The
   node verifies the outer device signature and public bounds, not MLS secrets.
6. Bundle size, initialization latency, and message/update cost are recorded for
   a direct chat, a small group, and a representative larger group.

The spike may add a thin maintained GeeSome binding around OpenMLS. It must not
reimplement MLS cryptography. If OpenMLS cannot satisfy these requirements,
evaluate another RFC 9420 implementation against the same fixture before
changing the protocol decision.

## Identity And Device Rules

- An MLS leaf represents exactly one registered, non-revoked GeeSome device.
- The credential binds the canonical GeeSome account ID and device ID to the
  device signing key. Clients verify this binding against the signed device
  bundle, not against display names or node-provided labels.
- Adding another device for the same account is a normal MLS Add operation and
  advances the epoch.
- Device replacement or revocation removes that device's leaf and commits a new
  epoch. Removing an account removes every active leaf belonging to it.
- A removed device can retain plaintext and old epoch secrets it already had.
  It must not receive secrets for later epochs. The UI must not describe removal
  as erasing previously delivered history.
- A newly added device receives no earlier conversation history by default.
  Historical transfer requires a later, explicit client-to-client encrypted
  export design; the node must not reconstruct or escrow it.
- Restoring an account creates a new device identity. Active MLS state is not
  copied through server-readable recovery data. An authorized current member
  must add the restored device.

Browser storage contains sensitive MLS state. The implementation must use a
dedicated local storage provider, avoid logs and exports of secret state, delete
obsolete values when requested by the MLS library, and clear state on device
removal/logout. Browser and storage-device behavior means physical secure
erasure cannot be promised; the UI and security documentation must state the
resulting forward-secrecy limitation accurately.

## Membership Authorization

MLS authenticates protocol participants but deliberately does not define who is
allowed to change product membership. GeeSome therefore applies both checks:

1. the MLS proposal/commit is cryptographically valid for the current epoch;
2. the committing account/device is authorized by the signed GeeSome group
   policy to perform every included Add, Remove, or Update.

Only an authorized browser device creates and signs a membership commit. The
node may reject unauthorized or stale commits, but it never rewrites a commit,
adds a member automatically from a mutable database row, or creates MLS secrets.
Database membership and MLS membership are reconciled as explicit, visible
operations rather than silently forced into agreement.

The first version uses the existing group owner/admin policy. More complex
quorum or role rules require a versioned policy change before they affect MLS
commit authorization.

## Epoch And Ordering Rules

- A group has one opaque MLS `group_id`, the selected profile above, and one
  monotonically increasing epoch.
- The canonical group node advertised by the signed group manifest serializes
  membership commits with compare-and-set semantics on the expected epoch.
- Exactly one valid commit can advance a given epoch. A competing commit receives
  a conflict response; its browser discards pending state, synchronizes the
  accepted commit, and rebuilds the intended change if it is still authorized.
- Proposal events must be available before a commit that references them.
  Recipient-specific Welcome messages are accepted only for the commit selected
  for that epoch.
- Application messages may arrive out of order within a bounded window. A
  client buffers recoverable gaps and asks the existing durable sync path for
  missing events. It does not advance through a missing membership commit.
- Stale-epoch application messages are never re-encrypted by the node. Clients
  may decrypt retained old-epoch messages only when their local MLS state allows
  it; otherwise they expose a recoverable or permanently unavailable state.
- Canonical-node failover and multi-writer commit consensus are deferred. An
  unavailable canonical node delays membership changes instead of allowing
  divergent epoch histories. Application events remain queued for durable
  delivery.

The canonical node is trusted for availability and commit ordering, not message
confidentiality or authorship. Clients detect invalid commits and signed event
gaps through normal MLS validation and GeeSome head reconciliation.

## Opaque Event Contract

The existing chat log will gain a versioned `geesome-mls-v1` payload family:

- MLS application message;
- proposal;
- commit;
- Welcome message addressed to one device;
- KeyPackage publication/consumption metadata;
- bounded synchronization checkpoint.

Routing metadata is limited to what delivery requires: conversation and opaque
group IDs, epoch, protocol object type, sender device, intended recipient for a
Welcome message, sequence/head data, and ciphertext identity. Sensitive
application metadata stays inside MLS application data. Metadata that must be
visible and integrity-protected belongs in MLS authenticated data.

GeeSome application data remains independently versioned and carries message
ID, event type, body, reply/reaction relation, and encrypted attachment
descriptors. Attachment bytes remain client-encrypted; their content keys are
carried inside MLS-protected application data. A membership change does not
retroactively re-encrypt old attachment objects.

## Rollout And Compatibility

1. Land the browser compatibility spike and shared fixtures without changing
   production chat behavior.
2. Add opaque node contracts for KeyPackages and MLS event kinds only after the
   spike selects a pinned library/binding.
3. Implement new MLS group conversations behind an explicit capability flag.
4. Exercise add/remove/revoke, concurrent commits, restart, and delivery repair
   in real two-browser/two-node tests.
5. Enable MLS only for newly created group conversations at first.

Direct-message `geesome-e2ee-v2` conversations are not silently converted.
Legacy server-encrypted chats remain visibly legacy until explicitly retired.
There is no plaintext or pairwise-envelope fallback when an MLS participant is
unsupported or out of date.

## Security Review Triggers

Review this decision before enabling production group chat if any of these
change:

- MLS protocol version, cipher suite, implementation, or WASM binding;
- device credential format or account recovery behavior;
- group authorization or canonical commit-ordering policy;
- browser persistence or secret-state export;
- historical-message sharing;
- server-visible routing metadata;
- attachment key transport;
- canonical-node failover or federated multi-writer membership.

## Primary References

- [RFC 9420: The Messaging Layer Security Protocol](https://www.rfc-editor.org/rfc/rfc9420.html)
- [RFC 9750: The Messaging Layer Security Architecture](https://www.rfc-editor.org/rfc/rfc9750.html)
- [OpenMLS WebAssembly guidance](https://book.openmls.tech/user_manual/wasm.html)
- [OpenMLS persistence and forward-secrecy guidance](https://book.openmls.tech/user_manual/persistence.html)
- [Matrix client-server and E2EE specification](https://spec.matrix.org/latest/client-server-api/)
