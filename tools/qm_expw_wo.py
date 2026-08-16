# -*- coding: utf-8 -*-
"""Expressway (EXPW) work-order backfill — headers + lines.

Source of truth (Fouad, 2026-08-16): one workbook per work order in
~\\Desktop\\ExpresswaysQMbackfill\\الدفعة, sheet **نهائي** (the final
كشف تنفيذي). The طلبات التدقيق sheets are handled by qm_expw_tadqiq.py.

Sheet choice, in order: نهائي → النهائي → كيمز → كشف التكلفة.
Three files have no نهائي (WOs 1, 23, 53) and fall back; the report says
which, so the fallback is never silent.

── layout notes ────────────────────────────────────────────────────────
* The باب | رقم البند line table does NOT sit at a fixed cell: it appears
  at (row 19, col 1) in 54 files, (17,1) in 4, (18,1) in 4 and (17,0) in 1.
  It is located by scanning for the 'باب' + 'رقم البند' cell pair and every
  other column is read as an offset from it — never hard-coded.
* Header metadata is label-driven for the same reason. A label may carry
  its value after the ':' in the SAME cell ('مدة تنفيذ الاعمال : 90 يوم')
  or in a neighbouring cell ('الانتهاء الفعلي :' | '15/12/2024').
* رقم البند carries the sub-item letter ('0017/د'), باب is separate — so
  unlike the price book these files are free of the band/bab bidi problem.
  That is exactly why they were used to settle it in qm_expw_bop.py.
* In-sheet titles are STALE COPIES (WO 19's file contains a sheet titled
  'امر عمل رقم : 6'). Identity comes from the FILE NAME only.

── location model ──────────────────────────────────────────────────────
Highway WOs become loc_type 'chainage' (migration 0049): area = the road,
location_text = the ministry's wording verbatim, km_from/km_to/direction
extracted when present. «محطة 000+7» is stored metres-then-km and RENDERS
as 7+000, so the FIRST number is metres and the second kilometres.
Anything with no station reference and no road falls back to 'misc'.

Outputs to ~\\Desktop\\quantities-backfill\\:
    expw-wo-report.md, expw-wo-data.json
and the migration into supabase/migrations/0050_qm_expw_wo_backfill*.sql.
Idempotent per work order; re-runnable.
"""
import sys, io, os, re, json, glob, datetime, unicodedata, collections

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import openpyxl
import xlrd

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
DESK = os.path.join(os.path.expanduser("~"), "Desktop")
ROOT = os.path.join(DESK, "ExpresswaysQMbackfill")
WODIR = os.path.join(ROOT, "الدفعة")
REGISTER = os.path.join(WODIR, "بيان اوامر العمل.xls")
OUT_DIR = os.path.join(DESK, "quantities-backfill")
MIG = os.path.join(REPO, "supabase", "migrations", "0050_qm_expw_wo_backfill.sql")
BOP_JSON = os.path.join(OUT_DIR, "expw-bop-data.json")
os.makedirs(OUT_DIR, exist_ok=True)

MAX_PART = 900_000
SHEET_PREF = ("نهائي", "النهائي", "كيمز", "كشف التكلفة", "امر العمل", "ورقة1")
AR_LETTERS = "اأإآبتثجحخدذرزسشصضطظعغفقكلمنهةوىي"


# ── helpers ──────────────────────────────────────────────────────────
def clean(v):
    if v is None:
        return ""
    if isinstance(v, datetime.datetime):
        return v.strftime("%Y-%m-%d")
    s = "".join(ch for ch in str(v) if unicodedata.category(ch) != "Cf")
    return re.sub(r"\s+", " ", s.replace("\xa0", " ").replace("ـ", "")).strip()


def cell_parts(v):
    """-> (first number, first Arabic letter) of a باب/بند cell, whatever the
    order. '004'->(4,None) · '04/ب'->(4,'ب') · 'د/4'->(4,'د') · '0017/د'->(17,'د')"""
    s = clean(v)
    s = s[:-2] if s.endswith(".0") else s
    nums = re.findall(r"\d+", s)
    lets = re.findall("[" + AR_LETTERS + "]+", s)
    if not nums:
        return None, None
    return int(nums[0]), (norm_suffix(lets[0]) if lets else None)


