# Chat Conversation Data Model Review

## Question

Should a private chat be represented as a private GeeSome `Group`, with each
message represented as a `Post` and each attachment connected through
`PostsContents`?

## Decision

Model an encrypted multi-member chat as a private group specialization. Reuse
`Group`, `Post`, `PostsContents`, and the group reconciliation path where their
existing contracts fit, while a dedicated `PrivateGroup` module owns the
private-only policy:

```text
Group
  |-- GroupMember
  |     `-- versioned member-device public keys
  |-- Post
  |     `-- PostsContents
  `-- group head / missing-post reconciliation

PrivateGroup module
  |-- validates private-group publication
  |-- resolves the active member-device key snapshot
  |-- owns membership/key epoch transitions
  |-- adds delivery acknowledgement/retry policy
  `-- prevents public publishing integrations from running
```

The existing direct-message `ChatEvent` path remains compatible while this
specialization is developed. It should not be rewritten until common post/chat
event behavior and migration rules are proven by tests.

Posts and chats share more timeline behavior than their current tables expose.
Both can use ordered events, edits represented as later events, missing-item
reconciliation, attachments, and configurable delivery policies. A future
generic timeline/space foundation may sit below both products:

```text
Timeline / Space
  |-- members
  |-- ordered events
  |-- attachments
  |-- reconciliation state
  `-- delivery policy

Social Group
  `-- Post projection and publishing behavior

Private Group
  `-- Post projection plus device/group-key behavior
```

The key boundary is now the `PrivateGroup` policy module rather than a separate
conversation database aggregate. Existing post callbacks must dispatch through
that module for private groups so public manifests, ActivityPub/Bluesky,
static-site generation, RSS, and other public side effects are not activated
implicitly.

## Findings From The Current Implementation

Social publishing currently uses:

```text
Group -> Post -> PostsContents -> Content
```

`PostsContents` is a many-to-many join with visible `position` and `view`
values. A post is a mutable publishing entity with status, group-local
identity, replies, reposts, counters, manifests, and generated projections.

Encrypted chat currently uses:

```text
conversationId -> ChatConversationHead
conversationId -> ChatEvent -> ChatEventRecipient
                            `-> ChatEventAttachment
```

`conversationId` is presently a stable identifier rather than a first-class
database entity. `ChatEvent` is an ordered, signed, append-only encrypted
envelope with durable retry, acknowledgement, and missing-range repair.

`ChatEventAttachment` stores `chatEventId`, `storageId`, and an optional
`contentId`:

- A sender node records the sender-owned ciphertext `Content.id`.
- A recipient node pins the ciphertext CID and records `contentId = null`.
- The recipient pins every attachment before it commits the event and
  acknowledges delivery.
- A failed fetch leaves delivery pending and creates no recipient event.
- Attachment order, filename, media type, original size, and content key stay
  inside the encrypted browser payload.
- The current direct-message implementation stores per-user local retention
  intent in `ChatEventAttachmentRetention`; it does not grant a recipient
  permission to delete the sender's message or attachment.

These behaviors are now covered across PostgreSQL-backed restart tests and
independent GeeSome processes using separate Kubo nodes.

## What Cannot Be Reused Unchanged

### Different lifecycle

The current `Post` row is a mutable publishing projection. The current
`ChatEvent` row is a signed append-only event.

Append-only storage does not mean a message cannot be edited. A modern editable
message can be represented as an ordered event history:

```text
event 1: create message A
event 2: edit message A
event 3: delete message A
```

The browser projects those events into the latest visible message. Group posts
could use the same approach: append post-change events while retaining `Post`
as the current feed/manifests projection. GeeSome already records some post
lifecycle events, but they are not yet the complete source of truth for every
post revision.

The difference is therefore in the current source-of-truth contract, not in
whether users should be allowed to edit. Signed chat events should not be
silently rewritten; edits and deletes should be later events. A future post
event log could follow the same rule.

### Different delivery contract

Publishing a post updates database projections, group counters, manifests, and
possibly external integrations. Sending a chat event requires recipient
routing, acknowledgements, retries, missing-range repair, and ordered
source-head comparison.

Acknowledgements and retries do not need to be mandatory for every timeline.
They can be an explicit delivery policy:

- `best-effort`: send once without claiming remote delivery;
- `durable`: retain and retry until acknowledged, rejected, or expired;
- `pull-only`: publish a head and let another node fetch missing items;
- `replicated`: require selected nodes to acknowledge storage.

The UI and API must describe the selected guarantee accurately. A
best-effort send cannot be shown as delivered without an acknowledgement.
Subscribed group-post replication could reuse the durable or replicated modes;
public feeds may prefer pull-only behavior.

