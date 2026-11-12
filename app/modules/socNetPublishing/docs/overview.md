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
`ownedImageReferences`, `patreonPublishing` and `deviantartPublishing`. Consumers require the new
classification capability before creating intent.

## Execution and outcomes

New jobs freeze `intentVersion:6`, `contentType`, policy, identity, endpoint and
payload. Registered client claims match the owner, dedicated client key and
enabled destination. Unbound client routes may fill a missing local account or
endpoint once within the selected private source group. Authored endpoint fields
remain authoritative. Routes have a single endpoint and no alternate dispatch
rules. Existing direct-client queues remain supported with canonical contentType.

Server adapters publish Bluesky, Discord, Telegram and DeviantArt through fixed provider
origins. They verify the frozen account identity and load owned media through
the node. Discord performs its provider NSFW-channel check; Telegram verifies
numeric chat permissions. Provider classifications are derived only from
contentType. Adapters do not retry mutation requests. DeviantArt requires a server
destination and explicit title/AI disclosure per image; see the
[DeviantArt setup, OAuth rotation and delivery contract](../README.md#deviantart-server-publishing).

The server worker is enabled by default, including in Docker Compose. Set
`SOC_NET_PUBLISHING_WORKER=0` in the deployment `.env` to pause it, or set
`socNetPublishingConfig.serverWorker=false` in application configuration.
Compose also forwards `SOC_NET_PUBLISHING_INTERVAL_MS` (default 60000) and
`SOC_NET_PUBLISHING_BATCH_SIZE` (empty uses the queue's bounded default).
The shared interval worker starts after initialization without an immediate tick
and stops with the app. Custom `MODULES` lists that include `socNetPublishing`
must also include `socNetAccount`, or explicitly disable the worker.

After upgrading and recreating the container, existing eligible queued server
jobs will run automatically. Review or pause queued work before upgrading if
that is not desired. Failed and needs_review jobs are not automatically resent;
local-client jobs remain with their registered client executor.
Claims are short atomic transitions. Disabled destinations, missing credentials
or unusable accounts cannot starve later healthy work. Source privacy is checked
again before sends. Current destination policy does not rewrite queued intent.

Known provider rejection becomes failed. Unknown mutation outcomes become
needs_review and require owner reconciliation. A failed database acknowledgement
retries only result persistence, never the provider send. Client/server claim
and result routes remain isolated. Historical pre-v6 jobs are held for explicit
recovery rather than automatically sent after the schema upgrade.

## Named destination groups

Node owns first-class [Publication Destination Groups](destination-groups.md).
They organize explicit destination IDs for producer selection, including several
channels of one network. Creation is idempotent, edits compare a revision, and
saved delivery snapshots remain unchanged. Non-credential group metadata uses
publishing:local plus owner group management; server credential setup retains
its separate publishing:manage authorization.


## Discord card presentation (#1593)

Server Discord publications use one rich embed instead of plain message content.
The caption's first line is the card title (up to 256 UTF-16 units); subsequent
lines are its description. Longer first lines keep the complete caption in the
description rather than truncating it. When present, the first valid credential-free
HTTP(S) caption URL links the title; it is never fetched by Node. Selected images
remain authenticated byte uploads and are referenced as `attachment://image.png`
or `attachment://image.jpg` inside the same card. No public image URL is needed.
No plain `content` is sent, so caption links do not create an additional automatic
link-preview card. Mentions remain disabled and NSFW-channel validation is unchanged.
The bot needs Discord's Embed Links and Attach Files permissions. Text-only and
image-only messages use the same card format. Only presentation changes; the
original caption, intent digest, destination, receipt and one-send rules remain.
Existing Discord messages are not edited or resent.

Contract: [Discord Create Message and Embed Object](https://docs.discord.com/developers/resources/message).


## Managed DeviantArt OAuth

`deviantartOAuth` advertises managed start/status/callback connection. Owner
management authorization starts an encrypted ten-minute S256 PKCE flow; a public
fixed HTTPS callback atomically consumes its hashed random state and stores the
verified grant through existing server-account setup. Credentials never reach
browser responses, redirects or callback access logs. New model-sync pending-flow
tables need no existing-table migration. See [setup and recovery](../README.md#managed-deviantart-account-connection)
for server callback configuration, proxy logging, expiry and reauthorization after
an interrupted one-use exchange. Source jobs and publication worker behavior are
unchanged.
