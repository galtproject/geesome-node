# Local Social Publishing Plan

Status: proposed; documentation only. Planning tracker: [#1522](https://github.com/galtproject/geesome-node/issues/1522).

## Contents

- [Source of truth](#source-of-truth)
- [Minimal design](#minimal-design)
- [Failure and editing rules](#failure-and-editing-rules)
- [Delivery steps](#delivery-steps)
- [Workstreams and verification](#workstreams-and-verification)
- [Deferred work and review notes](#deferred-work-and-review-notes)

## Source of truth

- GeeSome Node stores scheduled jobs marked for local publication.
- GeeSome Client polls the node and publishes due jobs from the user's local
  accounts. Target networks are Instagram, Threads and Reddit.
- Social credentials stay on the user's machine, whether the node runs locally
  or on a remote server.

Recommendation: deliver scheduled Threads text first, then media and the other
networks. For the first slice, explicitly select an existing, locally authored
public GeeSome post. Its visibility in GeeSome does not change when a job runs.
Draft/private publication and imported-source relay are separate follow-ups.

## Minimal design

Use a small `localClient` node module with **one new table: PublicationJob**.
Do not reuse social account tables that store provider credentials on the node.
Use the existing API key authentication and ownership checks; add only the
publishing permission/scope required by that mechanism. No new pairing protocol,
client registry, destination registry or capability negotiation in the MVP.

Each row contains:

- ID, authenticated owner, source post ID;
- network and opaque local account ID, plus provider-specific target settings;
- frozen payload (text first; authorized media references later), scheduled UTC time;
- status: queued, processing, posted, failed, needs_review or cancelled;
- unique owner-scoped request key to make schedule retries idempotent;
- claim token and processing start time;
- remote post ID/URL or a sanitized error.

One post for three accounts creates three rows. The UI sends one request per
row, each with its own request key. No parent publication entity or all-or-nothing
multi-network transaction is needed. The local account ID is a reference, never
a provider credential; account configuration remains in the client.

Five API operations, relative to the discovered node API base:

1. Create a job: validate source ownership/edit permission, build its snapshot,
   store the schedule. Repeating a request key returns the existing row; reject
   a different payload under the same key. The server builds the snapshot only
   on first creation, so a later source edit does not break a lost-response retry.
2. List the owner's jobs with bounded pagination and optional status filtering.
   Include the claim token for processing/needs_review jobs in this authenticated
   owner-only response so manual resolution remains possible after a restart.
3. Claim one job: atomically change the earliest eligible queued row to processing
   and return its payload and claim token. Filter by authenticated owner and the
   networks/account IDs configured in the polling client; use node time and
   recheck source permissions. Invalid/deleted sources become failed, not sent.
4. Report a result: require ownership and the matching claim token. Accept posted,
   failed or needs_review; repeated identical results are harmless. Never silently
   overwrite a terminal result with a conflicting report.
5. Cancel a queued job: retain its row and request key, set cancelled. Processing
   jobs cannot be cancelled or automatically reassigned.

Account filters are not authorization. Every operation derives the owner from
its API key. Two concurrent claims must not return the same job; use the existing
DB claim pattern rather than find-then-update in application code.

Client loop: claim one job, call the selected network adapter, report the result,
then continue. Only one send at a time per client; wait between empty/error polls.
No server-side timer is needed to start jobs: the claim query selects due work.

## Failure and editing rules

- Offline: jobs stay queued and are sent after reconnect, even if overdue. No
  expiry policy in the first version; expose scheduled time in the status list.
- Edit: cancel a queued job and create another with a new request key. No payload
  revisions or in-place editing. Editing the source does not mutate its snapshot;
  deleting it or losing permission prevents a later claim.
- Known failure: mark failed and show the reason. A user may explicitly create
  another job after correcting the problem; no automatic retry scheduler.
- Timeout after sending: mark needs_review. A client crash may leave processing
  unchanged; show old processing jobs as requiring review, using processing time.
  Neither case is ever automatically returned to queued, even after a restart.
- Lost acknowledgement: the running client can retry the same result report
  without sending again. After a crash, manual verification may be required;
  automatic recovery and a durable local journal are intentionally deferred.
- Manual review: inspect the provider, then report the confirmed result through
  the same result operation using the original claim token. Permit this explicit
  resolution for needs_review or still-processing jobs, but preserve final posted,
  failed and cancelled outcomes. Only after verification may the user schedule
  another send. Stop the old executor and establish that its send has finished
  before doing so; if the outcome is still uncertain, leave it for review.
  Show this limitation clearly in the UI.

A claim token prevents stale/conflicting reports; it is not a renewable lease.
This design avoids automatic duplicate sends by leaving ambiguous work for human
review. It does not promise exactly-once external publication or unattended recovery.

## Delivery steps

### 1. Queue and a simulated client

Keep a short request/response contract aligned with the client docs. Implement
one table, the five operations, and tests with a fake provider. Reuse patterns
from [ActivityPub claims](../../app/modules/activityPub/models.ts) and
[autoActions](../../app/modules/autoActions/models.ts), not their module-specific
tables or workers. `Post.publishOn` is not an existing scheduler to reuse.

Done: a due job is claimed once, future/foreign jobs are excluded, results are
idempotent, queued cancellation works, and a crash never causes automatic resend.

### 2. One scheduled Threads text post

Fix the client's network exposure/secret-bearing config API, native environment
loading and node API discovery. Use existing local Threads account configuration;
add the simple polling loop and a minimal job list with schedule, cancel and
result/manual-review controls. Keep provider calls in small functions, without
building a plugin framework. Validate the supported Threads authorization and
publishing flow against current official docs before a credentialed smoke.

Done: schedule text, leave the client offline, reconnect, publish from the local
machine, record the remote ID. Lost ack and restart follow the rules above.
Node APIs and logs never contain provider credentials.

### 3. Media, Instagram and Reddit

Add media references and authorized downloads, then implement the provider
functions one at a time. Research each provider's current account, target and
media requirements when taking that provider's slice. Keep its validation local
to the adapter. Do not build a universal capability schema in advance.

Done per provider: supported post types documented, mocked success/failure tests,
and an explicitly authorized real-account smoke before declaring it working.

## Workstreams and verification

| Workstream | Inputs / write scope | Output and completion check | Dependency |
| --- | --- | --- | --- |
| Node queue | Agreed five-operation contract; node module/auth/tests/docs | Step 1 passes DB-backed ownership, concurrency and failure tests | First |
| Client | Same contract; client server/UI/provider functions/docs | Step 2 passes fake-provider tests and authorized smoke | Safety work and mocked loop can parallel node; integrate after step 1 |
| Providers | Working loop/media contract; client provider code/tests | Step 3 per-provider validation | After Threads text; providers can proceed independently if useful |

The coordinator owns shared-contract changes, integration and final handoff.
Implementers update this plan with findings and evidence. Separate worker inputs,
outputs and write scopes above; do not edit a shared contract independently.

Required scenarios: two concurrent claims; future/foreign jobs; disabled key;
source permission loss/deletion; repeated create/result; queued cancel;
offline catch-up; known failure; provider timeout; crash before/after send;
lost result response. Verify no automatic requeue and no leaked credentials.
Inspect the small UI's queued, posted, failed and manual-review states.

Follow AGENTS.md for targeted tests, Docker-backed integration checks, route docs,
security inventory and applicable DB checks when implementing. This document-only
change needs link/section/diff checks. Deploy the node API before the new client.
Do not merge PRs; hand them to the user.

## Deferred work and review notes

- Separate maintenance: register geesome-client correctly in the hub. This is
  needed for reproducible checkout, but does not block a queue prototype.
- Later, only with a demonstrated need: automatic retries, lease renewal,
  attempt-history table, durable client journal, automatic reconciliation,
  client/destination registries, expiry and in-flight cancellation.
- Separate features: automatic channel/Telegram routes, scheduled visibility
  inside GeeSome, private/imported-source export and social edit/delete sync.
- Keep the existing client plan/contract aligned when implementation starts;
  do not maintain two competing full specifications.
- 2026-11-03 review: reduced the initial four-record design to one table and five
  operations. Manual review replaces automatic recovery of uncertain sends;
  this is an intentional MVP tradeoff, not a claim of full automation.
