# Membership website snapshots (#1441)

## Contents

- [Accepted contract](#accepted-contract)
- [Workstreams](#workstreams)
- [Publication and delivery](#publication-and-delivery)
- [Rollout](#rollout)
- [Verification and progress](#verification-and-progress)
- [Simplification following implementation review](#simplification-following-implementation-review)

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
Full snapshots contain full text and every canonical attachment. No full metadata
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
  fencing, renewable leases, group-targeted durable enqueue and indexed queue/status reads.
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


## Simplification following implementation review

Completed follow-up, 2026-10-27:

1. Replace global invalidation/polling with group-targeted durable enqueue; include
   group title updates and retry transient failures after storage recovers.
2. Store only public/full root CIDs, page count and a post/preview filename index.
3. Move snapshot building, batched post iteration and durable publication worker
   into staticSiteGenerator; membership keeps binding, authorization and selection.
4. Remove the unreleased publication_heads table. Keep the current publication ID
   and desired revision as a small internal resources.data.publication value under
   the existing resource row lock; preserve it when saving public branding. This
   avoids adding columns to the already deployed resource table.
5. Keep durable jobs/leases and old artifact holds. Remove unused artifact owner
   fields. Leave deployed site_settings/options/periods unchanged.

Verification extends the existing SQL/HTTP suite with unrelated bulk edits/deletes,
targeted bulk changes, group rename, branding saves preserving publication state,
four storage failures followed by recovery without another edit, and source changes
during a leased build. Existing real Kubo, retained-CID and ambiguous-commit cases
remain. The 23 creator, 51 payment and 31 core regression checks are the handoff
checks; 4 additional static-site helper tests also pass. API docs and
route/scalability inventories are regenerated and checked. The companion admin
code and external API contracts are unchanged; its browser suites were not rerun
for this internal node refactor.

The dedicated small publication worker retains lease fencing and atomic pair
switching: the generic asyncOperation queue does not yet provide equivalent
coordination. No additional queue framework or generic job JSON wrapper is added.
Only two unreleased tables remain for publication: durable jobs/results and
permanent CID holds. Existing deployed membership tables require no schema change.


The account client is an ordinary browser asset at
app/modules/staticSiteGenerator/site/public/membership.js. The API reads it once
at module load and keeps the existing /v1/membership/site/client.js URL. It is
included by the normal runtime source copy; no extra build step or dependency is
required. Client behavior tests execute the asset itself; SQL/HTTP verification
also checks the endpoint bytes and JavaScript/nosniff headers.


## Unified attachment visibility (complete)

The post attachment list is the source of truth for exported content. Add an
isPrivate boolean to PostsContents, independently of Content ownership/isPublic.
Public snapshots omit private attachments; full snapshots include both. Remove
membership.pageUrl and the copied sets directory. Metadata remains for title,
public/full introductory text and hide policy, not external gallery addressing.

Sequence: node join schema/migration/input/manifest/projection first, then the
microwave producer/editor/initial preparation to write attachment visibility.
Existing private-group attachments migrate conservatively to private. Public-group
attachments preserve public visibility. Existing paid snapshot CIDs remain valid.
Legacy selected image IDs become explicit public attachments; cropped preview
content stays a separate attachment. No global file permissions are changed.

Verify shared content with different post visibility, persistence/updates/reorder,
legacy upgrade, no private CID in public output, full export with all attachments,
removal of pageUrl/sets dependencies and producer preparation/replacement behavior.


Delivery: PostsContents.isPrivate is persisted through create/update/reorder,
serialized in manifests, and used by snapshots and the membership feed. Missing
visibility on a new private-group attachment defaults private; an omitted value on
an existing attachment preserves its saved policy. Generic file/directory links
and escaped text are exported alongside images/videos. Only public image
attachments supply feed thumbnails. No external gallery address is needed.

The microwave producer marks initial selected images public and the remainder
private; free posts mark all attachments public. The editor saves visibility,
retaining cropped previews as ordinary separate attachments. Existing legacy
selection metadata is read only during conversion and then removed, together with
membership.pageUrl. Local per-post Page/archive jobs remain compatible until
site cutover; their gallery URL is not a canonical export source.

Upgrade order: run the Geesome group migration, deploy the node, then deploy
microwave-girls and prepare/rebuild snapshots for each resource once. Preparation
runs the visibility conversion even for resources that previously prepared a
snapshot. Existing paid snapshot CIDs and billing identifiers are unaffected.

Verification: 24 creator SQL/HTTP/Kubo/client checks plus 51 payment checks;
44 core/input/manifest regressions; isolated full model sync + migration chain +
migration integrity audit (277 pass, zero fail, 10 skip). Legacy row upgrade,
repeat migration, different policies for shared Content, policy-preserving edits,
text/archive exports and absence of sets are covered explicitly.

## Shared site templates (complete)

Replace renderMembershipPage and its inline document/CSS with the existing site
SSR renderer, Layout/BaseList/Post components, styles and browser bundle. Both
variants use the same components; an allowlisted adapter supplies only the selected
attachments and text. Account controls are a separate optional Layout component.
Keep snapshot URLs, relative media/post/page paths and public-data isolation in
serialized hydration state. Cover normal SSG regression, public/full SSR, actual
browser hydration/navigation/account initialization and immutable storage output.


The standalone membershipSite.ts document renderer is removed. A typed data
adapter selects allowed text/attachments and feeds site.prepareRender, which uses
fresh Vue SSR apps, shared Layout/BaseList/Post/Pagination components, shared Sass
and the ordinary browser bundle. Plain text and file links work in the shared
post component; existing native HTML/rich-text rendering stays unchanged. Flat
snapshot HTML paths retain explicit immutable post/page/media links and asset
roots. Account controls are an optional Layout component with a normal browser
asset; the action stays disabled until its script is ready.

Validation: 24 SQL/HTTP/Kubo/client checks and 51 payment regressions; 48 core,
manifest, input and shared SSG regressions. Browser coverage verifies hydration,
page/post navigation, public/full isolation, mocked Google sign-in, unpaid account,
mocked payment confirmation, full text/download and logout at 1280x900 and 390x844.
All six mapped screenshots were inspected with no broken images, overflow or
hydration errors. Repeat with npm run test:ssg-membership-browser (uses the same
local microwave-girls Playwright image as the archive browser workflow). API docs
and route/scalability inventories are regenerated/checked. No production changes.

## Preserve creator-site design

The shared-renderer implementation did not preserve the existing creator-site
appearance. Complete the visual migration before homepage cutover:

1. Add the existing Era Of Wave layout as a reusable creator theme on the shared
   group/post SSR pipeline: cover, avatar, links, accent, cards, gallery, responsive
   layout and legal footer. Use resource settings for Wave, Meat and future sites.
2. Style Google/account/subscription controls within that theme, using GeeSome's
   existing session and payment APIs. Keep public/full projections isolated.
3. Carry allowlisted branding into both immutable snapshots, retain IPFS branding
   assets and rebuild when branding or subscription options change. Preserve native
   non-membership templates.
4. Verify actual SSR/hydration, guest/unpaid/paid/logout, gallery, pagination,
   downloads, missing branding and a second creator at desktop/narrow widths.
5. Deploy and rebuild via the owner action; review Open website and actual existing
   subscriber access before switching production homepage routing. Only then retire
   the old reader frontend. This code task does not change production routes or
   migrate financial records; the existing fallback remains until cutover is verified.

Implementation of the creator theme is complete. It ports the existing public App,
gallery, account/refund screens, CryptoCheckout and original stylesheet rather than
reimplementing their appearance. The shared SSR pipeline selects this theme only
for membership snapshots; native sites retain their existing rendering. A small
transport adapter maps the preserved interface to GeeSome APIs, including Google
nonces, site cookies, invoice recovery and immutable relative navigation. Each pair
also contains account.html. Public hydration contains only allowlisted selected
content and branding, without duplicating full post projections.

Verification includes 24 original/new UI pairs (50 described captures) at 1280x900
and 390x844: home, public post, gallery, sign-in, plans, QR payment, account and refund,
plus Meat and missing branding. Visible controls must match, page dimensions must
match and screenshots are compared without masks. Raster rounding is limited to
fewer than 0.01% pixels and 5/255 per channel; parity.json records exact differences.
Screens are visually reviewed as well. Payment confirmation, pending quote reuse,
full text/download, logout and immutable Load more navigation are exercised.
Real PostgreSQL/HTTP/Kubo checks cover branding/description/tariff rebuilds and the
public/full security contract. No production routing or financial records changed.

Rollout remains an operator step: deploy this node change, rebuild the resource,
review Open website and verify actual existing subscriber access. Keep /assets
branding paths served until those configured images are migrated to IPFS. Switch
the production homepage only after those checks; keep the previous reader frontend
available for rollback until cutover is verified. The unrelated owner-dialog/import
failures from the older microwave-girls browser run are not claimed fixed here.

Final local gates for this phase: 25 creator SQL/HTTP/Kubo/client checks, 51 payment
checks and 13 shared/native renderer/adapter checks passed. The comparison browser
flow produced 50 captures and 24 original/new pairs; visible control inventories
match, with no upload controls, broken images, overflow or hydration errors. No
screen areas are masked. Share resolves an actual immutable post URL, and returning
to checkout reuses the pending invoice instead of creating a second quote.

### Uploaded social icons (review follow-up)

The publishing application uploads known social icons through the existing content
API before enqueueing the snapshot. Link branding stores `iconUrl: /ipfs/CID`;
GeeSome renders those root-relative images and retains the CIDs as publication
artifacts. Unknown services keep their original letter fallback. Existing icon
references are reused on preparation. No filesystem PNG copies or icon registry
remain in the generator. The PR history is rewritten to remove the introduced
binary assets, rather than retaining them in an earlier commit of this branch.

Verification: upload/reuse/error contracts, renderer URL filtering and nested-page
links, publication artifact retention, and the original/new browser comparison.

Follow-up verification passed: 101 companion membership tests; 26 node membership
SQL/HTTP/Kubo/client tests; 51 payment tests; six focused snapshot renderer/client
tests; 50 browser captures with the same original/new parity thresholds; API docs
and security/scalability inventories. Companion commit: 904b1fa4.
