# Publication queue shuffle

`POST /v1/user/social-publications/queue-shuffle` (also available under the legacy
`local-publications` namespace) requires an authenticated owner with
`publishing:local` and `UserGroupManagement`. It accepts `requestKey`, `groupId`
and 1–20 distinct `destinationIds`.

The source must be an owned ordinary closed queue group, and each destination
must be enabled, owned and compatible with that source. Only future `queued`
v6 jobs in that source are eligible. Due, processing, terminal, deleted-source,
foreign and unselected jobs are untouched. Within each destination, Fisher–Yates
independently assigns its existing scheduled slots to its jobs. Payloads, source
posts, request/producer hashes, accounts and routes do not change. Identical time
slots remain tied by the existing job ID ordering.

All schedule updates and the durable owner/request-key result commit in one
transaction. Retrying a lost reply returns that result without shuffling again;
reusing the key with another source/member set is a conflict. Concurrent claims
and shuffles lock destination and job rows. Server claims recheck the due time
after locking, so a candidate moved into a later slot cannot publish early. A request with more than 10000
eligible jobs rolls back without changes.

The result contains `requestKey` and per-destination `queuedJobs`/`changedJobs`.
Outbox capabilities advertise `queueShuffle: true`. The new
`publicationQueueShuffle` model table is created by model sync; there is no
existing data migration. Deploy this Node capability before enabling the Girls
checkbox. Girls sends a separate shuffle request after every member of its
frozen enqueue batch has been acknowledged, retaining the original keys on
partial/unknown outcomes.

Verification: `test/publicationQueueShuffle.test.ts` exercises real PostgreSQL
transactions, independent same-network destinations, exact slot preservation,
foreign/other-source/due/processing exclusions, concurrent/lost-response replay,
rollback, the 10000-job bound and both URL aliases' authorization. The server
publishing suite also verifies a candidate rescheduled before its claim lock. The existing destination-group
suite also passes. API docs, security route inventory and scalability inventory
checks are run with this change. No provider publication is part of validation.
