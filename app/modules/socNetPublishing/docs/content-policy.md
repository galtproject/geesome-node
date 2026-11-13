# Publication classification

A publication has one required `contentType`: `sfw` or `nsfw`. Compose accepts it
at the top level and freezes it on every resulting job. Destination
`contentPolicy` uses the same two values and is required explicitly on registration and setup.
A destination has one endpoint; separate destinations can share an account.

`isContentTypeAllowed(contentType, contentPolicy)` is shared policy logic across
all networks. NSFW content cannot enter an SFW destination. The other three
valid combinations are allowed. Invalid types are rejected. Compose checks
before source writes and again while freezing destination identity; server
workers check only frozen job classification and policy.

Classification is absent from target parameters. Provider adapters translate it
at send time: Bluesky labels, Discord NSFW-channel checks,
and client provider flags. Rule34 remains client-only and derives provider
rating `s` for SFW or `e` for NSFW. There are no network exceptions to policy.

## Upgrade and recovery

Migration `20261110003000-publication-content-type.cjs` is transactional. It
refuses to proceed when a destination still has a nonempty `sfwChannelId` or
`sfwChatId`: split those configured endpoints into explicit destinations before
upgrading. It never silently discards an alternate endpoint. Nullable policies
become `nsfw` without inferring classification from names or labels.

For historical jobs, the migration maps old `target.sensitive=false` to SFW;
Rule34 rating `s` also maps to SFW. Other or missing classifications become
NSFW. It deletes old internal classification keys. IDs, status, request hashes,
producer digests, claim tokens, remote results and errors remain unchanged.

Historical digest/request identities are opaque evidence, not newly signed
intent. Only new `intentVersion:6` jobs can be claimed. Both client claim routes require
an explicit `intentVersion:6` request handshake; older executors are rejected
before any ownership transition. Existing result acknowledgements remain valid. Historical jobs remain
visible with `upgradeRequired:true` and an actionable reason; queued work can be
cancelled through the existing API after reviewing its provider outcome.
Already processing jobs can still report their result, and ambiguous jobs can
be settled through existing owner management. No migration requeues or sends.
Reusing an old compose/request key returns `publication_upgrade_required`;
clients must reconcile by saved IDs/keys and must not silently create new keys.

This migration is forward-only: the removed distinction between absent and
explicit old booleans, or Rule34 `q` and `e`, cannot be reconstructed reliably.
Rollback requires a pre-upgrade database backup plus matching application
versions. Stop executors and back up before rollout; upgrade Node, Girls and
Client together. The old authored API is deliberately rejected.

## Digest v6

SHA256 of UTF-8 `JSON.stringify` with this exact field order:

```js
{version:6,contentType,destinationId:null|number,executionMode:'client'|'server',
 accountIdentity:string|null,clientId:string|null,network,localAccountId:string|null,
 text,attachments:[{storageId,mimeType}],target:sortedTarget}
```

Nonapplicable identity fields are null. An unbound local account also hashes as
null. Attachments retain order; target keys sort lexicographically. URLs and
filenames do not enter the digest. Digest v6 binds classification independently
of provider target parameters. Original producer intent remains frozen when
images are prepared or an unbound local route is selected.

Telegram publishes both content types without photo spoiler flags or text spoiler
entities. Destination policy still applies.