### Private membership extends normal group membership

Social group membership is primarily account and permission based. Encrypted
chat must also account for browser devices, revoked devices, recipient keys,
and future MLS epochs. A user can remain a conversation member while one of
that user's devices is removed.

`ChatEventRecipient` identifies concrete device keys, not only a user account.
For example, Bob may have a phone, laptop, and tablet. The browser encrypts the
message content once and wraps its content key separately for each allowed
device. Removing Bob's tablet excludes that device from future events while Bob
remains a conversation member through his phone and laptop.

The same device-level recipient approach can be used for private groups. Normal
group membership identifies the accounts; private-group membership data adds
the active public keys for each account's allowed devices.

The key list must not be read as one mutable global list when decrypting old
posts. Each accepted private post must identify the membership/key version used
when it was created. Otherwise a later device addition or removal would make it
ambiguous which devices were valid recipients of an earlier post.

### Different metadata boundary

Normal post content names, views, and ordering are server-readable metadata.
Private-group attachment names, media types, display details, and keys must stay
inside the browser-encrypted post payload. `PostsContents` may carry relation
identity and stable ciphertext ordering, but private fields must not be copied
into its visible metadata columns.

### Different remote representation

A remote private-group member can pin ciphertext without becoming its author or
owner. Reusing `PostsContents` therefore requires the shared-content identity
path: a replicated `Content` reference may point at the canonical
`StorageObject`, but must preserve the original author/remote identity and must
not fabricate local ownership. The current direct-message path may continue to
use nullable `ChatEventAttachment.contentId` during compatibility.

### Public product coupling must be disabled explicitly

Reusing `Group` and `Post` would make chat changes interact with unrelated
publishing behavior:

- group manifests and chunked post indexes;
- static-site generation and RSS;
- ActivityPub and Bluesky publication;
- post status, counters, replies, and reposts;
- moderation and feed queries;
- social-import identity and derived-state jobs.

The `PrivateGroup` module must define which of these callbacks are disabled,
replaced, or safe to reuse. This is preferable to scattering `if private`
conditions throughout each integration. Private posts may reuse group heads,
pagination, replies, attachment relations, and missing-post repair while public
distribution callbacks remain off.

## Recommended Private Group Specialization

### `PrivateGroup` module

The module should be selected from a stable group privacy/type field and own:

- private publication validation;
- account and device membership resolution;
- membership/key version transitions;
- acknowledgement and retry policy;
- encrypted-post callback dispatch;
- private-group capability/version state.

User-visible title, description, avatar, and other private presentation fields
should stay in browser-encrypted state unless a specific public or
operator-visible field is intentionally designed.

The module may use existing group extension/property data while the shape is
small. Promote it to a typed relation when atomic updates, bounded member
queries, uniqueness, or history verification cannot be enforced reliably in
embedded data.

### Membership and key epochs

For encrypted multi-member chat, an epoch is the version of the current group
membership and shared group-key state:

```text
epoch 12: Alice, Bob, Carol
epoch 13: Alice, Bob
```

Removing Carol creates a new epoch with new key material. Carol may retain
access to messages she was allowed to read in older epochs, but her removed
devices must not read messages created in epoch 13. Removing only Bob's laptop
changes device membership without necessarily removing Bob's phone or Bob's
account from the conversation.

Public group posts do not need encrypted-group key epochs. Private groups do.
The epoch can be stored as versioned private-group membership data and
referenced by each encrypted post; it does not require a separate conversation
aggregate.

### Device membership

Keep global public device bundles in `ChatDevice`. Direct-message events can
continue to record concrete recipients in `ChatEventRecipient`.

MLS-specific leaf, Welcome, proposal, commit, and epoch state should use
protocol-specific conversation records after a maintained browser
implementation passes the required behavior tests. Do not add placeholder MLS
columns to the social group model.

### Messages and attachments

Private-group messages can be encrypted `Post` records and use
`PostsContents`. The browser must encrypt message and attachment bytes before
upload; the node stores only the ciphertext and the minimum routing metadata.

Only the post author may issue a message or attachment deletion for the shared
private-group history, subject to group policy. Other members cannot delete the
author's post or attachment for everyone.

A recipient may still hide an item in their own browser or evict a downloaded
ciphertext copy from a local cache. That is local presentation/storage behavior,
not a shared deletion and not an authoring permission. The recipient can fetch
the item again while the author-owned post and its retention policy still make
it available.

Physical storage cleanup therefore follows author deletion, group retention,
pending delivery/repair references, and ordinary `Content`/`StorageObject`
reference safety. A per-recipient “attachment release” entity is not part of
the private-group product model.

### Missing-item reconciliation

