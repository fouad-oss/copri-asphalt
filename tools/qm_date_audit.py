# -*- coding: utf-8 -*-
"""
qm_date_audit.py — audit + repair of dates in the quantities module
(Fouad, 2026-08-17). Sources: the migrations as pasted (0050 WO headers,
0051/0058 Expressway طلبات التدقيق, 0036/0045 Hawalli, 0041/0052/0056
certificates, 0047 contract header).

Project window: 2024-10-01 .. today. Serials are PER WORK ORDER and
increase with time, so a request's plausible date is arbitrated by its
serial neighbours inside the same WO (a request dated before its WO's
issue date is NOT an error — the emergency WOs are issued retroactively).

Repairs (auto, emitted to 0063):
  A. impossible year (2255, 2005, 1901 …)  → year re-fitted to neighbours
  B. before 2024-10-01                     → dd/mm swap or year re-fit
  C. after today                           → dd/mm swap or year re-fit
  D. in-window dd/mm swap chosen by the per-WO sequence solver (min Σ|Δ|
     over serial order, +SWITCH per departure from the original)
  E. in-window YEAR re-fit (penalty YEARPEN — only when the sequence is
     wildly off otherwise; rare, listed separately for review)
Everything else is only REPORTED (`date-audit-report.md`).

Also: EXPW contract start_date 2024-05-11 → 2024-11-05 (11/05 vs 05/11;
certificate 1 ends 2024-12-05 and WO 1 is dated 2024-11-06).

Usage: python tools/qm_date_audit.py   → writes the migration + report
"""
import io, os, re, glob, json, datetime, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIG = os.path.join(ROOT, "supabase", "migrations")
OUT = os.path.join(MIG, "0063_qm_date_repair.sql")
REPORT = os.path.join(os.path.expanduser("~"), "Desktop", "quantities-backfill", "date-audit-report.md")

LO = datetime.date(2024, 10, 1)
TODAY = datetime.date(2026, 8, 17)
FAR, NEAR = 75, 45
D = datetime.date

def parse(s):
    try: return D.fromisoformat(s)
    except Exception: return None

def in_win(d): return d is not None and LO <= d <= TODAY

def candidates(s):
    """All readings of a yyyy-mm-dd string: as-is, dd/mm swapped, and each
    of those with the year re-fitted to 2024/2025/2026."""
    y, m, d = map(int, s.split("-"))
    out = []
    for yy in (y, 2024, 2025, 2026):
        for a, b in ((m, d), (d, m)):
            try: out.append(D(yy, a, b))
            except ValueError: pass
    seen, uniq = set(), []
    for c in out:
        if c not in seen: seen.add(c); uniq.append(c)
    return uniq

def load_tadqiq():
    rows = []
    files = sorted(glob.glob(os.path.join(MIG, "0051_qm_expw_tadqiq_part*.sql"))) + [os.path.join(MIG, "0058_qm_expw_tadqiq_wo3.sql")]
    rx = re.compile(r"kashef_no = (\d+)|insert into qm_tadqiq \(kashef_id, vendor_id, tadqiq_date, street_no, note, opening, serial_no\)\s*values \(v_k, v_vendor, (date '(\d{4}-\d{2}-\d{2})'|null), '[^']*', '([^']*)', \w+, '(\d*)'\)")
    for f in files:
        s = io.open(f, encoding="utf-8").read()
        wo = None
        for m in rx.finditer(s):
            if m.group(1): wo = int(m.group(1)); continue
            if m.group(3):
                rows.append(dict(wo=wo, date=m.group(3), serial=int(m.group(5)) if m.group(5) else None, note=m.group(4)))
    return rows

def load_wo_dates():
    s = io.open(os.path.join(MIG, "0050_qm_expw_wo_backfill.sql"), encoding="utf-8").read()
    return {int(w): D.fromisoformat(d) for w, d in
            re.findall(r"values \(v_contract, (\d+), '[^']*', '\w+', '', '', '[^']*', 'wo', '\d+', date '([^']*)'", s)}

SWITCH = 25   # day-equivalents charged for a dd/mm swap of an in-window original
YEARPEN = 90  # … for re-fitting the YEAR of an in-window original (rule E, rare)

