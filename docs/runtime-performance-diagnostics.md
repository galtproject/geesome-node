# Runtime Performance Diagnostics

GeeSome's runtime profiler is disabled by default. Enable it during a CPU or
memory incident to write bounded JSON Lines snapshots without enabling access
logs or serializing request bodies.

```sh
GEESOME_RUNTIME_LOG_FILE=/var/log/geesome/runtime.jsonl \
GEESOME_RUNTIME_LOG_INTERVAL_SEC=60 \
  npm run start
```

`GEESOME_RUNTIME_PROFILE=1` enables the same profiler without requiring a file;
use it with the exact `DEBUG=geesome:runtime` namespace when debug output is the
desired destination. A broad `DEBUG=geesome*` does not enable event-loop or
request tracking, because that wildcard is common in existing deployments.

The legacy `GEESOME_MEMORY_LOG_FILE` and `GEESOME_MEMORY_LOGS_INTERVAL`
variables remain supported for memory-only snapshots. The legacy
`DEBUG=geesome:memory` behavior also remains memory-only.

Each interval records:

- process CPU percentage relative to one logical core, plus user/system CPU time;
- event-loop utilization and mean, p95, and maximum delay;
- RSS, heap, external, array-buffer, system-free, and system-total memory;
- system load average and logical CPU count;
- API and gateway requests started/completed/aborted, current in-flight count,
  average duration, HTTP method counts, and status classes.

No request paths, query values, headers, bodies, user IDs, or response payloads
are recorded. Interval counters reset after each snapshot; `inFlight` remains a
current gauge.

## Reading A CPU Incident

- High process CPU plus high event-loop utilization points toward JavaScript work
  in the GeeSome process. Capture a Node CPU profile during the same workload.
- High process CPU with low event-loop utilization points more toward native
  modules, garbage collection, or work outside ordinary JavaScript callbacks.
- High event-loop delay with a request spike points toward synchronous or
  CPU-heavy request handling. Compare API and gateway counts before selecting a
  route-specific reproducer.
- Low GeeSome process CPU while system load stays high means another process is
  the primary suspect. Check Kubo/IPFS, PostgreSQL, nginx, media converters, and
  other services with process-level tools.
- Rising aborted requests can indicate client disconnects, reverse-proxy timeout,
  or an overloaded response path.

The profiler attributes the first boundary only. It intentionally does not add
high-cardinality per-route labels or always-on tracing. Once a recurring boundary
is known, add a focused benchmark or job/route timer and keep it behind the same
opt-in diagnostics policy.

## Database Connection Diagnostics

Database connection diagnostics are independently disabled by default. Enable a
bounded aggregate sample every 60 seconds during a connection-pressure incident:

```sh
GEESOME_DATABASE_CONNECTION_DIAGNOSTICS=1 \
GEESOME_DATABASE_CONNECTION_DIAGNOSTICS_INTERVAL_MS=60000 \
  npm run start
```

The exact `DEBUG=geesome:database:connections` namespace also enables the
sampler. A broad `DEBUG=geesome*` does not enable it. Each sample contains only:

- configured Sequelize pool maximum, minimum, acquire timeout, and idle timeout;
- current pool size, available, borrowed, and waiting counters when the active
  Sequelize pool implementation exposes them;
- PostgreSQL connection counts grouped by `application_name` and connection
  state for the current database.

Activity groups default to 20 and are capped at 50 through
`GEESOME_DATABASE_CONNECTION_DIAGNOSTICS_ACTIVITY_LIMIT`. The sampling interval
is clamped between one second and one hour. Set `DATABASE_APPLICATION_NAME` to
distinguish multiple GeeSome process roles; the default is `geesome-node`.

The sampler does not record SQL text, query values, table rows, request data,
users, client addresses, or process IDs. It owns one non-overlapping interval,
and app shutdown drains an active sample before closing the Sequelize pool.

## Planning The Connection Budget

Every GeeSome process has its own Sequelize pool. All processes and auxiliary
tools that share one PostgreSQL server must fit this deployment formula:

