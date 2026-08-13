# -*- coding: utf-8 -*-
"""MPW monthly payment certificates -> qm_pay_certs backfill.

Generalization of Desktop/asphaltpayments/extract_asphalt.py (the proven
Azure Document Intelligence pipeline) from section /4 only to the FULL BOP:
reads every دفعة شهرية PDF, extracts each work order's BOQ rows, resolves
each باب/بند code against the qm BOP (bab-set + rate-based disambiguation,
hamza-normalized suffixes), and emits:

  Desktop/quantities-backfill/paycert-azure/<pdf>.json   raw Azure cache
  Desktop/quantities-backfill/paycerts-data.json         structured certs
  Desktop/quantities-backfill/paycerts-report.md         per-cert coverage
  supabase/migrations/0041_qm_paycert_backfill.sql       idempotent import

Re-runs are free: Azure results are cached per PDF; the SQL is guarded per
(contract, cert_no).

RUN:  python tools/qm_paycert_extract.py  [pdf_dir]
      default pdf_dir = C:/Users/fszog/Desktop/asphaltpayments/PDFs
"""
import glob
import json
import os
import re
import sys

sys.path.insert(0, r"C:\Users\fszog\Desktop\asphaltpayments")
from extract_asphalt import (  # noqa: E402  (reuse the proven machinery)
    analyze_pdf, build_page_headers, header_for_page, table_page,
    extract_rows_from_table, parse_num, ARABIC_INDIC,
)

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

PDF_DIR = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\fszog\Desktop\asphaltpayments\PDFs"
OUT_DIR = r"C:\Users\fszog\Desktop\quantities-backfill"
CACHE_DIR = os.path.join(OUT_DIR, "paycert-azure")
BOP_PATH = os.path.join(OUT_DIR, "wo-ocr", "_bop_ref.json")
SQL_OUT = r"C:\Users\fszog\Desktop\Copri webapp\supabase\migrations\0041_qm_paycert_backfill.sql"
ENDPOINT = os.environ.get("AZURE_DI_ENDPOINT")
KEY = os.environ.get("AZURE_DI_KEY")

BABS = {1, 2, 3, 4, 5, 6, 7, 12, 14, 17, 22}
bop = json.load(open(BOP_PATH, encoding="utf-8"))

os.makedirs(CACHE_DIR, exist_ok=True)


def norm_suffix(s):
    return (s or "").replace("أ", "ا").replace("إ", "ا").replace("آ", "ا").strip()


def bop_key(bab, band, sfx):
    return f"{bab}/{band}{norm_suffix(sfx)}"


def resolve_code(raw, implied_rate):
    """All BOP-valid readings of a printed باب/بند cell; rate-scored.

    Returns (key, bop_row, note) or (None, None, reason)."""
    if raw is None:
        return None, None, "empty"
    txt = str(raw).translate(ARABIC_INDIC)
    nums = [int(n) for n in re.findall(r"\d+", txt)]
    letters = re.findall(r"[ء-ي]", txt)
    sfxs = [norm_suffix(l) for l in letters] + [""]
    cands = []

    def add(bab, band, sfx):
        k = bop_key(bab, band, sfx)
        if bab in BABS and k in bop and (bab, band, sfx) not in [c[:3] for c in cands]:
            cands.append((bab, band, sfx, k))

    pairs = []
    if len(nums) == 2:
        pairs = [(nums[0], nums[1]), (nums[1], nums[0])]
    elif len(nums) == 3 and 1 in nums:
        # a stray '1' is usually an alef suffix misread; try the other two with ا,
        # but also allow bab=1 readings of each adjacent pair
        rest = list(nums)
        rest.remove(1)
        for a, b in ((rest[0], rest[1]), (rest[1], rest[0])):
            for sfx in ["ا"] + sfxs:
                add(a, b, sfx)
        pairs = [(nums[0], nums[1]), (nums[1], nums[0]), (nums[1], nums[2]), (nums[2], nums[1])]
    elif len(nums) == 1:
        return None, None, f"one number only: {raw!r}"
    else:
        return None, None, f"unparseable: {raw!r}"
    for a, b in pairs:
        for sfx in sfxs:
            add(a, b, sfx)
    if not cands:
        return None, None, f"no BOP match: {raw!r}"
    if len(cands) > 1 and implied_rate is not None:
        exact = [c for c in cands if abs(bop[c[3]]["rate"] - implied_rate) < 0.011]
        if len(exact) >= 1:
            cands = exact
    if len(cands) > 1 and implied_rate is not None:
        return None, None, f"ambiguous {raw!r} (rate {implied_rate:.3f})"
    k = cands[0][3]
    return k, bop[k], ""


