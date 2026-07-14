-- 0030_rebuild_schema.sql — ACCOUNTING REBUILD step 1
-- (BRIEF-accounting-rebuild-final.md, supersedes the pivot brief).
-- Deltas over the pivot schema (0024–0029):
--   A. Status model: NO qty_mismatch anywhere — a receipt confirms a
--      load, it does not re-weigh it. Asphalt: matched |
--      dispatched_not_received | received_not_dispatched (REJECTED
--      receipts stay un-matched → never bundleable). Materials:
--      matched | not_received | no_po. Note qty = the DISPATCHED
--      (plant-scale) weight — bill_qty's received-weight override is
--      retired.
--   B. bundle_lines: real FKs ("FK + unique constraint, not
--      convention") — two nullable FK columns + exactly-one check,
--      auto-filled by the guard from note_source/note_ref.
--   C. GRN registry: sequential GRN-C-#### numbers, minted once per
--      target so reprints keep their number (replaces the derived
--      GRN-DN-<note> scheme).
--   D. RLS: anon sees PUBLISHED bundles only; the accountant reads as
--      `authenticated` (Supabase Auth login in the rebuilt screens).

-- ── A. Status model ──────────────────────────────────────────────────
alter table dispatch_loads    drop constraint dispatch_loads_recon_status_check;
alter table material_receipts drop constraint material_receipts_recon_status_check;

-- Accepted receipt → matched, full stop (no weight comparison).
-- Rejected/other decision → stays dispatched_not_received: it must
-- never bundle, and there is no mismatch bucket anymore.
create or replace function dispatch_recon_compute(
  p_weight numeric, p_decision text, p_arrival numeric
) returns text language sql immutable as $$
  select case
    when p_decision = 'مقبول' then 'matched'
    else 'dispatched_not_received'
  end
$$;

-- Materials: matched = mapped to a PO line AND batch-approved;
-- no_po = the no-PO flag / exception path; not_received = captured,
-- pending the daily batch.
create or replace function material_receipts_recon() returns trigger
language plpgsql as $$
begin
  new.recon_status := case
    when new.no_po_flag or new.approval_status = 'استثناء' then 'no_po'
    when new.approval_status = 'معتمد' and new.commitment_line_id is not null
      then 'matched'
    else 'not_received'
  end;
  return new;
end $$;

-- bill_qty = dispatched weight (asphalt) / captured quantity (materials)
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
       d.recon_status, d.followup_flag, d.followup_at,
       d.item_id,
       d.weight          as bill_qty
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
       m.recon_status, m.followup_flag, m.followup_at,
       m.item_id,
       m.quantity
from material_receipts m;

-- (select r.* expands at creation — recreate so dependents track A)
create or replace view note_bundle_ready as
select r.* from note_recon r
where r.recon_status = 'matched'
  and not exists (select 1 from bundle_lines bl
    where bl.note_source = r.note_source
      and bl.note_ref = r.note_ref
      and not bl.is_adjustment);

-- Backfill: no-op updates re-fire the BEFORE triggers on every row,
-- migrating qty_mismatch / received_not_dispatched rows to the new
-- token sets before the tightened constraints land.
update dispatch_loads set recon_status = recon_status;
update material_receipts set recon_status = recon_status;

alter table dispatch_loads add constraint dispatch_loads_recon_status_check
  check (recon_status in ('matched','dispatched_not_received','received_not_dispatched'));
alter table material_receipts add constraint material_receipts_recon_status_check
  check (recon_status in ('matched','not_received','no_po'));

-- ── B. bundle_lines: real FKs ────────────────────────────────────────
alter table bundle_lines
  add column dispatch_id         bigint references dispatch_loads(id),
  add column material_receipt_id bigint references material_receipts(id);
-- the guard rejects updates on non-draft bundles — lift it for the
-- one-shot backfill of the new columns
alter table bundle_lines disable trigger trg_bundle_lines_guard;
update bundle_lines set dispatch_id         = note_ref where note_source = 'dispatch';
update bundle_lines set material_receipt_id = note_ref where note_source = 'material';
alter table bundle_lines enable trigger trg_bundle_lines_guard;
alter table bundle_lines add constraint bundle_lines_one_note check (
  (dispatch_id is not null)::int + (material_receipt_id is not null)::int = 1);
-- one note bills once, ever (adjusting lines exempt) — now on the FKs
create unique index bundle_lines_dispatch_once
  on bundle_lines (dispatch_id) where dispatch_id is not null and not is_adjustment;
create unique index bundle_lines_material_once
  on bundle_lines (material_receipt_id) where material_receipt_id is not null and not is_adjustment;

-- Guard fills the FK columns from note_source/note_ref, so every write
-- path (RPC or Table Editor) keeps the two representations in lockstep.
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

  new.dispatch_id         := case when new.note_source = 'dispatch' then new.note_ref end;
  new.material_receipt_id := case when new.note_source = 'material' then new.note_ref end;

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

-- ── C. GRN registry: GRN-C-#### ──────────────────────────────────────
create sequence grn_c_serial;
create table grn_docs (
  id                  bigint generated always as identity primary key,
  grn_no              text not null unique,      -- GRN-C-0001
  bundle_id           bigint references bundles(id),
  dispatch_id         bigint references dispatch_loads(id),
  material_receipt_id bigint references material_receipts(id),
  created_by          text not null default '',
  created_at          timestamptz not null default now(),
  check ((bundle_id is not null)::int + (dispatch_id is not null)::int
       + (material_receipt_id is not null)::int = 1)
);
-- one number per target — a reprint returns the same document
create unique index grn_docs_bundle_once   on grn_docs (bundle_id)           where bundle_id is not null;
create unique index grn_docs_dispatch_once on grn_docs (dispatch_id)         where dispatch_id is not null;
create unique index grn_docs_material_once on grn_docs (material_receipt_id) where material_receipt_id is not null;
alter table grn_docs enable row level security;
create policy "anon read" on grn_docs for select to anon, authenticated using (true);
create trigger trg_pipeline_audit after insert or update or delete on grn_docs
  for each row execute function pipeline_audit_row();

-- Mint-or-return. Exactly one target; accountant/admin (JWT via
-- pipeline_auth, PIN fallback until auth_required flips).
create or replace function grn_doc_no(
  p_pin text, p_bundle_id bigint default null,
  p_dispatch_id bigint default null, p_material_receipt_id bigint default null
) returns json
language plpgsql security definer set search_path = public as $$
declare v_user pipeline_users%rowtype; v_row grn_docs%rowtype;
begin
  v_user := pipeline_auth(p_pin);
  if v_user.id is null then return json_build_object('success', false, 'error', 'bad pin'); end if;
  if not (v_user.accountant or v_user.admin) then
    return json_build_object('success', false, 'error', 'not an accountant');
  end if;
  if (p_bundle_id is not null)::int + (p_dispatch_id is not null)::int
   + (p_material_receipt_id is not null)::int <> 1 then
    return json_build_object('success', false, 'error', 'exactly one target');
  end if;
  select * into v_row from grn_docs
   where (p_bundle_id is not null and bundle_id = p_bundle_id)
      or (p_dispatch_id is not null and dispatch_id = p_dispatch_id)
      or (p_material_receipt_id is not null and material_receipt_id = p_material_receipt_id);
  if found then
    return json_build_object('success', true, 'grnNo', v_row.grn_no, 'existing', true);
  end if;
  perform set_config('app.pipeline_actor', v_user.name, true);
  insert into grn_docs (grn_no, bundle_id, dispatch_id, material_receipt_id, created_by)
  values ('GRN-C-' || lpad(nextval('grn_c_serial')::text, 4, '0'),
          p_bundle_id, p_dispatch_id, p_material_receipt_id, v_user.name)
  returning * into v_row;
  return json_build_object('success', true, 'grnNo', v_row.grn_no, 'existing', false);
exception when unique_violation then
  select * into v_row from grn_docs
   where (p_bundle_id is not null and bundle_id = p_bundle_id)
      or (p_dispatch_id is not null and dispatch_id = p_dispatch_id)
      or (p_material_receipt_id is not null and material_receipt_id = p_material_receipt_id);
  return json_build_object('success', true, 'grnNo', v_row.grn_no, 'existing', true);
end $$;
grant execute on function grn_doc_no(text, bigint, bigint, bigint) to anon, authenticated;

-- ── D. RLS: anon = published bundles only ────────────────────────────
-- The rebuilt accountant screens read as `authenticated` (Supabase Auth
-- login); the SN data page (anon + token RPC) only ever needed
-- published rows. Legacy accounting tabs degrade to published-only
-- until they are replaced — production never shipped them.
drop policy "anon read" on bundles;
create policy "anon published read" on bundles for select to anon
  using (status = 'published');
create policy "auth read" on bundles for select to authenticated using (true);

drop policy "anon read" on bundle_lines;
create policy "anon published read" on bundle_lines for select to anon
  using (exists (select 1 from bundles b where b.id = bundle_id and b.status = 'published'));
create policy "auth read" on bundle_lines for select to authenticated using (true);

-- bundle_transcription must respect the caller's RLS (owner views
-- bypass it): anon through this view now sees published rows only.
-- sn_page_data stays SECURITY DEFINER and already filters published.
alter view bundle_transcription set (security_invoker = true);
-- note_recon / note_bundle_ready / po_line_balance stay owner views on
-- purpose: field tables keep anon read, and the balances' pending sums
-- must not silently shrink for the legacy portal mid-transition.
