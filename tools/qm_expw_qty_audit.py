# -*- coding: utf-8 -*-
"""Audit the live EXPW quantities module against كميات 9المفصلة.xls (final source of truth).

Source of truth = sheet '21' (cumulative certified position at payment 21, 05/07/2026 per ملخص),
plus sheets 1..20 for the per-certificate check, plus the register for WO header values.
Module = live Supabase snapshot (expw-live-snapshot.json, pulled by tools/qm_expw_pull_live.py).
Writes Desktop/quantities-backfill/expw-qty-audit.md + .json. Run with PYTHONIOENCODING=utf-8.
"""
import sys, os, io, re, json, collections, unicodedata
sys.path.insert(0, r"C:\Users\fszog\Desktop\Copri webapp\tools")
import xlrd
import qm_expw_paycert as P

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(os.path.expanduser("~"), "Desktop", "quantities-backfill")
REPORT = os.path.join(OUT_DIR, "expw-qty-audit.md")
DIFFS = os.path.join(OUT_DIR, "expw-qty-audit.json")
PCT = 1.19
TOL_QTY = 0.005      # quantities compared to 3 dp
TOL_KD = 1.0         # KD after pct

live = json.load(open(os.path.join(OUT_DIR, "expw-live-snapshot.json"), encoding="utf-8"))
bop_by_id = {b["id"]: b for b in live["bop"]}
key_of = {b["id"]: (b["bab"], b["band"], (b["suffix"] or "")) for b in live["bop"]}
bop_by_key = {key_of[i]: b for i, b in bop_by_id.items()}
rate = {k: float(b["rate"]) for k, b in bop_by_key.items()}
k_by_id = {k["id"]: k for k in live["kashefs"]}
def _wo_label(k):
    """source column label: kashef_no, except non-numeric wo_no such as '26a' (stored under kashef_no 261)."""
    w = (k.get("wo_no") or "").strip()
    return w if (w and not re.match(r"^\d+$", w)) else k["kashef_no"]


wo_of_kid = {k["id"]: _wo_label(k) for k in live["kashefs"]}
vendor_name = {v["id"]: v["name"] for v in live["vendors"]}


def fmt(x):
    return "{:,.3f}".format(x)


def fq(x):
    s = "{:,.3f}".format(x)
    return s.rstrip("0").rstrip(".") if "." in s else s


def ks(k):
    return "%d/%d%s" % (k[0], k[1], k[2] or "")


# ── Source: sheet 21 (and all sheets for the cert check) ─────────────────────
bk = xlrd.open_workbook(P.QTY)


def wo_columns(sh):
    """col -> WO label (int or '26a') for the quantity block."""
    out, seen = {}, False
    for c in range(sh.ncols):
        h = P.clean(sh.cell_value(0, c))
        if "اجمالي قيمة الاعمال" in h:
            seen = True
            continue
        if seen:
            continue
        m = re.match(r"^(\d+)(?:\.0)?$", h)
        if m:
            out[c] = int(m.group(1))
        elif re.match(r"^\d+[a-zA-Z]$", h):
            out[c] = h            # e.g. '26a'
    return out


def snap(sh):
    cols = wo_columns(sh)
    out, unresolved, sheet_rate, desc = {}, collections.Counter(), {}, {}
    for r in range(2, sh.nrows):
        k = P.parse_code(sh.cell_value(r, 0))
        if not k:
            continue
        rt = sh.cell_value(r, 3)
        if isinstance(rt, float):
            sheet_rate[k] = rt
            desc[k] = P.clean(sh.cell_value(r, 1))
        for c, wo in cols.items():
            v = sh.cell_value(r, c)
            if isinstance(v, float) and v:
                if k not in rate:
                    unresolved[k] += v
                    continue
                out[(wo, k)] = out.get((wo, k), 0.0) + v
    return out, unresolved, sheet_rate, desc


sheets = {}
for n in range(1, 22):
    sheets[n] = snap(bk.sheet_by_name(str(n)))
