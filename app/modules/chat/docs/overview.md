# Chat Module

The `chat` module owns the durable node-side boundary for browser-first secure
chat. It registers signed public device bundles, verifies signed encrypted
events, assigns deterministic per-conversation sequences, stores recipient
indexes, and records received/read receipts.

The module never accepts browser private keys, plaintext messages, plaintext
attachments, or attachment keys. Its event rows contain the opaque
`geesome-e2ee-v2` envelope emitted by `geesome-libs`.

Live communicator or PubSub notifications are optional hints. Durable
inter-node delivery uses a separate `geesome-chat-delivery-v1` HTTPS contract.
The sending node signs each delivery with the sender's static-account key; the
receiving node verifies that identity, the browser device bundle, and the
encrypted envelope before storing it. The recipient signs the acknowledgement
with its own static-account key.

Encrypted attachment objects remain opaque content-addressed bytes. The sender
accepts only attachment CIDs owned by the authenticated user and keeps durable
event references so cleanup cannot orphan queued delivery. The recipient
recursively fetches and pins every referenced CID before committing the remote
event and signing its acknowledgement. Missing or stalled pins return a
retryable service error. `CHAT_ATTACHMENT_PIN_TIMEOUT_MS` can lower the
whole attachment-batch deadline; it is capped below the sender's HTTPS request
timeout so stalled IPFS operations cannot hold delivery indefinitely.

One database delivery row is maintained per event and remote recipient owner.
Claims use `FOR UPDATE SKIP LOCKED`, failed attempts are released with bounded
exponential backoff, and the optional interval worker retries recipients that
were offline. Configure the public endpoint with `CHAT_PUBLIC_URL` or `DOMAIN`;
set `CHAT_DELIVERY_WORKER=1` to enable background retries or
`CHAT_AUTO_PROCESS_DELIVERIES=0` to disable the immediate post-write attempt.
When a public endpoint is configured, the same canonical transport contract is
included as `chatTransport` in signed user manifests. Browser clients can use
that identity-bound hint to discover active recipient devices and submit the
recipient endpoint with an encrypted event. Older user manifests and nodes
without a public URL omit the field and remain valid.

The communicator or PubSub layer may later wake peers sooner, but it is never
the source of truth. Missing-range repair uses the signed
`geesome-chat-sync-v1` contract at `/v1/chat/sync`. A recipient signs a bounded
source-owner/conversation request; the source returns only encrypted events
addressed to that recipient, signs the response head, and independently signs
each normal delivery in the page.

`ChatSyncState` keeps a per-conversation/source/recipient scan cursor separate
from the last fully verified source head. The authorized reconcile route
persists each bounded page before advancing the scan cursor, resumes after
restart, and advances the verified cursor only when the signed response says no
pages remain. This avoids treating the greatest event seen during out-of-order
live retries as proof that earlier events were received.

Automatic repair is disabled by default. Set `CHAT_RECONCILIATION_WORKER=1` to
enable the interval worker. A separate model-synced `ChatSyncJob` row carries
the next-attempt time, failure count, and expiring claim without changing the
already-deployed cursor table. Missing job rows are restored idempotently from
`ChatSyncState` before each bounded sweep. Workers use
`FOR UPDATE SKIP LOCKED`, exponential retry backoff, a global batch limit, and
a per-recipient batch limit. Claim tokens fence stale workers that finish after
their lease expires, so restart or concurrent node processes cannot lose or
regress repair work. The following environment variables tune the bounded worker:

- `CHAT_RECONCILIATION_WORKER_INTERVAL_MS`
- `CHAT_RECONCILIATION_WORKER_LIMIT`
- `CHAT_RECONCILIATION_PER_RECIPIENT_LIMIT`
- `CHAT_RECONCILIATION_CLAIM_TTL_MS`
- `CHAT_RECONCILIATION_REFRESH_INTERVAL_MS`
- `CHAT_RECONCILIATION_CONTINUATION_DELAY_MS`
- `CHAT_RECONCILIATION_PAGE_LIMIT`
- `CHAT_RECONCILIATION_MAX_PAGES`
- `CHAT_MAX_ATTACHMENT_BYTES`
- `CHAT_MAX_EVENT_ATTACHMENT_BYTES`
- `CHAT_ATTACHMENT_RESERVATION_TTL_MS`
- `CHAT_MAX_PENDING_ATTACHMENT_RESERVATIONS`
- `CHAT_MAX_PENDING_ATTACHMENT_BYTES`
- `CHAT_ATTACHMENT_CLEANUP_WORKER`
- `CHAT_ATTACHMENT_CLEANUP_WORKER_INTERVAL_MS`
- `CHAT_ATTACHMENT_CLEANUP_WORKER_LIMIT`
- `CHAT_ATTACHMENT_ABANDONED_RETENTION_MS`
- `CHAT_ATTACHMENT_CANCELLED_RETENTION_MS`
- `CHAT_ATTACHMENT_CLEANUP_CLAIM_TTL_MS`
- `CHAT_ATTACHMENT_CLEANUP_RECORD_RETENTION_MS`

Browser device creation, encrypted recovery/restore, revocation, and encrypted
direct-message send/read UX and explicit device trust verification are present
in `geesome-ui`. The browser also encrypts attachment bytes before upload, keeps
private attachment descriptors inside the encrypted envelope, authenticates
downloaded ciphertext before preview/download, and preserves the text-only
envelope for rolling compatibility. Remaining chat work includes attachment
deletion, aggregate quota, abandoned-upload cleanup, and retention policy, group
membership and key rotation, and real multi-node browser e2e coverage.

Attachment admission is bounded without inspecting plaintext. Local events use
the sender-owned `Content.size`, while remote deliveries resolve the ciphertext
size before pinning. The default limits are 25 MiB per attachment and 100 MiB
across one event. Operators can override them with
`CHAT_MAX_ATTACHMENT_BYTES` and `CHAT_MAX_EVENT_ATTACHMENT_BYTES`. Objects that
cannot be resolved return a retryable service error; objects over either limit
return a permanent `413` and are not pinned or stored as chat events.

The node also exposes expiring attachment upload reservations. A browser can
reserve the exact ciphertext byte length before upload and pass the opaque
reservation ID to `user/save-file`. The content hook excludes that ciphertext
from the normal file catalog, binds the resulting content row to the reservation,
and marks it attached in the same transaction that accepts the encrypted event.
Active reservations are serialized per user and bounded by count and reserved
bytes. Existing clients that do not send reservation IDs remain accepted during
the rolling transition.

Browsers reserve the exact encrypted blob size before upload and retain the
reservation across event retries. The cleanup worker is enabled by default,
runs every five minutes, and processes at most 25 lifecycle rows per pass.
Unbound reservations expire after one hour, cancelled uploads are retained for
one hour, and uploaded ciphertext that was never attached to an accepted event
is retained for seven days. Cleanup audit rows are retained for 30 days. Every
window and worker bound is configurable through the variables above.

Cleanup locks the Content row shared with event acceptance, repairs any upload
that already has an event attachment, and never cleans attached uploads.
Eligible Content rows are soft-deleted before their storage IDs enter the
storage-space async removal queue. That queue repeats reference and pin safety
checks at execution time, so another user's row, an accepted chat event, a pin,
or another registered storage reference prevents physical deletion. Operators
can run the same bounded pass explicitly through
`POST /v1/admin/chat/attachments/cleanup`. The lifecycle reads only ciphertext
identity and byte counts; it never receives plaintext metadata or keys.

See [Reliable IPFS Chat Research](../../../../docs/ipfs-chat-reliability-research.md)
for the transport and delivery analysis behind these boundaries.
