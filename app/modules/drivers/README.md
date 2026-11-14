# YouTube source downloads

`youtubeVideo` accepts video links from `youtube.com` (including `www`, `m`, and
`music`), `youtu.be`, and `youtube-nocookie.com` (including `www`). Supported forms
are `/watch?v=<id>`, short links, `/shorts/<id>`, `/embed/<id>`, `/live/<id>`, and
`/v/<id>`. The video ID must have 11 characters. Links are normalized to an HTTPS
YouTube watch URL; credentials, custom ports, generic sites, playlists, and
YouTube redirect endpoints are rejected before starting a child process.

## Network policy

- `yt-dlp` only extracts metadata. Local configuration files and plugins are
  disabled, and only the YouTube video extractor is enabled.
- Each extraction gets an authenticated proxy listening on an ephemeral loopback
  port. It only accepts HTTPS CONNECT requests to port 443. Every destination is
  resolved, all returned addresses must be public, and the connection uses those
  pinned answers. Redirects and additional metadata/manifest requests must pass
  the same check. `NO_PROXY` is cleared for the child process.
- The proxy and its tunnels close on extraction success or failure. Extraction
  has a two-minute process timeout and connections have a 30-second idle timeout.
- Video files and thumbnails are downloaded with Axios using vetted HTTP/HTTPS
  agents, `proxy: false`, and `maxRedirects: 0`. Environment proxies cannot bypass
  DNS pinning. Thumbnail bodies are limited to 20 MiB. Agents are destroyed when
  downloads finish, fail, or are cancelled.

## Compatibility

The upload driver selects the largest direct HTTP(S) MP4 format. HLS/DASH-only
videos fail with `youtube_direct_format_required`; there is no fallback to an
external downloader whose secondary connections would bypass the Node policy.
Media and thumbnail redirects are refused, including public-to-public redirects.
Existing stored content and the database schema are unchanged.

`YT_DLP_BINARY` still selects the operator-installed executable. It must support
`--no-plugin-dirs` and `--use-extractors`; unsupported versions fail closed.
YouTube availability, authentication, and extractor compatibility remain
requirements of the installed yt-dlp version.
Deployments that relied on yt-dlp configuration for cookies or custom network
settings can no longer apply those settings implicitly to source uploads.

## Verification

```sh
node --import tsx --experimental-global-customevent ./node_modules/.bin/mocha \
  --require ./test/setupQuietLogs.cjs \
  test/safeHttpAndHttpsAgents.test.ts test/contentSaveByUrlSecurity.test.ts \
  test/youtubeProxy.test.ts test/youtubeDlpSecurity.test.ts
```

These tests use loopback fixtures and a temporary metadata-process stub. They
cover the actual content source-driver branch, invalid inputs, metadata proxy
authentication/pinning and rebinding rejection, process cleanup, direct MP4
selection, internal media/thumbnail targets, and media redirect refusal. They do
not require Internet access, PostgreSQL, IPFS, or an installed yt-dlp executable.
