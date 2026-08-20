# -*- coding: utf-8 -*-
"""Pull the live EXPW quantities data (service role key from .env.sn, READ-ONLY) into
Desktop/quantities-backfill/expw-live-snapshot.json for tools/qm_expw_qty_audit.py.
Run with PYTHONIOENCODING=utf-8."""
import os, json, sys, urllib.request, urllib.parse

ENV = r"C:\Users\fszog\Desktop\Copri webapp\.env.sn"
env = {}
for line in open(ENV, encoding="utf-8"):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()
KEY = env["SUPABASE_SERVICE_ROLE_KEY"]
URL = env.get("SUPABASE_URL", "https://abwsxqnppihrmkhydkai.supabase.co") + "/rest/v1"
H = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Accept": "application/json"}
OUT = os.path.join(os.path.expanduser("~"), "Desktop", "quantities-backfill", "expw-live-snapshot.json")


def get(table, params):
    rows, off, page = [], 0, 1000
    while True:
        q = dict(params)
        q["limit"] = page
        q["offset"] = off
        req = urllib.request.Request(URL + "/" + table + "?" + urllib.parse.urlencode(q), headers=H)
        with urllib.request.urlopen(req) as r:
            chunk = json.loads(r.read().decode("utf-8"))
        rows.extend(chunk)
        if len(chunk) < page:
            break
        off += page
    return rows


contracts = get("qm_contracts", {"select": "*"})
expw = [c for c in contracts if c["code"] == "EXPW"][0]
cid = expw["id"]
print("contract", expw)

kashefs = get("qm_kashefs", {"select": "*", "contract_id": "eq.%d" % cid, "order": "kashef_no"})
kids = [k["id"] for k in kashefs]
print("kashefs", len(kashefs))
bop = get("qm_bop_items", {"select": "id,bab,band,suffix,description,unit,rate", "contract_id": "eq.%d" % cid})
print("bop", len(bop))


def in_list(ids):
    return "in.(%s)" % ",".join(str(i) for i in ids)


def chunked(table, col, ids, select, extra=None):
    out = []
    for i in range(0, len(ids), 60):
        p = {"select": select, col: in_list(ids[i:i + 60])}
        if extra:
            p.update(extra)
        out.extend(get(table, p))
    return out


klines = chunked("qm_kashef_lines", "kashef_id", kids, "id,kashef_id,bop_item_id,qty")
print("kashef_lines", len(klines))
tad = chunked("qm_tadqiq", "kashef_id", kids, "id,kashef_id,vendor_id,tadqiq_date,serial_no,opening,note")
print("tadqiq", len(tad))
tids = [t["id"] for t in tad]
tlines = chunked("qm_tadqiq_lines", "tadqiq_id", tids, "id,tadqiq_id,bop_item_id,qty,out_of_kashef")
print("tadqiq_lines", len(tlines))
certs = get("qm_pay_certs", {"select": "*", "contract_id": "eq.%d" % cid, "order": "cert_no"})
print("certs", len(certs))
clines = chunked("qm_pay_cert_lines", "cert_id", [c["id"] for c in certs], "id,cert_id,kashef_id,bop_item_id,qty,amount")
print("cert_lines", len(clines))
kl_ids = [l["id"] for l in klines]
allocs = chunked("qm_allocations", "kashef_line_id", kl_ids, "id,kashef_line_id,vendor_id,qty")
print("allocations", len(allocs))
vend_ids = sorted({t["vendor_id"] for t in tad} | {a["vendor_id"] for a in allocs})
vendors = get("vendors", {"select": "id,name", "id": in_list(vend_ids)}) if vend_ids else []

json.dump({"contract": expw, "kashefs": kashefs, "bop": bop, "kashef_lines": klines,
           "tadqiq": tad, "tadqiq_lines": tlines, "certs": certs, "cert_lines": clines,
           "allocations": allocs, "vendors": vendors},
          open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
print("wrote", OUT)
