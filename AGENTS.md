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

## Workflow

- Use `yarn install` for dependency setup.
- Prefer `yarn test` as the default verification command for code changes.
- Treat database and static-site-generator migrations as high-risk changes. Check the relevant module-local migration flow before adding or changing migrations.
- When touching contracts shared with `geesome-libs` or `@geesome/ui`, review downstream impact before calling the task complete.

## Safety

- Preserve production-oriented operational scripts in `bash/` unless the user explicitly asked to change deployment behavior.
- Do not assume `main` is the base branch here. Check the hub manifest or local Git state first.
- Never commit `.env` or secrets.
