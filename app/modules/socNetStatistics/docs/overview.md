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
measurement. Paused/disabled destinations retain readable history.

## API and boundaries

All four `/v1/user/social-statistics` handlers require `publishing:local` plus
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
- Telegram Bot API: destination member count. Historical post metrics unsupported.
- Discord: message reactions, separate from likes. Channel followers and views
  unsupported; guild membership is not mislabeled as channel followers.

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
