# GeeSome Rich Text Content Format

Status: design note with the first helper slice implemented in `app/richText.ts` and ActivityPub local post serialization wired to render canonical rich-text payloads. Native post storage, editor integration, and broader protocol wiring remain future work.

## Decision

GeeSome should not use raw HTML as the canonical source format for user post text.

The canonical post-text format should be a small, versioned, semantic rich-text document. HTML is still needed, but only as an adapter/rendering output for ActivityPub, Matrix, static sites, admin previews, and legacy clients. Protocols that do not use HTML as their source format should receive plain text plus structured annotations.

## Why

Raw HTML is a rendering format, not a stable social-content model. It is difficult to validate consistently, unsafe to render without sanitizer discipline, awkward to migrate, and poorly matched to protocols such as ATProto, Farcaster, and Nostr-style plaintext events.

A typed document keeps the important user intent:

- text blocks and inline formatting;
- links, mentions, hashtags, and spoilers as structured marks;
- attachments as content-addressed references;
- deterministic rendering into each protocol's preferred representation.

It also fits GeeSome's IPFS/IPLD direction better than arbitrary HTML. A compact structured object can be encoded as JSON now and as DAG-CBOR/IPLD later without changing the logical schema.

## Goals

- Keep user-authored post text portable across ActivityPub, Matrix, ATProto/Bluesky, Farcaster, Nostr-like protocols, static sites, and GeeSome clients.
- Make every renderer escape text by default and explicitly opt into safe marks/tags.
- Preserve attachment identity by `storageId` instead of embedding large bytes or remote HTML.
- Keep v1 deliberately small so import/export tests can cover the whole format.
- Allow migration from legacy `text/html` post contents without trusting the original HTML.

## Non-Goals

- Do not build a full page-layout or WYSIWYG editor schema in v1.
- Do not support arbitrary `style`, `class`, `iframe`, `script`, SVG, forms, event handlers, or raw HTML nodes.
- Do not make ActivityPub/Matrix HTML the source of truth.
- Do not add database migrations only for this design note.

## MIME Type

Preferred canonical payload MIME type:

```text
application/vnd.geesome.rich-text+json
```

During rollout, legacy clients can continue writing `text/plain` or sanitized `text/html`. New rich-text-aware clients should write the canonical JSON payload and optionally keep derived HTML/plain-text caches where existing render paths require them.

## Canonical Document V1

The v1 object is JSON-compatible and should remain DAG-CBOR-friendly:

```json
{
  "type": "geesome.richText",
  "version": 1,
  "lang": "en",
  "blocks": [
    {
      "type": "paragraph",
      "children": [
        {"text": "Hello "},
        {"text": "GeeSome", "marks": [{"type": "strong"}]},
        {"text": " "}
      ]
    },
    {
      "type": "paragraph",
      "children": [
        {
          "text": "Follow the project",
          "marks": [
            {
              "type": "link",
              "href": "https://example.com/geesome",
              "title": "GeeSome project"
            }
          ]
        }
      ]
    },
    {
      "type": "attachment",
      "storageId": "bafy...",
      "mimeType": "image/png",
      "alt": "Screenshot of the published post"
    }
  ],
  "source": {
    "protocol": "activitypub",
    "objectId": "https://remote.example/users/alice/statuses/1"
  }
}
```

### Top-Level Fields

| Field | Required | Notes |
| --- | --- | --- |
| `type` | yes | Must be `geesome.richText`. |
| `version` | yes | Integer schema version. First version is `1`. |
| `lang` | no | BCP-47 language tag when known. |
| `blocks` | yes | Ordered block list. Empty documents should use `[]`. |
| `attachments` | no | Optional attachment metadata list when attachments are referenced separately from inline blocks. |
| `source` | no | Optional remote/import provenance. Never used as a trust shortcut. |

### Block Types

V1 should allow only these block types:

| Type | Fields | Render Meaning |
| --- | --- | --- |
| `paragraph` | `children` | Normal text paragraph. |
| `blockquote` | `children` | Quoted text block. |
| `codeBlock` | `text`, optional `language` | Preformatted code. Text is escaped. |
| `list` | `ordered`, `items` | Ordered or unordered list. Items contain child blocks or inline children. |
| `listItem` | `children` | Internal list item block. |
| `lineBreak` | none | Explicit break when needed inside imported content. |
| `attachment` | `storageId`, `mimeType`, optional `alt`, `title`, `size`, `width`, `height` | Content-addressed media/file reference. |

### Inline Text And Marks

Inline content is text-first. Text nodes may carry marks:

```json
{"text": "example", "marks": [{"type": "em"}]}
```

Allowed marks:

| Mark | Fields | Notes |
| --- | --- | --- |
| `strong` | none | Bold/strong emphasis. |
| `em` | none | Italic/emphasis. |
| `code` | none | Inline code. Text is escaped. |
| `strike` | none | Strikethrough. |
| `spoiler` | optional `summary` | Render as supported by the target; degrade to text. |
| `link` | `href`, optional `title` | Only safe protocols are allowed. |
| `mention` | `id`, optional `name`, `protocol`, `href` | Actor/user reference. |
| `hashtag` | `name`, optional `href` | Tag name without `#` preferred. |

Link `href` should allow only these protocols unless a future adapter explicitly adds more:

- `http`
- `https`
- `ipfs`
- `ipns`
- `mailto`

Protocol-relative URLs and scriptable protocols such as `javascript:` must be rejected during import and rendering.

## Normalization Rules

Writers and importers should normalize documents before saving:

- remove empty text nodes unless they are the only child needed to preserve an intentionally empty block;
- merge adjacent text nodes with identical marks;
- sort marks in a deterministic order;
- trim unsupported attributes from marks and blocks;
- validate attachment `storageId` values before linking them to post content;
- cap text length, block count, mark count, and nesting depth according to API limits;
- preserve source provenance separately from rendered text.

