# Chat Conversation Data Model Review

## Question

Should a private chat be represented as a private GeeSome `Group`, with each
message represented as a `Post` and each attachment connected through
`PostsContents`?

## Decision

Treat direct and multi-member chat as the same **conversation** concept, but do
not reuse the existing social `Group`, `Post`, or `PostsContents` tables.

A direct chat is conceptually a private conversation with two account members.
A multi-member chat is the same conversation type with more members and
additional membership state. Both should continue to use the append-only
`ChatEvent` log and `ChatEventAttachment` references.

Before MLS group chat is introduced, add an explicit conversation aggregate
around the existing event log:

```text
ChatConversation
  |-- ChatConversationMember
  |-- ChatConversationHead
  |-- ChatEvent
  |     |-- ChatEventRecipient
  |     `-- ChatEventAttachment
  `-- protocol-specific device membership state
```

This is a domain separation decision, not a requirement to duplicate storage,
pagination, or rendering helpers.

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

Private Conversation
  `-- ChatEvent projection and device/group-key behavior
```

The recommendation is therefore not that posts and chats are fundamentally
unrelated. It is that the current publishing tables already own behavior that
must not be activated implicitly for private chat. Shared primitives should be
extracted deliberately instead of making chat rows masquerade as social posts.

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
- Per-user release intent is stored separately in
  `ChatEventAttachmentRetention`.

These behaviors are now covered across PostgreSQL-backed restart tests and
independent GeeSome processes using separate Kubo nodes.

## Why Social Groups And Posts Should Not Be Reused

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

### Different membership level

Social group membership is primarily account and permission based. Encrypted
chat must also account for browser devices, revoked devices, recipient keys,
and future MLS epochs. A user can remain a conversation member while one of
that user's devices is removed.

`ChatEventRecipient` identifies concrete device keys, not only a user account.
For example, Bob may have a phone, laptop, and tablet. The browser encrypts the
message content once and wraps its content key separately for each allowed
device. Removing Bob's tablet excludes that device from future events while Bob
remains a conversation member through his phone and laptop.

This device-level recipient list is required by the current direct-message
envelope. It can coexist with account-level membership in a generic timeline or
conversation.

### Different metadata boundary

Post content names, views, and ordering are ordinary server-readable metadata.
Chat attachment names, media types, display order, and keys are intentionally
inside the encrypted envelope. Reusing `PostsContents` would either expose that
metadata or create misleading empty join fields.

### Different remote representation

A remote chat recipient can pin ciphertext without owning a normal `Content`
row. `PostsContents` requires a `Content` entity, while
`ChatEventAttachment.contentId` is deliberately nullable on recipient nodes.

### Unwanted product coupling

Reusing `Group` and `Post` would make chat changes interact with unrelated
publishing behavior:

- group manifests and chunked post indexes;
- static-site generation and RSS;
- ActivityPub and Bluesky publication;
- post status, counters, replies, and reposts;
- moderation and feed queries;
- social-import identity and derived-state jobs.

Preventing every one of those paths from treating chat messages as publishable
posts would be more fragile than maintaining the smaller chat model.

## Recommended Conversation Aggregate

### `ChatConversation`

The first-class conversation row should own only server-required state:

- stable `conversationId`;
- conversation kind (`direct` or `group`);
- protocol/capability version;
- lifecycle state;
- creation and update timestamps.

User-visible title, description, avatar, and other private presentation fields
should stay in browser-encrypted state unless a specific public or
operator-visible field is intentionally designed.

The existing `ChatConversationHead` can become an association of this aggregate
without changing sequence semantics or rewriting existing events.

### `ChatConversationMember`

Membership should identify account owners independently from devices:

- `conversationId`;
- stable account owner ID;
- nullable local `userId`;
- role and active/removed state;
- accepted membership sequence or epoch where needed.

For direct conversations, policy should enforce the intended two-account
membership. Whether one account pair can have multiple conversations is a
product decision and should be explicit rather than inferred from table shape.

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

Public group posts do not need encrypted-group key epochs. A private encrypted
group feed would need an equivalent membership/version mechanism even if its
visible items were presented as posts.

### Device membership

Keep global public device bundles in `ChatDevice`. Direct-message events can
continue to record concrete recipients in `ChatEventRecipient`.

MLS-specific leaf, Welcome, proposal, commit, and epoch state should use
protocol-specific conversation records after a maintained browser
implementation passes the required behavior tests. Do not add placeholder MLS
columns to the social group model.

### Messages and attachments

Keep messages as `ChatEvent`, not `Post`. Keep attachment routing and retention
in `ChatEventAttachment` and `ChatEventAttachmentRetention`.

