-- ═══════════════════════════════════════════════════════════════════
-- COPRI ASPHALT — 0016: commitment pipeline — export / reconciliation
-- ═══════════════════════════════════════════════════════════════════
-- Brief module 4: SpectroNova stays the ledger; this app hands it clean
-- coded batches. Two adapters behind ONE interface (batch + rows):
--   • FILE adapter (this migration + the portal's CSV download) — the
--     primary path until API docs/credentials arrive, and the audit
--     copy forever after.
--   • API adapter — STUB: when SpectroNova's API is documented, a
--     server-side job posts the same export_rows payloads and writes
--     acked/acked_at back; nothing else changes. Master-data sync FROM
--     SpectroNova waits for finance's master rebuild (syncing the
--     polluted masters would be worse than not syncing).
-- Every transaction row carries: date, vendor (SpectroNova contact id
-- via the 0013 mapping), cost center code, GL account (config), amount,
-- commitment reference, source-record id. A row can be exported ONCE,
-- ever (unique source+source_id across batches). Reconciliation = the
-- acked flag per row: automated when the API confirms postings, ticked
-- manually by finance until then.

-- GL accounts are config, not constants (chart of accounts TBD)
insert into pipeline_settings (key, value) values
  ('gl_accounts', '{"supplier_invoice": "", "internal_recharge": ""}'::jsonb)
on conflict (key) do nothing;

create table export_batches (
  id         bigint generated always as identity primary key,
  batch_no   text not null unique,                    -- EXP-2026-001
  created_by text not null default '',
  note       text not null default '',
  created_at timestamptz not null default now()
);
create table export_rows (
  id        bigint generated always as identity primary key,
  batch_id  bigint not null references export_batches(id),
  source    text not null check (source in ('supplier_invoice','internal_invoice')),
  source_id bigint not null,
  payload   jsonb not null,                           -- frozen transaction row
  acked     boolean not null default false,
  acked_by  text not null default '',
  acked_at  timestamptz,
  unique (source, source_id)                          -- exported once, ever
);
create index export_rows_by_batch on export_rows (batch_id);
create trigger trg_pipeline_audit after insert or update or delete on export_batches
  for each row execute function pipeline_audit_row();
create trigger trg_pipeline_audit after insert or update or delete on export_rows
  for each row execute function pipeline_audit_row();

do $$
begin
  execute 'alter table export_batches enable row level security';
  execute 'create policy "anon read" on export_batches for select to anon, authenticated using (true)';
  execute 'alter table export_rows enable row level security';
  execute 'create policy "anon read" on export_rows for select to anon, authenticated using (true)';
end $$;

-- Everything postable that no batch has picked up yet, already in the
-- final transaction-row shape. Internal invoices post on their period's
-- last day; supplier invoices on their invoice date.
create or replace view export_pending as
select 'supplier_invoice'::text as source, si.id as source_id,
       jsonb_build_object(
         'date', to_char(si.invoice_date, 'YYYY-MM-DD'),
         'contactId', coalesce((select m.contact_id from vendor_spectronova_ids m
                                where m.vendor_id = si.vendor_id and not m.flagged
                                order by m.contact_id limit 1), ''),
         'vendor', v.name,
         'costCenter', coalesce(cc.spectronova_code, cc.code),
         'glAccount', coalesce((select value->>'supplier_invoice' from pipeline_settings
                                where key = 'gl_accounts'), ''),
         'amount', si.amount,
         'commitmentRef', c.number,
         'sourceId', 'SI-' || si.id,
         'refNo', si.supplier_invoice_no) as payload
from supplier_invoices si
join commitments c   on c.id = si.commitment_id
join vendors v       on v.id = si.vendor_id
join cost_centers cc on cc.id = c.cost_center_id
where not exists (select 1 from export_rows er
                  where er.source = 'supplier_invoice' and er.source_id = si.id)
union all
select 'internal_invoice', ii.id,
       jsonb_build_object(
         'date', to_char((ii.period || '-01')::date + interval '1 month' - interval '1 day', 'YYYY-MM-DD'),
         'contactId', coalesce((select m.contact_id from vendor_spectronova_ids m
                                where m.vendor_id = ii.vendor_id and not m.flagged
                                order by m.contact_id limit 1), ''),
         'vendor', v.name,
         'costCenter', coalesce(cc.spectronova_code, cc.code),
         'glAccount', coalesce((select value->>'internal_recharge' from pipeline_settings
                                where key = 'gl_accounts'), ''),
         'amount', ii.total,
         'commitmentRef', coalesce(c.number, ''),
         'sourceId', 'II-' || ii.id,
         'refNo', ii.inv_no)
from internal_invoices ii
join vendors v       on v.id = ii.vendor_id
join cost_centers cc on cc.id = ii.cost_center_id
left join commitments c on c.id = ii.commitment_id
where ii.status = 'صادر'
  and not exists (select 1 from export_rows er
                  where er.source = 'internal_invoice' and er.source_id = ii.id);

-- Snapshot every pending row into a new batch (the payload is frozen so
-- later master edits can't silently rewrite an exported file).
create or replace function export_batch_create(p_pin text, p_note text default '') returns json
language plpgsql security definer set search_path = public as $$
declare
  v_user pipeline_users%rowtype;
  v_batch_id bigint;
  v_batch_no text;
  v_rows int;
begin
  select * into v_user from pipeline_users where pin = p_pin and active and approver limit 1;
  if not found then return json_build_object('success', false, 'error', 'bad pin'); end if;
  perform set_config('app.pipeline_actor', v_user.name, true);

  perform 1 from export_pending limit 1;
  if not found then return json_build_object('success', false, 'error', 'nothing to export'); end if;

  v_batch_no := next_pipeline_no('EXP', 'EXP');
  insert into export_batches (batch_no, created_by, note)
  values (v_batch_no, v_user.name, coalesce(p_note, ''))
  returning id into v_batch_id;

  insert into export_rows (batch_id, source, source_id, payload)
  select v_batch_id, source, source_id, payload from export_pending;
  get diagnostics v_rows = row_count;

  return json_build_object('success', true, 'batchNo', v_batch_no,
    'batchId', v_batch_id, 'rows', v_rows);
end $$;
grant execute on function export_batch_create(text, text) to anon, authenticated;

-- Reconciliation tick — manual until the API adapter confirms postings.
create or replace function export_row_ack(p_pin text, p_row_id bigint, p_acked boolean) returns json
language plpgsql security definer set search_path = public as $$
declare v_user pipeline_users%rowtype;
begin
  select * into v_user from pipeline_users where pin = p_pin and active and approver limit 1;
  if not found then return json_build_object('success', false, 'error', 'bad pin'); end if;
  perform set_config('app.pipeline_actor', v_user.name, true);
  update export_rows
     set acked = p_acked,
         acked_by = case when p_acked then v_user.name else '' end,
         acked_at = case when p_acked then now() end
   where id = p_row_id;
  if not found then return json_build_object('success', false, 'error', 'not found'); end if;
  return json_build_object('success', true);
end $$;
grant execute on function export_row_ack(text, bigint, boolean) to anon, authenticated;