def norm_suffix(s):
    s = re.sub("[أإآ]", "ا", clean(s))
    s = s.replace("/", "").replace("\\", "").strip()
    return s[:1] if s else None


def esc(s):
    return str(s).replace("'", "''")


def num(v):
    if v is None:
        return "null"
    if float(v) == int(float(v)):
        return str(int(float(v)))
    return repr(round(float(v), 4))


def rows_of(path):
    out = {}
    if path.lower().endswith(".xls"):
        bk = xlrd.open_workbook(path)
        for sh in bk.sheets():
            out[sh.name] = [[sh.cell_value(r, c) for c in range(sh.ncols)]
                            for r in range(sh.nrows)]
    else:
        wb = openpyxl.load_workbook(path, data_only=True)
        for ws in wb.worksheets:
            out[ws.title] = [list(r) for r in ws.iter_rows(max_col=16, values_only=True)]
        wb.close()
    return out


def parse_date(v):
    """-> 'YYYY-MM-DD' | None. Text dates are d/m/Y. Some source years are
    typo'd three-digit ('10/03/205') — repaired to the 2020s and flagged."""
    if v is None:
        return None, None
    if isinstance(v, datetime.datetime):
        return v.strftime("%Y-%m-%d"), None
    s = clean(v)
    if not s:
        return None, None
    m = re.match(r"^(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{2,5})$", s)
    if m:
        d, mo, ys = int(m.group(1)), int(m.group(2)), m.group(3)
        y, note = int(ys), None
        # The source carries three- and five-digit year typos ('205',
        # '23025'). Both are repaired to the 20xx the digits clearly intend,
        # and every repair is reported — never silent.
        if y < 100:
            y += 2000
        elif len(ys) == 3:                        # '205' -> 2025
            y = int(ys[0] + "0" + ys[1:]) if ys[0] == "2" else 2000 + y % 100
            note = "سنة من ثلاث خانات في المصدر (%s) — قُرئت %d" % (s, y)
        elif len(ys) == 5:                        # '23025' -> 2025
            y = int(ys[0] + ys[2:]) if ys.startswith("2") else int(ys[1:])
            note = "سنة من خمس خانات في المصدر (%s) — قُرئت %d" % (s, y)
        try:
            return datetime.date(y, mo, d).isoformat(), note
        except ValueError:
            return None, "تاريخ غير صالح: %s" % s
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return s[:10], None
    if re.match(r"^\d{5}(\.\d+)?$", s):      # bare Excel serial
        return (datetime.date(1899, 12, 30) +
                datetime.timedelta(days=int(float(s)))).isoformat(), None
    return None, "تاريخ غير مفهوم: %s" % s


# ── location ─────────────────────────────────────────────────────────
STATION_RE = re.compile(r"(?:محطة|كيلو)\s*(\d+)\s*\+\s*(\d+)")
DIRECTION_RE = re.compile(r"(بالاتجاهين|(?:ب?اتجاه)\s+\S+)")
ROAD_RE = re.compile(r"(طريق\s+[^\d,()]*?)(?=\s*(?:من|عند|مع|بالاتجاهين|ب?اتجاه|\(|$))")

WORK_TYPES = (
    ("تخطيط ارضي", "تخطيط أرضي"), ("تخطيط", "تخطيط أرضي"),
    ("نظافة", "نظافة"), ("الاعمال المدنية", "أعمال مدنية"),
    ("اعمال مدنية", "أعمال مدنية"), ("اسفلت", "أسفلت"), ("أسفلت", "أسفلت"),
    ("بلاط", "بلاط"), ("حجر الرصيف", "بلاط"), ("امطار", "أمطار"),
    ("معدنية", "أعمال معدنية"), ("حواجز", "أعمال معدنية"),
    ("جسور", "جسور"), ("طارئة", "متفرقات"), ("متفرقات", "متفرقات"),
)


