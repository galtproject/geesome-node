# Creator-site theme

The public interface is ported from microwave-girls at 99a6b4a5:

- frontend/public/app.ts, media.ts and style.css
- frontend/components/Membership/CryptoCheckout.ts, crypto.ts and api.ts

Keep the existing screens and controls intact. The differences are at the data
boundary: `api.ts` maps calls to site-bound GeeSome endpoints, Google obtains its
nonce from the challenge API, and snapshot mode navigates immutable post/page/
account files. Pending invoice details are recovered from GeeSome's invoice
endpoint before another receiving quote is created. Native text/video/file
attachments render in the complete post; previews retain the existing gallery.

The CSS is served directly, without Sass rewriting its colors. `style.css` keeps
the source stylesheet plus rules for native video/file attachments. Normal GeeSome
sites continue to use the ordinary templates and Sass stylesheet.

The production bundle is self-contained. Building or serving it does not require
a microwave-girls checkout. The optional comparison harness deliberately requires
the sibling microwave-girls repository, renders its actual UI as the reference,
and compares both versions on identical data at desktop and narrow widths.

Run `npm run test:ssg-membership-browser`. It checks all original screens, signed-in
and paid transitions, pending invoice recovery, retained full content, logout,
immutable pagination, a second creator and missing optional branding. Each screenshot
has a manifest description. No screenshot regions are masked; dimensions must
match and fewer than 0.01% pixels may differ, by at most 5/255 per color channel,
to allow browser raster rounding on antialiased borders and gradients.

Do not update baselines to hide missing controls or layout differences. Review
`test/.geesome-test-output/membership-browser/parity.json` and paired captures.
The old reader frontend remains available during rollout; retire it only after
production subscriber access and the themed snapshot entry have been verified.

Social icons are ordinary uploaded content, provided by the publishing application
as each link's `iconUrl: /ipfs/CID`. The renderer accepts only that root-relative
IPFS form and contains no bundled social-image binaries or host-to-icon registry.
MicrowaveGirls uploads its existing source icons before snapshot preparation, then
reuses the saved CIDs. Published icon CIDs are retained with snapshot artifacts.

## Vue structure

`App.vue` composes post, account, socials, gallery, dialog, plans and checkout SFCs.
Each uses `<script setup lang="ts">` and a declarative template. Session/access
orchestration lives in `useMembershipSession`, dialog focus/keyboard/scroll cleanup
in `useMembershipModal`, and quote recovery/polling/idempotency in
`useCryptoCheckout`. Account data is normalized once before entering UI state.
The snapshot client never fetches a mutable feed; pagination and access selection
navigate the immutable snapshot or the existing site entry endpoint.

`vueCompiler.js` is shared by the in-memory server bundle (`creatorRenderer.js`)
and the browser bundle. Both compile the same render functions. SSR shares the
existing Vue runtime; each render creates its own component state. Compilation
promises are reused and reset on errors; no build output is committed or written
to the deployed source tree. The compiler matches Vue 3.5.13; TypeScript resolves
imported prop types. Native group-site templates keep their existing renderer.

Run `npm run test:ssg-creator-types` for strict TypeScript/template checks.
`test/creatorMembershipVue.test.ts` mounts the real payment composable to verify
pending-invoice recovery, key reuse after a lost response, asset-change keys,
poll cleanup and ignored late responses. The browser comparison remains the
source of truth for layout, controls, SSR/hydration and reader workflows.
