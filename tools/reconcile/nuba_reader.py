# -*- coding: utf-8 -*-
"""Reader for the legacy NUBA 'Daily Journal' .xls export.

The file is nonstandard BIFF8 (worksheet substream missing its BOF, unaligned
OLE sectors) so xlrd/openpyxl/pandas refuse it.  We reuse the proven approach
from tools/nuba_parse.py: xlrd.compdoc with ignore_workbook_corruption to get
the Workbook stream, then a linear record scan (LABELSST/NUMBER + SST with
CONTINUE handling + date-XF detection).

The sheet is a printed report, not a table.  Hierarchy per printed group:
    date row (col2 = date) -> voucher-type row (col2 = text)
    -> voucher-no row (col1) -> N entry lines (col0 code + col15/19 amounts).
read_nuba() un-pivots that into a flat voucher list.

Self-validation: the report footer row ('Totals :' in col13) carries the
printed grand debit/credit; we always check our summed lines against it.
CLI --check additionally asserts caller-supplied expected figures (kept out
of the code by convention: no company figures in tools/).
"""
import argparse
import datetime
import re
import struct
import sys

from xlrd import compdoc

TOL = 0.0005  # float-sum slack when comparing to printed 3-dp totals

DATE_FMT_IDS = set(range(14, 23)) | set(range(27, 37)) | {45, 46, 47} | set(range(50, 59))


# ---------------------------------------------------------------- BIFF layer

