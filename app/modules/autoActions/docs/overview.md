# Auto Actions Module

## Purpose

The `autoActions` module stores scheduled module function calls and executes due actions through a cron-driven claim-and-run loop.

## Owns

- `AutoAction` rows with module/function names, JSON arguments, optional encrypted arguments, schedule timing, attempts, and next-action chains.
- Owner-scoped list/update APIs for user actions.
- Due-action claiming with optional DB-backed claim TTLs to avoid duplicate execution.
- A cron service that polls every minute, groups actions by target module, executes allowed module functions, and queues follow-up actions.
- Success/failure handling that reschedules repeating actions or deactivates exhausted actions with errors.
- `AutoActionLog` rows for execution responses/errors, failure state, and root-action linkage across chained actions.

## Worker Boundaries

- Target modules decide which functions are allowed through `isAutoActionAllowed`.
- Function arguments must be JSON arrays; previous action results may be substituted into chained actions.
- The cron loop is in-process and should stay best-effort; critical jobs should use durable explicit queues when they need stronger delivery semantics.
- Claim TTLs should remain bounded so crashed workers do not permanently hold actions.

## Boundaries

- Do not expose arbitrary module/function execution to users.
- Keep action payload logging lazy and safe because arguments can be large or encrypted.
- Use serial/next-action chains when order matters; do not rely on incidental queue order across modules.
- New auto-action-capable modules must define a narrow allowlist and permission checks inside the module function.

## Related Docs

- [Module docs index](../../../../docs/modules.md)
