# File Catalog Module

## Purpose

The `fileCatalog` module owns user/group folder trees and path-based organization for content records.

## Owns

- Folder and file catalog rows, active path uniqueness, default folders, breadcrumbs, and ordering.
- Saving content or raw data to a catalog path.
- Linking existing content into folders and listing folder contents.
- Folder publishing, manifest saving, static binding options, and catalog item deletion/update flows.
- Catalog reference lookups used by content delete-safety and storage-space analysis.

## Boundaries

- File catalog items organize content; they do not own physical storage bytes.
- Path writes are owner/folder scoped and must preserve active-path uniqueness while allowing deleted historical rows.
- Deleting catalog items must not bypass content/storage delete-safety.
- Large folder pages should stay bounded with stable ordering and indexed path lookups.
- Published folder/static output behavior should keep generated storage references visible to storage-object and cleanup checks.

## Related Docs

- [Database scalability review](../../../../docs/database-scalability-review.md)
- [Storage-space analyzer status](../../../../docs/todo.md#12-storage-space-analysis-ui)