def _parse_sst(blocks):
    """blocks: SST record data + its CONTINUE datas. Returns list of strings."""
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
            off += take
            n -= take
            if n > 0:
                bi += 1
                off = 0
        return out

    _total, unique = struct.unpack("<ii", read(8))
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
                bi += 1
                off = 0
                high = read(1)[0] & 1  # fresh grbit at each CONTINUE boundary
            avail = remaining()
            if high:
                take = min(need, avail // 2)
                chars.append(read(take * 2).decode("utf-16-le", errors="replace"))
            else:
                take = min(need, avail)
                chars.append(read(take).decode("latin-1"))
            need -= take
            if take == 0 and avail > 0:
                read(avail)  # dangling odd byte before a CONTINUE; discard
        if crun:
            read(4 * crun)
        if cbext:
            read(cbext)
        strings.append("".join(chars))
    return strings


def _read_cells(path):
    """Return {(row, col): value} for all LABELSST/NUMBER cells."""
    data = open(path, "rb").read()
    cd = compdoc.CompDoc(data, logfile=open("nul", "w"), ignore_workbook_corruption=True)
    mem, offset, size = cd.locate_named_stream("Workbook")
    buf = bytes(mem[offset:offset + size])

    records = []
    pos = 0
    while pos + 4 <= len(buf):
        rt, ln = struct.unpack_from("<HH", buf, pos)
        records.append((rt, pos + 4, ln))
        pos += 4 + ln

    sst_strings = []
    formats = {}
    xf_fmt = []
    i = 0
    while i < len(records):
        rt, dpos, ln = records[i]
        if rt == 0x00FC:  # SST (+ CONTINUEs)
            blocks = [buf[dpos:dpos + ln]]
            j = i + 1
            while j < len(records) and records[j][0] == 0x003C:
                _, dp2, ln2 = records[j]
                blocks.append(buf[dp2:dp2 + ln2])
                j += 1
            sst_strings = _parse_sst(blocks)
            i = j
            continue
        if rt == 0x041E:  # FORMAT
            idx, = struct.unpack_from("<H", buf, dpos)
            cch, flags = struct.unpack_from("<HB", buf, dpos + 2)
            raw = buf[dpos + 5: dpos + 5 + (cch * 2 if flags & 1 else cch)]
            formats[idx] = raw.decode("utf-16-le" if flags & 1 else "latin-1", errors="replace")
        elif rt == 0x00E0:  # XF
            _fnt, fmt = struct.unpack_from("<HH", buf, dpos)
            xf_fmt.append(fmt)
        i += 1

    def is_date_fmt(fmtidx):
        if fmtidx in DATE_FMT_IDS:
            return True
        s = re.sub(r'\[[^\]]*\]|"[^"]*"', "", formats.get(fmtidx, "")).lower()
        return bool(re.search(r"[dy]", s)) and ":" not in s and "#" not in s

    date_xfs = {ix for ix, f in enumerate(xf_fmt) if is_date_fmt(f)}

    cells = {}
    for rt, dpos, ln in records:
        if rt == 0x00FD:  # LABELSST
            r, c, _xf, isst = struct.unpack_from("<HHHi", buf, dpos)
            cells[(r, c)] = sst_strings[isst] if 0 <= isst < len(sst_strings) else "#SST%d" % isst
        elif rt == 0x0203:  # NUMBER
            r, c, xf = struct.unpack_from("<HHH", buf, dpos)
            d, = struct.unpack_from("<d", buf, dpos + 6)
            if xf in date_xfs and 1 < d < 2958466:
                cells[(r, c)] = datetime.datetime(1899, 12, 30) + datetime.timedelta(days=d)
            else:
                cells[(r, c)] = d
    return cells


# ------------------------------------------------------------- report layer

# columns of the printed report (from the row-6 column header)
C_CODE, C_GROUP, C_VNO, C_ACCT, C_DESCR, C_DOCNO, C_CHQ, C_DEB, C_CRE = 0, 2, 1, 4, 10, 12, 13, 15, 19


def _as_text(v):
    """Voucher/doc/cheque numbers may come through as floats; keep them as clean text."""
    if v is None:
        return ""
    if isinstance(v, float):
        return str(int(v)) if v == int(v) else str(v)
    return str(v).strip()


def read_nuba(path):
    """Un-pivot the printed report.

    Returns (vouchers, printed_totals) where vouchers is a list of
    {date, vtype, voucher_no, lines:[{code, account, descr, doc_no, cheque,
    debit, credit}]} and printed_totals is the (debit, credit) pair from the
    report's own footer 'Totals :' row (None if the footer was not found).
    """
    cells = _read_cells(path)
    rows = {}
    for (r, c), v in cells.items():
        rows.setdefault(r, {})[c] = v

    vouchers = []
    printed_totals = None
    cur_date = cur_type = cur_v = None
    orphans = 0  # entry lines seen before any voucher header (must stay 0)

    for r in sorted(rows):
        row = rows[r]
        # footer: printed grand totals -- our strongest tie-out anchor
        if _as_text(row.get(C_CHQ)).startswith("Totals"):
            printed_totals = (row.get(C_DEB), row.get(C_CRE))
            continue
        g = row.get(C_GROUP)
        if g is not None:
            if isinstance(g, datetime.datetime):
                cur_date, cur_type, cur_v = g.date(), None, None
                continue
            s = str(g).strip()
            # a date group can also print as text; page furniture never lands in col2
            m = re.fullmatch(r"(\d{2})/(\d{2})/(\d{4})", s)
            if m:
                cur_date = datetime.date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
                cur_type, cur_v = None, None
                continue
            if s and not s.lower().startswith("page"):
                cur_type, cur_v = s, None
                continue
        if row.get(C_VNO) is not None:
            cur_v = {"date": cur_date, "vtype": cur_type,
                     "voucher_no": _as_text(row[C_VNO]), "lines": []}
            vouchers.append(cur_v)
            continue
        code = row.get(C_CODE)
        deb, cre = row.get(C_DEB), row.get(C_CRE)
        if code is not None and (isinstance(deb, float) or isinstance(cre, float)):
            if _as_text(code) == "Code":  # repeated printed column header
                continue
            if cur_v is None:
                orphans += 1
                continue
            cur_v["lines"].append({
                "code": _as_text(code),
                "account": _as_text(row.get(C_ACCT)),
                "descr": _as_text(row.get(C_DESCR)),
                "doc_no": _as_text(row.get(C_DOCNO)),
                "cheque": _as_text(row.get(C_CHQ)),
                "debit": float(deb or 0.0),
                "credit": float(cre or 0.0),
            })

    if orphans:
        raise ValueError("NUBA parse: %d entry lines had no voucher header - layout drifted" % orphans)
    empty = [v for v in vouchers if not v["lines"]]
    if empty:
        raise ValueError("NUBA parse: %d vouchers have no lines - layout drifted" % len(empty))
    return vouchers, printed_totals


def voucher_total(v):
    """A voucher's value = its debit-leg sum (each voucher is internally balanced)."""
    return sum(ln["debit"] for ln in v["lines"])


def stats(vouchers):
    debit = sum(ln["debit"] for v in vouchers for ln in v["lines"])
    credit = sum(ln["credit"] for v in vouchers for ln in v["lines"])
    dates = sorted({v["date"] for v in vouchers})
    return {
        "vouchers": len(vouchers),
        "lines": sum(len(v["lines"]) for v in vouchers),
        "debit": debit,
        "credit": credit,
        "dates": len(dates),
        "date_min": dates[0] if dates else None,
        "date_max": dates[-1] if dates else None,
    }


def validate(vouchers, printed_totals):
    """Internal tie-outs that need no external figures. Returns list of problems."""
    problems = []
    st = stats(vouchers)
    if abs(st["debit"] - st["credit"]) > TOL:
        problems.append("grand debit %.3f != grand credit %.3f" % (st["debit"], st["credit"]))
    if printed_totals is None:
        problems.append("printed 'Totals :' footer row not found")
    else:
        if abs(st["debit"] - printed_totals[0]) > TOL:
            problems.append("summed debit %.3f != printed total %.3f" % (st["debit"], printed_totals[0]))
        if abs(st["credit"] - printed_totals[1]) > TOL:
            problems.append("summed credit %.3f != printed total %.3f" % (st["credit"], printed_totals[1]))
    unbalanced = [v for v in vouchers
                  if abs(sum(l["debit"] for l in v["lines"]) - sum(l["credit"] for l in v["lines"])) > 0.005]
    if unbalanced:
        problems.append("%d vouchers not internally balanced (first: %s %s)"
                        % (len(unbalanced), unbalanced[0]["vtype"], unbalanced[0]["voucher_no"]))
    missing_hdr = [v for v in vouchers if v["date"] is None or v["vtype"] is None]
    if missing_hdr:
        problems.append("%d vouchers missing date/type header" % len(missing_hdr))
    return problems


def main():
    ap = argparse.ArgumentParser(description="Parse + validate the NUBA daily journal export")
    ap.add_argument("path", help="NUBA .xls file")
    ap.add_argument("--check", action="store_true", help="run validations, exit 1 on failure")
    # expected figures are supplied by the caller, never hardcoded here
    ap.add_argument("--expect-vouchers", type=int)
    ap.add_argument("--expect-lines", type=int)
    ap.add_argument("--expect-total", type=float)
    ap.add_argument("--expect-dates", type=int)
    args = ap.parse_args()

    vouchers, printed = read_nuba(args.path)
    st = stats(vouchers)
    print("vouchers : %d" % st["vouchers"])
    print("lines    : %d" % st["lines"])
    print("debit    : %.3f" % st["debit"])
    print("credit   : %.3f" % st["credit"])
    print("printed  : %s" % (printed and "%.3f / %.3f" % printed))
    print("dates    : %d distinct, %s .. %s" % (st["dates"], st["date_min"], st["date_max"]))

    if args.check:
        problems = validate(vouchers, printed)
        for want, got, name in ((args.expect_vouchers, st["vouchers"], "vouchers"),
                                (args.expect_lines, st["lines"], "lines"),
                                (args.expect_dates, st["dates"], "distinct dates")):
            if want is not None and got != want:
                problems.append("expected %d %s, got %d" % (want, name, got))
        if args.expect_total is not None and abs(st["debit"] - args.expect_total) > TOL:
            problems.append("expected total %.3f, got %.3f" % (args.expect_total, st["debit"]))
        if problems:
            for p in problems:
                print("FAIL: " + p)
            sys.exit(1)
        print("CHECK: all validations passed")


if __name__ == "__main__":
    main()