final, unresolved, sheet_rate, sheet_desc = sheets[21]
sh21 = bk.sheet_by_name("21")
hdr_total = sh21.cell_value(1, 82)
hdr_wo_value = {}
for c in range(83, sh21.ncols):
    h = P.clean(sh21.cell_value(0, c))
    m = re.match(r"^(\d+)(?:\.0)?$", h)
    lab = int(m.group(1)) if m else (h if re.match(r"^\d+[a-zA-Z]$", h) else None)
    if lab is not None:
        hdr_wo_value[lab] = sh21.cell_value(1, c)

# register (current vintage, trailing space)
rb = xlrd.open_workbook(os.path.join(P.ROOT, "الدفعة", "بيان اوامر العمل.xls"))
rs = rb.sheet_by_name("جميع اوامر العمل ")
hdr = {P.clean(rs.cell_value(6, c)): c for c in range(rs.ncols)}
c_wo = hdr["امر العمل"]
c_final = [c for h, c in hdr.items() if h.startswith("التكلفة النهائية")][0]
c_est = [c for h, c in hdr.items() if h.startswith("التكلفة التقديرية")][0]
c_state = [c for h, c in hdr.items() if h.startswith("حالة")][0]
c_loc = hdr["الموقع"]
c_dur = [c for h, c in hdr.items() if h.startswith("مدة")][0]
c_start = hdr["بداية امر العمل"]
c_end = hdr["نهاية امر العمل"]
register = {}
for r in range(7, rs.nrows):
    h = P.clean(rs.cell_value(r, c_wo))
    m = re.match(r"^(\d+)(?:\.0)?$", h)
    lab = int(m.group(1)) if m else (h if re.match(r"^\d+[a-zA-Z]$", h) else None)
    if lab is None:
        continue
    fv = rs.cell_value(r, c_final)
    ev = rs.cell_value(r, c_est)
    register[lab] = {"final": float(fv) if isinstance(fv, float) else None,
                     "est": float(ev) if isinstance(ev, float) else None,
                     "state": P.clean(rs.cell_value(r, c_state)),
                     "loc": P.clean(rs.cell_value(r, c_loc)),
                     "dur": P.clean(rs.cell_value(r, c_dur)),
                     "start": P.clean(rs.cell_value(r, c_start)),
                     "end": P.clean(rs.cell_value(r, c_end))}

# ── Module aggregates ─────────────────────────────────────────────────────────
wo_line = {}          # (wo,key) -> kashef qty
for l in live["kashef_lines"]:
    wo_line[(wo_of_kid[l["kashef_id"]], key_of[l["bop_item_id"]])] = float(l["qty"])
tad_by_id = {t["id"]: t for t in live["tadqiq"]}
executed = collections.defaultdict(float)   # (wo,key)
exec_by_vendor = collections.defaultdict(float)  # (wo,key,vendor)
for l in live["tadqiq_lines"]:
    t = tad_by_id[l["tadqiq_id"]]
    key = (wo_of_kid[t["kashef_id"]], key_of[l["bop_item_id"]])
    executed[key] += float(l["qty"])
    exec_by_vendor[(key[0], key[1], t["vendor_id"])] += float(l["qty"])
cert_by_id = {c["id"]: c for c in live["certs"]}
certified = collections.defaultdict(float)
cert_cum = collections.defaultdict(lambda: collections.defaultdict(float))  # cert_no -> (wo,key) -> cum qty
cert_lines_by_no = collections.defaultdict(float)
cert_lines_by_no_amount = collections.defaultdict(float)
lines_per_cert = collections.Counter()
for l in live["cert_lines"]:
    c = cert_by_id[l["cert_id"]]
    key = (wo_of_kid[l["kashef_id"]], key_of[l["bop_item_id"]])
    q = float(l["qty"])
    certified[key] += q
    lines_per_cert[c["cert_no"]] += 1
    cert_lines_by_no[c["cert_no"]] += q * rate[key[1]]
    if l["amount"] is not None:
        cert_lines_by_no_amount[c["cert_no"]] += float(l["amount"])
    for n in range(c["cert_no"], 22):
        cert_cum[n][key] += q
alloc = collections.defaultdict(float)
kl_key = {l["id"]: (wo_of_kid[l["kashef_id"]], key_of[l["bop_item_id"]]) for l in live["kashef_lines"]}
for a in live["allocations"]:
    alloc[kl_key[a["kashef_line_id"]]] += float(a["qty"])