def cert_meta(fname):
    """Cert number + period-end date from the PDF filename."""
    t = fname.translate(ARABIC_INDIC)
    no = None
    m = re.search(r"رقم\s*\(?\s*(\d+)", t)
    if m:
        no = int(m.group(1))
    else:
        m = re.search(r"الشهرية\s*\(?\s*(\d+)", t)
        if m:
            no = int(m.group(1))
    dm = re.search(r"(\d{1,2})\s*[-/ ]\s*(\d{1,2})\s*[-/ ]\s*(20\d\d)", t)
    period = None
    if dm:
        d, mo, y = int(dm.group(1)), int(dm.group(2)), int(dm.group(3))
        period = f"{y:04d}-{mo:02d}-{d:02d}"
    return no, period


def main():
    pdfs = sorted(glob.glob(os.path.join(PDF_DIR, "*.pdf")))
    if not pdfs:
        raise SystemExit(f"no PDFs in {PDF_DIR}")
    certs = {}
    report = []
    for path in pdfs:
        name = os.path.basename(path)
        no, period = cert_meta(name)
        if no is None:
            report.append(f"- ⚠️ SKIPPED (no cert number in name): {name}")
            continue
        cache = os.path.join(CACHE_DIR, name + ".json")
        if os.path.exists(cache):
            result = json.load(open(cache, encoding="utf-8"))
            print(f"cert {no}: cached ({name})")
        else:
            print(f"cert {no}: analyzing {name} …")
            result = analyze_pdf(ENDPOINT, KEY, path)
            json.dump(result, open(cache, "w", encoding="utf-8"), ensure_ascii=False)
        page_headers = build_page_headers(result)
        lines = []      # resolved rows
        issues = []     # unmatched/ambiguous rows
        for table in (result.get("tables") or []):
            wo, _site = header_for_page(page_headers, table_page(table))
            for row in extract_rows_from_table(table):
                qty = parse_num(row["qty"])
                printed = parse_num(row["total"])
                if not qty:
                    continue                      # zero/blank rows don't import
                implied = (printed / qty) if (printed and qty) else None
                key, item, why = resolve_code(row["code"], implied)
                if key is None:
                    issues.append({"wo": wo, "code": row["code"], "qty": qty,
                                   "printed": printed, "desc": row["desc"][:60], "why": why})
                    continue
                amount = round(qty * item["rate"], 3)
                if printed and amount and max(amount, printed) > 10 * min(amount, printed):
                    issues.append({"wo": wo, "code": row["code"], "qty": qty,
                                   "printed": printed, "desc": row["desc"][:60],
                                   "why": f"qty sanity: computed {amount} vs printed {printed}"})
                    continue
                lines.append({"wo": int(wo) if wo else None, "key": key,
                              "bab": item["bab"], "band": item["band"], "suffix": item["suffix"],
                              "qty": qty, "amount": amount, "printed": printed})
        certs[no] = {"pdf": name, "period_end": period, "lines": lines, "issues": issues}
        total = sum(l["amount"] for l in lines)
        wos = sorted({l["wo"] for l in lines if l["wo"]})
        print(f"  -> {len(lines)} lines, {len(issues)} issues, KD {total:,.3f}, WOs {wos}")

    # ── report ──────────────────────────────────────────────────────────
    report.insert(0, "# MPW payment certificates — extraction report\n")
    report.append("| cert | period end | WOs | lines | issues | total KD (pre-pct) |")
    report.append("|---|---|---|---|---|---|")
    for no in sorted(certs):
        c = certs[no]
        total = sum(l["amount"] for l in c["lines"])
        wos = sorted({l["wo"] for l in c["lines"] if l["wo"]})
        report.append(f"| {no} | {c['period_end']} | {len(wos)} | {len(c['lines'])} "
                      f"| {len(c['issues'])} | {total:,.3f} |")
    for no in sorted(certs):
        for i in certs[no]["issues"]:
            report.append(f"- cert {no} WO {i['wo']}: {i['why']} — qty {i['qty']}, "
                          f"printed {i['printed']}, desc: {i['desc']}")
    open(os.path.join(OUT_DIR, "paycerts-report.md"), "w", encoding="utf-8").write("\n".join(report) + "\n")
    json.dump(certs, open(os.path.join(OUT_DIR, "paycerts-data.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    # ── SQL ─────────────────────────────────────────────────────────────
    def q(s):
        return "'" + str(s).replace("'", "''") + "'"

    L = []
    L.append("-- 0041_qm_paycert_backfill.sql — GENERATED by tools/qm_paycert_extract.py.")
    L.append("-- Historical MPW monthly payment certificates (source PDFs via Azure DI).")
    L.append("-- Idempotent: each certificate is skipped when (contract, cert_no) exists.")
    L.append("do $qmpc$")
    L.append("declare")
    L.append("  v_contract bigint;")
    L.append("  v_c bigint;")
    L.append("  v_k bigint;")
    L.append("  v_item bigint;")
    L.append("begin")
    L.append("  select id into v_contract from qm_contracts where code = 'HAW9';")
    L.append("  if v_contract is null then raise exception 'run 0033 first'; end if;")
    for no in sorted(certs):
        c = certs[no]
        L.append(f"\n  -- ── دفعة {no} — {c['pdf']} ──")
        L.append(f"  if not exists (select 1 from qm_pay_certs where contract_id = v_contract and cert_no = {no}) then")
        pe = q(c["period_end"]) if c["period_end"] else "null"
        L.append(f"    insert into qm_pay_certs (contract_id, cert_no, period_end, source, status, note)")
        L.append(f"    values (v_contract, {no}, {pe}, 'mpw', 'certified', {q('استيراد تاريخي — ' + c['pdf'])}) returning id into v_c;")
        L.append("    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)")
        L.append(f"    values ('paycert', v_c, 'create', '', '', '', {q('استيراد دفعة الوزارة رقم ' + str(no))}, 'backfill');")
        for ln in c["lines"]:
            sfx = ln["suffix"] or ""
            L.append(f"    select id into v_item from qm_bop_items where contract_id = v_contract and bab = {ln['bab']} and band = {ln['band']} and translate(coalesce(suffix,''), 'أإآ', 'ااا') = {q(sfx)};")
            L.append(f"    if v_item is null then raise exception 'bop {ln['key']} missing'; end if;")
            if ln["wo"]:
                L.append(f"    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = {ln['wo']};")
            else:
                L.append("    v_k := null;")
            amount = ln["printed"] if ln["printed"] is not None else ln["amount"]
            L.append(f"    insert into qm_pay_cert_lines (cert_id, kashef_id, bop_item_id, qty, amount)")
            L.append(f"    values (v_c, v_k, v_item, {ln['qty']}, {amount})")
            L.append("    on conflict (cert_id, kashef_id, bop_item_id) do update set qty = qm_pay_cert_lines.qty + excluded.qty, amount = qm_pay_cert_lines.amount + excluded.amount;")
        L.append("  end if;")
    L.append("end $qmpc$;")
    open(SQL_OUT, "w", encoding="utf-8").write("\n".join(L) + "\n")
    size = os.path.getsize(SQL_OUT)
    print(f"\nSQL: {SQL_OUT} ({size:,} bytes)")
    if size > 900_000:
        print("WARNING: near the SQL editor 1MB cap — split before pasting")


if __name__ == "__main__":
    main()
