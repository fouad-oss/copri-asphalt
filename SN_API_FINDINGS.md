# SpectroNova Read API — Findings

*Canonical findings file. Supersedes the 2026-08-12 exploratory probe (its still-valid results are folded in and marked "(08-12)"). Read-only probe of the SN webhook API run **2026-08-18** with the `api@copri.com` API user against tenant "Copri Live". No writes, no Supabase changes. Password and token never written to disk. Reproduce with `node scripts/sn-api-probe.mjs` (full) or `--only po` (PO stage) — credentials from gitignored `.env.sn`; raw dumps in gitignored `sn-api-dumps/`.*

---

## 1. Verdict

**The API works end-to-end (auth, list, single-record) — 60+ calls, all HTTP 200, all documented types answer, avg ~0.7 s.**

**Purchase Orders: YES — retrievable, with priced line items, but only by ID via Path 5.**

- `PurchaseOrder` **is** a valid DocumentType (undocumented in the vendor guide). Path 5 (`spectro-documentdata`) returns the full PO header (112 fields) plus an `Item[]` array with `ItemID`, `ItemDescription`, `QuantityOrdered`, `QuantityReceived`, `UOMCode`, `OrderUnitPrice`, `OrderLineAmount`, `PurchaseType`, `PurchaseOrderLineID`. Verified on material PO **`PO/0423`** (Type "Spare Parts", 3 priced lines) and on Fixed-Asset POs.
- **But the Path 3 list viewer for `PurchaseOrder` is scoped: it returns only 6 records, all `PO/FA/*` (Fixed Asset).** Material POs (`PO/0104 … PO/0471` are referenced by stock receipts) never appear in the list, and `Clause` is silently ignored on that viewer. So the API cannot *enumerate* POs today.
- **Workarounds for enumeration** (until SN fixes the viewer): (a) PO IDs are one integer sequence shared by FA and material POs (`13801 … 14245` observed; `PO/0423` = 14241) — Path 5 by ID over the range works and returns `GET_DOCUMENT_DATA_FAILED` for gaps; (b) `inventorySR` (Path 3, 921 rows, filterable by `PurchaseOrderNumber='PO/0423'`) and `AP_SupplierInvoice`/`inventorySR` Path 5 lines expose `PurchaseOrderID` + `PurchaseOrderLineID` for every received/invoiced PO. Neither is a substitute for a working list viewer — question #1 for the vendor.
- **PO references on other documents:** stock receipts carry `PurchaseOrderNumber`/`PODate`/`DefaultPurchaseOrderID` on the header and `PurchaseOrderID`/`PurchaseOrderLineID`/`OrderLineNumber` on every line; supplier-invoice lines carry the same trio (null on the credit notes sampled). GRN is empty (0 rows) — SN books material receipts as `inventorySR`, not GRN.

Secondary: **`Clause` works only for some columns** (unqualified column names collide across joined tables → `Ambiguous column name` SQL error), **dates must be ISO `YYYY-MM-DD`** in clauses, and — as on 08-12 — **the bearer token is not enforced on data endpoints** (this whole probe never sent `Authorization` and every call succeeded).

---

## 2. Protocol behaviour (confirmed)