def station_km(metres, km):
    return round(int(km) + int(metres) / 1000, 3)


def parse_location(text):
    """-> dict(area, loc_type, location_text, km_from, km_to, direction, work_type)"""
    t = clean(text)
    t = re.sub(r"^موقع العمل\s*:\s*", "", t).strip()
    work = ""
    for needle, label in WORK_TYPES:
        if needle in t:
            work = label
            break
    hits = STATION_RE.findall(t)
    road = ROAD_RE.search(t)
    direction = DIRECTION_RE.search(t)
    if hits:
        return {
            "area": clean(road.group(1)) if road else "",
            "loc_type": "chainage", "location_text": t,
            "km_from": station_km(*hits[0]),
            "km_to": station_km(*hits[-1]) if len(hits) > 1 else None,
            "direction": clean(direction.group(1)) if direction else "",
            "work_type": work,
        }
    if road:
        # a named road with no station pair (junctions, entrances) is still a
        # highway location — keep it as chainage so it groups with the rest
        return {
            "area": clean(road.group(1)), "loc_type": "chainage",
            "location_text": t, "km_from": None, "km_to": None,
            "direction": clean(direction.group(1)) if direction else "",
            "work_type": work,
        }
    # No road and no station: a متفرقات work order. Keep the ministry's
    # wording as the area so the register reads as something other than a
    # bare dash ('اعمال طارئة ومتفرقة — متفرقات').
    return {"area": t, "loc_type": "misc", "location_text": "", "km_from": None,
            "km_to": None, "direction": "", "work_type": work or "متفرقات"}


# ── the workbook ─────────────────────────────────────────────────────
def pick_sheet(sheets):
    for cand in SHEET_PREF:
        for s in sheets:
            if clean(s) == cand:
                return s
    return None


def find_table(rows):
    for i, row in enumerate(rows[:60]):
        for c in range(len(row) - 1):
            if clean(row[c]) == "باب" and clean(row[c + 1]).startswith("رقم البند"):
                return i, c
    return None, None


def label_value(rows, upto, *labels):
    """Value for a label: after the ':' in the same cell, else the next
    non-empty cell to its right."""
    for i, row in enumerate(rows[:upto]):
        for c, v in enumerate(row):
            s = clean(v)
            if not s:
                continue
            for lab in labels:
                if s.startswith(lab):
                    rest = s[len(lab):].lstrip(" :：").strip()
                    if rest:
                        return rest, (i, c)
                    for c2 in range(c + 1, len(row)):
                        nxt = clean(row[c2])
                        if nxt:
                            return nxt, (i, c2)
                    return "", (i, c)
    return None, None


def raw_cell(rows, upto, *labels):
    """Like label_value but returns the RAW neighbouring cell (keeps dates
    as datetimes instead of stringifying them)."""
    for i, row in enumerate(rows[:upto]):
        for c, v in enumerate(row):
            s = clean(v)
            if s and any(s.startswith(lab) for lab in labels):
                rest = s.split(":", 1)[-1].strip() if ":" in s else ""
                if rest:
                    return rest
                for c2 in range(c + 1, len(row)):
                    if clean(row[c2]):
                        return row[c2]
    return None


