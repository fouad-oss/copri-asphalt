# -*- coding: utf-8 -*-
"""Minimal BIFF8 parser for the corrupt NUBA Daily journal .xls (read-only)."""
import sys, struct, collections, datetime, json, re
sys.stdout.reconfigure(encoding="utf-8")
from xlrd import compdoc

P = r"C:\Users\fszog\Desktop\Copri webapp\Accounting raw data\legacy-jv\NUBA Daily journal 13.07.2026.xls"
OUT = r"C:\Users\fszog\AppData\Local\Temp\claude\C--Users-fszog-OneDrive-Desktop-Claude-Code\e227ca75-2fb7-40d1-88be-fb6ce7351cae\scratchpad\nuba-dump.json"

data = open(P, "rb").read()
cd = compdoc.CompDoc(data, logfile=open("nul", "w"), ignore_workbook_corruption=True)
mem, offset, size = cd.locate_named_stream("Workbook")
buf = bytes(mem[offset:offset + size])

# ---- pass 1: collect records ----
records = []
pos = 0
while pos + 4 <= len(buf):
    rt, ln = struct.unpack_from("<HH", buf, pos)
    records.append((rt, pos + 4, ln))
    pos += 4 + ln

# ---- SST ----
def parse_sst(blocks):
    """blocks: list of bytes (SST data + CONTINUE datas). Returns list of strings."""
    bi, off = 0, 0
    def remaining():
        return len(blocks[bi]) - off
    def read(n):
        nonlocal bi, off
        out = b""
        while n > 0:
            avail = len(blocks[bi]) - off
            take = min(avail, n)
            out += blocks[bi][off:off + take]
            off += take; n -= take
            if n > 0:
                bi += 1; off = 0
        return out
    total, unique = struct.unpack("<ii", read(8))
    strings = []
    for _ in range(unique):
        if bi >= len(blocks):
            break
        cch, = struct.unpack("<H", read(2))
        flags = read(1)[0]
        high = flags & 1
        ext = flags & 4
        rich = flags & 8
        crun = struct.unpack("<H", read(2))[0] if rich else 0
        cbext = struct.unpack("<i", read(4))[0] if ext else 0
        chars = []
        need = cch
        while need > 0:
            if remaining() == 0:
                bi += 1; off = 0
                high = read(1)[0] & 1  # fresh grbit at continue boundary
            avail = remaining()
            if high:
                take = min(need, avail // 2)
                raw = read(take * 2)
                chars.append(raw.decode("utf-16-le", errors="replace"))
            else:
                take = min(need, avail)
                raw = read(take)
                chars.append(raw.decode("latin-1"))
            need -= take
            if take == 0 and avail > 0:
                # avail==1 with high bit: dangling byte before continue; skip it
                read(avail)
        if crun:
            read(4 * crun)
        if cbext:
            read(cbext)
        strings.append("".join(chars))
    return strings

sst_strings = []
formats = {}   # fmt idx -> fmt string
xf_fmt = []    # xf idx -> fmt idx
i = 0
while i < len(records):
    rt, dpos, ln = records[i]
    if rt == 0x00FC:  # SST
        blocks = [buf[dpos:dpos + ln]]
        j = i + 1
        while j < len(records) and records[j][0] == 0x003C:
            _, dp2, ln2 = records[j]
            blocks.append(buf[dp2:dp2 + ln2])
            j += 1
        sst_strings = parse_sst(blocks)
        i = j
        continue
    elif rt == 0x041E:  # FORMAT
        idx, = struct.unpack_from("<H", buf, dpos)
        cch, flags = struct.unpack_from("<HB", buf, dpos + 2)
        raw = buf[dpos + 5: dpos + 5 + (cch * 2 if flags & 1 else cch)]
        s = raw.decode("utf-16-le" if flags & 1 else "latin-1", errors="replace")
        formats[idx] = s
    elif rt == 0x00E0:  # XF
        fnt, fmt = struct.unpack_from("<HH", buf, dpos)
        xf_fmt.append(fmt)
    i += 1

print("SST strings:", len(sst_strings))
print("formats:", formats)
DATE_FMT_IDS = set(range(14, 23)) | set(range(27, 37)) | {45, 46, 47} | set(range(50, 59))
def is_date_fmt(fmtidx):
    if fmtidx in DATE_FMT_IDS:
        return True
    s = formats.get(fmtidx, "")
    s2 = re.sub(r'\[[^\]]*\]|"[^"]*"', "", s).lower()
    return bool(re.search(r"[dy]", s2)) and ":" not in s2 and "#" not in s2

date_xfs = {ix for ix, f in enumerate(xf_fmt) if is_date_fmt(f)}
print("n XFs:", len(xf_fmt), "date XFs:", sorted(date_xfs))

# ---- cells ----
cells = {}  # (row, col) -> value
maxrow = maxcol = 0
for rt, dpos, ln in records:
    if rt == 0x00FD:  # LABELSST
        r, c, xf, isst = struct.unpack_from("<HHHi", buf, dpos)
        v = sst_strings[isst] if 0 <= isst < len(sst_strings) else "#SST%d" % isst
        cells[(r, c)] = v
    elif rt == 0x0203:  # NUMBER
        r, c, xf = struct.unpack_from("<HHH", buf, dpos)
        d, = struct.unpack_from("<d", buf, dpos + 6)
        if xf in date_xfs and 1 < d < 2958466:
            base = datetime.datetime(1899, 12, 30)
            v = base + datetime.timedelta(days=d)
        else:
            v = d
        cells[(r, c)] = v
    else:
        continue
    if r > maxrow: maxrow = r
    if c > maxcol: maxcol = c

print("cells:", len(cells), "maxrow:", maxrow, "maxcol:", maxcol)

# build row list
rows = collections.defaultdict(dict)
for (r, c), v in cells.items():
    rows[r][c] = v
rownums = sorted(rows)
def rowvals(r, width=None):
    d = rows[r]
    w = (maxcol + 1) if width is None else width
    return [d.get(c) for c in range(w)]

# column fill profile over first 200 rows and overall
colfill = collections.Counter()
for r in rownums:
    for c in rows[r]:
        colfill[c] += 1
print("column fill:", dict(sorted(colfill.items())))

# print first 30 rows compactly
def trunc(v, n=30):
    if v is None: return ""
    if isinstance(v, datetime.datetime): return v.isoformat(sep=" ")[:16]
    s = re.sub(r"\s+", " ", str(v)).strip()
    return s if len(s) <= n else s[:n-1] + "…"
print("---- first 30 populated rows ----")
for r in rownums[:30]:
    print(r, [trunc(v) for v in rowvals(r)])
print("---- rows 30-45 ----")
for r in rownums[30:45]:
    print(r, [trunc(v) for v in rowvals(r)])
print("---- last 8 rows ----")
for r in rownums[-8:]:
    print(r, [trunc(v) for v in rowvals(r)])

json.dump({
    "n_sst": len(sst_strings),
    "formats": formats,
    "n_cells": len(cells),
    "maxrow": maxrow, "maxcol": maxcol,
    "n_rows": len(rownums),
}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
