# -*- coding: utf-8 -*-
"""
qm_expw_site_clean.py — re-key the 65 Expressway work orders onto the
site model agreed 2026-08-17 (road 30/40/other → km range / spot / none)
and onto the scope taxonomy (asphalt / civil{civil,storm,sewage,tiles} /
metal / other), moving the ministry's wording into the new `description`
column. Emits supabase/migrations/0062_qm_wo_scope_description.sql.

The MAPPING below is the whole point: one explicit line per work order,
reviewed by hand against 0050's headers (tools/… dump). Re-runnable —
the emitted SQL only UPDATEs, guarded by contract + kashef_no.

Usage:  python tools/qm_expw_site_clean.py
"""
import io, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "supabase", "migrations", "0062_qm_wo_scope_description.sql")

R30, R40 = "طريق الفحيحيل", "طريق الملك فهد"
MISC = "أعمال طارئة ومتفرقة"

# scope code → Arabic label (work_type keeps a readable string for prints)
SCOPE_AR = {
    "asphalt": "أسفلت", "civil": "أعمال مدنية", "storm": "أمطار", "sewage": "صحي",
    "tiles": "بلاط", "metal": "أعمال معدنية", "other": "أخرى",
}

# wo: (area, sub, km_from, km_to, direction, spot_text, scopes)
#   sub: "range" | "spot" | "none".  area is a preset road or an «other»
#   site name (short — the long ministry wording goes to description).
#   loc_type := 'misc' only when area is not a preset road AND sub == none.
MAPPING = {
    1:  (R40, "range", 7, 12, "بالاتجاهين", "", ["metal", "other"]),
    2:  (MISC, "none", None, None, "", "", ["other"]),
    3:  (R30, "spot", None, None, "", "مخرج صباح السالم", ["other"]),
    4:  ("الملك فهد + الفحيحيل + النويصيب", "none", None, None, "", "", ["storm"]),
    5:  (R30, "range", 20, None, "بالاتجاهين", "", ["other"]),
    6:  (R30, "range", 9.4, 12.1, "اتجاه الجنوب", "", ["asphalt"]),
    7:  (R30, "range", 9.2, 12.2, "اتجاه الجنوب", "", ["asphalt"]),
    9:  (R30, "none", None, None, "بالاتجاهين", "", ["other"]),
    10: (R30, "range", 15.7, 12, "اتجاه الشمال", "", ["asphalt"]),
    11: (MISC, "none", None, None, "", "", ["other"]),
    12: (R30, "range", 13.4, 14, "اتجاه الجنوب", "", ["asphalt"]),
    13: (R30, "range", 9.2, 14, "اتجاه الجنوب", "", ["other"]),          # تخطيط أرضي
    14: (R30, "range", 15.7, 12, "اتجاه الشمال", "", ["other"]),
    15: (MISC, "none", None, None, "", "", ["other"]),
    16: (R30, "spot", None, None, "", "تقاطع (78) مع نادي الفحيحيل", ["asphalt"]),
    17: (R30, "range", 16, 17, "اتجاه الجنوب", "", ["asphalt"]),
    18: (R30, "spot", None, None, "", "تقاطع (78) مع نادي الفحيحيل", ["civil"]),
    19: (R30, "range", 11, 5, "اتجاه الشمال", "", ["asphalt"]),
    20: (R30, "range", 11, 5, "", "", ["tiles"]),
    21: (R30, "spot", None, None, "", "مدخل ومخرج سلوى", ["civil"]),
    22: ("مستودعات الوزارة", "none", None, None, "", "", ["metal"]),
    23: ("منظومة قياس وزن الشاحنات", "none", None, None, "", "", ["other"]),
    24: (R30, "range", 12, 5, "اتجاه الشمال", "", ["other"]),
    25: (R30, "range", 11, 10, "اتجاه الكويت", "", ["tiles"]),
    26: (R30, "range", 16, 17, "اتجاه الجنوب", "", ["other"]),
    27: ("طريق الملك عبد العزيز", "spot", None, None, "اتجاه الجنوب", "تقاطع (86)", ["other"]),
    28: ("الشعيبة الصناعية", "none", None, None, "", "", ["storm"]),
    29: ("الطريق الساحلي", "spot", None, None, "", "مدخل بعد فندق السفير", ["other"]),
    30: ("طريق أم صفق", "none", None, None, "", "", ["storm", "other"]),
    31: (MISC, "none", None, None, "", "", ["other"]),
    32: (R30, "spot", None, None, "", "تقاطع (78) مع نادي الفحيحيل", ["other"]),
    33: (R30, "range", 1.2, 2.7, "اتجاه الفحيحيل", "", ["asphalt"]),
    34: (R30, "spot", None, None, "", "تقاطع (16) مع الدائري الرابع", ["asphalt"]),
    35: (R30, "spot", None, None, "", "تقاطع (16) مع الدائري الرابع", ["other"]),
    36: (R30, "spot", None, None, "", "تقاطع (16) مع الدائري الرابع", ["civil"]),
    37: ("الجسور", "none", None, None, "", "", ["civil"]),                 # فواصل التمدد
    38: (R30, "spot", None, None, "", "تقاطع (76A) مع نادي الساحل", ["asphalt"]),
    39: (R30, "range", 0, 5, "اتجاه الجنوب", "", ["tiles"]),
    40: (R30, "range", 0, 5, "اتجاه الجنوب", "", ["metal"]),
    41: (R30, "range", 0, 3.3, "اتجاه الجنوب", "", ["other"]),
    42: (R30, "range", 11, 5, "", "", ["tiles"]),
    43: (R30, "range", 18, 25, "اتجاه الجنوب", "", ["asphalt"]),
    44: ("الملك فهد + الفحيحيل", "none", None, None, "", "", ["storm"]),
    45: ("الفنيطيس", "none", None, None, "", "", ["metal"]),
    46: (R30, "spot", None, None, "", "تقاطع (76A) مع نادي الساحل", ["other"]),
    47: (R30, "spot", None, None, "", "تقاطع (76A) مع نادي الساحل", ["storm"]),
    48: ("أماكن متفرقة", "none", None, None, "", "", ["other"]),
    49: (R40, "none", None, None, "", "", ["metal"]),                       # أماكن متفرقة على الطريق
    50: (R30, "spot", None, None, "", "تقاطع (76A) مع نادي الساحل", ["civil"]),
    51: (MISC, "none", None, None, "", "", ["other"]),
    52: (R30, "range", 17, 25.8, "", "", ["other"]),
    53: ("الطريق الساحلي", "spot", None, None, "", "مدخل بعد فندق السفير + أماكن متفرقة على طريق الفحيحيل", ["other"]),
    54: (R30, "range", 20, None, "", "", ["storm"]),
    55: (R30, "spot", None, None, "", "تقاطع الفحيحيل مع الدائري السابع", ["metal"]),
    56: (MISC, "none", None, None, "", "", ["storm"]),                      # طوارئ امطار
    57: (R30, "range", 26.5, 27, "اتجاه الجنوب", "", ["asphalt"]),
    58: (R30, "spot", None, None, "اتجاه الشمال", "مدخل ومخرج السفارات", ["other"]),
    59: (MISC, "none", None, None, "", "", ["other"]),
    60: (MISC, "none", None, None, "", "", ["other"]),
    63: (R40, "range", 0, 3.5, "اتجاه الجنوب", "", ["asphalt"]),
    64: (R30, "spot", None, None, "", "تقاطع طريق 30 مع طريق 207", ["tiles", "other"]),
    65: (R30, "spot", None, None, "", "من بداية طريق الاستقلال حتى تقاطع (15)", ["metal"]),
    66: (R30, "range", 26.5, 27, "اتجاه الجنوب", "", ["other"]),
    67: (R30, "none", None, None, "بالاتجاهين", "", ["asphalt"]),
    68: (MISC, "none", None, None, "", "", ["other"]),
}