| Aspect | Observed |
|---|---|
| Auth | `POST /spectro-auth {email,password}` → `{status:"success", token, tenantInfo}`. Token = Firebase RS256 JWT (~1 h). **Tenant id is not in `tenantInfo`; it is in the JWT payload `activeTenant.tenantId`** (also `userClaims.tenants[]`). `tenantInfo` = `{tenantType, tenantName, isWhiteBrand, staging{tenantUrl,connectionString,storageBucketName}, prod{…}}` — still ships encrypted DB connection strings (08-12 finding stands). |
| Data calls | `?tenantid=<id>` + header `x-tenant: <JSON.stringify(tenantInfo)>`. **`Authorization` header not required** (never sent in this run). |
| Envelope Path 3 | `{status, message, last_page, totalCount, data[]}`. Path 5: `{status, message, data{}}` (object, not array). Always HTTP 200; failures = `status:"error"`, `code: GET_TABLE_DATA_FAILED / GET_DOCUMENT_DATA_FAILED`, `message` = full .NET stack trace (leaks server paths). |
| Type names | Case-insensitive (`Vendors` ≡ `vendors`; SR record links say `InventorySR`). |
| Pagination | `page`/`size` honoured; `size` 200 worked (08-12); page past `last_page` → `success` with empty `data`. |
| Values | **Every scalar is a string** (numbers, booleans `"True"/"False"`, dates) in Path 3; Path 5 returns real numbers/nulls for some header fields (`NetAmount: <number>`, `LinkSourceDocID: 61532`). Money strings sometimes formatted (`"5,224.800"` on `inventorySR.NetAmount`) — strip commas. |
| Dates | Mixed per field: `dd/MM/yyyy`, `dd/MM/yyyy HH:mm:ss`, `18 Aug 2026`, ISO `2026-07-26T12:08:50.38`, and even `2026-07-25` — parse per field. |
| HTML in fields | The "link" column of every list (`ContactDirectoryID`, `DocumentNumber`, `DocNumber`, `COAID`, `CostCenterID`, `StockNumber`, `PO Number`) is `<a href="/document/<Type>/<id>">…</a>`; PO line `QuantityOrdered`/`UOMCode`/`ItemDescription`/`OrderLineNumber` wrapped in `<div style=…>`. Strip tags. |
| UTF-8 | Arabic comes back correctly (`ItemDescription`, SR line `Description` "شركة بترومزن"); no mojibake seen. |
| Timing / limits | 60+ sequential calls, 290–1,450 ms (avg ~710 ms). No rate-limit headers, no throttling, no non-200. Server `nginx/1.24.0`. |
| Sorting | Lists appear newest-first by internal id (JV, AP, SR). |

---

## 3. Per-type findings (Path 3, page 1, size 50)

All list rows carry `tableid` (+ often `tablereference`) — **`tableid` is the Path 5 `DocumentId`** for every type tested. `WorkflowDocumentID` never appears in list rows.

### 3.1 `Vendors` — 636 rows, id `tableid` = `ContactDirectoryID`
| Field | Type | Notes |
|---|---|---|
| tableid / tablereference | num-str / str | tablereference = CompanyName |
| ContactDirectoryID | HTML link | `<a href="/Document/Vendors/1115">1115</a>` — **join key to our `vendor_spectronova_ids`** |
| CompanyName | str | |
| AR_AcccountCode (sic) | num-str, ~58 % null | AP control account |
| TypeDescription / ContactDirectoryTypeID | str / num-str | page 1: 29 "Departments" (id 1027) + 21 "Supplier" — **the viewer mixes internal departments with suppliers; filter on TypeDescription='Supplier'** |

Path 5 (`vendors`/`Vendors` identical): **199 fields** — full contact master (`ShortName`, `CompanyName2`, addresses, phones, `EmailAddress`, `CurrencyCode`, `PaymentTermDays`/`PaymentTerms`/`PaymentTermID`, bank block `BankName/IBANNumber/SwiftCode/BeneficiaryName`, `CivilIDNumber`/`PassportNumber` (employee fields — the same table holds people), `Status`, `CreatedOn`, `LastModifiedOn`, `Contact-List[]`). Clause `ContactDirectoryID=1115` → 1, bogus → 0 ✅.

Redacted sample: `{tableid:"1115", CompanyName:"<dept name>", AR_AcccountCode:"21011xxxxx", TypeDescription:"Departments", ContactDirectoryTypeID:"1027"}`

### 3.2 `item` — 247 rows, id `tableid` = `ItemID`; **108 fields, 79 always null**
Non-null: `ItemID, ItemCode (10-digit, = tablereference), DocumentNumber (HTML), UOMCode, ItemDescription (Arabic seen), UnitPrice, ItemGroupCode, ItemStatusCode, DynamicField01, ItemFamilyCode ("11.01.01"), ItemTypeID, GLCode, ContractID, CreatedByName/ID/On (20/06/2025 = mass import), Is* booleans`. `LastModifiedOn` null. **`ItemCode` / `ItemID` = join to our `item_spectronova_ids`.** (08-12: Clause ignored on this viewer.)

### 3.3 `GLCOA` — 300 rows, id `tableid` = `COAID`
`COAID (HTML), CompanyCode "101", NLCode, NLName ("1 - Assets"), RootType, CurrencyCode KWD, ReportType (B/P), ParentNLCode, SubLedgerType`. Clean hierarchy — matches our `gl_accounts` needs.

### 3.4 `GLCostCenter` — 18 rows (all on page 1), id `tableid` = `CostCenterID`
`CostCenterCode, CostCenterName/Name2, CostCenterShortName, IsGroup, ParentCostCenterCode, Level, lft/rgt` (nested-set tree). 21 always-null audit/dynamic fields.

