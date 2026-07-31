# Agent-Friendly Asset API

An integration needs only the site origin and a scoped bearer token. Start at
`/.well-known/geesome`; do not guess whether the deployment uses `/v1`,
`/api/v1`, or another public prefix.

Recommended scopes are `assets:write`, `assets:read-private`,
`operations:read`, and `asset-batches:write`. Inspect the active credential at
`GET {apiBaseUrl}/integrations/credentials/current`.

## Curl example

```bash
ORIGIN=https://node.example
TOKEN=replace-with-scoped-token
FILE=./release/character.webp
DISCOVERY=$(curl --fail --silent --show-error "$ORIGIN/.well-known/geesome")
API_BASE=$(printf '%s' "$DISCOVERY" | jq -r .apiBaseUrl)
DIGEST=$(shasum -a 256 "$FILE" | awk '{print $1}')

curl --fail-with-body "$API_BASE/assets" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: release-2026-07-character" \
  -F "file=@$FILE" \
  -F "expectedSha256=$DIGEST" \
  -F "logicalPath=release/character.webp"
```

Retry the same bytes and metadata with the same key. A completed replay returns
the original asset with `200`; different request data returns
`409 idempotency_key_conflict`.

For a release, create `POST {apiBaseUrl}/asset-batches` with an idempotency key
and an `items` array of `logicalId`, `logicalPath`, `sha256`, `bytes`, and
`mimeType`. Upload only items whose `requiredUpload` is true, including
`batchId` and `logicalId` in each asset multipart request. Complete with
`POST {apiBaseUrl}/asset-batches/{batchId}/complete` and verify the returned
manifest SHA-256.

Completed batch item rows are retained for 30 days by default so interrupted
clients can inspect recent uploads. A bounded daily cleanup then removes only
the item rows and returns `itemsRetained: false`; the compact completed batch,
its idempotency key, manifest, and all uploaded assets remain available.
Operators can configure `ASSET_BATCH_ITEM_RETENTION_DAYS`,
`ASSET_BATCH_CLEANUP_INTERVAL_MS`, and `ASSET_BATCH_CLEANUP_LIMIT`.

The executable Node example is
`examples/agent-friendly-assets.mjs`. It discovers the API, uploads one file,
and verifies the immutable read headers without a hardcoded API prefix.

See [API problem codes](./api-problems.md) and the live `openapiUrl` returned by
discovery for the machine-readable contract.
