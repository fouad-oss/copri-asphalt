-- ═══════════════════════════════════════════════════════════════════
-- COPRI ASPHALT — 0007: recipient request → work-order request
-- ═══════════════════════════════════════════════════════════════════
-- The plant manager's request now carries the commercial terms: one row
-- per mix type with a mandatory quantity (tons) and unit rate (KD/ton).
-- Safe to run BEFORE the new frontend deploys: this ADDS an overload of
-- recipient_request_submit — the live 6-arg version keeps working until
-- the new build is on main (drop it in a later cleanup).

alter table recipient_requests
  add column if not exists items jsonb not null default '[]'::jsonb;  -- [{mix, qty, rate}]

create or replace function recipient_request_submit(
  p_company text, p_client text, p_contract text, p_payment text,
  p_details text, p_by text, p_items jsonb
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_bad int;
begin
  if coalesce(p_client, '') = '' then
    return json_build_object('success', false, 'error', 'client is required');
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    return json_build_object('success', false, 'error', 'at least one mix row is required');
  end if;
  select count(*) into v_bad from jsonb_array_elements(p_items) x
   where coalesce(x->>'mix', '') = ''
      or coalesce((x->>'qty')::numeric, 0) <= 0
      or coalesce((x->>'rate')::numeric, 0) <= 0;
  if v_bad > 0 then
    return json_build_object('success', false, 'error', 'every row needs mix, quantity and unit rate');
  end if;
  insert into recipient_requests (company, client, contract, payment, details, requested_by, items)
  values (coalesce(p_company, ''), p_client, coalesce(p_contract, ''), coalesce(p_payment, ''),
          coalesce(p_details, ''), coalesce(p_by, ''), p_items)
  returning id into v_id;
  return json_build_object('success', true, 'id', v_id);
exception when check_violation then
  return json_build_object('success', false, 'error', 'invalid payment value');
end $$;

grant execute on function recipient_request_submit(text, text, text, text, text, text, jsonb) to anon, authenticated;
