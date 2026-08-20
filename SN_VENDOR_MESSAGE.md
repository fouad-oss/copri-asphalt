# Message to SpectroNova — ready to send (drafted 2026-08-20)

*Evidence for every item: `SN_SYNC_INVESTIGATION.md` + `SN_API_FINDINGS.md`. Framing per the brief: PO access was outside the original request, so item 1 is a **new ask**, not a defect claim. Copy everything below the line into an email.*

---

**Subject:** Copri API integration — working well; a few requests after our first full pass

Dear SpectroNova team,

Thank you for the API delivery (Integration Guide v2.0 and the Postman collection). We have completed a full integration pass against the webhook API and it now feeds our internal systems nightly. It works well. A few requests and observations, roughly in priority order:

**1. Purchase orders — list access (new request).**
While integrating we found that the `PurchaseOrder` DocumentType works with `spectro-documentdata` by id and returns complete headers with priced lines — very useful, thank you. The `spectro-tabledata` list for the same type, however, appears to serve the *Fixed-Asset PO* screen filtered by the API user's currently selected department: we received 2 or 6 records on different days depending on the department `api@copri.com` was last left in, while ~530 material POs exist. Could you
(a) expose the material "Purchase Order (PO)" screen as a list DocumentType, and
(b) give `api@copri.com` an all-departments context, or unpin the list viewers from the user's department?
The same applies to `inventorySR`, whose list returns only one department's stock receipts (~900 of the ~4,200 we retrieved by id).

**2. INVSI list.** The `AP_SupplierInvoice` list returns only `SupInv/*` documents; the PO-linked `INVSI/*` inventory supplier invoices are retrievable by id but never appear in the list. An INVSI list viewer would remove our need to discover them indirectly through stock receipts.

**3. PO status.** `WorkflowStatusCode = 'C'` appears to mark closed POs, while `DocumentStatus` is always null. Please confirm 'C' is the only non-open state and that a PO cannot exist in the system unapproved.

**4. Two fields that appear unmaintained — please confirm:** `QuantityReceived` on PO lines remains 0 after posted receipts (we compute received quantities from `inventorySR` lines instead), and `LastModifiedOn` is date-only and often earlier than `CreatedOn`.

**5. Payment vouchers and GRNs.** `PaymentSp` returns a single record and `GRN` returns none — which viewers hold the payment-voucher and goods-receipt populations? (Receipts appear to live under `inventorySR`.)

**6. Clause filtering.** On several viewers a `Clause` referencing common columns fails with *"Ambiguous column name"* (e.g. `DocumentDate` on `AP_SupplierInvoice`), and on `PurchaseOrder`/`item` the Clause is silently ignored. A note on which columns are filterable per viewer — and confirmation that ISO `YYYY-MM-DD` is the intended date literal — would help.

**7. Security observations, flagged for your review:**
- the data endpoints accept requests without the `Authorization` header — access is effectively gated by the static `x-tenant` header alone;
- the `tenantid` query parameter appears to be ignored;
- `tenantInfo` returned at sign-in includes encrypted staging and production connection strings;
- error responses embed full .NET stack traces with server file paths;
- the `AP_SupplierInvoice` document viewer returns any TradingInvoice-family document by id, including HR leave applications.

**8. Outage on 18–19 August.** Between roughly 01:50 and 11:00 Kuwait time every webhook returned HTTP 500 ("There was a problem executing the workflow"). Was this a known outage? For context, our initial backfill that night made about 9,000 sequential calls (~1 per second) over 12 hours; if that volume was a factor, tell us your preferred limits — our steady state is a single nightly run of roughly 1,000 calls at the same pace.

**9. Create (write) APIs — a request for your roadmap.**
The next big win for us would be write access for two document types, so we'd like to open that conversation now:

- **Stock receipts + inventory supplier invoices against a PO** (highest value). Today our site delivery notes are reconciled and bundled in our system, and your team manually transcribes each published bundle into SpectroNova as a Stock Receipt + INVSI. We already hold every field that transcription needs — supplier (`ContactDirectoryID`), PO and PO line (`PurchaseOrderID` / `PurchaseOrderLineID`), item (`ItemID`/`ItemCode`), quantity, UOM, unit price, amount, delivery date, supplier DN number — keyed to your own ids via the read API. A create endpoint would remove that retyping entirely, along with its delays and copy errors.
- **Purchase requests** (second priority, later): raising a purchase request from our field workflow so it enters your existing approval chain, with the PO created in SpectroNova as today.

From our experience integrating the read API, a create API would need, in practice:
(a) an **idempotency key** (a client reference echoed back), so a retried request after a timeout or an outage like item 8 can never post a document twice;
(b) **enforced authentication** on write endpoints (see item 7 — writes should not be reachable with the static headers alone);
(c) **validation errors as structured responses** (field + reason), rather than HTTP 200 with an embedded stack trace;
(d) the response returning the **created document's id and number** (e.g. `StockItemTransferID` + `Stock_Receipt/…`), so we can link it back immediately;
(e) an explicit **draft vs posted** behaviour — we would want to create as draft/unposted for your team's review unless you prefer direct posting;
(f) access to a **staging tenant** so we can integrate and test without touching production books.

If a document-creation API already exists in your platform, we'd gladly start from its documentation; otherwise a scoping call would be a good next step.

None of this blocks us — the integration is live — but items 1 and 2 would let us drop the by-id workarounds and reduce our call volume considerably, and item 9 is where we see the most business value next.

Happy to get on a call for any of this.

Best regards,
Fouad El Zoghby
COPRI Construction Enterprises W.L.L.