def station(km):
    whole = int(km); m = int(round((km - whole) * 1000))
    return f"{whole}+{m:03d}"

def range_text(kf, kt):
    if kf is not None and kt is not None: return f"من محطة {station(kf)} إلى محطة {station(kt)}"
    if kf is not None: return f"عند محطة {station(kf)}"
    if kt is not None: return f"إلى محطة {station(kt)}"
    return ""

def esc(s): return s.replace("'", "''")
def num(v): return "null" if v is None else repr(float(v)).rstrip("0").rstrip(".") if isinstance(v, float) else str(v)

def load_0050():
    """wo → (area, loc_type, work_type, location_text) as 0050 stored them —
    the description is built from these, so nothing is lost."""
    p = os.path.join(ROOT, "supabase", "migrations", "0050_qm_expw_wo_backfill.sql")
    s = io.open(p, encoding="utf-8").read()
    rx = re.compile(r"values \(v_contract, (\d+), '([^']*)', '(\w+)', '', '', '([^']*)', 'wo', '\d+', "
                    r"date '[^']*', date '[^']*', (?:\d+|null), (?:\d+|null), '([^']*)'")
    return {int(w): (a.replace("''", "'"), lt, wt, tx.replace("''", "'")) for w, a, lt, wt, tx in rx.findall(s)}

