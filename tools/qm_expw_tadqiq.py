# -*- coding: utf-8 -*-
"""Expressway (EXPW) طلبات التدقيق backfill.

Source (Fouad, 2026-08-16): the **unnumbered** `طلبات التدقيق` sheet of each
أمر عمل workbook. Where several exist, the unnumbered one is the master —
verified on WO 19, whose unnumbered sheet holds 69 requests while its
(2)/(3)/(4) copies hold 35/17/19 overlapping subsets.

── sheet shape ─────────────────────────────────────────────────────────
It is a CROSS-TAB, not a line list:

      رقم الطلب | تاريخ الطلب | 17/2 | 61/2 | 4/4 | 17/د/4 | …
                              | <description row>              |
      557       | 30/4/2025   | 2090 |      |     |        |
      561       | 2025-02-05  |      | 1254 |     |        |

rows = one طلب تدقيق, columns = BOP items (band/bab codes, same floating
suffix letter as everywhere else), cells = quantity.

── the vendor ──────────────────────────────────────────────────────────
These sheets carry NO subcontractor. qm_tadqiq.vendor_id is NOT NULL, so
Fouad's call (2026-08-16) is to book every request against the existing
self-performed pseudo-vendor «كوبري — تنفيذ ذاتي», keeping the real
رقم الطلب and تاريخ الطلب on each row. Per-subcontractor attribution can
be layered on later from دفعات مقاولي الباطن WITHOUT re-importing, because
the requests themselves are real records rather than opening balances.

That is why `opening` is FALSE here, unlike the Hawalli backfill: these are
genuine dated requests, so the module's monthly executed trend is real
history rather than one bulk balance.

── allocations ─────────────────────────────────────────────────────────
Seeded as allocated := executed per work-order line (the 'Option B' model
Fouad approved for Hawalli), so the three-tier display (أمر العمل /
موزَّع / منفَّذ) stays coherent with a single vendor.

Outputs to ~\\Desktop\\quantities-backfill\\ and the migration into
supabase/migrations/0051_qm_expw_tadqiq*.sql. Idempotent per request.
"""
import sys, io, os, re, json, glob, datetime, unicodedata, collections

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import openpyxl
import xlrd

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
DESK = os.path.join(os.path.expanduser("~"), "Desktop")
WODIR = os.path.join(DESK, "ExpresswaysQMbackfill", "الدفعة")
OUT_DIR = os.path.join(DESK, "quantities-backfill")
MIG = os.path.join(REPO, "supabase", "migrations", "0051_qm_expw_tadqiq.sql")
WO_JSON = os.path.join(OUT_DIR, "expw-wo-data.json")
BOP_JSON = os.path.join(OUT_DIR, "expw-bop-data.json")

# Budget for the VALUE blocks only — the file also carries the header and the
# do/declare/begin preamble, so keep well clear of the editor's ~1 MB refusal.
MAX_PART = 600_000
VENDOR = "كوبري — تنفيذ ذاتي"
AR_LETTERS = "اأإآبتثجحخدذرزسشصضطظعغفقكلمنهةوىي"
CONTRACT_START = datetime.date(2024, 5, 11)
CONTRACT_END = datetime.date(2027, 5, 10)          # المباشرة + 1095 يوم


def clean(v):
    if v is None:
        return ""
    if isinstance(v, datetime.datetime):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, datetime.date):
        return v.isoformat()
    s = "".join(ch for ch in str(v) if unicodedata.category(ch) != "Cf")
    return re.sub(r"\s+", " ", s.replace("\xa0", " ").replace("ـ", "")).strip()


def esc(s):
    return str(s).replace("'", "''")


def num(v):
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
            out[ws.title] = [list(r) for r in ws.iter_rows(values_only=True)]
        wb.close()
    return out


def parse_code(s):
    """'17/د/4' -> (bab 4, band 17, 'د'). Numbers are band-then-bab (settled
    in qm_expw_bop.py); the letter floats and is normalised for hamza."""
    s = clean(s)
    nums = re.findall(r"\d+", s)
    lets = re.findall("[" + AR_LETTERS + "]+", s)
    if len(nums) < 2:
        return None
    suf = re.sub("[أإآ]", "ا", lets[0])[:1] if lets else ""
    return int(nums[1]), int(nums[0]), suf


