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

## Workflow

- Use `yarn install` for dependency setup.
- Prefer `yarn test` as the default verification command for code changes.
- For targeted work, run the narrow test file first when one maps directly to the touched module, then run `yarn test` before handoff when practical.
- Treat database and static-site-generator migrations as high-risk changes. Check the relevant module-local migration flow before adding or changing migrations.
- When touching contracts shared with `geesome-libs` or `@geesome/ui`, review downstream impact before calling the task complete.
- Keep `docs/todo.md` aligned when triaging GitHub issues or changing the README TODO list.
- Treat chat encryption as unfinished unless the private keys stay in clients. Backend-side encryption is only a PoC and must not be documented as complete E2EE.
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