### 3.5 `AP_SupplierInvoice` — **1,482 rows**, id `tableid` = `TradingInvoiceID` (also `ContactDirectoryTrxID`); 34 list fields, 8 always null (`ReferenceNumber, DocumentStatus, Act*, PendingWith, ElapsedDays`)
List: `DocNumber (HTML), DocumentNumber ("SupInv/1553"), Type, InvoiceType, DocumentDate, FromCompany (supplier), FromContactDirectoryID, ToCompany (project "364 - Hawally Governorate"), ContractID, NetAmount, TotalAmount, ReferenceInvoiceNumber (supplier's number), ReferenceInvoiceDate, PostedStatus, Description/Title, Variation`. Page 1 was 50 × "AP Supplier Credit Note / Supplier Invoice (Committed)" dated 31/07/2026 from one supplier — the type also serves **Inventory Supplier Invoices** (`INVSI/14515`, Type "Inventory Supplier Invoice"), i.e. it is the whole TradingInvoice table.

Path 5: **170 fields + `Items[]`** (line keys incl. `LineNumber, ItemID, ItemCode, Description, UOMCode, Quantity, UnitPriceFC, AmountFC, AmountLC, CostCode, PurchaseOrderID, PurchaseOrderLineID, OrderLineNumber, LinkSourceDocType/DocID, ContractID`), header extras `PurchaseOrderNumber, PODate, DefaultPurchaseOrderID, LinkSourceDocID, CurrencyCode, ExchangeRate, PaymentTermID, PostedBy/On, CreatedOn, LastModifiedOn, RevisionNumber, suppliername/suppliercode`. Path 5 on the credit notes: PO fields null; on `INVSI/14515`: `PurchaseOrderNumber PO/0423`, `DefaultPurchaseOrderID 14241`, both lines `PurchaseOrderID 14241` / `PurchaseOrderLineID 77357`. **This is our invoice→PO→line join.**

Redacted sample: `{tableid:"61552", DocumentNumber:"SupInv/1553", Type:"AP Supplier Credit Note", DocumentDate:"31/07/2026", FromCompany:"<supplier>", FromContactDirectoryID:"2102xx", ToCompany:"364 - Hawally Governorate", NetAmount:"xxx.x", ReferenceInvoiceNumber:"<supplier inv no>", PostedStatus:"Posted"}`

### 3.6 `GRN` — **0 rows** (viewer exists). Receipts are `inventorySR`.

### 3.7 `inventorySR` — 921 rows, id `StockItemTransferID` (no `tableid`!) — Path 5 accepted `StockItemTransferID`
List: `StockNumber (HTML → "Stock_Receipt/07236"), DocumentNumber, ReferenceNumber/TIDocNumber ("INVSI/14515" = linked inventory supplier invoice), Type "Stock receiving", DocumentDate ("18 Aug 2026"), FromCompany (supplier), ToCompany (project), ContractID, NetAmount ("5,224.800"), **PurchaseOrderNumber ("PO/0423")**, PostedStatus`. Always null: `Act, ActDate, itemcode`. Page 1 references 17 material POs (`PO/0104 … PO/0471`).
Path 5: 83 header fields (`DefaultPurchaseOrderID`, `LinkSourceName "TradingInvoice"`, `LinkSourceDocID` = the INVSI id, `PurchaseOrderNumber`, `PODate`) + `Items[]` (53 keys: `ItemID, ItemCode, Item_ItemCode, Item_ItemDescription, Description, UOMCode, Quantity, UnitPriceFC, AmountFC, LineAmount, LandingPriceLC, PurchaseOrderID, PurchaseOrderLineID, OrderLineNumber, IsClosed, LocationCode "1SHUST000", ContractID`) + `Additional-Charges[]`. Clause `PurchaseOrderNumber='PO/0423'` → 2 ✅ (quoted strings work here); `ReferenceNumber='…'` → *Ambiguous column*.

### 3.8 `JV` — **7,349 rows**, id `ContactDirectoryTrxID` (no `tableid`)
List: `DocNumber (HTML), TrxNumber ("JV/8/2026080971"), DocumentDate, PostingDate, ReferenceNumber ("C26080058" — NUBA voucher no. per CLAUDE.md), Description, PostedStatus, OBSCode, ContractID, DynamicField01, CreatedByName, TypeDescription "Journal General", ContactDirectoryTrxTypeID 8`. Always null: `LocationCode, AmountFC, NetAmountFC`.
Path 5: 35 fields + **`Journal-Entries[]`** (`LineNumber, GLCode, GlDescription, DC, DebitAmount, CreditAmount, AmountFC/LC, Description, CostCode, ContractID, ContactDirectoryID, ItemID, AssetID`). Clause `PostingDate>='2026-08-01'` → 15 ✅, `>='2099-01-01'` → 0 ✅, `>='01/08/2026'` → 560 (parsed as MM/dd → **use ISO**).

