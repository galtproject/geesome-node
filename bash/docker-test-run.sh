#!/usr/bin/env bash
set -euo pipefail

DATABASE_HOST="${DATABASE_HOST:-geesome_db}"
DATABASE_PORT="${DATABASE_PORT:-5432}"
DATABASE_USER="${DATABASE_USER:-geesome}"
STORAGE_URL="${STORAGE_URL:-http://go_ipfs:5001}"

echo "Waiting for PostgreSQL at ${DATABASE_HOST}:${DATABASE_PORT}..."
until pg_isready -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" >/dev/null 2>&1; do
	sleep 1
done

echo "Waiting for IPFS API at ${STORAGE_URL}..."
until curl -fsS -X POST "${STORAGE_URL}/api/v0/version" >/dev/null 2>&1; do
	sleep 1
done

bash bash/prepare-test-resources.sh

exec yarn test
