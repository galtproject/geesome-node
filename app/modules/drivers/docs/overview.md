# Drivers Module

## Purpose

The `drivers` module registers media/file drivers used by higher-level content flows for upload, preview, metadata, and conversion work.

## Owns

- Preview drivers for images, GIFs, text, YouTube thumbnails, and video thumbnails.
- Upload drivers for files, archives, and YouTube videos.
- Conversion drivers for video streamability and image watermarking.
- Metadata drivers for image inspection.
- The shared driver contract for stream/content/source/path inputs and processed outputs.

## Boundaries

- Drivers should stay stateless and focused on transformation; user permissions and content ownership belong to caller modules.
- Temporary files/streams must be cleaned up by the driver or caller contract.
- Expensive media processing should stay bounded and should not run inside list/hot query paths.
- New drivers must declare supported inputs/output sizes and return enough metadata for `content` to persist safely.

## Related Docs

- [Content module overview](../../content/docs/overview.md)
- [Storage module overview](../../storage/docs/overview.md)
