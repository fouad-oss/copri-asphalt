-- ════════════════════════════════════════════════════════════════════
-- 0018 — SLICE 1 of the v2 brief: PO register + delivery matching.
-- The finance meeting's core finding: the process breaks AFTER the PO —
-- delivery notes are not tracked against POs. This migration makes the
-- commitment register hold real POs (with lines) from three origins:
--   'rf'     — minted by request_decide (v1 flow, unchanged)
--   'manual' — the always-open intake screen (po_entry RPC below),
--              mirroring today's paper RF-LPO→PO flow until Slice 4
--   'import' — the SpectroNova per-department export importer (tools/),
--              which generates SQL for the dashboard editor
-- and ties every delivery capture to a PO line:
--   • commitment_lines (item / qty / unit / rate) with received-qty
--     accumulation views (po_line_match, po_match = three-way match)
--   • material_receipts (site delivery notes) and grns (office capture)
--     gain commitment_line_id + a "no PO found" exception flag —
--     an exception for the accountant, not a free pass
--   • accountant DAILY BATCH approval (capture_pending view +
--     capture_batch_decide RPC) — never per-ticket
-- Uses pipeline_auth (0017): JWT first, PIN fallback until cutover.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. Commitments: three origins, request now optional ──────────────
alter table commitments
  alter column request_id drop not null,
  add column origin      text not null default 'rf'
             check (origin in ('rf','manual','import')),
  add column source_ref  text not null default '',  -- SpectroNova PO no (import)
  add column source_file text not null default '';  -- import provenance

-- Immutability guard rewritten null-safe (request_id can be null now)
create or replace function commitments_guard() returns trigger
language plpgsql as $$
begin
  if current_setting('app.pipeline_allow_rev', true) = '1' then return new; end if;
  if new.number is distinct from old.number or new.ctype is distinct from old.ctype
     or new.request_id is distinct from old.request_id
     or new.cost_center_id is distinct from old.cost_center_id
     or new.vendor_id is distinct from old.vendor_id
     or new.description is distinct from old.description
     or new.value is distinct from old.value
     or new.blanket_id is distinct from old.blanket_id
     or new.origin is distinct from old.origin
     or new.source_ref is distinct from old.source_ref then
    raise exception 'commitments are immutable — use the revision flow';
  end if;
  return new;
end $$;

-- ── 2. PO lines ──────────────────────────────────────────────────────
-- qty/rate nullable: lump-sum and service commitments have no quantity;
-- amount is explicit so imports can carry ERP line totals verbatim.
create table commitment_lines (
  id            bigint generated always as identity primary key,
  commitment_id bigint not null references commitments(id),
  line_no       int    not null,
  item          text   not null check (item <> ''),
  qty           numeric check (qty > 0),
  unit          text   not null default '',
  rate          numeric check (rate >= 0),
  amount        numeric check (amount >= 0),       -- qty*rate when both known
  unique (commitment_id, line_no)
);
create index commitment_lines_by_commitment on commitment_lines (commitment_id, line_no);

create trigger trg_pipeline_audit after insert or update or delete on commitment_lines
  for each row execute function pipeline_audit_row();
alter table commitment_lines enable row level security;
create policy "anon read" on commitment_lines for select to anon, authenticated using (true);

-- Lines of a closed/cancelled commitment are frozen (revision flow excepted)
create or replace function commitment_lines_guard() returns trigger
language plpgsql as $$
declare v_status text;
begin
  if current_setting('app.pipeline_allow_rev', true) = '1' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select status into v_status from commitments
    where id = coalesce(new.commitment_id, old.commitment_id);
  if v_status is distinct from 'نشط' then
    raise exception 'commitment is % — lines are frozen', coalesce(v_status, '?');
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger trg_commitment_lines_guard before insert or update or delete on commitment_lines
  for each row execute function commitment_lines_guard();

