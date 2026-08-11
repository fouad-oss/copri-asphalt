-- ═══════════════════════════════════════════════════════════════════
-- COPRI ASPHALT — 0031: two Expressway asphalt engineers (2026-08-11)
-- ═══════════════════════════════════════════════════════════════════
-- Adds to staff (the asphalt/dispatch engineer recipient source behind
-- ref_payload → legacy + React engineer lists):
--   أندرو ماهر  (Andrew Maher)  +965 66767748  PIN 6291
--   علي صابر    (Ali Saber)     +965 66445278  PIN 3874
-- Scoped to كوبري — الطرق السريعة via staff.project_id — they never
-- appear under كوبري — صيانة حولي. function='asphalt' + milling=false
-- keeps them out of civil, materials-receiver, and milling lists.
-- (staff has no Latin-name column; Latin names live in this header.)
--
-- Re-paste safe: on conflict (project_id, name) the row is updated in
-- place, and the PIN guard ignores the two engineers' own staff rows.

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

  -- PIN-uniqueness guard, evaluated at paste time against every
  -- PIN-bearing table that exists in this database.
  foreach v_tbl in array array[
    'staff','clerks','plant_managers','finance_managers',
    'milling_managers','pipeline_users','blueprint_reporters'
  ] loop
    if to_regclass('public.' || v_tbl) is null then continue; end if;
    execute format(
      'select string_agg(distinct pin, '','') from %I where pin in (''6291'',''3874'')%s',
      v_tbl,
      case when v_tbl = 'staff'
           then ' and name not in (''أندرو ماهر'',''علي صابر'')' else '' end
    ) into v_hit;
    if v_hit is not null then
      v_hits := v_hits || format(' [%s: %s]', v_tbl, v_hit);
    end if;
  end loop;
  if v_hits <> '' then
    raise exception 'PIN collision —%s. Pick new PINs and update this file plus the two baked configs before pasting.', v_hits;
  end if;

  insert into staff (project_id, name, pin, phone, function, milling) values
    (v_project, 'أندرو ماهر', '6291', '96566767748', 'asphalt', false),
    (v_project, 'علي صابر',  '3874', '96566445278', 'asphalt', false)
  on conflict on constraint staff_project_name_key do update
    set pin      = excluded.pin,
        phone    = excluded.phone,
        function = excluded.function,
        milling  = excluded.milling;
end $$;

-- Verify (should return exactly 3 rows, all كوبري — الطرق السريعة):
-- select p.name project, s.name, s.pin, s.phone, s.function, s.milling
-- from staff s join projects p on p.id = s.project_id
-- where p.name = 'كوبري — الطرق السريعة';
