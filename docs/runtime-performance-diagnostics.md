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
