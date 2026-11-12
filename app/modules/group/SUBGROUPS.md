# One-level subgroup routes

`GroupSubgroup` links two owned local channels. `alias` is a separate route
segment; JSONB `config` holds only the optional `tabLabel` (1–80 characters) and
`order` (integer 0–1000). Missing display settings use the child title and order 0
in the renderer. Group ownership and publication permissions are not inherited.

The model has real group foreign keys, unique `(parentGroupId, alias)` and
`(parentGroupId, subgroupId)` indexes, a reverse `subgroupId` index and a database
self-link check. New installations create this new table through model sync;
this feature changes no existing table columns.

## Owner API

- `GET /v1/user/group/:parentGroupId/subgroups` returns safe relation metadata.
- `POST /v1/user/group/:parentGroupId/subgroups` creates or updates one link.
- `POST /v1/user/group/:parentGroupId/subgroups/:subgroupId/remove` removes the
  link using its current revision.

Example upsert body:

```json
{
  "subgroupId": 5,
  "alias": "feed",
  "config": {"tabLabel": "Feed", "order": 10}
}
```

For an edit, include the returned `revision`; it starts at 1 and increments on
changes. Identical create retries and exact lost-reply update retries reuse the
same link. Conflicting aliases or stale revisions return 409. Removal accepts
`{"revision":1}` and returns `{"removed":true}`; it does not delete a group or
accepted post.

The authenticated owner needs group-management permission. The parent may be a
private local unencrypted channel used by an existing creator site. The target
must be an owned public local unencrypted channel. Deleted, remote or foreign
groups are rejected. Reads of this relation API are never anonymous discovery.

An alias is one lowercase segment of at most 64 characters, such as `feed` or
`studio-updates`; slashes, traversal, underscores and reserved site routes are
rejected. The generated URL adds the surrounding slashes. Reserved routes cover
existing post/page/account/media/API/static paths.

## Rendering and changes

The renderer resolves normalized relation inputs once and renders only one
subgroup level. A child that becomes private, encrypted, unavailable or foreign
is omitted, together with its tab. Invalid stored route/config data is omitted
instead of being used as a path. Owner-only listing retains the relation so the
owner can repair/remove it.

Publication source hooks observe relation changes and source post/group writes
in their SQL transaction. Reverse parent lookup uses the subgroup index, then
the existing site source version and publication queue. The public site never
obtains private parent posts merely by linking a public subgroup. Removing a
current route does not erase previously published immutable content addresses.
Administrative hard deletes must supply a SQL transaction: the hooks lock the
child before collecting parents so concurrent relation creation cannot escape
invalidation. Ordinary source edits retain their existing transaction contracts.
Destructive database flushes are maintenance operations, not concurrent
site publication APIs.

Focused PostgreSQL coverage: `test/groupSubgroups.test.ts`.

## Site template and publication

The standard creator layout displays tabs above posts when subgroups exist.
In that layout, the tabs identify the current section, so the repeated feed
heading is omitted. Untabbed pages and custom HTML shells retain their headings.
For a custom HTML template, insert the optional slot at the desired position:

```html
<geesome-slot name="tabs"></geesome-slot>
<geesome-slot name="posts"></geesome-slot>
```

Existing templates without the slot remain valid. The parent feed stays at `/`;
the linked public feed is generated under `/<alias>/`, with static pagination
and direct `posts/<database-post-id>/` pages. Membership sessions do not replace
these public posts. The same child subtree is mounted in both parent snapshots.
The direct Node selector supports GET/HEAD `/v1/membership/site/:alias`, plus
`/:alias/page/:subgroupPage` and `/:alias/posts/:subgroupPost`; it checks the
configured host and declared generated paths, and always selects the parent
public root. Existing reverse proxies that select the parent root then append
the original URI need no new per-alias mapping.

Create the relation and update the template with the normal versioned settings
API, then explicitly enqueue the initial paired publication. Later post, group
privacy and relation changes reuse the existing transactional publication queue.
No new worker or refresh poller is required. Deploy the new model/API and renderer
together before configuring links. To remove a section, remove its relation and
publish a new pair; previously obtained immutable CIDs remain readable.

Browser verification: set `GEESOME_BROWSER_IMAGE` to the local Playwright runtime
image (with `/work/node_modules/playwright`) and run
`npm run test:ssg-subgroup-browser`. It generates neutral fixtures and desktop /
narrow screenshots with a manifest under
`test/.geesome-test-output/subgroup-feed-browser`; generated evidence is ignored.
