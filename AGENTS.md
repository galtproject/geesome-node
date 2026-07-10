# AGENTS

## Scope

These instructions are repo-specific. Follow them when working inside `/Users/microwavedev/workspace/microwave-hub/geesome-node`.

## Project Shape

- `geesome-node` is the backend/API node for the GeeSome stack.
- Main surfaces:
  - `app/` for feature modules and migrations
  - `index.ts` for runtime wiring
  - `check/` for targeted diagnostics and verification scripts
  - `bash/` for operational helpers and deployment scripts
  - `docs/` for repo-local planning notes and generated/reference documentation
- The public README is `README.MD` with an uppercase extension.
- Start docs discovery from `docs/README.md`; use `docs/modules.md` for module ownership and `docs/agent-map.md` for task-to-doc routing.

## Production Updates

- When a user asks how to update a production Geesome server over SSH, point them to the repo's existing upgrade script as the efficient path: `cd <geesome-node-dir> && npm run docker-upgrade` (or `bash/docker-rebuild-and-upgrade.sh`).
- To find the deployed repo directory from a running container, use `docker inspect geesome --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}'`.
- Mention that the upgrade script pulls source, rebuilds the Docker image with warm BuildKit/Yarn caches, then restarts the `geesome-docker` systemd service. External `.docker-build-cache` export is used when the host builder supports it, and Docker caches are pruned only after a failed build before retrying.
- Do not tell users to run `bash/docker-prune.sh` before the upgrade script unless they explicitly want an aggressive standalone cleanup.
- Warn that the upgrade script refuses to run with uncommitted local edits, so server-side edits must be committed or stashed before running it.

## Workflow

