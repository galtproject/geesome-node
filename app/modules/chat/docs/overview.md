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

The backend delivery and repair foundation is now present. Remaining chat work
includes automatic bounded reconciliation scheduling, browser trust/recovery
UX, group membership and key rotation, encrypted attachment lifecycle, and
multi-node browser e2e coverage.
