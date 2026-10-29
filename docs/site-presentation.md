# Site presentation manifest

## Contents

- [Owner settings](#owner-settings)
- [Allowed configuration](#allowed-configuration)
- [Trust and publication](#trust-and-publication)
- [Upgrade](#upgrade)
- [Deferred work](#deferred-work)

## Owner settings

`POST /v1/membership/admin/:resource/site` accepts optional `presentation` in
addition to the existing settings and their current `version`. The resource
owner and integration key need the existing group-management permissions. The
response returns the canonical manifest and incremented settings version.
Omission preserves the saved presentation for old clients. To reset it, send
`{"schemaVersion":1}` explicitly. Stale writes return 409; invalid manifests
return 400 `membership_presentation_invalid` without changing settings.

Presentation lives in the existing `membership_resources.data` JSONB. No new
table, migration, environment variable or worker is required. The public resource
DTO includes it. Credentials, addresses, paid periods and full publication CIDs
are not presentation fields.

```json
{
  "schemaVersion": 1,
  "template": {"id": "creator", "version": 1},
  "theme": {"accent": "#007d62", "radius": "rounded", "density": "comfortable"},
  "layout": {
    "columns": "sidebar",
    "sidebar": ["membership", "social-links"],
    "main": ["post-feed", "pagination"]
  },
  "copy": {"socialHeading": "Elsewhere"},
  "membership": {
    "ribbon": ["Author-defined benefit"],
    "external": {
      "label": "Join elsewhere",
      "url": "https://membership.example.com/creator",
      "accent": "#ffcc00"
    },
    "benefits": [{"title": "Archive access", "text": "Author-defined description"}]
  }
}
```

All sections except `schemaVersion` are optional and receive neutral defaults.
The exact manifest and default values are defined by
`app/modules/staticSiteGenerator/site/presentation.ts`. Only creator renderer
version 1 is installed: the template identifier is an allowlist, not an import
path. A template/schema version that is not supported fails closed.

## Allowed configuration

- Colors: six-digit hexadecimal only. Tokens: `accent`, `background`, `surface`,
  `text`, `muted`, `border`, `accentBorder`, `accentSurface`, `accentText`,
  `badgeBackground`, `badgeText`. Action foreground colors are derived from their
  background; dialogs retain their trusted system surface/text styles.
- Shape: `rounded` or `square`. Density: `comfortable` or `compact`. Preview size:
  `standard`, `compact` or `large` (fixed height limits, not arbitrary CSS).
- Columns: `sidebar` or `single`.
- Header: `brand`, `account` (both required, order configurable).
- Profile: `cover`, `profile` (profile required; cover optional).
- Sidebar: `membership`, `social-links` (optional, ordered).
- Main: `post-feed`, `pagination` (both required, ordered).
- Footer: `home`, `powered-by`, `legal-links` (home required).
- Copy: `join`, `subscribe`, `socialHeading`, `feedHeading`, `archiveHeading`;
  nonblank text, at most 100 characters per value. Real price/period are appended
  by the system and are not editable copy fields.
- Membership: up to two ribbon lines (60 characters each); optional external
  offer with label (100), credential-free HTTPS URL (2048), optional root-relative
  `/ipfs/CID` icon and hex accent. Banner and up to six benefits use `title` (100)
  and `text` (500). All copy is escaped text, not HTML or a Vue template.

Unknown keys, repeated/unknown blocks, unsupported enum values, style strings,
event handlers, component URLs, scripts and forged payment fields are rejected.
An arbitrary declaration is not fetched or executed. Assets must already be
published via the authenticated content API. No network asset download is added.

The same normalizer validates optional `StaticSite.options.presentation` for
shared configuration. The legacy generic SSG layouts keep their existing view,
HTML/CSS options and behavior; storing this field does not opt those layouts
into the membership creator renderer or make raw legacy CSS safe.

## Trust and publication

The renderer has a closed set of trusted Vue blocks. Settings do not choose
modules or component source. Auth, Google challenges, invoices, receiving
addresses, payment confirmation and entitlement stay in trusted components/APIs.
User fields cannot replace their values or request handlers.

Public and complete content projections are made before rendering. The public
manifest does not receive paid text, hidden links or the full root CID. Rendering
configuration cannot bypass this boundary. External offer icons are retained as
publication artifacts alongside existing branding assets, with IPFS-relative
URLs; directories referenced by content links are not traversed.

Canonical presentation participates in page input/cache keys and generated CSS.
The existing settings revision/invalidation, durable jobs, source fence and
atomic pair publication remain unchanged. Different themes use the same compiled
renderer/client bundle, so one compiled-code cache is correct for creator/1;
adding another executable renderer requires an explicit versioned code registry
and keyed compilation caches. Old immutable CIDs remain readable unchanged.

## Upgrade

Deploy GeeSome first, then the producer. On explicit Prepare, Microwave Girls
fills a missing presentation from its own preset after publishing offer icons.
A local explicit `resource.data.presentation` wins over the producer default;
already saved node presentation always wins. No implicit overwrite or group
rename occurs. Rebuild to publish the configured design; previously issued
immutable snapshots are not rewritten.

Without a manifest, Node renders neutral defaults. The deprecated `patreonUrl`
can still supply a generic external membership destination for older clients;
new manifests define provider label, icon, color and marketing explicitly.
There are no resource-name theme switches or built-in promotional claims.

## Deferred work

The block editor and preview UI are explicitly backlog. Current configuration is
through the versioned settings API or a producer preset. Arbitrary HTML/CSS/Vue/JS
renderers, plugin execution, manifest CID import/export and additional template
versions are separate work, not implicitly enabled by this schema.
