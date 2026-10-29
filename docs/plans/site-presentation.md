# Owner-defined site presentation

## Contents

- [Contract](#contract)
- [Workstreams](#workstreams)
- [Verification and delivery](#verification-and-delivery)
- [Execution](#execution)
- [Backlog](#backlog)

## Contract

The owner configures a versioned data manifest, not executable templates. Node
keeps neutral trusted blocks, publication/storage, public/full projections,
sessions and payment APIs. Brand colors, external membership providers, promotions
and editorial claims belong to the owner's manifest. Preserve the current design
using a Microwave Girls preset; no production mutations or PR merges.

## Workstreams

1. Node schema/settings/publication: bounded allowlists, canonical defaults,
   settings-version checks, omission compatibility, invalidation and cached output.
   Scope: presentation schema, membership settings and shared SSG normalization.
2. Node renderer: closed regions/blocks, safe style tokens, neutral components,
   configurable editorial copy/external offers. No dynamic imports, raw HTML,
   CSS, JS, dependencies or component URLs from settings. Actual checkout
   amounts, receiving addresses, periods and account state remain system-owned.
   Depends on 1; complete when the current design is data-driven.
3. Producer preset: preserve existing custom node settings; fill missing manifest
   on explicit Prepare; attach uploaded icons. Scope: Microwave Girls membership
   publisher/preset/tests/docs. Depends on Node API; do not overwrite custom data.
4. Verification: schema rejection/adversarial tests, owner/settings/invalidation,
   public/full artifact retention and cache reuse, generated browser desktop/mobile
   with alternate layouts, themes, guest/active/expired and payment flows.
   Source/data-only stages may be independently checked; one agent integrates.

## Verification and delivery

Backend first, producer second, explicit Prepare/Rebuild afterward. No model
migration or new env variables. Normalized presentation enters publication input
and cache fingerprints; old immutable CIDs stay unchanged. Continue from PR1467
but use a separate feature branch/PR for this architecture change, depending on
that work. Commit producer to dev. Do not stage unrelated concurrent changes.

## Execution

- Schema work started with existing `resources.data`, settings version/owner
  locking and publisher lifecycle. No custom renderer execution is introduced.
- Existing generic SSG options can validate/store the same manifest; its existing
  HTML/CSS options are not promoted into the safe membership renderer.

## Backlog

- Block editor UI and live/preview UI: explicitly deferred by the user. Ship API
  configuration and producer presets first.
- Arbitrary custom renderers: a separate trusted-plugin or isolated-origin design;
  out of scope. Manifest CID import/export can be added without executing code.

### Implementation and evidence

- Tracking: GeeSome #1468 and Microwave Girls #754. The backend branch depends on
  the still-open creator polish PR #1467; no shared history was rewritten.
- Added canonical creator/1 manifest validation, trusted token-to-CSS conversion,
  closed layout regions and neutral defaults. Required account/feed/navigation
  blocks cannot be removed or duplicated through configuration. Optional external
  offer is data; the legacy patreonUrl is only a compatibility alias.
- Marketing/palette preset and resource accent choice now live in Microwave Girls.
  Saved node presentation wins over a local preset; explicitly configured local
  presentation wins over the fallback when the remote site has none. Icons are
  attached after existing raw uploads. No arbitrary asset fetch or code execution.
- Verification so far: 45 integration cases with PostgreSQL/HTTP/Kubo and 56
  payment cases passed; 9 schema/shared-normalization tests and strict Vue types
  passed. Producer membership suite: 109 passed. Resource-binding first Docker
  pass: 2 cases, 14 mapped desktop/narrow captures; final assertion rerun also passed with the sent manifest independently verified.
- Browser fixtures use the actual producer preset and exercise independent light
  single-column/custom-order and neutral sites. They now reject hidden failed
  image placeholders as well as broken visible images. A fixture-only missing
  media copy was fixed; the publication renderer was not changed for that failure.
- A concurrent Docker build caused a screenshot compositor timeout in the broad
  browser run. The isolated rerun passed; no app timeout or security checks
  were relaxed. No production services were accessed or changed.

### Final backend verification

- Full browser run passed with 116 mapped captures, including legacy pixel
  comparisons and the actual producer preset on modern snapshots. Inspected
  preserved desktop/mobile, neutral no-JS and independent light-theme examples.
- Current strict Vue types and 21 focused render/schema/shared-option checks
  passed, including literal script-like copy escaping. The final PostgreSQL,
  HTTP and Kubo suite passed 45 cases; all 56 payment cases passed again.
- Editor and draft preview are recorded under `site-presentation-editor` in
  docs/todo.md, not implemented. API configuration is documented separately.
- A light palette does not recolor uploaded image assets: owners must choose
  suitable logo variants. This is an asset choice, not permission to inject CSS.

- Final focused browser pass: 58 captures after the bounded preview-size enum was
  added; strict Vue types and all 21 focused checks still passed. The actual
  producer Docker flow passed both cases and verified its manifest payload with
  14 mapped captures. The producer suite passed 109 tests. Backend and producer
  changes are ready for commit/PR handoff; deployment remains user-owned.
