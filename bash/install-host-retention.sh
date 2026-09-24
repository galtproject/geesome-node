#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_FILE="$ROOT_DIR/config/systemd/journald-geesome.conf"
TARGET_FILE="${GEESOME_JOURNALD_CONFIG_PATH:-/etc/systemd/journald.conf.d/geesome-retention.conf}"

if [ "${GEESOME_CONFIGURE_JOURNAL_RETENTION:-1}" = "0" ]; then
  echo "Host journal retention configuration disabled."
  exit 0
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "Journal retention installation requires root; skipping $TARGET_FILE."
  exit 0
fi

if [ -f "$TARGET_FILE" ] && cmp -s "$SOURCE_FILE" "$TARGET_FILE"; then
  echo "Host journal retention is already configured."
  exit 0
fi

mkdir -p "$(dirname "$TARGET_FILE")"
install -m 0644 "$SOURCE_FILE" "$TARGET_FILE"
systemctl restart systemd-journald
echo "Installed bounded host journal retention at $TARGET_FILE."
