# Owner HTML shell

## Contents

- Storage and API
- Editable source
- Grammar
- Rendering and security
- Publishing and compatibility
- Verification and backlog

## Storage and API

The editable source belongs to a resource, not the node's source tree. It is
stored in existing `membership_resources.data.presentation.template.html` JSONB.
Use the owner/key-authorized `POST /api/v1/membership/admin/:resource/site`
settings endpoint with its current `version`. Other required settings fields are
unchanged; start with GET of the same endpoint. Conflicts return 409. Invalid
HTML returns 400 `membership_presentation_invalid` before a setting is saved,
with `field: "presentation.template.html"` and a bounded `reason` code (for
example `unknown_placeholder`, `tree_limit_exceeded`, or `missing_slot_posts`).
Omitting presentation preserves it; `{schemaVersion:1}` resets to creator/1.
No new table, worker, environment variable or file store is needed.

```json
{
  "schemaVersion": 1,
  "template": {
    "id": "html-shell",
    "version": 1,
    "html": "<header class=\"row\"><geesome-slot name=\"brand\"></geesome-slot><geesome-slot name=\"account\"></geesome-slot></header><geesome-slot name=\"profile\"></geesome-slot><main class=\"grid sidebar-left\"><aside><geesome-slot name=\"membership\"></geesome-slot></aside><section><geesome-slot name=\"posts\"></geesome-slot><geesome-slot name=\"pagination\"></geesome-slot></section></main><geesome-slot name=\"footer\"></geesome-slot>"
  },
  "theme": {"accent":"#a21caf","radius":"rounded"}
}
```

This is the presentation field within a settings request, not a complete request.
The same API response/public resource DTO returns the source. It is public,
including in public snapshots: paid text and links belong in private post Content,
not literal template markup.

## Editable source

Copy `examples/creator-shell.html`, edit it as a local text file, and submit its
contents as `presentation.template.html`. For example, after GET returns the
complete current settings object in `settings.json`:

```sh
jq --rawfile html examples/creator-shell.html \
  'del(.id,.origin,.groupId,.ownerId) | .presentation = ((.presentation // {schemaVersion:1}) + {template:{id:"html-shell",version:1,html:$html}})' \
  settings.json > updated-settings.json
```

Send the settings body with your existing authorized client, then Prepare/Rebuild.
The normal settings-field allowlist still applies; an API client must send the
mutable settings fields rather than blindly echoing read-only fields from GET.
No visual editor or preview UI is required.

## Grammar

This is a deliberately limited HTML fragment, not a complete HTML document:

- Tags: `div section header footer main aside nav h1 h2 h3 p span strong em br a img`
  and `geesome-slot`. Non-void elements require explicit matching end tags.
  Browser repairs/implicit closes, comments, documents and foreign namespaces reject.
  Use `&lt;` for a literal less-than sign in text.
- Slots: `brand account cover profile membership social-links posts pagination footer`.
  Each may appear once. All except `cover` and `social-links` are required.
  Slots must be empty and use only `name`; they belong in structural containers,
  never links, headings, paragraphs or attributes. Account pages use the posts
  slot for the trusted account panel; links-only mode suppresses posts/payments.
- Classes: `container grid sidebar-left sidebar-right single-column stack row
  gap-sm gap-md gap-lg panel text-muted text-center`. The renderer maps them to
  reserved `shell-*` classes. Grid order follows HTML order; narrow screens stack
  both columns. A right-sidebar template must place feed first and sidebar second.
  Classes control fixed layout/spacing only; no hiding, overlays or positioning.
- Attributes: `class title` on ordinary elements, `href` on `a`, `src alt` on `img`.
  An image requires alt (empty is allowed). A link requires href. The system sets
  image lazy-loading and link rel. IDs, data attributes, styles, event handlers,
  Vue directives, forms, embeds, SVG/MathML and script/style elements reject.
- Text/title/alt placeholders: `{{site.title}}` and `{{site.description}}`.
  They become escaped text, never markup or recursive expressions.
- Image src: a literal `/ipfs/<valid-CID>/optional/path` or exactly
  `{{site.avatarUrl}}` / `{{site.coverUrl}}`. Missing branding omits that image.
  Literal IPFS path segments accept ASCII letters, numbers, dot, underscore,
  tilde and hyphen; dot/dot-dot traversal segments are forbidden.
- Link href: literal credential-free HTTPS or a literal IPFS path as above.
  No URL concatenation or dynamic/private URL placeholders. Source assets must
  already be published; no arbitrary remote image fetching is introduced.
- Limits: 32,768 UTF-16 source units, 512 nodes, nesting depth 24, title/alt 500
  units; at most 32 text/attribute substitutions per source to bound expansion.
  Unknown tokens/attributes, duplicate slots/attributes and control bytes reject.

Existing theme/copy/membership options still configure trusted components.
For html-shell/1, region-order arrays/columns are superseded by HTML structure;
footer block choices, shape, density, preview size and theme remain applicable.

## Rendering and security

A maintained HTML parser (`parse5`) creates a tree. Validation reduces it to
allowlisted text/elements/attributes/slots. The server and client render these
nodes with Vue runtime VNodes and escaped text. No owner input enters a Vue
compiler, executable module, eval, raw HTML insertion or component import.
The same Vue blocks handle actual posts, prices, entitlement and invoice state.
Login, gallery, refund and payment dialogs are outside the owner subtree.
No template field can supply credentials, receiving addresses or handlers.

This protects the code/session boundary; it cannot guarantee honesty of author
copy or external destinations. Arbitrary owner HTML/CSS/JS would need a separate
origin/trusted checkout architecture and is not enabled here. Shadow DOM or a
separate IPFS path would not provide that security boundary.

## Publishing and compatibility

Public/full content is selected before rendering. Templates do not receive raw
posts with both projections, sessions or private URL placeholders. Normalized
presentation including version/source participates in existing publication/cache
inputs; theme changes CSS. The compiled component bundle is the same trusted
code for both renderers, so its singleton cache remains valid. Owner HTML is
parsed as data, not cached executable code.

Literal shell asset CIDs are retained as publication artifacts without directory
walking. Ready HTML, CSS and client assets are published with the existing atomic
public/full pair. An edit requires a new build and CID; previously issued CIDs
remain unchanged/readable. Existing creator/1 stays the default and old clients
preserve owner settings when they omit presentation. Deploy backend support before
sending html-shell/1; an older backend rejects this version instead of executing it.

## Verification and backlog

Validator adversarial tests, SSR public/full escaping, actual owner settings API,
and desktop/narrow browser JS/no-JS cases cover the contract. The default creator
layout retains its existing regression/parity suite. Results are in the task plan.
Block editor and preview UI remain explicitly backlog.