### 3.9 `PaymentSp` — **1 row** (viewer scoped or barely used), id `TradingInvoiceID`
`DocNumber "PAY/261888", ReferenceNumber, Type "LeasingRevenue", DocumentDate, FromCompany (bank account), FromContactDirectoryID, Description, ContractID, amountfc, ReceiptCode, ReceiptType "Cheque", CreatedByName, OBSCode`. Always null: `PostedStatus, NetAmount, ToCompany, DocumentStatus…`. One record cannot be the payment population — ask vendor (question #4).

### 3.10 `PurchaseOrder` (undocumented, works) — list 6 rows (FA only), id `tableid` = `PurchaseOrderID`
List (35 fields, 08-12 list still exact): `PurchaseOrderID, PO Number (HTML), SearchNumber, Type, Date (dd/MM/yyyy HH:mm:ss), Document Date, Supplier / To Company / ToCompanyShortName, ToContactDirectoryID, OrderTypeID, RevisionNumber, DocumentStatus (null), NetAmount, TotalAmount, TotalQuantity, DeliveryDate, PaymentTerms, ContractNumber, contractID, InitiatorName, Requestedby, AssetID`. Clause ignored (`PurchaseOrderID=-1` → 6).
**Path 5 (any PO id, including hidden material POs): 112 header fields** — `PurchaseOrderNumber/DocumentNumber, OrderType ("Spare Parts" / "Asset"), OrderTypeID, PostedStatus ("Posted"), DocumentStatus (null), WorkflowStatusCode (null), ToContactDirectoryID (supplier FK), ToCompany, FromCompany (project), ContractID/ContractName/ContractShortName, DocumentDate (ISO), PODATE, OrderDueDate, ShipDate, CurrencyCode, ExchangeRate, PaymentTermID/PaymentTermDescription ("30 Days Credit"), NetAmount, TotalAmount, TotalQuantity, GrossDiscount*, RevisionNumber, CreatedOn, LastModifiedOn (date-only), LinkSourceDocType ("GEN_WorkflowDocument" for material = the purchase request; "PurchaseRequisitions_FA" for assets), LinkSourceDocID, Description, Remarks, OrderFooter` + **`Item[]`** (46 keys, listed in §1) + `List[]` (asset register rows, FA POs only). `QuantityReceived` was `0` on PO/0423 lines despite a posted 78 m receipt — either not maintained or lags; verify with vendor.
Redacted PO/0423 line: `{ItemID:"14378", ItemDescription:"Hdpe Pipes", QuantityOrdered:"240", UOMCode:"M", OrderUnitPrice:"xx", OrderLineAmount:"xxxx", QuantityReceived:"0", PurchaseType:"Stock", PurchaseOrderLineID:"77357"}`. Note **`ItemCode` is null on PO lines — use `ItemID` → `item.ItemID`**.

`PurchaseOrderDetail` (49 rows, asset-identity only, filterable — 08-12) is the FA asset sub-list, not the priced lines. `LPO` exists, empty. Not found: `PO, AP_PurchaseOrder, POrder, PurchaseVoucher, AP_PurchaseVoucher` (+ the 08-12 miss list).

---

## 4. Integration-relevant observations

- **Join keys to our pipeline masters:** `Vendors.ContactDirectoryID` (= `tableid`) ↔ `vendor_spectronova_ids`; `item.ItemID`/`ItemCode` ↔ `item_spectronova_ids`; PO lines link via `ItemID` only. Supplier on POs/invoices = `ToContactDirectoryID` (PO) / `FromContactDirectoryID` (AP invoice, SR) — direction flips per document.
- **PO ↔ receipt ↔ invoice chain is fully keyed:** `PurchaseOrder.PurchaseOrderID` + `Item[].PurchaseOrderLineID` ⇐ `inventorySR.Items[].PurchaseOrderID/PurchaseOrderLineID` ⇐ `AP_SupplierInvoice(INVSI).Items[]` same pair; SR header `LinkSourceDocID` = INVSI `TradingInvoiceID`. Our ~424 imported POs are the `PO/0nnn` series (highest seen `PO/0471`).
- **Sync design implications:** (1) PO enumeration needs either the vendor unlocking the list viewer or an ID-range walk (Path 5, one call per PO, ~450 calls, `GET_DOCUMENT_DATA_FAILED` on gaps); (2) `LastModifiedOn` exists on PO/invoice/vendor headers (Path 5) but is date-only and null on many — incremental sync must be a full re-pull + diff or driven by `CreatedOn`/max-id watermarks (`tableid`s are monotonic); (3) status: `PostedStatus` is the only populated state (`Posted`); `DocumentStatus`/`WorkflowStatusCode` null everywhere → we cannot distinguish approved vs. draft POs from data; (4) amounts: line `OrderLineAmount = QuantityOrdered × OrderUnitPrice` (checks out on PO/0423), header `NetAmount` = Σ lines; all in KWD; (5) list rows are strings — cast on ingest, strip HTML and thousands separators.
- **Clause rules learned:** unqualified column; numeric compare unquoted; strings single-quoted; dates ISO; a column that exists in more than one joined table errors (`DocumentDate`, `ReferenceNumber`, `TradingInvoiceID`, `FromContactDirectoryID` on AP invoices) — use the viewer-specific ones (`ReferenceInvoiceDate` on AP, `PostingDate` on JV, `PurchaseOrderNumber` on SR, `ContactDirectoryID` on Vendors); some viewers ignore Clause entirely (`PurchaseOrder`, `item`).
- **Volumes (full pull @ size 200):** Vendors 4 calls · item 2 · GLCOA 2 · GLCostCenter 1 · AP 8 · SR 5 · JV 37 · plus Path 5 per document for lines.
- **Envelope oddities:** error `message` embeds .NET stack traces with server file paths; two id conventions (`tableid` present on some viewers, absent on SR/JV/PaymentSp); `PaymentSp` viewer shows 1 record; `Vendors` mixes departments and suppliers.

---

## 5. Open questions for SpectroNova (ready to send)

1. **Purchase orders — list access.** `spectro-tabledata` for `DocumentType: PurchaseOrder` returns only 6 records, all `PO/FA/*`, and ignores `Clause`. `spectro-documentdata` for the same type returns any PO by ID (e.g. `PO/0423`, id 14241) with full lines. Please expose the complete PO population (material/spare-parts/service orders — the `PO/0nnn` series, 400+) through the list endpoint, or tell us the DocumentType/viewer that lists them, so we don't have to walk the ID range.
2. **Authoritative DocumentType list** for our tenant (we found `PurchaseOrder`, `PurchaseOrderDetail`, `LPO`, `Quotation`, `Materials`, `PODetail` by guessing; the guide lists nine).
3. **Approval status:** `DocumentStatus` and `WorkflowStatusCode` are null on every PO/invoice; only `PostedStatus` is populated. Which field/value identifies an *approved* vs. draft/pending PO, and can `Clause` filter on it?
4. **`PaymentSp` returns 1 record and `GRN` returns 0** — are payment vouchers and goods receipts held under other viewers (receipts appear as `inventorySR`)? Which type covers supplier payments?
5. **Clause failures:** unqualified columns collide (`Ambiguous column name 'DocumentDate'` on `AP_SupplierInvoice`, `'ReferenceNumber'` on `inventorySR`) and `Clause` is ignored on `PurchaseOrder`/`item`. Which columns are filterable per viewer, and can we qualify with a table alias? Also confirm ISO `YYYY-MM-DD` is the intended date literal (`dd/MM/yyyy` is parsed as MM/dd).
6. **Incremental sync:** `LastModifiedOn` is date-only/null on most headers. Is there a reliable modified timestamp or change feed we can poll?
7. **`QuantityReceived` on PO lines stays 0** after a posted stock receipt against the line — is it maintained?
8. **Security (repeat from 08-12):** data endpoints accept requests with no `Authorization` header — only `x-tenant` + `tenantid` (static values) gate all tenant data; `tenantInfo` carries encrypted prod/staging connection strings; error messages return server stack traces. Please confirm the plan to enforce the token and trim these.
9. Minor: the guide's tenant id — we could only find it inside the JWT (`activeTenant.tenantId`); please confirm that is the intended `tenantid` query value.

---

*Files: `scripts/sn-api-probe.mjs` (probe), `.env.sn` (gitignored credentials), `sn-api-dumps/` (gitignored raw responses; runs `2026-08-18T15-32-14` full, `…15-34-56` / later PO stage).*
