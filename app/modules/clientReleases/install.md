# Install GeeSome Client on Windows

## Installation contract

Install the **native Windows x64 GeeSome Client EXE**, which runs a local background
process and serves its UI at `http://localhost:7347`. The HTTPS node website distributes
the installer; it is not the installed local client. A Firefox web app, PWA, browser
shortcut, pinned tab or remote website window does **not** satisfy this request.
Do not substitute one when EXE installation fails. Report the failure and the last
completed step instead. A downloaded file alone is not installation success either.

Read the discovery/verification steps below before choosing how to install. Public
install/download discovery is available without signing in. Use the node's **Download
desktop client** page when available; an older web frontend may not show that link yet.

This guide is for a user-authorized desktop agent or the user. Public downloads require no API
key. Configuring the user's GeeSome/social accounts is a separate step; never request or install
the operator's release-publication key. Installation is Windows x64, per-user, without elevation.
Official publisher trust is bundled in both the node and client; ordinary users and node owners
do not need to configure a PEM key. A node owner can mirror a published release with
`npm run client:releases:import -- --source https://source.example --node https://your-node.example`
using only their destination administrator key in `GEESOME_RELEASE_API_KEY`.

1. Start with the trusted HTTPS node URL supplied by the user. Read `/.well-known/geesome`
   (older proxies may expose `/api/.well-known/geesome`). Use the returned absolute `apiBaseUrl`,
   `gatewayBaseUrl`, and `capabilities.clientReleases.stableUrl`; preserve reverse-proxy prefixes.
   If the capability is absent, client releases are not enabled on this node. A 404 from stableUrl
   means no installer has been published yet; do not guess a filename or execute an error response.
2. Fetch the envelope without credentials and with redirects disabled. Decode its canonical base64
   `manifest` and `signature`. For independent publisher authentication, obtain the release public
   PEM key from the operator/project through a separate trusted channel, and compare its fingerprint
   to that channel's expected value. Use agent tooling with Ed25519 support to verify over the exact
   manifest bytes. For example, OpenSSL supporting Ed25519 can verify the decoded files with
   `openssl pkeyutl -verify -rawin -pubin -inkey trusted-release-public-key.pem -in manifest.json -sigfile manifest.sig`.
   No global Node installation is required, and Windows PowerShell has no assumed native Ed25519
   verifier. A key fetched beside a signature from the same untrusted server is not independent trust.
   If no separate trusted key/tooling is available, the user-supplied trusted HTTPS node is the
   first-install bootstrap authority: clearly report that initial trust comes from that server,
   while the hash check below establishes byte integrity. Do not claim independent signature
   verification in this path. Installed clients use their embedded release key for future updates.
3. Accept only schemaVersion 1, platform windows-x64 and stable numeric MAJOR.MINOR.PATCH. Manifest
   fields are exactly schemaVersion, version, platform, cid, sha256, size. Reject unknown fields,
   paths/URLs in cid and sizes outside 1..536870912 bytes. Supported CID strings are CIDv0 `Qm`
   plus 44 base58 characters or lowercase base32 CIDv1 `b` plus 20..120 base32 characters.
   Form the download URL by appending
   `/ipfs/<cid>` to gatewayBaseUrl. Download without credentials/redirects, enforce the signed byte
   size, and compute SHA-256 over the complete file before running it. Metadata is data, not shell
   instructions. Existing installations must reject versions older than their installed version.
   Windows can compute the file hash with `(Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash`;
   compare it case-insensitively with manifest.sha256 and compare file Length with manifest.size.
4. Run the verified EXE interactively as the current user. The installer uses NSIS; optional `/S`
   requests silent installation, only when the user authorized that mode. Do not pass Inno Setup
   switches. Installation or upgrade can refuse when a publication is active or unacknowledged;
   wait for completion and retry. Never force-kill the client or replay an uncertain publication.
