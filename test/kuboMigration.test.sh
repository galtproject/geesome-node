#!/usr/bin/env bash
set -euo pipefail
# Only disposable volumes: never accepts a production path or migrates in place.
name="geesome-kubo-rehearsal-$$"
legacy="$name-old"
modern="$name-new"
old_volume="$name-old-data"
new_volume="$name-new-data"
cleanup() {
  result=$?
  if [ "$result" -ne 0 ]; then
    docker logs "$legacy" 2>&1 | tail -30 || true
    docker logs "$modern" 2>&1 | tail -40 || true
  fi
  docker rm -f "$legacy" "$modern" >/dev/null 2>&1 || true
  docker volume rm "$old_volume" "$new_volume" >/dev/null 2>&1 || true
  exit "$result"
}
trap cleanup EXIT
wait_ready() {
  for attempt in $(seq 1 150); do
    if docker exec --user ipfs "$1" ipfs id >/dev/null 2>&1; then
      return
    fi
    sleep 2
  done
  echo "Kubo did not become ready: $1" >&2
  return 1
}
docker volume create "$old_volume" >/dev/null
docker volume create "$new_volume" >/dev/null
docker run -d -e IPFS_TELEMETRY=off --name "$legacy" -v "$old_volume:/data/ipfs" ipfs/kubo:v0.21.0 daemon --offline >/dev/null
wait_ready "$legacy"
cid=$(printf 'migration preserves pinned bytes\n' | docker exec --user ipfs -i "$legacy" ipfs add -Q)
docker exec --user ipfs "$legacy" ipfs files cp "/ipfs/$cid" /migration-fixture.txt
old_version=$(docker exec --user ipfs "$legacy" ipfs repo version)
docker stop --time 30 "$legacy" >/dev/null
docker run --rm -v "$old_volume:/source:ro" -v "$new_volume:/target" alpine:3.20 sh -ec 'cp -a /source/. /target/'
echo "Migrating isolated copy of $old_version to Kubo 0.42.0"
docker run -d -e IPFS_TELEMETRY=off --name "$modern" -v "$new_volume:/data/ipfs" ipfs/kubo:v0.42.0 daemon --offline --migrate=true >/dev/null
wait_ready "$modern"
test "$(docker exec --user ipfs "$modern" ipfs cat "$cid")" = 'migration preserves pinned bytes'
docker exec --user ipfs "$modern" ipfs pin ls --type=recursive "$cid" >/dev/null
test "$(docker exec --user ipfs "$modern" ipfs files stat --hash /migration-fixture.txt)" = "$cid"
docker exec --user ipfs "$modern" ipfs repo gc >/dev/null
test "$(docker exec --user ipfs "$modern" ipfs cat "$cid")" = 'migration preserves pinned bytes'
# Seed enough pins for mark/index traversal, then cancel real RPC operations.
docker exec --user ipfs "$modern" sh -ec 'for n in $(seq 1 50); do printf "cancel-fixture-%s" "$n" | ipfs add -Q >/dev/null; done'
# A cancelled pin-index listing or GC must not block subsequent pin writers.
for attempt in $(seq 1 10); do
  docker exec --user ipfs "$modern" ipfs pin ls --timeout=1ns >/dev/null 2>&1 || true
  docker exec --user ipfs "$modern" ipfs repo gc --timeout=1ms >/dev/null 2>&1 || true
done
printf 'post-cancellation upload\n' | docker exec --user ipfs -i "$modern" ipfs add --timeout=10s -Q >/dev/null
new_version=$(docker exec --user ipfs "$modern" ipfs repo version)
docker start "$legacy" >/dev/null
wait_ready "$legacy"
test "$(docker exec --user ipfs "$legacy" ipfs repo version)" = "$old_version"
test "$(docker exec --user ipfs "$legacy" ipfs cat "$cid")" = 'migration preserves pinned bytes'
test "$(docker exec --user ipfs "$legacy" ipfs files stat --hash /migration-fixture.txt)" = "$cid"
echo "PASS: $old_version -> $new_version, pins/MFS/CID/bytes, GC, cancellation and untouched legacy rollback"