def parse_workbook(path, reg_value=None):
    """Parse EVERY sheet that carries a باب table, then pick one.

    Sheet choice is evidence-led rather than name-led: a workbook can hold a
    stub نهائي next to the real thing (WO 37's نهائي has 4 lines totalling
    KD 4,237 while its نهائي-1 has 5 totalling exactly the register's
    141,042.537). So when the register gives a value for this work order, the
    sheet whose Σ × 1.19 ties to it wins; نهائي breaks ties and is the
    fallback when nothing ties. The chosen sheet and the reason are reported.
    """
    base = os.path.basename(path)
    m = re.search(r"رقم\s*(\d+)", base)
    if not m:
        return None, "لا يمكن استخراج رقم أمر العمل من اسم الملف"
    wo = int(m.group(1))
    sheets = rows_of(path)

    cands = []
    for name, rows in sheets.items():
        if "تدقيق" in clean(name):
            continue
        hi, hc = find_table(rows)
        if hi is not None:
            cands.append((name, rows, hi, hc))
    if not cands:
        return None, "لم يُعثر على جدول باب/رقم البند في أي ورقة (%s)" % ", ".join(
            clean(s) for s in sheets)

    def sheet_total(rows, hi, hc):
        t = 0.0
        for row in rows[hi + 1:]:
            if len(row) <= hc + 7:
                continue
            try:
                q, r = float(row[hc + 5]), float(row[hc + 7])
            except (TypeError, ValueError):
                continue
            if q > 0:
                t += q * r
        return t

    pref = {clean(n): i for i, n in enumerate(SHEET_PREF)}
    scored = []
    for name, rows, hi, hc in cands:
        tot = sheet_total(rows, hi, hc)
        ties = reg_value is not None and abs(tot * 1.19 - reg_value) <= 1.0
        scored.append((not ties, pref.get(clean(name), 99), -tot,
                       name, rows, hi, hc, tot))
    scored.sort()
    _, _, _, name, rows, hi, hc, tot = scored[0]
    pick_reason = ("تطابق مع السجل" if reg_value is not None
                   and abs(tot * 1.19 - reg_value) <= 1.0 else "بالاسم")
    alts = [(clean(n), round(t, 3)) for _, _, _, n, _, _, _, t in scored[1:]]

    notes = []
    loc_raw, _ = label_value(rows, hi, "موقع العمل")
    loc = parse_location(loc_raw or "")

    dur_raw, _ = label_value(rows, hi, "مدة تنفيذ الاعمال", "مدة تنفيذ")
    dm = re.search(r"(\d+)", dur_raw or "")
    duration = int(dm.group(1)) if dm else None

    # The start date lives INSIDE its own cell ('من   06/11/2024'), on the
    # same row as the duration — it is not a label with a separate value
    # cell, so scan for the pattern rather than using label_value.
    start = None
    for row in rows[:hi]:
        for v in row:
            s = clean(v)
            mm = re.match(r"^من\s+(\S.*)$", s)
            if mm:
                cand, n2 = parse_date(mm.group(1))
                if cand:
                    start = cand
                    if n2:
                        notes.append("تاريخ البداية: " + n2)
                    break
        if start:
            break

    finish, note = parse_date(raw_cell(rows, hi, "الانتهاء الفعلي"))
    if note:
        notes.append("الانتهاء الفعلي: " + note)

    penalty = None
    pen_raw, _ = label_value(rows, hi, "الغرامة اليومية", "غرامة التاخير اليومية",
                             "غرامة التاخير")
    if pen_raw:
        pm = re.search(r"([\d,]+(?:\.\d+)?)", pen_raw.replace(",", ""))
        if pm:
            penalty = float(pm.group(1))

    value = None
    val_raw, _ = label_value(rows, hi, "قيمة امر العمل + امر التعديل",
                             "قيمة امر التعديل + امر العمل", "قيمة امر العمل")
    if val_raw:
        vm = re.search(r"([\d,]+(?:\.\d+)?)", val_raw.replace(",", ""))
        if vm:
            value = float(vm.group(1))

    # lines
    off = {"band": hc + 1, "desc": hc + 2, "qty": hc + 5,
           "unit": hc + 6, "rate": hc + 7}
    lines, bad = [], []
    for row in rows[hi + 1:]:
        if len(row) <= off["rate"]:
            continue
        # The sub-item letter floats, exactly as it does in the price book:
        # باب is written '004', '04/ب' AND 'د/4' (letter FIRST), while بند is
        # '0004' or '0017/د'. Anchoring on a leading digit silently drops
        # every letter-first row — WO 43 lost 3 of its 7 lines that way.
        # So: take the first NUMBER and the first ARABIC LETTER of each cell,
        # wherever they sit.
        bab_n, bab_l = cell_parts(row[hc])
        band_n, band_l = cell_parts(row[off["band"]])
        if bab_n is None or band_n is None:
            continue
        suffix = band_l or bab_l
        try:
            qty = float(row[off["qty"]])
            rate = round(float(row[off["rate"]]), 4)
        except (TypeError, ValueError):
            # '#REF!' quantities — a broken formula in the source workbook,
            # not a missing line. Counted so the report can name the file.
            if clean(row[off["qty"]]).startswith("#"):
                bad.append(("كمية معطوبة (%s)" % clean(row[off["qty"]]),
                            clean(row[off["band"]])))
            continue
        if qty <= 0:
            continue
        lines.append({"bab": bab_n, "band": band_n, "suffix": suffix,
                      "desc": clean(row[off["desc"]]), "unit": clean(row[off["unit"]]),
                      "qty": qty, "rate": rate})

    return {
        "wo": wo, "file": base, "sheet": clean(name), "table_at": [hi, hc],
        "sheet_reason": pick_reason, "other_sheets": alts,
        "location_raw": loc_raw or "", **loc,
        "duration_days": duration, "wo_date": start, "actual_finish": finish,
        "daily_penalty": penalty, "doc_value": value,
        "lines": lines, "bad_lines": bad, "notes": notes,
    }, None


