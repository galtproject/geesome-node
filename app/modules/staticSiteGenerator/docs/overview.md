# Static Site Generator Module

## Purpose

The `staticSiteGenerator` module renders GeeSome groups and content lists into static site output and stores the generated result through the storage/content stack.

## Owns

- Static-site records, render options, generated output storage IDs, and optional static ID binding.
- Render-queue entry points such as `addRenderToQueueAndProcess` and `runRenderAndWaitForFinish`.
- A single-module queue processor that uses `asyncOperation` queue rows and progress records.
- Group and content-list render flows, including sanitized text/HTML output and bundled frontend assets.
- Render option normalization: site names are validated, custom CSS is size-capped, and header/footer HTML is sanitized before generation.
- Storage ID allow checks for generated site responses.
- Search indexing policy for generated sites: `allowSearchIndexing` must be explicitly set to boolean `true`; otherwise generated HTML and gateway responses are marked `noindex, nofollow`.

## Queue Boundaries

- Queue module name is `static-site-generator`.
- Each queued render creates a linked async operation before generation starts.
- The processor handles one waiting queue row at a time and recursively continues until no waiting work remains.
- Group renders require group-admin rights; content-list renders require a bounded `entityIds` list.
- Errors must close or mark the async operation so queue rows do not remain stuck.

## Restart-interrupted content-list renders (#1554)

An operation marked `node-restart` retains its original receipt. An owner with
save permission and `content:write` can submit
`POST /v1/render/static-site-generator/recover/:queueId` with the exact numeric
`expectedOperationId`. Replacement renders are supported, including queues
already closed by an older node. New content-list admissions, including rebuilds
without optimization, atomically save owned source IDs, immutable CIDs,
preview CIDs and render-metadata fingerprints. Sources are checked before
rendering and before the result checkpoint. Changed or missing sources stop.
Group renders and legacy content-list renders without a saved source snapshot
are refused unless an already-created result is exactly correlated to the
original operation ID, entity IDs and render options; that result is adopted
without rereading mutable sources or rerendering.

Recovery keeps the queue ID, input, replacement ID and interrupted operation;
it creates a new operation and an immutable interrupted-receipt snapshot in the
new model-synced `staticSiteRenderRecoveries` table. New admissions also use
`staticSiteRenderReceipts` for the original source fingerprint and queue-bound
result. A queue row lock and unique
queue/interrupted-operation key make concurrent calls and lost responses
idempotent. Repeating the original expected ID reads the accepted attempt; it
does not retry a failed attempt. Three recovery admissions per queue are the
fixed maximum, including attempts interrupted by another restart. Other errors,+cancellation, foreign ownership and changed operation IDs are refused.

Only the requested queue is processed. The existing storage worker picks up
already-admitted pending recoveries if the immediate processor is busy. It does
not automatically admit other interrupted renders. Poll the original queue to
observe the current operation. The owner queue projection includes
`renderRecoveryPolicy: {contract: 1, supported, mode, limit: 3}`; modes are
`replacement`, `frozen-content-list`, `legacy-result-only` and `unsupported`.
Check this capability before preparing a new recovery intent. A saved replacement result or completed immutable
revision is adopted before any rendering, and archive admission is reconciled
before the new operation finishes. Archive **readiness**, public proof and
publication cutover remain the consumer's barriers; recovery never performs
publication cleanup or edits external links.

Deploy the backend before the consumer calls this new endpoint. No existing
table alteration or migration is required; startup sync creates the new tables.
Old readers continue to poll the same queue shape. Rollback preserves the new
table and receipt snapshots, but older nodes cannot execute pending recoveries;
drain admitted attempts before rollback or redeploy this version before resuming.
An owner may recover Iris queue `13488`, interrupted operation `70372`, only
after rereading its live state and confirming replacement `13486` and the
consumer's original source/version fence. Do not create a replacement queue or
reset its old operation. The consumer must verify the recovered site and archive
before replacing its published URL; Patreon is outside this operation.

## Boundaries

- Keep render inputs bounded; do not render unbounded group timelines or content lists inline.
- Render only sanitized/escaped post and content data; generated HTML is a public output surface.
- Storage references created by generated output must stay visible to storage-space and delete-safety checks.
- Static ID binding is separate from rendering and should remain explicit.

## Downloaded sites

Generated HTML uses a standalone classic `public/client.js` bundle (Vue with its
template compiler and router included). Escaped per-page JSON is embedded in
`#site-data`, so opening an extracted archive's `index.html` through `file://`
requires no module loader, API call, local server or browser security override.
The existing `clientData.js` export stays available for publication verification.
Nested group pages preserve their server-rendered route during hydration.

Content-list galleries request previews only for cards intersecting the viewport.
After all currently visible previews load or fail, originals for those cards warm
in document order with at most two concurrent requests. Scrolling immediately
starts the new visible previews and stops scheduling old offscreen originals;
at most two already active originals may finish. A preview failure does not block
warming. Opening the viewer uses the same original URL so the browser can reuse
its warmed cache. Unmounting disconnects visibility tracking and cancels warming.
Videos use `preload="none"`. Visibility scheduling starts after the browser client
hydrates; SSR no longer starts hidden original or offscreen preview downloads.

Run `npm run test:ssg-gallery-loading` for standalone browser verification without
Postgres/IPFS: delayed responses verify preview priority, two original slots,
scroll ordering, failures, cleanup, modal cache reuse, and offline narrow layouts.
Screenshots and their manifest stay under the ignored test output directory.

The image viewer supports clicking a thumbnail, switching images with the arrows
or keyboard, and closing with its button or backdrop. The transparent 32px close
icon overlays the image’s top-right corner with a 48px hit area; keyboard focus
remains visible. The archive download control
is hidden in local copies; HTTP/IPFS pages retain their relative archive API.
Previously generated CIDs/archives are immutable and need rebuilding to receive
the new browser client. No database migration is required.

The `archives a standalone gallery` case in `test/staticSiteGenerator.test.ts`
exports real gallery/group archives to `test/output` (the Docker host mount is
`test/.geesome-test-output`). After generating those fixtures, install the test
browser once with `npx playwright install chromium --only-shell`, then run
`npm run test:ssg-offline`. `GEESOME_TEST_OUTPUT` can select another fixture/output
directory. It opens the extracted archives directly via `file://` with networking
disabled, verifies modal/keyboard/close behavior, safe JSON and nested routes,
and checks the same gallery over HTTP. Screenshots stay in the ignored output.

## Related Docs

- [Group module overview](../../group/docs/overview.md)
- [Entity JSON Manifest module overview](../../entityJsonManifest/docs/overview.md)
- [Storage Space module overview](../../storageSpace/docs/overview.md)
