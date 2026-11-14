# Social statistics

Tracking: [#1596](https://github.com/galtproject/geesome-node/issues/1596).

`socNetStatistics` stores historical measurements and exposes owner-scoped summary,
history, local observation ingestion and server refresh APIs. Server metrics come
exclusively from `socNetAccount.getStatistics()`: that module selects the owned
account, decrypts credentials, and dispatches fixed-provider reads. Clients collect
local-account metrics themselves and send only observations. The statistics module
never receives server credentials or fetches publication URLs.

## Storage and intervals

Two new Sequelize model-sync tables, `SocialPostStatistics` and
`SocialGroupStatistics`, store post and group/destination snapshots. A group here
is a registered network endpoint, linked to its private source group; distinct
channels/accounts of one network retain distinct histories. Unique
`(userId, jobId|destinationId, periodStart)` identifies a UTC calendar day.
The latest observation replaces that day's row atomically. Another UTC day inserts
another row; delayed/equal timestamps cannot overwrite newer values. All metrics
belong to one observation; submit the complete available metric set per entity.
Missing metrics remain null/unavailable, never measured zero. No backfill or
retention deletion runs automatically. Follower delta compares the latest two
available daily snapshots, so it is net growth over the displayed dates, not gross
new subscriptions or necessarily a 24-hour interval. The first day has no delta.

These are new tables, created by `sync({})`, with no production-schema migrations.
Existing posts/queues are not changed or republished. History begins on first
measurement. Paused/disabled destinations retain readable history. Only enabled
destinations appear as audience cards and count toward shared Discord destinations;
this filter applies before pagination. Posted receipts remain visible after a
destination is disabled.

## API and boundaries

All nine `/v1/user/social-statistics` handlers require `publishing:local` plus
`UserGroupManagement`. Summary and history are read-only and owner-scoped.
Summary defaults to 20 latest posted receipts; at most 50 receipts and 50
destinations are read per page, with independent next offsets. Optional filters
select source group and network. History returns up to 365 daily rows (default 30).
Only safe caption/receipt/target metadata and statistics are projected.

Local `/observations` accepts 1–100 entries atomically. A dedicated client key
must match the frozen job/destination `clientId` and `executionMode=client`.
The server derives all provider identities from owned posted receipts/destinations;
clients cannot write server measurements or another client's rows. Counts are safe
integers, nonnegative except Reddit score; timestamps must be ISO UTC and no more
than five minutes in the future. Older offline measurements may fill older days.

`POST /refresh {kind,id}` reads one owned server entity through `socNetAccount`.
The publication destination and frozen server account must still agree. Each
response returns `updated`, `unsupported` or `unavailable`; failures preserve
previous measurements and never return provider errors/credentials. The client
orchestrates explicit refresh serially for the current summary page. There is no
new polling or publication worker. Include `socNetAccount` in custom module lists
to use server reads; default module packs already include it.

## Available server metrics

- Bluesky: followers; post likes/replies/reposts. No views counter.
- Telegram Bot API: destination member count. A separately selected Telegram user account reads historical post views, reactions, replies and forwards.
- Discord: approximate guild members and online presence, explicitly scoped to the whole server. Shared guild destinations read one canonical latest snapshot per day across their observations. Message reactions are the primary response metric; channel followers and message views are not supplied.

Local collection coverage is documented in GeeSome Client's `docs/social-statistics.md`.
The client can read the summary only after this Node update is deployed.

Primary provider contracts: [Bluesky lexicons](https://github.com/bluesky-social/atproto/tree/main/lexicons/app/bsky),
[Telegram Bot API](https://core.telegram.org/bots/api#getchatmembercount),
[Discord message object](https://docs.discord.com/developers/resources/message#message-object).

## Verification

`DATABASE_PORT=<postgres-port> node --import tsx node_modules/.bin/mocha test/socNetStatistics.test.ts --exit`
uses real PostgreSQL and production Sequelize statistics/publication models for
same-day/day-boundary updates, concurrent monotonicity, owner/client isolation,
atomic rollback, server delegation and safe history. Provider transports use fixed
fixtures; no live credentials or remote publications are needed. The focused
publication/provider/statistics regression set passed 77 tests. API docs generation,
security inventory and scalability inventory checks passed. Full Docker suite was
not run for this slice. Repository-wide `tsc --noEmit` has existing unrelated errors.

## Publication activity and audience scopes (#1599)

Each destination now includes `publicationCounts.last24Hours`, `last7Days` and
`asOf`. They count distinct nonempty remote IDs from owner/destination posted
receipts in trailing inclusive 24-hour/7-day intervals ending at one server time.
The count query is independent of the summary post page, excludes future/failed/
queued work and uses the partial owner/destination/confirmedAt index. The first
successful acknowledgement records `confirmedAt` transactionally; replay leaves
it unchanged. It is the GeeSome confirmation time, not a provider-asserted original
send time. Historical terminal posted rows are backfilled from the existing
terminal status `updatedAt`; creation/scheduling timestamps are never substituted.
Migration `20261111000000-publication-confirmed-at.cjs` upgrades the existing table
and creates the index concurrently. Run migrations during the normal Node restart
before deploying the new client. Rollback removes the additive field/index; a
later re-upgrade reconstructs historical acknowledgement times from terminal rows.

Group metric fields are network-specific: Discord accepts `members`/`online`,
other networks `followers`. The safe derived `audience` descriptor includes kind,
scopeId, approximate and sharedDestinations. Discord history and latest/delta use
one newest observation per UTC day across the owner's destinations in that guild;
per-channel publication counts remain separate. Approximate member deltas mean
changes in the estimate, not gross new followers. No external metrics are summed
across audiences.

Read outcomes distinguish unsupported metrics, access denial and provider rate
limits; old snapshots remain intact. X Cookie collection is implemented in Client with a bounded recent originals timeline; paid X API
access is not enabled. The client hides empty history actions and labels each
primary post response correctly (Discord reactions, Reddit score, other likes).

Verification: 85 focused PostgreSQL/provider/account tests and the migration coverage test passed, including migration
replay/backfill, confirmation replay, count boundaries/isolation/deduplication,
shared guild history and provider access failures. Migration integrity against the
disposable model/migration fixture: 20 passed, 0 failed (292 unrelated checks
skipped because those tables are absent). No live provider calls were made.

The additional full-app migration test is blocked before feature initialization by the local storage dependency import: `@peculiar/webcrypto` does not export `Crypto`. The direct migration rehearsal/audit above passed independently. Repository-wide TypeScript checks retain unrelated pre-existing errors; the changed statistics/account/model/test files have no diagnostics.

## Telegram user readers and Patreon metrics (#1602)

Five additional endpoints list safe Telegram accounts/destinations, start/complete/cancel login, and bind a reader to a destination. Login/binding require explicit publishing:manage (or owner password session), publishing:local and UserGroupManagement. Login challenges are opaque, owner/API-key-bound, expire after ten minutes, limit attempts and disconnect every transport. Phone, API ID/hash, code and optional 2FA reuse telegramClient.login; browser-supplied sessions are rejected. Node alone retains sessions.

The new model-sync telegramStatisticsReader table binds an owned destination to an owned usable user account. Frozen publication intents and bot credentials are unchanged. Telegram post refresh goes through socNetAccount even for client-mode publication receipts; client observations cannot overwrite a bound reader. Missing readers return connection_required. The exact target and message are read without incrementing views, publishing, webhook updates or draining bot updates. Old snapshots survive access errors.

Patreon group observations accept followers (total members) and paidMembers (a subset), validating nonnegative safe integers and paid ≤ total when both are present. Client performs its own credentialed campaign reads.

Verification: 95 focused PostgreSQL/provider/account/login tests passed, including challenge ownership, expiry, 2FA, cancellation, failed-connection cleanup, exact message reads, reader isolation and observation protection. API documentation and security inventory were regenerated. Client additionally verified desktop/narrow login and Summary states with fixture API responses. Real Telegram authentication remains a user action. Repository-wide TypeScript checks retain unrelated errors; changed feature files have no diagnostics. The full Docker suite was not run.

## DeviantArt (#1638)

Server OAuth now requests `basic user browse stash publish`. Existing accounts
must consent again for deviation statistics; refreshing a token cannot grant a
new scope. Watchers use `user/whoami?expand=user.stats` (basic/user); deviation
metadata with `ext_stats=true` supplies favourites (`likes`), views and comments
(`replies`). The UI names favourites explicitly. Missing fields remain null;
no profile-view or follower estimates are substituted.

The reader checks the authenticated UUID and deviation author UUID against the
owned account identity and only contacts fixed DeviantArt API hosts. Mature
metadata is requested explicitly. Statistics use `loadServerAccount` and the same
transaction/advisory lock used by publishing to persist refresh-token rotation
before later failures. OAuth denial/revocation returns `reconnect_required`;
429 returns `rate_limited`. Failed reads preserve prior snapshots. No publish,
queue or destination settings are changed by a statistics refresh.

Sources: [Who Am I](https://deviantart.readme.io/reference/user_whoami),
[Deviation metadata](https://deviantart.readme.io/reference/deviation_metadata),
[OAuth](https://deviantart.readme.io/docs/authentication).