Do not rewrite user-visible whitespace aggressively. Protocol exporters can collapse or wrap text according to their target rules.

## Storage And IPLD Shape

The canonical payload can start as JSON stored through the existing content pipeline. The shape should remain compatible with deterministic DAG-CBOR later:

- no functions, dates, undefined, NaN, or cyclic structures;
- integer `version`;
- arrays for ordered content;
- strings for protocol IDs and storage IDs;
- small metadata maps with stable known keys;
- attachment bytes stored as separate content-addressed objects, referenced by `storageId`.

If this becomes an IPLD object, `storageId` fields can later become typed links where the surrounding manifest format supports them. The logical schema should not depend on whether the current transport stores it as JSON text, DAG-JSON, or DAG-CBOR.

## Import Pipeline

### Inbound HTML

Inbound ActivityPub/Matrix/legacy HTML must follow this order:

1. Parse HTML with a real parser.
2. Remove blocked elements and attributes with a conservative allowlist.
3. Reject unsafe URL protocols.
4. Convert allowed structure into the canonical rich-text document.
5. Store the original remote object only as remote-source/audit data.
6. Render future previews from the canonical document or sanitized derived output, never from original remote HTML.

HTML tags that have no canonical equivalent should be unwrapped or dropped. For example, `<span style="color:red">text</span>` becomes plain `text`; `<iframe>` is removed; `<script>` is removed.

### Inbound Plain Text

Plain text imports should become paragraph blocks. Optional link/mention/hashtag detection may add marks only when the importer can do so deterministically and safely.

### Inbound Protocol Facets

ATProto/Farcaster/Nostr-style imports should preserve protocol-specific IDs in `source` and convert facets/tags/mentions into canonical marks. Byte offsets from the source protocol must be validated against the decoded text before conversion.

## Export Adapters

Adapters should be pure functions from canonical rich text to target representation.

| Target | Output |
| --- | --- |
| ActivityPub | Sanitized HTML `content`, plain text summary/fallback when useful, ActivityStreams `tag` objects for mentions/hashtags, `attachment` objects for media. |
| Matrix | Plain `body` plus `formatted_body` with `format: org.matrix.custom.html`; HTML from the same conservative renderer. |
| ATProto/Bluesky | Plain `text` plus facets for links, mentions, and tags. Unsupported marks become plain text. |
| Farcaster | Plain text plus mentions, mention positions, and embeds. Unsupported marks become plain text. |
| Nostr-like notes | Plain text plus protocol tags for links, mentions, and hashtags where supported. |
| Static site | Sanitized HTML generated from canonical rich text, plus escaped title/meta/plain snippets. |
| Search/snippets | Plain text only, no HTML. |

Every adapter should have fixtures for unsafe input, nested marks, links, mentions, hashtags, attachments, empty docs, and unsupported features.

## Migration Strategy

1. Keep reading legacy `text/plain` and `text/html` content.
2. Add helper APIs that convert legacy content into canonical rich text at render/import boundaries.
3. Start writing new post text as `application/vnd.geesome.rich-text+json`.
4. Generate sanitized HTML/plain text from canonical content for older render paths.
5. Add optional backfill only after restored production data confirms the conversion is safe and bounded.

Existing `Content` rows do not need a schema migration for the design itself. A later implementation can decide whether rich-text JSON is a new content object, an additional projection/cache, or a first-class post-body relation.

## Security Boundaries

- Original remote HTML is untrusted even if the ActivityPub HTTP signature is valid. The signature proves actor transport identity, not HTML safety.
- Sanitized derived HTML is display output, not source of truth.
- Renderers must escape all text and explicitly render only supported marks.
- Links must be protocol-checked both during import and rendering.
- Mentions and hashtags should be structured marks, not injected HTML.
- Attachments are storage references and must still pass existing visibility, delete-safety, and serving rules.

## Cross-Repo Responsibilities

`geesome-node`:

- canonical schema validation;
- import/export helpers;
- ActivityPub/Matrix/social adapter boundaries;
- API and static-site/admin rendering safety;
- tests for imported remote content and export fixtures.

`geesome-libs`:

- shared schema types;
- deterministic fixture helpers;
- optional IPLD/DAG-CBOR encode/decode helpers;
- portable plain text/facet conversion helpers.

`geesome-ui`:

- editor model mapping;
- client-side preview rendering through the same allowlist;
- e2e coverage for post component rendering and editor round trips.

## First Implementation Slice

Recommended first code PR:

1. Add schema constants/types and validation helpers in a small module. Status: implemented in `app/richText.ts`.
2. Add `richTextToPlainText` and `richTextToSafeHtml`. Status: implemented in `app/richText.ts`.
3. Add `htmlToRichText` for the current allowed HTML subset. Status: implemented in `app/richText.ts`.
4. Add fixtures that prove unsafe HTML cannot survive the round trip. Status: implemented in `test/richText.test.ts`.
5. Wire only one low-risk render path to the helpers before replacing broader post storage. Status: ActivityPub local post `content` serialization renders canonical rich-text payloads and falls back to escaped legacy text for invalid payloads.

Do not change the storage format for all posts in the first implementation PR.

## Open Questions

- Should the canonical helper live first in `geesome-node`, then move to `geesome-libs`, or start in `geesome-libs` for shared UI/node use?
- Should rich-text payloads be separate content attachments or a first-class `Post` body relation?
- Which mention IDs should GeeSome prefer for local users/groups: static IDs, ActivityPub actor URLs, or protocol-specific aliases?
- Should imported remote HTML preserve an audit-only sanitized HTML snapshot, or is the original remote object plus canonical conversion enough?
