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
  also passed (2 cases, 14 mapped captures). Backend must deploy before producer, then explicit Rebuild.
- New user steering (2026-10-29): direct membership and Patreon are alternative
  subscriptions to nearly the same archive. Direct crypto is cheaper. Requested
  a separate critique of CTA placement/copy. Do not invent Patreon prices, account linking or entitlement equivalence;
  use the author’s exclusive-content launch clarification below.
  Pricing presentation is pending that review, separate from payment behavior.

- User clarification: preserve the existing site-exclusive checkout benefit. The
  site is not publicly launched and the author will prepare exclusives before
  launch. No checkout benefits were removed. CTA recommendation for the next
  iteration: group direct crypto membership (lower price + additional content)
  and Patreon as alternatives under the profile, with one social-links view.
  Other is only fixture data, never a built-in mandatory social action. Show links
  currently remains functional; removing this duplicate view is a recommendation
  pending the user's implementation instruction.
- Integrated the existing pagination-alignment feature branch to avoid handing
  the user overlapping stylesheet conflicts. Retain distinct profile and bottom
  navigation captures; this does not merge either PR into dev.

- Post-integration focused browser run passed with 44 mapped captures, including
  the sole Older link on the home page and footer return navigation.

- Delivery: backend PR #1467 targets dev; producer commit 4dc6e67d is on dev.
  Deployment remains GeeSome first, then Microwave Girls, then explicit Rebuild.
  The hub pointer is left untouched because unrelated concurrent producer edits
  keep that checkout dirty; no production update or PR merge was performed.

## Membership choice follow-up (2026-10-29)

User approved implementation of the reviewed alternatives and a diagonal
EXTRA CONTENT / LOWER PRICE ribbon for direct membership. Continue PR #1467 and
issue #1466. Scope: creator Vue components, styles and generated-browser evidence;
no producer/API/payment changes. Preserve existing exclusive-content benefits.

- Render one profile choice block: direct price/period from options, crypto
  explanation, secondary Patreon link and separate-subscriptions clarification.
- Move Patreon out of the polished social sidebar; remove duplicate disclosure
  while retaining every real non-Patreon link and its actual label.
- Preserve legacy rendering. Active direct members see My membership; renewal
  and unavailable payment states remain explicit. Missing Patreon omits comparison.
- Verify desktop/mobile and JS/no-JS, full/public, active/expired/unavailable,
  no-Patreon and custom links. Inspect real generated screenshots, then commit,
  push and update the existing PR. No deployment or PR merge.

### Final design decisions

The user simplified the first preview: remove repeated explanations and restore
Patreon's coral fill, with equal button prominence. Move the entire choice block
into the left sidebar above socials on desktop; posts start alongside it. Mobile
keeps the same sidebar order above the feed. The direct card contains only Pay
with crypto, its configured price/period CTA and the diagonal two-line advantage
ribbon. Active membership retains its access date; unavailable purchases remain
disabled. Legacy snapshots keep their old controls and theme.

Implementation uses a focused MembershipChoice Vue component. Modern social
links have labels and one permanent view; the legacy disclosure is retained only
for legacy snapshots. A real custom link is never removed as Other; the fixture
now calls its actual example destination Portfolio. Links-only mode retains
Patreon even though the direct-membership component is absent.

Verification: strict Vue types passed; the full generated browser suite passed
with 104 mapped captures before the final sidebar relocation. A focused run of
46 captures passed after relocation, including left/right alignment, public/full,
JS/no-JS, 3/5/6/7 socials, failed images, no Patreon, unavailable purchases and
active/expired membership. Inspected desktop/mobile compact profiles and active
membership. Checkout explicitly names crypto and this site; its approved
exclusive-content benefit is preserved. Final focused run passed with 50 mapped captures, including links-only mode
with its retained Patreon link and no direct purchase offer.
No API, payment accounting, producer, database or environment changes in this
follow-up. Continue the existing PR #1467; no deployment or merge.
