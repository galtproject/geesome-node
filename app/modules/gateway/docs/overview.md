# Gateway Module

## Purpose

The `gateway` module runs the public frontend/static gateway server and handles DNSLink-style GET/HEAD requests.

## Owns

- A separate Express service on `GATEWAY_PORT` or the configured gateway port.
- Static frontend serving from `frontend/dist`.
- Default GET/HEAD gateway handlers that map DNSLink `/ipfs` and `/ipns` targets to content streams, using `staticId` resolution for IPNS-style IDs.
- Public GET/HEAD callback hooks for gateway-specific overrides that reuse the API module's request/response adapters.
- DNSLink path derivation from request host names.
- DNS TXT lookup through the host `dig` command.
- Gateway CORS/default response headers and optional access logging.

## Boundaries

- Gateway request handlers should delegate product logic to API/content/static-site modules.
- Do not add authenticated product APIs here; use the `api` module unless the route is truly gateway-specific.
- Keep DNSLink and static serving behavior independent from versioned `/v1` API routes.
- Large body limits and public headers should stay aligned with the actual gateway use cases.
- Deployments that use DNSLink gateway behavior must provide working DNS tooling.

## Related Docs

- [API module overview](../../api/docs/overview.md)
- [Static Site Generator module overview](../../staticSiteGenerator/docs/overview.md)