def val(d):
    return sum(q * rate[k] for (w, k), q in d.items())


def per_wo(d):
    out = collections.defaultdict(float)
    for (w, k), q in d.items():
        out[w] += q * rate[k]
    return out


src_val = val(final)
src_wo = per_wo(final)
mod_wo_val = per_wo(wo_line)
mod_exec = per_wo(executed)
mod_cert = per_wo(certified)
mod_alloc = per_wo(alloc)
wos_src = set(w for w, _ in final)
wos_mod = set(wo_of_kid.values())
missing_wos = sorted((w for w in wos_src - wos_mod), key=str)
extra_wos = sorted(wos_mod - wos_src)

# ── Rates ─────────────────────────────────────────────────────────────────────
rate_diffs = [(k, sheet_rate[k], rate[k]) for k in sheet_rate if k in rate and abs(sheet_rate[k] - rate[k]) > 1e-6]
codes_not_in_bop = [k for k in sheet_rate if k not in rate]

# ── Line-level diffs ──────────────────────────────────────────────────────────
keys = set(final) | set(wo_line) | set(executed) | set(certified)
rows = []
for (w, k) in keys:
    s = final.get((w, k), 0.0)
    a = wo_line.get((w, k))
    e = executed.get((w, k), 0.0)
    c = certified.get((w, k), 0.0)
    r = rate[k]
    rows.append({"wo": w, "key": k, "src": s, "wo_qty": a, "exec": e, "cert": c, "rate": r,
                 "d_wo": (None if a is None else a - s), "d_exec": e - s, "d_cert": c - s})
rows.sort(key=lambda x: (str(x["wo"]).zfill(3), x["key"]))

wo_mismatch = [x for x in rows if x["wo"] in wos_mod and (x["wo_qty"] is None or abs(x["d_wo"]) > TOL_QTY)]
exec_mismatch = [x for x in rows if x["wo"] in wos_mod and abs(x["d_exec"]) > TOL_QTY]
cert_mismatch = [x for x in rows if x["wo"] in wos_mod and abs(x["d_cert"]) > TOL_QTY]
missing_lines = [x for x in rows if x["wo"] in missing_wos]

# ── Per-certificate check (Σ certs 1..N vs sheet N) ──────────────────────────
cert_rows = []
for n in range(1, 22):
    src_n, _, _, _ = sheets[n]
    src_n = {k: q for k, q in src_n.items() if k[0] in wos_mod}   # certs only exist for imported WOs
    cum = cert_cum[n]
    dv = sum((cum.get(k, 0) - src_n.get(k, 0)) * rate[k[1]] for k in set(cum) | set(src_n))
    nd = sum(1 for k in set(cum) | set(src_n) if abs(cum.get(k, 0) - src_n.get(k, 0)) > TOL_QTY)
    c = next((c for c in live["certs"] if c["cert_no"] == n), None)
    cert_rows.append({"no": n, "period_end": c["period_end"] if c else None,
                      "status": c["status"] if c else None, "source": c["source"] if c else None,
                      "lines": lines_per_cert[n],
                      "inc_val": cert_lines_by_no[n], "amount_col": cert_lines_by_no_amount[n],
                      "src_cum": val(src_n), "mod_cum": val({k: q for k, q in cum.items()}),
                      "d_val": dv, "n_lines_off": nd})


# ── Allocations (sub page: allocated vs executed) ─────────────────────────────
KUB = next((v["id"] for v in live["vendors"] if v["name"] == "كوبري — تنفيذ ذاتي"), None)
kl_by_id = {l["id"]: l for l in live["kashef_lines"]}
per_line = collections.defaultdict(lambda: collections.defaultdict(float))
for a in live["allocations"]:
    per_line[a["kashef_line_id"]][a["vendor_id"]] += float(a["qty"])
