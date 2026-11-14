#!/usr/bin/env bash
set -euo pipefail

# No host Node/PostgreSQL credentials or Docker socket inside the web container.
web="${GEESOME_DOCKER_WEB_CONTAINER:-geesome}"
ipfs="${GEESOME_DOCKER_IPFS_CONTAINER:-go_ipfs}"
drain="${GEESOME_IPFS_DRAIN_TIMEOUT_SECONDS:-120}"
ready="${GEESOME_IPFS_READY_TIMEOUT_SECONDS:-60}"
for budget in "$drain" "$ready"; do
  [[ "$budget" =~ ^[1-9][0-9]*$ && ${#budget} -le 4 && "$budget" -le 3600 ]] || {
    echo 'Invalid IPFS maintenance timeout.' >&2; exit 2;
  }
done
timeout_bin="$(command -v timeout || command -v gtimeout || true)"
[[ -n "$timeout_bin" ]] || { echo 'GNU timeout is required.' >&2; exit 2; }
bounded() { "$timeout_bin" -k 2 "$1" "${@:2}"; }
healthy() { bounded 5 docker exec "$ipfs" ipfs --api=/ip4/127.0.0.1/tcp/5001 diag healthy >/dev/null 2>&1; }

# Refuse maintenance on an already unhealthy/missing stack. Never fall back to
# an unfenced restart when the matching helper image or database is unavailable.
bounded 5 docker inspect "$web" >/dev/null
healthy || { echo 'IPFS is not ready; scheduled restart skipped.' >&2; exit 1; }
session_dir="$(mktemp -d)"
holder=''
cleanup() {
  local status=$?
  trap - EXIT INT TERM
  exec 4>&- 3>&-
  if [[ -n "$holder" ]]; then
    kill "$holder" 2>/dev/null || true
  fi
  rm -rf "$session_dir"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
mkfifo "$session_dir/input" "$session_dir/output"
exec 3<>"$session_dir/output"
exec 4<>"$session_dir/input"
docker exec -i -e "GEESOME_IPFS_DRAIN_TIMEOUT_MS=$((drain * 1000))" "$web" \
  node --import tsx check/storageMaintenanceSession.ts \
  3>&- 4>&- <"$session_dir/input" >"$session_dir/output" &
holder=$!
expect_reply() {
  local reply until_time=$((SECONDS + $2))
  while (( SECONDS < until_time )); do
    if IFS= read -r -t 1 reply <&3; then
      [[ "$reply" == "$1" ]] && return 0
      break
    fi
    kill -0 "$holder" 2>/dev/null || break
  done
  echo 'Storage maintenance fence unavailable; stopping scheduled restart.' >&2
  exit 1
}
check_fence() {
  kill -0 "$holder" 2>/dev/null || { echo 'Storage fence session ended.' >&2; exit 1; }
  printf 'CHECK\n' >&4
  expect_reply HELD 5
}
echo 'Waiting for active storage writers to finish...'
expect_reply READY "$((drain + 5))"
check_fence
healthy || { echo 'IPFS became unavailable before restart; skipping maintenance.' >&2; exit 1; }
check_fence
echo 'Restarting IPFS under the exclusive storage fence...'
bounded 45 docker restart "$ipfs" >/dev/null
deadline=$((SECONDS + ready))
while true; do
  check_fence
  if healthy; then
    break
  fi
  if (( SECONDS >= deadline )); then
    echo 'IPFS readiness timed out; maintenance failed. Inspect IPFS before retrying.' >&2
    exit 1
  fi
  sleep 1
done
check_fence
printf 'RELEASE\n' >&4
expect_reply RELEASED 5
wait "$holder"
holder=''
echo 'IPFS is ready; storage fence released.'
