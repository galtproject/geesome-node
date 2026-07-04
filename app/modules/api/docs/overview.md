# API Module

## Purpose

The `api` module owns the Express HTTP surface, route registration helpers, authorization wrappers, route discovery, and API documentation/OpenAPI serving.

## Owns

- Versioned `/v1/*` and unversioned route registration for GET, POST, and HEAD handlers.
- Authorized route wrappers that resolve bearer tokens to users and API keys.
- Request/response adapter objects passed into feature modules.
- Raw JSON body capture for signed/protocol-style routes such as ActivityPub inboxes.
- Default CORS/storage headers, route discovery, generated API docs, and OpenAPI output.

## Security Boundaries

- Feature modules must choose authorized vs public route helpers deliberately.
- Route changes must update apiDoc annotations and the security route inventory.
- Public protocol routes should use unversioned helpers only when external protocols require it.
- Raw request bodies are for signature verification and should not be mutated before protocol checks.
- Error responses should avoid leaking secrets or full internal payloads.

## Boundaries

- Keep business logic in feature modules, not inside route wrappers.
- Do not bypass `app.runWithApiKey` for authorized routes that need API-key-scoped behavior.
- Keep route list output and generated docs aligned with the registered route surface.

## Related Docs

- [Security route inventory](../../../../docs/security-route-inventory.md)
- [Code style](../../../../docs/code-style.md)