def parse_date(v):
    """-> (iso | None, note). Text dates are d/m/Y."""
    if isinstance(v, (datetime.datetime, datetime.date)):
        d = v.date() if isinstance(v, datetime.datetime) else v
        return d.isoformat(), None
    s = clean(v)
    if not s:
        return None, None
    m = re.match(r"^(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{2,5})$", s)
    if m:
        d, mo, ys = int(m.group(1)), int(m.group(2)), m.group(3)
        y = int(ys)
        if y < 100:
            y += 2000
        elif len(ys) == 3:
            y = int(ys[0] + "0" + ys[1:]) if ys[0] == "2" else 2000 + y % 100
        elif len(ys) == 5:
            y = int(ys[0] + ys[2:]) if ys.startswith("2") else int(ys[1:])
        try:
            return datetime.date(y, mo, d).isoformat(), None
        except ValueError:
            return None, "تاريخ غير صالح: %s" % s
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return s[:10], None
    if re.match(r"^\d{5}(\.\d+)?$", s):
        return (datetime.date(1899, 12, 30) +
                datetime.timedelta(days=int(float(s)))).isoformat(), None
    return None, "تاريخ غير مفهوم: %s" % s


def pick_tadqiq_sheet(sheets):
    """The unnumbered طلبات التدقيق sheet. Exact name first; otherwise the
    only تدقيق sheet carrying no '(N)' suffix (WOs 66/67 name theirs
    'طلبات التدقيق امر عمل 66')."""
    for s in sheets:
        if clean(s) == "طلبات التدقيق":
            return s
    # WO 3 names its sheets 'الطلبات' / 'الطلبات (2)' / 'الطلبات حسب الترتيب'
    for s in sheets:
        if clean(s) == "الطلبات":
            return s
    cands = [s for s in sheets
             if ("تدقيق" in clean(s) or "طلبات" in clean(s))
             and not re.search(r"\(\s*\d+\s*\)", clean(s))]
    # descriptive variants (المعالجات / بالترتيب) are secondary views
    plain = [s for s in cands if not any(w in clean(s)
                                         for w in ("المعالجات", "بالترتيب", "الترتيب"))]
    return (plain or cands or [None])[0]


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--wo", type=int, nargs="*", default=None,
                    help="emit SQL for these work orders only (incremental add, e.g. WO 3 "
                         "whose sheet is named 'الطلبات'); dataset + report stay complete; "
                         "the allocated:=executed block is skipped (0054 owns allocations)")
    ap.add_argument("--mig", default=None, help="migration file name to write instead of 0051")
    args = ap.parse_args()
    mig_path = os.path.join(os.path.dirname(MIG), args.mig) if args.mig else MIG
    if args.wo and not args.mig:
        raise SystemExit("--wo needs --mig (never overwrite the applied 0051)")

    wos = {w["wo"]: w for w in json.load(open(WO_JSON, encoding="utf-8"))}
    bop = {}
    for it in json.load(open(BOP_JSON, encoding="utf-8")):
        bop[(it["bab"], it["band"], it["suffix"] or "")] = it

    files = [f for f in sorted(glob.glob(os.path.join(WODIR, "*مر عمل رقم*.xls*")))
             if not os.path.basename(f).startswith("~$")]

    records, no_sheet, unresolved, date_notes, odd_dates = [], [], collections.Counter(), [], []
    for f in files:
        wo = int(re.search(r"رقم\s*(\d+)", os.path.basename(f)).group(1))
        sheets = rows_of(f)
        name = pick_tadqiq_sheet(sheets)
        if not name:
            no_sheet.append(wo)
            continue
        rows = sheets[name]

        hdr_i = None
        for i, row in enumerate(rows[:12]):
            if any(clean(v) == "رقم الطلب" for v in row):
                hdr_i = i
                break
        if hdr_i is None:
            no_sheet.append(wo)
            continue
        hdr = rows[hdr_i]
        col_serial = next(j for j, v in enumerate(hdr) if clean(v) == "رقم الطلب")
        col_date = next((j for j, v in enumerate(hdr) if clean(v) == "تاريخ الطلب"),
                        col_serial + 1)
        codes = {}
        for j, v in enumerate(hdr):
            if j <= col_date:
                continue
            p = parse_code(v)
            if p:
                codes[j] = p

        wo_items = {(l["bab"], l["band"], l["suffix"] or "")
                    for l in wos.get(wo, {}).get("lines", [])}

        for row in rows[hdr_i + 1:]:
            if len(row) <= col_date:
                continue
            sv = row[col_serial]
            if isinstance(sv, float) and sv.is_integer():
                sv = int(sv)          # xlrd (.xls) hands numbers back as floats
            serial = clean(sv)
            if not re.match(r"^\d+$", serial):
                continue
            iso, note = parse_date(row[col_date])
            if note:
                date_notes.append((wo, serial, note))
            lines = []
            for j, key in codes.items():
                if j >= len(row):
                    continue
                try:
                    q = float(row[j])
                except (TypeError, ValueError):
                    continue
                if q <= 0:
                    continue
                if key not in bop:
                    unresolved[key] += 1
                    continue
                lines.append({"bab": key[0], "band": key[1], "suffix": key[2],
                              "qty": q, "rate": bop[key]["rate"],
                              "out_of_kashef": key not in wo_items})
            if not lines:
                continue
            if iso:
                d = datetime.date.fromisoformat(iso)
                if not (CONTRACT_START <= d <= CONTRACT_END):
                    odd_dates.append((wo, serial, iso))
            records.append({"wo": wo, "serial": serial, "date": iso,
                            "sheet": clean(name), "lines": lines})

    # allocations: allocated := executed, per work-order line
    alloc = collections.defaultdict(float)
    for r in records:
        for l in r["lines"]:
            if not l["out_of_kashef"]:
                alloc[(r["wo"], l["bab"], l["band"], l["suffix"])] += l["qty"]

    n_lines = sum(len(r["lines"]) for r in records)
    value = sum(l["qty"] * l["rate"] for r in records for l in r["lines"])
    nodate = [r for r in records if not r["date"]]
    ooc = sum(1 for r in records for l in r["lines"] if l["out_of_kashef"])

    rep = ["# Expressway طلبات التدقيق — import validation\n"]
    rep.append("Source: the **unnumbered** `طلبات التدقيق` sheet of each "
               "أمر عمل workbook.\n")
    rep.append("## Result\n")
    rep.append("- **%d requests** across %d work orders, **%d lines**."
               % (len(records), len({r["wo"] for r in records}), n_lines))
    rep.append("- value **KD %s** pre-pct → **KD %s** after +19%%."
               % ("{:,.3f}".format(value), "{:,.3f}".format(value * 1.19)))
    rep.append("- booked against **%s** (Fouad, 2026-08-16 — the sheets carry "
               "no subcontractor); `opening = false`, so this is real dated "
               "history, not an opening balance." % VENDOR)
    rep.append("- allocations seeded as allocated := executed on %d work-order "
               "lines." % len(alloc))
    rep.append("- lines referencing an item OUTSIDE the work order: %d "
               "(flagged `out_of_kashef`, which is what the app would do on "
               "manual entry)." % ooc)
    if no_sheet:
        rep.append("- work orders with no طلبات التدقيق sheet: %s" % no_sheet)
    if unresolved:
        rep.append("- **unresolved BOP codes: %d** %s"
                   % (len(unresolved), dict(list(unresolved.items())[:8])))
    else:
        rep.append("- every column code resolved against the seeded price book.")

    rep.append("\n## Sheets used\n")
    used = collections.Counter(r["sheet"] for r in records)
    for s, n in used.most_common():
        rep.append("- `%s` — %d requests" % (s, n))

    rep.append("\n## Dates\n")
    rep.append("- requests with no usable date: %d%s"
               % (len(nodate), (" — " + ", ".join("WO %d/%s" % (r["wo"], r["serial"])
                                                  for r in nodate[:12])) if nodate else ""))
    rep.append("- unparseable date cells: %d" % len(date_notes))
    for wo, serial, note in date_notes[:15]:
        rep.append("    - WO %d طلب %s — %s" % (wo, serial, note))
    rep.append("\n### Dates outside the contract window (%d)\n" % len(odd_dates))
    rep.append("Imported as-is per Fouad's instruction; correct them in the app. "
               "The contract runs %s → %s.\n" % (CONTRACT_START, CONTRACT_END))
    if odd_dates:
        rep.append("| WO | رقم الطلب | date read |")
        rep.append("|---|---|---|")
        for wo, serial, iso in sorted(odd_dates):
            rep.append("| %d | %s | %s |" % (wo, serial, iso))

    # ── the key cross-check ──
    # The طلبات التدقيق sheets and the نهائي sheets are independent tables in
    # the same workbook. If both were read correctly, the requests for a work
    # order should sum to that work order's own quantities. They do, which
    # validates the code parsing and the cross-tab reading at once.
    per = collections.defaultdict(lambda: [0, 0, 0.0])
    for r in records:
        p = per[r["wo"]]
        p[0] += 1
        p[1] += len(r["lines"])
        p[2] += sum(l["qty"] * l["rate"] for l in r["lines"])

    rep.append("\n## Cross-check: طلبات التدقيق vs the work order's own lines\n")
    rep.append("Both tables live in the same workbook but are written "
               "independently, so agreement is real corroboration.\n")
    rep.append("| WO | requests | lines | تدقيق pre-pct | أمر العمل pre-pct | ratio |")
    rep.append("|---|---|---|---|---|---|")
    tot_t = tot_w = 0.0
    off = []
    for wo in sorted(set(per) | set(wos)):
        n, ln, v = per.get(wo, [0, 0, 0.0])
        wv = wos.get(wo, {}).get("value_calc", 0.0)
        tot_t += v
        tot_w += wv
        ratio = (v / wv) if wv else None
        if ratio is not None and abs(ratio - 1) > 0.02:
            off.append((wo, ratio, v, wv))
        rep.append("| %d | %d | %d | %s | %s | %s |" % (
            wo, n, ln, "{:,.3f}".format(v), "{:,.3f}".format(wv),
            "%.3f" % ratio if ratio is not None else "—"))
    rep.append("\n- totals: تدقيق **%s** vs أوامر العمل **%s** — ratio **%.4f**"
               % ("{:,.3f}".format(tot_t), "{:,.3f}".format(tot_w),
                  tot_t / tot_w if tot_w else 0))
    rep.append("- **%d of %d work orders agree to within 2%%.**"
               % (len(per) - len(off), len(per)))
    if off:
        rep.append("- the exceptions:")
        for wo, ratio, v, wv in off:
            rep.append("    - WO %d — ratio %.3f (تدقيق %s vs أمر عمل %s)"
                       % (wo, ratio, "{:,.0f}".format(v), "{:,.0f}".format(wv)))
    if no_sheet:
        rep.append("- WO %s has no طلبات التدقيق sheet at all, which accounts for "
                   "most of the residual gap." % no_sheet)

    report = "\n".join(rep) + "\n"
    open(os.path.join(OUT_DIR, "expw-tadqiq-report.md"), "w",
         encoding="utf-8").write(report)
    json.dump(records, open(os.path.join(OUT_DIR, "expw-tadqiq-data.json"), "w",
                            encoding="utf-8"), ensure_ascii=False, indent=1)
    print(report[:3500])

    # ── SQL ──
    head = """-- %s — GENERATED by tools/qm_expw_tadqiq.py, do not hand-edit.%s
-- Expressway طلبات التدقيق: %d requests / %d lines / KD %s pre-pct,
-- from the unnumbered طلبات التدقيق sheet of each أمر عمل workbook.
-- Booked against '%s' — those sheets carry no subcontractor and
-- qm_tadqiq.vendor_id is NOT NULL (Fouad, 2026-08-16). opening = false:
-- these are real dated requests, so the executed trend is real history.
-- Allocations are seeded allocated := executed per work-order line.
-- Paste 0050 first (the work orders these attach to).
-- Idempotent: each request is guarded on (kashef, serial, date, note) — the note
-- carries an occurrence suffix «(n)» when a serial repeats.
""" % (os.path.basename(mig_path).replace(".sql", ""),
       ("\n-- INCREMENTAL: work orders %s only (their sheet is named 'الطلبات'); "
        "no allocation block. Paste after 0051/0054." % args.wo) if args.wo else "",
       len(records), n_lines, "{:,.3f}".format(value), VENDOR)

    PRE = """
do $qmexpwtd$
declare
  v_contract bigint;
  v_vendor bigint;
  v_k bigint;
  v_t bigint;
  v_item bigint;
  v_line bigint;
begin
  select id into v_contract from qm_contracts where code = 'EXPW';
  if v_contract is null then raise exception 'run 0047 first'; end if;
  select id into v_vendor from vendors where name = '%s';
  if v_vendor is null then
    insert into vendors (name, kind, internal, notes)
    values ('%s', 'internal', true,
            'quantities module — COPRI self-performed works (backfill)')
    returning id into v_vendor;
  end if;
  update vendors set qm_subcontractor = true where id = v_vendor and not qm_subcontractor;

""" % (esc(VENDOR), esc(VENDOR))
    POST = "\nend $qmexpwtd$;\n"

    # The same serial can appear twice in a cross-tab (same date, or one
    # undated); a guard on (kashef, vendor, serial[, date]) alone dropped 6
    # such requests in the original 0051 (healed by 0057). Discriminate the
    # 2nd/3rd occurrence with the note text «… (n)» — the same convention
    # qm_expw_exec_split.py uses to find them.
    seen = collections.Counter()
    for r in records:
        gkey = (r["wo"], r["serial"], r["date"]) if r["date"] else (r["wo"], r["serial"])
        r["occ"] = seen[gkey] + (0 if r["date"] else seen[(r["wo"], r["serial"], "any")])
        seen[gkey] += 1
        seen[(r["wo"], r["serial"], "any")] += 1

    blocks = []
    for r in records:
        if args.wo and r["wo"] not in args.wo:
            continue
        note = "استيراد تاريخي — الطرق السريعة" + (" (%d)" % (r["occ"] + 1) if r["occ"] else "")
        date_expr = ("date '%s'" % r["date"] if r["date"]
                     else "coalesce((select wo_date from qm_kashefs where id = v_k), "
                          "(now() at time zone 'Asia/Kuwait')::date)")
        b = ["  -- ── أمر عمل %d — طلب تدقيق %s (%s) ──"
             % (r["wo"], r["serial"], r["date"] or "بلا تاريخ")]
        b.append("  select id into v_k from qm_kashefs where contract_id = v_contract "
                 "and kashef_no = %d;" % r["wo"])
        b.append("  if v_k is not null and not exists (select 1 from qm_tadqiq where "
                 "kashef_id = v_k and serial_no = '%s' and tadqiq_date = %s and note = '%s' "
                 "and not opening) then"
                 % (esc(r["serial"]), date_expr, esc(note)))
        b.append("    insert into qm_tadqiq (kashef_id, vendor_id, tadqiq_date, "
                 "street_no, note, opening, serial_no)")
        b.append("    values (v_k, v_vendor, %s, '', '%s', "
                 "false, '%s') returning id into v_t;"
                 % (date_expr, esc(note), esc(r["serial"])))
        for l in r["lines"]:
            b.append("    select id into v_item from qm_bop_items where contract_id = "
                     "v_contract and bab = %d and band = %d and coalesce(suffix,'') = '%s';"
                     % (l["bab"], l["band"], esc(l["suffix"] or "")))
            b.append("    if v_item is null then raise exception 'bop %d/%d missing'; end if;"
                     % (l["band"], l["bab"]))
            b.append("    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, "
                     "out_of_kashef, over_allocation) values (v_t, v_item, %s, %s, false);"
                     % (num(l["qty"]), "true" if l["out_of_kashef"] else "false"))
        b.append("  end if;\n")
        blocks.append("\n".join(b))

    # allocations last: allocated := executed (skipped on incremental runs —
    # 0054 owns the per-sub allocations by then)
    ab = ["  -- ── التوزيع: الموزَّع = المنفَّذ ──"] if not args.wo else []
    for (wo, bab, band, suf), qty in (sorted(alloc.items()) if not args.wo else []):
        ab.append("  select id into v_k from qm_kashefs where contract_id = v_contract "
                  "and kashef_no = %d;" % wo)
        ab.append("  select id into v_item from qm_bop_items where contract_id = "
                  "v_contract and bab = %d and band = %d and coalesce(suffix,'') = '%s';"
                  % (bab, band, esc(suf or "")))
        ab.append("  select id into v_line from qm_kashef_lines where kashef_id = v_k "
                  "and bop_item_id = v_item;")
        ab.append("  if v_line is not null then")
        ab.append("    insert into qm_allocations (kashef_line_id, vendor_id, qty) "
                  "values (v_line, v_vendor, %s) on conflict (kashef_line_id, vendor_id) "
                  "do update set qty = excluded.qty;" % num(qty))
        ab.append("  end if;")
    if ab:
        blocks.append("\n".join(ab))

    parts, cur, size = [], [], 0
    for blk in blocks:
        if cur and size + len(blk.encode()) > MAX_PART:
            parts.append(cur); cur, size = [], 0
        cur.append(blk); size += len(blk.encode())
    if cur:
        parts.append(cur)

    for old in glob.glob(mig_path.replace(".sql", "*.sql")):
        os.remove(old)
    written = []
    for i, blks in enumerate(parts, 1):
        path = mig_path if len(parts) == 1 else mig_path.replace(".sql", "_part%d.sql" % i)
        body = head + ("-- part %d of %d\n" % (i, len(parts)) if len(parts) > 1 else "") \
            + PRE + "\n".join(blks) + POST
        open(path, "w", encoding="utf-8").write(body)
        written.append((os.path.basename(path), len(body.encode())))
    print("\nWROTE:")
    for n, s in written:
        print("  %-46s %7.1f KB" % (n, s / 1024))


if __name__ == "__main__":
    main()