```text
DATABASE_POOL_MAX * DATABASE_PROCESS_COUNT + DATABASE_AUXILIARY_CONNECTIONS
  <= PostgreSQL max_connections - DATABASE_CONNECTION_RESERVE
```

`DATABASE_PROCESS_COUNT` defaults to `1` and must include every GeeSome process
or replica sharing that PostgreSQL server. `DATABASE_AUXILIARY_CONNECTIONS`
defaults to `5` for concurrent migration, integrity-check, administration, and
other short-lived clients. Increase it when external applications also use the
server. `DATABASE_CONNECTION_RESERVE` defaults to `10`, preserving capacity for
recovery and operator access.

For example, the default pool of `20` with one process plans `25` connections.
With PostgreSQL `max_connections=100`, a reserve of `10` leaves `90` usable
connections. Four processes plan `85` and fit; five plan `105` and do not.

At startup, GeeSome reads PostgreSQL `max_connections` once and caches the
calculated budget. An impossible budget emits one scalar warning such as
`database_connection_budget_exceeded planned=105 usable=90 ...`. The check does
not run per request, block startup, resize the Sequelize pool, or change the
PostgreSQL setting. Set `DATABASE_CONNECTION_BUDGET_CHECK=0` only when the
server setting cannot be read or the deployment is validated externally.

## Group lookup and storage writer contention

`POST /v1/group/get` is a database-only read. It retains optional bearer
authentication and the existing private-group membership check, but bypasses
the storage writer fence. Ten concurrent storage writers can occupy that
fence's ten connections while doing media or IPFS I/O. Previously an unrelated
group lookup queued behind them, even though it did not access storage.
Mutation routes remain fenced. `test/groupReadFence.test.ts` exercises the
actual PostgreSQL advisory locks and HTTP route with all ten slots occupied;
it checks an authorized read, anonymous denial, and a blocked mutation that
resumes after release.

The 2026-11-05 ten-site trial completed but recorded five-second response-header
timeouts on group lookup and save-data. Later, four sequential authorized group
reads from the MG host returned HTTP 200 in 59–222ms. Read-only host samples
found Kubo at 157% CPU and I/O pressure around 11% full/27% some, while GeeSome
and PostgreSQL were around 2% CPU. Available memory was about 2GB; low free
memory alone did not establish exhaustion. No waiting native queues, active
operations, advisory-lock waiters, or active provider/reprovider work were
observed. These post-batch samples do not establish the original timeout cause.
The group read change removes a demonstrated contention mechanism; save-data
latency still needs an overlapping workload trace before changing its pipeline
or deadlines. No production profiling flags, queues, or configuration were changed.

## Storage admission and fence timing (#1563)

Legacy HTTP writer admission retains its ten-second acquisition budget. Supported
clients with a shorter transport deadline can send
`X-Geesome-Storage-Admission-Ms: 3000` (integer 1..3000) to opt into a shorter total
admission budget, including validation before a handler-owned fence. Invalid
values return `400 storage_admission_budget_invalid` before writer dispatch. The
capability is advertised as `publicDiscovery.capabilities.storageAdmission` by
`GET /v1` and in the public well-known discovery document. The header is allowed
by CORS. Test/module constructors may override the default, up to 10000ms.

An audited pre-execution refusal carries `admissionRejected: true` and
`executionStarted: false` with `503 storage_busy` or `storage_maintenance_busy` and
`Retry-After: 2`. These markers originate at the actual first admission failure;
a business handler throwing the same code cannot establish safe retry. Default
outer-fenced callbacks are marked only if they never began. Handler-owned routes
must explicitly declare an audited no-business-mutation-before-fence boundary;
currently only replacement preparation does. Never infer non-acceptance from a
transport timeout, generic 503 or code alone.

Disconnects abandon only work that has not acquired its first fence: late pool
checkouts are released without invoking the writer. A lost response after
admission remains uncertain and must be reconciled with the original key/receipt.
This deadline does not cancel running writers or shorten their GC protection.
Internal and background callers retain their existing acquisition policy.

