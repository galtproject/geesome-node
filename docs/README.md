# GeeSome Node Documentation

This directory is the documentation portal for GeeSome Node. It combines generated
API reference output with handwritten architecture, operations, and module notes.

## Start Here

- [Generated API reference](./index.html): rendered apiDoc output generated from
  route annotations in `app/modules`.
- [Module docs index](./modules.md): map of modules and module-owned docs under
  `app/modules/<module>/docs/`.
- [Agent docs map](./agent-map.md): task-to-doc routing for agents and maintainers.
- [TODO and delivery plan](./todo.md): issue-backed implementation backlog.

For implementation slices, list deterministic TODO section ids with
`npm run todo:sections`, then print the exact context for one slice with
`npm run todo:context -- <section-id>`.

## Runtime Discovery

A running node exposes machine-readable docs pointers so users and agents can
start with only the node URL:

- `GET /v1` returns a discovery JSON document with docs links and route metadata.
- `GET /v1/openapi.json` returns the OpenAPI 3 document.
- `GET /v1/apidoc.json` returns raw apiDoc data.
- `GET /openapi.json`, `/swagger.json`, `/api-docs.json`, and
  `/.well-known/openapi.json` return the OpenAPI document through conventional
  paths that are not shadowed by the frontend SPA.
- API responses include docs headers, including the published IPFS docs root when
  the node has pinned docs during startup.

When `publish-docs.ts` pins this directory, links under `/ipfs/<docsStorageId>/`
can be used for the generated API page, this portal, and module docs.

## Focused References

- [Debugging and logs](../DEBUG.md)
- [Code style](./code-style.md)
- [Security review](./security-review.md)
- [Security route inventory](./security-route-inventory.md)
- [Database scalability review](./database-scalability-review.md)
- [Group manifest IPLD scalability](./group-manifest-ipld-scalability.md)
- [Manifest examples](./manifests-example.md)
