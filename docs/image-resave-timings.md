# Publication image resave measurements

## Contents

- [Scope](#scope)
- [Implementation](#implementation)
- [Probe and verification](#probe-and-verification)
- [Release boundary](#release-boundary)
- [Read-only sample on 2026-10-31](#read-only-sample-on-2026-10-31)

## Scope

The user requested measurements before choosing local image encoding or more
server concurrency. Preparation dominated the earlier membership canary, but
its queue/read/encoding/storage/database components were not separated.
No policy, image quality, concurrency, cleanup or Patreon mutation is included.

## Implementation

Sequential workstreams: instrument GeeSome's existing resave path, validate
scope isolation and real image paths, add compatible timing collection in the
membership report, then execute a small representative probe. The backend
changes must precede downstream support. Only diagnostic numeric fields and
constant stage names are recorded. Existing receipts/keys/retries stay unchanged.

`GEESOME_IMAGE_RESAVE_TIMINGS=1` opts into bounded per-resave elapsed spans.
Default behavior omits diagnostics. Async-local scope prevents other uploads or
parallel jobs contaminating a receipt. Each span includes parent/offset/duration;
inclusive or overlapping spans must not be added as if they were CPU time.
Queue age includes previous attempts if a queue is resumed. Reuse is explicit.

## Probe and verification

Run focused diagnostics/image tests, the maintained backend Docker suite and
compatible downstream tests. A read-only sample on the actual server may measure
source retrieval and encoding without publishing/saving, but cannot prove IPFS
write/pin or database costs. Full production stage measurements need the new
backend and a small first-use resave probe. Cached samples must be reported
separately. Never substitute repeat/header-run speed for legacy throughput.

## Release boundary

Backend work is on a feature branch for a dev-targeted PR. Agents never merge
PRs. Production currently runs stable master; it must receive an approved merged
release before deployment via the maintained docker-upgrade workflow. Do not
change the server branch or hot-patch the live process to bypass this boundary.


## Read-only sample on 2026-10-31

Three source images were selected from the beginning, middle and end of the
prepared 100-site scope. No image files were written, uploaded, pinned, attached
or published. The probe ran in a separate process inside the existing GeeSome
container and on the Mac, using each environment's installed backend encoders.
Sources and every JPEG/WebP output matched SHA-256 between the two hosts.
All actual inputs were JPEG despite PNG metadata on two original Page entries.
This sample therefore does not establish performance on real PNG inputs.

Both hosts used Node 22.21.1, Sharp 0.35.5 and libvips 8.18.7. The server is
x64 with two logical CPUs; the Mac is arm64 with fourteen. Other local builds
were active, so these are observations under current load, not controlled
capacity benchmarks. Each source was encoded twice; trial two reused source
bytes in memory. Watermark work was omitted.

Mean elapsed milliseconds per source across the two trials:

| Sample | Actual source | Server JPEG | Server previews | Mac JPEG | Mac previews |
| --- | --- | ---: | ---: | ---: | ---: |
| 1 | JPEG 1152×2130, 270,516 bytes | 212.0 | 1046.5 | 36.7 | 244.5 |
| 2 | JPEG 936×1730, 167,530 bytes | 132.9 | 752.1 | 22.8 | 197.1 |
| 3 | JPEG 936×1730, 175,160 bytes | 149.4 | 759.9 | 27.4 | 202.2 |

Mean JPEG + previews: **1017.6 ms server /
243.5 ms Mac**, a **4.18×** encoding
speed difference on these samples. Isolated probe CPU time averaged
1064.4 ms server / 269.0 ms Mac,
consistent with about one busy core during encoding. This is not a whole-pipeline
speedup claim. Preview generation contributed most of the encoding elapsed time.

Reads used the local Kubo HTTP gateway on the server and the public HTTPS
gateway on the Mac; their latencies are not directly comparable. Direct RPC cat
was refused (403), so no authorization or runtime configuration was changed.
The probe omits application queue time, subsequent image rereads, IPFS writes,
pinning, database work, notifications and Patreon. The six-hour overall estimate
is not revised from this small sample.

Private manifests and raw reports are retained under the membership artifacts
directory as `resave-timing-sources.json`, `resave-read-probe-*-hashes.json` and
the original pre-hash runs. The checked-in report anonymizes the source identities.

Detailed server spans are prepared in the backend change, with an opt-in flag
and compatible membership collection/reporting. Production still needs the
approved merged release before a first-use resave can measure IPFS/DB stages.


### Output size finding

The existing JPEG95 4:4:4 policy increased full-image bytes on these already
compressed JPEG inputs. No policy was changed and the results remained in memory.
This is separate from CPU placement and needs evaluation before bulk processing.

| Sample | Source JPEG bytes | Re-encoded JPEG bytes | Ratio |
| --- | ---: | ---: | ---: |
| 1 | 270,516 | 514,650 | 1.902× |
| 2 | 167,530 | 313,745 | 1.873× |
| 3 | 175,160 | 346,530 | 1.978× |

A possible follow-up is an explicitly versioned source-preserving JPEG policy
plus the required WebP previews. That would be a separate contract/policy change;
these sources must not simply be relabelled as satisfying JPEG95. Local encoding
also adds download/upload traffic, so the observed encoding speed difference is
not a forecast of end-to-end migration speed.
