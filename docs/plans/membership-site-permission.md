# Membership site provisioning permission (#1438)

## Contents

- [Requirement and boundary](#requirement-and-boundary)
- [Work and verification](#work-and-verification)
- [Upgrade](#upgrade)

## Requirement and boundary

The production website cannot register its existing creator group with the
current integration credential. Allow explicit narrow delegation instead of
requiring full node administration. No automatic rights elevation is authorized.

`admin:membership:sites` is checked by the existing account/core and active
API-key permission machinery. Delegated requests also require group management
and ownerId equal to the authenticated actor. The group must belong to that
owner. Full account AND active-key `admin:all` retain cross-owner operator use.
Immutable identity, exact HTTPS origin, SQL uniqueness and versioning remain.
This permission delegates domain approval; it is not DNS ownership verification.

## Work and verification

1. Node authorization/API/docs (this repo): add the capability and own-group
   check. Completed; real HTTP/PostgreSQL tests use production account/key checks
   and AsyncLocalStorage. Cover missing account/key/group grants, foreign owner,
   admin account with narrowed key, owner isolation and immutable origin.
2. Microwave admin/docs (dependent on node deployment): explain the permission,
   verify refusal and UI retry preserve one group/binding. Separate write scope
   allows documentation/tests in parallel, but final integration requires node.

Creator SQL suite: 17 passing; payment regressions: 51 passing. Focused core/auth
regressions: 20 passing. API docs generation and bundle smoke passed; the
security route inventory was regenerated and its check passed.
No production permissions, publication or transfers are used for verification.

## Upgrade

Merge/deploy node first. No migration or new environment variable is required.
An administrator uses POST /v1/admin/permissions/core/add_permission with
`userId` and `permissionName: "admin:membership:sites"`. Grant it only to trusted
creators/integrations authorized to approve domains. Add the exact permission to
the integration key, preserving existing permissions and group management
(`user:group:all` or `user:all`). UserAll alone does not include admin privileges.

The existing raw `permissions` array is used when creating keys; the key-update
API stores a JSON-encoded permissions string. This capability is not a new named
integration scope. Do not replace all other key permissions when adding it.
Existing full operator keys remain compatible, but the website integration can
use the narrower grant. Retry connection in Posts after both grants are active;
the existing group and resource IDs are retained. No automatic grants occur.
