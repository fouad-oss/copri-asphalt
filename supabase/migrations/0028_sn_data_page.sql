-- 0028_sn_data_page.sql — ACCOUNTING PIVOT step 7 (brief Part 5).
-- External read-only page for SpectroNova staff: published bundles only,
-- frozen 12-column layout, and ONE write — the import confirmation
-- (imported_flag + sn_reference). Access = a TOKEN, not a PIN; rotation
-- is trivial: edit the single `sn_page_token` settings row (Table
-- Editor) and share the new link. NOTE (v1 posture): the token gates the
-- page UX; the underlying tables stay anon-readable like the rest of
-- the app until the auth phase hardens RLS.

-- One config value. gen_random_uuid() seeds a 32-hex token; rotate by
-- editing value->>'token'.
insert into pipeline_settings (key, value, updated_by)
values ('sn_page_token',
        jsonb_build_object('token', replace(gen_random_uuid()::text, '-', '')),
        'migration 0028')
on conflict (key) do nothing;

create or replace function sn_token_ok(p_token text) returns boolean
language sql stable as $$
  select coalesce(
    p_token <> '' and p_token = (select value->>'token' from pipeline_settings
                                  where key = 'sn_page_token'),
    false)
$$;

-- Full payload for the page: every published transcription row (the
-- client filters by date range / PO / site and derives the pending-
-- import queue from imported_flag).
create or replace function sn_page_data(p_token text) returns json
language sql stable security definer set search_path = public as $$
  select case when not sn_token_ok(p_token)
    then json_build_object('success', false, 'error', 'bad token')
    else json_build_object(
      'success', true,
      'rows', (select coalesce(json_agg(row_to_json(t)
                 order by t.published_at desc, t.bundle_id desc, t.line_id), '[]'::json)
               from bundle_transcription t where t.status = 'published'))
  end
$$;
grant execute on function sn_page_data(text) to anon, authenticated;

-- SN staff's ONLY write: record that a bundle was transcribed into SN
-- (INVSI/… and/or Stock_Receipt/… references). Overwrite allowed — the
-- audit trail keeps history; the accountant has her own RPC (0027).
create or replace function sn_import_confirm(
  p_token text, p_bundle_id bigint, p_sn_reference text
) returns json
language plpgsql security definer set search_path = public as $$
declare v_b bundles%rowtype;
begin
  if not sn_token_ok(p_token) then
    return json_build_object('success', false, 'error', 'bad token');
  end if;
  select * into v_b from bundles where id = p_bundle_id;
  if not found then return json_build_object('success', false, 'error', 'not found'); end if;
  if v_b.status <> 'published' then
    return json_build_object('success', false, 'error', 'not published');
  end if;
  if coalesce(trim(p_sn_reference), '') = '' then
    return json_build_object('success', false, 'error', 'reference required');
  end if;
  perform set_config('app.pipeline_actor', 'SN staff — data page', true);
  update bundles set imported_flag = true, sn_reference = trim(p_sn_reference), imported_at = now()
  where id = p_bundle_id;
  return json_build_object('success', true);
end $$;
grant execute on function sn_import_confirm(text, bigint, text) to anon, authenticated;
