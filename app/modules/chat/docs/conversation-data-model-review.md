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

Posts are mutable publishing records. Chat events are signed append-only
records. Editing or deleting a chat message must be represented by a new event
or explicit local retention state rather than silently rewriting the signed
event.

### Different delivery contract

Publishing a post updates database projections, group counters, manifests, and
possibly external integrations. Sending a chat event requires recipient
routing, acknowledgements, retries, missing-range repair, and ordered
source-head comparison.

### Different membership level

Social group membership is primarily account and permission based. Encrypted
chat must also account for browser devices, revoked devices, recipient keys,
and future MLS epochs. A user can remain a conversation member while one of
that user's devices is removed.

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

## Infrastructure That Should Be Shared

Separate domain models do not require duplicate infrastructure. Chat should
continue to reuse:

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

## Adoption Plan

1. Add `ChatConversation` and `ChatConversationMember` as additive model-sync
   tables while this work remains unreleased on `dev`.
2. Lazily materialize a conversation row for existing `conversationId` values.
   Do not rewrite or resign existing `ChatEvent` envelopes.
3. Keep current direct-message APIs compatible while moving membership and
   authorization reads behind conversation helpers.
4. Define explicit direct-conversation uniqueness and invitation policy before
   enforcing database constraints.
5. Add bounded member and conversation listing without exposing encrypted
   presentation metadata.
6. Integrate MLS group state only after the browser dependency gate passes.
7. Add two-browser/two-node tests covering conversation creation, membership,
   device changes, restart, missing-range repair, and attachments.
8. Retire temporary membership inference only after existing conversations
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

## Open Decisions

- Whether one pair of accounts may create multiple direct conversations.
- Which conversation metadata, if any, should be visible to the node.
- How invitations and member roles map to the first MLS group creation flow.
- How long removed membership and old epoch metadata must be retained.
- Whether encrypted conversation metadata should use a distinguished chat event
  or a separately versioned encrypted conversation document.

These decisions should be resolved before making group conversations available
by default, but they do not require replacing the working direct-message event
log.
