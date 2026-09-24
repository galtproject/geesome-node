#!/bin/bash
set -euo pipefail
source "$(dirname "$0")/docker-image-common.sh"
cd "$GEESOME_ROOT"
REVISION="$(clean_revision)"
REPOSITORY="$(image_registry)"
PLATFORM="${GEESOME_PUBLISH_PLATFORM:-linux/amd64}"
case "$PLATFORM" in linux/amd64|linux/arm64) ;; *) echo 'Publish one supported Linux platform per invocation.' >&2; exit 1 ;; esac
REMOTE="$REPOSITORY:sha-$REVISION"
ERROR_LOG="$(mktemp)"
BUILD_CONTEXT=""
trap 'rm -f "$ERROR_LOG"; if [ -n "$BUILD_CONTEXT" ]; then rm -rf "$BUILD_CONTEXT"; fi' EXIT
# Validate the release alias before any registry mutation.
if [ -n "${GEESOME_RELEASE_TAG:-}" ]; then
  if ! [[ "$GEESOME_RELEASE_TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || \
    [ "$(git rev-parse "$GEESOME_RELEASE_TAG^{commit}")" != "$REVISION" ]; then
    echo 'Release alias must be a version Git tag at HEAD.' >&2
    exit 1
  fi
fi
LOCAL="geesome-node-publish:sha-$REVISION"
PUSH_NEEDED=0
if docker buildx imagetools inspect "$REMOTE" > /dev/null 2>"$ERROR_LOG"; then
  echo "Verifying existing SHA image: $REMOTE"
  docker pull --platform "$PLATFORM" "$REMOTE"
  validate_image "$REMOTE" "$REVISION" "$PLATFORM"
  docker tag "$REMOTE" "$LOCAL"
else
  if ! grep -Eqi 'manifest unknown|not found' "$ERROR_LOG"; then
    echo 'Cannot verify that the registry tag is absent. Check registry login/access.' >&2
    cat "$ERROR_LOG" >&2
    exit 1
  fi
  BUILD_CONTEXT="$(archive_sources)"
  docker buildx build --platform "$PLATFORM" --load \
    --build-arg GEESOME_BUILD_REVISION="$REVISION" -t "$LOCAL" "$BUILD_CONTEXT"
  validate_image "$LOCAL" "$REVISION" "$PLATFORM"
  PUSH_NEEDED=1
fi
bash bash/docker-image-smoke.sh "$LOCAL" "$PLATFORM"
# An existing SHA image is reused, never rebuilt/replaced.
if [ "$PUSH_NEEDED" = 1 ]; then
  # Recheck after the potentially long build/smoke; another publisher may have won.
  if docker buildx imagetools inspect "$REMOTE" > /dev/null 2>"$ERROR_LOG"; then
    echo 'SHA tag appeared during build; refusing to overwrite it. Retry to verify/reuse it.' >&2
    exit 1
  fi
  if ! grep -Eqi 'manifest unknown|not found' "$ERROR_LOG"; then
    cat "$ERROR_LOG" >&2
    exit 1
  fi
  docker tag "$LOCAL" "$REMOTE"
  docker push "$REMOTE"
fi
if [ -n "${GEESOME_RELEASE_TAG:-}" ]; then
  ALIAS="$REPOSITORY:$GEESOME_RELEASE_TAG"
  if docker buildx imagetools inspect "$ALIAS" > /dev/null 2>"$ERROR_LOG"; then
    docker pull --platform "$PLATFORM" "$ALIAS"
    validate_image "$ALIAS" "$REVISION" "$PLATFORM"
    if [ "$(docker image inspect --format '{{.Id}}' "$ALIAS")" != "$(docker image inspect --format '{{.Id}}' "$LOCAL")" ]; then
      echo 'Refusing to replace release alias with a different image.' >&2
      exit 1
    fi
  elif ! grep -Eqi 'manifest unknown|not found' "$ERROR_LOG"; then
    cat "$ERROR_LOG" >&2
    exit 1
  fi
  docker tag "$LOCAL" "$ALIAS"
  docker push "$ALIAS"
fi
docker image inspect --format '{{json .RepoDigests}}' "$REMOTE"
