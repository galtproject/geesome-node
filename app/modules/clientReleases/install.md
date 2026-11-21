# Install GeeSome Client on Windows

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

An agent without Windows execution/UI access can locate and verify the download and provide these
steps, but must not report that it installed the application. Unsigned Authenticode installers may
produce Windows warnings; manifest signatures do not suppress those warnings.