stale_rows, alloc_ok, alloc_partial, alloc_under = [], 0, [], []
for lid, l in kl_by_id.items():
    q = float(l["qty"]); k = key_of[l["bop_item_id"]]; r = rate[k]
    vs = per_line.get(lid, {}); subs = sum(x for v, x in vs.items() if v != KUB); kub = vs.get(KUB, 0.0)
    tot = subs + kub
    if tot > q + 1e-6:
        if subs >= q - 1e-6:
            stale_rows.append({"wo": wo_of_kid[l["kashef_id"]], "key": k, "qty": q, "subs": subs, "kub": kub, "kd": kub * r * PCT})
        else:
            alloc_partial.append((wo_of_kid[l["kashef_id"]], k, (tot - q) * r * PCT))
    elif tot < q - 1e-6:
        alloc_under.append((wo_of_kid[l["kashef_id"]], k, (q - tot) * r * PCT))
    else:
        alloc_ok += 1
alloc_by_vendor = collections.defaultdict(float); exec_by_vendor_v = collections.defaultdict(float)
for a in live["allocations"]:
    l = kl_by_id[a["kashef_line_id"]]; alloc_by_vendor[a["vendor_id"]] += float(a["qty"]) * rate[key_of[l["bop_item_id"]]]
for (w, k, v), q in exec_by_vendor.items():
    exec_by_vendor_v[v] += q * rate[k]
stale_kd = sum(x["kd"] for x in stale_rows)

# ── Report ────────────────────────────────────────────────────────────────────
R = []
R.append("# Expressway quantities module — audit against كميات 9المفصلة.xls\n")
R.append("Source of truth: `Desktop\\ExpresswaysQMbackfill\\كميات 9المفصلة.xls`, sheet **21** "
         "(cumulative certified quantities per work order × BOP item as at payment 21 — "
         "«قيمة ونسب الاعمال المنفذة … حتى 05/07/2026» per sheet ملخص), sheets 1..20 for the "
         "certificate-by-certificate check, and register `بيان اوامر العمل.xls` (sheet "
         "`جميع اوامر العمل `) for work-order header values.\n")
R.append("Module side: live Supabase snapshot pulled 2026-08-19 (service role, read-only): "
         "contract EXPW id %d — %d work orders, %d WO lines, %d طلبات تدقيق / %d lines, "
         "%d certificates / %d lines, %d allocations.\n"
         % (live["contract"]["id"], len(live["kashefs"]), len(live["kashef_lines"]),
            len(live["tadqiq"]), len(live["tadqiq_lines"]), len(live["certs"]),
            len(live["cert_lines"]), len(live["allocations"])))
R.append("All KD figures below are **after the 19 % contract percentage** unless marked pre-pct. "
         "Quantities are never multiplied.\n")

# 1. headline
R.append("## 1. Headline\n")
R.append("| measure | source (sheet 21) | module | difference |")
R.append("|---|---|---|---|")
R.append("| total certified value, header row of sheet 21 | **%s** | — | — |" % fmt(hdr_total))
R.append("| Σ qty × BOP rate × 1.19, all WO columns incl. `26a` | %s | — | %s vs header |"
         % (fmt(src_val * PCT), fmt(src_val * PCT - hdr_total)))
R.append("| Σ work-order lines (kashef qty × rate) | %s | %s | %s |"
         % (fmt(src_val * PCT), fmt(sum(mod_wo_val.values()) * PCT), fmt(sum(mod_wo_val.values()) * PCT - src_val * PCT)))
R.append("| Σ executed (طلبات التدقيق) | %s | %s | %s |"
         % (fmt(src_val * PCT), fmt(sum(mod_exec.values()) * PCT), fmt(sum(mod_exec.values()) * PCT - src_val * PCT)))
R.append("| Σ certified (21 certificates) | %s | %s | %s |"
         % (fmt(src_val * PCT), fmt(sum(mod_cert.values()) * PCT), fmt(sum(mod_cert.values()) * PCT - src_val * PCT)))
R.append("| Σ allocated (all vendors incl. كوبري) | — | %s | **%s over the WO total — see §10** |" % (fmt(sum(mod_alloc.values()) * PCT), fmt(sum(mod_alloc.values()) * PCT - sum(mod_wo_val.values()) * PCT)))
R.append("| Σ register «التكلفة النهائية» (all rows) | %s | — | — |"
         % fmt(sum(v["final"] or 0 for v in register.values())))
