#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

MOCK_BIN="$TMP_DIR/bin"
DOCKER_LOG="$TMP_DIR/docker.log"
SYSTEMCTL_LOG="$TMP_DIR/systemctl.log"
CURL_LOG="$TMP_DIR/curl.log"
JOURNAL_TARGET="$TMP_DIR/etc/systemd/journald.conf.d/geesome-retention.conf"
mkdir -p "$MOCK_BIN"

cat > "$MOCK_BIN/docker" <<'SH'
#!/bin/sh
printf '%s\n' "$*" >> "$DOCKER_LOG"
if [ "${1:-}" = "inspect" ]; then
  printf '%s\n' true
fi
SH
cat > "$MOCK_BIN/systemctl" <<'SH'
#!/bin/sh
printf '%s\n' "$*" >> "$SYSTEMCTL_LOG"
SH
cat > "$MOCK_BIN/id" <<'SH'
#!/bin/sh
if [ "${1:-}" = "-u" ]; then
  printf '%s\n' 0
  exit 0
fi
exec /usr/bin/id "$@"
SH
cat > "$MOCK_BIN/curl" <<'SH'
#!/bin/sh
printf '%s\n' "$*" >> "$CURL_LOG"
SH
chmod +x "$MOCK_BIN/docker" "$MOCK_BIN/systemctl" "$MOCK_BIN/id" "$MOCK_BIN/curl"

export DOCKER_LOG SYSTEMCTL_LOG CURL_LOG
PATH="$MOCK_BIN:$PATH" \
GEESOME_DOCKER_READY_ATTEMPTS=1 \
GEESOME_DOCKER_READY_INTERVAL_SECONDS=0 \
  bash "$ROOT_DIR/bash/docker-deploy-readiness.sh"
grep -Fq "inspect --format {{.State.Running}} geesome" "$DOCKER_LOG"
grep -Fq 'http://127.0.0.1:2052/' "$CURL_LOG"

: > "$DOCKER_LOG"
PATH="$MOCK_BIN:$PATH" \
GEESOME_DOCKER_IMAGE_RETENTION=48h \
GEESOME_DOCKER_BUILD_CACHE_RETENTION=72h \
GEESOME_DOCKER_BUILD_CACHE_KEEP=3GB \
  bash "$ROOT_DIR/bash/docker-post-deploy-retention.sh"

grep -Fxq 'image prune -f --filter until=48h' "$DOCKER_LOG"
grep -Fxq 'builder prune -f --filter until=72h --keep-storage 3GB' "$DOCKER_LOG"
! grep -Eq 'volume|system prune|image prune -a' "$DOCKER_LOG"

PATH="$MOCK_BIN:$PATH" \
GEESOME_JOURNALD_CONFIG_PATH="$JOURNAL_TARGET" \
  bash "$ROOT_DIR/bash/install-host-retention.sh"

cmp -s "$ROOT_DIR/config/systemd/journald-geesome.conf" "$JOURNAL_TARGET"
grep -Fxq 'restart systemd-journald' "$SYSTEMCTL_LOG"

: > "$SYSTEMCTL_LOG"
PATH="$MOCK_BIN:$PATH" \
GEESOME_JOURNALD_CONFIG_PATH="$JOURNAL_TARGET" \
  bash "$ROOT_DIR/bash/install-host-retention.sh"
test ! -s "$SYSTEMCTL_LOG"

grep -Fq 'SystemMaxUse=300M' "$JOURNAL_TARGET"
grep -Fq 'SystemKeepFree=2G' "$JOURNAL_TARGET"
