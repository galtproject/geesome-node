# Image Composition Module

## Purpose

`imageComposition` owns versioned baked image Contents whose base raster remains
immutable and whose overlays are stored as safe, backend-generated SVG Contents.
It has no Post, Group, publication, or client-specific source dependency.

## Public API

- `POST /v1/user/image-compositions`
- `GET /v1/user/image-compositions/:contentManifestId`
- `POST /v1/user/image-compositions/:contentManifestId/revisions`
- `GET /v1/user/image-compositions` for catalog-placed composition summaries

Create stores standalone Content by default. An optional owned `folderId` uses
the normal file-catalog placement flow. Resolved detail includes
`fileCatalogItemId` only when such a placement exists.

## Identity And Revisions

`ImageCompositionIdentity(userId, compositionId)` converges initial creates and
tracks both the immutable root and current Content rows. Revisions compare and
swap `currentContentId`; if the identity has a catalog placement, the same
transaction advances that FileCatalogItem to the new Content.

Operation records provide durable idempotency and recovery without making a
catalog item mandatory.

## Storage And Safety

- The baked PNG is the default renderable Content and carries the versioned
  semantic recipe in `properties.imageComposition`.
- The base raster and generated SVG stickers are referenced through durable
  `ContentDependency` edges.
- Sticker text is validated semantic input; clients never submit SVG markup.
- Generated SVGs are escaped, deterministic, self-contained, and stored as raw
  immutable Contents with restrictive serving headers.
- Previews are baked from the final PNG, so ordinary clients show stickers
  without composition-specific preview logic.

## Verification

Primary coverage lives in `test/imageComposition*.test.ts`, including
standalone creation/revision, optional catalog placement, concurrency,
idempotency, dependency integrity, preview generation, and authorization.
