# Chat Module

The `chat` module owns the durable server-side boundary for browser-first secure
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

The backend delivery and repair foundation is now present. Remaining chat work
includes browser trust/recovery UX, group membership and key rotation,
encrypted attachment lifecycle, retention policy, and multi-node browser e2e
coverage.
