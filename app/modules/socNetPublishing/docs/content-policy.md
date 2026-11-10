# Destination content policy

## Contents

- [Contract](#contract)
- [Delivery and verification](#delivery-and-verification)

## Contract

User request: one destination is one channel; user chooses SFW or NSFW.
`contentPolicy: sfw` accepts only explicitly safe authored content. Twitter,
Bluesky, Discord and Telegram require `target.sensitive === false`; Rule34
requires `target.rating === 's'`. `nsfw` allows both. It never marks the post
sensitive automatically or replaces the Discord provider's own NSFW check.

New settings use an explicit policy and a primary endpoint only. Explicit policies
reject `sfwChannelId`/`sfwChatId`. Legacy null/omitted policies preserve their
existing behavior, including old alternate routes; old clients may still register
legacy destinations. An explicit policy cannot silently disappear through an old
client's registration: that update fails until the client is upgraded.

Compose enforces policy before media/source/job writes and rechecks the destination
under a transaction lock. Each job freezes the policy. Later destination edits
do not rewrite accepted jobs, compose replay, v1–v5 digests or result journals.
The server worker checks the frozen policy before provider calls. Nullable old
jobs retain their original behavior. New SFW policies for networks without an
explicit safe-content classification cannot accept posts.

Migration `20261110002000-publication-content-policy.cjs` adds nullable columns,
leaves all existing records unchanged and refuses rollback while explicit policy
data exists. Deploy Node first, then Client and Girls. No production upgrade,
publication or automatic enablement is part of this source change.

## Delivery and verification

Tracking: #1575. Node owns schema, API and policy enforcement. Client owns its
account policy UI, safe primary endpoints and frozen local retries. Girls owns
catalog filtering, receipt snapshots and clear errors. Consumer work can proceed
in parallel after this contract; root coordinates the final cross-repo handoff.

Verification covers explicit SFW rejection/acceptance, separate channels sharing
an account, policy snapshots/replay, legacy alternate compatibility, guarded
migration and HTTP behavior. 73 targeted PostgreSQL tests and 26 actual
Node/PostgreSQL/Kubo HTTP tests pass. HTTP verifies rejection before source writes,
unchanged accepted replay and frozen job policy. Provider transport is mocked;
no live send is needed. apiDoc, security inventory and scalability inventory pass.
Schema audit: 299 pass, two known unrelated file-catalog model-sync index failures,
one skip; both new policy columns pass. The full repository suite was not run.

An old client cannot clear an explicit policy even while registering a disabled
row. Use the existing owner-only destination disable endpoint for recovery, or
upgrade the client. Do not run an old binary after explicit policy data exists:
it cannot enforce that restriction, and migration rollback intentionally refuses
to discard it. Configure live policies only after deploying the matching Node.