`POST /v1/user/site-replacements` delegates fencing to the service. Authorization,
request normalization and matching existing-receipt lookup run before writer
admission; new HTTP snapshots probe the advisory lock without waiting, so active
GC returns `storage_maintenance_busy` promptly when pool capacity is available.
Internal service calls keep their previous waiting semantics. New snapshots still
fence all source validation. The mixed `save-data` route retains its writer fence.

Audited password login, post lookup/membership checks, owned content-list metadata
and owned static-site listing bypass storage capacity without weakening auth,
privacy, ownership or missing-object checks. This is storage-read-only, not a
promise of SQL-read-only: password login creates its API key. Setup/register and
mixed user updates remain fenced. This stage does not make large snapshot
validation asynchronous or increase execution concurrency.

Set `GEESOME_STORAGE_FENCE_DIAGNOSTICS=1` for a controlled observation window.
JSON `storage_fence` events record a generated fence ID, sanitized registered
route template/request ID, acquisition/rejection/release stage, pool wait, advisory
lock wait, hold duration, ownership count/peak, outcome and pool counters. Logging
is capped at 120 events per minute per process; dropped counts are reported on
the next emitted event. Samples are incomplete under the cap and cannot establish
whole-traffic percentiles. No bodies, tokens, actual URL parameters, source IDs or
request keys are included. Detached children retain their root correlation.

See [storage admission plan](storage-admission-plan.md) for the deferred durable
queue and dedicated GC scheduling stages. This stage needs no schema migration. Short-deadline clients must explicitly opt into the header and preserve the safe-refusal markers. Merge and publish the exact reviewed GeeSome commit before using
the normal idle-guarded upgrade; do not deploy from an unmerged topic branch.

## GC-safe pinned imports and retention policy (#1566)

The backend consumes the storage-only geesome-libs compatibility commit
`e16370089c4def674821fa85e8795379e7f2c671` (library PR #166). It starts from
our previous `420754a` dependency and does not import unrelated browser E2EE
changes from newer master. File, directory and canonical JSON DAG-CBOR helpers
use Kubo pinned import and confirm a matching recursive root before returning.
Codec, hash, CID version and directory wrapping remain unchanged. Confirmation
is a root-pin check, not an arbitrary linked-DAG availability audit or a backup.

`configureStoragePinning` now bounds `saveFile`, `saveDirectory` and `saveObject`
with a separate import deadline and the existing caller/fence-loss signal.
Import defaults to 30 minutes; `GEESOME_STORAGE_IMPORT_TIMEOUT_MS` accepts integer
milliseconds from 1 through 86400000 (24 hours). Invalid configuration fails at
initialization. A shorter caller deadline still wins. The old 120-second pin-only
limit is no longer imposed on the entire transfer.

Recursive pin proof has its own 120-second budget (`pinProofTimeoutMs` may shorten
it), with at most three read-only checks of the same CID for transient failures.
It never repeats the import. Missing pin, unavailable proof and proof timeout
remain distinct errors; caller/fence cancellation wins. All checks share one
proof deadline rather than renewing it for each attempt. Byte/path/URL helpers forward
options into `saveFile`. Kubo writes now wait for pin confirmation even when
legacy `waitForPin` is false; Helia retains its existing helper contract.

Ordinary replacement admission already defaults `deleteReplacedFiles` to false.
The new root is verified before cutover; physical retirement remains the explicit
existing queue, gated by deletion authorization and reference checks. No new
lease/epoch framework, deletion-policy change or automatic retirement is added.
Keep application exclusion around reference acquisition, MFS and retirement.
Kubo 0.42 MFS/native-GC coordination is a separate boundary; this patch does not
make arbitrary MFS mutation safe against an out-of-band raw GC command.
`saveDataStructure(waitForStorage:false)` also keeps its existing asynchronous
precomputed-CID contract; callers requiring stored publication state must wait.

Rollout: merge library PR #166 first, then node PR #1564, promote the reviewed
node release preserving master-only control/retention code, publish its exact
commit image, and use the normal idle-guarded upgrade. There is no schema or
MG protocol migration. Original batch plans/journals remain authoritative.
