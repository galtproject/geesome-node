# Prepared publication images with previews

## Contents

- [Contract and trust](#contract-and-trust)
- [Local command](#local-command)
- [Publication workflow](#publication-workflow)
- [Implementation and verification](#implementation-and-verification)

## Contract and trust

Issue #1512 follows the three-image timing probe: preview work dominated the
server path. This change lets an authorized owner encode locally and upload a
JPEG plus small/medium/large WebP previews in one request. It does not publish a
site, edit posts, delete sources, or change the existing quality policy.

`POST /v1/user/save-prepared-image` requires the normal save permission and
`content:write` scope, and an owned non-remote source. Multipart parts are
`manifest`, `file`, `small`, `medium`, `large`. The manifest freezes the source
Content ID/CID, imageOptimize JPEG95 driver, expected watermark identity, codec
and SHA-256 for every file. Total payload files are bounded to 64 MiB and the
remaining owner quota. Parser file/field counts and individual sizes are bounded.
All images are decoded with pixel/time limits before any storage write. Main
must be normalized single-frame JPEG, previews single-frame WebP with exact
512/1024/2048 bounding-edge dimensions without enlargement. Missing, extra,
duplicate or corrupt parts fail. Temporary parser files are released on success
and failure. No remote URLs or client filesystem paths are accepted by this API.

This is explicitly **trusted-client encoding**. Hashes validate transport, not
that the main image depicts the source. The server does not independently prove
JPEG quality, WebP effort, or watermark pixels. The owner-controlled local
command uses the same backend encoder implementations, including watermark and
already-applied watermark handling; do not expose this producer to untrusted
encoders. The capability advertises this distinction. Ordinary uploads do not
create these policy receipts.

## Local command

Use Node 22 and installed backend dependencies. Store a minimal owner source
snapshot locally as JSON: `id`, `storageId`, and `propertiesJson` from the owned
Content (needed to preserve existing watermark provenance). Keep files private.
Do not use a Page's declared MIME type as the actual image format.

```sh
npm run image:prepare-upload -- --input /private/source.jpg \
  --source-json /private/source.json --bundle-dir /private/prepared-123
```

An optional `--driver-json /private/driver.json` supplies the exact imageOptimize
driver frozen in the site replacement, including a required new watermark.
Default is unmarked publication-jpeg95-v1. The local encoder first produces the
JPEG, then derives previews from that JPEG just like the server path; identical
effective preview edges reuse encoded bytes. Existing source watermarks are
preserved rather than inferred from pixels.

Preparation writes durable manifest and file artifacts with private permissions.
For upload/resume, set `GEESOME_API_URL` and `GEESOME_API_KEY` in the terminal
environment (never paste secrets into issues/logs), then run:

```sh
npm run image:prepare-upload -- --bundle-dir /private/prepared-123 --upload
```

The command verifies the durable bundle, uploads once, writes `receipt.json`,
and emits compact JSON stage timing/byte/progress lines. It does not retry an
uncertain request automatically. Resubmitting the same source-bound bundle uses
the server's source-policy receipt and returns `reused: true`; it does not
re-encode. Redirects are refused. Remote upload requires HTTPS.

## Publication workflow

Dependency order is backend capability, local preparation/upload, then the
existing membership replacement/render/archive/Patreon stages. Media/storage I/O holds no application SQL transaction. A source row is
locked only during final upload receipt commitment; the source CID must still match. The
result and source record ordinary publicationImage/publicationImages receipts,
so existing `/v1/user/save-data` resave requests return the uploaded Content.
The microwave-girls preparation stage can consume that result unchanged.

Before a real migration, freeze the source IDs/CIDs and driver in the existing
replacement plan, then use those exact values to prepare each image. Preupload
before the ordinary membership job admits server-side resave workers. Do not prepare
with the default driver for a replacement requiring a new watermark. Do not
retire anything until the ordinary verified cutover succeeds. Unknown outcomes
must be reconciled using the original source and saved bundle. This upload is
not an atomic publication or cleanup operation.

A failed or concurrent upload can leave unreferenced saved storage/Content before its source
receipt commits; it must not trigger automatic deletion. Concurrent existing
server-side workers may already be encoding the same source, so preupload before
admitting those workers to avoid duplicate work. No mass-run switch or automatic
Patreon writes are enabled by this change. Measure one complete canary including
transfer and validation before choosing bulk concurrency. Existing JPEG95 can
increase already-compressed JPEG size; this does not change that policy.

## Implementation and verification

Workstreams are sequential: source-bound backend contract and validation;
shared-encoder local producer; first-use/reuse and rejection verification;
release through dev and stable; optional measured production canary. Backend
must be deployed before local uploads. Agents do not merge release PRs.

Completion criteria: bypass both server encoders, preserve exact uploaded bytes,
reject foreign/changed sources and malformed bundles, and make the result
available to an ordinary resave request. Focused unit/API tests, generated API
docs and security route inventory provide the verification. Production upload
is not part of implementation verification.

Verified locally: four pure validation cases and the complete image saving/site
retirement integration file, **28 passing** in an isolated Docker container with
a separate database. Coverage includes exact upload bytes with both server
encoders disabled, reuse through the normal resave path, foreign/changed source,
watermark mismatch, quota rejection, and concurrent prepared uploads with a
one-connection SQL pool. The CLI preparation/reopen smoke passed; all five bundle
files were mode 0600. API documentation generation and route inventory passed.
The entire unrelated backend suite was not repeated for this follow-up. No
production prepared-image uploads or Patreon writes were performed.
