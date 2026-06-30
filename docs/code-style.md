# Code Style

Living document derived from inspecting the existing TypeScript surface in `app/`. Use it as the default style for new code in this repo. When editing an existing file, match what is already in that file even if it differs from the defaults below — consistency inside a file beats project-wide uniformity.

The hard rules at the top are non-negotiable. The defaults below them describe the dominant pattern; deviate only with reason.

## Hard Rules

### No inline `if`

Never write a single-line `if` whose body is a statement on the same line. Always use braces, even for one-statement bodies and even when the body is `return`, `continue`, `break`, or `throw`.

```ts
// don't
if (deltas.sizeDelta) incs.size = deltas.sizeDelta;
if (!Object.keys(incs).length) return;
if (!post.groupId) continue;
if (filters[name] === 'null') filters[name] = null;

// do
if (deltas.sizeDelta) {
  incs.size = deltas.sizeDelta;
}
if (!Object.keys(incs).length) {
  return;
}
if (!post.groupId) {
  continue;
}
if (filters[name] === 'null') {
  filters[name] = null;
}
```

This applies to every form of `if` — early returns, guards, dispatch, ternary-replacement. The reasons:

- Diff noise: an inline `if` becomes a multi-line block as soon as it grows past one statement, polluting the blame and the diff.
- Reviewability: braced blocks are easier to scan and step through with breakpoints.
- Tooling: linters, prettier-style formatters, and stack traces all assume braced blocks.

The only exception is a single-expression conditional inside an expression context (`x ? a : b`, `cond && doThing()` for fire-and-forget side-effects), which is *not* an `if` statement.

### Prefer guard exits over nested positive branches

When a branch exits the current control flow (`return`, `throw`, `continue`, or `break`), put that guard first and keep the remaining code at the outer indentation level. Do not wrap the main path in a positive `if` just to fall through to an exit later.

```ts
// don't
try {
  content = await app.ms.database.addContent(contentData);
} catch (e) {
  if (isUserStorageUniqueError(e, contentData)) {
    const existsContent = await app.ms.database.getContentByStorageAndUserId(contentData.storageId, contentData.userId);
    if (existsContent) {
      await this.updateExistsContentMetadata(userId, existsContent, options);
      return existsContent;
    }
  }
  throw e;
}

// do
try {
  content = await app.ms.database.addContent(contentData);
} catch (e) {
  if (!isUserStorageUniqueError(e, contentData)) {
    throw e;
  }
  const existsContent = await app.ms.database.getContentByStorageAndUserId(contentData.storageId, contentData.userId);
  if (!existsContent) {
    throw e;
  }
  await this.updateExistsContentMetadata(userId, existsContent, options);
  return existsContent;
}
```

This applies to ordinary method guards too: validate permissions/inputs first, exit on the invalid case, then keep the real work unindented.

## Defaults

### File layout

- Module entry files use the `export default async (app: IGeesomeApp) => { ... return getModule(app, ...); }` pattern, then `function getModule(app, ...) { class XxxModule implements IGeesomeXxxModule { ... } return new XxxModule(); }`.
- Keep the primary exported/module factory and main class/module flow near the top of the file. Put small file-local helper functions, stub factories, and narrow adapter builders after the main functions/classes unless they must be hoisted for constants, types, or readability.
- Models use `export default async function (sequelize, models) { const Model = sequelize.define(...); ... return Model.sync({}); }`.
- Class methods are `async methodName(...)` with no explicit return type unless the inference is misleading; the interface in `interface.ts` carries the contract.

### Indentation

Tabs are dominant in module logic files (`app/modules/*/index.ts`, fileCatalog, asyncOperation, content, group, staticId, etc.). Two-space indentation appears in models (`app/modules/*/models/*.ts`, `app/modules/*/models.ts`), in `app/modules/database/index.ts`, in `app/modules/staticSiteGenerator/index.ts`, and in `app/index.ts`.

Default for new code:

- Match the file's existing indent if you are editing it.
- Use tabs for new module logic files.
- Use 2-space for new model files and other Sequelize definition files.

Never mix tabs and spaces in the same file.

### Quotes

Single quotes are the most common form for string literals (`'lodash'`, `'updatePostManifest'`, `'not_permitted'`). Double quotes are routinely accepted for sequelize imports and a handful of legacy strings. Either is OK; match the file. Use single quotes for new files unless you have a reason.

### Semicolons

Always present at end of statement.

### Braces

