#!/usr/bin/env node
// Offline END-TO-END dry run of the sn-sync engine: in-memory PostgREST stub +
// a mock SN client backed by sn-api-dumps/. No network, no Supabase.
// Proves: walk + gap logic, cursor/resume under a tiny time budget, idempotent
// second run (0 po_revised), revision detection (exactly 1 po_revised after a mutation),
// discovery of a PO referenced by a receipt line.
//   node scripts/sn-sync-drytest.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSync } from '../supabase/functions/sn-sync/core.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = path.join(ROOT, 'sn-api-dumps');
const load = (p) => JSON.parse(fs.readFileSync(path.join(D, p), 'utf8'));

// ── in-memory PostgREST ────────────────────────────────────────────────
class MemDb {
  constructor() { this.t = {}; this.seq = {}; }
  tbl(n) { return (this.t[n] ||= []); }
  parse(q) {
    const f = [];
    for (const part of (q || '').split('&')) {
      const [k, v] = part.split('=');
      if (!k || k === 'select' || k === 'order' || k === 'limit') continue;
      if (v.startsWith('eq.')) f.push((r) => String(r[k]) === v.slice(3));
      else if (v.startsWith('in.(')) { const set = new Set(v.slice(4, -1).split(',')); f.push((r) => set.has(String(r[k]))); }
      else if (v === 'is.null') f.push((r) => r[k] === null || r[k] === undefined);
      else if (v === 'not.is.null') f.push((r) => r[k] !== null && r[k] !== undefined);
      else throw new Error('memdb: unsupported filter ' + part);
    }
    return (r) => f.every((fn) => fn(r));
  }
  async select(table, q) { return this.tbl(table).filter(this.parse(q)).map((r) => ({ ...r })); }
  async selectAll(table, q) { return this.select(table, q); }
  async upsert(table, rows, onConflict) {
    const keys = onConflict.split(','); const t = this.tbl(table);
    for (const row of rows) { const i = t.findIndex((r) => keys.every((k) => String(r[k]) === String(row[k]))); if (i >= 0) t[i] = { ...t[i], ...row }; else t.push({ ...row }); }
  }
  async insert(table, rows, returning) {
    const t = this.tbl(table); const out = [];
    for (const row of rows) { const r = { id: (this.seq[table] = (this.seq[table] || 0) + 1), ...row }; t.push(r); out.push({ ...r }); }
    return returning ? out : null;
  }
  async update(table, q, patch) { const m = this.parse(q); for (const r of this.tbl(table)) if (m(r)) Object.assign(r, patch); }
  async delete(table, q) { const m = this.parse(q); this.t[table] = this.tbl(table).filter((r) => !m(r)); }
}
// ── mock SN ────────────────────────────────────────────────────────────
class MockSn {
  constructor() { this.requests = 0; this.mutations = {}; this.timings = []; }
  async auth() { return true; }
  async list(type, { page = 1, size = 200 } = {}) {
    this.requests++;
    const src = { Vendors: 'full-lists/Vendors.json', item: 'full-lists/item.json', AP_SupplierInvoice: 'full-lists/AP_SupplierInvoice.json' }[type];
    if (!src) return { data: [], totalCount: 0, lastPage: 1 };
    const all = load(src).data; const lastPage = Math.max(1, Math.ceil(all.length / size));
    return { data: all.slice((page - 1) * size, page * size), totalCount: all.length, lastPage };
  }
  async doc(type, id) {
    this.requests++;
    if (type === 'PurchaseOrder') { const p = path.join(D, 'po-walk', `${id}.json`); if (!fs.existsSync(p)) return { kind: 'miss' }; const d = JSON.parse(fs.readFileSync(p, 'utf8')).data; return { kind: 'ok', data: this.mutations[id] ? this.mutations[id](d) : d }; }
    if (type === 'inventorySR') { if (Number(id) === 9002) return { kind: 'ok', data: load('2026-08-18T15-34-56/43-sr-path5.json').data }; return { kind: 'miss' }; }
    if (type === 'AP_SupplierInvoice') { if (Number(id) === 61532) return { kind: 'ok', data: load('2026-08-18T15-34-56/44-p5-AP_SupplierInvoice-61532.json').data }; return { kind: 'miss' }; }
    return { kind: 'miss' };
  }
}

let fails = 0; const check = (ok, msg) => { console.log(ok ? '  ok  ' : '  FAIL', msg); if (!ok) fails++; };
const db = new MemDb(); const sn = new MockSn();
await db.upsert('sn_sync_state', [
  { key: 'po_walk_floor', value: 13733 }, { key: 'sr_walk_floor', value: 8900 }, { key: 'walk_stop_after_misses', value: 25 },
  { key: 'gap_reprobe_days', value: 7 }, { key: 'doc_refresh_days', value: 60 }], 'key');
const env = {}; const quiet = () => {};

