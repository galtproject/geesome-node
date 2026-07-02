#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SERVICE_NAME="${GEESOME_DOCKER_SERVICE:-geesome-docker}"
TIMESTAMP="$(date +%Y%m%d%H%M%S)"
YES=0
DELETE_SOURCE=1
RESTART_STACK=1
ALLOW_SAME_FILESYSTEM=0
TARGET_KIND=""
TARGET_BASE=""
BACKUP_PATHS=()
MOVED_KEYS=()
MOVE_NAMES=()
MOVE_KEYS=()
MOVE_SOURCES=()
MOVE_DESTS=()

usage() {
  cat <<'EOF'
Usage:
  bash/move-docker-storage.sh <ipfs|database|postgres|all> <target-base> [options]

Moves GeeSome Docker storage to a mounted disk and updates Docker Compose path
overrides so future restarts use the new location.

The target-base argument is a parent directory. The script creates the storage
subdirectories inside it.

Examples:
  sudo npm run storage:move -- ipfs /mnt/geesome --yes      # creates /mnt/geesome/ipfs and /mnt/geesome/ipfs-staging
  sudo npm run storage:move -- database /mnt/geesome --yes  # creates /mnt/geesome/postgres-data
  sudo npm run storage:move -- all /mnt/geesome --yes       # creates all of the above

Targets:
  ipfs       Moves STORAGE_DATA to <target-base>/ipfs and STORAGE_STAGING to
             <target-base>/ipfs-staging.
  database   Moves POSTGRES_DATA to <target-base>/postgres-data.
  all        Moves IPFS and Postgres storage.

Options:
  -y, --yes       Run without an interactive confirmation prompt.
  --keep-source   Keep the original directories as *.moved-<timestamp> backups.
                  By default, backups are deleted after a successful restart to
                  free space on the old disk.
  --allow-same-filesystem
                  Allow target storage on the same filesystem as the source.
                  Without this, the script catches missing/unmounted /mnt disks.
  --no-restart    Do not start GeeSome after copying and relinking storage.
  --service NAME  Systemd service to update/restart. Default: geesome-docker.
  -h, --help      Show this help.
EOF
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

warn() {
  echo "WARNING: $*" >&2
}

on_error() {
  local line="$1"

  echo "ERROR: storage move failed near line $line." >&2
  if [ "${#BACKUP_PATHS[@]}" -gt 0 ]; then
    echo "Original directories were kept at:" >&2
    printf ' - %s\n' "${BACKUP_PATHS[@]}" >&2
    echo "To roll back manually, stop GeeSome, remove the symlink at the old path, and move the backup directory back." >&2
  fi
}

trap 'on_error "$LINENO"' ERR

path_exists() {
  [ -e "$1" ] || [ -L "$1" ]
}

absolute_path() {
  local path="$1"

  case "$path" in
    /*)
      printf '%s\n' "$path"
      ;;
    *)
      printf '%s/%s\n' "$ROOT_DIR" "$path"
      ;;
  esac
}

resolve_path() {
  local path="$1"

  if command -v realpath >/dev/null 2>&1; then
    realpath -m "$path"
    return
  fi

  printf '%s\n' "$path"
}

strip_env_quotes() {
  local value="$1"

  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s\n' "$value"
}

set_env_if_empty() {
  local key="$1"
  local value="$2"

  case "$key" in
    STORAGE_DATA)
      if [ -z "${STORAGE_DATA-}" ]; then
        STORAGE_DATA="$value"
      fi
      ;;
    STORAGE_STAGING)
      if [ -z "${STORAGE_STAGING-}" ]; then
        STORAGE_STAGING="$value"
      fi
      ;;
    POSTGRES_DATA)
      if [ -z "${POSTGRES_DATA-}" ]; then
        POSTGRES_DATA="$value"
      fi
      ;;
  esac
}

load_systemd_storage_env() {
  command -v systemctl >/dev/null 2>&1 || return 0

  local environment
  environment="$(systemctl show "$SERVICE_NAME" --property=Environment --value 2>/dev/null || true)"
  [ -n "$environment" ] || return 0

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
    set_env_if_empty "$key" "$value"
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
      export\ *)
        line="${line#export }"
        ;;
    esac

    case "$line" in
      STORAGE_DATA=*|STORAGE_STAGING=*|POSTGRES_DATA=*)
        key="${line%%=*}"
        value="${line#*=}"
        value="$(strip_env_quotes "$value")"
        set_env_if_empty "$key" "$value"
        ;;
    esac
  done < .env
}

dotenv_line() {
  local key="$1"
  local value="$2"

  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '%s="%s"\n' "$key" "$value"
}

set_dotenv_value() {
  local key="$1"
  local value="$2"
  local line tmp

  line="$(dotenv_line "$key" "$value")"
  tmp="$(mktemp "$ROOT_DIR/.env.tmp.XXXXXX")"

  if [ -f .env ]; then
    awk -v key="$key" -v line="$line" '
      BEGIN { done = 0 }
      $0 ~ "^[[:space:]]*" key "=" {
        if (done == 0) {
          print line
          done = 1
        }
        next
      }
      { print }
      END {
        if (done == 0) {
          print line
        }
      }
    ' .env > "$tmp"
  else
    printf '%s\n' "$line" > "$tmp"
  fi

  mv "$tmp" .env
}

systemd_escape_value() {
  local value="$1"

  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//%/%%}"
  printf '%s\n' "$value"
}

write_systemd_environment_line() {
  local key="$1"
  local value="$2"

  value="$(systemd_escape_value "$value")"
  echo "Environment=\"$key=$value\""
}

systemd_service_exists() {
  command -v systemctl >/dev/null 2>&1 || return 1
  systemctl cat "$SERVICE_NAME" >/dev/null 2>&1
}

install_systemd_override() {
  systemd_service_exists || return 0

  if [ "$(id -u)" -ne 0 ]; then
    warn "Cannot write systemd override without root; .env was updated, but $SERVICE_NAME may still use old service Environment paths."
    return 0
  fi

  local override_dir override_file environment assignment key value noglob_was_set
  override_dir="/etc/systemd/system/${SERVICE_NAME}.service.d"
  override_file="$override_dir/storage-override.conf"
  environment="$(systemctl show "$SERVICE_NAME" --property=Environment --value 2>/dev/null || true)"
  noglob_was_set=0

  case "$-" in
    *f*)
      noglob_was_set=1
      ;;
  esac

  mkdir -p "$override_dir"
  {
    echo "[Service]"
    echo "Environment="

    set -f
    for assignment in $environment; do
      key="${assignment%%=*}"
      value="${assignment#*=}"

      case "$key" in
        STORAGE_DATA|STORAGE_STAGING|POSTGRES_DATA)
          continue
          ;;
      esac

      write_systemd_environment_line "$key" "$value"
    done

    if [ "$noglob_was_set" -eq 0 ]; then
      set +f
    fi

    write_systemd_environment_line "STORAGE_DATA" "$FINAL_STORAGE_DATA"
    write_systemd_environment_line "STORAGE_STAGING" "$FINAL_STORAGE_STAGING"
    write_systemd_environment_line "POSTGRES_DATA" "$FINAL_POSTGRES_DATA"
  } > "$override_file"

  if [ "$noglob_was_set" -eq 1 ]; then
    set -f
  fi

  systemctl daemon-reload
  echo "==> Updated systemd storage override: $override_file"
}

add_moved_key() {
  local key="$1"

  local existing
  for existing in "${MOVED_KEYS[@]}"; do
    if [ "$existing" = "$key" ]; then
      return
    fi
  done

  MOVED_KEYS+=("$key")
}

add_move() {
  local name="$1"
  local key="$2"
  local source="$3"
  local destination="$4"
  local source_abs destination_abs

  source_abs="$(resolve_path "$(absolute_path "$source")")"
  destination_abs="$(resolve_path "$destination")"

  if [ "$source_abs" = "$destination_abs" ]; then
    echo "==> $name already uses $destination_abs."
    return
  fi

  MOVE_NAMES+=("$name")
  MOVE_KEYS+=("$key")
  MOVE_SOURCES+=("$source_abs")
  MOVE_DESTS+=("$destination_abs")
  add_moved_key "$key"
}

dir_has_entries() {
  local dir="$1"

  [ -d "$dir" ] || return 1
  [ -n "$(find "$dir" -mindepth 1 -maxdepth 1 -print -quit)" ]
}

check_destination_space() {
  local source="$1"
  local destination="$2"
  local parent source_kb available_kb required_kb

  path_exists "$source" || return 0

  parent="$(dirname "$destination")"
  mkdir -p "$parent"
  source_kb="$(du -sk "$source" | awk '{print $1}')"
  available_kb="$(df -Pk "$parent" | awk 'NR == 2 {print $4}')"
  required_kb=$((source_kb + source_kb / 20 + 1024))

  if [ "$available_kb" -lt "$required_kb" ]; then
    die "Not enough free space under $parent for $source. Need about ${required_kb} KB, available ${available_kb} KB."
  fi
}

filesystem_device() {
  local path="$1"

  df -Pk "$path" | awk 'NR == 2 {print $1}'
}

check_target_filesystems() {
  local index source destination source_device destination_device destination_parent

  [ "$ALLOW_SAME_FILESYSTEM" -eq 0 ] || return 0

  for index in "${!MOVE_NAMES[@]}"; do
    source="${MOVE_SOURCES[$index]}"
    destination="${MOVE_DESTS[$index]}"

    path_exists "$source" || continue

    destination_parent="$(dirname "$destination")"
    mkdir -p "$destination_parent"
    source_device="$(filesystem_device "$source")"
    destination_device="$(filesystem_device "$destination_parent")"

    if [ "$source_device" = "$destination_device" ]; then
      die "${MOVE_NAMES[$index]} source and target are on the same filesystem ($source_device). Mount the target disk first or rerun with --allow-same-filesystem."
    fi
  done
}

ensure_destination_not_nested() {
  local source="$1"
  local destination="$2"
  local source_real destination_real

  source_real="$(resolve_path "$source")"
  destination_real="$(resolve_path "$destination")"

  if [ "$source_real" = "$destination_real" ]; then
    return 1
  fi

  case "$destination_real/" in
    "$source_real/"*)
      die "Destination $destination_real is inside source $source_real."
      ;;
  esac

  return 0
}

sync_storage_path() {
  local source="$1"
  local destination="$2"

  mkdir -p "$destination"

  if ! path_exists "$source"; then
    echo "==> Source $source does not exist; created empty target $destination."
    return
  fi

  if command -v rsync >/dev/null 2>&1; then
    rsync -aH --numeric-ids --delete "$source"/ "$destination"/
    local verify_output
    verify_output="$(rsync -aHn --numeric-ids --delete --itemize-changes "$source"/ "$destination"/)"
    if [ -n "$verify_output" ]; then
      echo "$verify_output"
      die "Copy verification found pending changes for $source -> $destination."
    fi
    return
  fi

  if dir_has_entries "$destination"; then
    die "rsync is required to safely update non-empty destination $destination."
  fi

  cp -a "$source"/. "$destination"/
}

backup_path_for() {
  local source="$1"
  local backup="$source.moved-$TIMESTAMP"
  local index=1

  while path_exists "$backup"; do
    backup="$source.moved-$TIMESTAMP-$index"
    index=$((index + 1))
  done

  printf '%s\n' "$backup"
}

replace_source_with_link() {
  local source="$1"
  local destination="$2"
  local backup parent link_target

  parent="$(dirname "$source")"
  mkdir -p "$parent"

  if path_exists "$source"; then
    if [ -L "$source" ]; then
      link_target="$(readlink "$source")"
      if [ "$link_target" = "$destination" ]; then
        echo "==> $source already links to $destination."
        return
      fi
    fi

    backup="$(backup_path_for "$source")"
    mv "$source" "$backup"
    BACKUP_PATHS+=("$backup")
    echo "==> Moved old source aside: $backup"
  fi

  ln -s "$destination" "$source"
  echo "==> Linked $source -> $destination"
}

stop_stack() {
  echo "==> Stopping GeeSome Docker stack..."

  if systemd_service_exists; then
    systemctl stop "$SERVICE_NAME"
    return
  fi

  if command -v docker >/dev/null 2>&1; then
    docker compose down
    return
  fi

  warn "docker is not available; assuming the stack is already stopped."
}

run_ipfs_preflight_if_needed() {
  local key should_run
  should_run=0

  for key in "${MOVED_KEYS[@]}"; do
    case "$key" in
      STORAGE_DATA|STORAGE_STAGING)
        should_run=1
        ;;
    esac
  done

  if [ "$should_run" -eq 0 ]; then
    return
  fi

  echo "==> Checking IPFS ownership at the new path..."
  STORAGE_DATA="$FINAL_STORAGE_DATA" \
    STORAGE_STAGING="$FINAL_STORAGE_STAGING" \
    GEESOME_IPFS_OWNERSHIP_REPAIR=always \
    bash "$ROOT_DIR/bash/ipfs-ownership-preflight.sh"
}

start_stack() {
  if [ "$RESTART_STACK" -eq 0 ]; then
    echo "==> Restart skipped (--no-restart)."
    return
  fi

  echo "==> Starting GeeSome Docker stack..."
  if systemd_service_exists; then
    systemctl start "$SERVICE_NAME"
  else
    docker compose up -d
  fi

  docker compose ps || true
}

remove_backups_if_requested() {
  local backup

  if [ "$DELETE_SOURCE" -eq 0 ]; then
    if [ "${#BACKUP_PATHS[@]}" -gt 0 ]; then
      echo "==> Original directories kept at:"
      printf ' - %s\n' "${BACKUP_PATHS[@]}"
    fi
    return
  fi

  for backup in "${BACKUP_PATHS[@]}"; do
    rm -rf "$backup"
    echo "==> Removed old source backup to free space: $backup"
  done
}

print_plan() {
  local index

  echo "GeeSome Docker storage move plan:"
  for index in "${!MOVE_NAMES[@]}"; do
    echo " - ${MOVE_NAMES[$index]} (${MOVE_KEYS[$index]}): ${MOVE_SOURCES[$index]} -> ${MOVE_DESTS[$index]}"
  done
  echo " - Update .env for moved storage variables."
  if systemd_service_exists; then
    echo " - Update ${SERVICE_NAME}.service systemd drop-in with final storage paths."
  fi
  echo " - Stop the Docker stack before copying."
  if [ "$RESTART_STACK" -eq 1 ]; then
    echo " - Restart the Docker stack after relinking storage."
  else
    echo " - Leave the Docker stack stopped."
  fi
  if [ "$DELETE_SOURCE" -eq 1 ]; then
    echo " - Delete old source directories after a successful restart/copy."
  else
    echo " - Keep old source directories as rollback backups."
  fi
}

confirm_plan() {
  print_plan

  if [ "$YES" -eq 1 ]; then
    return
  fi

  if [ ! -t 0 ]; then
    die "Refusing to continue without --yes because stdin is not interactive."
  fi

  local answer
  printf 'Continue? [y/N] '
  read -r answer

  case "$answer" in
    y|Y|yes|YES)
      ;;
    *)
      die "Aborted."
      ;;
  esac
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    -y|--yes)
      YES=1
      ;;
    --keep-source)
      DELETE_SOURCE=0
      ;;
    --allow-same-filesystem)
      ALLOW_SAME_FILESYSTEM=1
      ;;
    --no-restart)
      RESTART_STACK=0
      ;;
    --service)
      shift
      [ "$#" -gt 0 ] || die "--service requires a value."
      SERVICE_NAME="$1"
      ;;
    -*)
      die "Unknown option: $1"
      ;;
    *)
      if [ -z "$TARGET_KIND" ]; then
        TARGET_KIND="$1"
      elif [ -z "$TARGET_BASE" ]; then
        TARGET_BASE="$1"
      else
        die "Unexpected argument: $1"
      fi
      ;;
  esac
  shift
done

[ -n "$TARGET_KIND" ] || die "Missing storage target. Run with --help for usage."
[ -n "$TARGET_BASE" ] || die "Missing target base path. Run with --help for usage."

case "$TARGET_KIND" in
  ipfs|database|postgres|all)
    ;;
  *)
    die "Storage target must be one of: ipfs, database, postgres, all."
    ;;
esac

case "$TARGET_BASE" in
  /*)
    ;;
  *)
    die "Target base must be an absolute path, for example /mnt/geesome."
    ;;
esac

TARGET_BASE="${TARGET_BASE%/}"
[ -n "$TARGET_BASE" ] && [ "$TARGET_BASE" != "/" ] || die "Refusing to use / as the target base."
TARGET_BASE="$(resolve_path "$TARGET_BASE")"

load_systemd_storage_env
load_dotenv_storage_env

STORAGE_DATA="$(absolute_path "${STORAGE_DATA:-$ROOT_DIR/.docker-data/ipfs}")"
STORAGE_STAGING="$(absolute_path "${STORAGE_STAGING:-$ROOT_DIR/.docker-data/ipfs-staging}")"
POSTGRES_DATA="$(absolute_path "${POSTGRES_DATA:-$ROOT_DIR/.docker-data/postgres-data}")"

FINAL_STORAGE_DATA="$(resolve_path "$STORAGE_DATA")"
FINAL_STORAGE_STAGING="$(resolve_path "$STORAGE_STAGING")"
FINAL_POSTGRES_DATA="$(resolve_path "$POSTGRES_DATA")"

case "$TARGET_KIND" in
  ipfs|all)
    FINAL_STORAGE_DATA="$(resolve_path "$TARGET_BASE/ipfs")"
    FINAL_STORAGE_STAGING="$(resolve_path "$TARGET_BASE/ipfs-staging")"
    add_move "IPFS repo" "STORAGE_DATA" "$STORAGE_DATA" "$FINAL_STORAGE_DATA"
    add_move "IPFS staging" "STORAGE_STAGING" "$STORAGE_STAGING" "$FINAL_STORAGE_STAGING"
    ;;
esac

case "$TARGET_KIND" in
  database|postgres|all)
    FINAL_POSTGRES_DATA="$(resolve_path "$TARGET_BASE/postgres-data")"
    add_move "Postgres data" "POSTGRES_DATA" "$POSTGRES_DATA" "$FINAL_POSTGRES_DATA"
    ;;
esac

for index in "${!MOVE_NAMES[@]}"; do
  ensure_destination_not_nested "${MOVE_SOURCES[$index]}" "${MOVE_DESTS[$index]}"
done

if [ "${#MOVE_NAMES[@]}" -eq 0 ]; then
  echo "==> Requested storage already uses $TARGET_BASE; nothing to move."
  exit 0
fi

check_target_filesystems
confirm_plan
stop_stack

for index in "${!MOVE_NAMES[@]}"; do
  echo "==> Copying ${MOVE_NAMES[$index]}..."
  check_destination_space "${MOVE_SOURCES[$index]}" "${MOVE_DESTS[$index]}"
  sync_storage_path "${MOVE_SOURCES[$index]}" "${MOVE_DESTS[$index]}"
done

sync

for index in "${!MOVE_NAMES[@]}"; do
  replace_source_with_link "${MOVE_SOURCES[$index]}" "${MOVE_DESTS[$index]}"
done

for key in "${MOVED_KEYS[@]}"; do
  case "$key" in
    STORAGE_DATA)
      set_dotenv_value "$key" "$FINAL_STORAGE_DATA"
      ;;
    STORAGE_STAGING)
      set_dotenv_value "$key" "$FINAL_STORAGE_STAGING"
      ;;
    POSTGRES_DATA)
      set_dotenv_value "$key" "$FINAL_POSTGRES_DATA"
      ;;
  esac
done

echo "==> Updated Docker Compose .env storage paths."
install_systemd_override
run_ipfs_preflight_if_needed
start_stack
remove_backups_if_requested

echo "==> Storage move complete."
