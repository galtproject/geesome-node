# Local Social Publishing Plan

Status: proposed; no publishing queue or client worker is delivered by this document.

Planning tracker: [#1522](https://github.com/galtproject/geesome-node/issues/1522).

## Contents

- [Source of truth](#source-of-truth)
- [Existing foundations](#existing-foundations)
- [Proposed contract and policies](#proposed-contract-and-policies)
- [Delivery sequence](#delivery-sequence)
- [Execution workstreams](#execution-workstreams)
- [Verification and release](#verification-and-release)
- [Implementation notes and backlog](#implementation-notes-and-backlog)

## Source of truth

User requirements:

- GeeSome Node stores scheduled publications marked for local execution.
- GeeSome Client polls the node and publishes due jobs using the user's local
  social accounts. Target networks are Instagram, Threads, and Reddit.
- Social credentials and sessions remain on the user's machine.
- A node may run locally or on an always-on server; its deployment location
  does not change responsibility for local social execution.

Proposed implementation choices below are recommendations, not additional user
requirements. The first delivery is one scheduled Threads text post, with
failure recovery, before media and additional providers. Planning alone does
not authorize live social posts. Do not rewrite user requirements to match an
adapter's limitations.

Non-goals for the first slice: scheduled visibility inside GeeSome, automatic
channel routes, imported-source relay, social deletion/edit synchronization,
and encrypted/private-source publication. These remain explicit follow-ups.

## Existing foundations

- [Post](../../app/modules/group/models/post.ts) has `publishOn` and status,
  but the reviewed code has no scheduler executing `publishOn`.
- [autoActions](../../app/modules/autoActions/models.ts) demonstrates durable
  due actions and atomic database claims with expiry.
- [ActivityPub deliveries](../../app/modules/activityPub/models.ts) demonstrate
  per-destination jobs, deduplication, claim leases, and retry state. Reuse the
  design patterns, not the ActivityPub-specific table or signing worker.
- API keys already have ownership, permissions, expiry, and revocation.
  Add narrow publishing scopes rather than handing a client a full user key.
- [socNetAccount](../../app/modules/socNetAccount/models.ts) stores node-side
  secrets and is not the destination model for local-only credentials.
- Group lifecycle events can support later source routing; best-effort hooks
  alone cannot guarantee enqueueing.

Review baseline: `cbb12a3f`; documentation prepared on `32b1d717` from origin/dev.
Before implementation, recheck the relevant modules and TODO context.

## Proposed contract and policies

Use a dedicated `localClient` module on the node. Keep delivery state separate
from `Post.status`: publishing to Threads must not publish a draft in GeeSome.

Proposed records:

- Local client: owner, revocable credential binding, capabilities, last seen.
- Destination: owner, bound client/local account ID, network, safe display
  metadata and target settings; no provider access tokens or session cookies.
- Job: source post, immutable content snapshot/revision, destination,
  `executionMode: local`, `scheduledAt`, optional `expiresAt`, retry time,
  status, dedupe identity, attempt count, claim token/expiry, remote ID/URL.
- Attempt: durable identity and sanitized outcome for audit and reconciliation.

One post targeting three networks creates three jobs. A unique identity per
publication request and destination prevents duplicate enqueueing; intentional
reposts get a new publication identity. Scheduling and enqueueing must commit
atomically. Discover the API base URL instead of hardcoding `/api/v1`.

API capabilities to specify before code:

1. Pair/revoke clients and register/update their secret-free destinations.
2. Owner-scoped create/list/update/cancel scheduled publications.
3. `POST jobs/claim`: bounded atomic selection of eligible due jobs using node
   time, destination ownership, capabilities, and current source permissions.
4. Renew a lease and report results with an attempt identity and claim token.
5. Inspect status and resolve uncertain outcomes. Read-only GET never claims.

Recommended defaults, to be confirmed in the implementation contract:

- Store UTC instants; show the user's timezone in the UI.
- An offline client leaves work queued. On reconnect, deliver overdue work
  unless its optional expiry has passed; show that delivery is late.
- Freeze the payload when scheduling. Before claim, edits explicitly replace
  the snapshot and increment its revision. Block ordinary mutation once claimed.
- Recheck permissions at claim and before renewing an expired authorization;
  revocation prevents further claims. A request already sent to a provider
  cannot be recalled by changing node state.
- Pending cancellation is immediate. In-flight cancellation is a request and
  cannot promise to prevent or remove an external publication.
- A lease prevents simultaneous ownership, not duplicate external effects.
  Persist a local attempt journal before sending and persist the remote result
  before ack. Retry ack idempotently after reconnect.
- A crash or timeout after sending is `unknown` until reconciled. Do not blindly
  resend after lease expiry or promise exactly-once delivery across providers.
- Retry known safe failures with bounded backoff; distinguish rate limits,
  expired authorization, permanent payload errors, and ambiguous outcomes.

The first slice accepts explicitly selected, locally authored public GeeSome
posts. Supporting drafts/private posts or imported Telegram sources requires
an explicit export policy and permission tests, not just read access to a channel.

## Delivery sequence

### 0. Align contracts and prerequisites

Update `geesome-client/docs/threads-client-plan.md` Source Of Truth and
`docs/geesome-node-contract.md` with scheduling, claims, revisions, recovery,
and Reddit. Confirm the defaults above. Research current official provider
requirements before promising account eligibility, media delivery or localhost
OAuth support. Record unresolved provider requirements as release blockers.

Register `geesome-client` correctly in the hub: gitlink, `.gitmodules`, manifest,
routing, and verification commands. Its current untracked local folder is not
a reproducible submodule checkout. Keep this hub work separate from product PRs.

Done: versioned contract examples and acceptance scenarios agreed; fresh hub
checkout can obtain the client. No production credentials are needed.

### 1. Node queue with a simulated client

Implement models, scoped pairing/destinations, schedule API, atomic claim,
lease renewal, idempotent ack, cancellation, safe retries and unknown outcomes.
Create jobs through an explicit schedule operation, not a manifest hook.
Expose minimal list/detail status APIs for the operational client UI.

Done: a fake client can schedule, claim and complete work; two clients cannot
hold the same valid lease; future/foreign/revoked jobs cannot be claimed;
restart and ambiguous outcomes preserve correct state without provider calls.

### 2. Threads text end to end

First fix local service exposure and secret-bearing config responses, native
environment loading and API discovery. Add pairing, polling with backoff,
durable journal, recovery, provider auth lifecycle and queue/status UI.
Use the existing Threads text implementation behind an adapter boundary.

Done: a scheduled text is sent from the local machine, node status records its
remote ID, offline catch-up works, and lost ack does not cause a second send.
Use mocks first; actual provider publication needs an explicitly authorized
test account and post. Node storage/logs contain no social credentials.

### 3. Media, Instagram and Reddit

Define attachment snapshots: immutable content identity, MIME/size and authorized
download path. Keep provider tokens out of node requests and media URLs.
Handle provider-side media retrieval explicitly; never silently expose private
files. Add Threads media, then Instagram and Reddit adapters with researched
capabilities, destination settings and provider-specific validation.

Done per adapter: supported post types and account requirements are documented;
mocked lifecycle/error tests pass, plus an authorized real-account smoke before
claiming provider delivery complete. Providers may proceed independently after
the shared media and adapter contracts stabilize.

### 4. Automatic source routes

Add channel/source-to-destination routes on top of the same jobs. Persist
source-event/outbox identity transactionally and enqueue idempotently with
bounded recovery scans. Define imported-content authorization, attribution,
moderation and edit/delete semantics before enabling Telegram relay.

Done: repeated events and node restarts enqueue once per intended destination;
permission changes and deleted sources are handled by an explicit policy.

## Execution workstreams

The coordinating agent owns contract integration, plan updates, verification
evidence, final push and PR handoff. Agents do not merge PRs. Implementers must
update this plan with findings, decisions, remaining risks and delivered evidence.

| Workstream | Inputs and write scope | Outputs / completion | Dependencies and verification |
| --- | --- | --- | --- |
| Contract | User requirements, reviewed code; node plan and client contract docs | Agreed payloads, states, examples and policy decisions | First; review all acceptance scenarios |
| Hub registration | Client remote/base policy; hub registration/docs only | Reproducible client checkout, helpers know its commands | Can run alongside contract; helper checks and fresh checkout |
| Node queue | Frozen contract; new node module, auth integration, tests/docs | Stage 1 API and durable job lifecycle | After contract; DB-backed concurrency/ACL/recovery tests |
| Client safety and worker | Frozen contract; client server/UI/adapters/tests/docs | Stage 2 worker, local journal and status UI | Safety work and mocked worker can parallel node; joint end-to-end gate |
| Providers | Stable adapter/media contracts; separate client adapters | Stage 3 supported provider flows | After shared contracts; provider-specific tests and authorized smoke |
| Source routing | Stable queue and source policy; node routes/event integration | Stage 4 reliable enqueue from source events | After queue; transactional restart/dedupe tests |

Do not let parallel workers edit shared schemas/contracts independently.
Node implementation precedes client integration; no shared-library change is
assumed. Add `geesome-libs`/`geesome-ui` dependencies only if inspection requires
them, following hub dependency order.

## Verification and release

- Targeted tests: concurrent claim, stale token, lease expiry during send, lost
  ack, repeated ack, retries, revocation, clock boundaries, edits/cancel, expiry,
  permission loss, pagination and node/client restart.
- Verify source/destination ownership and no secret leakage in APIs or logs.
- UI evidence: scheduled, offline/late, in-progress, success, blocked/unknown,
  failure/retry and cancellation states.
- Node route changes require apiDoc generation, security route inventory, and
  applicable database scalability/migration checks per AGENTS.md. New tables
  use model sync; deployed-schema changes require the release migration flow.
- Run targeted module tests first, then the required Docker-backed node suite
  for implementation. Documentation-only changes need link/section/diff checks.
- Roll out node capability/API first, then compatible clients. Old clients must
  not receive jobs they cannot execute. Disable new claims for rollback; retain
  jobs and attempt evidence, and reconcile in-flight/unknown work before retry.
- Stop after pushing PRs and reporting readiness; merge remains user-owned.

## Implementation notes and backlog

- 2026-11-03: read-only feasibility review found reusable queue patterns, but
  no local publishing worker or executing `publishOn` scheduler. No runtime
  delivery is implemented by this plan.
- Pending contract decisions: overdue default/expiry, snapshot UX, unknown-result
  reconciliation, authorization for draft/private/imported content.
- Separate backlog: scheduled publication inside GeeSome; social edit/delete
  synchronization; secure OS credential storage; additional providers.
- Provider feasibility is not established by the repository analysis. Confirm
  it from current official documentation and authorized tests during stage 0.
