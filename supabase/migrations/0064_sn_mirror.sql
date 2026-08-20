-- ════════════════════════════════════════════════════════════════════
-- 0064 — SN MIRROR: SpectroNova → Supabase read mirror (Fouad, 2026-08-18)
--        Brief: "SpectroNova → Supabase Sync + PO-Backed Bundling (v2)"
--        Investigation: SN_SYNC_INVESTIGATION.md · API facts: SN_API_FINDINGS.md
--
-- SpectroNova is the PO master (decision 2026-08-12). This migration adds
-- the mirror layer only — typed key columns + the raw SN payload per
-- document — plus the sync bookkeeping (runs, alerts, gaps, cursors).
-- Nothing here touches commitments / bundles; the accounting swap is a
-- separate migration (0065) once Phase A has run once.
--
-- Population rules learned from the probe (see investigation §1):
--   • POs and stock receipts are fetched BY ID (Path 5) — the list viewers
--     are pinned to the API user's current SN department. Ids are one
--     dense integer sequence per document family; the engine walks them.
--   • Change detection is by content hash (LastModifiedOn is unreliable).
--   • QuantityReceived on PO lines is never maintained — received qty is
--     Σ sn_sr_lines.quantity per PO line.
--   • WorkflowStatusCode 'C' = closed PO (119/550 today).
--
-- Access: every sn_* table is readable by AUTHENTICATED users only (no
-- anon), written only by the sync engine (service role, bypasses RLS).
-- The single write RPC (alert dismiss) is SECURITY DEFINER for admins /
-- accountants.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. Sync bookkeeping ──────────────────────────────────────────────

