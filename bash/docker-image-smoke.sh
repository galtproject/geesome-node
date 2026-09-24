#!/bin/bash
# Run the real prepared-image entrypoint with isolated disposable services/data.
set -euo pipefail
IMAGE="${1:?Usage: docker-image-smoke.sh IMAGE}"
PLATFORM="${2:-linux/amd64}"
WORK="$(mktemp -d)"
PROJECT="geesome-image-smoke-$$"
cleanup() {
  docker compose -p "$PROJECT" -f "$WORK/compose.yml" down --volumes >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT
cat > "$WORK/compose.yml" <<YAML
services:
  web:
    image: "$IMAGE"
    platform: "$PLATFORM"
    command: ["npm", "run", "in-docker-start"]
    ports: ["127.0.0.1::2052"]
    environment:
      DATABASE_USER: geesome
      DATABASE_PASSWORD: geesome
      DATABASE_NAME: geesome_node
      DATABASE_HOST: geesome_db
      DATABASE_PORT: "5432"
      STORAGE_MODULE: ipfs-http-client
      STORAGE_URL: http://go_ipfs:5001
    depends_on:
      geesome_db:
        condition: service_healthy
      go_ipfs:
        condition: service_healthy
  geesome_db:
    image: postgres:14-alpine
    environment:
      POSTGRES_USER: geesome
      POSTGRES_PASSWORD: geesome
      POSTGRES_DB: geesome_node
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U geesome"]
      interval: 2s
      timeout: 3s
      retries: 30
  go_ipfs:
    image: ipfs/kubo:v0.21.0
    healthcheck:
      test: ["CMD", "ipfs", "id"]
      interval: 2s
      timeout: 5s
      retries: 30
YAML
compose=(docker compose -p "$PROJECT" -f "$WORK/compose.yml")
"${compose[@]}" up -d
ADDRESS="$("${compose[@]}" port web 2052)"
for ((attempt=1; attempt<=180; attempt++)); do
  if curl --fail --silent --max-time 3 "http://$ADDRESS/v1/health" >/dev/null; then
    echo "Prepared image smoke passed: $IMAGE ($PLATFORM)"
    exit 0
  fi
  sleep 2
done
"${compose[@]}" logs --tail=150 web >&2
exit 1
