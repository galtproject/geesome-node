# Local Social Publishing Plan

Status: node queue, private outbox compose/draft APIs and provider adapters are
implemented together with the Settings/Posting UI on feature branches. Actual-node
browser verification is complete; authorized live-provider testing remains open.

Trackers: [node foundation #1524](https://github.com/galtproject/geesome-node/issues/1524),
[client outbox/UI #4](https://github.com/galtproject/geesome-client/issues/4).
Existing verification: [implemented work](../implemented.md#scheduled-local-publishing-node-queue-1524).

## Contents

- [Source of truth](#source-of-truth)
- [Post and queue rules](#post-and-queue-rules)
- [Minimal implementation](#minimal-implementation)
- [User interface](#user-interface)
- [Delivery workstreams](#delivery-workstreams)
- [Verification](#verification)
- [Boundaries and history](#boundaries-and-history)

## Source of truth

User requirements, including the latest corrections:

- The client composer accepts **new text and pictures**, without asking for an
  existing GeeSome post ID.
- Use the existing private-group mechanism of GeeSome. Lazily create a personal
  group for publications when the first send/schedule action is persisted.
- Save the post and its publication intent in GeeSome **before** contacting a
  social network. Node is the durable source of the queue; client displays and
  executes it with local accounts for Threads, Instagram and Reddit.
- Posts added directly to this group appear in the client as **publication drafts
  without a selected social network/account or send time**. Creating, discovering
  or editing a group post never schedules or sends it automatically.
- Only explicit selection of destination account(s), timing and Send/Schedule
  creates delivery jobs. No default destinations or automatic group-post routing.
- Separate Settings and Posting pages. Posting shows the new-post composer at
  the top and drafts/queue below. Hide technical IDs and uncommon settings.
- Provider credentials, including the experimental Reddit cookie, remain local.

This iteration supersedes the earlier existing-public-post-only composer and
private-source deferral. The earlier proposal to auto-enqueue group posts using
network defaults is withdrawn. Imported-source relay remains separate work.

## Post and queue rules

- Group/Post/Content store the text and pictures. PublicationJob stores schedule
  and delivery outcome per explicitly selected account. There is one server queue,
  not a synchronized second local queue.
- A publication draft is a source post with no delivery jobs/assigned destination.
  It is not a dummy PublicationJob and does not require a new draft table or a
  `draft` job status. Do not conflate it with native GeeSome Post.status: a post
  visible inside the closed group can still be an unscheduled social draft.
- On selecting a draft, the client carries its post ID internally, pre-fills the
  composer and requires explicit destinations/timing. No technical ID field in UI.
- One source for three accounts creates three independent jobs. Freeze the
  payload and destination settings at enqueue time. Retries of the same compose
  request or discovery must not create another post or another set of jobs.
- A cancelled, failed or already-sent job remains history. Rediscovery of its
  source never resurrects it as queued or silently creates a replacement.
- 'Send now' uses the same persisted job path with a due time of now. The normal
  composer must not bypass GeeSome with the old direct manual-test send route.
  Show whether queue execution is paused; never silently enable and drain old work.
- Before enqueue, the user may edit a draft with ordinary owner permissions.
  After enqueue, retain the simple cancel-and-create flow; source edits do not
  silently mutate a queued snapshot or an already published social post.

## Minimal implementation

Reuse the existing Group, Post, Content and PublicationJob models. Do not add a
client/destination registry, attempt table, automatic retry scheduler or sync bus.

### Private group and uploads

Repeat the current GeeSome UI path: an ordinary channel with `isPublic:false`
and `isOpen:false`, owned by the current user. This is the existing closed group,
not the experimental encrypted `GroupType.PrivateGroup` chat protocol.

Use a deterministic internal identity and a marker in existing group properties.
On concurrent first requests, handle the unique-name conflict and re-read the
owner/marker; do not reuse a foreign group with the same display name. No new
user column/table solely to remember the group ID.

Upload pictures through existing owner-scoped asset/content operations, preserving
upload idempotency. Files may finish uploading before compose; do not hold a DB
transaction open during storage/network operations. Reuse returned asset storage IDs
on retry; node resolves their owner-owned Content records before linking them.
Document the required upload and publishing key scopes accurately.

### Compose and draft listing

Add one composed operation accepting a request key, text, owned image asset storage IDs,
explicit destinations and timing; optionally identify an existing owned outbox
source draft internally. Agree the request/response contract in the client docs
before implementing node handlers.

The operation ensures the group, saves/updates the source draft and creates jobs.
Do not claim atomicity by wrapping the current createPost and createJob calls in
an outer transaction: createPost currently owns its transaction. Prefer a small
shared transaction integration for post/content relations/event and prepared job
writes. Avoid nested API/DB calls inside it. If a resumable compose is chosen,
record its partial states and completion/retry rules explicitly in the contract.

Extend bounded owner-scoped listing to include group posts with no publication
jobs as drafts, alongside delivery jobs/history. Keep existing jobs response
compatibility. Discovering a draft is read-only; no enqueue hook, automatic route,
background reconciliation worker or default-network configuration is required.

Allow scheduling/claiming an owned source from this designated closed group.
Retain current public-source behavior for compatibility; do not remove private
source checks globally. Verify group ownership/marker, source edit permission,
content ownership and author policy, and reject other private/encrypted/remote
sources. Another member's post must not acquire the owner's social identity
implicitly. Recheck source access before returning a claimed payload.

### Delivery behavior to retain

Keep the existing claim/result/cancel operations and status machine:
queued -> processing -> posted / failed / needs_review; queued -> cancelled.

Claim one due owner/account-matching job atomically using server UTC time. Keep
claim transactions short and source permission reads outside their connection.
Do not automatically requeue processing/unknown work. Retry lost result reports
without another provider call; after a crash, require manual verification with
the original claim token. Preserve owner-only result resolution and terminal
conflict checks. Cancellation applies only before sending starts.

## User interface

- **Settings:** node connection and local social accounts, contextual setup
  instructions for the selected network, uncommon API/OAuth fields in Advanced.
  Generate stable local account IDs internally. Never return saved secrets.
- **Posting, top:** text, image selection/previews, destination account(s),
  provider-required destination fields, and send-now/schedule controls. A selected
  draft opens this same composer; no separate existing-post-ID workflow.
- **Posting, below:** unscheduled drafts and the server queue/history, clearly
  distinguished. Draft: choose account and schedule/send. Queued: cancel.
  Unknown/stale processing: pause/settle executor and verify outcome manually.
- No implicit publication on page load, group discovery, saving a draft or a
  change in account settings. Keep queue execution state visible.

## Delivery workstreams

| Workstream | Inputs / write scope | Output / completion | Dependencies and checks |
| --- | --- | --- | --- |
| Contract | This source of truth; node plan and client contract docs | Compose/listing examples, draft vs job rules, retry/partial-write semantics | First; review acceptance cases below |
| Node outbox | Agreed contract; localClient plus minimal group/content integration, tests/docs | Lazy owned closed group, uploads/compose, drafts listing and explicit jobs | After contract; real DB concurrency and full-app ACL/HTTP checks |
| Client pages | Agreed contract; server proxy, settings/posting UI, upload flow and tests/docs | Text/image composer above drafts/queue, account setup with instructions | Settings work and mocks can parallel node; integrate after node API |
| Integration | Both implementations; verification evidence and plan notes | Restart/idempotency and desktop/mobile flows verified | After node/client; authorized provider smoke remains separate |

The coordinator owns shared contract changes, integration, final push and PR
handoff. Implementers update this plan with findings/evidence. Keep write scopes
separate and do not independently change the shared contract. Deploy node support
before enabling the new client flow; do not merge PRs automatically.

## Verification

- Two concurrent first compose requests create one designated group. Lost compose
  response/repeated request key creates one source and one job per destination;
  conflicting content under the same key is rejected.
- A post created directly through GeeSome appears as an unassigned draft and
  never reaches a provider. This remains true after reconnect/restart, an edit,
  repeated discovery, or regardless of its native in-group publication status.
- Choosing an account/time then confirming creates jobs once. Editing account
  settings alone never assigns or publishes old drafts. No implicit defaults.
- Real text/image upload, content ownership, closed-group ACL, wrong actor,
  other private groups, deleted sources and permissions lost before claim.
- Draft editing before enqueue, immutable queued snapshots, cancellation, and
  no resurrection of completed/cancelled work after group refresh.
- Existing concurrent claim, invalid token, lost acknowledgement, timeout/crash
  and no-automatic-resend checks continue to pass.
- Settings/Posting direct navigation, secret clearing/redaction, contextual fields,
  previews, draft selection and queue placement on desktop and narrow screens.
- Follow AGENTS.md for route docs/security inventory, applicable DB checks and
  targeted then Docker-backed integration verification. Doc-only plan updates
  need link/section/diff checks. Never treat provider mocks as a live smoke.

## Boundaries and history

Use the privacy behavior of the existing closed-group mechanism. Group ACL does
not encrypt plaintext IPFS files or revoke a known CID. No new encryption/storage
system is introduced. Current Meta adapters require provider-fetchable HTTPS
media URLs; never append the node key or provider cookie/token to those URLs.
Provider format limits, experimental Reddit session compatibility and authorized
live testing remain documented release boundaries.

Still deferred: arbitrary channel/Telegram automation, encrypted private-group
protocol, social edit/delete synchronization, automatic ambiguous-send recovery,
lease renewal and a second local queue. Hub registration is separate maintenance.

2026-11-03: implemented foundation has one job table, five operations and local
provider adapters. Subsequent user corrections select a private-group text/image
composer and explicitly unassigned group drafts. That iteration is implemented
and verified on the linked feature branches; production deployment is separate.


## Private outbox node implementation notes

- Compose persists a native ordinary closed channel with owner/marker checks,
  one native source post and one queued job per explicitly selected destination.
  No native encrypted-group feature flag or new outbox table is required.
- POST compose requires publishing:local plus assets:write; these map to existing
  group management/save-data permissions. Extra broad keys are not required.
- Immediate requests hash a stable omitted-time sentinel. Compose metadata lives
  on PublicationJob; source and all jobs commit in native createPost's transaction
  through an internal callback. Storage/native-group APIs run before that callback.
- GET outbox never creates state. It lists only own local unencrypted unscheduled
  sources, excludes any delivery history, and marks unsupported individual drafts
  unavailable without breaking supported entries. Draft activation rejects content
  edits explicitly and locks the source to prevent competing activations.
- Attachments include owned storageId/size. Managed private outbox media can use
  local HTTP; public-source HTTPS validation and provider-specific requirements
  remain independent. The native ordinary group's unencrypted CID privacy model
  is preserved, not represented as encrypted storage.
- Runtime source stable; isolated Node22/PostgreSQL/Kubo checks passed for real
  multipart upload/replay, parallel multi-destination compose, frozen replay after
  source edits, private claim, read-only drafts, activation races, rollback and
  source/asset ownership. Final exact check counts are in implemented.md.

- Final node gate: 24 isolated Node22/PostgreSQL/Kubo checks passed with a
  one-connection pool, including actual upload/compose, two destinations,
  concurrent retries/activation, rollback and unreleased model-sync preservation.
  API docs, security/scalability inventories and diff checks passed. These are
  node/mock-execution proofs, not credentialed social publication evidence.

## Final integration evidence

The client passes 55 checks on host and Node22 Docker. Node passes 24 focused
queue/outbox checks plus 62 native group, private-group, bootstrap and API
regression checks against PostgreSQL/Kubo. Actual-node Playwright verification
covered image upload, closed group persistence before sending, lost-response
replay without duplicates, multiple destinations, delayed jobs, direct-group
drafts and cancellation. The default minute worker claimed after 60,006 ms and
drained a serial batch using injected Reddit/Threads endpoints. Desktop/mobile
UI captures were reviewed. No real provider publication is claimed. Deploy node
before client; authorized live-account smoke remains a release gate.
