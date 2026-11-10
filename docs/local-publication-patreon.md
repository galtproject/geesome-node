# Patreon publication jobs

Tracking: #1549. The socNetPublishing queue additionally accepts `patreon` and exposes
`patreonPublishing` and `networkQueues` capabilities from the read-only outbox.
Credentials and browser sessions belong only in GeeSome Client.

A Patreon target contains a title (1–200 characters), `audience` (`free_members`
or `paid_members`), a nonempty `teaserText` prefix and a numeric `campaignId`.
The protected text must follow the teaser. Explicit group jobs may omit account
and campaign until the configured local route fills both at atomic claim.
Routing never replaces authored fields or recomputes the producer digest.

One prepared job carries 1–20 ordered still-image previews under the existing
`social-images-v1` policy. Original source assets and existing rendition cache
behavior remain unchanged. Other network image limits are unchanged.

GET local-publications accepts `network`, intersected with owner, selected source,
status, IDs and compose key before sorting/pagination. Each client network queue
therefore has independent pages without filtering a mixed page in the browser.
The same durable jobs and serial worker remain authoritative; no second queue or
import scheduler is introduced. Failed/ambiguous jobs retain existing recovery
rules and are never automatically republished.

This adds validation/JSON target fields and additive capabilities; it changes no
column or existing replay hash. Existing jobs and clients retain their behavior.
Roll out this node support before enabling Patreon in the client or producer.
The client verifies the creator, media readiness, native access rules and exact
paywall before its single publication request. The producer defaults Patreon
spacing to 1440 minutes and freezes it in its existing receipt.

Focused coverage verifies owner-scoped network pagination, explicit member
access, native preview preparation, deferred campaign routing, producer digest
preservation and replay. API documentation, route inventory and scalability
inventory were checked locally. Provider calls are covered by synthetic client
fixtures rather than live publication.
