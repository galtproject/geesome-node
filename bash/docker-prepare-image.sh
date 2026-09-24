#!/bin/bash
set -euo pipefail
source "$(dirname "$0")/docker-image-common.sh"
cd "$GEESOME_ROOT"
MODE="${GEESOME_IMAGE_MODE:-auto}"
case "$MODE" in auto|pull|build) ;; *) echo 'GEESOME_IMAGE_MODE must be auto, pull or build.' >&2; exit 1 ;; esac
REVISION="$(clean_revision)"
PLATFORM="$(server_platform)"
REMOTE="$(image_registry):sha-$REVISION"
SELECTED=""
if [ "$MODE" != build ]; then
  ERROR_LOG="$(mktemp)"
  trap 'rm -f "$ERROR_LOG"' EXIT
  if docker pull --platform "$PLATFORM" "$REMOTE" 2>"$ERROR_LOG"; then
    # Pull by tag once, then pin the downloaded digest. Inspect the pinned image
    # again so a concurrent tag change cannot bypass the revision check.
    SELECTED="$(docker image inspect --format '{{index .RepoDigests 0}}' "$REMOTE")"
    if ! [[ "$SELECTED" =~ @sha256:[a-f0-9]{64}$ ]]; then
      echo 'Pulled image has no immutable repository digest.' >&2
      exit 1
    fi
    validate_image "$SELECTED" "$REVISION" "$PLATFORM"
  else
    if grep -Eqi 'manifest unknown|not found|no matching manifest' "$ERROR_LOG"; then
      echo "No published image for $REVISION ($PLATFORM)." >&2
    else
      echo 'Registry pull failed (network/authentication or registry error):' >&2
    fi
    cat "$ERROR_LOG" >&2
    if [ "$MODE" = pull ]; then
      exit 1
    fi
    echo 'Falling back to a server build.' >&2
  fi
  rm -f "$ERROR_LOG"
  trap - EXIT
fi
if [ -z "$SELECTED" ]; then
  if command -v free >/dev/null 2>&1; then
    free -m | awk '/^Mem:/ {ram=$2} /^Swap:/ {if (ram+$2 < 8192) print "Warning: local image build has less than 8 GiB RAM + swap."}' >&2
  fi
  export GEESOME_BUILD_REVISION="$REVISION"
  bash bash/docker-build.sh
  # Compose resolves the original local build name, not a prior deployment override.
  LOCAL_IMAGE="${GEESOME_LOCAL_IMAGE:-geesome-node-web:local}"
  SELECTED="$(docker image inspect --format '{{.Id}}' "$LOCAL_IMAGE")"
  validate_image "$SELECTED" "$REVISION" "$PLATFORM"
fi
mkdir -p .docker-deploy
STAGED="$(mktemp .docker-deploy/image.XXXXXX)"
trap 'rm -f "$STAGED"' EXIT
printf '%s\n' "$SELECTED" > "$STAGED"
if [ -f .docker-deploy/image ]; then
  cp .docker-deploy/image .docker-deploy/previous-image
fi
mv "$STAGED" .docker-deploy/image
trap - EXIT
printf 'Selected image for %s: %s\n' "$REVISION" "$SELECTED"
