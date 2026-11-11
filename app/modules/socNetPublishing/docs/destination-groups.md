# Publication destination groups

A Publication Destination Group is owner-scoped selection metadata in Node,
separate from the private source channel. It contains a label, ordered
`destinationIds` (1–20 unique owned IDs), `revision` and `enabled`. Different
members may use the same network or provider account. Groups never contain
credentials or other groups, never change destination policy, and never grant
permission to publish.

`GET /v1/user/social-publications/destination-groups?limit=100&offset=0` lists safe
metadata. `POST` at the same path creates with `requestKey`, `label`,
`destinationIds` and `enabled`. A stable creation key prevents duplicate creation
and cannot reset a group that has since been edited. `POST /:groupId` replaces
label/members/state with the current `revision`; stale writes fail with 409, while
an exact replay of the last update is safe. Both canonical and local-publications
aliases require publishing:local plus the owner's group-management permission.
No server-credential management capability is added to this scope.

Producers expand the complete selected revision into explicit destination IDs,
validate every member and content policy, then freeze those destinations using
the existing compose/digest contract. Do not silently drop a disabled, missing,
foreign-source or unsupported member. Multiple destinations of the same network
must keep independent keys/schedules/outcomes. Already saved intents retain
those snapshots; editing or disabling a group affects only new selection.
Disabling a destination remains the way to block that destination's future claims.

The new table is created by Model.sync at normal module initialization; it needs
no table-only migration and does not rewrite existing jobs or destinations.
The schema audit checks JSONB members, integer revision and owner lookup/unique
creation-key indexes. Deploy Node support before enabling group editing in a
producer; outbox advertises publicationDestinationGroups=true.

Girls exposes group management in publishing settings and resolves individual
and group selections in its dialog. Provider-specific authoring flows remain
explicit; unsupported group members are shown as unavailable rather than omitted.
No production action is part of feature verification.

Migrated server members can be reverified using
`POST server-destinations/:destinationId/settings` with the complete safe catalog
row in `expected`, explicit `enabled` and `contentPolicy`. This requires
publishing:manage and publishing:local (or an owner session). Stored encrypted
credentials remain inside Node; identity and endpoint are verified without a
publication. Only policy/activation can change, never account/source/target/jobs.
Stale snapshots fail; exact unchanged retries are safe. Enabling may release
eligible queued jobs, so inspect the queue before operational activation.
