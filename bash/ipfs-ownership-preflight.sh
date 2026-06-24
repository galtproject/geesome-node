#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

IPFS_UID="${GEESOME_IPFS_UID:-1000}"
IPFS_GID="${GEESOME_IPFS_GID:-100}"
EXPECTED_OWNER="${IPFS_UID}:${IPFS_GID}"
REPAIR_MODE="${GEESOME_IPFS_OWNERSHIP_REPAIR:-auto}"

load_systemd_storage_env() {
  command -v systemctl >/dev/null 2>&1 || return 0

  local environment
  environment="$(systemctl show geesome-docker --property=Environment --value 2>/dev/null || true)"

  local assignment key value noglob_was_set
  noglob_was_set=0

  case "$-" in
    *f*)
      noglob_was_set=1
      ;;
  esac

  set -f

  for assignment in $environment; do
    key="${assignment%%=*}"
    value="${assignment#*=}"

    case "$key" in
      STORAGE_DATA)
        if [ -z "${STORAGE_DATA-}" ]; then
          export STORAGE_DATA="$value"
        fi
        ;;
      STORAGE_STAGING)
        if [ -z "${STORAGE_STAGING-}" ]; then
          export STORAGE_STAGING="$value"
        fi
        ;;
    esac
  done

  if [ "$noglob_was_set" -eq 0 ]; then
    set +f
  fi
}

load_dotenv_storage_env() {
  [ -f .env ] || return 0

  local line key value
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|\#*)
        continue
        ;;
      STORAGE_DATA=*|STORAGE_STAGING=*)
        key="${line%%=*}"
        value="${line#*=}"
        value="${value%\"}"
        value="${value#\"}"
        value="${value%\'}"
        value="${value#\'}"

        case "$key" in
          STORAGE_DATA)
            if [ -z "${STORAGE_DATA-}" ]; then
              export STORAGE_DATA="$value"
            fi
            ;;
          STORAGE_STAGING)
            if [ -z "${STORAGE_STAGING-}" ]; then
              export STORAGE_STAGING="$value"
            fi
            ;;
        esac
        ;;
    esac
  done < .env
}

owner() {
  stat -c '%u:%g' "$1"
}

owner_mismatch() {
  local path="$1"

  if [ ! -e "$path" ]; then
    return 1
  fi

  [ "$(owner "$path")" != "$EXPECTED_OWNER" ]
}

ensure_directory() {
  local path="$1"

  mkdir -p "$path"

  if [ "$(id -u)" -eq 0 ]; then
    chown "$EXPECTED_OWNER" "$path"
  fi
}

add_repair_reason() {
  REPAIR_REASONS+=("$1")
}

load_systemd_storage_env
load_dotenv_storage_env

STORAGE_DATA="${STORAGE_DATA:-$ROOT_DIR/.docker-data/ipfs}"
STORAGE_STAGING="${STORAGE_STAGING:-$ROOT_DIR/.docker-data/ipfs-staging}"

case "$REPAIR_MODE" in
  auto|always|skip)
    ;;
  *)
    echo "ERROR: GEESOME_IPFS_OWNERSHIP_REPAIR must be one of: auto, always, skip"
    exit 1
    ;;
esac

if [ "$REPAIR_MODE" = "skip" ]; then
  echo "==> Skipping IPFS ownership preflight (GEESOME_IPFS_OWNERSHIP_REPAIR=skip)."
  exit 0
fi

ensure_directory "$STORAGE_DATA"
ensure_directory "$STORAGE_STAGING"

REPAIR_REASONS=()

if [ "$REPAIR_MODE" = "always" ]; then
  add_repair_reason "forced by GEESOME_IPFS_OWNERSHIP_REPAIR=always"
else
  if owner_mismatch "$STORAGE_DATA/config"; then
    add_repair_reason "$STORAGE_DATA/config is owned by $(owner "$STORAGE_DATA/config"), expected $EXPECTED_OWNER"
  fi

  if owner_mismatch "$STORAGE_DATA/repo.lock"; then
    add_repair_reason "$STORAGE_DATA/repo.lock is owned by $(owner "$STORAGE_DATA/repo.lock"), expected $EXPECTED_OWNER"
  fi

  if owner_mismatch "$STORAGE_DATA/datastore"; then
    add_repair_reason "$STORAGE_DATA/datastore is owned by $(owner "$STORAGE_DATA/datastore"), expected $EXPECTED_OWNER"
  fi

  if owner_mismatch "$STORAGE_DATA/blocks"; then
    add_repair_reason "$STORAGE_DATA/blocks is owned by $(owner "$STORAGE_DATA/blocks"), expected $EXPECTED_OWNER"
  fi
fi

if [ "${#REPAIR_REASONS[@]}" -gt 0 ]; then
  if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: IPFS repo ownership repair needs root privileges."
    printf ' - %s\n' "${REPAIR_REASONS[@]}"
    exit 1
  fi

  echo "==> Repairing IPFS repo ownership for Kubo user $EXPECTED_OWNER."
  printf ' - %s\n' "${REPAIR_REASONS[@]}"
  echo "==> Stopping IPFS before recursive ownership repair..."
  docker compose stop ipfs || true
  chown -R "$EXPECTED_OWNER" "$STORAGE_DATA" "$STORAGE_STAGING"
else
  echo "==> IPFS repo ownership preflight OK for $STORAGE_DATA."
fi

if [ -f "$STORAGE_DATA/config" ]; then
  if [ "$(id -u)" -eq 0 ]; then
    chown "$EXPECTED_OWNER" "$STORAGE_DATA/config"
    chmod 600 "$STORAGE_DATA/config"
  elif [ -w "$STORAGE_DATA/config" ]; then
    chmod 600 "$STORAGE_DATA/config"
  fi
fi
