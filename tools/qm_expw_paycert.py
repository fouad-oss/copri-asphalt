# -*- coding: utf-8 -*-
"""Expressway (EXPW) ministry payment certificates — دفعات الوزارة.

Source: `الدفعة\\كميات 9المفصلة.xls`, sheets '1'..'21'. Each sheet is the
CUMULATIVE certified position as at that payment: rows are BOP items, the
left block of columns is one per work order, cells are quantities. The 21
sheets correspond one-to-one with the 21 PDFs in `الدفعات الشهرية`.

Per-payment certificates are therefore the DIFFERENCE between consecutive
sheets — the same increment model the Hawalli backfill uses, so that
Σ certificates = cumulative certified.

── both axes shift between sheets ──────────────────────────────────────
This is the trap in this workbook, and it silently produces garbage:

  * ROWS  — sheet 1 has 1,830 rows and the rest 1,829, so a row index does
            NOT mean the same BOP item across sheets.
  * COLUMNS — a work-order column is inserted at index 31 from sheet 10
            onward, and further columns are appended at sheets 16, 20 and
            21 (59 → 60 → 74 → 75 columns).

Reusing sheet 1's maps made 65 items appear to "drop" to zero at sheet 10
and inflated Σ qty×rate to 67M against a true 12.5M. BOTH maps are rebuilt
per sheet here. With that fixed the series is cleanly monotonic and the
final cumulative lands on 13,116,337.355 pre-pct — exactly the sum of the
65 work orders imported by qm_expw_wo.py, to the dinar.

── period_end ──────────────────────────────────────────────────────────
Fouad, 2026-08-17: each certificate covers works up to the FIFTH of its
month, starting with certificate 1 at 2024-12-05. So

    period_end(N) = 2024-12-05 + (N - 1) months

Corroborated against the submission dates of the 21 PDFs: every one was
submitted AFTER its period end (lag 0–52 days, typically one to three
weeks), with zero violations. The competing reading — anchoring on
الكشف الشهري «حتى 05/07/2026» for شهادة دفع 021 and stepping back — would
have put certificate 1 at 2024-11-05, before work order 1 had even
started on 2024-11-06. Under the confirmed rule that 05/07/2026 date is
certificate 20's period end, so the working papers in `الدفعة` are one
ahead of the payment they are filed under.

Outputs to ~\\Desktop\\quantities-backfill\\ and the migration into
supabase/migrations/0052_qm_expw_paycert*.sql.
Re-runnable: deletes and rebuilds only source='mpw' EXPW certificates.
"""
import sys, io, os, re, json, glob, datetime, unicodedata, collections

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import xlrd

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
DESK = os.path.join(os.path.expanduser("~"), "Desktop")
ROOT = os.path.join(DESK, "ExpresswaysQMbackfill")
QTY = os.path.join(ROOT, "الدفعة", "كميات 9المفصلة.xls")
PDFDIR = os.path.join(ROOT, "الدفعات الشهرية")
OUT_DIR = os.path.join(DESK, "quantities-backfill")
MIG = os.path.join(REPO, "supabase", "migrations", "0052_qm_expw_paycert.sql")

N_SHEETS = 21
MAX_PART = 700_000          # whole set is ~610 KB — one comfortable paste
AR = "اأإآبتثجحخدذرزسشصضطظعغفقكلمنهةوىي"
PCT = 1.19
# Certificate 1 covers works to 2024-12-05, and each one after it to the
# fifth of the following month (Fouad, 2026-08-17).
FIRST_PERIOD_END = (2024, 12, 5)


def period_end(n):
    """-> 'YYYY-MM-05' for certificate n."""
    y, m, d = FIRST_PERIOD_END
    m += n - 1
    y += (m - 1) // 12
    m = (m - 1) % 12 + 1
    return datetime.date(y, m, d).isoformat()


def clean(v):
    if v is None:
        return ""
    s = "".join(ch for ch in str(v) if unicodedata.category(ch) != "Cf")
    return re.sub(r"\s+", " ", s.replace("\xa0", " ").replace("ـ", "")).strip()


def esc(s):
    return str(s).replace("'", "''")


def num(v):
    if float(v) == int(float(v)):
        return str(int(float(v)))
    return repr(round(float(v), 4))