Missing-range repair should not be chat-only. A group reader may know from a
group head or manifest that items 1 through 20 exist while the local node has
all except item 18. The node should fetch, verify, persist, and display the
missing post.

Both products can share a bounded reconciliation algorithm:

```text
compare local and remote heads
identify missing identities or sequences
fetch bounded pages
verify product-specific rules
persist items
advance the local cursor
```

Chat applies recipient, signature, and encrypted-envelope checks. Group posts
apply author, group, manifest, publication, and moderation checks. The chunked
group post index and chat sequence/head contracts are different projections of
the same general recovery requirement.

## Infrastructure That Should Be Shared

The private-group specialization should reuse:

- ordered timeline/change-event helpers where post and chat invariants match;
- head comparison, bounded page repair, and cursor checkpoint helpers;
- configurable best-effort, durable, pull-only, or replicated delivery policy;
- `Group`, `Post`, `PostsContents`, `Content`, and `StorageObject` identity for
  author-owned ciphertext;
- storage reference counting and deletion safety;
- IPFS fetch, pin, and bounded size checks;
- cursor and keyset pagination helpers;
- asynchronous queue and worker lifecycle helpers;
- canonical rich-text parsing and rendering inside the browser after
  decryption;
- common user, role, and permission vocabulary where the semantics match.

If repeated relation behavior emerges across posts, direct chat, generated
outputs, and other entities, extract a small generic helper or
storage-reference contract.

## Product Interactions

A public post can be shared into a private group by sending a typed encrypted
reference to its public identity or by attaching a browser-encrypted private
copy.

Similarly, a private group may offer a user action to publish selected content
publicly. That action must create a separate public post through the normal
public-group flow; changing the private post's visibility in place risks
exposing private metadata or ciphertext policy.

A direct conversation can eventually be represented as a private group of two
accounts. Keep the current direct `ChatEvent` path during the transition so the
new private-group contract can be validated without rewriting existing signed
events.

## Adoption Plan

1. Define a stable private-group type/capability and route its post-publication
   callbacks through a `PrivateGroup` module.
2. Define versioned account/device membership data and require every encrypted
   private post to reference its accepted membership/key epoch.
3. Keep current direct-message APIs and signed `ChatEvent` envelopes compatible
   while the private-group path is introduced.
4. Extract shared timeline/head/reconciliation helpers only after post,
   private-group, and direct-chat
   invariants are compared and covered by common behavior tests.
5. Define explicit delivery policies and ensure UI delivery labels match the
   selected guarantee.
6. Define explicit private-group invitation, member role, and direct
   two-account uniqueness policy.
7. Add bounded private-group/member listing without exposing encrypted
   presentation metadata or mutable key-history ambiguity.
8. Add missing-post reconciliation tests using group heads and chunked manifest
   indexes, including private encrypted posts and membership-epoch references.
9. Integrate MLS group state only after the browser dependency gate passes.
10. Add two-browser/two-node tests covering private-group creation, membership,
    device changes, restart, missing-range repair, author deletion, recipient
    local hiding/cache eviction, and attachments.
11. Consider migrating direct conversations to two-member private groups only
    after compatibility, identity, ordering, and retention behavior is proven.

## Invariants

- GeeSome nodes never receive chat plaintext, attachment keys, or browser
  private keys.
- Group/post identity remains stable across local database IDs and node
  replicas.
- Accepted private-post identity is idempotent; retries do not create another
  post.
- Private-group event order and membership/key epochs remain deterministic.
- Account and device membership are explicit and independently testable.
- Removing a device does not silently remove its account from the conversation.
- Removing an account from a group conversation eventually removes all of its
  active protocol device memberships.
- Only the author may delete a shared private post or its attachments.
- Recipient local hiding or cache eviction never deletes the shared post.
- Public publishing hooks never process private-group posts unless an explicit
  publish action creates a separate public post.
- Message and post edits can use later ordered events while retaining separate
  current-state projections.
- Missing-item reconciliation is available to both chat and group timelines,
  with product-specific verification.

## Open Decisions

- Whether one pair of accounts may create multiple direct private groups.
- Which private-group metadata, if any, should be visible to the node.
- How invitations and member roles map to the first private-group/MLS creation
  flow.
- How long removed membership and old epoch metadata must be retained.
- Whether encrypted private-group metadata should use a distinguished post
  event or a separately versioned encrypted group document.
- Whether direct `ChatEvent` conversations should eventually migrate to
  two-member private groups or remain a compatible specialized projection.
- Which delivery policies should be available for public groups, private group
  feeds, and direct conversations.

These decisions should be resolved before private groups are available by
default. They do not require replacing the working direct-message event log.
