# API Problem Codes

New integration routes return RFC 9457-style `application/problem+json`.
Every problem contains `type`, `title`, `status`, a stable GeeSome `code`, and
the same `requestId` exposed in `X-Request-Id`. Internal exception messages and
credential material are never returned.

## Common codes

| Code | Status | Meaning |
| --- | ---: | --- |
| `credentials_required` | 401 | The bearer token is missing. |
| `invalid_credentials` | 401 | The bearer token is invalid, expired, disabled, or revoked. |
| `insufficient_scope` | 403 | The credential lacks one or more `requiredScopes`. |
| `idempotency_key_conflict` | 409 | The key was already used with different request data. |
| `idempotency_request_in_progress` | 409 | The original request is still running. |
| `upload_limit_exceeded` | 413 | Multipart or account upload limits were exceeded. |
| `asset_digest_mismatch` | 422 | Uploaded bytes do not match `expectedSha256`. |
| `asset_not_found` | 404 | No asset with that storage ID is visible to this owner. |
| `asset_batch_incomplete` | 409 | One or more declared batch items still require upload. |
| `operation_not_found` | 404 | The operation does not exist or is not visible to this owner. |
| `internal_error` | 500 | The request failed without exposing implementation details. |

Clients should branch on `status` and `code`, log `requestId`, and treat all
other fields as explanatory or forward-compatible extensions.
