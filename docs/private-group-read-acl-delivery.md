# Private group read ACL delivery (#1358)

## Gateway contract

Microwave-girls reads `/v1/group/:groupId/posts` with a dedicated bearer key belonging
to the group creator/administrator/member. Readers are not added to Geesome groups.
The gateway owns billing entitlement and preview/Page-link filtering. Geesome
rejects anonymous/nonmember reads irrespective of billing flags.

`POST /v1/group/get` supports exact database `id`; empty/unknown-only lookup bodies return HTTP 400.
`POST /v1/post/get` supports database `id` (plus existing name/manifest lookup fields).
`GET /v1/user/post/:postId` also hydrates by DB id. Private ordinary posts return
an id and contents but no manifestStorageId or directoryStorageId; gateway persistence
and retry correlation must not require a manifest CID. Reconcile membership posts by deterministic
`name: membership-<local publication id>` and validate group/source metadata; the
legacy lookup API does not accept arbitrary source tuples. The existing database
unique group/source/channel/post index still fences duplicate publication writes. Do not use encrypted
`GroupType.PrivateGroup` for the gateway unless browser encryption is intended.

## Changes

- Optional authenticated ACL on public group detail, post legacy lookup and post list.
- Membership checks on authorized post detail/list and local-group lookups.
- Plain private posts no longer publish manifests or static directories; group
  manifests omit post indexes and directory refs.
- Private nested repost payloads are excluded from hydrated listings.
- Numeric Content metadata checks attachment group context; owner reads and
  published/shared byte metadata remain deliberately supported.
- Public category feeds exclude private/deleted groups from both pages and totals.
- Authenticated category group lists require category access and filter private
  groups by actor visibility in both SQL page/count queries. Section lists are
  actor-owned by default, with category access required for scoped reads; raw
  historic directory/section refs are not disclosed to unrelated accounts.
- RSS uses the same authenticated local-group read guard; public HTTP feed stays public-only.
- Empty post legacy lookup rejected and deleted posts excluded.

## Upgrade/rollback notes

Group model has no default for isPublic; legacy omitted values can be NULL. This
change treats NULL as private (fail closed), not public. Before deployment inventory:

```sql
SELECT id, name, "creatorId", "isPublic", "isEncrypted", "manifestStorageId",
       "directoryStorageId" FROM groups WHERE "isPublic" IS NOT TRUE;
```

An operator should explicitly set `isPublic=true` only for owner-confirmed public
legacy groups; keep private groups false. No automatic visibility migration is safe.
Rebuild private group/post derived state to drop old discovery references after
reviewing backups and documented derived-state repair commands. Previously
published immutable plaintext manifests/directories/CIDs cannot be revoked by
regeneration, unpinning or API ACL. Use newly created private groups and avoid
publishing secret Page-link text as standalone public content for new memberships.
Public Page/media byte access is intentional and remains unchanged.

## Verification

- Full isolated Docker suite: **658 passing, 11 pending, one fixture failure** (24m).
  The category test's second group omitted `isPublic` while expecting a public feed
  entry. It was explicitly marked public; production NULL visibility stays fail-closed.
- Final exact-source isolated Docker regression: **9 passing (58s)**, including
  the corrected category fixture, section behavior, exact group-ID reads, empty
  lookup HTTP 400, unknown post JSON null HTTP 200, owner/member/admin visibility,
  nonmember legacy directory-ref exclusion, guest/private Content protection,
  and anonymous public group reads.
- Final local unit regression: **46 passing**, covering group API, Content metadata
  and headers, manifest helpers/user transport and RSS projection.
- `npm run generate-docs`: passed.
- Security route inventory regenerated/reviewed and check passed; scalability
  inventory regenerated/reviewed and check passed; `git diff --check` passed.
- The 11 existing skipped cases cover external YouTube/media conversion, remote
  object/static-ID/account and Telegram import fixtures; none were newly skipped.
- Earlier concurrent DB-isolated tests still shared IPFS keystore/MFS and were
  interrupted. Final full/scoped evidence above was run serially. The old host
  `tsc` version cannot parse the repository's modern baseline; its diagnostics
  were not used as change verification.

Final bounded additions after the full snapshot are covered by the exact-source
regression; the full suite was not repeated for the corrected public fixture and
read-only category visibility guards. Root owns commit, push and PR delivery.
