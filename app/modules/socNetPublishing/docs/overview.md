# Social network publishing

`socNetPublishing` coordinates private source posts, a destination registry and
independent queued publication jobs. Producers use
`/v1/user/social-publications`; `/v1/user/local-publications` routes remain aliases
of the same handlers. Old module configuration is normalized once and
`app.ms.localClient` remains an alias, without duplicate workers.

## Destinations and accounts

Every registered destination chooses a single endpoint and an execution mode:
`client` destinations belong to one dedicated client key and local account;
`server` destinations use an existing `socNetAccount` with app-pass-encrypted
write-only credentials. Public views never expose credentials or private account
IDs. Separate destinations may share a provider account.

Server setup uses `POST /user/social-publications/server-destinations` with
`requestKey`, `network`, `label`, `sourceGroupId`, `account`, `target`, required
`contentPolicy` and optional `enabled`. It verifies provider identity before saving;
`enabled` defaults false. Repeating the same key preserves destination identity;
setup with `enabled:true` explicitly activates it. Source ownership and private
ordinary-channel eligibility are checked. Generic account APIs cannot modify
managed identities or their encrypted credentials.

Server setup and manual server-result resolution require an explicit
`publishing:manage` API key or an owner password session. Producer
`publishing:local` keys cannot manage credentials, claim server work or report
server results. Legacy permission inference does not grant management scope.

## Compose and frozen intent

Compose requires `contentType:sfw|nsfw`, exact text, owned image references,
destinations and an owner-scoped request key. Destination `contentPolicy`
is required explicitly. Only NSFW→SFW is forbidden; see
[content-policy.md](content-policy.md) for the generic rule, digest v6 and
mandatory upgrade/recovery behavior. Provider target parameters contain routing
and provider-specific content details, never internal classification.

The source post and every job commit atomically. Policy violations and wrong
producer digests fail before writes. Replay returns the original source/jobs;
changed intent under the same key conflicts. Native private source channels can
be selected explicitly or initialized lazily. Draft activation checks unchanged
content and ownership transactionally. Public, remote, deleted, encrypted or
foreign sources and media are rejected. Listings and ID filters are bounded.

`social-images-v1` prepares owned images as bounded provider-ready JPEGs before
acceptance. Original references stay in the private source. Job preparation
metadata binds the original and prepared attachments without changing producer
intent. Patreon retains explicit member audience, exact teaser prefix, campaign
and image-preview requirements. Rule34 is client-only with tags and a credential
free HTTP(S) source. The client adapter derives its provider rating.

Outbox capabilities include `contentTypePublishing:true`, `socialPublishingApi`,
`publicationDestinations`, `serverPublishing`, `networkQueues`,
`ownedImageReferences` and `patreonPublishing`. Consumers require the new
classification capability before creating intent.

## Execution and outcomes

New jobs freeze `intentVersion:6`, `contentType`, policy, identity, endpoint and
payload. Registered client claims match the owner, dedicated client key and
enabled destination. Unbound client routes may fill a missing local account or
endpoint once within the selected private source group. Authored endpoint fields
remain authoritative. Routes have a single endpoint and no alternate dispatch
rules. Existing direct-client queues remain supported with canonical contentType.

Server adapters publish Bluesky, Discord and Telegram through fixed provider
origins. They verify the frozen account identity and load owned media through
the node. Discord performs its provider NSFW-channel check; Telegram verifies
numeric chat permissions. Provider classifications are derived only from
contentType. Adapters do not retry mutation requests.

The server worker is paused by default. Enable with
`SOC_NET_PUBLISHING_WORKER=1` (or serverWorker config); the shared interval worker
starts after initialization without an immediate tick and stops with the app.
Claims are short atomic transitions. Disabled destinations, missing credentials
or unusable accounts cannot starve later healthy work. Source privacy is checked
again before sends. Current destination policy does not rewrite queued intent.

Known provider rejection becomes failed. Unknown mutation outcomes become
needs_review and require owner reconciliation. A failed database acknowledgement
retries only result persistence, never the provider send. Client/server claim
and result routes remain isolated. Historical pre-v6 jobs are held for explicit
recovery rather than automatically sent after the schema upgrade.