def main():
    src = load_0050()
    missing = sorted(set(src) - set(MAPPING)); extra = sorted(set(MAPPING) - set(src))
    assert not missing and not extra, (missing, extra)

    rows = []
    for wo in sorted(MAPPING):
        area, sub, kf, kt, direction, spot, scopes = MAPPING[wo]
        old_area, old_lt, old_wt, old_text = src[wo]
        preset = area in (R30, R40)
        if sub == "range":
            loc_type, text = "chainage", range_text(kf, kt)
        elif sub == "spot":
            loc_type, text = "chainage", spot
        else:
            loc_type = "chainage" if preset else "misc"
            text = (area + (" " + direction if direction else "")) if preset else ""
        # description = the ministry's wording (chainage rows) or the old
        # cluttered area (misc rows); never the short site name we now store
        desc = old_text or old_area
        if desc.strip() == area.strip(): desc = ""
        work_type = " + ".join(SCOPE_AR[c] for c in scopes)
        rows.append((wo, area, loc_type, text, kf if sub == "range" else None,
                     kt if sub == "range" else None, direction, desc, scopes, work_type, old_wt))

    body = []
    for wo, area, lt, text, kf, kt, d, desc, scopes, wt, old_wt in rows:
        arr = "array[" + ",".join("'" + c + "'" for c in scopes) + "]::text[]"
        body.append(f"""  update qm_kashefs set
       area = '{esc(area)}', loc_type = '{lt}', location_text = '{esc(text)}',
       km_from = {num(kf)}, km_to = {num(kt)}, direction = '{esc(d)}',
       description = '{esc(desc)}', scopes = {arr}, work_type = '{esc(wt)}'
   where contract_id = v_contract and kashef_no = {wo}
   returning id into v_id;
  if v_id is not null then
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('kashef', v_id, 'update', 'site', '', '', '{esc(area)} — {esc(text)}', 'expw-site-clean'),
           ('kashef', v_id, 'update', 'scopes', '', '{esc(old_wt)}', '{esc(wt)}', 'expw-site-clean');
    v_n := v_n + 1;
  end if;
  v_id := null;
""")

    sql = HEADER + "\n".join(body) + FOOTER
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(sql)
    print(f"wrote {OUT}: {len(rows)} work orders, {os.path.getsize(OUT)//1024} KB")
    # review table
    for wo, area, lt, text, kf, kt, d, desc, scopes, wt, old_wt in rows:
        print(f"{wo:>2} | {lt:8} | {area} | {text} | {d} | {','.join(scopes)}")

