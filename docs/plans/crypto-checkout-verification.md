# Crypto checkout verification and credit policy

Tracking: [#1530](https://github.com/galtproject/geesome-node/issues/1530).

## Contents

- [Scope and acceptance](#scope-and-acceptance)
- [Chain audit](#chain-audit)
- [Credit policy](#credit-policy)
- [No-funds verification](#no-funds-verification)
- [Deployment and remaining work](#deployment-and-remaining-work)

## Scope and acceptance

User requirements: independently audit eraofwave checkout through GeeSome; explain missing receipt visibility; show the remainder for underpayment; award extra time for excess; automatically apply an affordable longer-duration tariff. The user clarified that “next level” means subscription duration, not different content permissions.

Read-only payment-engine audit and UI/integration inspection ran as independent workstreams. Implementation belongs to GeeSome; Microwave Girls' old checkout and workers remain retired. Completion requires focused arithmetic/controller tests, real PostgreSQL settlement and HTTP checks, plus desktop/narrow checkout evidence. No production balance, receipt or paid flag is edited.

## Chain audit

The current chain is generated creator UI → site-cookie payments API → frozen invoice/address/block boundary → `PAYMENTS_WORKER` observer → receipt/balance proof and finality → resource-locked SQL transaction → paid period → account entitlement → full/public snapshot selector. The subscription grants archive access, never group-management permissions.

- GET invoice and the browser's check button read the saved ledger; they do not query chain state. Observation requires `PAYMENTS_WORKER=1`; collection has its own independent flag and never gates access.
- A wallet's latest balance can precede finality. Previously a partial unfinalized payment looked like zero/pending. The DTO now separates `pending` from finalized `received`, and any detected unfinalized funds produce `confirming` before expiry. UI advises waiting rather than copying a misleading remainder while funds are confirming.
- Worker scans are bounded, serial in batches of ten, with 15-second active scheduling, 30-second error retry and 45-second per-scan budgets. A five-second browser poll does not guarantee five-second blockchain detection.
- Wrong asset/network, pre-invoice funds, expiry, unavailable historical state, reorgs, unknown outgoing nonces, an active scan lease, or RPC errors can prevent credit. `lastError` and the durable receipts/checkpoints distinguish these cases.
- Changing only `payments_crypto_invoices.status` to `paid` creates no subscription. Changing `payments_invoices.status` first can also bypass the grant guard. Never use production paid flags as a payment simulation.
- A paid invoice is terminal. New invoices reuse managed addresses but start a new block window. Deposits received after settlement require a fresh invoice; unsolicited transfers do not choose a tariff. Continuing scans of paid invoices would require new window ownership and delta collection accounting: treasury currently freezes one collection per invoice. Merely adding `paid` to the scan query is unsafe.
- Failed account refresh after paid previously stopped checkout polling. The generated checkout now awaits a successful account/access refresh before stopping, retaining retry after failures.

## Credit policy

Partial finalized payments accumulate without access until the selected minimum is reached. Quotes retain their expiry; late sufficient payments require owner approval. Automatic credit uses only verified on-time value. Owner-approved late credit uses the verified total.

At invoice creation, freeze enabled USD tariff id/label/period and each exact atomic price using the invoice exchange rate. Settlement selects the eligible tariff that yields the most time, never shorter than the purchased period. This also avoids reducing access for an unusually priced longer tariff. Divide received atomic units by that tariff's atomic price, multiply by its calendar-month count, grant whole calendar months with the existing UTC anchor, then a proportional fraction of the next anchored month. Arithmetic stays integer until date milliseconds; fractions below one millisecond are rounded down.

With $4/month and $20/six months, $6 grants 1.5 calendar months; $20 grants six months; $22 grants 6.6 calendar months. The exact extra days depend on the calendar anchor. A quoted tariff edit does not change the saved choices. Historic pending invoices without choices use only their original tariff; already-paid periods are not retroactively modified.

The original invoice snapshot remains unchanged for billing/refund identity. The selected credited tariff, resulting start/end and fractional extraDays are saved separately in the crypto snapshot and returned as `credit`. One period per invoice and settlement/credit in the same transaction preserve restart/concurrency idempotency. No schema migration or signer change is required.

## No-funds verification

Use `npm run test:creator-membership:docker`: disposable named PostgreSQL and test-profile Kubo, real production models/API/settlement, fake Google/chain inputs and no transfers. The HTTP regression creates an invoice, injects a partial unfinalized receipt, reads `confirming` and no access, then injects $22 confirmed, runs concurrent observation and checks the frozen six-month tariff, excess days, account expiry and exactly one period. SQL vectors also cover old snapshots, proportional credit and concurrent late approval. Observer tests retain canonical/finality validation.

Use `npm run test:ssg-membership-browser -- --checkout` for the real generated Vue bundle and mocked HTTP presentation states at desktop/narrow widths. The browser helper requires the repository Playwright image; prepare it from `microwave-girls/test/e2e/Dockerfile` when absent. Presentation-only captures do not establish production settlement. Inspect the screenshot manifest descriptions and rendered images.

For a live reader invoice, first collect its invoice id, asset/network/address, configured site, quote deadline, saved error, nextCheckAt/lease and whether a matching paid period exists. Check worker configuration privately without printing secrets. The owner-only existing `POST /v1/payments/admin/:resource/invoices/:id/rescan` invokes real verification; it does not forge a receipt or send funds. Approval accepts only already verified sufficient late payments. A UI screenshot marked paid by SQL alone is not evidence of the chain.

## Deployment and remaining work

Deploy backend and the regenerated creator snapshots together. New UI supports older servers by omitting missing pending/credit fields; older UI ignores added fields. Existing periods, quote deadlines, wallet allocation and signed journals remain intact. No deployment or production smoke is implied by local tests. Rolling back stops the new credit policy for unsettled invoices but does not remove periods already granted.

Remaining separate scope: accepting additional funds after a paid invoice needs delta receipt ownership, additive access credit without overlapping later periods, late approval for excess, and immutable delta collection jobs. It must include paid→topup→new invoice races and topup after signing/collection. The checkout explicitly requires a new invoice after confirmation. Multiple transfers that finalize after the invoice already settles fall within this limitation; do not promise a permanent deposit-account subscription.

Implementation review found and fixed a renewal-anchor edge case: a fractional
period ending March 16 after a January 31 purchase must renew to April 16,
not April 30. The saved renewal anchor follows the resulting date, retaining
the original anchor for end-of-month clamping. Both arithmetic and real SQL
regressions cover the subsequent invoice.

Final local evidence (2026-11-03): `test:creator-membership:docker` passed
82 membership tests and 61 payment tests, with no skipped payment cases.
`test:ssg-creator-types`, `security:route-inventory`, `generate-docs` and diff
whitespace checks passed. The focused `--checkout` browser path passed with
20 file-backed captures with descriptions/viewports. Partial, confirming and
credited states were visually inspected at 1280px and 390px. No overflow or
broken visible images was detected. The full browser reference-parity invocation
fails first on differing crypto-help link order in the unchanged help component;
the new focused option runs the affected checkout contracts independently.
Artifacts remain ignored under `test/.geesome-test-output/membership-browser`.
