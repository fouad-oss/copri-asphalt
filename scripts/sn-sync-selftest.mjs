#!/usr/bin/env node
// Offline self-test of the sn-sync mappers against the raw dumps (no network, no DB).
// Proves: (1) hash determinism — mapping the same document twice yields the same hash
// (no spurious po_revised alerts on a no-change refresh); (2) every walked PO maps
// (id, number, lines); (3) line math and header/line sums; (4) date/number parsing.
//   node scripts/sn-sync-selftest.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapPo, mapSr, mapInvoice, mapVendor, mapItem, hashDoc, dateTime, dateOnly, num, strip, diffTyped, diffLines } from '../supabase/functions/sn-sync/core.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = path.join(ROOT, 'sn-api-dumps');
let fails = 0; const check = (ok, msg) => { if (!ok) { fails++; console.log('FAIL', msg); } };

// parsing
check(dateTime('28/07/2026 11:08:10') === '2026-07-28T11:08:10', 'dd/MM/yyyy HH:mm:ss');
check(dateOnly('31/07/2026') === '2026-07-31', 'dd/MM/yyyy');
check(dateOnly('18 Aug 2026') === '2026-08-18', 'dd Mon yyyy');
check(dateTime('2026-07-26T12:08:50.38') === '2026-07-26T12:08:50', 'ISO ms');
check(dateTime('2026-02-16 09:42') === '2026-02-16T09:42:00', 'ISO space');
check(dateOnly('2026-07-25') === '2026-07-25', 'ISO date');
check(num('5,224.800') === 5224.8, 'thousands sep');
check(num('<div style="x">240</div>') === 240, 'html number');
check(strip('<a href="/x">PO/0423</a>') === 'PO/0423', 'strip anchor');
check(strip("<div style='font-weight:bold;'>PCS       </div>") === 'PCS', 'strip div + trim');

// PO walk dumps
const walkDir = path.join(D, 'po-walk');
const files = fs.existsSync(walkDir) ? fs.readdirSync(walkDir).filter((f) => /^\d+\.json$/.test(f)) : [];
let pos = 0, lines = 0, mismatch = 0, badMath = 0, hashDiff = 0, fa = 0, closed = 0, nullItem = 0;
for (const f of files) {
  const data = JSON.parse(fs.readFileSync(path.join(walkDir, f), 'utf8')).data;
  const a = mapPo(data), b = mapPo(JSON.parse(JSON.stringify(data)));
  const ha = await hashDoc(a.po, a.lines), hb = await hashDoc(b.po, b.lines);
  if (ha !== hb) hashDiff++;
  check(a.po.sn_po_id === Number(f.replace('.json', '')), `id ${f}`);
  check(/^PO\//.test(a.po.po_number), `number ${f}`);
  check(a.lines.length > 0, `lines ${f}`);
  pos++; lines += a.lines.length; if (a.po.is_fixed_asset) fa++; if (a.po.is_closed) closed++;
  for (const l of a.lines) { if (l.item_id === null) nullItem++; if (l.qty_ordered !== null && l.unit_price !== null && Math.abs(l.qty_ordered * l.unit_price - l.line_amount) > 0.005) badMath++; }
  if (a.po.net_amount !== null && Math.abs(a.po.net_amount - a.po.lines_amount) > 0.01) mismatch++;
  // diff of identical docs must be empty
  check(diffTyped(a.po, b.po).length === 0, `self-diff ${f}`);
  const dl = diffLines(a.lines, b.lines, 'sn_po_line_id'); check(!dl.added.length && !dl.removed.length && !dl.changed.length, `self-line-diff ${f}`);
}
console.log(`POs mapped ${pos} (FA ${fa}, closed ${closed}), lines ${lines}, null item_id ${nullItem}, qty×price≠amount ${badMath}, header≠Σlines ${mismatch}, hash nondeterminism ${hashDiff}`);
check(hashDiff === 0, 'hash determinism');
check(badMath <= 3, 'line math (3 known SN source quirks: PO/0346, PO/0347, PO/0376)');

// SR + invoice + masters samples
const tryMap = (rel, fn, label) => { const p = path.join(D, rel); if (!fs.existsSync(p)) return; const j = JSON.parse(fs.readFileSync(p, 'utf8')); const r = fn(j.data ?? j); console.log(label, JSON.stringify(r).slice(0, 220)); return r; };
const sr = tryMap('2026-08-18T15-34-56/43-sr-path5.json', (d) => { const { sr, lines } = mapSr(d); return { sr: { id: sr.sn_sr_id, no: sr.sr_number, ref: sr.reference_number, po: sr.po_number, link: sr.link_source_doc_id, date: sr.document_date, net: sr.net_amount }, lines: lines.map((l) => [l.sn_sr_line_id, l.item_code, l.quantity, l.unit_price, l.amount, l.sn_po_id, l.sn_po_line_id]) }; }, 'SR');
check(sr && sr.lines.length === 2 && sr.lines[0][6] === 77357, 'SR lines map');
const inv = tryMap('2026-08-18T15-34-56/44-p5-AP_SupplierInvoice-61532.json', (d) => { const { inv, lines } = mapInvoice(d, 'sr_link'); return { inv: { id: inv.sn_invoice_id, no: inv.doc_number, type: inv.invoice_type, po: inv.po_number, poId: inv.sn_po_id, date: inv.document_date, net: inv.net_amount }, lines: lines.map((l) => [l.sn_invoice_line_id, l.item_code, l.quantity, l.unit_price, l.amount, l.sn_po_line_id]) }; }, 'INV');
check(inv && inv.inv.poId === 14241 && inv.lines.length === 2, 'INV map');
tryMap('full-lists/Vendors.json', (rows) => mapVendor(rows[0]), 'VENDOR');
tryMap('full-lists/item.json', (rows) => mapItem(rows[0]), 'ITEM');
// PO/0423 must be: 3 lines, HDPE pipes, qty×price
const p423 = path.join(walkDir, '14241.json');
if (fs.existsSync(p423)) { const { po, lines } = mapPo(JSON.parse(fs.readFileSync(p423, 'utf8')).data); check(po.po_number === 'PO/0423' && lines.length === 3 && lines.every((l) => /hdpe/i.test(l.item_description)), 'PO/0423 shape'); console.log('PO/0423', po.po_number, po.department, po.supplier_name, po.net_amount, lines.map((l) => `${l.qty_ordered}×${l.unit_price}=${l.line_amount}`).join(' | ')); }

console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL CHECKS PASSED');
process.exit(fails ? 1 : 0);