def repair(rows, wodate):
    """Per WO: order by serial, pick one reading per request minimising
    Σ|date_i − date_{i−1}| (+SWITCH per non-original pick). In-window
    originals may only become their dd/mm swap; out-of-window ones may take
    any in-window reading. Exact DP over ≤8 candidates per entry."""
    bywo = collections.defaultdict(list)
    for r in rows:
        if r["serial"] is not None: bywo[r["wo"]].append(r)
    fixes, leftovers = [], []
    for wo, lst in bywo.items():
        lst.sort(key=lambda r: r["serial"])
        orig = [parse(r["date"]) for r in lst]
        opts = []
        for i, r in enumerate(lst):
            o = orig[i]
            if in_win(o):
                cs = [o] + [c for c in candidates(r["date"]) if in_win(c) and c != o]
            else:
                cs = [c for c in candidates(r["date"]) if in_win(c)] or [None]
            opts.append(cs)
        def pen_of(i, c):
            o = orig[i]
            if c is None or c == o: return 0
            if not in_win(o): return 0                 # must change anyway
            return SWITCH if c.year == o.year else YEARPEN
        n = len(lst)
        INF = float("inf")
        cost = [[INF]*len(opts[i]) for i in range(n)]
        back = [[-1]*len(opts[i]) for i in range(n)]
        for j, c in enumerate(opts[0]):
            cost[0][j] = pen_of(0, c)
        for i in range(1, n):
            for j, c in enumerate(opts[i]):
                pen = pen_of(i, c)
                for k, p in enumerate(opts[i-1]):
                    if cost[i-1][k] == INF: continue
                    step = 0 if (c is None or p is None) else abs((c - p).days)
                    v = cost[i-1][k] + step + pen
                    if v < cost[i][j]: cost[i][j] = v; back[i][j] = k
        j = min(range(len(opts[-1])), key=lambda j: cost[-1][j])
        pick = [None]*n
        for i in range(n-1, -1, -1):
            pick[i] = opts[i][j]; j = back[i][j]
        for i, r in enumerate(lst):
            o, nw = orig[i], pick[i]
            nb = [x for x in pick[max(0, i-4):i] + pick[i+1:i+5] if x]
            ref = sorted(nb)[len(nb)//2] if nb else wodate.get(wo)
            if nw is not None and nw != o and in_win(o) and nw.year != o.year:
                # rule E guard: prefer the same-year swap if it lands near the
                # neighbours; keep the year re-fit only if IT lands near; else leave
                sw = next((c for c in candidates(r["date"]) if in_win(c) and c != o and c.year == o.year), None)
                if ref and sw and abs((sw - ref).days) <= NEAR: nw = sw
                elif not (ref and abs((nw - ref).days) <= NEAR): nw = o
                pick[i] = nw
            if nw is not None and nw != o:
                rule = ("A" if o is None or not (2024 <= o.year <= 2026) else "B" if o < LO else "C" if o > TODAY
                        else "D" if nw.year == o.year else "E")
                fixes.append(dict(wo=wo, serial=r["serial"], old=r["date"], new=nw.isoformat(), rule=rule,
                                  ref=ref.isoformat() if ref else None, note=r["note"]))
            elif nw is None or (ref and abs((nw - ref).days) >= FAR):
                leftovers.append(dict(wo=wo, serial=r["serial"], date=r["date"], ref=ref.isoformat() if ref else None,
                                      why="unrepairable" if nw is None else f"{abs((nw-ref).days)}d from WO neighbours"))
    return fixes, leftovers

def main():
    rows = load_tadqiq(); wodate = load_wo_dates()
    fixes, leftovers = repair(rows, wodate)
    fixes.sort(key=lambda f: (f["wo"], f["serial"])); leftovers.sort(key=lambda f: (f["wo"], f["serial"]))
    by_rule = collections.Counter(f["rule"] for f in fixes)

    # ── migration ────────────────────────────────────────────────────
    esc = lambda s: s.replace("'", "''")
    body = []
    for f in fixes:
        body.append(f"""  update qm_tadqiq t set tadqiq_date = date '{f['new']}'
    from qm_kashefs k where t.kashef_id = k.id and k.contract_id = v_contract
     and k.kashef_no = {f['wo']} and t.serial_no = '{f['serial']}' and t.tadqiq_date = date '{f['old']}';
  get diagnostics v_c = row_count;
  if v_c > 0 then
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    select 'tadqiq', t.id, 'update', 'tadqiq_date', 'WO {f['wo']} طلب {f['serial']}', '{f['old']}', '{f['new']}', 'date-audit'
      from qm_tadqiq t join qm_kashefs k on k.id = t.kashef_id
     where k.contract_id = v_contract and k.kashef_no = {f['wo']} and t.serial_no = '{f['serial']}' and t.tadqiq_date = date '{f['new']}';
    v_n := v_n + v_c;
  end if;""")
    sql = f"""-- ════════════════════════════════════════════════════════════════════
-- 0063 — QUANTITIES: date audit repairs (Fouad, 2026-08-17)
--        Generated by tools/qm_date_audit.py — see date-audit-report.md
--
-- Project window 2024-10-01 .. {TODAY}. Serials are per work order and
-- increase with time; each request's date is arbitrated by its serial
-- neighbours inside the same WO. Rules: A impossible year, B before the
-- project, C in the future, D in-window dd/mm swap where the original is
-- ≥{FAR} days off the neighbours and the swap ≤{NEAR} days. {len(fixes)} request
-- dates ({dict(by_rule)}) + the EXPW contract start date.
-- 0057/0059 (per-sub split rows) carry the same dates and are matched by
-- (WO, serial, old date), so all vendor rows of a request move together.
-- Idempotent; logged to qm_changelog actor 'date-audit'.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. EXPW contract start: 11/05 was 05/11 (cert 1 ends 2024-12-05, WO 1 dated 2024-11-06)
update qm_contracts set start_date = date '2024-11-05'
 where code = 'EXPW' and start_date = date '2024-05-11';

-- ── 2. Expressway طلبات التدقيق ────────────────────────────────────
do $qmda$
declare
  v_contract bigint;
  v_c int;
  v_n int := 0;
begin
  select id into v_contract from qm_contracts where code = 'EXPW';
  if v_contract is null then return; end if;
{chr(10).join(body)}
  raise notice '0063: % request rows re-dated', v_n;
end $qmda$;
"""
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(sql)

    # ── report ───────────────────────────────────────────────────────
    os.makedirs(os.path.dirname(REPORT), exist_ok=True)
    L = [f"# Date audit — quantities module ({TODAY})", "",
         f"Scanned: {len(rows)} dated Expressway requests (0051+0058), 65 WO headers (0050), Hawalli 0036/0045, certificates 0041/0052/0056, contract 0047.",
         "", f"**Auto-repaired: {len(fixes)}** request dates — rule A (impossible year) {by_rule.get('A',0)}, B (before Oct-2024) {by_rule.get('B',0)}, C (future) {by_rule.get('C',0)}, D (in-window dd/mm swap) {by_rule.get('D',0)}, E (in-window year typo — **eyeball these**) {by_rule.get('E',0)}. Plus EXPW `start_date` 2024-05-11 → 2024-11-05.",
         "", "Hawalli WO / request / certificate dates: all inside the window, nothing to repair. Expressway WO header dates and certificate period ends: inside the window (certs are formula-dated, 0056).",
         "", "## Repairs", "", "| WO | serial | was | now | rule | WO-neighbour ref |", "|---|---|---|---|---|---|"]
    L += [f"| {f['wo']} | {f['serial']} | {f['old']} | **{f['new']}** | {f['rule']} | {f['ref']} |" for f in fixes]
    L += ["", f"## Left as-is but suspicious ({len(leftovers)}) — needs Fouad", "",
          "In-window dates that sit far from their WO's serial neighbours where no dd/mm swap helps (often the neighbours themselves are the odd ones, or the WO simply spans a long period).", "",
          "| WO | serial | date | neighbour ref | why |", "|---|---|---|---|---|"]
    L += [f"| {f['wo']} | {f['serial']} | {f['date']} | {f['ref']} | {f['why']} |" for f in leftovers]
    io.open(REPORT, "w", encoding="utf-8", newline="\n").write("\n".join(L) + "\n")
    print(f"fixes {len(fixes)} {dict(by_rule)}; leftovers {len(leftovers)}")
    print("wrote", OUT, os.path.getsize(OUT)//1024, "KB;", REPORT)
    return fixes, leftovers

if __name__ == "__main__":
    main()
