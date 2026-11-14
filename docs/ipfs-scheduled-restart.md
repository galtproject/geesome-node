# Scheduled IPFS restarts (#1634)

The daily systemd unit now runs `bash/ipfs-safe-restart.sh` instead of an
unconditional `docker restart`. The wrapper starts a private stdin/stdout helper
in the existing web container. That helper connects with the container's database
configuration and takes the same exclusive PostgreSQL advisory fence used by
storage cleanup. No public endpoint, host Node installation, host database
credentials or Docker socket mounted into the web container is required.

The exclusive acquisition waits for current shared storage writers to finish and
prevents new shared acquisitions. Durable multipart acceptance can still stage
files; its worker waits for the storage fence. The host verifies live ownership,
restarts Kubo once, checks ownership while waiting for `ipfs diag healthy`, and
releases the fence only after the successful readiness path. The helper releases
its session on host disconnect, cancellation, invalid commands or idle timeout.

## Rollout

Ship the matching web image and host scripts together. The normal installer and
`npm run docker-upgrade` install the updated restart service with the deployment
checkout path, and the upgrade reloads systemd. Existing timer schedules remain
unchanged. Installing only the host unit against an old image refuses maintenance
because the fence helper is absent; it does not fall back to a direct restart.
No database migration or consuming-application change is needed.

For a manually prepared deployment, install the service from that checkout using
the same path substitution as `bash/ubuntu-install-docker.sh`, then run
`systemctl daemon-reload`. Inspect `journalctl -u geesome-ipfs-restart.service`
after the next maintenance window. Do not run a live restart merely to validate
the installation.

The wrapper defaults to containers `geesome` / `go_ipfs`, a 120-second drain
budget, 45 seconds for Docker restart and a 60-second readiness budget. Override
container names with `GEESOME_DOCKER_WEB_CONTAINER` /
`GEESOME_DOCKER_IPFS_CONTAINER`; drain/readiness budgets use
`GEESOME_IPFS_DRAIN_TIMEOUT_SECONDS` / `GEESOME_IPFS_READY_TIMEOUT_SECONDS`.
The unit has a 300-second start timeout; adjust it as well if increasing budgets.
GNU `timeout` is required (standard Ubuntu coreutils; `gtimeout` is also accepted).

## Failure boundaries

Missing/unhealthy containers, missing helpers, unavailable PostgreSQL, failed
drain or lost ownership before restart all stop the scheduled action without
restarting Kubo. Docker restart/readiness failures return a failed service and
never report success or launch a second restart. Failure cleanup releases the
session: this does not promise continued blocking when Kubo fails to return or
the fence process/database dies after restart has begun. Such abrupt failures
still need durable upload reconciliation; this change prevents the ordinary
scheduled interruption, not every unknown upload outcome.

The existing client polling limit is unchanged. An unusually long maintenance
wait can still exhaust it; clients must retain and reuse their accepted operation
ID. Do not erase upload receipts or replay unknown imports as a workaround.

## Verification

`npm run test:ipfs-safe-restart` runs host-wrapper failure scenarios, isolated
PostgreSQL fence/session and existing admission lifecycle tests, then restarts a
real disposable Kubo node while a shared writer is held. It verifies no early
restart, changed start time only after drain, and retained pinned bytes. The
Kubo test executes the exact container helper on the test host with disposable
database settings; all Kubo commands use the real isolated Docker container.
It does not touch existing node containers or production data.
