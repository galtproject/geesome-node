# Archive module

An uploader can explicitly publish a tar.gz archive of their local content or a
static site they generated. Archives are public to anyone who knows the original
CID, including archives of uploads that previously required authentication.

## API

- `POST /v1/user/archive/:storageId`: authenticated, requires `user:save_data`
  and `content:write` for scoped API keys. Checks ownership before enqueueing.
  Returns HTTP 202 with `status: queued`, `originalStorageId` and `queueId`, or
  HTTP 200 with `status: completed` and the existing CID pair.
- `GET /v1/archive/:storageId`: public completed CID pair; otherwise HTTP 404.
- `GET /v1/archive/:storageId/download`: public gzip attachment; otherwise 404.

Inputs must be immutable UnixFS dag-pb/raw CIDs without paths. CIDv0 aliases are
normalized to CIDv1. IPNS, IPLD objects and arbitrary gateway URLs are rejected.
Ownership uses active local Content rows or the static-site record's owner.
Remote imported content alone does not authorize creation. Ownership and current
user/API-key permissions are checked again before execution.

## Storage and queue

`contentArchives` has a unique indexed `originalStorageId`, `archivedStorageId`
index and requesting `userId`. New tables are created through model sync; no
migration is required. Both CIDs participate in database deletion-safety checks.
The archive is pinned before a completed mapping is written. Failed jobs never
create a completed mapping. Successful retries reuse it.

The `content-archive` shared async-operation queue has owner-scoped input and
operation output containing the completed CID pair. Poll
`POST /v1/user/get-operation-queue/:operationId`
or the existing async-operation endpoints. A worker polls every five seconds,
including startup, and processes up to ten jobs per pass. Enqueue also starts
processing immediately. Failed/interrupted jobs are reported through async
operations; submit the request again to retry. Queue deduplication follows the
shared queue's input-hash behavior; the database uniqueness constraint keeps a
single final mapping even under duplicate requests.

## Archive contract

The root entry is the canonical original CID. Files retain exact bytes; nested
paths and empty directories are preserved. Entry metadata is deterministic.
The archive streams through gzip into a temporary file and then into IPFS;
local temporary files are removed on success and failure. There is no whole-site
buffer in memory. Bounds are 1 GiB uncompressed, 10000 entries and depth 64;
file reads/stat requests use a ten-minute deadline, also checked between entries. Unsafe path components and unsupported
node types fail the job. Cancellation is checked between entries and before and
after storage upload. Only UnixFS contents under the source root are included;
external URLs referenced by HTML are not fetched.

## Verification

`test/archive.test.ts` exercises real Postgres models, IPFS, authenticated
creation, public lookup/download, ownership denial, missing archives, reuse,
binary/unicode/empty directory preservation and physical deletion protection.
`test/staticSiteGenerator.test.ts` archives a generated 30-post site, unpacks
it and recursively compares every directory and every file byte with IPFS,
including main, pagination and post pages, styles and content assets.

## Static-site publication integration

Static-site requests can set `options.archive: true`. After the final site CID
and owner record are saved, the render worker enqueues an archive under the
requesting user/API key and then completes rendering without waiting for archive
compression. The archive module must be enabled. The download control is rendered
only for this explicit option, in both gallery and group layouts.

The generated client gets the canonical public API base from node configuration,
not from caller-supplied options. It derives the immutable original CID from
`/ipfs/<cid>/...` or a CID subdomain at runtime, avoiding a self-referential site
hash. Visitors only perform public GETs without credentials. A 404 shows a pending
state with bounded polling; transient failures expose a retry control. Extracted
files/DNSLink pages without an immutable CID in the URL show unavailable rather
than downloading an unrelated archive.

`test/staticSiteArchiveBrowser.mjs` runs against the actual generated-and-archived
gallery fixture from `test/staticSiteGenerator.test.ts` in the existing
microwave-girls Playwright Docker image. It verifies top-right placement, no
horizontal overflow or broken gallery images, pending/error/retry/ready states,
and exact downloaded archive bytes at desktop and narrow widths. Its six PNGs
and screenshot manifest stay in the ignored runtime evidence directory.

The control uses decorative outline SVGs for download, waiting and retry, plus a
small loading indicator. Motion is disabled under `prefers-reduced-motion`.
