# Native comic-page storage

This capability backs Microwave Girls Posts comic creation (#1552; Microwave
issue #900). Microwave owns provider calls, canonical layout rendering, review,
comic snapshots and its operation journal. GeeSome validates and stores already
rendered pages. Existing image-composition-v1 contracts are unchanged.

## Deployment and rollback

Deploy the node change before the Microwave feature. Native capability is
`GET /v1/user/comic-pages/capabilities` returning `version: 1`; Microwave must
check this before spending provider credit. No released numeric node version
is claimed until this change is merged and released.

Startup adds the new `comicPageOperation` table and indexes through model sync;
`database:sync-models` includes it after FileCatalog initialization. There is no
migration or destructive down operation. Rolling back application code leaves
saved Content, catalog items, recipe metadata, assets and operation rows intact.
Old code cannot edit or reconcile comic pages. Reinstall the capability to resume
with original keys. Do not drop the new table or remove saved metadata to roll back.

## Contracts and recovery

Authenticated `POST /v1/user/comic-pages` accepts `idempotencyKey`, `comicId`,
`pageId`, positive `pageRevision`, `folderId`, optional `previousVersionRef`,
`recipe`, `pngBase64` and `bubbles: [{id, svg}]`. The recipe has
`type: comic-page`, `version: 1`, matching comic/page/revision identifiers,
`sourceAssets[].originalManifestId`, normalized panel frame/crop and bubble
rectangles, and `canvas: {width, height, background}`. Sources are bounded to 12,
panels to 8, bubbles to 12, canvas to 1600 × 2000 and encoded PNG to 20 MB.
Source manifests must be owned or public, unencrypted ordinary raster Content;
storage IDs and declared source dimensions must match the native Content.
The folder must be owned. A successor must reference the preceding owned page
revision. Client pixels are a declaration; GeeSome checks fully decoded PNG
format/dimensions and does not rerender or certify agreement with the recipe.

Recipe object keys `constructor`, `prototype` and `__proto__` are rejected.
The deployed DAG-CBOR decoder cannot safely read objects containing an own
`constructor` key. Generation provenance therefore uses `setProvenance` as a
JSON **string**, retaining the original provenance without embedding those keys
in the native object graph. Do this before hashing/rendering the recipe.
Capabilities checks the same save/catalog permissions as create.

The receipt includes the exact supplied recipe, flat baked/preview identifiers,
`fileCatalogItemId` and native bubble asset references. Receipt `recipeHash`
hashes the complete canonical transported recipe; `recipe.recipeHash` belongs
to the Microwave renderer and is retained verbatim. Every revision receives a
new catalog item and immutable native Content manifest even when PNG pixels are
unchanged. Old pages remain accessible.

`GET /v1/user/comic-pages/operations/:key` is read-only and actor-scoped: pending,
failed or succeeded with the original receipt. `canResume` is true only for a
failed operation or an expired pending claim; retry the original request then. Unknown keys return 404.
`GET /v1/user/comic-pages/:manifest` reads a committed owned page receipt.
Reuse the exact original key and request after a failed/expired claim. Changed
requests and another key claiming the same page revision return 409. A live
claim returns `comic_page_operation_pending`; it is not permission to use a new
key. Claims expire after five minutes and checkpoints renew them.

The operation is created before content saving, checkpoints the candidate
Content, and atomically commits its catalog entry with the successful receipt.
Recovery can find a Content save whose response was lost before checkpoint by
its actor-bound request hash in native metadata. Source and bubble dependency
edges prevent physical removal while referenced, and operation Content references
participate in delete-safety counts. Recipe metadata and bubble mapping are in
the Content manifest, not only in the operation table.

## Bubble assets and verification

Bubble SVGs reuse the image-composition sanitizer: passive SVG primitives,
path/ellipse/rect/text/tspan, bounded markup, no scripts, remote references,
CSS URLs or active content. GeeSome stores those SVGs as raw assets; it does not
choose or install fonts. Microwave supplies final text layout and font/renderer
versions, and its baked PNG supplies visible page typography.

Focused tests: `test/comicPage.test.ts` uses production operation models with
PostgreSQL and mocked content I/O to exercise conflicts, concurrent claims,
partial-save and expired-process recovery. `test/comicPageIntegration.test.ts`
uses the actual node, Content/Media, PostgreSQL and Kubo. Run against disposable
test infrastructure, never an operator database. Existing SVG/contract tests
cover the shared sanitizer. Regenerate apiDoc and the route/scalability inventories
when changing these endpoints or storage contracts.
