# Image Composition Module

## Purpose

`imageComposition` owns versioned image posts whose base raster remains immutable
and whose overlays are stored as safe, backend-generated SVG contents. It is a
separate feature module; `group` supplies generic post, permission, manifest,
timeline, and atomic-update primitives.

## Public API

For compatibility, the module registers the existing authenticated routes:

- `POST /v1/user/group/create-image-composition`
- `POST /v1/user/group/update-image-composition/:postId`
- `GET /v1/user/group/image-composition/:postId`
- `GET /v1/user/group/:groupId/image-compositions`

The resolved DTO uses `type: image-composition`, numeric post IDs, normalized
geometry, portable content manifest IDs, canonical asset URLs, and an object
cursor containing `publishedAt` and `id`.

## Ownership And Dependencies

The module owns semantic validation, `speech-v1` SVG rendering, operation
idempotency, optimistic revision handling, API error translation, and the
`ImageCompositionOperation` model. It depends on `database`, `api`, `content`,
`group`, and `asyncOperation`, and must load after `group`.

Composition posts are native GeeSome entities. Their raw Post rows use the
generic `(groupId, type, entityId)` identity and leave `source`,
`sourceChannelId`, and `sourcePostId` empty because those fields represent
remote/import provenance. `entityId` is preserved in post manifests.

## Storage And Safety

- The base raster is referenced by its existing content manifest ID.
- Sticker text is validated semantic input; clients never submit SVG markup.
- Generated SVGs are escaped, deterministic, self-contained, and stored as raw
  immutable contents with restrictive serving headers.
- Updates reuse unchanged sticker contents and atomically compare the previous
  post properties before increasing the composition revision.
- Create and update operations persist idempotency state so retries do not
  duplicate posts.

## Verification

Primary coverage lives in `test/imageComposition*.test.ts`. Schema/backfill
coverage lives in `test/postEntityIdentityMigration.test.ts` and
`test/databaseMigrationIntegrity.test.ts`. Run the focused tests first, then
`npm run test:docker` for PostgreSQL/IPFS integration.
