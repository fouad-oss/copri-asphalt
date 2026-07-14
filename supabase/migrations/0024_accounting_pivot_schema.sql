-- 0024_accounting_pivot_schema.sql — ACCOUNTING PIVOT step 2 (Part 2 of
-- BRIEF-accounting-pivot.md). The app is a pre-SpectroNova workspace:
-- field notes are rectified to `matched`, bundled against SN PO LINES,
-- and published bundles feed the read-only SN data page (step 7).
--
-- Evolves pipeline v2 (Fouad's decision 2026-07-14) instead of adding a
-- parallel schema: vendors/items masters gain the SN seeds, commitments/
-- commitment_lines ARE the PO register, and the new bundles layer snaps
-- onto commitment_lines. Sections:
--   A. masters — SN names on vendor mapping, supplier 5205 seed, item seeds
--   B. PO register — po_date on commitments, remarks on commitment_lines
--   C. note reconciliation status + follow-up markers
--   D. bundles + bundle_lines + lifecycle guards
--   E. views — po_line_balance, note_recon
-- Write RPCs (bundle create/verify/publish, follow-up toggle) land with
-- their UI steps (4–5); until then triggers guard Table-Editor edits.

-- ── A. Masters: SpectroNova seeds ────────────────────────────────────

-- SN display name for the transcription layout (Supplier column shows
-- SN's own wording, zero mental translation).
alter table vendor_spectronova_ids add column sn_name text not null default '';

-- Plant dispatches are ALWAYS SN supplier 5205 — Asphalt Plant Amghara
-- (brief, hardcoded). Mapped onto the existing internal plant vendor;
-- the settings row is the single config point the client reads.
insert into vendor_spectronova_ids (vendor_id, contact_id, sn_name)
select id, '5205', 'Asphalt Plant Amghara'
  from vendors where name = 'كوبري — مصنع الأسفلت'
on conflict (vendor_id, contact_id) do update set sn_name = excluded.sn_name;

insert into pipeline_settings (key, value) values
  ('plant_dispatch_supplier',
   jsonb_build_object('contact_id', '5205', 'sn_name', 'Asphalt Plant Amghara'))
on conflict (key) do nothing;

-- Item master seeds (brief Part 2). UOM kept in SN's wording — these
-- feed the transcription layout and the frozen data-page columns.
insert into items (name, unit) values
  ('Asphalt - Type I',   'Tons'),
  ('Asphalt - Type II',  'Tons'),
  ('Asphalt - Type III', 'Tons'),
  ('Emulsion',           'm²'),
  ('M.C. 70',            'm²')
on conflict do nothing;

insert into item_spectronova_ids (item_id, item_code)
select i.id, s.code
from (values
  ('Asphalt - Type I',   '1020220001'),
  ('Asphalt - Type II',  '1020221001'),
  ('Asphalt - Type III', '1020222001'),
  ('Emulsion',           '1020249001'),
  ('M.C. 70',            '1020248001')) as s(name, code)
join items i on vendor_norm(i.name) = vendor_norm(s.name)
on conflict do nothing;

-- ── B. PO register additions ─────────────────────────────────────────

-- SN PO date. PO numbers RESET each fiscal year — never sort or infer
-- recency by number; always use this date. Nullable: backfilled from the
-- SN exports / typed by the accountant (a DN date BEFORE the PO date is
-- NORMAL — field delivery precedes paperwork — never flag it).
alter table commitments add column po_date date;

alter table commitment_lines add column remarks text not null default '';

-- ── C. Note reconciliation status ────────────────────────────────────
-- Every delivery note carries exactly ONE stored status, recomputed on
-- data change (brief tokens, EN in DB / translated in UI):
--   matched | dispatched_not_received | received_not_dispatched | qty_mismatch
-- The accountant's job is driving everything to `matched` before
-- bundling. Divergence is a data-quality SIGNAL — surfaced, never
-- blocking. followup_flag = the one-click engineer chase-up marker.

alter table dispatch_loads
  add column recon_status  text not null default 'dispatched_not_received'
    check (recon_status in ('matched','dispatched_not_received',
                            'received_not_dispatched','qty_mismatch')),
  add column followup_flag boolean not null default false,
  add column followup_at   timestamptz;
create index dispatch_loads_by_recon on dispatch_loads (recon_status, ts desc);

alter table material_receipts
  add column recon_status  text not null default 'received_not_dispatched'
    check (recon_status in ('matched','dispatched_not_received',
                            'received_not_dispatched','qty_mismatch')),
  add column followup_flag boolean not null default false,
  add column followup_at   timestamptz;
create index material_receipts_by_recon on material_receipts (recon_status, ts desc);

-- Asphalt: dispatched leg vs the latest receipt for the note.
--   no receipt                    → dispatched_not_received
--   rejected receipt              → qty_mismatch (divergence bucket)
--   accepted, weights equal/unweighed → matched
--   accepted, weights differ     → qty_mismatch
create or replace function dispatch_recon_compute(
  p_weight numeric, p_decision text, p_arrival numeric
) returns text language sql immutable as $$
  select case
    when coalesce(p_decision, '') = ''                       then 'dispatched_not_received'
    when p_decision <> 'مقبول'                               then 'qty_mismatch'
    when p_arrival is null or p_weight is null
         or p_arrival = p_weight                             then 'matched'
    else 'qty_mismatch'
  end
$$;

create or replace function dispatch_loads_recon() returns trigger
language plpgsql as $$
declare v_decision text; v_arrival numeric;
begin
  select decision, weight_arrival into v_decision, v_arrival
    from receipts where note = new.note order by ts desc limit 1;
  new.recon_status := dispatch_recon_compute(new.weight, v_decision, v_arrival);
  return new;
end $$;
create trigger trg_zz_dispatch_recon before insert or update on dispatch_loads
  for each row execute function dispatch_loads_recon();

-- Receipt changes push the status back onto the dispatch row (the no-op
-- style update re-fires the BEFORE trigger above, which recomputes).
create or replace function receipts_recon() returns trigger
language plpgsql as $$
declare v_note text;
begin
  v_note := case when tg_op = 'DELETE' then old.note else new.note end;
  update dispatch_loads set recon_status = recon_status where note = v_note;
  if tg_op = 'UPDATE' and new.note is distinct from old.note then
    update dispatch_loads set recon_status = recon_status where note = old.note;
  end if;
  return null;
end $$;
create trigger trg_zz_receipts_recon after insert or update or delete on receipts
  for each row execute function receipts_recon();

-- Materials: capture-only channel — a site receipt with no dispatch leg
-- stays received_not_dispatched until the accountant maps it to a PO
-- line AND approves it in the daily batch (0020 flow), which makes it
-- matched. (Named to fire AFTER trg_material_receipts_gate — the 0018
-- gate force-resets approval fields on insert before we read them.)
create or replace function material_receipts_recon() returns trigger
language plpgsql as $$
begin
  new.recon_status := case
    when new.approval_status = 'معتمد' and new.commitment_line_id is not null
      then 'matched'
    else 'received_not_dispatched'
  end;
  return new;
end $$;
create trigger trg_zz_material_recon before insert or update on material_receipts
  for each row execute function material_receipts_recon();

-- Backfill: no-op updates re-fire the BEFORE triggers on every row.
update dispatch_loads set recon_status = recon_status;
update material_receipts set recon_status = recon_status;

-- ── D. Bundles ───────────────────────────────────────────────────────
-- A bundle groups matched notes against exactly ONE PO line (the PO
-- LINE is the matching unit everywhere — the same item code appears on
-- multiple lines at different prices, e.g. hand-laid vs machine-laid).
-- Lifecycle (non-negotiable): draft → verified → published. Only
-- published bundles appear on the SN data page; published bundles are
-- IMMUTABLE — corrections are a NEW adjusting bundle referencing the
-- original, never an edit. After SN staff transcribe a bundle into SN,
-- imported_flag + sn_reference (INVSI/… and/or Stock_Receipt/…) are the
-- only post-publish writes (their ONLY write surface, or the accountant).

create table bundles (
  id                 bigint generated always as identity primary key,
  bundle_no          text not null unique,          -- BND-2026-001 (next_pipeline_no)
  commitment_line_id bigint not null references commitment_lines(id),
  source             text not null check (source in ('asphalt','materials')),
  status             text not null default 'draft'
                     check (status in ('draft','verified','published')),
  adjusts_bundle_id  bigint references bundles(id), -- set ⇒ adjusting bundle
  notes              text not null default '',
  created_by         text not null default '',
  created_at         timestamptz not null default now(),
  verified_by        text not null default '',
  verified_at        timestamptz,
  published_by       text not null default '',
  published_at       timestamptz,
  imported_flag      boolean not null default false,
  sn_reference       text not null default '',
  imported_at        timestamptz
);
create index bundles_by_line   on bundles (commitment_line_id);
create index bundles_by_status on bundles (status, created_at desc);

-- Lines snapshot the transcription fields (delivery date / DN number /
-- site) at bundling time — a published bundle must read the same
-- forever, whatever later happens to the note row.
create table bundle_lines (
  id            bigint generated always as identity primary key,
  bundle_id     bigint not null references bundles(id),
  note_source   text not null check (note_source in ('dispatch','material')),
  note_ref      bigint not null,               -- dispatch_loads.id / material_receipts.id
  note_no       text not null,                 -- printed DN number (data-page "Supplier DN Number")
  delivery_date date not null,
  site          text not null default '',
  qty           numeric not null,
  amount        numeric not null,              -- KWD, 3 dp — qty × PO-line rate
  is_adjustment boolean not null default false, -- denormalized from the parent (partial index below)
  unique (bundle_id, note_source, note_ref),
  check (is_adjustment or qty > 0)             -- adjustments may carry negative qty
);
create index bundle_lines_by_bundle on bundle_lines (bundle_id);
-- One note maps to exactly ONE PO line in ONE bundle — a note bills
-- once, ever (rare real splits are handled manually in SN). Adjusting
-- lines are exempt so corrections can re-reference the original notes.
create unique index bundle_lines_note_once
  on bundle_lines (note_source, note_ref) where not is_adjustment;

-- Lifecycle + immutability guard.
create or replace function bundles_guard() returns trigger
language plpgsql as $$
declare v_frozen_old jsonb; v_frozen_new jsonb;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'only draft bundles can be deleted — bundle % is %', old.bundle_no, old.status;
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    -- forward-only lifecycle (verified→draft demotion allowed pre-publish)
    if new.status is distinct from old.status
       and not (old.status = 'draft'    and new.status = 'verified')
       and not (old.status = 'verified' and new.status = 'published')
       and not (old.status = 'verified' and new.status = 'draft') then
      raise exception 'bundle lifecycle is draft → verified → published (got % → %)', old.status, new.status;
    end if;
    -- published = immutable except the import-confirmation fields
    if old.status = 'published' then
      v_frozen_old := to_jsonb(old) - 'imported_flag' - 'sn_reference' - 'imported_at';
      v_frozen_new := to_jsonb(new) - 'imported_flag' - 'sn_reference' - 'imported_at';
      if v_frozen_old <> v_frozen_new then
        raise exception 'bundle % is published and immutable — corrections are a new adjusting bundle', old.bundle_no;
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger trg_bundles_guard before update or delete on bundles
  for each row execute function bundles_guard();

-- Line guard: content is editable in DRAFT only; only matched notes may
-- enter; note channel must agree with the bundle's source tab.
create or replace function bundle_lines_guard() returns trigger
language plpgsql as $$
declare v_bundle bundles%rowtype; v_status text; v_bundle_id bigint;
begin
  v_bundle_id := case when tg_op = 'DELETE' then old.bundle_id else new.bundle_id end;
  select * into v_bundle from bundles where id = v_bundle_id;
  if v_bundle.status <> 'draft' then
    raise exception 'bundle % is % — lines are frozen', v_bundle.bundle_no, v_bundle.status;
  end if;
  if tg_op = 'UPDATE' and new.bundle_id is distinct from old.bundle_id then
    if exists (select 1 from bundles where id = old.bundle_id and status <> 'draft') then
      raise exception 'source bundle is not draft — lines are frozen';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;

  new.is_adjustment := v_bundle.adjusts_bundle_id is not null;
  if (v_bundle.source = 'asphalt'   and new.note_source <> 'dispatch')
  or (v_bundle.source = 'materials' and new.note_source <> 'material') then
    raise exception 'note channel % does not belong in a % bundle', new.note_source, v_bundle.source;
  end if;

  if new.note_source = 'dispatch' then
    select recon_status into v_status from dispatch_loads where id = new.note_ref;
  else
    select recon_status into v_status from material_receipts where id = new.note_ref;
  end if;
  if v_status is null then
    raise exception 'note %/% not found', new.note_source, new.note_ref;
  end if;
  if v_status <> 'matched' and not new.is_adjustment then
    raise exception 'only matched notes can enter a bundle (note %/% is %)', new.note_source, new.note_ref, v_status;
  end if;
  return new;
end $$;
create trigger trg_bundle_lines_guard before insert or update or delete on bundle_lines
  for each row execute function bundle_lines_guard();

create trigger trg_pipeline_audit after insert or update or delete on bundles
  for each row execute function pipeline_audit_row();
create trigger trg_pipeline_audit after insert or update or delete on bundle_lines
  for each row execute function pipeline_audit_row();

alter table bundles enable row level security;
create policy "anon read" on bundles for select to anon, authenticated using (true);
alter table bundle_lines enable row level security;
create policy "anon read" on bundle_lines for select to anon, authenticated using (true);

-- ── E. Views ─────────────────────────────────────────────────────────

-- The approvals page's CORE view: order / bundled / remaining PER PO
-- LINE — never aggregated per PO. "Received to date" counts every
-- bundle regardless of lifecycle stage; the published/pending split is
-- exposed so the UI can show both.
create or replace view po_line_balance as
select cl.id            as line_id,
       c.id             as commitment_id,
       c.number         as po_number,
       c.po_date,
       c.vendor_id,
       cl.line_no,
       cl.item,
       cl.item_id,
       cl.unit,
       cl.rate,
       cl.qty           as order_qty,
       cl.remarks,
       coalesce(sum(bl.qty) filter (where b.status = 'published'), 0)            as published_qty,
       coalesce(sum(bl.qty) filter (where b.status in ('draft','verified')), 0)  as pending_qty,
       cl.qty - coalesce(sum(bl.qty), 0)                                         as remaining_qty
from commitment_lines cl
join commitments c        on c.id = cl.commitment_id
left join bundles b       on b.commitment_line_id = cl.id
left join bundle_lines bl on bl.bundle_id = b.id
group by cl.id, c.id;

-- Rectification queue: both channels, one shape. state_text is the raw
-- app state (receipt decision / capture approval) for the side-by-side
-- dispatched-vs-received comparison.
create or replace view note_recon as
select 'dispatch'::text  as note_source,
       d.id              as note_ref,
       d.note            as note_no,
       (d.ts at time zone 'Asia/Kuwait')::date as delivery_date,
       d.project, d.site, d.company,
       d.mix             as item_text,
       d.weight          as qty_dispatched,
       r.weight_arrival  as qty_received,
       coalesce(r.decision, '') as state_text,
       d.recon_status, d.followup_flag, d.followup_at
from dispatch_loads d
left join lateral (
  select decision, weight_arrival from receipts
   where note = d.note order by ts desc limit 1) r on true
union all
select 'material',
       m.id,
       m.receipt_id,
       (m.ts at time zone 'Asia/Kuwait')::date,
       m.project, m.site, ''::text,
       m.material,
       null::numeric,
       m.quantity,
       m.approval_status,
       m.recon_status, m.followup_flag, m.followup_at
from material_receipts m;
