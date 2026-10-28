# Reuse published galleries

## Contents

- [Contract](#contract)
- [Delivery](#delivery)
- [Verification](#verification)

## Contract

User-approved: cancel the current production snapshot build; publish selected preview images plus an ordinary private link Content to the already generated gallery. Free posts expose the link publicly. Never rebuild a gallery while preparing the creator website. Gallery targets are immutable root-relative /ipfs/CID/#/ URLs. Privacy belongs to postsContents.isPrivate, not membership.pageUrl. Existing acquired snapshots remain usable.

## Delivery

1. GeeSome (this repo): recognize bounded single-gallery text/uri-list attachments, render their target as the full-set action, retain the target root, do not copy/traverse gallery images. Replacement validation reads the canonical link with legacy fallback.
2. MicrowaveGirls: save raw URI Content; create compact posts, update links after regeneration, preserve all gallery images in the editor via existing gallery data; idempotently upgrade historical posts on Prepare.
3. Release in dependency order: GeeSome then MicrowaveGirls. No schema migration. No automatic production rebuild or deletion of gallery files. Original agent owns integration and final handoff; workstreams are sequential due to the contract dependency.

Production observation: job 58cefef2-45ca-48d0-a468-8c455f0cc338 was fenced to cancelled. Existing worker checks status on every renew and before commit; it cannot publish/requeue the cancelled job and cleans its staging directories.

## Verification

Delivered focused snapshot/gateway/replacement tests and strict creator type checks. Paid gallery target and its URI Content CID must be absent from public HTML, JSON and public snapshot directory. Full list and post pages must link to the same existing gallery. Prepare upgrades only managed posts, preserves crops/text/visibility, and never deletes files.

Evidence: 103 MicrowaveGirls membership unit tests, four disposable PostgreSQL scenarios, 31 GeeSome PostgreSQL/Kubo/HTTP creator cases and 51 payment cases, 21 storage/optimization/retirement tests (known unrelated aborted-multipart stress test excluded), and 50 browser captures with direct gallery navigation assertions. No production upgrade, data compaction or new build was triggered by the agent.
