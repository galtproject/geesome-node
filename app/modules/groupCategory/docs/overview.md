# Group Category Module

## Purpose

The `groupCategory` module organizes groups and posts into categories, category memberships, and group sections.

## Owns

- Category and section records, manifests, static IDs, and creator/admin state.
- Category group membership, category admin/member permissions, and category-scoped group permissions.
- Category group listing and category post feeds with bounded pagination and cursor-aware post pages.
- Group section creation, update, list, and one-section-per-group placement.
- Category manifest refresh after category creation/update.

## Boundaries

- Group/post ownership and post hydration belong to the `group` module.
- Static identity creation and resolution belong to `staticId`.
- Category feeds should select bounded post IDs before hydration, mirroring group timeline scalability patterns.
- Category admin/member checks must stay explicit before membership or group-placement changes.

## Related Docs

- [Group module overview](../../group/docs/overview.md)
- [Static ID module overview](../../staticId/docs/overview.md)
- [Database scalability review](../../../../docs/database-scalability-review.md)
