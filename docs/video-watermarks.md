# Video watermark preparation

`POST /v1/user/video-watermarks` accepts `{sourceContentId, svg}` for an owned,
local, unencrypted MP4, QuickTime or WebM. Requires UserSaveData and the
`content:write` integration scope. SVG uses the existing image-composition
allowlist. The original Content and its bytes remain available.

The response is either `{status:"completed", sourceContentId, content, policy}`
or `{status:"queued", sourceContentId, id, asyncOperationId}`. Poll the ordinary
operation queue endpoints; the worker result binds sourceContentId,
sourceStorageId, policy and output Content. Explicit retries reuse waiting work
or a completed source/style/profile receipt. Deleted results are regenerated.
An already branded source with matching version-1 provenance returns
`alreadyApplied:true`; unverified watermarks already visible in an input are
preserved, without detection, removal or guessing.

The existing storage worker runs one video job per turn, sequentially, with
interrupted-job recovery. Input CIDs and previews are protected by active queue
storage holds. Execution rechecks the accepting API key and ownership. A crash
during encoding can require re-encoding; there is no exactly-once encode claim.
Sources retain at most eight recent style receipts. No external publication is
performed.

The SVG is rasterized once. Its plate occupies at most 35% of frame width,
120% of frame height and 400 pixels, in a 400:88 aspect ratio; right margin is
2% of the short edge and bottom inset is 6% of height. FFmpeg combines overlay,
even-dimension padding, H.264/yuv420p encoding (veryfast, CRF20), audio handling
and MP4 faststart in one pass. AAC is stream-copied; other audio is encoded as
AAC. A recipe signature in MP4 metadata keeps distinct provenance recipes from
colliding when their visible raster pixels happen to match. Original metadata
and extra tracks are omitted. The saved MP4 uses raw content storage, avoiding
a second video conversion; existing content previews are generated normally.

Limits: 256 MiB encoded input/output, 180 seconds, 60 fps, 4096px per edge,
8,847,360 pixels per frame, one non-cover video track and square pixels. The
renderer honors quarter-turn rotation, uses two codec threads and one filter
thread, and terminates FFmpeg after ten minutes. Probe time is limited to
30 seconds. Demuxers are restricted to the admitted container family, with no
network protocols. All temporary files live in a private directory removed on
success and failure.

Deploy the backend before clients begin video branding. No schema migration or
new dependency is required. Existing still-image composition and video upload
conversion remain unchanged. This endpoint prepares downloadable MP4s; it does
not add video support to existing image-only social publication providers.

Verification: real FFmpeg frame/color, H.264, AAC byte preservation, duration,
faststart and original-byte checks; PostgreSQL/IPFS HTTP admission, scope,
ownership, deduplication, storage holds, cache/deletion and already-applied
checks; existing storage hold tests. Run the focused video tests through the
repository Docker test tooling with PostgreSQL, IPFS and FFmpeg available.