K&R / 1TBS — opening brace on the same line as the statement that introduces it. Closing brace on its own line. No Allman.

```ts
async createGroup(userId, groupData) {
  if (someCondition) {
    return null;
  }
  return ...;
}
```

### Imports

- Default-imports first: `import _ from 'lodash'`, `import debug from 'debug'`.
- Then named imports from the same package: `import {Op} from 'sequelize'`.
- Then internal modules grouped by depth (`./interface.js`, `../../interface.js`).
- `.js` extensions on relative imports because the project is ESM with `"type": "module"`.
- Lodash is imported once as `_` and the helpers in use are destructured at the top of the file: `const {extend, pick, isUndefined, some, uniqBy, clone, orderBy, sumBy} = _;`. Do not write `import {pick} from 'lodash'` — it does not match the rest of the codebase and bypasses the local destructure.

### Naming

| Kind | Convention | Example |
| --- | --- | --- |
| Variables, parameters, functions, methods | camelCase | `userId`, `getPostLocalId` |
| Classes, interfaces, enums, types | PascalCase | `GroupModule`, `IGeesomeApp`, `PostStatus` |
| Module interfaces | `IGeesomeXxxModule` | `IGeesomeGroupModule` |
| Constants (only true constants) | UPPER_SNAKE | `BATCH`, `POST_COUNT` |
| File names | camelCase, matching the export | `groupCategory.ts`, `entityJsonManifest/index.ts` |
| API error strings | snake_case | `'not_permitted'`, `'group_move_not_supported'` |
| Sequelize columns | camelCase, quoted in raw SQL | `"manifestStorageId"`, `"isDeleted"` |
| Migration filenames | `YYYYMMDDhhmmss-kebab-name.cjs` | `20260506000000-add-post-timeline-indexes.cjs` |
| Index names | `tableSubject_kind_idx` | `posts_group_timeline_idx` |

### Async + concurrency

- Prefer `await Promise.all([...])` for independent reads.
- `pIteration.forEach` / `pIteration.map` / `pIteration.some` for sequential async loops over arrays. Plain `for ... of` with `await` is also acceptable for iteration with control flow (`continue`, `return`).
- Do not write `.then(...).catch(console.error)` to silently swallow rejections in production paths. Migration files in particular must propagate errors so deploys fail loudly (see `docs/database-scalability-review.md` decision F12/F13 and contrast with the legacy `change-size-type.cjs`).
- Feature modules should not hand-roll generic `UserOperationQueue` draining loops. Put shared queue lifecycle mechanics in `asyncOperation.processModuleOperationQueue`; keep feature modules responsible for job payloads, operation labels/channels, and idempotent job execution.

### Logging

- `import debug from 'debug'` then `const log = debug('geesome:app');` for module-scoped logs.
- Use `log('eventName', ...)` for normal trace lines. Reserve `console.log` for short-lived debugging or when you specifically want unconditional stdout (currently mixed in the codebase; do not add new `console.log` statements without a reason).
- Do not build expensive debug arguments before checking whether the namespace is enabled. If a log payload reads nested object fields, maps/filters arrays, calls `toJSON()`, stringifies data, or runs a DB/read helper only for diagnostics, use `helpers.logDebug(log, () => [...])` or `await helpers.logDebugAsync(log, async () => [...])`. For array payloads, use `helpers.mapForLog(list, mapper)` so missing/non-array inputs and bad item getters do not break the caller while logging.
- Core app diagnostics such as limits, hook decisions, and static-id/object resolution should use lazy debug logs instead of stdout because those paths run during ordinary API/content requests.
- Keep broad debug namespaces out of default scripts. Test and runtime commands should be quiet by default, with tracing enabled from the caller environment when needed.
- HTTP access logging is opt-in. Use `GEESOME_ACCESS_LOGS=1` for request logs instead of registering `morgan` unconditionally in API/gateway modules.
- Known noisy dependency import-time info logs should be wrapped with `helpers.withSuppressedConsoleInfo` and stay quiet by default; use `GEESOME_DEPENDENCY_INFO_LOGS=1` when dependency fallback details are useful.
- Test-only stdout diagnostics should be opt-in through `GEESOME_TEST_LOGS=1`; the default Mocha path suppresses `console.log` so assertion output stays readable.
- Docker test runtime scripts should call the shared Mocha runner directly after model sync/migrations. Keep dependency installation and frozen-lockfile checks in the Docker image build or explicit local `yarn test` path, not in `bash/docker-test-run.sh`, so source-only Docker reruns do not replay package-manager warning output.
- SQL logging is high-volume and must stay separately opt-in: use `GEESOME_LOG_SQL=1 DEBUG=geesome:database:sql` for query traces instead of enabling SQL output through a broad default `DEBUG=geesome*`.
- Errors go through `console.error` or are thrown when they need operator attention. Expected per-request stream/client failures after response headers are already committed should clean up resources and use lazy debug logging instead of unconditional stdout/stderr noise.

