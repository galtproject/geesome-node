# Creator snapshot selector performance

Tracking: [#1495](https://github.com/galtproject/geesome-node/issues/1495).

The existing `/api/v1/membership/site/` family still returns a 302 to the current
immutable public/full IPFS directory. It does not proxy HTML/assets or bind the
production domain. GET and HEAD share the same selection policy.

## Anonymous requests

Without the exact reader-session cookie or an Authorization header, successful
selections share a process-local cache keyed by normalized Host and the parsed
post/archive/account target. Unrelated analytics cookies do not disable it.
A warm hit does no database work. The cache stores only the origin and public
redirect URL; it never stores authenticated selections, full roots or errors.

The cache holds at most 256 entries with LRU eviction. Entries expire one second
from the start of their load, without extending on hits. Concurrent misses share
one pending load. Pending loads also expire; a slow or previously invalidated load
cannot repopulate a newer entry. No Redis, new configuration or schema is required.

Resources, site settings, publications, groups, owner core permissions and users
invalidate the process cache after their model changes commit. Rollbacks retain
committed cache data. Save/destroy, bulk changes and upserts are covered; hooks are
removed on membership shutdown. Other worker processes, direct SQL and writes
that explicitly bypass model hooks are bounded by the short TTL, rather than
claimed to have synchronous distributed invalidation. Already in-flight requests
can complete with the publication they selected before a concurrent change.

## Personalized requests and request policy

Any reader-session cookie (including empty, forged or duplicate values) or
Authorization bypasses the guest cache. Reader identity and subscription expiry,
revocation and site isolation are checked on every such request. A signed-in
reader without active entitlement still gets public, without adding their result
to the shared cache. Acquiring an old full CID still has the existing permanent
IPFS access semantics; this optimization does not revoke previously obtained data.

Origin/Fetch Metadata checks run on cache hits too. Safe external document links
remain supported; cross-site API fetches and foreign Origin remain rejected.
All selector HTTP responses remain `Cache-Control: private, no-store` and
`Vary: Cookie, Host`. This is not a shared CDN/browser response cache. Immutable
files at their selected CID keep their existing independent caching policy.

## Cold-path queries

The selector reuses its loaded resource for owner validation instead of reading
it again. It projects only ready-publication routing fields from PostgreSQL JSONB:
the selected root, layout version, page count and needed path/post-existence flag.
Large HTML/media inventories and the opposite root are not fetched. Owner/group
checks are preserved on cache misses and all personalized requests.

## Verification and rollout

Focused tests cover single-flight, TTL/pending expiry, LRU bounds, errors,
commit/rollback behavior, invalidation races, hook cleanup and credential bypass.
Real PostgreSQL/HTTP tests count zero SQL queries on a warm guest hit, two resource
reads on a cold request (binding plus selection), and verify settings disable,
owner permission revocation, publication changes and paid/expired/revoked sessions.

Deploy the reviewed node update normally. Caches start empty after restart.
No production deployment or new live latency measurement was performed here;
zero-query assertions are local test evidence, not a server/network latency claim.

Validated locally: 77 creator membership tests and 57 payment tests passed with
isolated PostgreSQL/Kubo; API docs and route inventory passed. Test startup waits
for real IPFS RPC and its published host port, with diagnostics on timeout.
