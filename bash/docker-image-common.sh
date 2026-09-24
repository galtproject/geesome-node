#!/bin/bash
# Shared helpers; callers enable strict shell mode.
GEESOME_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image_registry() {
  printf '%s\n' "${GEESOME_IMAGE_REPOSITORY:-ghcr.io/galtproject/geesome-node}"
}
clean_revision() {
  local status submodules
  status="$(git -C "$GEESOME_ROOT" status --porcelain --untracked-files=normal)"
  submodules="$(git -C "$GEESOME_ROOT" submodule status --recursive)"
  if [ -n "$status" ] || printf '%s\n' "$submodules" | grep -Eq '^[-+U]'; then
    echo 'Image preparation requires clean committed sources and matching submodules.' >&2
    printf '%s\n' "$status" >&2
    return 1
  fi
  git -C "$GEESOME_ROOT" rev-parse HEAD
}
server_platform() {
  local arch
  arch="$(docker info --format '{{.Architecture}}')"
  case "$arch" in
    amd64|x86_64) printf 'linux/amd64\n' ;;
    arm64|aarch64) printf 'linux/arm64\n' ;;
    *) echo "Unsupported Docker architecture: $arch" >&2; return 1 ;;
  esac
}
validate_image() {
  local image="$1" revision="$2" platform="$3" actual
  actual="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}|{{.Os}}/{{.Architecture}}' "$image")"
  if [ "$actual" != "$revision|$platform" ]; then
    echo "Image identity mismatch: expected $revision|$platform, got $actual" >&2
    return 1
  fi
}
archive_sources() {
  local context
  context="$(mktemp -d)"
  git -C "$GEESOME_ROOT" archive HEAD | tar -x -C "$context"
  # Include committed submodule contents; never include ignored local secrets,
  # caches or other files accidentally admitted by a broad Docker COPY.
  GEESOME_ARCHIVE_ROOT="$context" git -C "$GEESOME_ROOT" submodule foreach --quiet --recursive \
    'mkdir -p "$GEESOME_ARCHIVE_ROOT/$displaypath"; git archive HEAD | tar -x -C "$GEESOME_ARCHIVE_ROOT/$displaypath"'
  printf '%s\n' "$context"
}
