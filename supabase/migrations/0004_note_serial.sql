-- ═══════════════════════════════════════════════════════════════════
-- COPRI ASPHALT — 0004: serial delivery-note numbers + atomic dispatch RPC
-- ═══════════════════════════════════════════════════════════════════
-- Printed A5 delivery notes replace the carbon book (plant printer, July
-- 2026). The note number is no longer typed by the clerk: the database
-- allocates it from a sequence that continues the carbon-book numbering.
-- Safe to run BEFORE the new frontend deploys — the old direct-insert path
-- keeps working until 0005 revokes it.

-- Sequence continues right after the highest numeric note recorded so far
-- (126185 at the time of writing → first printed note = 126186).
create sequence if not exists delivery_note_serial;
select setval('delivery_note_serial', greatest(
  126185,
  coalesce((select max(note::bigint) from dispatch_loads
            where note ~ '^[0-9]{1,9}$'), 126185)
));

-- Client-generated idempotency ref: a retry after a dropped response returns
-- the already-inserted note instead of consuming a new serial / double-logging.
alter table dispatch_loads add column if not exists client_ref text;
create unique index if not exists dispatch_client_ref
  on dispatch_loads (client_ref) where client_ref is not null and client_ref <> '';

-- Atomic dispatch submit: allocate serial note + insert in one transaction.
-- If a legacy/manual insert already took the next serial (possible only in
-- the brief window before 0005), skip forward to the next free number.
create or replace function dispatch_submit(
  p_client_ref text,
  p_project text, p_contract text, p_work_order text,
  p_plant text, p_truck text, p_driver text, p_mix text,
  p_weight numeric, p_temp_dispatch numeric,
  p_site text, p_block text, p_street text, p_loc_type text,
  p_clerk text, p_remarks text, p_company text, p_naqel text,
  p_driver_phone text, p_load_number int, p_notify_engineer text
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_note text;
  v_existing_note text;
begin
  -- Idempotent retry: this submission already landed → same note back.
  if coalesce(p_client_ref, '') <> '' then
    select note into v_existing_note from dispatch_loads where client_ref = p_client_ref;
    if found then
      return json_build_object('success', true, 'note', v_existing_note, 'resumed', true);
    end if;
  end if;

  for i in 1..20 loop
    v_note := nextval('delivery_note_serial')::text;
    begin
      insert into dispatch_loads (
        note, client_ref, project, contract, work_order, plant, truck, driver,
        mix, weight, temp_dispatch, site, block, street, loc_type, clerk,
        remarks, status, company, naqel, driver_phone, load_number, notify_engineer
      ) values (
        v_note, nullif(p_client_ref, ''), coalesce(p_project, ''), coalesce(p_contract, ''),
        coalesce(p_work_order, ''), coalesce(p_plant, ''), coalesce(p_truck, ''),
        coalesce(p_driver, ''), coalesce(p_mix, ''), p_weight, p_temp_dispatch,
        coalesce(p_site, ''), coalesce(p_block, ''), coalesce(p_street, ''),
        coalesce(p_loc_type, ''), coalesce(p_clerk, ''), coalesce(p_remarks, ''),
        'في الطريق',
        coalesce(p_company, ''), coalesce(p_naqel, ''), coalesce(p_driver_phone, ''),
        p_load_number, coalesce(p_notify_engineer, '')
      );
      return json_build_object('success', true, 'note', v_note);
    exception when unique_violation then
      -- Either the serial was already used by a manual insert (skip to the
      -- next one), or a concurrent retry with the same client_ref won the
      -- race (return its note).
      if coalesce(p_client_ref, '') <> '' then
        select note into v_existing_note from dispatch_loads where client_ref = p_client_ref;
        if found then
          return json_build_object('success', true, 'note', v_existing_note, 'resumed', true);
        end if;
      end if;
    end;
  end loop;
  return json_build_object('success', false, 'error', 'could not allocate a note number');
end $$;

grant execute on function dispatch_submit to anon, authenticated;