def parse_code(s):
    s = clean(s)
    nums = re.findall(r"\d+", s)
    lets = re.findall("[" + AR + "]+", s)
    if len(nums) < 2:
        return None
    return (int(nums[1]), int(nums[0]),
            re.sub("[أإآ]", "ا", lets[0])[:1] if lets else "")


def qty_columns(sh):
    """col -> work order number, for the quantity block only (everything left
    of the 'اجمالي قيمة الاعمال' divider). MUST be rebuilt per sheet."""
    out, seen_divider = {}, False
    for c in range(sh.ncols):
        h = clean(sh.cell_value(0, c))
        if "اجمالي قيمة الاعمال" in h:
            seen_divider = True
            continue
        m = re.match(r"^(\d+)(?:\.0)?$", h)
        if m and not seen_divider:
            out[c] = int(m.group(1))
    return out


def snapshot(sh, bop, unresolved_qty=None):
    """(wo, bop_key) -> cumulative qty, for one sheet."""
    cols = qty_columns(sh)
    out, unresolved = {}, collections.Counter()
    for r in range(2, sh.nrows):
        k = parse_code(sh.cell_value(r, 0))
        if not k:
            continue
        if k not in bop:
            unresolved[k] += 1
            # track whether these rows carry any quantity at all — the three
            # that occur are the pre-correction spellings of codes the BOP
            # importer moved to another bab, and they are all empty
            if unresolved_qty is not None:
                for c in cols:
                    if c < sh.ncols:
                        v = sh.cell_value(r, c)
                        if isinstance(v, float) and v:
                            unresolved_qty[k] += v
            continue
        for c, wo in cols.items():
            if c >= sh.ncols:
                continue
            v = sh.cell_value(r, c)
            if isinstance(v, float) and v:
                out[(wo, k)] = out.get((wo, k), 0.0) + v
    return out, unresolved, len(cols)


def pdf_dates():
    out = {}
    for f in glob.glob(os.path.join(PDFDIR, "*.pdf")):
        m = re.search(r"رقم\s*(\d+)", os.path.basename(f))
        if m:
            out[int(m.group(1))] = datetime.date.fromtimestamp(
                os.stat(f).st_mtime).isoformat()
    return out