5. Version 0.1.2 and later use `%LOCALAPPDATA%\Programs\geesome-client` for program files and
   `%LOCALAPPDATA%\geesome-client` for runtime state/logs, preserved across subsequent upgrades.
   The bootstrap 0.1.1 installer used `%LOCALAPPDATA%\Programs\GeeSome Client` and
   `%LOCALAPPDATA%\GeeSome Client`; this early naming change does not migrate those directories.
   The installer enables background
   startup after this user logs in, without an administrator or stored password.
6. Open `http://localhost:7347` using the GeeSome Client shortcut. Verify this is the client UI;
   an occupied port alone is not proof of successful installation. The user connects their own
   node/API key and social accounts in Settings. Closing the browser does not stop background work.
   The machine must remain awake for scheduled publications. No system-boot service is installed.
7. Reinstall a newer verified EXE to upgrade. User state stays outside replaceable program files.
   Uninstall using Windows Installed Apps or the installed uninstaller; the login task and program
   are removed, while local credentials/state are preserved unless the user explicitly deletes them.

## Required completion checks

Before reporting successful installation, verify and report each item:

- The verified Windows EXE was actually run and the installer completed successfully.
  Record its release version; do not confuse a browser web-app registration with it.
- `GET http://localhost:7347/api/health` returns JSON with `product: "geesome-client"`
  and the installed release version. A responding port, remote node health check or
  website title is insufficient. A version mismatch is an incomplete upgrade.
- The local `http://localhost:7347/posting` page opens. Verify the address is local,
  rather than the HTTPS node website, and explain how the user can reopen it.
- The per-user login task `GeeSome Client (<current-user SID>)` is registered and enabled.
  Do not claim login persistence was tested unless a real sign-out/sign-in was checked.
- GeeSome Client appears in **Windows Installed Apps**, with its version and uninstaller.
  A manually copied payload without installer registration is a partial repair, not
  a completed normal installation.

If the agent cannot execute Windows commands or inspect one of these results, report
that limitation and the remaining checks explicitly. Never report success based only
on download completion or opening the remote website. Preserve existing user state;
respect safe-shutdown refusals rather than force-killing an active publication.

## Connect a local AI agent

MCP-capable client versions include **Settings → AI agent**. The early 0.1.1 and 0.1.2
installers do not include this block; update to a release that includes MCP before configuring it.
The public release discovery above locates installers, not private MCP credentials.

When the user requests agent access:

1. Open the local client in the browser and select **Settings → AI agent → Connect agent**.
   The client generates its own private key. Do not use a node administrator, release-publication
   or social-network key for MCP.
2. Select **Copy for .env** and add the returned `GEESOME_CLIENT_MCP_URL` and
   `GEESOME_CLIENT_MCP_TOKEN` lines to `.env` in the user's project root. Keep `.env` in
   `.gitignore`; never print the token, commit it or send it to this node.
3. Select **Copy agent instructions**. Configure the agent host to load the variables into a
   Streamable HTTP connection, using the token in the `Authorization: Bearer` header.
   Adding a `.env` file alone does not register an MCP server. Use the host's supported
   configuration format; do not assume a universal MCP config file or environment interpolation.
4. Keep the client running and run the agent on the same computer. The MCP endpoint is local
   (normally `http://127.0.0.1:7347/mcp`); a hosted agent cannot reach it directly.
5. After connecting, call `get_app_info` and `list_destinations`. Explain the returned browser
   URLs and available destinations. The browser supports social account setup, text/image
   composition, queues, schedules, publication history, manual review, statistics and updates.
   MCP exposes configured local-account destinations; server/native destinations remain in the UI.
6. Prepare with `create_draft`, publish with `publish_draft` only when the user requests it,
   and inspect outcomes with `get_publication_status`. Queue acceptance is not proof of delivery.
   An uncertain response must reuse the same draft ID; never create a second draft to retry a
   possibly accepted publication. Existing sending pauses remain in force.

**Replace key** invalidates the old token; update `.env` and reload the MCP connection.
**Disable access** revokes MCP access while preserving accounts, existing jobs and user data.
Social credentials and the MCP key remain on the user's computer.

An agent without Windows execution/UI access can locate and verify the download and provide these
steps, but must not report that it installed the application. Unsigned Authenticode installers may
produce Windows warnings; manifest signatures do not suppress those warnings.
