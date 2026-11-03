# Local Client Publishing

One node-owned PublicationJob table schedules delivery from locally configured
social accounts. It never stores provider credentials or changes Post.status.

API (relative to discovery apiBaseUrl):

- POST user/local-publications: requestKey, postId, network, localAccountId,
  scheduledAt and optional target (subreddit/title/flairId/kind=self|link).
- GET user/local-publications: owner-only paginated jobs and manual-review tokens.
- POST user/local-publications/claim: configured accounts -> one due job or null.
- POST user/local-publications/:jobId/result: original claimToken and confirmed
  posted/failed/needs_review outcome. Same result is safe to repeat.
- POST user/local-publications/:jobId/cancel: queued cancellation only.

Use an existing API key with publishing:local scope. The owner also needs group
management rights and edit permission on a public, unencrypted, local source.
Source permissions are checked at scheduling and claiming. Imported sources and
private attachments are rejected. Payloads freeze text and public HTTPS IPFS
media references; unsupported attachments are rejected rather than dropped.

Claim uses row locks and SKIP LOCKED, commits ownership, then checks source
permissions before returning the payload. A transient lookup failure leaves the
processing job for manual review. Processing work has no lease expiry and is
never automatically sent again. After a crash or uncertain provider response,
inspect the provider and settle the old executor before manually reporting an
outcome or deliberately scheduling another send. Original claim tokens are
returned only to the owner so resolution survives client restarts.

The new table is model-synced; there is no migration of existing Post tables.
Clients must discover/explicitly configure the API base and never assume /api/v1.
See the [delivery plan](../../../../docs/plans/local-social-publishing.md).
