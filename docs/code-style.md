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

### Logging

- `import debug from 'debug'` then `const log = debug('geesome:app');` for module-scoped logs.
- Use `log('eventName', ...)` for normal trace lines. Reserve `console.log` for short-lived debugging or when you specifically want unconditional stdout (currently mixed in the codebase; do not add new `console.log` statements without a reason).
- Errors go through `console.error` or are thrown.

### Errors

`throw new Error("snake_case_reason")`. The string is the API contract — do not change wording on existing errors without considering callers.

### Comments

- Default to no comment. Code with good identifiers reads itself.
- Add a one-line comment when the *why* would be invisible to a future reader: a hidden invariant, a workaround for a known bug, an interaction with an external system, or a deliberate gap.
- Reference review decisions inline only when the rule is non-obvious from the code itself (e.g. `// B4: drafts are DB-only`). Do not paraphrase the review decision in long comments — keep the link short and let the doc carry the prose.
- Do not write comments that explain the next line of code. Do not narrate diffs (`// added in PR #123`).

### Sequelize patterns

- Models live in `app/modules/<module>/models/*.ts` (or a single `models.ts`).
- Indexes are declared in the model options alongside `sequelize.define(...)`. For brand-new tables, do not add a migration only to create the table or its initial indexes; `Model.sync({})` owns that creation path. Add migrations when changing existing tables, adding indexes/constraints to existing data, doing cleanup/backfills, or changing column types/defaults. When both a model definition and a migration touch the same existing schema shape, both sources must agree.
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
