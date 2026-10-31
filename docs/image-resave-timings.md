# Publication image resave measurements

## Contents

- [Scope](#scope)
- [Implementation](#implementation)
- [Probe and verification](#probe-and-verification)
- [Release boundary](#release-boundary)
- [Read-only sample on 2026-10-31](#read-only-sample-on-2026-10-31)
- [Live first-use probe](#live-first-use-probe)

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

The timing feature was user-merged through PR #1506 into dev and promoted through
PR #1507 to stable master. The user deployed the stable image before the live
probe below. Agents never merge PRs or bypass the maintained release workflow.


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

Detailed server spans were subsequently measured in the live probe below.


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


### Historical queue receipts

A read-only check sampled fifteen completed image-resave operations from the
previous five-site mixed canary (three queue positions per site). All had
finished without an operation error. Queue age before processing ranged from
0.874 to 815.797 seconds (median 352.670);
operation creation-to-finish ranged from 1.473 to 2.651
seconds (mean 2.047, median 2.173).
These are historical operation envelopes, not separate encoding/storage timers.

The current worker polls every two seconds and processes up to ten resaves
sequentially per pass. Large queue age is consistent with admitted images waiting
behind earlier work; it is not evidence of that much idle CPU time. Do not sum
waits across images. The historical sources/workload differ from the read-only
encoding probe, so subtracting one sample's CPU time from another's operation
envelope would not establish precise IPFS/DB cost. Private raw proof is
`resave-historical-queue-timings.json`. No new resave, publication or Patreon
request was made by this historical check.


## Live first-use probe

After the user deployed master `722b90ae`, the same three sources were processed
through the owner-authorized normal save-data resave API, then requested again to
measure reuse. Each original source was verified to have no JPEG95 receipt before
starting. All three operations succeeded; all repeat requests reused their
results. Three optimized Content records and their previews were saved. No source
was retired, and no Page, Post, generated site or Patreon link was changed.

| Sample | Resave elapsed, ms | Queue age, ms | Reuse elapsed, ms |
| --- | ---: | ---: | ---: |
| 1 | 3110.174 | 1291 | 12.003 |
| 2 | 1896.686 | 4372 | 10.934 |
| 3 | 1905.520 | 6252 | 12.463 |

Mean resave elapsed was **2304.1 ms**. Mean inclusive preview work was about
**1499 ms (65%)**; main JPEG encoding was **177 ms (8%)**. Main-image storage
write averaged **194 ms**, database add **193 ms**, and manifest work **96 ms**.
These are wall-clock spans, not CPU measurements. Parent spans must not be added
to their children. Queue age is additional waiting and overlaps across images.

Coverage limit: the production path used preview file-path storage fallback.
Its writes/stat/temp-file work is included in `preview_total`, but does not yet
have individual storage spans. The approximately 194 ms `storage_write` average
therefore describes the main JPEG only, not all IPFS or pinning work. Preview
read-and-encode spans also include source retrieval, so their full duration must
not be described as encoding CPU time.

Diagnostics were enabled temporarily through the maintained Compose wrapper on
the exact deployed image. A configuration comparison verified no other
runtime-environment changes. No resaves were active before either restart.
After the probe the ordinary wrapper restored the previous flag-off configuration;
the image ID was unchanged and the API returned HTTP 200. Owner credentials stayed
on the membership server. The private durable plan/journal are
`resave-live-probe-plan.json` and `resave-live-probe-journal.json` in membership
artifacts. No blind mutation retries were used.

The probe exposed missing Compose forwarding for the opt-in flag. The follow-up
adds `GEESOME_IMAGE_RESAVE_TIMINGS=${GEESOME_IMAGE_RESAVE_TIMINGS:-0}` so normal
host configuration reaches the container. Default remains disabled.

### Verification outcome

The timing feature's focused tests passed (11). The final backend Docker suite
reported **806 passing, 36 pending and 3 failing**. The same three failures were
reproduced on pre-feature baseline `4c6b459d`: two encrypted-attachment chat
reliability cases and one content-list eager-image assertion. The new real-image
first-use/reuse timing test passed. This establishes no observed timing-feature
regression; it does not claim the full backend suite is green. Compose image
selection and real Compose integration checks also passed for the flag forwarding.

### Consequence for optimization

Moving only JPEG encoding to the Mac targets a small fraction of measured elapsed
time. Moving previews too may help, but requires an explicit trusted preprocessed
upload contract, avoiding duplicate preview work and accounting for transfer and
storage costs. The separate encoding probe's 4.18× result is not an end-to-end
speedup. Before a large run, evaluate the existing JPEG95 size expansion and
measure an equivalent whole-pipeline canary for any proposed replacement policy.