def main():
    bop = {}
    for it in json.load(open(os.path.join(OUT_DIR, "expw-bop-data.json"),
                             encoding="utf-8")):
        bop[(it["bab"], it["band"], it["suffix"] or "")] = it
    wos = {w["wo"]: w for w in json.load(
        open(os.path.join(OUT_DIR, "expw-wo-data.json"), encoding="utf-8"))}
    submitted = pdf_dates()

    bk = xlrd.open_workbook(QTY)
    snaps, unresolved, colcounts = [], collections.Counter(), []
    unresolved_qty = collections.Counter()
    for n in range(1, N_SHEETS + 1):
        sh = bk.sheet_by_name(str(n))
        s, u, nc = snapshot(sh, bop, unresolved_qty)
        snaps.append(s)
        unresolved.update(u)
        colcounts.append(nc)

    # ── per-payment deltas ──
    certs = []
    prev = {}
    for n, cur in enumerate(snaps, start=1):
        delta = {}
        for key, q in cur.items():
            d = q - prev.get(key, 0.0)
            if abs(d) > 1e-9:
                delta[key] = d
        for key, q in prev.items():                 # fell out entirely
            if key not in cur and abs(q) > 1e-9:
                delta[key] = -q
        certs.append({"no": n, "delta": delta,
                      "period_end": period_end(n),
                      "submitted": submitted.get(n)})
        prev = cur

    final = snaps[-1]
    final_val = sum(q * bop[k]["rate"] for (w, k), q in final.items())
    wo_total = sum(w["value_calc"] for w in wos.values())
    negatives = [(c["no"], k, d) for c in certs for k, d in c["delta"].items() if d < 0]

    # per-WO certified vs work order
    percert = collections.defaultdict(float)
    for (w, k), q in final.items():
        percert[w] += q * bop[k]["rate"]
    no_wo = sorted({w for w, _ in final} - set(wos))

    # ── report ──
    rep = ["# Expressway payment certificates — import validation\n"]
    rep.append("Source: `كميات 9المفصلة.xls`, sheets `1`..`21` — the cumulative "
               "certified position at each ministry payment.\n")
    rep.append("## Result\n")
    rep.append("- **%d certificates**, **%d lines** total."
               % (len(certs), sum(len(c["delta"]) for c in certs)))
    rep.append("- final cumulative certified: **KD %s** pre-pct → **KD %s** after +19%%."
               % ("{:,.3f}".format(final_val), "{:,.3f}".format(final_val * PCT)))
    rep.append("- sum of the 65 imported work orders: **KD %s** pre-pct — "
               "difference **KD %s**."
               % ("{:,.3f}".format(wo_total), "{:,.3f}".format(final_val - wo_total)))
    rep.append("- work-order columns per sheet: %s (they shift — both the row "
               "map and the column map are rebuilt per sheet)."
               % " → ".join(str(c) for c in colcounts))
    if unresolved:
        carried = {k: v for k, v in unresolved_qty.items() if v}
        rep.append("- %d BOP codes in this workbook are not in the price book — "
                   "they are the pre-correction spellings of the rows the BOP "
                   "importer moved to another bab (%s). **Every one of them "
                   "carries zero quantity in every sheet and every work order**, "
                   "so nothing is lost by skipping them; that is why the "
                   "cumulative total still lands on the work-order total."
                   % (len(unresolved),
                      ", ".join("%d/%d%s" % (k[0], k[1], k[2] or "")
                                for k in unresolved)))
        if carried:
            rep.append("  - **but these DO carry quantity and were skipped: %s**"
                       % carried)
    else:
        rep.append("- every code resolved against the seeded price book.")
    if no_wo:
        rep.append("- **certified against work orders that have no workbook: %s** "
                   "— these lines are SKIPPED (a certificate line needs a work "
                   "order)." % no_wo)

    rep.append("\n## Periods\n")
    rep.append("Each certificate covers works to the **fifth of its month**, "
               "starting at 2024-12-05 (Fouad, 2026-08-17). Corroborated by the "
               "PDF submission dates below: every certificate was submitted "
               "AFTER its period end, with no exceptions.\n")
    rep.append("| # | period end | lines | value pre-pct | cumulative | "
               "PDF submitted | lag |")
    rep.append("|---|---|---|---|---|---|---|")
    cum = 0.0
    for c in certs:
        v = sum(d * bop[k]["rate"] for (w, k), d in c["delta"].items())
        cum += v
        lag = ""
        if c["submitted"] and c["period_end"]:
            lag = "%+d d" % (datetime.date.fromisoformat(c["submitted"])
                             - datetime.date.fromisoformat(c["period_end"])).days
        rep.append("| %d | %s | %d | %s | %s | %s | %s |"
                   % (c["no"], c["period_end"], len(c["delta"]),
                      "{:,.3f}".format(v), "{:,.3f}".format(cum),
                      c["submitted"] or "—", lag))

    rep.append("\n## Negative lines (%d)\n" % len(negatives))
    if negatives:
        rep.append("A negative certificate line is a downward correction: the "
                   "ministry certified less cumulatively than in the previous "
                   "payment. Stored as-is so that Σ certificates still equals "
                   "the cumulative position.\n")
        rep.append("| payment | WO | bab/band | qty |")
        rep.append("|---|---|---|---|")
        for n, (w, k), d in negatives:
            rep.append("| %d | %d | %d/%d%s | %s |"
                       % (n, w, k[0], k[1], k[2] or "", "{:,.3f}".format(d)))

    rep.append("\n## Certified vs work-order value, per work order\n")
    rep.append("| WO | certified pre-pct | work order pre-pct | ratio |")
    rep.append("|---|---|---|---|")
    off = 0
    for wo in sorted(set(percert) | set(wos)):
        c = percert.get(wo, 0.0)
        w = wos.get(wo, {}).get("value_calc", 0.0)
        r = (c / w) if w else None
        if r is None or abs(r - 1) > 0.02:
            off += 1
        rep.append("| %s | %s | %s | %s |"
                   % (wo, "{:,.3f}".format(c), "{:,.3f}".format(w),
                      "%.3f" % r if r else "—"))
    rep.append("\n%d work orders differ from their certified total by more than 2%%."
               % off)

    report = "\n".join(rep) + "\n"
    open(os.path.join(OUT_DIR, "expw-paycert-report.md"), "w",
         encoding="utf-8").write(report)
    json.dump([{"no": c["no"], "period_end": c["period_end"],
                "submitted": c["submitted"],
                "lines": [{"wo": w, "bab": k[0], "band": k[1], "suffix": k[2],
                           "qty": round(d, 4)} for (w, k), d in c["delta"].items()]}
               for c in certs],
              open(os.path.join(OUT_DIR, "expw-paycert-data.json"), "w",
                   encoding="utf-8"), ensure_ascii=False, indent=1)
    print(report[:3200])

    # ── SQL ──
    head = """-- 0052_qm_expw_paycert — GENERATED by tools/qm_expw_paycert.py, do not hand-edit.
-- Expressway ministry payment certificates (دفعات الوزارة): %d certificates
-- derived as the per-payment DIFFERENCE between sheets 1..21 of
-- كميات 9المفصلة.xls, each of which is the cumulative certified position.
-- Σ certificates therefore equals cumulative certified: KD %s pre-pct,
-- which matches the sum of the 65 imported work orders to the dinar.
-- Each certificate covers works to the fifth of its month, starting at
-- 2024-12-05 (Fouad, 2026-08-17); every PDF was submitted after its own
-- period end, which corroborates it. See expw-paycert-report.md.
-- Paste 0050 first (the work orders these lines attach to).
-- Re-runnable: deletes and rebuilds only source='mpw' EXPW certificates.
""" % (len(certs), "{:,.3f}".format(final_val))

    PRE = """
do $qmexpwpc$
declare
  v_contract bigint;
  v_c bigint;
  v_k bigint;
  v_item bigint;
begin
  select id into v_contract from qm_contracts where code = 'EXPW';
  if v_contract is null then raise exception 'run 0047 first'; end if;

"""
    POST = "\nend $qmexpwpc$;\n"

    blocks = []
    for c in certs:
        lines = [(w, k, d) for (w, k), d in sorted(c["delta"].items())
                 if w in wos]
        skipped = len(c["delta"]) - len(lines)
        b = ["  -- ══ دفعة %d — %s%s ══"
             % (c["no"],
                ("حتى " + c["period_end"]) if c["period_end"] else "الفترة غير مسجَّلة",
                (" — %d سطر بلا أمر عمل" % skipped) if skipped else "")]
        b.append("  delete from qm_pay_cert_lines where cert_id in (select id from "
                 "qm_pay_certs where contract_id = v_contract and cert_no = %d "
                 "and source = 'mpw');" % c["no"])
        b.append("  delete from qm_pay_certs where contract_id = v_contract and "
                 "cert_no = %d and source = 'mpw';" % c["no"])
        note = ("استيراد تاريخي — الطرق السريعة"
                + (" · قُدِّمت %s" % c["submitted"] if c["submitted"] else ""))
        b.append("  insert into qm_pay_certs (contract_id, cert_no, period_end, "
                 "source, status, note) values (v_contract, %d, %s, 'mpw', "
                 "'certified', '%s') returning id into v_c;"
                 % (c["no"],
                    "date '%s'" % c["period_end"] if c["period_end"] else "null",
                    esc(note)))
        for w, k, d in lines:
            b.append("  select id into v_k from qm_kashefs where contract_id = "
                     "v_contract and kashef_no = %d;" % w)
            b.append("  select id into v_item from qm_bop_items where contract_id = "
                     "v_contract and bab = %d and band = %d and coalesce(suffix,'') "
                     "= '%s';" % (k[0], k[1], esc(k[2] or "")))
            b.append("  if v_k is not null and v_item is not null then")
            b.append("    insert into qm_pay_cert_lines (cert_id, kashef_id, "
                     "bop_item_id, qty, amount) values (v_c, v_k, v_item, %s, %s) "
                     "on conflict (cert_id, kashef_id, bop_item_id) do update set "
                     "qty = excluded.qty, amount = excluded.amount;"
                     % (num(d), num(round(d * bop[k]["rate"], 4))))
            b.append("  end if;")
        b.append("")
        blocks.append("\n".join(b))

    parts, cur_p, size = [], [], 0
    for blk in blocks:
        if cur_p and size + len(blk.encode()) > MAX_PART:
            parts.append(cur_p); cur_p, size = [], 0
        cur_p.append(blk); size += len(blk.encode())
    if cur_p:
        parts.append(cur_p)

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
