# Restricted HTML shell

## Contents

- Contract
- Workstreams
- Verification
- Evidence and backlog

## Contract

User-approved HTML structure with trusted slots, no executable templates or arbitrary CSS. Keep creator/1 default and existing public/full projection. Login/payment dialogs remain outside owner markup. No deployment, block editor or preview UI.

## Workstreams

1. Shared grammar and settings validation: bounded HTML parser, closed tags/attributes/classes/slots, text placeholders, typed asset URLs. Output html-shell/1 manifest; complete when adversarial inputs reject and roundtrip works.
2. Renderer (depends on 1): render checked AST as VNodes with platform slots, SSR and browser share semantics; keep existing default byte/visual behavior and session handlers. Scope creator renderer and fixed utilities.
3. Verification/docs (depends on 1–2): settings integration, SSR browser JS/no-JS, navigation, checkout, public/full isolation; document exact API/example and no-editor workflow. Single agent owns integration/push. Unit validation and documentation can proceed independently after grammar frozen.

## Verification

Presentation tests, creator types, membership Docker integration, browser regression including owner-shell fixture, API docs and route/scalability inventories.

## Evidence and backlog

Implementation and verification complete; commit/push and PR handoff tracked by #1470. Editor and preview explicitly deferred. Unsupported versions/unknown input must fail before saved publication changes. Templates are parsed as HTML and converted to a restricted tree, never passed to Vue compiler or injected via innerHTML. Trust boundary covers code/session access, not honesty of author text/links.


### Implementation notes

- Added creator/1-compatible template union and html-shell/1 source in the existing resource JSON. Source edits invalidate existing publication inputs; no migration/new worker.
- Maintained parse5 parser is now a direct dependency at the already-locked 7.1.2 version. The offline package-install attempt hit a pre-existing missing font-awesome cache entry; runtime/type/browser verification uses the installed locked version. No dependency version upgrade or new transitive package was needed.
- Validation covers exact source-token spans as well as AST nodes: parse5 silently discards some document/end tags, so checking the AST alone was insufficient. Added adversarial regressions and CRLF coverage. Max source 32,768 UTF-16 units, 512 nodes, depth 24.
- Fixed classes are mapped to reserved shell classes; owner links/images use their own classes so utility styles cannot accidentally restyle trusted social/account links. Dialogs remain outside the owner subtree. Source is data rendered with VNodes, never compiled as Vue.
- Extracted trusted layout composition into CreatorLayout; App defines each trusted block once for both renderers. Normalized presentation is passed to blocks even for partial input. Default creator layout/handlers preserved.
- Literal IPFS assets are validated as genuine CIDs, retained as artifacts, and never recursively enumerated/copied. Private content still selected before rendering. Source and source literals are public; no private substitutions or URL concatenation.
- Owner settings errors preserve the saved manifest/revision and return a bounded reason and field for source validation failures.
- Browser fixture uses mock authentication for shell login; it does not depend on live Google to check modal isolation. Added a custom-shell crypto checkout with the real trusted component and mocked API invoice.
- One browser pass failed solely on 65 mobile gallery raster pixels (max channel delta 2, no material differences) against the existing strict threshold; rerun without relaxing assertions. An earlier new test used the wrong address selector; corrected to the component's existing crypto-address test ID.

- Added a 32-substitution limit: source/node limits alone do not bound repeated expansion of a long site description. Owner layouts can reference each trusted slot once; dynamic text expansion is separately bounded. Current shared client bundle measures 498,361 raw / 163,187 gzip bytes (before adding this small limit); parsing support is bundled for SSR/client agreement.

- The final browser rerun exposed unbounded test-side image.decode waits on lazy images in custom layouts. Capture now explicitly loads images eagerly and fails after 10 seconds with the source if decode stalls; broken-image and pixel-parity assertions are unchanged. Only the stuck task-owned ephemeral browser container was removed.

### Final evidence

- `npm run test:creator-membership:docker`: 50 PostgreSQL/HTTP/Kubo cases and 56 payment cases passed (`/tmp/html-shell-integration-final.log`).
- Focused HTML-shell/presentation/snapshot/shared-branding suite: 25 passed (`/tmp/html-shell-unit-final.log`); strict creator Vue types passed.
- `npm run test:ssg-membership-browser`: 122 captures verified, strict legacy pixel parity unchanged, desktop/narrow and JS/no-JS, custom-shell crypto invoice/address/modal isolation (`/tmp/html-shell-browser-final.log`). Inspected desktop/mobile owner-shell views and mobile checkout capture.
- API doc generation, security route inventory update/check, database scalability inventory update/check and `git diff --check` passed. No inventory drift required additional source changes.
- Source example and API instructions delivered. No deployment/rebuild, migration, editor or preview UI. Dependent PR #1469 must land before this feature; #1467 is already merged.
