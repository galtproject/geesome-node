# Gateway Module

## Purpose

The `gateway` module runs the public frontend/static gateway server and lets callers handle DNSLink-style GET/HEAD requests.

## Owns

- A separate Express service on `GATEWAY_PORT` or the configured gateway port.
- Static frontend serving from `frontend/dist`.
- Public GET/HEAD callback hooks that reuse the API module's request/response adapters.
- DNSLink path derivation from request host names.
- Gateway CORS/default response headers and optional access logging.

## Boundaries

- Gateway request handlers should delegate product logic to API/content/static-site modules.
- Do not add authenticated product APIs here; use the `api` module unless the route is truly gateway-specific.
- Keep DNSLink and static serving behavior independent from versioned `/v1` API routes.
- Large body limits and public headers should stay aligned with the actual gateway use cases.

## Related Docs

- [API module overview](../../api/docs/overview.md)
- [Static Site Generator module overview](../../staticSiteGenerator/docs/overview.md)
