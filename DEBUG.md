# Debugging & Logging

GeeSome Node keeps logs quiet by default. Enable extra output with the variables below.

## How to set variables

- **Docker (systemd service):** `geesome-docker.service` sets `DEBUG=geesome*` and `IPFS_PROFILE=server` by default. Set other variables in a `.env` file in the project root (next to `docker-compose.yml`); the `web` service passes them through, so the values reach the node. Then restart:
  ```
  echo 'GEESOME_MEMORY_LOG_FILE=data/memory-profile.jsonl' >> .env
  sudo systemctl restart geesome-docker   # or: docker compose up -d
  ```
  Note: values already set by the service (`DEBUG`, `IPFS_PROFILE`) take precedence over `.env`.
- **Local run:** export the variable before start, e.g. `DEBUG=geesome* npm start`.

## Debug namespaces (`DEBUG`)

`DEBUG` uses the [debug](https://www.npmjs.com/package/debug) format (comma-separated, `*` wildcard).

| Value | Output |
| --- | --- |
| `geesome*` | All node module traces (deployment default) |
| `geesome:app` | App lifecycle / module startup only |
| `geesome:memory` | Memory profiler snapshots (see below) |
| `geesome:database:sql` | SQL query traces (pair with `GEESOME_LOG_SQL=1`) |

## Log flags

| Variable | Effect |
| --- | --- |
| `GEESOME_ACCESS_LOGS=1` | HTTP access logs |
| `GEESOME_DEPENDENCY_INFO_LOGS=1` | Dependency fallback info logs |
| `GEESOME_LOG_SQL=1` | Enable SQL logging (with `DEBUG=geesome:database:sql`) |
| `GEESOME_TEST_LOGS=1` | Test stdout diagnostics (test runs) |

## Memory profiling (for sizing hardware)

Profiles process and system memory. Active when `DEBUG` includes `geesome:memory` (the deployment default) or `GEESOME_MEMORY_LOG_FILE` is set.

| Variable | Effect |
| --- | --- |
| `GEESOME_MEMORY_LOG_FILE` | Append snapshots as one JSON object per line (JSONL) to this path. Use `data/memory-profile.jsonl` so it lands on the host at `.docker-data/geesome-data/memory-profile.jsonl`. |
| `GEESOME_MEMORY_LOGS_INTERVAL` | Snapshot interval in seconds (default `60`). |

Each line looks like:
```json
{"time":"2026-06-19T22:14:03.221Z","rssMb":412.3,"heapUsedMb":188.1,"heapTotalMb":240,"externalMb":31.2,"arrayBuffersMb":12,"systemTotalMb":1981,"systemFreeMb":540.4,"uptimeSec":3600}
```

`rssMb` is the process resident memory — the number to size RAM by; `systemFreeMb` shows host headroom. The JSONL file can be handed to an agent to analyze and propose hardware requirements.
