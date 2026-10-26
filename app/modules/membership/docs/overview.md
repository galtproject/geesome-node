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
under their control, preserving Host. Only a bearer credential with `AdminAll`
and matching API-key permissions may call `POST /v1/membership/sites`. This is
operator approval of a proxy binding, not an automated DNS ownership check.
Group ownership alone does not permit arbitrary domain claims.

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
