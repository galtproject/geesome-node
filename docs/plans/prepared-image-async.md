# Durable asynchronous prepared images (#1668)

## Contents
- Contract
- Sequential workstreams
- Verification and rollout

## Contract
Accept the source-bound manifest and four prepared files into bounded private local staging. Return the ordinary async operation receipt for `async=true`; synchronous callers wait for that same operation. Storage admission belongs to the worker, outside the receiving HTTP deadline. A stable owner/bundle identity recovers a lost receipt without another storage import. Interrupted imports remain explicit unknown outcomes; never replay them automatically. Keep ordinary upload compatibility, permissions, source CID/watermark checks, hashes, quotas and staging budgets. No schema migration or source deletion.

## Sequential workstreams
1. Backend owner: extend existing durable upload staging with prepared bundles, deduplicated acceptance/lookup, restart and worker processing. Outputs are content-module code and focused real-PostgreSQL/API tests; no unrelated module changes.
2. Consumer integration after the backend contract: advertise async support, persist operation receipt and poll/reconcile exact source/bundle identities. This contract permits no budget resets or new identities after unknown outcomes.
3. Verification and sign-off: review failure/crash paths and API docs/auth inventory, then commit/push backend PR. Agents never merge it.

## Verification and rollout
Test acceptance during an exclusive storage fence, unchanged source/hash and owner/key enforcement, same-bundle deduplication, restart before/after execution, missing/revoked/changed sources, staging cleanup/reservations, completed/failed operation reads, and existing synchronous uploads. Run focused suites before the isolated Docker suite, generate docs and update/check route inventory. Deploy the backend before enabling async consumers; preserve original receipts and rollback boundaries. Registry publishing waits for user merge.

## Implementation evidence
Implemented durable prepared-image staging, owner/bundle lookup, shared quota accounting and separate prepared-image-upload queue module. Old ordinary-upload workers cannot consume the new bundles. Active/unknown source holds and operation retention protect recovery; cleanup yields to pending prepared work. No tables, schema or migrations were added. Auth review confirms content:write and ordinary save permission at admission/lookup/execution, owner-scoped exact indexed receipt lookup, source/CID/hash/watermark rechecks and no raw provider diagnostics. Verification: 48 real PostgreSQL/Kubo integration cases and 29 focused API/operation cases pass; API docs, route inventory and scalability inventory pass. Production rollout remains separate; backend precedes consumer activation.