create table sn_sync_state (
  key        text primary key,          -- po_walk_floor, po_max_id, sr_walk_floor, sr_max_id, gaps_last_reprobe_at, …
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

create table sn_sync_runs (
  id           bigint generated always as identity primary key,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  trigger      text not null check (trigger in ('manual','schedule','local')),
  triggered_by text not null default '',            -- pipeline user name / 'cron'
  status       text not null default 'running'
               check (status in ('running','ok','partial','error')),
  scope        text not null default 'full' check (scope in ('full','quick')),
  stages       jsonb not null default '[]'::jsonb,  -- [{stage, ms, requests, fetched, inserted, updated, unchanged, missed, errors}]
  cursor       jsonb,                               -- resumable position (edge invocations are time-boxed; a run may span several)
  invocations  int  not null default 1,
  requests     int  not null default 0,
  error        text not null default '',
  notes        text not null default ''
);
create index sn_sync_runs_recent on sn_sync_runs (started_at desc);

create table sn_sync_alerts (
  id           bigint generated always as identity primary key,
  run_id       bigint references sn_sync_runs(id),
  kind         text not null check (kind in (
                 'po_revised',                -- hash changed on a known PO
                 'po_discovered_via_receipt', -- SR/invoice line pointed at an unknown PO id (forward walk missed it)
                 'po_discovered_via_invoice',
                 'sr_revised',
                 'invoice_revised',
                 'header_line_mismatch',      -- PO NetAmount ≠ Σ line amounts
                 'parse_failure',             -- a document could not be normalized
                 'walk_stopped',              -- forward walk hit the miss limit (info)
                 'auth_failed',
                 'stage_error')),
  ref_type     text not null default '',            -- 'po' | 'sr' | 'invoice' | 'vendor' | 'item' | ''
  ref_id       bigint,                              -- SN id
  ref_number   text not null default '',            -- PO/0423 …
  detail       jsonb not null default '{}'::jsonb,  -- e.g. {changed:[{field,old,new}], lines:{added,removed,changed}}
  created_at   timestamptz not null default now(),
  dismissed_at timestamptz,
  dismissed_by text not null default ''
);
create index sn_sync_alerts_open on sn_sync_alerts (created_at desc) where dismissed_at is null;

-- Confirmed id gaps (2 retries with backoff → still GET_DOCUMENT_DATA_FAILED).
-- Re-probed weekly, not nightly.
create table sn_id_gaps (
  family          text   not null check (family in ('po','sr','invoice')),
  sn_id           bigint not null,
  first_missed_at timestamptz not null default now(),
  last_probed_at  timestamptz not null default now(),
  probes          int    not null default 1,
  resolved_at     timestamptz,                      -- set when a later probe finds it
  primary key (family, sn_id)
);

-- ── 2. Masters ───────────────────────────────────────────────────────

create table sn_vendors (
  contact_directory_id bigint primary key,          -- Vendors.ContactDirectoryID (= tableid)
  company_name         text not null default '',
  type_description     text not null default '',    -- 'Supplier' | 'Departments' (the viewer mixes both)
  is_supplier          boolean generated always as (type_description = 'Supplier') stored,
  contact_type_id      int,
  ar_account_code      text,
  raw                  jsonb not null,
  raw_hash             text not null,
  first_seen_at        timestamptz not null default now(),
  last_fetched_at      timestamptz not null default now(),
  changed_at           timestamptz
);

create table sn_items (
  item_id          bigint primary key,              -- item.ItemID (= tableid)
  item_code        text not null default '',        -- 10-digit; joins item_spectronova_ids.item_code
  description      text not null default '',
  uom              text not null default '',
  unit_price       numeric,
  item_family_code text not null default '',
  item_type_id     int,
  gl_code          text,
  status_code      text not null default '',
  raw              jsonb not null,
  raw_hash         text not null,
  first_seen_at    timestamptz not null default now(),
  last_fetched_at  timestamptz not null default now(),
  changed_at       timestamptz
);
create index sn_items_code on sn_items (item_code);

-- ── 3. Purchase orders (Path 5 by id) ────────────────────────────────

create table sn_purchase_orders (
  sn_po_id             bigint primary key,          -- PurchaseOrderID
  po_number            text not null,               -- PurchaseOrderNumber  (PO/0423, PO/FA/0035)
  is_fixed_asset       boolean not null default false, -- PO/FA/ prefix (== OrderTypeID 5 'Asset')
  order_type           text not null default '',    -- 'Spare Parts' | 'Asset' | …
  order_type_id        int,
  is_closed            boolean not null default false, -- WorkflowStatusCode = 'C'
  workflow_status_code text,
  workflow_status_remarks text not null default '',
  posted_status        text not null default '',
  supplier_contact_id  bigint,                      -- ToContactDirectoryID → sn_vendors
  supplier_name        text not null default '',    -- ToCompany (html-stripped)
  department           text not null default '',    -- FromCompany ('364 - Hawally Governorate', '5205-Asphalt Plant Amghara' …)
  from_contact_id      bigint,                      -- FromContactDirectoryID
  contract_id          int,
  contract_name        text not null default '',
  contract_short_name  text not null default '',
  obs_code             text not null default '',
  location_code        text not null default '',
  document_date        timestamptz,
  po_date              date,                        -- document_date::date (Asia/Kuwait)
  order_due_date       date,
  currency_code        text not null default 'KWD',
  exchange_rate        numeric,
  payment_term_id      int,
  payment_terms        text not null default '',
  subject              text not null default '',
  description          text not null default '',
  remarks              text not null default '',
  net_amount           numeric,
  total_amount         numeric,
  total_quantity       numeric,
  gross_discount_amount numeric,
  revision_number      int,
  link_source_doc_type text not null default '',    -- GEN_WorkflowDocument (purchase request) | PurchaseRequisitions[_FA]
  link_source_doc_id   bigint,
  created_by_name      text not null default '',
  created_on           timestamptz,
  posted_on            timestamptz,
  line_count           int  not null default 0,
  lines_amount         numeric,                     -- Σ line_amount (compare with net_amount)
  raw                  jsonb not null,              -- full Path 5 payload (header + Item[] + List[])
  raw_hash             text not null,               -- canonical hash of typed header + lines
  first_seen_at        timestamptz not null default now(),
  last_fetched_at      timestamptz not null default now(),
  changed_at           timestamptz
);
create unique index sn_purchase_orders_number on sn_purchase_orders (po_number);
create index sn_purchase_orders_supplier on sn_purchase_orders (supplier_contact_id);
create index sn_purchase_orders_dept     on sn_purchase_orders (department, po_date desc);

create table sn_po_lines (
  sn_po_line_id      bigint primary key,            -- PurchaseOrderLineID
  sn_po_id           bigint not null references sn_purchase_orders(sn_po_id) on delete cascade,
  order_line_number  int,
  item_id            bigint,                        -- ItemID → sn_items (ItemCode is null on lines)
  item_description   text not null default '',
  remarks            text not null default '',
  uom                text not null default '',
  qty_ordered        numeric,
  unit_price         numeric,
  discount           numeric,                       -- OrderLineDiscount, stored raw, NOT applied by SN
  line_amount        numeric,                       -- OrderLineAmount (= qty × price in every observed line)
  purchase_type      text not null default '',      -- Stock | FixedAsset
  location_code      text not null default '',
  cost_code          text not null default '',
  contract_id        int,
  workflow_document_detail_id bigint,
  raw                jsonb not null
);
create index sn_po_lines_po on sn_po_lines (sn_po_id, order_line_number);
create index sn_po_lines_item on sn_po_lines (item_id);

-- ── 4. Stock receipts (Path 5 by id — list is department-pinned) ─────

create table sn_stock_receipts (
  sn_sr_id            bigint primary key,           -- StockItemTransferID
  sr_number           text not null default '',     -- Stock_Receipt/07236
  reference_number    text not null default '',     -- INVSI/14515 (linked inventory supplier invoice)
  sr_type             text not null default '',     -- 'Stock receiving'
  document_date       date,
  supplier_contact_id bigint,                       -- FromContactDirectoryID (supplier)
  supplier_name       text not null default '',     -- FromCompany
  department          text not null default '',     -- ToCompany
  contract_id         int,
  po_number           text not null default '',     -- header PurchaseOrderNumber
  link_source_name    text not null default '',     -- 'TradingInvoice'
  link_source_doc_id  bigint,                       -- TradingInvoiceID of the INVSI (NOT the PO id)
  posted_status       text not null default '',
  net_amount          numeric,
  location_code       text not null default '',
  line_count          int not null default 0,
  raw                 jsonb not null,
  raw_hash            text not null,
  first_seen_at       timestamptz not null default now(),
  last_fetched_at     timestamptz not null default now(),
  changed_at          timestamptz
);
create index sn_stock_receipts_po   on sn_stock_receipts (po_number);
create index sn_stock_receipts_date on sn_stock_receipts (document_date desc);

create table sn_sr_lines (
  sn_sr_line_id     bigint primary key,             -- StockItemTransferDetailID
  sn_sr_id          bigint not null references sn_stock_receipts(sn_sr_id) on delete cascade,
  line_number       int,
  item_id           bigint,
  item_code         text not null default '',
  description       text not null default '',
  uom               text not null default '',
  quantity          numeric,
  unit_price        numeric,
  amount            numeric,
  sn_po_id          bigint,                         -- line PurchaseOrderID (soft ref; PO may be fetched later)
  sn_po_line_id     bigint,                         -- line PurchaseOrderLineID → sn_po_lines
  order_line_number int,
  is_closed_flag    text not null default '',       -- IsClosed 'Y'/'N'
  location_code     text not null default '',
  raw               jsonb not null
);
create index sn_sr_lines_po_line on sn_sr_lines (sn_po_line_id);
create index sn_sr_lines_po      on sn_sr_lines (sn_po_id);

-- ── 5. Supplier invoices (SupInv via list; INVSI via SR links, Path 5) ─

create table sn_supplier_invoices (
  sn_invoice_id        bigint primary key,          -- TradingInvoiceID
  doc_number           text not null default '',    -- SupInv/1553 | INVSI/14515
  invoice_type         text not null default '',    -- Path 5 Type ('Inventory Supplier Invoice', 'AP Supplier Credit Note' …)
  document_date        date,
  supplier_contact_id  bigint,                      -- FromContactDirectoryID
  supplier_name        text not null default '',
  department           text not null default '',    -- ToCompany
  contract_id          int,
  po_number            text not null default '',
  sn_po_id             bigint,                      -- DefaultPurchaseOrderID (= PurchaseOrderID on INVSI)
  reference_invoice_number text not null default '',-- supplier's own invoice no.
  reference_invoice_date   date,
  net_amount           numeric,
  total_amount         numeric,
  posted_status        text not null default '',
  currency_code        text not null default 'KWD',
  link_source_name     text not null default '',
  link_source_doc_id   bigint,
  discovered_via       text not null default 'list' check (discovered_via in ('list','sr_link','walk')),
  line_count           int not null default 0,
  raw                  jsonb not null,
  raw_hash             text not null,
  first_seen_at        timestamptz not null default now(),
  last_fetched_at      timestamptz not null default now(),
  changed_at           timestamptz
);
create index sn_supplier_invoices_po   on sn_supplier_invoices (sn_po_id);
create index sn_supplier_invoices_date on sn_supplier_invoices (document_date desc);

create table sn_invoice_lines (
  sn_invoice_line_id bigint primary key,            -- TradingInvoiceDetailID
  sn_invoice_id      bigint not null references sn_supplier_invoices(sn_invoice_id) on delete cascade,
  line_number        int,
  item_id            bigint,
  item_code          text not null default '',
  description        text not null default '',
  uom                text not null default '',
  quantity           numeric,
  unit_price         numeric,
  amount             numeric,
  sn_po_id           bigint,
  sn_po_line_id      bigint,
  order_line_number  int,
  cost_code          text not null default '',
  raw                jsonb not null
);
create index sn_invoice_lines_po_line on sn_invoice_lines (sn_po_line_id);

-- ── 6. Views ─────────────────────────────────────────────────────────

-- Per PO LINE: ordered vs received (Σ stock-receipt lines) vs invoiced.
-- "bundled" joins in 0065 once bundles can point at SN lines.
create or replace view sn_po_line_received as
select l.sn_po_line_id,
       l.sn_po_id,
       p.po_number,
       p.is_fixed_asset,
       p.is_closed,
       p.supplier_contact_id,
       p.supplier_name,
       p.department,
       p.po_date,
       l.order_line_number,
       l.item_id,
       coalesce(nullif(l.item_description,''), i.description, '') as item_description,
       i.item_code,
       l.uom,
       l.qty_ordered,
       l.unit_price,
       l.line_amount,
       coalesce(r.received_qty, 0)                        as received_qty,
       coalesce(r.received_amount, 0)                     as received_amount,
       coalesce(r.receipt_count, 0)                       as receipt_count,
       coalesce(v.invoiced_qty, 0)                        as invoiced_qty,
       l.qty_ordered - coalesce(r.received_qty, 0)        as unreceived_qty
from sn_po_lines l
join sn_purchase_orders p on p.sn_po_id = l.sn_po_id
left join sn_items i        on i.item_id = l.item_id
left join lateral (
  select sum(s.quantity) as received_qty, sum(s.amount) as received_amount,
         count(distinct s.sn_sr_id) as receipt_count
    from sn_sr_lines s where s.sn_po_line_id = l.sn_po_line_id) r on true
left join lateral (
  select sum(x.quantity) as invoiced_qty
    from sn_invoice_lines x where x.sn_po_line_id = l.sn_po_line_id) v on true;

-- Latest run + open alert count, for the accounting sync panel.
create or replace view sn_sync_status as
select r.id as run_id, r.started_at, r.finished_at, r.trigger, r.triggered_by, r.status,
       r.stages, r.requests, r.error,
       (select count(*) from sn_sync_alerts a where a.dismissed_at is null) as open_alerts,
       (select count(*) from sn_purchase_orders)  as po_count,
       (select count(*) from sn_stock_receipts)   as sr_count,
       (select count(*) from sn_supplier_invoices) as invoice_count,
       (select count(*) from sn_vendors)          as vendor_count,
       (select count(*) from sn_items)            as item_count
from sn_sync_runs r
order by r.started_at desc
limit 1;

-- ── 7. RLS: authenticated read only; writes = service role (bypasses RLS) ─
do $$
declare t text;
begin
  foreach t in array array[
    'sn_sync_state','sn_sync_runs','sn_sync_alerts','sn_id_gaps',
    'sn_vendors','sn_items','sn_purchase_orders','sn_po_lines',
    'sn_stock_receipts','sn_sr_lines','sn_supplier_invoices','sn_invoice_lines'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "auth read" on %I for select to authenticated using (true)', t);
  end loop;
end $$;

-- ── 8. Alert dismiss (accountant/admin, JWT session) ─────────────────
create or replace function sn_alert_dismiss(p_alert_id bigint) returns json
language plpgsql security definer set search_path = public as $$
declare u pipeline_users%rowtype;
begin
  if auth.uid() is null then return json_build_object('success', false, 'error', 'no session'); end if;
  select * into u from pipeline_users where auth_user_id = auth.uid() and active limit 1;
  if not found or not (u.admin or u.accountant) then
    return json_build_object('success', false, 'error', 'not allowed');
  end if;
  update sn_sync_alerts set dismissed_at = now(), dismissed_by = u.name
   where id = p_alert_id and dismissed_at is null;
  if not found then return json_build_object('success', false, 'error', 'not found or already dismissed'); end if;
  return json_build_object('success', true);
end $$;
grant execute on function sn_alert_dismiss(bigint) to authenticated;

-- Admin check used by the sn-sync edge function ("Sync now" button):
-- returns true when the calling JWT belongs to an active admin.
create or replace function sn_sync_may_trigger() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from pipeline_users
                  where auth_user_id = auth.uid() and active and admin);
$$;
grant execute on function sn_sync_may_trigger() to authenticated;

-- ── 9. Seed cursors (from the 2026-08-18 walk; the engine re-derives) ─
insert into sn_sync_state (key, value) values
  ('po_walk_floor',  '13733'),   -- lowest PO id in existence (83 misses below, ladder to id 1 empty)
  ('sr_walk_floor',  '4300'),    -- first probe hit at 4600, miss at 4300 — engine tightens on first run
  ('walk_stop_after_misses', '25'),
  ('gap_reprobe_days', '7'),
  ('doc_refresh_days', '60');    -- receipts/invoices younger than this get re-hashed nightly