R.append("")
if missing_wos:
    R.append("**Work orders present in the source but absent from the module: %s.** "
             "Their value: %s (pre-pct %s). See §2."
             % (", ".join(str(w) for w in missing_wos),
                fmt(sum(src_wo[w] for w in missing_wos) * PCT), fmt(sum(src_wo[w] for w in missing_wos))))
if extra_wos:
    R.append("Work orders in the module with no column in the source: %s." % extra_wos)
if unresolved:
    R.append("Codes in the source carrying quantity that do not exist in the seeded BOP: %s."
             % ", ".join("%s (%s)" % (ks(k), fq(v)) for k, v in unresolved.items()))
else:
    R.append("Every source code carrying quantity resolves against the seeded BOP (the 3 "
             "pre-correction spellings carry zero everywhere).")
R.append("")

# 2. missing WO detail
R.append("## 2. Missing work order(s)\n")
for w in missing_wos:
    reg = register.get(w, {})
    R.append("### WO %s — %s\n" % (w, reg.get("loc", "")))
    R.append("- register: %s → %s, %s days, status **%s**, التكلفة النهائية **%s**; sheet 21 header value %s; Σ qty×rate×1.19 = %s."
             % (reg.get("start"), reg.get("end"), reg.get("dur"), reg.get("state"),
                fmt(reg.get("final") or 0), fmt(hdr_wo_value.get(w, 0)), fmt(src_wo[w] * PCT)))
    R.append("- workbook `الدفعة\\%s.xlsx` exists; `tools/qm_expw_wo.py` only globs «امر عمل رقم N» and "
             "`qm_expw_paycert.py` only accepts purely numeric column headers — both skipped it. "
             "`qm_kashefs.kashef_no` is an **int**, so it needs a numeric kashef_no (e.g. 261) with "
             "`wo_no = '26a'` — Fouad's call." % w)
    R.append("")
    R.append("| باب/بند | description | unit | rate | qty (sheet 21) | value pre-pct |")
    R.append("|---|---|---|---|---|---|")
    for x in sorted(missing_lines, key=lambda x: x["key"]):
        if x["wo"] != w:
            continue
        b = bop_by_key[x["key"]]
        R.append("| %s | %s | %s | %s | %s | %s |"
                 % (ks(x["key"]), b["description"], b["unit"], fq(x["rate"]), fq(x["src"]), fmt(x["src"] * x["rate"])))
    R.append("")
    # first appearance
    first = None
    for n in range(1, 22):
        if any(k[0] == w for k in sheets[n][0]):
            first = n
            break
    R.append("First appears in sheet **%s**; cumulative by sheet: %s.\n"
             % (first, ", ".join("%d→%s" % (n, fmt(sum(q * rate[k[1]] for k, q in sheets[n][0].items() if k[0] == w)))
                                 for n in range(first or 1, 22))))

# 3. per WO
R.append("## 3. Per work order — value after 19 %\n")
R.append("Source value = Σ sheet-21 qty × BOP rate × 1.19 (equals the sheet-21 header row and the "
         "register «التكلفة النهائية» on every WO unless noted). Module WO value = Σ WO lines × rate × 1.19.\n")
R.append("| WO | source | register نهائية | module WO lines | Δ WO | executed | Δ exec | certified | Δ cert | allocated | status |")
R.append("|---|---|---|---|---|---|---|---|---|---|---|")
bad_wo = []
for w in sorted(wos_src | wos_mod, key=lambda x: (isinstance(x, str), x)):
    s = src_wo.get(w, 0.0) * PCT
    rg = register.get(w, {}).get("final")
    a = mod_wo_val.get(w, 0.0) * PCT if w in wos_mod else None
    e = mod_exec.get(w, 0.0) * PCT if w in wos_mod else None
    c = mod_cert.get(w, 0.0) * PCT if w in wos_mod else None
    al = mod_alloc.get(w, 0.0) * PCT if w in wos_mod else None
    k = next((k for k in live["kashefs"] if _wo_label(k) == w), None)
    st = ("مغلق" if k["closed"] else "مفتوح") if k else "**غير موجود**"
    flag = ""
    if a is None or abs(a - s) > TOL_KD or abs(e - s) > TOL_KD or abs(c - s) > TOL_KD:
        flag = " ⚠"
        bad_wo.append(w)
    if rg is not None and abs(rg - s) > TOL_KD:
        flag += " (register≠source)"
    R.append("| %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s%s |"
             % (w, fmt(s), fmt(rg) if rg is not None else "—",
                fmt(a) if a is not None else "—", fmt(a - s) if a is not None else "—",
                fmt(e) if e is not None else "—", fmt(e - s) if e is not None else "—",
                fmt(c) if c is not None else "—", fmt(c - s) if c is not None else "—",
                fmt(al) if al is not None else "—", st, flag))