# ── the register (cross-check) ───────────────────────────────────────
def read_register():
    """The register workbook holds several vintages of the same table.

    `جميع اوامر العمل` (trailing space, no parenthetical) is the CURRENT one:
    it runs to WO 70, states 'قيمة الامر التغييري رقم 1 : 3,812,500', and its
    التكلفة النهائية total (15,624,574) ties to the ملخص/حسب الباب sheet of
    كميات 9المفصلة. The `(3)` copy is an earlier snapshot in which WOs 39,
    42, 52, 56, 57, 58 and 59 were still جزئي and carried part-values —
    comparing against it makes seven good work orders look wrong.

    Columns are resolved by HEADER TEXT, not position: the vintages differ
    (the `(3)` copy has an extra 'المتبقي' column, shifting everything right).
    """
    if not os.path.exists(REGISTER):
        return {}, None
    bk = xlrd.open_workbook(REGISTER)
    order = ["جميع اوامر العمل", "جميع اوامر العمل  (4)",
             "جميع اوامر العمل  (3)", "النهائيات"]
    names = {clean(n): n for n in bk.sheet_names()}
    sheet = next((names[c] for c in order if c in names), None)
    if sheet is None:
        return {}, None
    sh = bk.sheet_by_name(sheet)

    hdr_row = None
    for r in range(min(20, sh.nrows)):
        if clean(sh.cell_value(r, 0)) == "امر العمل":
            hdr_row = r
            break
    if hdr_row is None:
        return {}, sheet
    cols = {}
    for c in range(sh.ncols):
        h = clean(sh.cell_value(hdr_row, c))
        for key, needle in (("location", "الموقع"), ("start", "بداية امر العمل"),
                            ("end", "نهاية امر العمل"), ("estimate", "التكلفة التقديرية"),
                            ("final_value", "التكلفة النهائية"), ("progress", "نسبة الانجاز"),
                            ("finish", "الانتهاء الفعلي"), ("status", "حالة امر العمل"),
                            ("duration", "مدة تنفيذ")):
            if h.startswith(needle) and key not in cols:
                cols[key] = c

    out = {}
    for r in range(hdr_row + 1, sh.nrows):
        wo = clean(sh.cell_value(r, 0))
        wo = wo[:-2] if wo.endswith(".0") else wo
        if not wo.isdigit():
            continue
        row = [sh.cell_value(r, c) for c in range(sh.ncols)]

        def cell(key):
            c = cols.get(key)
            return row[c] if c is not None and c < len(row) else None

        fv = cell("final_value")
        if not isinstance(fv, float):
            fv = cell("estimate") if isinstance(cell("estimate"), float) else None
        out[int(wo)] = {
            "location": clean(cell("location")),
            "final_value": fv,
            "status": clean(cell("status")),
            "finish": clean(cell("finish")),
            "duration": clean(cell("duration")),
        }
    return out, sheet


