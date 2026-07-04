# Static Site Generator Module

## Purpose

The `staticSiteGenerator` module renders GeeSome groups and content lists into static site output and stores the generated result through the storage/content stack.

## Owns

- Static-site records, render options, generated output storage IDs, and optional static ID binding.
- Render-queue entry points such as `addRenderToQueueAndProcess` and `runRenderAndWaitForFinish`.
- A single-module queue processor that uses `asyncOperation` queue rows and progress records.
- Group and content-list render flows, including sanitized text/HTML output and bundled frontend assets.
- Storage ID allow checks for generated site responses.

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

## Related Docs

- [Group module overview](../../group/docs/overview.md)
- [Entity JSON Manifest module overview](../../entityJsonManifest/docs/overview.md)
- [Storage Space module overview](../../storageSpace/docs/overview.md)
