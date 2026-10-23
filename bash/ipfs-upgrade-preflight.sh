#!/bin/bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo="${GEESOME_IPFS_REPO:-}"
if [ -z "$repo" ]; then
  repo=$(docker inspect go_ipfs --format '{{range .Mounts}}{{if eq .Destination "/data/ipfs"}}{{.Source}}{{end}}{{end}}' 2>/dev/null || true)
fi
if [ -z "$repo" ]; then
  # Resolve the same bind mount Compose will use, including .env interpolation.
  repo=$(bash "$ROOT_DIR/bash/docker-compose.sh" config --format json | docker run --rm -i python:3.12-alpine python -c 'import json,sys; c=json.load(sys.stdin); print(next(v["source"] for v in c["services"]["ipfs"]["volumes"] if v["target"]=="/data/ipfs"))')
fi
if [ ! -f "$repo/version" ]; then
  exit 0 # Fresh installation.
fi
version=$(tr -d '\r\n' < "$repo/version")
if ! [[ "$version" =~ ^[0-9]+$ ]]; then
  echo "Invalid IPFS repository version in $repo" >&2
  exit 1
fi
if [ "$version" -gt 18 ]; then
  echo "Refusing to open a newer IPFS repository with Kubo 0.42" >&2
  exit 1
fi
if [ "$version" -eq 18 ]; then
  exit 0
fi
if [ "${GEESOME_IPFS_UPGRADE_AFTER_REHEARSAL:-0}" = 1 ]; then
  echo "Proceeding with explicitly authorized IPFS migration after isolated rehearsal (repo v$version -> v18)."
  exit 0
fi
backup="${GEESOME_IPFS_UPGRADE_BACKUP:-}"
if [ -z "$backup" ] || [ ! -f "$backup/version" ] || [ ! -f "$backup/config" ] || [ ! -d "$backup/datastore" ] || [ ! -d "$backup/blocks" ]; then
  echo "Kubo upgrade requires a stopped, consistent repository snapshot. Set GEESOME_IPFS_UPGRADE_BACKUP to its directory, or GEESOME_IPFS_UPGRADE_AFTER_REHEARSAL=1 after an explicitly authorized successful rehearsal; see docs/ipfs-recovery-plan.md." >&2
  exit 1
fi
repo=$(cd "$repo" && pwd -P)
backup=$(cd "$backup" && pwd -P)
case "$backup/" in
  "$repo/"*) echo "IPFS backup must be outside the live repository" >&2; exit 1 ;;
esac
if [ "$(tr -d '\r\n' < "$backup/version")" != "$version" ]; then
  echo "IPFS snapshot version does not match the repository being upgraded" >&2
  exit 1
fi
echo "IPFS migration backup located: $backup (repo v$version -> v18). The operator must verify snapshot completeness."
