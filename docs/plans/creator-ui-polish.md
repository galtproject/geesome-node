# Creator UI polish

## Contents

- [Contract](#contract)
- [Workstreams](#workstreams)
- [Validation and rollout](#validation-and-rollout)
- [Execution](#execution)

## Contract

Tracking [#1466](https://github.com/galtproject/geesome-node/issues/1466); producer [#753](https://github.com/MicrowaveDev/microwave-girls/issues/753). Apply the approved compact-card,
footer, Patreon and circular platform-icon treatment to new directory snapshots. Preserve
legacy snapshots/reference behavior, author records, entitlement/payment flows,
full-image framing, relative IPFS links and navigation direction. Format only
exact domain/timestamp technical titles as a date; arbitrary titles remain intact.
Public displayTitle is independent of private group naming, optional for old data.

## Workstreams

1. GeeSome settings/rendering: optional bounded displayTitle stored in existing
   branding JSON, old group-title fallback; new creator component/style polish.
2. Microwave Girls producer: fill missing displayTitle on explicit Prepare and
   replace only the known byte-identical blank Bluesky asset via raw IPFS upload.
   Depends on 1; retain custom and unavailable icon references. No production writes.
3. Verification: public/full, desktop/mobile, JS/no-JS, meaningful/technical/long
   titles, missing images, expanded social links, focus and modal/account states.
   Main implementer owns integration and handoff; no new delegation required.

## Validation and rollout

Run focused branding/icon tests, strict Vue types, membership SQL/HTTP/payment
suite and generated-browser flows. Review affected captures. Update API docs,
security/scalability inventories. Commit/push each repo; open GeeSome PR to dev,
Microwave Girls directly to dev. Never merge. Deploy GeeSome before the producer,
then explicit Rebuild snapshots; existing immutable CIDs remain unchanged.

## Execution

- Plan recorded before implementation. Group/post data will not be renamed.

- User steering: use platform-coloured circular icons without extra grey frames, following the supplied reference; preserve the sidebar layout and existing links.

- Sidebar critique applied: three stable columns across the support card, labels
  for touch users, a quiet disclosure, a raw-IPFS Patreon symbol and no duplicate
  Patreon entry in expanded mode. Preserve the shape of custom icon images;
  remove hostname-based styling. Hydration handles images that failed before Vue
  attached its error listener.
- Verified: strict Vue types; 41 membership SQL/HTTP/Kubo cases and 56 payment
  cases; 94 generated browser captures across desktop/mobile, public/full and
  JS/no-JS. Grid cases 3/5/6/7, long/custom labels and failed images are covered.
  Inspected profile, compact/expanded links, fallback, card and archive captures.
  API docs and security/scalability inventories passed without tracked changes.
- Producer: 107 membership tests and the media helper test passed. Docker
  resource-binding first pass: 2 cases and 14 mapped captures; final source rerun
  is in progress. Backend must deploy before producer, then explicit Rebuild.
- New user steering (2026-10-29): direct membership and Patreon are alternative
  subscriptions to nearly the same archive. Direct crypto is cheaper. Requested
  a separate critique of CTA placement/copy. Do not promise future site-exclusive
  content or invent Patreon prices, account linking or entitlement equivalence.
  Pricing presentation is pending that review, separate from payment behavior.
