-- ═══════════════════════════════════════════════════════════════════
-- COPRI ASPHALT — 0012: Blueprint report deletion (for backfill fixes)
-- ═══════════════════════════════════════════════════════════════════
-- The worklog stays append-only for everyone; corrections happen by
-- deleting a whole report (all its segment rows) and re-entering it.
-- A reporter can only delete reports saved under their own name, so
-- when engineers join later they can't touch each other's entries.

create or replace function blueprint_report_delete(p_pin text, p_report_id text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_rows int;
begin
  select name into v_name from blueprint_reporters where pin = p_pin and active limit 1;
  if v_name is null then
    return json_build_object('success', false, 'error', 'bad pin');
  end if;
  if p_report_id is null or p_report_id = '' then
    return json_build_object('success', false, 'error', 'bad report id');
  end if;
  delete from blueprint_worklog
  where report_id = p_report_id and by_name = v_name;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return json_build_object('success', false, 'error', 'not found or not yours');
  end if;
  return json_build_object('success', true, 'rows', v_rows);
end $$;
grant execute on function blueprint_report_delete(text, text) to anon, authenticated;