R.append("")
R.append("%d of %d work orders have at least one tier (WO lines / executed / certified) off by more "
         "than KD %s from the source." % (len(bad_wo), len(wos_src | wos_mod), fq(TOL_KD)))
R.append("")

# 4. certificates
R.append("## 4. Certificate by certificate — Σ certificates 1..N vs sheet N\n")
R.append("Sheet N is the cumulative certified position at payment N; the module stores monthly "
         "increments, so the running sum of certificates 1..N must equal sheet N (restricted to "
         "the WOs that exist in the module).\n")
R.append("| cert | period end | status | lines | increment value | Σ cum module | sheet N cum | Δ | lines off |")
R.append("|---|---|---|---|---|---|---|---|---|")
for c in cert_rows:
    R.append("| %d | %s | %s | %d | %s | %s | %s | %s | %d |"
             % (c["no"], c["period_end"] or "—", c["status"] or "—", c["lines"], fmt(c["inc_val"] * PCT),
                fmt(c["mod_cum"] * PCT), fmt(c["src_cum"] * PCT), fmt(c["d_val"] * PCT), c["n_lines_off"]))
amt_off = [c for c in cert_rows if abs(c["amount_col"] - c["inc_val"]) > 0.01]
R.append("")
R.append("Stored `amount` column vs qty×rate: %s."
         % ("consistent on all 21 certificates" if not amt_off else
            "off on certs %s" % ", ".join("%d (Δ %s)" % (c["no"], fmt(c["amount_col"] - c["inc_val"])) for c in amt_off)))
R.append("")

# 5. rates
R.append("## 5. BOP rates — sheet 21 column «سعر الوحدة» vs seeded qm_bop_items\n")
R.append("- %d source rows carry a rate; %d disagree with the seeded BOP." % (len(sheet_rate), len(rate_diffs)))
if rate_diffs:
    R.append("\n| باب/بند | sheet rate | BOP rate |")
    R.append("|---|---|---|")
    for k, a, b in rate_diffs:
        R.append("| %s | %s | %s |" % (ks(k), fq(a), fq(b)))
R.append("- %d source codes are not in the seeded BOP: %s (all carry zero quantity)."
         % (len(codes_not_in_bop), ", ".join(ks(k) for k in codes_not_in_bop)))
R.append("")

# 6. line-level
def line_table(title, lst, col, note):
    R.append("## %s\n" % title)
    R.append(note + "\n")
    if not lst:
        R.append("_None — every line ties to the source within %s._\n" % fq(TOL_QTY))
        return
    R.append("| WO | باب/بند | description | unit | source qty | module %s | Δ qty | Δ KD (after pct) |" % col)
    R.append("|---|---|---|---|---|---|---|---|")
    tot = 0.0
    for x in lst:
        b = bop_by_key[x["key"]]
        mv = x["wo_qty"] if col == "WO qty" else (x["exec"] if col == "executed" else x["cert"])
        d = (mv or 0) - x["src"]
        tot += d * x["rate"] * PCT
        R.append("| %s | %s | %s | %s | %s | %s | %s | %s |"
                 % (x["wo"], ks(x["key"]), b["description"][:60], b["unit"], fq(x["src"]),
                    fq(mv) if mv is not None else "**missing**", fq(d), fmt(d * x["rate"] * PCT)))
    R.append("")
    R.append("%d lines, net Δ **KD %s**.\n" % (len(lst), fmt(tot)))


