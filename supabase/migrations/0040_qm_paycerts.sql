-- ════════════════════════════════════════════════════════════════════
-- 0040 — QUANTITIES: MPW payment certificates (دفعات الوزارة)
--        (Fouad's request, 2026-08-14)
--   Tables qm_pay_certs + qm_pay_cert_lines (per-WO per-BOP-item qty),
--   RPCs qm_paycert_create / update / line_set / delete (changelog-logged,
--   entity 'paycert'), views qm_paycert_overview + qm_paycert_lines_v +
--   qm_certified_totals (feeds "generate new certificate": uncertified
--   balance = executed − already certified per WO×item).
--   Same posture as all qm_*: RLS to authenticated, writes via RPCs.
-- Idempotent; safe to re-run. Paste BEFORE 0041 (historical backfill).
-- ════════════════════════════════════════════════════════════════════

-- ── 1. tables ────────────────────────────────────────────────────────
create table if not exists qm_pay_certs (
  id          bigint generated always as identity primary key,
  contract_id bigint not null references qm_contracts(id),
  cert_no     int    not null,
  period_end  date,
  source      text   not null default 'site' check (source in ('mpw', 'site')),
  status      text   not null default 'draft' check (status in ('draft', 'submitted', 'certified')),
  note        text   not null default '',
  created_at  timestamptz not null default now(),
  unique (contract_id, cert_no)
);

create table if not exists qm_pay_cert_lines (
  id          bigint generated always as identity primary key,
  cert_id     bigint not null references qm_pay_certs(id) on delete cascade,
  kashef_id   bigint references qm_kashefs(id),
  bop_item_id bigint not null references qm_bop_items(id),
  qty         numeric not null,
  amount      numeric,
  unique (cert_id, kashef_id, bop_item_id)
);
create index if not exists qm_pay_cert_lines_cert on qm_pay_cert_lines(cert_id);
create index if not exists qm_pay_cert_lines_kashef on qm_pay_cert_lines(kashef_id);

do $qm$
declare t text;
begin
  foreach t in array array['qm_pay_certs', 'qm_pay_cert_lines'] loop
    execute format('alter table %I enable row level security', t);
    begin
      execute format('create policy "auth read" on %I for select to authenticated using (true)', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $qm$;

-- ── 2. RPCs ──────────────────────────────────────────────────────────
-- p_lines: [{kashef_id, bop_item_id, qty, amount?}]
create or replace function qm_paycert_create(
  p_contract_code text, p_cert_no int, p_period_end date,
  p_source text, p_note text, p_lines jsonb
) returns json language plpgsql security definer set search_path = public as $qm$
declare
  v_contract bigint;
  v_c bigint;
  v_ln jsonb;
  v_rate numeric;
  v_n int := 0;
begin
  if auth.uid() is null then return json_build_object('success', false, 'error', 'no session'); end if;
  select id into v_contract from qm_contracts where code = p_contract_code;
  if v_contract is null then return json_build_object('success', false, 'error', 'contract not found'); end if;
  if p_source not in ('mpw', 'site') then return json_build_object('success', false, 'error', 'bad source'); end if;

  insert into qm_pay_certs (contract_id, cert_no, period_end, source, status, note)
  values (v_contract, p_cert_no, p_period_end, p_source, 'draft', coalesce(p_note, ''))
  returning id into v_c;

  for v_ln in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    select rate into v_rate from qm_bop_items where id = (v_ln->>'bop_item_id')::bigint;
    if v_rate is null then return json_build_object('success', false, 'error', 'bop item not found'); end if;
    if coalesce((v_ln->>'qty')::numeric, 0) = 0 then continue; end if;
    insert into qm_pay_cert_lines (cert_id, kashef_id, bop_item_id, qty, amount)
    values (v_c, nullif(v_ln->>'kashef_id', '')::bigint, (v_ln->>'bop_item_id')::bigint,
            (v_ln->>'qty')::numeric,
            coalesce(nullif(v_ln->>'amount', '')::numeric, round((v_ln->>'qty')::numeric * v_rate, 3)));
    v_n := v_n + 1;
  end loop;

  perform qm_log('paycert', v_c, 'create', '', '',
                 '', 'دفعة رقم ' || p_cert_no || ' — ' || v_n || ' بند');
  return json_build_object('success', true, 'certId', v_c, 'lines', v_n);
exception when unique_violation then
  return json_build_object('success', false, 'error', 'cert_no already exists');
when others then
  return json_build_object('success', false, 'error', SQLERRM);
end $qm$;

create or replace function qm_paycert_update(p_cert_id bigint, p_fields jsonb)
returns json language plpgsql security definer set search_path = public as $qm$
declare
  v_c qm_pay_certs;
  v_key text;
  v_new text;
  v_old text;
  v_changed int := 0;
begin
  if auth.uid() is null then return json_build_object('success', false, 'error', 'no session'); end if;
  select * into v_c from qm_pay_certs where id = p_cert_id;
  if v_c.id is null then return json_build_object('success', false, 'error', 'not found'); end if;
  for v_key in select jsonb_object_keys(p_fields) loop
    if v_key not in ('cert_no', 'period_end', 'status', 'note') then
      return json_build_object('success', false, 'error', 'field not editable: ' || v_key);
    end if;
  end loop;
  if p_fields ? 'status' and p_fields->>'status' not in ('draft', 'submitted', 'certified') then
    return json_build_object('success', false, 'error', 'bad status');
  end if;
  for v_key in select jsonb_object_keys(p_fields) loop
    v_new := p_fields->>v_key;
    v_old := case v_key
      when 'cert_no' then v_c.cert_no::text
      when 'period_end' then coalesce(v_c.period_end::text, '')
      when 'status' then v_c.status
      when 'note' then v_c.note
    end;
    if coalesce(v_old, '') is distinct from coalesce(v_new, '') then
      execute format('update qm_pay_certs set %I = $1::%s where id = $2', v_key,
                     case when v_key = 'cert_no' then 'int'
                          when v_key = 'period_end' then 'date'
                          else 'text' end)
        using (case when v_key = 'period_end' then nullif(v_new, '') else v_new end), p_cert_id;
      perform qm_log('paycert', p_cert_id, 'update', v_key, '', coalesce(v_old, ''), coalesce(v_new, ''));
      v_changed := v_changed + 1;
    end if;
  end loop;
  return json_build_object('success', true, 'changed', v_changed);
exception when unique_violation then
  return json_build_object('success', false, 'error', 'cert_no already exists');
when others then
  return json_build_object('success', false, 'error', SQLERRM);
end $qm$;

-- qty null/0 removes the line; otherwise upsert (amount recomputed at BOP rate)
create or replace function qm_paycert_line_set(
  p_cert_id bigint, p_kashef_id bigint, p_bop_item_id bigint, p_qty numeric
) returns json language plpgsql security definer set search_path = public as $qm$
declare
  v_c qm_pay_certs;
  v_rate numeric;
  v_ref text;
  v_old numeric;
begin
  if auth.uid() is null then return json_build_object('success', false, 'error', 'no session'); end if;
  select * into v_c from qm_pay_certs where id = p_cert_id;
  if v_c.id is null then return json_build_object('success', false, 'error', 'not found'); end if;
  select rate into v_rate from qm_bop_items where id = p_bop_item_id;
  if v_rate is null then return json_build_object('success', false, 'error', 'bop item not found'); end if;
  v_ref := qm_item_ref(p_bop_item_id);
  select qty into v_old from qm_pay_cert_lines
    where cert_id = p_cert_id and kashef_id is not distinct from p_kashef_id and bop_item_id = p_bop_item_id;

  if p_qty is null or p_qty = 0 then
    delete from qm_pay_cert_lines
      where cert_id = p_cert_id and kashef_id is not distinct from p_kashef_id and bop_item_id = p_bop_item_id;
    if found then
      perform qm_log('paycert', p_cert_id, 'line_remove', '', v_ref, coalesce(v_old::text, ''), '');
    end if;
  else
    insert into qm_pay_cert_lines (cert_id, kashef_id, bop_item_id, qty, amount)
    values (p_cert_id, p_kashef_id, p_bop_item_id, p_qty, round(p_qty * v_rate, 3))
    on conflict (cert_id, kashef_id, bop_item_id)
    do update set qty = excluded.qty, amount = excluded.amount;
    perform qm_log('paycert', p_cert_id,
                   case when v_old is null then 'line_add' else 'line_qty' end,
                   '', v_ref, coalesce(v_old::text, ''), p_qty::text);
  end if;
  return json_build_object('success', true);
exception when others then
  return json_build_object('success', false, 'error', SQLERRM);
end $qm$;

create or replace function qm_paycert_delete(p_cert_id bigint)
returns json language plpgsql security definer set search_path = public as $qm$
declare
  v_c qm_pay_certs;
  v_lines int;
begin
  if auth.uid() is null then return json_build_object('success', false, 'error', 'no session'); end if;
  select * into v_c from qm_pay_certs where id = p_cert_id;
  if v_c.id is null then return json_build_object('success', false, 'error', 'not found'); end if;
  select count(*) into v_lines from qm_pay_cert_lines where cert_id = p_cert_id;
  perform qm_log('paycert', p_cert_id, 'delete', '', '',
                 'دفعة رقم ' || v_c.cert_no || ' — ' || v_lines || ' بند', '');
  delete from qm_pay_certs where id = p_cert_id;   -- lines cascade
  return json_build_object('success', true, 'linesRemoved', v_lines);
end $qm$;

do $qm$
declare f text;
begin
  foreach f in array array[
    'qm_paycert_create(text,int,date,text,text,jsonb)',
    'qm_paycert_update(bigint,jsonb)',
    'qm_paycert_line_set(bigint,bigint,bigint,numeric)',
    'qm_paycert_delete(bigint)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $qm$;

-- ── 3. views ─────────────────────────────────────────────────────────
create or replace view qm_paycert_overview
with (security_invoker = true) as
select pc.id, pc.contract_id, c.code as contract_code, c.pct,
       pc.cert_no, pc.period_end, pc.source, pc.status, pc.note, pc.created_at,
       coalesce(l.n, 0)  as line_count,
       coalesce(l.wos, 0) as wo_count,
       coalesce(l.subtotal, 0) as subtotal,
       round(coalesce(l.subtotal, 0) * (1 + c.pct / 100), 3) as total_after_pct
from qm_pay_certs pc
join qm_contracts c on c.id = pc.contract_id
left join (
  select cl.cert_id, count(*) as n, count(distinct cl.kashef_id) as wos,
         sum(cl.qty * bi.rate) as subtotal
  from qm_pay_cert_lines cl join qm_bop_items bi on bi.id = cl.bop_item_id
  group by 1
) l on l.cert_id = pc.id;

create or replace view qm_paycert_lines_v
with (security_invoker = true) as
select cl.id, cl.cert_id, cl.kashef_id, k.kashef_no, k.wo_no, k.area,
       cl.bop_item_id, bi.bab, bi.band, bi.suffix, bi.description, bi.unit, bi.rate,
       cl.qty, cl.amount, round(cl.qty * bi.rate, 3) as computed_amount
from qm_pay_cert_lines cl
join qm_bop_items bi on bi.id = cl.bop_item_id
left join qm_kashefs k on k.id = cl.kashef_id;

-- Σ certified per WO×item across all certs — the generation screen reads
-- this next to executed totals to prefill the uncertified balance.
create or replace view qm_certified_totals
with (security_invoker = true) as
select cl.kashef_id, cl.bop_item_id, sum(cl.qty) as qty_certified
from qm_pay_cert_lines cl
group by 1, 2;

-- Σ executed per WO×item from طلبات التدقيق (includes out-of-WO items).
create or replace view qm_exec_totals
with (security_invoker = true) as
select t.kashef_id, tl.bop_item_id, sum(tl.qty) as qty_executed,
       max(t.tadqiq_date) as last_date
from qm_tadqiq t join qm_tadqiq_lines tl on tl.tadqiq_id = t.id
group by 1, 2;

revoke all on qm_paycert_overview, qm_paycert_lines_v, qm_certified_totals, qm_exec_totals from anon;
grant select on qm_paycert_overview, qm_paycert_lines_v, qm_certified_totals, qm_exec_totals to authenticated;