-- ── 3. Manual PO entry — the always-open intake door ─────────────────
-- Mirrors the paper RF-LPO→PO flow: a requester (scoped to their cost
-- centers) registers an already-approved PO directly. Slice 4 restricts
-- this to exceptions once the request portal has earned trust.
create or replace function po_entry(
  p_pin text, p_client_ref text, p_type text,
  p_cost_center_id bigint, p_vendor_id bigint,
  p_description text, p_value numeric,
  p_lines jsonb default '[]'::jsonb, p_note text default ''
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_user  pipeline_users%rowtype;
  v_cmt   commitments%rowtype;
  v_no    text;
  v_line  jsonb;
  v_i     int := 0;
  v_sum   numeric := 0;
  v_qty   numeric; v_rate numeric; v_amt numeric;
  v_value numeric;
begin
  v_user := pipeline_auth(p_pin);
  if v_user.id is null then return json_build_object('success', false, 'error', 'bad pin'); end if;
  if not v_user.requester then return json_build_object('success', false, 'error', 'not a requester'); end if;

  if coalesce(p_client_ref, '') <> '' then
    select * into v_cmt from commitments
      where origin = 'manual' and source_ref = p_client_ref;
    if found then
      return json_build_object('success', true, 'number', v_cmt.number, 'id', v_cmt.id, 'resumed', true);
    end if;
  end if;

  if p_type not in ('WO','LPO','CON') then
    return json_build_object('success', false, 'error', 'bad type');
  end if;
  if not exists (select 1 from cost_centers where id = p_cost_center_id and active) then
    return json_build_object('success', false, 'error', 'unknown cost center');
  end if;
  if not pipeline_user_in_scope(v_user.id, p_cost_center_id) then
    return json_build_object('success', false, 'error', 'cost center out of scope');
  end if;
  if not exists (select 1 from vendors where id = p_vendor_id and active) then
    return json_build_object('success', false, 'error', 'unknown vendor');
  end if;
  if coalesce(trim(p_description), '') = '' then
    return json_build_object('success', false, 'error', 'description required');
  end if;

  -- line amounts: explicit amount wins, else qty*rate; PO value:
  -- explicit p_value wins, else the sum of line amounts
  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_qty  := nullif(v_line->>'qty',  '')::numeric;
    v_rate := nullif(v_line->>'rate', '')::numeric;
    v_amt  := coalesce(nullif(v_line->>'amount', '')::numeric, v_qty * v_rate);
    if coalesce(trim(v_line->>'item'), '') = '' then
      return json_build_object('success', false, 'error', 'line item required');
    end if;
    v_sum := v_sum + coalesce(v_amt, 0);
  end loop;
  v_value := coalesce(p_value, nullif(v_sum, 0));
  if coalesce(v_value, 0) <= 0 then
    return json_build_object('success', false, 'error', 'value required');
  end if;

  v_no := next_pipeline_no(p_type, p_type);
  insert into commitments (number, ctype, request_id, cost_center_id, vendor_id,
      description, value, origin, source_ref, created_by)
  values (v_no, p_type, null, p_cost_center_id, p_vendor_id,
      trim(p_description) || case when coalesce(p_note,'') <> '' then e'\n' || p_note else '' end,
      v_value, 'manual', coalesce(p_client_ref, ''), v_user.name)
  returning * into v_cmt;

  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_i    := v_i + 1;
    v_qty  := nullif(v_line->>'qty',  '')::numeric;
    v_rate := nullif(v_line->>'rate', '')::numeric;
    v_amt  := coalesce(nullif(v_line->>'amount', '')::numeric, v_qty * v_rate);
    insert into commitment_lines (commitment_id, line_no, item, qty, unit, rate, amount)
    values (v_cmt.id, v_i, trim(v_line->>'item'), v_qty,
            coalesce(v_line->>'unit', ''), v_rate, v_amt);
  end loop;

  return json_build_object('success', true, 'number', v_no, 'id', v_cmt.id);
exception when unique_violation then
  if coalesce(p_client_ref, '') <> '' then
    select * into v_cmt from commitments
      where origin = 'manual' and source_ref = p_client_ref;
    if found then
      return json_build_object('success', true, 'number', v_cmt.number, 'id', v_cmt.id, 'resumed', true);
    end if;
  end if;
  return json_build_object('success', false, 'error', 'duplicate');
end $$;
grant execute on function po_entry(text, text, text, bigint, bigint, text, numeric, jsonb, text)
  to anon, authenticated;
-- idempotency probe for manual entries (source_ref = client_ref)
create unique index commitments_manual_client_ref on commitments (source_ref)
  where origin = 'manual' and source_ref <> '';

-- ── 4. Delivery notes reference PO lines ─────────────────────────────
-- Site channel: material_receipts (the existing material receival
-- module, extended per the brief). Office channel: grns. Both accumulate
-- received qty against the line; both land in the accountant's daily
-- batch. no_po_flag opens an exception instead of blocking the site.
alter table material_receipts
  add column commitment_line_id bigint references commitment_lines(id),
  add column no_po_flag         boolean not null default false,
  add column approval_status    text not null default 'بانتظار'
             check (approval_status in ('بانتظار','معتمد','استثناء')),
  add column approved_by        text not null default '',
  add column approved_at        timestamptz,
  add column exception_note     text not null default '';
create index material_receipts_pending on material_receipts (approval_status, ts desc);
create index material_receipts_by_line on material_receipts (commitment_line_id);

alter table grns
  add column commitment_line_id bigint references commitment_lines(id),
  add column approval_status    text not null default 'بانتظار'
             check (approval_status in ('بانتظار','معتمد','استثناء')),
  add column approved_by        text not null default '',
  add column approved_at        timestamptz,
  add column exception_note     text not null default '';
create index grns_pending on grns (approval_status, created_at desc);
create index grns_by_line on grns (commitment_line_id);

-- material_receipts inserts are the one remaining direct anon write —
-- approval state must not be client-settable, and (once enforcement is
-- flipped on) a site delivery note needs a PO line or the exception flag.
create or replace function material_receipts_capture_gate() returns trigger
language plpgsql as $$
begin
  new.approval_status := 'بانتظار';
  new.approved_by := ''; new.approved_at := null; new.exception_note := '';
  if new.no_po_flag then new.commitment_line_id := null; end if;
  if capture_enforced('materials')
     and new.commitment_line_id is null and not new.no_po_flag then
    raise exception 'delivery note needs a PO line (or the no-PO exception flag)';
  end if;
  return new;
end $$;
create trigger trg_material_receipts_gate before insert on material_receipts
  for each row execute function material_receipts_capture_gate();

-- approval state changes are pipeline state → audit them (updates only;
-- inserts are the site's own log and would double every receipt)
create trigger trg_pipeline_audit after update on material_receipts
  for each row execute function pipeline_audit_row();

-- invoices ↔ delivery notes (brief: "invoice records reference PO +
-- delivery notes"). Composite-key link table; the audit trail lives on
-- the invoice and capture rows themselves, so no trigger here.
create table supplier_invoice_dns (
  invoice_id bigint not null references supplier_invoices(id),
  dn_kind    text   not null check (dn_kind in ('site','grn')),
  dn_id      bigint not null,
  primary key (invoice_id, dn_kind, dn_id)
);
alter table supplier_invoice_dns enable row level security;
create policy "anon read" on supplier_invoice_dns for select to anon, authenticated using (true);

-- ── 5. grn_submit v2: pipeline_auth + optional PO line ───────────────
-- Signature changes (p_line_id) → drop the v1 overload so PostgREST
-- resolution stays unambiguous.
drop function grn_submit(text, text, bigint, text, numeric, text, numeric, text, date, boolean, text);
create or replace function grn_submit(
  p_pin text, p_client_ref text, p_commitment_id bigint,
  p_description text, p_quantity numeric, p_unit text, p_amount numeric,
  p_line_id bigint default null,
  p_invoice_no text default '', p_invoice_date date default null,
  p_force boolean default false, p_note text default ''
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_user pipeline_users%rowtype;
  v_cmt  commitments%rowtype;
  v_grn  grns%rowtype;
  v_grn_no text;
  v_inv_id bigint;
  v_near record;
begin
  v_user := pipeline_auth(p_pin);
  if v_user.id is null then return json_build_object('success', false, 'error', 'bad pin'); end if;
  if not v_user.requester then return json_build_object('success', false, 'error', 'not a requester'); end if;

  if coalesce(p_client_ref, '') <> '' then
    select * into v_grn from grns where client_ref = p_client_ref;
    if found then
      return json_build_object('success', true, 'grnNo', v_grn.grn_no, 'resumed', true);
    end if;
  end if;

  select * into v_cmt from commitments where id = p_commitment_id;
  if not found then return json_build_object('success', false, 'error', 'unknown commitment'); end if;
  if v_cmt.ctype <> 'LPO' then return json_build_object('success', false, 'error', 'not an LPO'); end if;
  if v_cmt.status <> 'نشط' then return json_build_object('success', false, 'error', 'commitment not active'); end if;
  if coalesce(trim(p_description), '') = '' or coalesce(p_amount, 0) <= 0 then
    return json_build_object('success', false, 'error', 'description and amount required');
  end if;
  if p_line_id is not null and not exists
     (select 1 from commitment_lines where id = p_line_id and commitment_id = v_cmt.id) then
    return json_build_object('success', false, 'error', 'line not on this commitment');
  end if;

  if coalesce(trim(p_invoice_no), '') <> '' then
    if p_invoice_date is null then
      return json_build_object('success', false, 'error', 'invoice date required');
    end if;
    if not coalesce(p_force, false) then
      select si.supplier_invoice_no, si.invoice_date into v_near
      from supplier_invoices si
      where si.vendor_id = v_cmt.vendor_id
        and si.amount = p_amount
        and abs(si.invoice_date - p_invoice_date) <= 30
      limit 1;
      if found then
        return json_build_object('success', false, 'nearDuplicate', true,
          'error', 'near-duplicate invoice',
          'existingNo', v_near.supplier_invoice_no, 'existingDate', v_near.invoice_date);
      end if;
    end if;
    begin
      insert into supplier_invoices (vendor_id, supplier_invoice_no, invoice_date,
          amount, commitment_id, created_by)
      values (v_cmt.vendor_id, trim(p_invoice_no), p_invoice_date,
          p_amount, v_cmt.id, v_user.name)
      returning id into v_inv_id;
    exception when unique_violation then
      return json_build_object('success', false, 'duplicate', true,
        'error', 'invoice already recorded for this vendor');
    end;
  end if;

  v_grn_no := next_pipeline_no('GRN', 'GRN');
  insert into grns (grn_no, commitment_id, commitment_line_id, description, quantity,
      unit, amount, supplier_invoice_id, received_by, note, client_ref)
  values (v_grn_no, v_cmt.id, p_line_id, trim(p_description), p_quantity,
      coalesce(p_unit, ''), p_amount, v_inv_id, v_user.name,
      coalesce(p_note, ''), nullif(p_client_ref, ''))
  returning * into v_grn;
  if v_inv_id is not null then
    insert into supplier_invoice_dns (invoice_id, dn_kind, dn_id)
    values (v_inv_id, 'grn', v_grn.id);
  end if;
  return json_build_object('success', true, 'grnNo', v_grn_no,
    'invoiceId', v_inv_id);
exception when unique_violation then
  if coalesce(p_client_ref, '') <> '' then
    select * into v_grn from grns where client_ref = p_client_ref;
    if found then
      return json_build_object('success', true, 'grnNo', v_grn.grn_no, 'resumed', true);
    end if;
  end if;
  return json_build_object('success', false, 'error', 'duplicate');
end $$;
grant execute on function grn_submit(text, text, bigint, text, numeric, text, numeric,
  bigint, text, date, boolean, text) to anon, authenticated;

-- ── 6. The match views ───────────────────────────────────────────────
-- Per line: ordered vs received (approved / still pending), both
-- channels. Received amounts are valued at the line rate for site notes
-- (their rate field is retired) and taken verbatim from GRNs.
create or replace view po_line_match as
select l.id  as line_id,
       l.commitment_id, l.line_no, l.item, l.unit, l.rate,
       l.qty                                   as ordered_qty,
       coalesce(l.amount, l.qty * l.rate)      as ordered_amount,
       coalesce(mr.qty_ok, 0) + coalesce(g.qty_ok, 0)   as received_qty,
       coalesce(mr.qty_pend, 0) + coalesce(g.qty_pend, 0) as pending_qty,
       case when l.qty is not null
            then l.qty - coalesce(mr.qty_ok, 0) - coalesce(g.qty_ok, 0) end as open_qty
from commitment_lines l
left join (
  select commitment_line_id,
         sum(quantity) filter (where approval_status = 'معتمد')   as qty_ok,
         sum(quantity) filter (where approval_status = 'بانتظار') as qty_pend
  from material_receipts where commitment_line_id is not null group by 1
) mr on mr.commitment_line_id = l.id
left join (
  select commitment_line_id,
         sum(quantity) filter (where approval_status = 'معتمد')   as qty_ok,
         sum(quantity) filter (where approval_status = 'بانتظار') as qty_pend
  from grns where commitment_line_id is not null group by 1
) g on g.commitment_line_id = l.id;

-- Per PO: ordered vs received vs invoiced — the three-way match.
-- received_amount: GRN amounts verbatim + site notes valued at line rate.
create or replace view po_match as
select c.id as commitment_id, c.number, c.ctype, c.origin, c.status,
       c.cost_center_id, c.vendor_id,
       c.value as ordered_value,
       coalesce(g.amt_ok, 0) + coalesce(mr.amt_ok, 0)  as received_amount,
       coalesce(inv.total, 0)                          as invoiced_amount,
       coalesce(g.n, 0) + coalesce(mr.n, 0)            as capture_count,
       coalesce(g.n_pend, 0) + coalesce(mr.n_pend, 0)  as pending_count,
       coalesce(lines.n, 0)                            as line_count,
       coalesce(lines.open_lines, 0)                   as open_lines,
       c.value - coalesce(inv.total, 0)                as uninvoiced_value,
       coalesce(inv.total, 0) - coalesce(g.amt_ok, 0) - coalesce(mr.amt_ok, 0)
                                                       as invoiced_not_received
from commitments c
left join (
  select commitment_id,
         count(*) as n,
         count(*) filter (where approval_status = 'بانتظار') as n_pend,
         sum(amount) filter (where approval_status = 'معتمد') as amt_ok
  from grns group by 1
) g on g.commitment_id = c.id
left join (
  select l.commitment_id,
         count(*) as n,
         count(*) filter (where r.approval_status = 'بانتظار') as n_pend,
         sum(r.quantity * l.rate) filter (where r.approval_status = 'معتمد') as amt_ok
  from material_receipts r join commitment_lines l on l.id = r.commitment_line_id
  group by 1
) mr on mr.commitment_id = c.id
left join (
  select commitment_id, sum(amount) as total from supplier_invoices group by 1
) inv on inv.commitment_id = c.id
left join (
  select commitment_id, count(*) as n,
         count(*) filter (where qty is not null) as open_lines
  from commitment_lines group by 1
) lines on lines.commitment_id = c.id;

-- One list for the accountant's morning: everything still pending,
-- both channels, oldest first. "No PO" flags surface loudest.
create or replace view capture_pending as
select 'site'::text as kind, r.id, r.ts, r.receiver as actor,
       r.project, r.material as description, r.quantity, r.unit,
       null::numeric as amount, r.commitment_line_id, l.commitment_id,
       c.number as commitment_no, r.no_po_flag, r.photo_url, r.supplier as vendor_name
from material_receipts r
left join commitment_lines l on l.id = r.commitment_line_id
left join commitments c on c.id = l.commitment_id
where r.approval_status = 'بانتظار'
union all
select 'grn', g.id, g.created_at, g.received_by,
       '', g.description, g.quantity, g.unit,
       g.amount, g.commitment_line_id, g.commitment_id,
       c.number, false, '', v.name
from grns g
join commitments c on c.id = g.commitment_id
left join vendors v on v.id = c.vendor_id
where g.approval_status = 'بانتظار'
order by ts;

-- ── 7. Daily batch approval — one action, never per-ticket ───────────
-- The client sends exactly what the accountant saw: approve list +
-- exception list (each {kind:'site'|'grn', id, note}). Anything not
-- sent stays pending for tomorrow's batch.
create or replace function capture_batch_decide(
  p_pin text, p_approve jsonb default '[]'::jsonb, p_except jsonb default '[]'::jsonb
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_user pipeline_users%rowtype;
  v_it   jsonb;
  v_ok   int := 0;
  v_ex   int := 0;
  n      int;
begin
  v_user := pipeline_auth(p_pin);
  if v_user.id is null then return json_build_object('success', false, 'error', 'bad pin'); end if;
  if not v_user.accountant then return json_build_object('success', false, 'error', 'not an accountant'); end if;

  for v_it in select * from jsonb_array_elements(coalesce(p_approve, '[]'::jsonb)) loop
    if v_it->>'kind' = 'site' then
      update material_receipts
         set approval_status = 'معتمد', approved_by = v_user.name, approved_at = now()
       where id = (v_it->>'id')::bigint and approval_status = 'بانتظار';
    elsif v_it->>'kind' = 'grn' then
      update grns
         set approval_status = 'معتمد', approved_by = v_user.name, approved_at = now()
       where id = (v_it->>'id')::bigint and approval_status = 'بانتظار';
    else
      continue;
    end if;
    get diagnostics n = row_count; v_ok := v_ok + n;
  end loop;

  for v_it in select * from jsonb_array_elements(coalesce(p_except, '[]'::jsonb)) loop
    if v_it->>'kind' = 'site' then
      update material_receipts
         set approval_status = 'استثناء', approved_by = v_user.name, approved_at = now(),
             exception_note = coalesce(v_it->>'note', '')
       where id = (v_it->>'id')::bigint and approval_status = 'بانتظار';
    elsif v_it->>'kind' = 'grn' then
      update grns
         set approval_status = 'استثناء', approved_by = v_user.name, approved_at = now(),
             exception_note = coalesce(v_it->>'note', '')
       where id = (v_it->>'id')::bigint and approval_status = 'بانتظار';
    else
      continue;
    end if;
    get diagnostics n = row_count; v_ex := v_ex + n;
  end loop;

  return json_build_object('success', true, 'approved', v_ok, 'excepted', v_ex);
end $$;
grant execute on function capture_batch_decide(text, jsonb, jsonb) to anon, authenticated;

-- Resolve an exception: link the capture to its PO line (and approve),
-- or update the note while it stays open. Clearing no_po_flag on link.
create or replace function capture_exception_resolve(
  p_pin text, p_kind text, p_id bigint,
  p_line_id bigint default null, p_note text default ''
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_user pipeline_users%rowtype;
  n int;
begin
  v_user := pipeline_auth(p_pin);
  if v_user.id is null then return json_build_object('success', false, 'error', 'bad pin'); end if;
  if not v_user.accountant then return json_build_object('success', false, 'error', 'not an accountant'); end if;
  if p_kind not in ('site','grn') then return json_build_object('success', false, 'error', 'bad kind'); end if;
  if p_line_id is not null and not exists (select 1 from commitment_lines where id = p_line_id) then
    return json_build_object('success', false, 'error', 'unknown line');
  end if;

  if p_kind = 'site' then
    update material_receipts
       set commitment_line_id = coalesce(p_line_id, commitment_line_id),
           no_po_flag = case when p_line_id is not null then false else no_po_flag end,
           approval_status = case when p_line_id is not null then 'معتمد' else approval_status end,
           approved_by = case when p_line_id is not null then v_user.name else approved_by end,
           approved_at = case when p_line_id is not null then now() else approved_at end,
           exception_note = coalesce(nullif(p_note, ''), exception_note)
     where id = p_id and approval_status = 'استثناء';
  else
    update grns
       set commitment_line_id = coalesce(p_line_id, commitment_line_id),
           approval_status = case when p_line_id is not null then 'معتمد' else approval_status end,
           approved_by = case when p_line_id is not null then v_user.name else approved_by end,
           approved_at = case when p_line_id is not null then now() else approved_at end,
           exception_note = coalesce(nullif(p_note, ''), exception_note)
     where id = p_id and approval_status = 'استثناء';
  end if;
  get diagnostics n = row_count;
  if n = 0 then return json_build_object('success', false, 'error', 'not an open exception'); end if;
  return json_build_object('success', true);
end $$;
grant execute on function capture_exception_resolve(text, text, bigint, bigint, text)
  to anon, authenticated;
