# ActivityPub And Bluesky Live Interoperability

This runbook records what the live social smoke suite proves, what it intentionally
skips, and which checks require operator-owned accounts or a publicly reachable
GeeSome node. Keep it aligned with the smoke commands when their coverage changes.

## Reliable Default Gate

Run the deterministic check in CI and before live testing:

```sh
npm run activitypub:interop-smoke
```

It validates GeeSome WebFinger, NodeInfo, actor, outbox, Note/Create,
content-type, rich-text, tag, attachment, and publication-safety behavior without
depending on a remote service.

Live checks are operator-run. They must report `skipped: true` with a reason when
the required account, bridge, signer, or public endpoint is unavailable. A skipped
check is not evidence that the corresponding capability works.

## Public Read Evidence

The following no-secret checks succeeded on 2026-07-13:

| Boundary | Command and target | Evidence |
| --- | --- | --- |
| Mastodon ActivityPub | `ACTIVITYPUB_REMOTE_SMOKE_RESOURCE=acct:Mastodon@mastodon.social npm run activitypub:remote-server-smoke` | WebFinger resolved the actor, a public featured Note was fetched, and the local review/import path stored and imported it idempotently. |
| Independent ActivityPub parsing | `npx --yes @fedify/cli lookup --compact acct:Mastodon@mastodon.social` | Fedify CLI resolved and parsed the actor, inbox, shared inbox, outbox, key, and profile fields independently of GeeSome. |
| Bluesky through ActivityPub | `npm run activitypub:bluesky-bridge-smoke` | Bridgy Fed actor discovery and local import succeeded. The current latest ATProto item was not bridge-convertible, so the smoke used the actor's public featured bridged Note and reported that fallback. |
| Native public Bluesky | `npm run bluesky:atproto-smoke` | Public XRPC feed reads and canonical projection succeeded for ordinary posts, repost/quote identity, facets, and image embeds. |
| Local ownership signer | `ACTIVITYPUB_OWNERSHIP_CHALLENGE_SMOKE_LOCAL_SIGNER=1 npm run activitypub:ownership-challenge-smoke` | The exact challenge URL, body, headers, key id, and signature verification path succeeded with the deterministic signer. |

The Fedify CLI is a debugging tool that can inspect any ActivityPub server; its
official documentation also provides an ephemeral public inbox for outbound
delivery testing: <https://fedify.dev/cli>.

## Persisting Reports

Every smoke prints a secret-free JSON report. Persist it with its command-specific
report variable or with `GEESOME_SMOKE_REPORT_PATH`:

```sh
ACTIVITYPUB_REMOTE_SMOKE_REPORT_PATH=/tmp/activitypub-remote.json \
  npm run activitypub:remote-server-smoke

BLUESKY_ATPROTO_SMOKE_REPORT_PATH=/tmp/bluesky-public.json \
  npm run bluesky:atproto-smoke
```

Store reports in a deployment evidence system or temporary operator directory,
not in Git. Review `ok`, `skipped`, warnings, selected target, and checked
capabilities; do not treat process exit success alone as proof.

## Operator Credential Gates

Run these checks with disposable test identities, never production credentials.

### Native Bluesky Writes

```sh
BLUESKY_CREDENTIAL_SMOKE_IDENTIFIER='test-handle.bsky.social' \
BLUESKY_CREDENTIAL_SMOKE_APP_PASSWORD='test-app-password' \
BLUESKY_CREDENTIAL_SMOKE_WRITE=1 \
BLUESKY_CREDENTIAL_SMOKE_REPORT_PATH=/tmp/bluesky-credentialed.json \
  npm run bluesky:credentialed-smoke
```

This is the release evidence for account verification, stored-account lookup,
source import/refresh/sync, create idempotency, update, delete, and optional image
upload failure fallback. Without both credential variables, the command must skip.
Without the write flag, it must not create a remote record.

### Public ActivityPub Exchange

Use a staging GeeSome node with an HTTPS public URL and a disposable Fediverse or
Fedify ephemeral actor. Verify:

1. Fedify or another independent client resolves the GeeSome WebFinger resource,
   actor, outbox, and one post object.
2. The remote actor follows the GeeSome group and receives a signed
   `Accept(Follow)` plus a later `Create(Note)` from the delivery queue.
3. A signed remote reply/mention reaches the GeeSome inbox or shared inbox and is
   stored once even if delivered twice.
4. Signed remote update and delete/tombstone activities update and soft-delete only
   the matching imported post.
5. The ownership challenge smoke verifies an external signature through
   `ACTIVITYPUB_OWNERSHIP_CHALLENGE_SMOKE_SIGN_COMMAND`, or records a clear skip if
   the selected tool cannot sign the exact detached challenge.

Do not expose a development machine with `fedify tunnel` or another tunnel unless
the operator has reviewed the temporary public surface and data. Prefer a staging
node with disposable data.

## Completion Policy

The implementation baseline is complete when deterministic checks pass and the
public read checks above remain reproducible. Credentialed Bluesky writes and full
public inbox/outbox exchange are deployment release gates because they require
operator-controlled identities and a reachable node. A failure in either gate is
a product or compatibility issue to fix; an unavailable credential or endpoint is
a documented skip, not a code failure and not a pass.