line_table("6. Work-order lines (kashef qty) vs source", wo_mismatch, "WO qty",
           "The WO lines were imported from the per-WO workbooks (0050). A difference here means the "
           "certified final quantity differs from the work-order's own نهائي sheet.")
line_table("7. Executed (Σ طلبات التدقيق) vs source", exec_mismatch, "executed",
           "Executed was imported from the per-WO طلبات التدقيق cross-tabs (0051/0058) and re-split by "
           "vendor (0057/0059, totals unchanged). A difference here is what the QA must correct in the app.")
line_table("8. Certified (Σ 21 certificates) vs source", cert_mismatch, "certified",
           "Certificates were derived from this same workbook (0052), so this should be empty except for "
           "lines the import could not attach.")

# 9. exec by vendor for mismatched lines (context)
R.append("## 9. Notes for the fix\n")
R.append("- **WO 26a** (KD %s): needs a new work order + its %d lines, its certificate lines (from sheets, "
         "first appearance above), executed (its workbook's طلبات التدقيق sheet if any), and a subcontractor "
         "allocation (تخطيط أرضي — check `دفعات مقاولي الباطن`). Requires a numeric `kashef_no`."
         % (fmt(sum(src_wo[w] for w in missing_wos) * PCT), len(missing_lines)))
R.append("- Executed mismatches (§7), attributed by re-opening the source workbooks:")
R.append("  - **WO 48 — 4/19ب vs 4/19ج (1,236.72 م², KD 4,900.75, net 0)**: the unnumbered `طلبات التدقيق` sheet "
         "(the one 0051 imported) heads the column `19/4/ب`; its `(2)` copy, the WO's نهائي sheet and the ministry "
         "all say `ج`. Source-side slip → move the executed qty from ب to ج.")
R.append("  - **WO 51 — 4/37د vs 4/37ب (90 م²; module +1,083.85 on د, −2,116.30 on ب, net −1,032.44)**: both "
         "تدقيق sheets say `37/4/د`, but the WO line and the certificate carry `37/4/ب`. Ministry wins → move د → ب.")
R.append("  - **WO 27 — 4/10 Tack Coat 1,150 of 2,300 م² and 4/21د 0 of 1,150 م² (−4,105.50)**: the تدقيق cross-tab "
         "carries these columns but short — the sheet is incomplete (the known 0.87 ratio). Needs a correcting طلب تدقيق.")
R.append("  - **WO 31 — 12/101 ورق عاكس نموذج III, 900 م² executed (KD 19,931.31), not in the WO and never certified**: "
         "in all three تدقيق sheets, so a real site record; either executed-but-unbilled or a QA mis-key (the known 1.10 ratio). "
         "QA decision — the module is not wrong to show it.")
R.append("  - **WO 2 — nine bab-1 daywork lines + 5/80 tiles (KD 1,753.27) executed, not in the WO, never certified**: "
         "same nature as WO 31 (out_of_kashef lines). QA decision.")
R.append("  - WO 41 7/175: 54.875 vs 54.88 = the source sheet rounds to 2 dp (register agrees with the module). Ignore.")
R.append("- Rate 2/13 (1.41 in the sheet vs 1.08 in the BOP): no quantity anywhere on that item — harmless; the BILL price "
         "book is the BOP authority.")
R.append("- WO-line mismatches (§6) are cheaper: `qm_kashef_lines.qty` updates (+ allocation resync).")
R.append("- Certified (§8) should already be exact; any residue is only from lines without a WO.")
R.append("")
# vendor detail for exec mismatches
if exec_mismatch:
    R.append("### Vendor carrying each executed-mismatch line (for the heal)\n")
    R.append("| WO | باب/بند | vendors on this line (executed qty) |")
    R.append("|---|---|---|")
    for x in exec_mismatch:
        vs = [(v, q) for (w, k, v), q in exec_by_vendor.items() if w == x["wo"] and k == x["key"]]
        R.append("| %s | %s | %s |" % (x["wo"], ks(x["key"]),
                                      ", ".join("%s %s" % (vendor_name.get(v, v), fq(q)) for v, q in vs) or "—"))
    R.append("")


