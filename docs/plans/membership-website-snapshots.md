# Membership website snapshots (#1441)

## Contents

- [Accepted contract](#accepted-contract)
- [Workstreams](#workstreams)
- [Publication and delivery](#publication-and-delivery)
- [Rollout](#rollout)
- [Verification and progress](#verification-and-progress)

## Accepted contract

User refinement, 2026-10-27: a subscriber obtains the CID of the current full
website snapshot and retains that snapshot and its files after subscription
expiry. New edits/publications produce a new CID, discovered through the current
site selector only with active access. CID sharing and old copies are accepted.
This explicitly supersedes the earlier per-file revocation/encryption proposal.

Keep one existing private canonical group, generate public/full static snapshots,
and select the appropriate snapshot using site-bound session AND current resource
entitlement. Readers receive no author rights or group membership. An additional
public native-feed group is optional future work, not required here.

Use existing Geesome/IPFS storage in plaintext. No new filesystem root, encrypted
asset store, key lifecycle, private-ingest API or per-file subscription check.
Preserve current resource/group/payment identifiers and canonical attachments.

## Workstreams

1. Node: durable publication jobs, immutable paired IPFS directories, explicit
   public/full renderer, current snapshot selector and automatic source-version
   rebuilds. Output owner APIs and reader selector. Scope geesome-node.
2. Producer/admin: owner-scoped publication BFF, status/action/link, optional
   teaser/full text editing. Keep existing per-post IPFS rendering and attachments.
   Scope microwave-girls; depends on node API. No private-asset UUID conversion.
3. Review/tests/docs can run independently; root owns integration and handoff.
   No production deployment, proxy cutover or financial migration in this task.

## Publication and delivery

Public snapshots contain only explicit previews, teaser and subscription CTA.
Full snapshots contain full text/media and stable full-set links. No full metadata
is serialized into public HTML/client data. Both variants share the same canonical
source revision. Directory-local post/page links and immutable media CIDs keep
old snapshots usable without membership API access to their files.

Build both directories first, then transactionally publish their references and
switch the current head. Replays reuse one durable job. Changed source versions
schedule bounded automatic rebuilds. Interrupted work can resume after its lease;
failed staging never replaces a valid pair. Old ready artifacts remain readable.

The selector checks configured Host, site availability, site-bound cookie and
current resource entitlement before issuing a 302 to the appropriate CID.
Selector/error responses use private,no-store and Vary Cookie,Host. Direct CID
GET/HEAD/Range intentionally retain ordinary public gateway behavior; expiry,
refund, hide or deletion changes future selections, not already obtained CIDs.

## Rollout

Ship node first, then microwave admin. Initial site snapshot activation is an
explicit owner action; keep existing groups private. Sync existing postsEnabled
choice and preserve all tariffs, periods, invoices and per-post publication state.
Reverse proxy must preserve Host and route /api/v1/* through Geesome for login,
payments and snapshot selection. No server changes are performed for validation.

## Verification and progress

Required real SQL/HTTP cases: anonymous/unpaid vs active selection, wrong-site and
expired cookies, resource isolation, expiry/refund, old CID retained while new full
CID is withheld, explicit preview/text projection, immutable post/media links,
HEAD/cache handling, owner scoping, concurrent replay, source-change rebuilding,
failed half-build and lease recovery. Browser evidence covers admin activation and
status at desktop/narrow widths. Existing membership/payment/Generation gates run.

2026-10-27: user accepted CID retention model. Removed uncommitted private file
store, byte-level access guards and ingest design; implementation now publishes
immutable paired directories through the existing storage interface.


Implementation complete, 2026-10-27:

- Durable jobs publish both variants before switching the head, with source-version
  fencing, renewable leases, bounded fair polling and indexed queue/status reads.
  Persisted staging paths let retries clean interrupted attempts; ready directories
  remain untouched, including when a database commit response is ambiguous.
- Each preview is copied as the exact selected file, including previews nested
  beside paid siblings. Public HTML and feed projections use the compiled preview
  path. Static post/page/media links stay within the obtained immutable revision.
- Owner activation/status and optional public/full text editing shipped to
  microwave-girls dev in 8179435d (issue #695). Existing production publication,
  Google configuration, tariffs, invoices, users and groups are preserved.
- SQL/HTTP + renderer/client suite: 23 passing; payment regression suite: 51 passing.
  Real isolated Kubo verifies exact preview selection and retained immutable files.
  An additional 31 authorization/API/group/bootstrap/static/storage tests pass.
- microwave-girls: 97 membership unit, 44 component, 4 SQL, 655 Generation unit,
  2 responsive resource-binding browser cases (12 reviewed captures), and 34
  Generation browser cases plus 6 CLI/API checks passed.
- API documentation generated and inspected; security-route and database
  scalability inventories regenerated and checked. No production writes, real
  payment transactions or proxy changes were performed.

Operator handoff: merge the node PR into dev, update Geesome using its normal
release/deployment workflow, deploy microwave-girls dev, then use Prepare website
snapshots for the existing resource. Verify queued → ready and the generated site
via the configured site domain before changing its public homepage routing.
