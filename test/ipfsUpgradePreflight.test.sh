#!/bin/bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/repo" "$work/backup" "$work/repo/nested"
export GEESOME_IPFS_REPO="$work/repo"
bash "$root/bash/ipfs-upgrade-preflight.sh"
printf '14\n' > "$work/repo/version"
if bash "$root/bash/ipfs-upgrade-preflight.sh" >/dev/null 2>&1; then
  echo 'Missing snapshot was accepted' >&2; exit 1
fi
GEESOME_IPFS_UPGRADE_AFTER_REHEARSAL=1 bash "$root/bash/ipfs-upgrade-preflight.sh"
export GEESOME_IPFS_UPGRADE_BACKUP="$work/backup"
mkdir -p "$work/backup/datastore" "$work/backup/blocks"
printf '14\n' > "$work/backup/version"
printf '{}\n' > "$work/backup/config"
bash "$root/bash/ipfs-upgrade-preflight.sh"
printf '18\n' > "$work/backup/version"
if bash "$root/bash/ipfs-upgrade-preflight.sh" >/dev/null 2>&1; then
  echo 'Mismatched snapshot was accepted' >&2; exit 1
fi
printf '18\n' > "$work/repo/version"
unset GEESOME_IPFS_UPGRADE_BACKUP
bash "$root/bash/ipfs-upgrade-preflight.sh"
printf '19\n' > "$work/repo/version"
if bash "$root/bash/ipfs-upgrade-preflight.sh" >/dev/null 2>&1; then
  echo 'Newer repository was accepted for downgrade' >&2; exit 1
fi
echo 'IPFS upgrade snapshot preflight passed'