- Branch policy: `dev` is the integration/default branch for normal PRs and merges. `master` is the stable release branch; update it only when cutting or promoting a tested release, then tag the release.
- Use `yarn install` for dependency setup.
- For targeted work, run the narrow test file first when one maps directly to the touched module.
- Prefer `npm run test:docker` as the main full-suite verification path. It runs the suite in Docker with Postgres, IPFS, Node 22, and ffmpeg available, and is optimized for warm reruns after source-only changes by reusing dependency and service caches while still rebuilding the source snapshot.
- Keep Docker test dependency installation in the image build. Runtime test scripts should use `bash/test-run.sh` after model sync and migrations instead of calling `yarn test`, so source-only reruns stay quiet and do not replay package-manager warnings.
- Keep default test/start scripts quiet. Use `DEBUG=geesome*` only when module traces are useful, `GEESOME_TEST_LOGS=1` only when test stdout diagnostics are needed, `GEESOME_ACCESS_LOGS=1` only when HTTP access logs are needed, `GEESOME_DEPENDENCY_INFO_LOGS=1` only when dependency fallback info is needed, and `GEESOME_LOG_SQL=1 DEBUG=geesome:database:sql` only when SQL trace output is needed.
- Debug logs that build payloads from object fields, array iteration, JSON serialization, `toJSON()`, or diagnostic-only DB reads must use `helpers.logDebug` / `helpers.logDebugAsync` and safe payload helpers so the work is skipped unless the namespace is enabled.
- Use `npm run test:docker:no-build` only to rerun the exact same already-built source snapshot. Use `npm run test:docker:cold` when persistent Docker test services or data may be stale.
- `yarn test` remains acceptable for quick local checks when the host already has the expected PostgreSQL and media-tooling prerequisites.
- Treat database and static-site-generator migrations as high-risk changes. Check the relevant module-local migration flow before adding or changing migrations.
- Do not add migrations only to create brand-new tables. New Sequelize models/tables are created by `Model.sync({})`.
- For model-sync tables that exist only on unreleased `dev` work and have not reached production/stable release, keep iterative schema changes in the model definition instead of committing temporary migrations. Before promoting a release, add real migrations for schema changes that must upgrade already deployed production tables, production indexes on existing data, constraints, data cleanup/backfills, and type/column changes.
- When touching contracts shared with `geesome-libs` or `@geesome/ui`, review downstream impact before calling the task complete.
- When changing or consuming user-visible `@geesome/ui` behavior, treat the UI e2e/screenshot evidence as part of the node-side verification. The matching `geesome-ui` PR should run `npm run test:e2e:screens`, inspect the JSON screenshot sidecars for broken images, horizontal overflow, unexpected scroll movement, and missing controls, and keep generated screenshots, reports, caches, and `dist` out of Git.
- Keep `docs/todo.md` aligned when triaging GitHub issues or changing the README TODO list.
- Before implementing the next item from `docs/todo.md`, use deterministic TODO section context instead of broad manual scanning: run `npm run todo:sections` to list stable section ids, then `npm run todo:context -- <section-id>` for the slice you will implement. Keep `<!-- todo-section: ... -->` markers unique and stable when changing the plan, and add a new section marker when adding a new actionable slice.
- Keep generated API documentation aligned with route changes. When adding, removing, renaming, or changing any `app.ms.api.*` or `module.on*` API handler, update the nearby apiDoc annotations in the same change: URL, method, auth header, path/query/body fields, success/error docs, and examples when the contract changes. Run `npm run generate-docs` or an equivalent targeted apiDoc smoke before handoff. If the API-doc roadmap/status changes, update `docs/todo.md` too.
- Keep the security route inventory aligned with route changes. When adding, removing, renaming, or changing API handlers, run `npm run security:route-inventory:update`, review the auth/permission notes in `docs/security-route-inventory.md`, and then run `npm run security:route-inventory` before handoff.
- Keep the database scalability inventory aligned with large-list and large-table changes. When changing group/content models, migrations, post listing queries, static-site/RSS group-post loading, social-import post scans, or generated manifest post iteration, run `npm run database:scalability:update`, review `docs/database-scalability-review.md`, and then run `npm run database:scalability` before handoff.
- Keep the migration integrity audit aligned with recent migrations. When adding a migration, update `check/databaseMigrationIntegrity.ts` with the final-state indexes, column types, dedupe invariants, relation checks, or an explicit skip rationale, then run `npm run database:migration-integrity` against a migrated Postgres database; use `-- --skip-migration-meta` only for model-sync test databases that did not run Sequelize migrations. Model-sync-only new tables may still add final-state checks, but they should not be listed as covered migrations unless a real migration file exists.
- For restored-backup migration rehearsals, prefer `npm run database:migration-rehearsal`. It requires `CONFIRM_RESTORED_BACKUP=1` and an explicit `DATABASE_NAME`, runs the full migration chain, syncs model-created tables, reconciles canonical `StorageObject` rows from existing `Content`, and then runs the migration integrity audit.
- After restored-backup rehearsals that include groups/posts, also run `npm run database:derived-state-integrity` against the migrated database. Use `CONFIRM_DERIVED_STATE_REPAIR=1 DERIVED_STATE_REPAIR=1 DATABASE_NAME=<db> npm run database:derived-state-integrity -- --repair` only after backup/approval when local published post manifest/static-directory or group manifest derived state needs regeneration.
- Match the project code style documented in `docs/code-style.md` for new code. The hard rule (no inline `if`) applies project-wide; the rest of the doc captures the dominant patterns and where files diverge.
- For dependency-security or Dependabot follow-ups, check open dependency-related issues and PRs before branching. If an open dependency PR already exists and the new work fits its scope, continue that PR branch and push the additional dependency fix there instead of opening parallel dependency PRs.
- Treat chat encryption as unfinished unless the private keys stay in clients. Backend-side encryption is only a PoC and must not be documented as complete E2EE.
- Treat libp2p chat transport as an online propagation layer, not as durable chat storage. Stable chat work must include opaque message persistence, acknowledgements, retry/backfill, ordering, and offline/device-sync behavior above pubsub.
- Fast-delivery issues usually map to existing modules:
  - `pin` for Pinata/pinning work.
  - `staticSiteGenerator` for static-site options, favicon, generated pages, and frontend delivery.
  - `api` and `database` for API key permissions and expiration.
  - `content`, `fileCatalog`, `storage`, and media drivers for upload, streaming, previews, and content serving bugs.
  - `socNetImport`, `telegramClient`, `twitterClient`, and `tgContentBot` for social backup/import work.
  - Chat E2EE spans `geesome-ui`/client key handling, `geesome-libs` protocol helpers, and `geesome-node` delivery/storage APIs.
  - ActivityPub/Fediverse work belongs in a dedicated API/integration module and should map GeeSome groups/posts/users to interoperable actors, objects, inbox/outbox flows, and signatures.

## Safety

- Preserve production-oriented operational scripts in `bash/` unless the user explicitly asked to change deployment behavior.
- Do not assume `main` is the base branch here. Check the hub manifest or local Git state first.
- Never commit `.env` or secrets.
- Do not land dependency bumps from Dependabot PRs without running the relevant module tests and checking whether `geesome-libs` or `@geesome/ui` lockstep changes are needed.