R.append("## 10. Allocations (التوزيع) — the sub page's «allocated» figure\n")
R.append("Allocations are not in the source workbook, but they drive the KD figures on `/quantities/subs`. "
         "Check: per WO line, Σ allocations across vendors must equal the WO line quantity.\n")
R.append("- %d lines tie exactly; **%d lines are over-allocated**, %d partially, %d under-allocated."
         % (alloc_ok, len(stale_rows), len(alloc_partial), len(alloc_under)))
R.append("- Every over-allocated line is one that subcontractors claim IN FULL and that still carries a "
         "«كوبري — تنفيذ ذاتي» allocation equal to its executed quantity. Root cause: 0051 seeded "
         "allocated := executed on كوبري for every line, and 0054 (`tools/qm_expw_subs.py`) upserts a كوبري "
         "row only where the remainder is > 0 — it never deletes the seed on fully-subcontracted lines "
         "(`qm_allocations.qty` has a `> 0` check, so a zero upsert was never an option).")
R.append("- Stale كوبري allocation: **KD %s after pct** (%s pre-pct) on %d lines = exactly the excess of Σ allocated over Σ WO value."
         % (fmt(stale_kd), fmt(stale_kd / PCT), len(stale_rows)))
R.append("- Fix = `delete from qm_allocations where vendor_id = كوبري and kashef_line_id in (those %d lines)` — "
         "no quantity on any WO/تدقيق/certificate changes." % len(stale_rows))
R.append("")
R.append("| vendor | allocated (after pct) | executed (after pct) | ratio |")
R.append("|---|---|---|---|")
for v in sorted(set(alloc_by_vendor) | set(exec_by_vendor_v), key=lambda v: -alloc_by_vendor.get(v, 0)):
    a = alloc_by_vendor.get(v, 0) * PCT; e = exec_by_vendor_v.get(v, 0) * PCT
    R.append("| %s | %s | %s | %s |" % (vendor_name.get(v, v), fmt(a), fmt(e), ("%.3f" % (e / a)) if a else "—"))
R.append("")
R.append("Largest stale lines:\n")
R.append("| WO | باب/بند | WO qty | Σ subs | stale كوبري | KD after pct |")
R.append("|---|---|---|---|---|---|")
for x in sorted(stale_rows, key=lambda x: -x["kd"])[:15]:
    R.append("| %s | %s | %s | %s | %s | %s |" % (x["wo"], ks(x["key"]), fq(x["qty"]), fq(x["subs"]), fq(x["kub"]), fmt(x["kd"])))
R.append("")

open(REPORT, "w", encoding="utf-8").write("\n".join(R) + "\n")
json.dump({"missing_wos": [str(w) for w in missing_wos],
           "missing_lines": [{"wo": str(x["wo"]), "key": ks(x["key"]), "qty": x["src"], "rate": x["rate"]} for x in missing_lines],
           "wo_line_mismatch": [{"wo": x["wo"], "key": ks(x["key"]), "src": x["src"], "wo_qty": x["wo_qty"], "rate": x["rate"]} for x in wo_mismatch],
           "exec_mismatch": [{"wo": x["wo"], "key": ks(x["key"]), "src": x["src"], "exec": x["exec"], "rate": x["rate"]} for x in exec_mismatch],
           "cert_mismatch": [{"wo": x["wo"], "key": ks(x["key"]), "src": x["src"], "cert": x["cert"], "rate": x["rate"]} for x in cert_mismatch],
           "cert_rows": cert_rows, "stale_kubri_alloc": [{"wo": x["wo"], "key": ks(x["key"]), "qty": x["kub"]} for x in stale_rows], "rate_diffs": [(ks(k), a, b) for k, a, b in rate_diffs]},
          open(DIFFS, "w", encoding="utf-8"), ensure_ascii=False, indent=1, default=str)
print("\n".join(R[:60]))
print("...\nwrote", REPORT)
print("counts: wo_mismatch", len(wo_mismatch), "exec_mismatch", len(exec_mismatch), "cert_mismatch", len(cert_mismatch), "missing lines", len(missing_lines))
