# Creator Membership

Opt-in sites bind a canonical HTTPS origin to an existing ordinary private,
unencrypted group and its creator. Membership owns `membership_resources`,
`membership_options`, and `membership_periods`. Payments owns financial records;
Google Authorization owns private identities. Buyers never join group member
pivots and receive no upload/publication permissions.

## Configuration in the database

Default module packs include `googleAuthorization,payments,membership`. Custom
`MODULES` lists must include them in that order, after `database,api,group` and
their usual dependencies. No creator enable flags or site-file environment
variable are needed.

`membership_resources` owns the immutable site id, canonical host, group and
creator binding. `membership_site_settings` owns Google Client ID, registration,
site enablement and an optimistic version. Preview enablement and public branding
remain in the resource record. Browser requests resolve this configuration from
SQL, so changes take effect without restarting the process. Unconfigured or
disabled hosts return 404. Empty Google Client ID disables login with 503.
Registration is independent: disabling registration allows existing readers to
sign in but prevents new private identities. Disabling a site blocks use of its
sessions; it does not delete them, and re-enabling resumes unexpired sessions.

### Provision an existing group

The node operator first confirms that the deployment routes the HTTPS domain
under their control, preserving Host. `POST /v1/membership/sites` requires
`admin:membership:sites` on both the account and the active API key. Delegated
callers also need `user:group:all` (or `user:all`) and may bind only their own
ordinary private groups. An account and key with full `admin:all` retain the
operator's cross-owner provisioning capability. Group ownership or `user:all`
alone does not authorize domains. This is explicit operator delegation of proxy
bindings, not an automated DNS ownership check.

After upgrading, the administrator grants the core permission through
`POST /v1/admin/permissions/core/add_permission` with the intended `userId` and
`permissionName: "admin:membership:sites"`, then adds that permission to the
integration key, preserving its other permissions. No existing account or key is
elevated automatically. See [upgrade and verification](../../../../docs/plans/membership-site-permission.md).

Example body (replace the group/owner IDs and existing Google Client ID):

```json
{
  "id": "wave",
  "origin": "https://eraofwave.com",
  "groupId": "123",
  "ownerId": 7,
  "googleClientId": "existing-client.apps.googleusercontent.com",
  "enabled": true,
  "registrationEnabled": true,
  "postsEnabled": true,
  "version": 0,
  "links": []
}
```

The group must already be ordinary, private and unencrypted, with the specified
creator. Domain/group uniqueness is enforced in SQL. Existing resource identity
cannot be reassigned, even by this endpoint. New resources receive $4/month and
$20/6-month tariffs. Existing resources retain tariffs, invoice snapshots,
periods, payout settings and resource IDs.

The group creator uses `GET /v1/membership/admin/:resource/site` and
`POST /v1/membership/admin/:resource/site` with their existing bearer credentials
and `UserGroupManagement` permission to read/replace mutable settings. Updates
require the current version and all Google/enable/registration/preview fields;
include branding fields to retain them. Stale versions return 409. Owner updates
cannot change domain, group or creator. There is no creator settings UI yet.

### Upgrade from the former file configuration

Runtime JSON/env site loading has been removed. Before switching traffic, submit
each former JSON entry through the operator provisioning API with the **same**
id/origin/groupId/ownerId, explicit `enabled: true`, booleans and `version: 0`.
This creates the new settings row on the existing resource without recreating
financial records or tariffs. For a previously imported settings row, read the
current version instead of replaying version zero. Keep the original file until
the import has been verified; then remove `MEMBERSHIP_SITES_FILE` and the obsolete
global enable flags from deployment configuration. A resource without a new
settings record remains inaccessible to browser requests until provisioned.

Only a new table is added using model sync; existing resource columns are not
changed. The existing public-page setup and post filter are not automatically
converted into membership metadata by provisioning.

## Docker server preparation

Keep payment workers disabled while preparing/importing the ledger:

```dotenv
PAYMENTS_WORKER=0
PAYMENTS_COLLECTION_WORKER=0
```

The standard Compose service forwards payment settings from its project `.env`.
Use `npm run docker-upgrade` on the intended clean deployment branch; a dev merge
is not automatically a stable release or a published image. The updater selects
the exact image or builds locally, then restarts the service. Uncommitted tracked
server edits block the upgrade. Do not replace custom MODULES with only the three
creator modules.

Do not change eraofwave.com's proxy or copy the signing seed into an active new
ledger before migration rehearsal. Reader identities, paid periods, pending
invoices and wallet/checkpoint/nonce journals must be imported/reconciled before
cutover. The existing Google client ID is public; no client secret or Google
Console change is needed while the authorized origin/client stay the same.

## API and projection

Public/site-cookie routes: `/v1/membership/resource`, `/feed`, `/posts/:id`,
`/account`, POST `/refunds`. Feed and post detail return allowlisted title,
description, selected preview URLs, visibility and dates. `Post.propertiesJson`'s
`membership` object supplies title/description/free/previewCount/hidden and optional
introductory text. The canonical content source is post.contents. Each attachment
has postsContents.isPrivate; public exports include only explicit false values,
while full exports include the whole list. membership.pageUrl and previewMedia
are not export sources. Returned pageUrl is derived from the current post selector. Preview and pageUrl
values are root-relative paths on the creator-site origin (`/ipfs/...` and
`/api/v1/membership/site/posts/:id/`), without a hardcoded domain.
Posts lacking membership metadata are not exported.

A group feed fetches a bounded page through existing group hydration; raw private
post/content metadata never leaves the module. Group creator/visibility checks
run before the trusted internal read. Invoice/refund history uses bounded
50-row pages. Group/post ACL behavior for ordinary callers remains unchanged.

Owner bearer routes under `/v1/membership/admin/:resource` list options, invoices,
refund requests; create/update options; decide refunds and attest completion.
Ownership and core group-management permission are both required. Account access
is independent of API-key privileges and subscription never grants either.

Owner invoice/refund lists remain top-level arrays, bounded to 50 rows with an
`offset` and stable descending createdAt/id ordering. Invoice projections include
the tariff snapshot, direct/legacy provider, direct network, reader id/name and
the matching period. Refunds add the same resource-scoped invoice context plus
reader/period fields; missing related records return null. Projections exclude
Google subjects/emails, request keys, checkout URLs, arbitrary tariff metadata,
wallet/signing snapshots and unscoped financial rows. Clients may wrap these
arrays for their local screen contracts; they must not assume the old
MicrowaveGirls `{refunds: [...]}` envelope is provided by GeeSome.

Paid periods preserve calendar anchor days, stack on existing future periods,
and are credited at most once per invoice in the same transaction as settlement.
Expiry is recomputed per request. Refund approval retains access; manual
completion revokes that invoice period and leaves the audit record.

## Serving eraofwave.com

The reverse proxy serves snapshot HTML at `/`, and forwards explicit API paths to
GeeSome, preserving Host. No cookie from a different GeeSome domain is required.
The snapshot browser client already uses `/v1/payments`, native GeeSome post ids
and the Google challenge nonce. The former MicrowaveGirls `/api/membership` API
is not a compatible facade: retained owner screens need an explicit route/DTO
adapter before retiring that backend. Account history is bounded and invoices
can be resumed with GET `/v1/payments/crypto/invoices/:id`.

The creator SSG theme and paired public/full snapshots are implemented. Current
access controls discovery of the latest full snapshot. Plaintext IPFS pages and
media remain accessible if their CID is known; expiry cannot revoke a snapshot
already obtained by a subscriber. Protected-byte delivery is not part of the
accepted immutable snapshot contract.

## Verification and rollout