### Errors

`throw new Error("snake_case_reason")`. The string is the API contract — do not change wording on existing errors without considering callers.

### Static-site SSR

- Create a fresh Vue SSR app/router for each rendered page. Cache shared render inputs, assets, and compiled styles outside page rendering, but do not reuse one Vue app across multiple `renderToString` calls because Vue stores per-render SSR context on the app.
- Use Sass namespace imports directly: `import * as sass from 'sass';` then `sass.compileAsync(...)`. Do not access `sass.default`, which re-enables Sass's deprecated default-import path warning.
- Generated static-site client files should not write incidental diagnostics to the browser console by default. Keep mounted refs, click diagnostics, and internal state dumps out of published site assets unless there is an explicit opt-in debug mode. Intentional visitor/developer-facing console messages, such as the generated-site examples banner, may stay when they are part of the product experience.

### Comments

- Default to no comment. Code with good identifiers reads itself.
- Add a one-line comment when the *why* would be invisible to a future reader: a hidden invariant, a workaround for a known bug, an interaction with an external system, or a deliberate gap.
- Reference review decisions inline only when the rule is non-obvious from the code itself (e.g. `// B4: drafts are DB-only`). Do not paraphrase the review decision in long comments — keep the link short and let the doc carry the prose.
- Do not write comments that explain the next line of code. Do not narrate diffs (`// added in PR #123`).

### Sequelize patterns

- Models live in `app/modules/<module>/models/*.ts` (or a single `models.ts`).
- Indexes are declared in the model options alongside `sequelize.define(...)`. For brand-new tables and unreleased dev-only model-sync table iterations, do not add migrations just to carry temporary table, column, or index changes while the work is merging to `dev`; `Model.sync({})` owns that pre-release shape. Add migrations when changing tables that have reached production/stable release, when promoting a release that must upgrade existing deployed tables, adding indexes/constraints to existing production data, doing cleanup/backfills, or changing column types/defaults. When both a model definition and a migration touch the same released schema shape, both sources must agree.
- Put model-table-specific raw SQL in the model file as a named model helper/static method, then call that helper from module logic. Module entry files should orchestrate business flow, permissions, TTLs, hooks, encryption/decryption, and result shaping; they should not embed long CTE/update statements for one table.
- Migrations target Postgres only and run `CREATE INDEX CONCURRENTLY IF NOT EXISTS` (and matching `DROP INDEX CONCURRENTLY IF EXISTS` in the `down`). Migrations that use `CONCURRENTLY` set `useTransaction: false` and never wrap statements in `.catch(() => {})`.
- Use `Model.increment({col: delta}, {where: ...})` for atomic counter writes; do not read-modify-write.
- Bulk inserts in migrations and seed scripts use raw SQL with `:replacement` placeholders rather than `bulkCreate`, both for speed and to keep the migration legible.
- Do not inline repeated ID cleanup/deduplication in module methods. Use `helpers.normalizeUniqueIds(ids)` for generic numeric ID arrays or scalars instead of hand-rolling `filter`/`Number(...)`/`uniqBy` chains.

### Tests

- New tests go under `test/` mirroring the module path. Run via `npm run test:docker` (full suite, Postgres + IPFS + ffmpeg) or `yarn test` for a quick local run when the host already has the prerequisites.
- For new database-related work, add a focused test that uses the same Sequelize models as production rather than mocking — see the AGENTS.md note about tests-vs-mocks.

### What goes in `docs/`

`docs/` is gitignored at the repo level, but every file checked in there is force-added. The directory holds reference material that should ride with the source: review docs, generated inventories, code-style guides, manifest examples. Treat it as committed reference material; do not put runtime artifacts there unless they are explicitly gitignored at a higher level (e.g. `database-scalability-explain.md`).

## Where this doc lives

- This file: `docs/code-style.md`.
- Linked from `AGENTS.md` so other tooling and contributors pick it up automatically.
