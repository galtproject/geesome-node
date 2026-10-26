# Google Authorization

Optional private creator-reader login. Load `googleAuthorization` after `database`
and `api`; creator-site configuration is shared with `membership`.

Google Identity Services uses the site's existing client ID and authorized origin.
The browser first calls `GET /v1/login/google/challenge` with same-origin cookies,
then passes the returned `nonce` to `google.accounts.id.initialize`. Its callback
POSTs `{credential}` to `/v1/login/google` on the same site origin. The challenge
cookie is HttpOnly, expires after five minutes and is consumed under a row lock.
The Google SDK verifies the signature/audience/issuer/time; the module checks the
verified subject, email status and exact nonce. Failed verification does not
expose the provider's exception or credential. Registration is opt-in per site.

An identity has a UUID, immutable provider/subject uniqueness and a core User id.
New core users have randomized names, no email/password/static-ID/manifest and no
permissions or API keys. Verified name/email stay only in `loginIdentities`.
Different Google subjects are never joined by email. Existing creator accounts
are not automatically linked; a future explicit authenticated account-link flow
must prove ownership of both accounts. ForeignAccount claims are not trusted.

Opaque browser sessions are defined by `api/browserSession.ts`, stored hashed in
`browserSessions`, expire after 30 days and are bound to a site. They are accepted
only by explicit creator endpoints. Existing password/Ethereum bearer APIs are
unchanged. Cookie names use the `__Host-` prefix, Secure, HttpOnly, Path=/ and
SameSite=Lax. HTTPS is required even for a production-like local browser test.
Logging in rotates the presented site's old session. Logout revokes the current
site session; other sites/devices are independent. Deleted core users cannot use
or recreate an identity through a surviving orphaned session.

The login/challenge limiter is per process and direct socket IP (120 attempts per
site/minute, bounded map). Reverse proxies should also enforce per-client limits
at ingress; forwarded IP headers are not trusted by this module. Expired
challenges/sessions are cleaned when a new challenge is admitted.

Site POSTs require the exact configured Origin; GETs reject explicitly foreign
origins/fetch-site. Unknown Hosts fail closed. The proxy must preserve the
configured Host and expose only intended routes. No broad cross-origin cookie
sharing or CORS credential relaxation is required.

Endpoints: challenge, login, `GET /v1/browser-session`, and
`POST /v1/browser-session/logout`. Personalized responses are no-store.

See [migration plan](../../../../docs/plans/creator-membership-migration.md) and
[membership setup](../../membership/docs/overview.md).
