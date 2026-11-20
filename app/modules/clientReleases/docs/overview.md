# Client releases

`clientReleases` is an optional release-metadata module for the local Windows publisher client.
It hosts ready-built installers; it never builds or executes them on the server.

## Enable

Set `GEESOME_CLIENT_RELEASE_PUBLIC_KEY` to the operator's Ed25519 public PEM key (with real
newlines), or supply `clientReleasesConfig.publicKey` in extended configuration. The default main
module pack includes `clientReleases`; custom `MODULES` must include it after api/database/storage/content.
Without a public key it stays disabled, creates no table/routes, and advertises no capability.
A malformed configured key fails initialization instead of silently trusting another key. Keep the
private signing key outside server/client repositories and outside installer payloads.

## Publication and discovery

1. Build/test the Windows installer locally. Upload exact EXE bytes using existing
   `POST <apiBaseUrl>/user/save-file`, no media driver; wait for any async operation to finish.
2. Construct exact UTF-8 JSON with fields `schemaVersion:1`, strict stable `version`,
   `platform:"windows-x64"`, bare file `cid`, lowercase `sha256`, and exact positive `size` <=512 MiB.
   CID forms match the client: CIDv0 `Qm` plus 44 base58 characters, or lowercase base32 CIDv1
   `b` plus 20..120 base32 characters; the node additionally validates the actual CID encoding.
3. Sign those bytes with Ed25519. POST `{manifest:<canonical base64 bytes>,signature:<canonical
   base64 signature>}` to `<apiBaseUrl>/admin/client-releases/stable/windows-x64` using an operator
   API key with `admin:all` on both its owner and the key. This v1 key is broadly privileged;
   never give it to users. Upload-only keys cannot promote a release, including an admin's restricted key.
4. Registration verifies signature, schema, full streamed file hash/size, then pins the binary and
   atomically selects stable under the shared storage fence. Duplicate requests return the same
   envelope; changed descriptors for a version or older stable versions are conflicts. A missing,
   truncated, transformed, excessive, timed-out or corrupt file does not replace stable.
5. Anonymous users/agents read `/.well-known/geesome` → `capabilities.clientReleases` → `stableUrl`
   and `installGuideUrl`. The API-root index has the same capability, and absolute public links
   preserve configured origin/base paths. Stable GET returns the signed envelope or a documented
   404 before first publication. Download uses the existing public `/ipfs/<cid>` gateway.

The public [installation guide](../install.md) documents trust bootstrap, supported architecture,
NSIS `/S`, per-user paths/login startup, localhost UI and removal. No global Node or admin key is
required on the recipient. The supplied trusted HTTPS node can serve as first-install authority;
independent publisher verification additionally needs a trusted external public key and capable
agent tooling. Installed clients pin their embedded release key for later updates.

## Persistence and cleanup

A new `clientRelease` model stores immutable version/envelope/CID records and one partial-unique
stable flag. Model.sync creates this new table; no existing table migration is necessary.
A fixed transaction-scoped advisory lock serializes stable selection across processes, including
the first publication. Retained release CIDs register with existing storage delete-safety checks,
including v0/v1 aliases, so normal catalog retirement cannot unpin an advertised installer.
Storage verification, pinning and reference commit share the existing cleanup fence.

Stable and previous installers must remain retained. V1 conservatively retains all registered
versions until the operator explicitly prunes obsolete non-stable/non-previous rows and pins under
maintenance. There is no retention daemon or public delete endpoint. Failed registration can leave
an extra pin after pin success; it cannot advance stable and is safe to inspect/prune manually.
Do not change/remove the configured key until release-key rollover is coordinated: old descriptors
fail verification with a new key and are not advertised as valid. Key rotation automation is deferred.

## Verification

`npm run test:client-releases` runs focused trust/integrity/API-discovery tests plus existing API
header regression tests. Set `CLIENT_RELEASE_TEST_DATABASE_URL` to a disposable PostgreSQL database
for real stable-selection/persistence/reference tests. Additionally set `CLIENT_RELEASE_TEST_KUBO_URL`
and `CLIENT_RELEASE_TEST_GATEWAY_URL` for actual Kubo pin and byte-download checks. Fixtures never
use a production URL. See [run evidence](../../../../docs/client-releases-implementation.md).