`npm run test:creator-membership:docker` creates/removes an isolated PostgreSQL
container, exercises actual API wrappers and production models, then runs the
ported chain/managed-ledger regressions. Google JWTs are signed locally and
verified by the real Google library with injected test public keys. Chain and
signing adapters are fake; no transfers or live RPCs are used.

Code delivery does not itself migrate production or remove MicrowaveGirls billing.
The agreed consolidation keeps the already configured new GeeSome ledger/seed;
it imports neither the old ledger nor its signing seed. Preserve old records and
reconcile outstanding obligations through their separate recovery path. Do not
activate competing allocators/signers during retirement. Existing old sessions
require a new GeeSome login. See the current continuation in the
[audited plan](../../../../docs/plans/creator-membership-migration.md#microwavegirls-consolidation-continuation-1502).


## Immutable website snapshots (#1441)

One private canonical group produces a public teaser/preview directory and a full
content directory in existing IPFS storage. No separate filesystem store, keys or
encryption is introduced. A subscriber keeps a snapshot's CID and files after
expiry; current access governs discovery of the latest full snapshot only.

Owner POST `/v1/membership/admin/:resource/publications` takes a stable requestKey.
GET `/v1/membership/admin/:resource/publication` returns queued/building/ready/failed
status and the site entry path. Ready snapshots activate automatic source-version
rebuilds. Both directories build before the transaction switches the current head;
errors retain the last complete pair. Lease recovery and retries with capped
backoff resume interrupted jobs, including after extended storage outages.
Post/attachment, group profile, branding and tariff changes enqueue only the affected resources.

The staticSiteGenerator layer owns snapshot generation and durable publication;
both variants use the shared site SSR pipeline and browser bundle with a creator
theme preserving the existing public interface, gallery, account/refund and crypto
checkout. Native sites keep their existing templates/styles. The theme has an
immutable account.html page and a site-bound API adapter;
a variant-only data adapter prevents private data entering public hydration state.
Attachment copies use their canonical storageId directly. File extensions are
resolved by the shared static-site helper using stored extension/name and the MIME
registry, with known MIME taking precedence over conflicting suffixes. Unknown
formats without a safe suffix fall back to bin.
The publisher uses the existing batched group hydrator. The result stores two root CIDs,
page count and a post-to-preview-filename index. Membership owns resource binding,
subscription checks and variant selection. Current publication ID and desired
revision live in resources.data.publication under the resource row lock; site
settings updates preserve this internal value. There is no separate heads table.
Publication CID holds contain only storageId and preserve old dependencies.

The domain path `/api/v1/membership/site/` (proxy to node `/v1/membership/site/`)
selects public/full by site-bound session and current resource entitlement, with
private,no-store selector responses. `/posts/:post/` selects the current post view.
It returns a 302 to the immutable CID. Group-reader rights are unchanged. Plain
CID GET/HEAD/Range is intentionally public, including after source edits, hiding,
deletion, site disable, expiry or refund. Public/full root and child references are
registered with storage retention so normal cleanup does not remove old snapshots.

`membership.teaser` and `fullText` optionally separate public/full text; existing
`description` is the fallback for both. Only explicitly public attachments enter public
snapshots. The microwave preparation action maps existing hidden/preview
policies to canonical metadata and per-attachment flags before the first render. Directory-relative links freeze old post/media
versions. Account controls use the existing Google nonce/session and payments APIs.

Deploy node first, then microwave; no new env flags are needed. Run group migration
20261027000000-add-post-attachment-visibility before using the new code against an
existing database. It marks existing private-group attachments private and leaves
public-group attachments public. New publication tables use model sync. The creator domain must proxy `/api/v1/*` to node
`/v1/*` preserving the original Host and Origin. Existing `/ipfs/*` traffic must
reach the same storage gateway. Initial activation does not move public root/DNS,
readers, invoices, payment workers or existing frontend hosting. See
[plan, tests and rollout](../../../../docs/plans/membership-website-snapshots.md).