HEADER = r"""-- ════════════════════════════════════════════════════════════════════
-- 0062 — QUANTITIES: work-order description + scope taxonomy, and the
--        Expressway site clean-up (Fouad, 2026-08-17)
--
-- Generated by tools/qm_expw_site_clean.py — the per-WO mapping lives
-- there. Idempotent; safe to re-run. Paste after 0061 (independent).
--
--   A. qm_kashefs.description  — the ministry's own wording of the work
--      order. Shown ONLY on the WO page; the register/dashboard use the
--      short site fields. For the Expressway backfill this is where the
--      old cluttered `area` / `location_text` sentences go.
--   B. qm_kashefs.scopes text[] — MULTI-select scope of works, codes:
--        asphalt                    أسفلت
--        civil | storm | sewage | tiles   أعمال مدنية (عامة / أمطار / صحي / بلاط)
--        metal                      أعمال معدنية
--        other                      أخرى
--      `work_type` (free text) is KEPT as the printable label and is
--      rewritten from the scopes on save («أسفلت + أعمال معدنية»).
--   C. qm_kashef_create: +p_description, +p_scopes (old signature dropped,
--      as 0035/0049 did).
--   D. qm_kashef_update: learns 'description' and 'scopes' (scopes arrive
--      as a comma-separated code string — p_fields is text-valued).
--   E. qm_kashef_overview: description + scopes APPENDED (42P16).
--   G. Hawalli WOs get scopes from their legacy work_type (keyword map).
--   F. DATA — every Expressway WO re-keyed: area = طريق الفحيحيل /
--      طريق الملك فهد / a short «other» site; location_text = the km
--      range («من محطة 9+200 إلى محطة 12+200») or the spot name
--      («تقاطع (78) مع نادي الفحيحيل»); direction; description = the old
--      full sentence; scopes + work_type. Logged to qm_changelog with
--      actor 'expw-site-clean'.
-- ════════════════════════════════════════════════════════════════════

-- ── A + B. columns ───────────────────────────────────────────────────
alter table qm_kashefs add column if not exists description text   not null default '';
alter table qm_kashefs add column if not exists scopes      text[] not null default '{}';

do $qmsc$
begin
  if not exists (select 1 from pg_constraint con join pg_class rel on rel.oid = con.conrelid
                  where rel.relname = 'qm_kashefs' and con.conname = 'qm_kashefs_scopes_check') then
    alter table qm_kashefs add constraint qm_kashefs_scopes_check
      check (scopes <@ array['asphalt','civil','storm','sewage','tiles','metal','other']::text[]);
  end if;
end $qmsc$;

-- ── C. qm_kashef_create ──────────────────────────────────────────────
drop function if exists qm_kashef_create(text,int,text,text,text,text,text,jsonb,date,text,text,date,int,text,numeric,numeric,text);

create or replace function qm_kashef_create(
  p_contract_code text, p_kashef_no int, p_area text, p_loc_type text,
  p_block_no text, p_street_name text, p_work_type text,
  p_lines jsonb,
  p_kashef_date date default null,
  p_status text default 'wo', p_wo_no text default '', p_wo_date date default null,
  p_duration_days int default null,
  p_location_text text default '', p_km_from numeric default null,
  p_km_to numeric default null, p_direction text default '',
  p_description text default '', p_scopes text[] default '{}'
) returns json language plpgsql security definer set search_path = public as $qm$
declare
  v_contract qm_contracts;
  v_id bigint;
  v_line jsonb;
  v_item qm_bop_items;
  v_qty numeric;
  v_count int := 0;
begin
  if auth.uid() is null then return json_build_object('success', false, 'error', 'no session'); end if;
  select * into v_contract from qm_contracts where code = p_contract_code;
  if v_contract.id is null then return json_build_object('success', false, 'error', 'unknown contract'); end if;
  if p_loc_type not in ('block','street','misc','chainage') then
    return json_build_object('success', false, 'error', 'bad loc_type');
  end if;
  if p_loc_type = 'block' and coalesce(p_block_no, '') = '' then
    return json_build_object('success', false, 'error', 'block_no required');
  end if;
  if p_loc_type = 'street' and coalesce(p_street_name, '') = '' then
    return json_build_object('success', false, 'error', 'street_name required');
  end if;
  if p_loc_type = 'chainage' and coalesce(p_location_text, '') = '' then
    return json_build_object('success', false, 'error', 'location_text required');
  end if;
  if not (coalesce(p_scopes, '{}') <@ array['asphalt','civil','storm','sewage','tiles','metal','other']::text[]) then
    return json_build_object('success', false, 'error', 'bad scope');
  end if;
  if p_status not in ('kashef','wo') then
    return json_build_object('success', false, 'error', 'bad status');
  end if;
  if p_status = 'wo' and coalesce(p_wo_no, '') = '' then
    return json_build_object('success', false, 'error', 'wo_no required for wo status');
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    return json_build_object('success', false, 'error', 'no lines');
  end if;

  insert into qm_kashefs (contract_id, kashef_no, area, loc_type, block_no, street_name,
                          work_type, status, wo_no, wo_date, kashef_date, duration_days,
                          location_text, km_from, km_to, direction, description, scopes, created_by)
  values (v_contract.id, p_kashef_no, coalesce(p_area,''), p_loc_type,
          case when p_loc_type = 'block'  then coalesce(p_block_no,'')    else '' end,
          case when p_loc_type = 'street' then coalesce(p_street_name,'') else '' end,
          coalesce(p_work_type,''), p_status, coalesce(p_wo_no,''), p_wo_date,
          coalesce(p_kashef_date, p_wo_date, (now() at time zone 'Asia/Kuwait')::date),
          p_duration_days,
          case when p_loc_type = 'chainage' then coalesce(p_location_text,'') else '' end,
          case when p_loc_type = 'chainage' then p_km_from else null end,
          case when p_loc_type = 'chainage' then p_km_to   else null end,
          case when p_loc_type = 'chainage' then coalesce(p_direction,'')   else '' end,
          coalesce(p_description, ''), coalesce(p_scopes, '{}'),
          auth.uid())
  returning id into v_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    select * into v_item from qm_bop_items
      where id = (v_line->>'bop_item_id')::bigint and contract_id = v_contract.id;
    if v_item.id is null then
      raise exception 'bop item % not found in contract', v_line->>'bop_item_id';
    end if;
    v_qty := (v_line->>'qty')::numeric;
    if v_qty is null or v_qty < 0 then
      raise exception 'bad qty for item %', qm_item_ref(v_item.id);
    end if;
    insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_id, v_item.id, v_qty);
    v_count := v_count + 1;
  end loop;

  perform qm_log('kashef', v_id, 'create', '', '',
                 '', 'أمر عمل ' || coalesce(nullif(p_wo_no,''), p_kashef_no::text) || ' — ' || v_count || ' بند');
  return json_build_object('success', true, 'id', v_id, 'lines', v_count);
exception when unique_violation then
  return json_build_object('success', false, 'error', 'kashef_no already exists');
end $qm$;

-- ── D. qm_kashef_update ──────────────────────────────────────────────
create or replace function qm_kashef_update(p_kashef_id bigint, p_fields jsonb)
returns json language plpgsql security definer set search_path = public as $qm$
declare
  v_k qm_kashefs;
  v_key text;
  v_new text;
  v_old text;
  v_changed int := 0;
  v_scopes text[];
begin
  if auth.uid() is null then return json_build_object('success', false, 'error', 'no session'); end if;
  select * into v_k from qm_kashefs where id = p_kashef_id;
  if v_k.id is null then return json_build_object('success', false, 'error', 'not found'); end if;

  for v_key in select jsonb_object_keys(p_fields) loop
    if v_key not in ('area','loc_type','block_no','street_name','work_type','kashef_no',
                     'kashef_date','wo_no','wo_date','duration_days','closed','daily_penalty',
                     'location_text','km_from','km_to','direction','description','scopes') then
      return json_build_object('success', false, 'error', 'field not editable: ' || v_key);
    end if;
  end loop;
  if p_fields ? 'loc_type' and p_fields->>'loc_type' not in ('block','street','misc','chainage') then
    return json_build_object('success', false, 'error', 'bad loc_type');
  end if;
  if p_fields ? 'closed' and p_fields->>'closed' not in ('true','false') then
    return json_build_object('success', false, 'error', 'bad closed');
  end if;
  if p_fields ? 'scopes' then
    v_scopes := coalesce(string_to_array(nullif(p_fields->>'scopes', ''), ','), '{}');
    if not (v_scopes <@ array['asphalt','civil','storm','sewage','tiles','metal','other']::text[]) then
      return json_build_object('success', false, 'error', 'bad scope');
    end if;
  end if;

  for v_key in select jsonb_object_keys(p_fields) loop
    v_new := p_fields->>v_key;
    v_old := case v_key
      when 'area' then v_k.area           when 'loc_type' then v_k.loc_type
      when 'block_no' then v_k.block_no   when 'street_name' then v_k.street_name
      when 'work_type' then v_k.work_type when 'kashef_no' then v_k.kashef_no::text
      when 'kashef_date' then v_k.kashef_date::text
      when 'wo_no' then v_k.wo_no         when 'wo_date' then coalesce(v_k.wo_date::text,'')
      when 'duration_days' then coalesce(v_k.duration_days::text,'')
      when 'closed' then v_k.closed::text
      when 'daily_penalty' then coalesce(v_k.daily_penalty::text,'')
      when 'location_text' then v_k.location_text
      when 'km_from' then coalesce(v_k.km_from::text,'')
      when 'km_to' then coalesce(v_k.km_to::text,'')
      when 'direction' then v_k.direction
      when 'description' then v_k.description
      when 'scopes' then array_to_string(v_k.scopes, ',')
    end;
    if coalesce(v_old,'') is distinct from coalesce(v_new,'') then
      if v_key = 'scopes' then
        update qm_kashefs set scopes = v_scopes where id = p_kashef_id;
      else
        execute format('update qm_kashefs set %I = $1::%s where id = $2', v_key,
                       case when v_key in ('kashef_no','duration_days') then 'int'
                            when v_key in ('kashef_date','wo_date') then 'date'
                            when v_key = 'closed' then 'boolean'
                            when v_key in ('daily_penalty','km_from','km_to') then 'numeric'
                            else 'text' end)
          using (case when v_key in ('wo_date','duration_days','daily_penalty','km_from','km_to')
                      then nullif(v_new, '') else v_new end),
                p_kashef_id;
      end if;
      perform qm_log('kashef', p_kashef_id, 'update', v_key, '', coalesce(v_old,''), coalesce(v_new,''));
      v_changed := v_changed + 1;
    end if;
  end loop;
  return json_build_object('success', true, 'changed', v_changed);
exception when unique_violation then
  return json_build_object('success', false, 'error', 'kashef_no already exists');
when others then
  return json_build_object('success', false, 'error', SQLERRM);
end $qm$;

-- ── E. qm_kashef_overview (+2 columns, APPENDED) ─────────────────────
create or replace view qm_kashef_overview
with (security_invoker = true) as
select k.id, k.contract_id, c.code as contract_code, c.pct,
       k.kashef_no, k.area, k.loc_type, k.block_no, k.street_name, k.work_type,
       k.status, k.wo_no, k.wo_date, k.kashef_date, k.created_at,
       coalesce(l.n, 0)                       as line_count,
       coalesce(l.subtotal, 0)                as subtotal,
       round(coalesce(l.subtotal, 0) * (1 + c.pct / 100), 3) as total_after_pct,
       coalesce(a.alloc_value, 0)             as allocated_value,
       coalesce(e.exec_value, 0)              as executed_value,
       coalesce(e.tadqiq_count, 0)            as tadqiq_count,
       k.duration_days,
       k.closed,
       c.contract_value,
       k.location_text,
       k.km_from,
       k.km_to,
       k.direction,
       k.description,                                    -- appended (42P16)
       k.scopes                                          -- appended
from qm_kashefs k
join qm_contracts c on c.id = k.contract_id
left join (
  select kl.kashef_id, count(*) as n, sum(kl.qty * bi.rate) as subtotal
  from qm_kashef_lines kl join qm_bop_items bi on bi.id = kl.bop_item_id
  group by kl.kashef_id
) l on l.kashef_id = k.id
left join (
  select kl.kashef_id, sum(al.qty * bi.rate) as alloc_value
  from qm_allocations al
  join qm_kashef_lines kl on kl.id = al.kashef_line_id
  join qm_bop_items bi on bi.id = kl.bop_item_id
  group by kl.kashef_id
) a on a.kashef_id = k.id
left join (
  select t.kashef_id, sum(tl.qty * bi.rate) as exec_value,
         count(distinct t.id) as tadqiq_count
  from qm_tadqiq t
  join qm_tadqiq_lines tl on tl.tadqiq_id = t.id
  join qm_bop_items bi on bi.id = tl.bop_item_id
  group by t.kashef_id
) e on e.kashef_id = k.id;

-- grants for the new qm_kashef_create signature
do $qmsc$
declare f text;
begin
  foreach f in array array[
    'qm_kashef_create(text,int,text,text,text,text,text,jsonb,date,text,text,date,int,text,numeric,numeric,text,text,text[])',
    'qm_kashef_update(bigint,jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $qmsc$;

-- ── F. Expressway site clean-up ──────────────────────────────────────
do $qmsc$
declare
  v_contract bigint;
  v_id bigint;
  v_n int := 0;
begin
  select id into v_contract from qm_contracts where code = 'EXPW';
  if v_contract is null then raise notice '0062: no EXPW contract, data step skipped'; return; end if;

"""

