# GeeSome Node Repository Instructions

- This repo is the backend/API node for the GeeSome stack. Follow `AGENTS.md` in the repo root for local conventions.
- Use `yarn install` for dependency setup and `yarn test` as the default verification command for code changes.
- Do not assume `main` is the base branch here. Check the hub manifest or local Git state first.
- Treat database migrations and static-site-generator migrations as high-risk. Review the relevant migration flow before adding or changing migrations.
- When touching contracts shared with `geesome-libs` or `@geesome/ui`, review downstream impact before calling the task complete.
- Preserve production-oriented scripts under `bash/` unless the task explicitly requires deployment or operational changes.
