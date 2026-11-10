# Upload acceptance during storage cleanup (#1568)

## Behavior

Site replacement still protects reference checks, MFS detach, unpin and physical
GC with the shared/exclusive PostgreSQL fence. Cleanup batches run after at least
60 seconds since the last HTTP write attempt or completed storage writer, with
no active writers or pending upload/save/render/archive queue. Receipt age and
retry requests do not force daytime GC. Startup begins with a quiet cooldown.
A new queue/activity check follows exclusive-lock acquisition.

Activity time is local to the node process; durable queue state is shared in SQL.
This policy targets the existing single-process node deployment, not aggregated
interactive activity across multiple replicas. Pending jobs remain persisted if
traffic never becomes quiet; monitor disk usage rather than promising a deadline.

The replacement status API exposes `result.cleanupTiming.waiting`, `retirement`
and `gc` with start/end, elapsed duration, attempt count and outcome/error. The GC
phase measures the native Kubo GC iterator, separately from repo.stat, reference
checks and result verification. A missing end marks an interrupted attempt.

## Durable multipart acceptance

`POST /v1/user/save-file` receives one authenticated file into private
`$DATA_DIR/upload-staging/<uuid>/file.bin` (`DATA_DIR=data` by default), fsyncs the
file and directories, then atomically checkpoints its ordinary async-operation
receipt and queue. Reception does not acquire the IPFS writer fence.
`async=true` returns the usual `asyncOperationId` and channel. Existing clients
continue polling ordinary operation endpoints; `inProcess=true` includes staged
waiting. Synchronous callers wait for that same job and receive Content.

The shared queue processor imports after the fence is available. It rechecks the
original owner/API key, cancellation, file SHA-256/size and normal save quotas,
then uses the original filename, destination, driver and chat reservation.
The confirmed Content/result is checkpointed terminal before original bytes are
deleted and reservation capacity released. No separate client upload retry is
needed while waiting on GC. Stop on the browser stops polling; accepted work can
finish, as before. The existing operation cancel endpoint prevents an unstarted
staged job from executing. It does not roll back an import already in progress.

A restart resumes only never-started staged bytes using the same operation ID.
An interrupted or failed import may already have written IPFS/Content, so it
reports `upload_outcome_unknown`, keeps the original and quota metadata, and is
never automatically replayed. Check Media and the original operation before any
manual recovery. Unknown originals are deliberately excluded from generic
30-day receipt deletion; they consume the finite staging budget until explicitly
reconciled by an operator. No automatic deletion of unknown originals is added.
An interrupted receive was never accepted and is removed during startup recovery.

## Limits and deployment

The existing Docker `GEESOME_DATA:/geesome-node/data` mount persists staging. For
non-Docker installations, keep DATA_DIR on persistent local storage alongside the
SQL database backups. Do not use a temporary DATA_DIR, run multiple node replicas
against different staging disks, or roll back to an older worker while accepted
staged uploads remain. Drain staged jobs first; keep unknown originals and SQL
receipts together. This change adds no schema migration or library dependency.

Defaults (positive integer bytes unless noted):

| Setting | Default | Purpose |
| --- | --- | --- |
| `GEESOME_MAX_UPLOAD_BYTES` | 2000 MiB | Maximum single multipart file |
| `GEESOME_UPLOAD_STAGING_BYTES` | 8192 MiB | Global reserved staging capacity |
| `GEESOME_UPLOAD_STAGING_USER_BYTES` | 4096 MiB | Per-owner reserved capacity |
| `GEESOME_UPLOAD_STAGING_MIN_FREE_BYTES` | 256 MiB | Local disk headroom |
| `GEESOME_UPLOAD_STAGING_MAX_JOBS` | 1000 | Outstanding receiving/staged/retained jobs |
| `GEESOME_UPLOAD_RECEIVE_TIMEOUT_MS` | 1800000 | Receive deadline in milliseconds |

Owner save quota can lower these budgets. Concurrent receivers reserve a maximum
file allowance in a short SQL transaction, bounded by Content-Length when
known. Unknown-length bodies start with at most 16 MiB and extend their
reservation under backpressure before writing additional bytes. Accepted files
retain their actual size reservation. Disk headroom is checked before receiving. A full budget returns
413 `upload_staging_full`; it is not an accepted receipt or a safe-replay marker.
Keep originals with unknown outcomes rather than bypassing capacity checks.

Optional emergency GC policy: `STORAGE_CLEANUP_DATA_PATH` must name the filesystem
actually backing Kubo, visible inside the application container.
`STORAGE_CLEANUP_MIN_FREE_BYTES` defaults to 5 GiB (maximum 1 TiB). Only a known
free-space result below that threshold permits quiet-period override after the
initial accumulation minute. Missing paths or statfs errors do not force GC.
This path is opt-in because the app overlay and Kubo volume may differ.

No production deployment is part of implementation. Promote the tested backend
through the repository release/image workflow; the current MicrowaveGirls upload
client already consumes the ordinary receipt and needs no contract change.
