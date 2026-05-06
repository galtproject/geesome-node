# API And Encryption Security Review

## Source Of Truth

Original request for this slice: continue the GeeSome Node TODO by starting the API and encryption security review tracked in [#782](https://github.com/galtproject/geesome-node/issues/782).

Current architecture corrections from the planning thread:

- `geesome-node` is a GeeSome node/app that may run locally or on an always-on server; do not assume every security boundary is a classic centralized backend boundary.
- Chat groups remain a proof of concept. Backend-side encryption does not provide real E2EE because the node can still see plaintext or key material.
- Real chat E2EE must happen in the frontend/device layer with user-held private keys and recipient public keys. The node should store and route opaque encrypted envelopes.
- Social-network and pinning integrations store external credentials; those routes need the same secret-boundary review as chat and ActivityPub keys.

## Current Security Shape

API route registration is centralized through `app/modules/api/index.ts`:

- `onGet`, `onPost`, `onHead`, `onUnversionGet`, and `onUnversionHead` are public route registrations.
- `onAuthorizedGet` and `onAuthorizedPost` require a bearer API token before the handler runs.
- API-token authentication rejects missing, disabled, expired, and invalid keys.
- Scoped API-key permissions are enforced through `app.runWithApiKey()` and `app.checkUserCan()` / `app.isUserCan()` / `app.isAdminCan()`.
- Many authorized handlers are token-only at the route layer and rely on module-level ownership checks. This is acceptable only when the called module validates user ownership, group permissions, or object access before returning or mutating data.

The generated route matrix is checked in at [security-route-inventory.md](./security-route-inventory.md). Regenerate it after route changes with:

```bash
npm run security:route-inventory:update
npm run security:route-inventory
```

## Initial Findings

### Public Surface Needs Explicit Abuse Review

The inventory currently reports public authentication, content, gateway, webhook, and discovery routes. These are expected for a node that serves public/IPFS-style content and supports login flows, but they need explicit limits and tests:

- Public content and gateway routes need size, range, path, storage-miss, and stream-error coverage.
- Public auth-message/login routes need replay, expiry, and signature-domain checks.
- Telegram webhook routes carry a token in the path; token hashing exists in the module, but webhook behavior should still be reviewed for logging, brute force, and route exposure.

### Token-Only Routes Need Ownership Matrix Coverage

Most authorized routes do not show a nearby core permission check because the handler delegates to module-level checks. The next review pass should classify each token-only route as one of:

- User-owned object access.
- Group membership check.
- Group edit/admin check.
- Admin/core permission check.
- Safe read-only self route.
- Missing or ambiguous ownership control.

The highest-priority modules for this pass are:

- `group` and `groupCategory`, because group membership and edit permissions are the main social authorization boundary.
- `content`, `fileCatalog`, and `staticSiteGenerator`, because they bridge private user data, public publishing, and filesystem/storage paths.
- `pin`, `autoActions`, and social import modules, because they can trigger external service calls with stored credentials.

### Secret Storage Is Mixed And Must Stay Write-Only At API Boundaries

Status: implemented for the currently exposed Pinata, auto-action, social-account, Telegram login, and Twitter login API responses in [#876](https://github.com/galtproject/geesome-node/issues/876). These responses now remove raw and encrypted secret material while preserving non-secret metadata and boolean credential-status fields where useful.

The same pattern should be kept for:

- Account-storage encrypted private keys.
- Future ActivityPub HTTP-signature private keys.

The rule for API handlers should be: secrets may be accepted for creation/update and may be decrypted internally for outbound calls, but list/get responses should return only non-secret metadata plus explicit status fields.

### Chat Encryption Is Not Real E2EE Yet

Backend encryption with app-held passphrases is useful only for at-rest protection against accidental database disclosure. It is not sufficient for confidential chat because the node can decrypt. The safe target remains:

- Frontend/device owns private keys.
- Public/device keys are discoverable through user or group metadata.
- Messages and attachments are encrypted client-side.
- Node stores opaque encrypted envelopes and delivery metadata.
- Removed group members cannot decrypt future messages after membership/key rotation.

## Required Follow-Up Work

1. [#874](https://github.com/galtproject/geesome-node/issues/874): add a route ownership matrix for token-only handlers and convert ambiguous routes into concrete tests/fixes.
2. [#874](https://github.com/galtproject/geesome-node/issues/874): add focused tests for the highest-risk token-only handlers in `group`, `content`, `fileCatalog`, `staticSiteGenerator`, `pin`, and social import modules.
3. [#876](https://github.com/galtproject/geesome-node/issues/876): add response-shape tests that prove current external-service secrets are not returned by list/get/login/update APIs.
4. [#875](https://github.com/galtproject/geesome-node/issues/875): add public-route abuse tests for content/gateway range handling, storage misses, and webhook/auth-message replay behavior.
5. Keep backend chat encryption documented as PoC/unsafe until frontend E2EE envelopes and client-held private keys land.

## Verification Checklist

- `npm run security:route-inventory`
- Targeted tests for any route or secret-boundary fixes added after this review.
- `npm run test:docker` before merging broad security fixes that touch multiple API modules.