Sender-owned ciphertext should continue to reuse `Content`, `StorageObject`,
IPFS pinning, and reference-safe cleanup. Recipient copies should not require
fabricated user-owned `Content` records.

Per-user attachment release means that one local participant no longer wants an
attachment retained in that participant's chat history. It does not immediately
delete shared ciphertext that another participant, pending delivery, or
missing-range repair still needs.

For example, Alice can release her local attachment view while Bob still keeps
it. Physical cleanup waits until all required local releases, remote delivery
acknowledgements, retention windows, and reference checks allow removal.

Published post attachments usually follow author/publication retention rather
than one retention row for every unknown reader. Both products can share
reference counting and physical cleanup while keeping different release
policies.

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

Separate domain models do not require duplicate infrastructure. Chat should
continue to reuse:

- ordered timeline/change-event helpers where post and chat invariants match;
- head comparison, bounded page repair, and cursor checkpoint helpers;
- configurable best-effort, durable, pull-only, or replicated delivery policy;
- `Content` and `StorageObject` identity for sender-owned ciphertext;
- storage reference counting and deletion safety;
- IPFS fetch, pin, and bounded size checks;
- cursor and keyset pagination helpers;
- asynchronous queue and worker lifecycle helpers;
- canonical rich-text parsing and rendering inside the browser after
  decryption;
- common user, role, and permission vocabulary where the semantics match.

If repeated relation behavior emerges across posts, chat, generated outputs,
and other entities, extract a small generic helper or storage-reference
contract. Do not make `PostsContents` itself generic after the fact.

## Product Interactions

A post can be shared into a chat by sending a typed encrypted reference to its
public identity or by attaching a browser-encrypted private copy. This does not
turn the post into the chat message or make the conversation a social group.

Similarly, a conversation may offer a user action to publish selected content
as a post. That action should create an explicit post through the normal group
publishing flow.

Private encrypted group feeds may eventually combine durable posts with
conversation-like membership. They should be reviewed as a separate product
mode rather than introduced implicitly by storing chat events in `Post`.

At the product level it is reasonable to describe a direct conversation as a
private group of two users. That language does not require using the current
social `Group` database model. A future `Space` or `Timeline` aggregate could
support both social groups and private conversations while each keeps its own
projection and policy modules.

## Adoption Plan

1. Add `ChatConversation` and `ChatConversationMember` as additive model-sync
   tables while this work remains unreleased on `dev`.
2. Lazily materialize a conversation row for existing `conversationId` values.
   Do not rewrite or resign existing `ChatEvent` envelopes.
3. Keep current direct-message APIs compatible while moving membership and
   authorization reads behind conversation helpers.
4. Extract shared timeline/head/reconciliation helpers only after post and chat
   invariants are compared and covered by common behavior tests.
5. Define explicit delivery policies and ensure UI delivery labels match the
   selected guarantee.
6. Define explicit direct-conversation uniqueness and invitation policy before
   enforcing database constraints.
7. Add bounded member and conversation listing without exposing encrypted
   presentation metadata.
8. Add missing-post reconciliation tests using group heads and chunked manifest
   indexes without routing public posts through chat delivery rows.
9. Integrate MLS group state only after the browser dependency gate passes.
10. Add two-browser/two-node tests covering conversation creation, membership,
   device changes, restart, missing-range repair, and attachments.
11. Retire temporary membership inference only after existing conversations
   have been materialized and verified.

## Invariants

- GeeSome nodes never receive chat plaintext, attachment keys, or browser
  private keys.
- `conversationId` remains stable across local database IDs and node replicas.
- Accepted message identity remains `messageId`; retries do not create another
  event.
- Conversation sequence remains deterministic and append-only.
- Direct and group membership are explicit and independently testable.
- Removing a device does not silently remove its account from the conversation.
- Removing an account from a group conversation eventually removes all of its
  active protocol device memberships.
- Recipient attachment rows can remain storage-only references.
- Social publishing hooks never process chat events unless an explicit publish
  action creates a real post.
- Message and post edits can use later ordered events while retaining separate
  current-state projections.
- Missing-item reconciliation is available to both chat and group timelines,
  with product-specific verification.

## Open Decisions

- Whether one pair of accounts may create multiple direct conversations.
- Which conversation metadata, if any, should be visible to the node.
- How invitations and member roles map to the first MLS group creation flow.
- How long removed membership and old epoch metadata must be retained.
- Whether encrypted conversation metadata should use a distinguished chat event
  or a separately versioned encrypted conversation document.
- Whether a generic `Space`/`Timeline` aggregate should be introduced after
  shared behavior has been proven in both chat and group-post tests.
- Which delivery policies should be available for public groups, private group
  feeds, and direct conversations.

These decisions should be resolved before making group conversations available
by default, but they do not require replacing the working direct-message event
log.