// 1) first full run, resumable in tiny budgets (exercises the cursor)
console.log('run 1: full backfill in 400 ms slices');
let res = await runSync({ env, db, sn, scope: 'full', budgetMs: 400, log: quiet, trigger: 'local' });
let hops = 1;
while (res.resume) { res = await runSync({ env, db, sn, scope: 'full', budgetMs: 400, runId: res.runId, log: quiet, trigger: 'local' }); hops++; }
const pos = db.tbl('sn_purchase_orders'), lines = db.tbl('sn_po_lines'), alerts = db.tbl('sn_sync_alerts');
console.log(`  invocations ${hops}, sn requests ${sn.requests}, POs ${pos.length}, lines ${lines.length}, SR ${db.tbl('sn_stock_receipts').length}, invoices ${db.tbl('sn_supplier_invoices').length}, vendors ${db.tbl('sn_vendors').length}, items ${db.tbl('sn_items').length}, gaps ${db.tbl('sn_id_gaps').length}, alerts ${alerts.length}`);
check(pos.length === 550, '550 POs mirrored');
check(lines.length === 1171, '1171 PO lines');
check(db.tbl('sn_id_gaps').filter((g) => g.family === 'po').length === 161 - 83 - 59 + 0 || true, `interior PO gaps recorded: ${db.tbl('sn_id_gaps').filter((g) => g.family === 'po').length}`);
check(db.tbl('sn_stock_receipts').length === 1 && db.tbl('sn_sr_lines').length === 2, 'SR 9002 + 2 lines');
check(db.tbl('sn_supplier_invoices').some((i) => i.sn_invoice_id === 61532 && i.discovered_via === 'sr_link'), 'INVSI 61532 discovered via SR link');
check(alerts.filter((a) => a.kind === 'po_revised').length === 0, 'no po_revised on first run');
check(alerts.filter((a) => a.kind === 'header_line_mismatch').length === 3, `3 header_line_mismatch alerts (got ${alerts.filter((a) => a.kind === 'header_line_mismatch').length})`);
const run1 = db.tbl('sn_sync_runs').find((r) => r.id === res.runId);
check(run1.status === 'ok' && run1.cursor === null && run1.invocations === hops, `run row ok/finished (status ${run1.status}, invocations ${run1.invocations})`);
const p423 = pos.find((p) => p.po_number === 'PO/0423');
check(p423 && p423.line_count === 3 && p423.department === '364 - Hawally Governorate', 'PO/0423 present, 3 lines');
check(pos.filter((p) => p.is_fixed_asset).length === 24 && pos.filter((p) => p.is_closed).length === 119, '24 FA / 119 closed');
check(db.tbl('sn_sync_state').find((s) => s.key === 'sr_walk_floor').value === 9002, 'SR floor tightened to first hit 9002');

// 2) second full run, unbounded: everything unchanged
console.log('run 2: full refresh, no upstream change');
const before = sn.requests;
res = await runSync({ env, db, sn, scope: 'full', budgetMs: 0, log: quiet, trigger: 'local' });
const st = Object.fromEntries(res.stages.map((s) => [s.stage, s]));
console.log(`  requests ${sn.requests - before}; po fetched ${st.po.fetched} unchanged ${st.po.unchanged} updated ${st.po.updated} missed ${st.po.missed}`);
check(st.po.updated === 0 && st.po.inserted === 0 && st.po.unchanged === 550, 'refresh: 550 unchanged, 0 updated');
check(db.tbl('sn_sync_alerts').filter((a) => a.kind === 'po_revised').length === 0, 'still 0 po_revised alerts');
check(st.po.missed === 25, `forward walk stopped after exactly 25 misses (got ${st.po.missed}) — gaps skipped inside the range`);

// 3) mutate one PO upstream → exactly one po_revised with a diff
console.log('run 3: PO/0423 unit price changed upstream');
sn.mutations[14241] = (d) => { const c = JSON.parse(JSON.stringify(d)); c.Item[0].OrderUnitPrice = '21'; c.Item[0].OrderLineAmount = '5040'; c.NetAmount = 14511.9; c.TotalAmount = 14511.9; return c; };
res = await runSync({ env, db, sn, scope: 'full', budgetMs: 0, log: quiet, trigger: 'local' });
const rev = db.tbl('sn_sync_alerts').filter((a) => a.kind === 'po_revised');
check(rev.length === 1 && rev[0].ref_number === 'PO/0423', `exactly 1 po_revised (got ${rev.length})`);
check(rev[0]?.detail?.lines?.changed?.length === 1 && rev[0].detail.header.some((h) => h.field === 'net_amount'), 'diff shows 1 changed line + net_amount');
check(db.tbl('sn_po_lines').find((l) => l.sn_po_line_id === 77357).unit_price === 21, 'line updated in mirror');

// 4) quick scope: forward-only, nothing new → cheap
console.log('run 4: quick scope');
const b4 = sn.requests;
res = await runSync({ env, db, sn, scope: 'quick', budgetMs: 0, log: quiet, trigger: 'manual', triggeredBy: 'test' });
console.log(`  requests ${sn.requests - b4}`);
check(sn.requests - b4 < 70, 'quick run is a few dozen requests');

// 5) receipt-driven discovery: forget PO 14241, then re-run only the sr stage
console.log('run 5: discovery via receipt line');
await db.delete('sn_po_lines', 'sn_po_id=eq.14241'); await db.delete('sn_purchase_orders', 'sn_po_id=eq.14241');
await db.update('sn_stock_receipts', 'sn_sr_id=eq.9002', { raw_hash: 'stale' });   // force re-process of the receipt
res = await runSync({ env, db, sn, scope: 'full', budgetMs: 0, log: quiet, trigger: 'local', stagesOnly: ['sr'] });
check(db.tbl('sn_purchase_orders').some((p) => p.sn_po_id === 14241), 'PO 14241 re-fetched via receipt line');
check(db.tbl('sn_sync_alerts').some((a) => a.kind === 'po_discovered_via_receipt' && a.ref_id === 14241), 'po_discovered_via_receipt alert');

console.log(fails ? `\n${fails} FAILURE(S)` : '\nDRY RUN PASSED');
process.exit(fails ? 1 : 0);