def main():
    bop = {}
    if os.path.exists(BOP_JSON):
        for it in json.load(open(BOP_JSON, encoding="utf-8")):
            bop[(it["bab"], it["band"], it["suffix"] or "")] = it

    register, reg_sheet = read_register()
    files = [f for f in sorted(glob.glob(os.path.join(WODIR, "*مر عمل رقم*.xls*")))
             if not os.path.basename(f).startswith("~$")]
    wos, failures = [], []
    for f in files:
        m = re.search(r"رقم\s*(\d+)", os.path.basename(f))
        reg_value = register.get(int(m.group(1)), {}).get("final_value") if m else None
        rec, err = parse_workbook(f, reg_value)
        if err:
            failures.append((os.path.basename(f), err))
        else:
            wos.append(rec)
    wos.sort(key=lambda x: x["wo"])

    # BOP resolution
    missing = collections.Counter()
    rate_bad = []
    for w in wos:
        for ln in w["lines"]:
            k = (ln["bab"], ln["band"], ln["suffix"] or "")
            hit = bop.get(k)
            ln["in_bop"] = hit is not None
            if not hit:
                missing[k] += 1
            elif abs(hit["rate"] - ln["rate"]) >= 0.005:
                rate_bad.append((w["wo"], k, hit["rate"], ln["rate"], ln["desc"][:45]))

    for w in wos:
        w["value_calc"] = round(sum(l["qty"] * l["rate"] for l in w["lines"]), 3)
        w["lines_ok"] = [l for l in w["lines"] if l["in_bop"]]
        w["lines_missing"] = [l for l in w["lines"] if not l["in_bop"]]

    # ── report ──
    rep = ["# Expressway work orders — import validation\n"]
    rep.append("Source: `الدفعة\\امر عمل رقم N.xlsx`, sheet **نهائي** "
               "(fallbacks listed below).\n")
    rep.append("## Result\n")
    rep.append("- **%d work orders** parsed from %d files (%d failed)."
               % (len(wos), len(files), len(failures)))
    rep.append("- **%d lines** total, %d resolve to a seeded BOP item, %d do not."
               % (sum(len(w["lines"]) for w in wos),
                  sum(len(w["lines_ok"]) for w in wos),
                  sum(len(w["lines_missing"]) for w in wos)))
    lt = collections.Counter(w["loc_type"] for w in wos)
    rep.append("- location types: %s" % ", ".join("%s→%d" % kv for kv in lt.items()))
    rep.append("- with a km range: %d · with a single station: %d · no station: %d"
               % (sum(1 for w in wos if w["km_to"] is not None),
                  sum(1 for w in wos if w["km_from"] is not None and w["km_to"] is None),
                  sum(1 for w in wos if w["km_from"] is None)))
    rep.append("- WO numbers: %s" % ", ".join(str(w["wo"]) for w in wos))
    gaps = sorted(set(range(1, max(w["wo"] for w in wos) + 1)) - {w["wo"] for w in wos})
    rep.append("- absent from the folder: %s" % (gaps or "none"))
    if failures:
        rep.append("\n## Files that failed to parse\n")
        for b, e in failures:
            rep.append("- `%s` — %s" % (b, e))

    odd = [w for w in wos if w["sheet"] != "نهائي"]
    rep.append("\n## Sheet chosen other than `نهائي` (%d)\n" % len(odd))
    for w in odd:
        rep.append("- WO %d — used `%s` (%d lines, %s); other sheets: %s"
                   % (w["wo"], w["sheet"], len(w["lines"]), w["sheet_reason"],
                      w["other_sheets"] or "—"))
    tied = [w for w in wos if w["sheet_reason"] == "تطابق مع السجل"]
    rep.append("\n%d work orders had their sheet chosen because it ties to the "
               "register; the rest by name preference." % len(tied))

    nodate = [w["wo"] for w in wos if not w["wo_date"]]
    nodur = [w["wo"] for w in wos if not w["duration_days"]]
    noline = [w["wo"] for w in wos if not w["lines"]]
    rep.append("\n## Header gaps\n")
    rep.append("- no start date: %s" % (nodate or "none"))
    rep.append("- no duration: %s" % (nodur or "none"))
    rep.append("- **no lines at all: %s**" % (noline or "none"))
    notes = [(w["wo"], n) for w in wos for n in w["notes"]]
    if notes:
        rep.append("- date repairs: %s" % "; ".join("WO %d %s" % x for x in notes))

    rep.append("\n## Lines referencing BOP items that were not seeded (%d distinct)\n"
               % len(missing))
    if missing:
        rep.append("| bab | band | suffix | times |")
        rep.append("|---|---|---|---|")
        for (bab, band, suf), n in sorted(missing.items(), key=lambda x: -x[1]):
            rep.append("| %d | %d | %s | %d |" % (bab, band, suf or "—", n))
        rep.append("\nThese lines are **skipped** by the migration — a work order "
                   "line must reference a price. See the BOP report's open item.")

    rep.append("\n## Line rates that disagree with the price book (%d)\n" % len(rate_bad))
    for wo, k, seed, doc, desc in rate_bad[:40]:
        rep.append("- WO %d — bab %d band %d%s: BOP %s vs sheet %s — %s"
                   % (wo, k[0], k[1], k[2] or "", seed, doc, desc))

    # The register states values AFTER نسبة العقد (+19%); Σ qty × rate is
    # before it. Compare like with like or every row looks 19% short.
    PCT = 1.19
    rep.append("\n## Value cross-check vs the register\n")
    rep.append("Register sheet used: `%s` (%d work orders listed).\n"
               % (reg_sheet, len(register)))
    rep.append("Σ lines × rate is **pre-pct**; the register is **post-pct**, "
               "so the comparison applies +19%%.\n")
    rep.append("| WO | Σ lines × rate | × 1.19 | register final | Δ | |")
    rep.append("|---|---|---|---|---|---|")
    exact = big = noreg = 0
    for w in wos:
        reg = register.get(w["wo"], {}).get("final_value")
        after = round(w["value_calc"] * PCT, 3)
        w["value_after_pct"] = after
        if not reg:
            noreg += 1
            d = mark = None
        else:
            d = round(after - reg, 3)
            if abs(d) <= 1.0:
                exact += 1; mark = "✓"
            elif abs(d) <= 0.01 * abs(reg):
                mark = "≈"
            else:
                big += 1; mark = "**≠**"
        rep.append("| %d | %s | %s | %s | %s | %s |" % (
            w["wo"], "{:,.3f}".format(w["value_calc"]), "{:,.3f}".format(after),
            "{:,.3f}".format(reg) if reg else "—",
            "{:,.3f}".format(d) if d is not None else "—", mark or ""))
    rep.append("\n**%d work orders match the register to within 1 KD** (✓), "
               "%d within 1%% (≈), %d differ by more than 1%% (≠), "
               "%d absent from the register." % (exact, len(wos) - exact - big - noreg,
                                                 big, noreg))

    report = "\n".join(rep) + "\n"
    open(os.path.join(OUT_DIR, "expw-wo-report.md"), "w", encoding="utf-8").write(report)
    json.dump(wos, open(os.path.join(OUT_DIR, "expw-wo-data.json"), "w",
                        encoding="utf-8"), ensure_ascii=False, indent=1, default=str)
    print(report[:4000])

    # ── SQL ──
    head = """-- 0050_qm_expw_wo_backfill — GENERATED by tools/qm_expw_wo.py, do not hand-edit.
-- Expressway work orders: headers + lines, from the نهائي sheet of each
-- أمر عمل workbook (Fouad, 2026-08-16: those sheets are the source of truth).
-- %d work orders / %d lines. Highway locations use loc_type 'chainage'
-- (migration 0049) — paste 0047, 0048 and 0049 first.
-- Lines whose bab/band is absent from the seeded price book are SKIPPED and
-- listed in ~/Desktop/quantities-backfill/expw-wo-report.md.
-- Idempotent: each work order is guarded on (contract, kashef_no).
""" % (len(wos), sum(len(w["lines_ok"]) for w in wos))

    PRE = """
do $qmexpwwo$
declare
  v_contract bigint;
  v_k bigint;
  v_item bigint;
begin
  select id into v_contract from qm_contracts where code = 'EXPW';
  if v_contract is null then raise exception 'run 0046/0047 first'; end if;

"""
    POST = "\nend $qmexpwwo$;\n"

    blocks = []
    for w in wos:
        b = []
        title = w["location_text"] or w["location_raw"] or ("أمر عمل %d" % w["wo"])
        b.append("  -- ── أمر عمل %d — %s ──" % (w["wo"], title[:70]))
        b.append("  if not exists (select 1 from qm_kashefs where contract_id = v_contract "
                 "and kashef_no = %d) then" % w["wo"])
        b.append("    insert into qm_kashefs (contract_id, kashef_no, area, loc_type, "
                 "block_no, street_name, work_type, status, wo_no, wo_date, kashef_date, "
                 "duration_days, daily_penalty, location_text, km_from, km_to, direction)")
        b.append("    values (v_contract, %d, '%s', '%s', '', '', '%s', 'wo', '%d', %s, %s, "
                 "%s, %s, '%s', %s, %s, '%s') returning id into v_k;" % (
                     w["wo"], esc(w["area"]), w["loc_type"], esc(w["work_type"]), w["wo"],
                     "date '%s'" % w["wo_date"] if w["wo_date"] else "null",
                     "date '%s'" % w["wo_date"] if w["wo_date"] else
                     "(now() at time zone 'Asia/Kuwait')::date",
                     w["duration_days"] if w["duration_days"] else "null",
                     num(w["daily_penalty"]), esc(w["location_text"]),
                     num(w["km_from"]), num(w["km_to"]), esc(w["direction"])))
        b.append("    insert into qm_changelog (entity, entity_id, action, field, line_ref, "
                 "old_value, new_value, actor_email)")
        b.append("    values ('kashef', v_k, 'create', '', '', '', "
                 "'استيراد تاريخي — %s', 'expw-backfill');" % esc(title[:90]))
        for ln in w["lines_ok"]:
            b.append("    select id into v_item from qm_bop_items where contract_id = "
                     "v_contract and bab = %d and band = %d and coalesce(suffix,'') = '%s';"
                     % (ln["bab"], ln["band"], esc(ln["suffix"] or "")))
            b.append("    if v_item is null then raise exception 'bop %d/%d missing'; end if;"
                     % (ln["band"], ln["bab"]))
            b.append("    insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values "
                     "(v_k, v_item, %s) on conflict (kashef_id, bop_item_id) do nothing;"
                     % num(ln["qty"]))
        b.append("  end if;\n")
        blocks.append("\n".join(b))

    parts, cur, size = [], [], 0
    for blk in blocks:
        if cur and size + len(blk.encode()) > MAX_PART:
            parts.append(cur); cur, size = [], 0
        cur.append(blk); size += len(blk.encode())
    if cur:
        parts.append(cur)

    for old in glob.glob(MIG.replace(".sql", "*.sql")):
        os.remove(old)
    written = []
    for i, blks in enumerate(parts, 1):
        path = MIG if len(parts) == 1 else MIG.replace(".sql", "_part%d.sql" % i)
        body = head + ("-- part %d of %d\n" % (i, len(parts)) if len(parts) > 1 else "") \
            + PRE + "\n".join(blks) + POST
        open(path, "w", encoding="utf-8").write(body)
        written.append((os.path.basename(path), len(body.encode())))
    print("\nWROTE:")
    for n, s in written:
        print("  %-46s %7.1f KB" % (n, s / 1024))


if __name__ == "__main__":
    main()
