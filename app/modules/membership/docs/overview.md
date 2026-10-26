# Creator Membership

Opt-in sites bind a canonical HTTPS origin to an existing ordinary private,
unencrypted group and its creator. Membership owns `membership_resources`,
`membership_options`, and `membership_periods`. Payments owns financial records;
Google Authorization owns private identities. Buyers never join group member
pivots and receive no upload/publication permissions.

## Configuration

Default module packs include `googleAuthorization,payments,membership`. A custom
`MODULES` list must include them in that order, after `database,api,group` and
their usual dependencies. Site bindings determine availability; Google login
requires the site's `googleClientId`, and registration is controlled per site.
Set `MEMBERSHIP_SITES_FILE=/absolute/path/creator-sites.json` to load a public
configuration file. With no sites configured, creator endpoints reject requests.
Worker flags remain disabled for preparation/rehearsal.

Example file (replace numeric owner/group ids and use the existing Google client):

```json
[
  {
    "id": "wave",
    "origin": "https://eraofwave.com",
    "groupId": 123,
    "ownerId": 7,
    "googleClientId": "existing-client.apps.googleusercontent.com",
    "registrationEnabled": true,
    "postsEnabled": true,
    "coverUrl": "https://eraofwave.com/assets/cover.jpg",
    "links": []
  }
]
```

Google client IDs and origins are public settings; signing seeds are never put in
this file. Existing sites must retain their origin/group/owner binding; changing
those identities fails bootstrap. Explicit config controls branding and the
postsEnabled flag on restart. New sites receive $4/month and $20/6-month tariffs;
existing invoice snapshots/custom tariffs are never repriced. Tariff edits use
optimistic versions and are available only to the owner.

## Docker server preparation

The standard Compose service forwards the creator flags and existing
`DIRECT_CRYPTO_*`/`TRONGRID_API_KEY` settings from its project `.env`. A merged PR
in `dev` is not automatically a `master` release or a published image. Upgrade
the intended clean deployment revision using `npm run docker-upgrade`; it pulls
that checkout's branch and selects the exact image or builds locally, then
restarts the service. Uncommitted tracked server edits block the upgrade.

For a prepared installation with verified existing group/owner ids, create the
public site JSON under the persisted data directory, normally
`.docker-data/geesome-data/creator-sites.json`. The corresponding `.env` values
are:

```dotenv
MEMBERSHIP_SITES_FILE=/geesome-node/data/creator-sites.json
PAYMENTS_WORKER=0
PAYMENTS_COLLECTION_WORKER=0
```

The file path is inside the container. `GEESOME_DATA` can change the host side
of the existing `/geesome-node/data` mount. Do not replace an existing custom
`MODULES` list with only the three creator modules; append them after the existing
dependencies in the documented order.

Keep both money workers off, do not change eraofwave.com's proxy, and do not
copy a seed into a fresh active ledger before migration rehearsal. Existing
reader identities, paid periods, pending invoices and wallet/checkpoint/nonce
journals must be imported/reconciled before cutover. The existing Google client
ID belongs in the public JSON; a Google client secret is not needed for this
ID-token flow. No Google Console change is needed while the authorized origin
and client stay the same.

## API and projection

Public/site-cookie routes: `/v1/membership/resource`, `/feed`, `/posts/:id`,
`/account`, POST `/refunds`. Feed and post detail return allowlisted title,
description, selected preview URLs, visibility and dates. `Post.propertiesJson`'s
`membership` object supplies title/description/free/previewCount/previewMedia/
pageUrl/hidden. Posts lacking membership metadata are not exported. Migration
must materialize the old preview selection and hidden status into these fields;
there is intentionally no fallback to full attachments. Site preview/Page URLs
must be HTTPS `/ipfs/` links on that site's own host. Readers see a full legacy
Page link only while the post is free or entitlement is active.

A group feed fetches a bounded page through existing group hydration; raw private
post/content metadata never leaves the module. Group creator/visibility checks
run before the trusted internal read. Invoice/refund history uses bounded
50-row pages. Group/post ACL behavior for ordinary callers remains unchanged.

Owner bearer routes under `/v1/membership/admin/:resource` list options, invoices,
refund requests; create/update options; decide refunds and attest completion.
Ownership and core group-management permission are both required. Account access
is independent of API-key privileges and subscription never grants either.

Paid periods preserve calendar anchor days, stack on existing future periods,
and are credited at most once per invoice in the same transaction as settlement.
Expiry is recomputed per request. Refund approval retains access; manual
completion revokes that invoice period and leaves the audit record.

## Serving eraofwave.com

The reverse proxy serves static HTML at `/`, and forwards explicit API paths to
GeeSome, preserving Host. No cookie from a different GeeSome domain is required.
The old `/api/membership` API is **not yet a drop-in compatible facade**: new
payment endpoints use `/v1/payments`, post ids are native GeeSome ids and Google
login requires a challenge nonce. Update the browser client and prepare an exact
route/response adapter before production cutover. Account history is bounded and
new invoices can be resumed with GET `/v1/payments/crypto/invoices/:id`.

Current phase preserves link gating only. Plaintext IPFS full-set pages and
media remain public if their CID is known. Private original delivery and a safe
SSG creator theme are later phases, not a security guarantee of this API.

## Verification and rollout

`npm run test:creator-membership:docker` creates/removes an isolated PostgreSQL
container, exercises actual API wrappers and production models, then runs the
ported chain/managed-ledger regressions. Google JWTs are signed locally and
verified by the real Google library with injected test public keys. Chain and
signing adapters are fake; no transfers or live RPCs are used.

The current stage does not migrate production or remove microwave-girls billing.
Rehearse the mapping of legacy reader UUIDs to private identities and core users,
all payment snapshots/address cursors/journals, and native post ids first. Import
only with old workers stopped and preserve the authoritative ledger for rollback.
Existing sessions will require re-login unless an explicit session migration is
implemented. See the [audited plan](../../../../docs/plans/creator-membership-migration.md).
