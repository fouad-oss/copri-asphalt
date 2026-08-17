-- ═══════════════════════════════════════════════════════════════════
-- COPRI ASPHALT — 0060: Expressway asphalt receiver مينا رأفت (2026-08-17)
-- ═══════════════════════════════════════════════════════════════════
-- Adds to staff (the asphalt/dispatch engineer recipient source behind
-- ref_payload → legacy + React engineer lists):
--   مينا رأفت  (Mina Raafat)  +965 99970863  PIN 7479
-- Scoped to كوبري — الطرق السريعة via staff.project_id (receiving only,
-- Expressway only — never appears under كوبري — صيانة حولي).
-- function='asphalt' + milling=false keeps him out of civil, materials-
-- receiver and milling lists. Same shape as 0031.
--
-- Re-paste safe: on conflict (project_id, name) the row is updated in
-- place, and the PIN guard ignores his own staff row.

do $$
declare
  v_project bigint;
  v_tbl     text;
  v_hit     text;
  v_hits    text := '';
begin
  select id into v_project from projects where name = 'كوبري — الطرق السريعة';
  if v_project is null then
    raise exception 'project "كوبري — الطرق السريعة" not found — aborting, nothing inserted';
  end if;

  foreach v_tbl in array array[
    'staff','clerks','plant_managers','finance_managers',
    'milling_managers','pipeline_users','blueprint_reporters'
  ] loop
    if to_regclass('public.' || v_tbl) is null then continue; end if;
    execute format(
      'select string_agg(distinct pin, '','') from %I where pin = ''7479''%s',
      v_tbl,
      case when v_tbl = 'staff' then ' and name <> ''مينا رأفت''' else '' end
    ) into v_hit;
    if v_hit is not null then
      v_hits := v_hits || format(' [%s: %s]', v_tbl, v_hit);
    end if;
  end loop;
  if v_hits <> '' then
    raise exception 'PIN collision —%s. Pick a new PIN and update this file plus the two baked configs before pasting.', v_hits;
  end if;

  insert into staff (project_id, name, pin, phone, function, milling) values
    (v_project, 'مينا رأفت', '7479', '96599970863', 'asphalt', false)
  on conflict on constraint staff_project_name_key do update
    set pin      = excluded.pin,
        phone    = excluded.phone,
        function = excluded.function,
        milling  = excluded.milling;
end $$;

-- Verify (should now return 4 rows, all كوبري — الطرق السريعة):
-- select p.name project, s.name, s.pin, s.phone, s.function, s.milling
-- from staff s join projects p on p.id = s.project_id
-- where p.name = 'كوبري — الطرق السريعة';