FOOTER = r"""  raise notice '0062: % Expressway work orders re-keyed', v_n;
end $qmsc$;

-- ── G. Hawalli: scopes from the legacy work_type (keyword map) ───────
-- Only rows still carrying no scopes; work_type text is left untouched.
-- Backfill values seen: أعمال مدنية / صحي / أسفلت / متفرقات / اخرى / أمطار / ''.
do $qmsc$
declare
  v_contract bigint;
  r record;
  v_scopes text[];
  v_n int := 0;
begin
  select id into v_contract from qm_contracts where code = 'HAW9';
  if v_contract is null then return; end if;
  for r in select id, work_type from qm_kashefs
            where contract_id = v_contract and coalesce(scopes, '{}') = '{}' loop
    v_scopes := '{}';
    if r.work_type ~ 'سفلت'                 then v_scopes := v_scopes || 'asphalt'; end if;
    if r.work_type ~ 'معدني'                then v_scopes := v_scopes || 'metal';   end if;
    if r.work_type ~ 'مطار'                 then v_scopes := v_scopes || 'storm';   end if;
    if r.work_type ~ 'صحي'                  then v_scopes := v_scopes || 'sewage';  end if;
    if r.work_type ~ 'بلاط|انترلوك|طابوق'   then v_scopes := v_scopes || 'tiles';   end if;
    if r.work_type ~ 'مدني'                 then v_scopes := v_scopes || 'civil';   end if;
    if v_scopes = '{}' and r.work_type <> '' then v_scopes := array['other']; end if;
    if v_scopes <> '{}' then
      update qm_kashefs set scopes = v_scopes where id = r.id;
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', r.id, 'update', 'scopes', '', r.work_type, array_to_string(v_scopes, ','), 'haw9-scopes');
      v_n := v_n + 1;
    end if;
  end loop;
  raise notice '0062: % Hawalli work orders given scopes', v_n;
end $qmsc$;
"""

if __name__ == "__main__":
    main()
