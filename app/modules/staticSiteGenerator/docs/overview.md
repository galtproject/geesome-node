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

The image viewer supports clicking a thumbnail, switching images with the arrows
or keyboard, and closing with its button or backdrop. The archive download control
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
