// ═══════════════════════════════════════════════════════════════════════
// sn-sync core — SpectroNova → Supabase read mirror engine
//
// Dependency-free ES module (native fetch + WebCrypto) so the SAME file runs
// as a Supabase Edge Function (Deno, ./index.ts) and locally under Node ≥ 18
// (scripts/sn-sync-local.mjs). Never writes to SpectroNova: only POST to the
// three documented read endpoints. Never logs credentials or the token.
//
// Population facts this engine is built on (SN_SYNC_INVESTIGATION.md):
//   • PurchaseOrder / inventorySR list viewers are pinned to the API user's
//     current SN department → documents are fetched BY ID (Path 5) over a
//     dense integer sequence. Definitive miss = "does not exists" message.
//   • AP_SupplierInvoice list = SupInv/* only (all departments); PO-linked
//     INVSI/* invoices are discovered from stock-receipt LinkSourceDocID.
//   • Change detection = SHA-256 of a canonical projection of the TYPED
//     columns + sorted lines (raw payload has volatile fields).
//   • Edge invocations are time-boxed → the run is resumable via
//     sn_sync_runs.cursor; call runSync again with the same runId.
// ═══════════════════════════════════════════════════════════════════════

export const SN_BASE = 'https://workflow.spectronovasoft.com/webhook';
const DEFAULT_MIN_GAP_MS = 350;      // polite: sequential, ~2–3 req/s max
const BATCH = 200;                   // PostgREST upsert batch size
const REQUEST_TIMEOUT_MS = 45_000;   // a stalled socket becomes an error/retry, never a hang (Node fetch has no default timeout)

// ───────────────────────────── normalizers ─────────────────────────────
export const strip = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') return v;
  const s = v.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim();
  return s;
};
export const str = (v) => { const s = strip(v); return s === null || s === undefined ? '' : String(s); };
export const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(strip(v)).replace(/,/g, '').trim();
  if (s === '' || s.toLowerCase() === 'null') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
export const int = (v) => { const n = num(v); return n === null ? null : Math.trunc(n); };
export const bool = (v) => { const s = str(v).toLowerCase(); return s === 'true' || s === '1' || s === 'y' || s === 'yes'; };
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n, w = 2) => String(n).padStart(w, '0');
/** Any SN date string → 'YYYY-MM-DDTHH:mm:ss' (no zone; SN times are Kuwait local) or null. */
export const dateTime = (v) => {
  const s = str(v); if (!s) return null;
  let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?/))) return `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? '00'}:${m[5] ?? '00'}:${m[6] ?? '00'}`;
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/))) return `${m[3]}-${pad(m[2])}-${pad(m[1])}T${pad(m[4] ?? 0)}:${m[5] ?? '00'}:${m[6] ?? '00'}`;
  if ((m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/))) { const mo = MONTHS[m[2].toLowerCase()]; if (mo) return `${m[3]}-${pad(mo)}-${pad(m[1])}T00:00:00`; }
  if ((m = s.match(/^\/Date\((\d+)\)\/$/))) return new Date(Number(m[1])).toISOString().slice(0, 19);
  return null;
};
export const dateOnly = (v) => { const d = dateTime(v); return d ? d.slice(0, 10) : null; };
const money = (v) => { const n = num(v); return n === null ? null : Math.round(n * 1000) / 1000; };  // KWD 3 dp
const qty = (v) => { const n = num(v); return n === null ? null : Math.round(n * 1e6) / 1e6; };

/** Stable JSON: sorted keys, no undefined, numbers as-is. */
export function canonical(x) {
  if (x === null || x === undefined) return 'null';
  if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
  if (typeof x === 'object') return '{' + Object.keys(x).sort().filter((k) => x[k] !== undefined).map((k) => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}';
  return JSON.stringify(x);
}
export async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();

// ───────────────────────────── SN client ───────────────────────────────
export class SnClient {
  constructor({ email, password, tenantId, log = () => {}, minGapMs = DEFAULT_MIN_GAP_MS }) {
    Object.assign(this, { email, password, tenantId, log, minGapMs, token: null, tenantHeader: null, requests: 0, lastAt: 0, timings: [] });
  }
  async auth() {
    const r = await fetch(`${SN_BASE}/spectro-auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: this.email, password: this.password }), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    const j = await r.json().catch(() => null);
    this.requests++;
    if (!j || j.status !== 'success' || !j.tenantInfo) { const e = new Error(`SN auth failed: ${j?.code || r.status}`); e.code = j?.code || 'AUTH'; throw e; }
    this.token = j.token || null; this.tenantHeader = JSON.stringify(j.tenantInfo);
    this.log(`sn auth ok (token ${this.token ? 'present' : 'absent'})`);
    return true;
  }
  async _post(path, body) {
    const wait = this.lastAt + this.minGapMs - Date.now(); if (wait > 0) await sleep(wait);
    const headers = { 'Content-Type': 'application/json', 'x-tenant': this.tenantHeader };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;   // built to spec even though not enforced today
    const t0 = Date.now();
    let res, text;
    try { res = await fetch(`${SN_BASE}${path}?tenantid=${encodeURIComponent(this.tenantId)}`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }); text = await res.text(); }
    finally { this.lastAt = Date.now(); this.requests++; this.timings.push(this.lastAt - t0); }
    let json = null; try { json = JSON.parse(text); } catch { /* non-JSON */ }
    return { http: res.status, json, text };
  }
  /** Path 3 page. Throws on transient failure after retries. */
  async list(type, { clause = '', page = 1, size = 200 } = {}, retries = 2) {
    let lastErr;
    for (let a = 0; a <= retries; a++) {
      try {
        const r = await this._post('/spectro-tabledata', { DocumentType: type, Clause: clause, page, size });
        if (r.json?.status === 'success') return { data: Array.isArray(r.json.data) ? r.json.data : [], totalCount: num(r.json.totalCount), lastPage: int(r.json.last_page) };
        lastErr = new Error(`list ${type} p${page}: ${r.json?.code || r.http} ${String(r.json?.message || r.text).slice(0, 160)}`);
      } catch (e) { lastErr = e; }
      await sleep(1500 * (a + 1));
    }
    throw lastErr;
  }
  /** Path 5. → {kind:'ok',data} | {kind:'miss'} | {kind:'error',message}.
   *  A definitive miss ("The document X/id does not exists") is returned at once — the
   *  message is unambiguous, so no retries are spent on it. Anything else (network,
   *  non-JSON, other error text) is retried twice with backoff and, if it still
   *  fails, reported as 'error' — never as a gap. */
  async doc(type, id, retries = 2) {
    let last = { kind: 'error', message: 'no attempt' };
    for (let a = 0; a <= retries; a++) {
      try {
        const r = await this._post('/spectro-documentdata', { DocumentType: type, DocumentId: id });
        if (r.json?.status === 'success' && r.json.data && typeof r.json.data === 'object') return { kind: 'ok', data: r.json.data };
        const msg = String(r.json?.message || r.text || '');
        if (/does\+not\+exists|does not exists?/i.test(msg)) return { kind: 'miss' };
        last = { kind: 'error', message: `${r.json?.code || r.http}: ${msg.slice(0, 200)}` };
      } catch (e) { last = { kind: 'error', message: String(e?.message || e) }; }
      await sleep(/fetch failed|timeout|abort|ECONN|socket/i.test(last.message || '') ? 5000 * (a + 1) : 1500 * (a + 1));
    }
    return last;
  }
}

// ───────────────────────────── Supabase (PostgREST) ─────────────────────
export class Db {
  constructor(url, serviceKey) { this.url = url.replace(/\/$/, ''); this.key = serviceKey; }
  _h(extra = {}) { return { apikey: this.key, Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json', ...extra }; }
  async _req(method, path, body, extra) {
    for (let a = 0; ; a++) {
      try { return await this._req1(method, path, body, extra); }
      catch (e) { if (a >= 5 || !/timeout|abort|fetch failed|ECONN|network|socket|EAI_AGAIN/i.test(String(e?.message || e))) throw e; await sleep(Math.min(30_000, 3000 * 2 ** a)); }
    }
  }
  async _req1(method, path, body, extra) {
    const r = await fetch(`${this.url}/rest/v1/${path}`, { method, headers: this._h(extra), body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    const text = await r.text();
    if (!r.ok) throw new Error(`db ${method} ${path.split('?')[0]} → ${r.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  }
  async select(table, query) { return this._req('GET', `${table}?${query}`); }
  /** All rows, paged by 1000. */
  async selectAll(table, query) {
    const out = []; let from = 0;
    for (;;) {
      const rows = await this._req('GET', `${table}?${query}`, undefined, { Range: `${from}-${from + 999}`, 'Range-Unit': 'items' });
      out.push(...rows); if (rows.length < 1000) break; from += 1000;
    }
    return out;
  }
  async upsert(table, rows, onConflict) {
    for (let i = 0; i < rows.length; i += BATCH) {
      await this._req('POST', `${table}?on_conflict=${onConflict}`, rows.slice(i, i + BATCH), { Prefer: 'resolution=merge-duplicates,return=minimal' });
    }
  }
  async insert(table, rows, returning = false) {
    const out = [];
    for (let i = 0; i < rows.length; i += BATCH) {
      const r = await this._req('POST', table, rows.slice(i, i + BATCH), { Prefer: returning ? 'return=representation' : 'return=minimal' });
      if (returning && r) out.push(...r);
    }
    return out;
  }
  async update(table, filter, patch) { return this._req('PATCH', `${table}?${filter}`, patch, { Prefer: 'return=minimal' }); }
  async delete(table, filter) { return this._req('DELETE', `${table}?${filter}`, undefined, { Prefer: 'return=minimal' }); }
  async rpc(fn, args) { return this._req('POST', `rpc/${fn}`, args ?? {}); }
}
const inList = (ids) => `in.(${ids.join(',')})`;

// ───────────────────────────── mappers ─────────────────────────────────
export function mapVendor(r) {
  return {
    contact_directory_id: int(r.ContactDirectoryID ?? r.tableid),
    company_name: str(r.CompanyName), type_description: str(r.TypeDescription),
    contact_type_id: int(r.ContactDirectoryTypeID), ar_account_code: str(r.AR_AcccountCode) || null,
    raw: r,
  };
}
export function mapItem(r) {
  return {
    item_id: int(r.ItemID ?? r.tableid), item_code: str(r.ItemCode), description: str(r.ItemDescription),
    uom: str(r.UOMCode), unit_price: qty(r.UnitPrice), item_family_code: str(r.ItemFamilyCode),
    item_type_id: int(r.ItemTypeID), gl_code: str(r.GLCode) || null, status_code: str(r.ItemStatusCode), raw: r,
  };
}
export function mapPo(d) {
  const poNumber = str(d.PurchaseOrderNumber || d.DocumentNumber);
  const lines = (Array.isArray(d.Item) ? d.Item : []).map((l) => ({
    sn_po_line_id: int(l.PurchaseOrderLineID ?? l.tableid), sn_po_id: int(d.PurchaseOrderID),
    order_line_number: int(l.OrderLineNumber), item_id: int(l.ItemID),
    item_description: str(l.ItemDescription), remarks: str(l.Remarks), uom: str(l.UOMCode),
    qty_ordered: qty(l.QuantityOrdered), unit_price: qty(l.OrderUnitPrice), discount: qty(l.OrderLineDiscount),
    line_amount: money(l.OrderLineAmount), purchase_type: str(l.PurchaseType), location_code: str(l.LocationCode),
    cost_code: str(l.CostCode), contract_id: int(l.ContractID), workflow_document_detail_id: int(l.WorkflowDocumentDetailID), raw: l,
  })).filter((l) => l.sn_po_line_id !== null).sort((a, b) => a.sn_po_line_id - b.sn_po_line_id);
  const linesAmount = lines.reduce((s, l) => s + (l.line_amount ?? 0), 0);
  const po = {
    sn_po_id: int(d.PurchaseOrderID), po_number: poNumber,
    is_fixed_asset: /^PO\/FA\//i.test(poNumber) || int(d.OrderTypeID) === 5,
    order_type: str(d.OrderType), order_type_id: int(d.OrderTypeID),
    is_closed: str(d.WorkflowStatusCode).toUpperCase() === 'C', workflow_status_code: str(d.WorkflowStatusCode) || null,
    workflow_status_remarks: str(d.WorkflowStatusRemarks), posted_status: str(d.PostedStatus),
    supplier_contact_id: int(d.ToContactDirectoryID), supplier_name: str(d.ToCompany),
    department: str(d.FromCompany), from_contact_id: int(d.FromContactDirectoryID),
    contract_id: int(d.ContractID), contract_name: str(d.ContractName), contract_short_name: str(d.ContractShortName),
    obs_code: str(d.OBSCode), location_code: str(d.LocationCode),
    document_date: dateTime(d.DocumentDate), po_date: dateOnly(d.DocumentDate) || dateOnly(d.PODATE),
    order_due_date: dateOnly(d.OrderDueDate), currency_code: str(d.CurrencyCode) || 'KWD', exchange_rate: num(d.ExchangeRate),
    payment_term_id: int(d.PaymentTermID), payment_terms: str(d.PaymentTermDescription),
    subject: str(d.Subject), description: str(d.Description), remarks: str(d.Remarks),
    net_amount: money(d.NetAmount), total_amount: money(d.TotalAmount), total_quantity: qty(d.TotalQuantity),
    gross_discount_amount: money(d.GrossDiscountAmount), revision_number: int(d.RevisionNumber),
    link_source_doc_type: str(d.LinkSourceDocType), link_source_doc_id: int(d.LinkSourceDocID),
    created_by_name: str(d.CreatedByName), created_on: dateTime(d.CreatedOn), posted_on: dateTime(d.PostedOn),
    line_count: lines.length, lines_amount: money(linesAmount), raw: d,
  };
  return { po, lines };
}
export function mapSr(d) {
  const lines = (Array.isArray(d.Items) ? d.Items : []).map((l) => ({
    sn_sr_line_id: int(l.StockItemTransferDetailID ?? l.tableid), sn_sr_id: int(d.StockItemTransferID),
    line_number: int(l.LineNumber), item_id: int(l.ItemID), item_code: str(l.ItemCode || l.Item_ItemCode),
    description: str(l.Description || l.Item_ItemDescription), uom: str(l.UOMCode),
    quantity: qty(l.Quantity), unit_price: qty(l.UnitPriceFC), amount: money(l.AmountFC ?? l.LineAmount),
    sn_po_id: int(l.PurchaseOrderID), sn_po_line_id: int(l.PurchaseOrderLineID), order_line_number: int(l.OrderLineNumber),
    is_closed_flag: str(l.IsClosed), location_code: str(l.LocationCode), raw: l,
  })).filter((l) => l.sn_sr_line_id !== null).sort((a, b) => a.sn_sr_line_id - b.sn_sr_line_id);
  const sr = {
    sn_sr_id: int(d.StockItemTransferID), sr_number: str(d.DocumentNumber || d.StockNumber), reference_number: str(d.ReferenceNumber || d.TIDocNumber),
    sr_type: str(d.Type), document_date: dateOnly(d.DocumentDate),
    supplier_contact_id: int(d.FromContactDirectoryID), supplier_name: str(d.FromCompany), department: str(d.ToCompany),
    contract_id: int(d.ContractID), po_number: str(d.PurchaseOrderNumber),
    link_source_name: str(d.LinkSourceName), link_source_doc_id: int(d.LinkSourceDocID ?? d.DefaultPurchaseOrderID),
    posted_status: str(d.PostedStatus), net_amount: money(d.NetAmount), location_code: str(d.LocationCode),
    line_count: lines.length, raw: d,
  };
  return { sr, lines };
}
export function mapInvoice(d, discoveredVia = 'list') {
  const lines = (Array.isArray(d.Items) ? d.Items : []).map((l) => ({
    sn_invoice_line_id: int(l.TradingInvoiceDetailID ?? l.tableid), sn_invoice_id: int(d.TradingInvoiceID),
    line_number: int(l.LineNumber), item_id: int(l.ItemID), item_code: str(l.ItemCode), description: str(l.Description || l.itemdescription),
    uom: str(l.UOMCode), quantity: qty(l.Quantity), unit_price: qty(l.UnitPriceFC), amount: money(l.AmountFC),
    sn_po_id: int(l.PurchaseOrderID), sn_po_line_id: int(l.PurchaseOrderLineID), order_line_number: int(l.OrderLineNumber),
    cost_code: str(l.CostCode), raw: l,
  })).filter((l) => l.sn_invoice_line_id !== null).sort((a, b) => a.sn_invoice_line_id - b.sn_invoice_line_id);
  const inv = {
    sn_invoice_id: int(d.TradingInvoiceID ?? d.tableid), doc_number: str(d.DocumentNumber || d.DocNumber), invoice_type: str(d.Type),
    document_date: dateOnly(d.DocumentDate), supplier_contact_id: int(d.FromContactDirectoryID), supplier_name: str(d.FromCompany),
    department: str(d.ToCompany), contract_id: int(d.ContractID), po_number: str(d.PurchaseOrderNumber), sn_po_id: int(d.DefaultPurchaseOrderID),
    reference_invoice_number: str(d.ReferenceInvoiceNumber), reference_invoice_date: dateOnly(d.ReferenceInvoiceDate),
    net_amount: money(d.NetAmount), total_amount: money(d.TotalAmount), posted_status: str(d.PostedStatus),
    currency_code: str(d.CurrencyCode) || 'KWD', link_source_name: str(d.LinkSourceName), link_source_doc_id: int(d.LinkSourceDocID),
    discovered_via: discoveredVia, line_count: lines.length, raw: d,
  };
  return { inv, lines };
}
/** Hash over typed columns (raw + bookkeeping excluded) + typed lines. Deterministic. */
export async function hashDoc(header, lines) {
  const h = { ...header }; delete h.raw; delete h.raw_hash; delete h.first_seen_at; delete h.last_fetched_at; delete h.changed_at; delete h.discovered_via;
  const ls = (lines || []).map((l) => { const c = { ...l }; delete c.raw; return c; });
  return sha256(canonical({ h, ls }));
}
const HEADER_DIFF_SKIP = new Set(['raw', 'raw_hash', 'first_seen_at', 'last_fetched_at', 'changed_at', 'discovered_via', 'line_count', 'lines_amount']);
/** Compare a DB row (PostgREST JSON) with a freshly mapped row: timestamps are
 *  compared on their first 19 chars (zone suffix / fractional seconds stripped),
 *  numeric strings as numbers, ''/null as equal. */
const cmpNorm = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) return v.slice(0, 19);
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
};
export function diffTyped(oldRow, newRow) {
  const out = [];
  for (const k of Object.keys(newRow)) {
    if (HEADER_DIFF_SKIP.has(k)) continue;
    const a = cmpNorm(oldRow?.[k]), b = cmpNorm(newRow[k]);
    if (canonical(a) !== canonical(b)) out.push({ field: k, old: oldRow?.[k] ?? null, new: newRow[k] ?? null });
  }
  return out;
}
export function diffLines(oldLines, newLines, key) {
  const om = new Map(oldLines.map((l) => [l[key], l])), nm = new Map(newLines.map((l) => [l[key], l]));
  const added = [...nm.keys()].filter((k) => !om.has(k)), removed = [...om.keys()].filter((k) => !nm.has(k));
  const changed = [];
  for (const [k, n] of nm) { const o = om.get(k); if (!o) continue; const d = diffTyped(o, n); if (d.length) changed.push({ id: k, changes: d }); }
  return { added, removed, changed };
}

// ───────────────────────────── engine ──────────────────────────────────
/**
 * runSync(opts) → { runId, resume:boolean, summary }
 * opts.env: SN_API_EMAIL, SN_API_PASSWORD, SN_TENANT_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * opts.scope: 'full' (nightly: masters + full walks/refresh + invoices) | 'quick' (button: forward walks + new docs)
 * opts.runId: resume an existing run (cursor in sn_sync_runs)
 * opts.budgetMs: 0 = unbounded (local); edge passes ~100000
 * opts.stagesOnly: optional array to restrict stages (local testing)
 */
export async function runSync(opts) {
  const { env, trigger = 'local', triggeredBy = '', scope = 'full', budgetMs = 0, log = () => {}, stagesOnly = null } = opts;
  const need = ['SN_API_EMAIL', 'SN_API_PASSWORD', 'SN_TENANT_ID', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  if (!opts.db || !opts.sn) for (const k of need) if (!env[k]) throw new Error(`missing env ${k}`);
  const started = Date.now();
  const deadline = budgetMs > 0 ? started + budgetMs : Infinity;
  const db = opts.db || new Db(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);      // injectable for offline tests
  const sn = opts.sn || new SnClient({ email: env.SN_API_EMAIL, password: env.SN_API_PASSWORD, tenantId: env.SN_TENANT_ID, log });

  // state
  const stateRows = await db.selectAll('sn_sync_state', 'select=key,value');
  const state = Object.fromEntries(stateRows.map((r) => [r.key, r.value]));
  const setState = async (key, value) => { state[key] = value; await db.upsert('sn_sync_state', [{ key, value, updated_at: nowIso() }], 'key'); };
  const cfg = {
    poFloor: int(state.po_walk_floor) ?? 13733,
    srFloor: int(state.sr_walk_floor) ?? 4300,
    stopAfter: int(state.walk_stop_after_misses) ?? 25,
    gapReprobeDays: int(state.gap_reprobe_days) ?? 7,
    docRefreshDays: int(state.doc_refresh_days) ?? 60,
  };

  // run row (new or resumed)
  let run;
  if (opts.runId) {
    const rows = await db.select('sn_sync_runs', `id=eq.${opts.runId}&select=*`);
    run = rows[0]; if (!run) throw new Error(`run ${opts.runId} not found`);
    await db.update('sn_sync_runs', `id=eq.${run.id}`, { invocations: (run.invocations || 1) + 1 });
  } else {
    [run] = await db.insert('sn_sync_runs', [{ trigger, triggered_by: triggeredBy, scope, status: 'running', cursor: { stage: 'masters' } }], true);
  }
  const cursor = run.cursor || { stage: 'masters' };
  const stages = Array.isArray(run.stages) ? run.stages : [];
  const errors = [];
  const ctx = { db, sn, state, setState, cfg, run, cursor, scope, log, errors, alerts: [], timeUp: () => Date.now() > deadline };
  const stageRec = (name) => { let s = stages.find((x) => x.stage === name); if (!s) { s = { stage: name, ms: 0, requests: 0, fetched: 0, inserted: 0, updated: 0, unchanged: 0, missed: 0, errors: 0, note: '' }; stages.push(s); } return s; };
  const persist = async (extra = {}) => {
    await db.update('sn_sync_runs', `id=eq.${run.id}`, { cursor: ctx.cursor, stages, requests: (run.requests || 0) + sn.requests, ...extra });
  };
  const flushAlerts = async () => {
    if (!ctx.alerts.length) return;
    await db.insert('sn_sync_alerts', ctx.alerts.map((a) => ({ run_id: run.id, ...a })));
    ctx.alerts = [];
  };

  const ORDER = ['masters', 'po', 'sr', 'invoices'];
  const enabled = (s) => !stagesOnly || stagesOnly.includes(s);
  let resume = false;
  try {
    await sn.auth();
    let idx = Math.max(0, ORDER.indexOf(ctx.cursor.stage || 'masters'));
    for (; idx < ORDER.length; idx++) {
      const name = ORDER[idx];
      if (!enabled(name) || (scope === 'quick' && name === 'masters')) { ctx.cursor = { stage: ORDER[idx + 1] || 'done' }; continue; }
      const rec = stageRec(name);
      const t0 = Date.now(), r0 = sn.requests;
      const fn = { masters: stageMasters, po: stagePo, sr: stageSr, invoices: stageInvoices }[name];
      const res = await fn(ctx, rec);
      rec.ms += Date.now() - t0; rec.requests += sn.requests - r0;
      await flushAlerts();
      if (!res.done) { resume = true; ctx.cursor = { stage: name, ...res.cursor }; await persist(); break; }
      ctx.cursor = { stage: ORDER[idx + 1] || 'done' };
      await persist();
    }
    if (!resume) {
      const status = errors.length ? 'partial' : 'ok';
      await persist({ status, finished_at: nowIso(), error: errors.slice(0, 20).join('\n'), cursor: null });
    }
  } catch (e) {
    const msg = String(e?.message || e);
    log(`RUN ERROR: ${msg}`);
    ctx.alerts.push({ kind: e?.code === 'UNAUTHORIZED' || /auth failed/i.test(msg) ? 'auth_failed' : 'stage_error', detail: { message: msg, stage: ctx.cursor?.stage } });
    await flushAlerts().catch(() => {});
    await persist({ status: 'error', finished_at: nowIso(), error: msg }).catch(() => {});
    throw e;
  }
  return { runId: run.id, resume, cursor: ctx.cursor, stages, requests: sn.requests, elapsedMs: Date.now() - started, errors };
}

// ── stage: masters ─────────────────────────────────────────────────────
async function stageMasters(ctx, rec) {
  const { sn, db, log } = ctx;
  for (const [type, table, pk, map] of [['Vendors', 'sn_vendors', 'contact_directory_id', mapVendor], ['item', 'sn_items', 'item_id', mapItem]]) {
    const rows = [];
    for (let page = 1; ; page++) { const p = await sn.list(type, { page, size: 200 }); rows.push(...p.data); if (!p.lastPage || page >= p.lastPage || p.data.length === 0) break; }
    const known = new Map((await db.selectAll(table, `select=${pk},raw_hash,first_seen_at,changed_at`)).map((r) => [String(r[pk]), r]));
    const out = []; let ins = 0, upd = 0, same = 0;
    for (const r of rows) {
      const m = map(r); if (m[pk] === null || m[pk] === undefined) { rec.errors++; ctx.alerts.push({ kind: 'parse_failure', ref_type: table, detail: { row: r } }); continue; }
      m.raw_hash = await hashDoc(m, []); m.last_fetched_at = nowIso();
      const k = known.get(String(m[pk]));
      if (!k) { m.first_seen_at = m.last_fetched_at; ins++; }
      else if (k.raw_hash === m.raw_hash) { same++; m.first_seen_at = k.first_seen_at; m.changed_at = k.changed_at; }
      else { upd++; m.first_seen_at = k.first_seen_at; m.changed_at = m.last_fetched_at; }
      out.push(m);
    }
    await db.upsert(table, out, pk);
    rec.fetched += rows.length; rec.inserted += ins; rec.updated += upd; rec.unchanged += same;
    log(`masters ${type}: ${rows.length} rows (+${ins} ~${upd} =${same})`);
  }
  return { done: true };
}

// ── generic id walker (PO + SR) ────────────────────────────────────────
/**
 * Walk [floor .. maxKnown] (refresh known / fetch unknown / skip fresh gaps),
 * then forward from maxKnown+1 until `stopAfter` consecutive misses.
 * Resumable via cur = {phase:'range'|'forward', nextId, misses, pending:[], firstHit, maxSeen}
 */
async function walkIds(ctx, rec, family, opts) {
  const { sn, db, cfg, log } = ctx;
  const { docType, table, pk, floor, shouldRefresh, process } = opts;
  const cur = ctx.cursor.stage === family && ctx.cursor.phase ? ctx.cursor : null;
  const known = new Map((await db.selectAll(table, `select=${pk},raw_hash,first_seen_at,changed_at${opts.extraKnownCols ? ',' + opts.extraKnownCols : ''}`)).map((r) => [Number(r[pk]), r]));
  const gapRows = await db.selectAll('sn_id_gaps', `family=eq.${family}&resolved_at=is.null&select=sn_id,last_probed_at,probes`);
  const gaps = new Map(gapRows.map((g) => [Number(g.sn_id), g]));
  const maxKnown = known.size ? Math.max(...known.keys()) : floor - 1;
  const lastReprobe = ctx.state[`${family}_gaps_last_reprobe_at`] ? Date.parse(ctx.state[`${family}_gaps_last_reprobe_at`]) : 0;
  const reprobeDue = Date.now() - lastReprobe > cfg.gapReprobeDays * 86400e3;
  const st = cur ? { ...cur } : { phase: ctx.scope === 'quick' ? 'forward' : 'range', nextId: ctx.scope === 'quick' ? maxKnown + 1 : floor, misses: 0, pending: [], firstHit: known.size ? Math.min(...known.keys()) : null, maxSeen: maxKnown, errStreak: 0 };
  const gapUpserts = []; const resolved = [];
  const noteGap = (id) => { const g = gaps.get(id); gapUpserts.push({ family, sn_id: id, first_missed_at: g ? undefined : nowIso(), last_probed_at: nowIso(), probes: (g?.probes || 0) + 1 }); };
  const flushGaps = async () => {
    if (gapUpserts.length) { await db.upsert('sn_id_gaps', gapUpserts.map((g) => { const c = { ...g }; if (c.first_missed_at === undefined) delete c.first_missed_at; return c; }), 'family,sn_id'); gapUpserts.length = 0; }
    if (resolved.length) { await db.update('sn_id_gaps', `family=eq.${family}&sn_id=${inList(resolved)}`, { resolved_at: nowIso() }); resolved.length = 0; }
  };
  const handle = async (id) => {
    const r = await sn.doc(docType, id);
    if (r.kind === 'ok') {
      st.errStreak = 0; st.misses = 0; if (st.firstHit === null || id < st.firstHit) st.firstHit = id; if (id > st.maxSeen) st.maxSeen = id;
      for (const p of st.pending) noteGap(p); st.pending = [];
      if (gaps.has(id)) resolved.push(id);
      await process(r.data, known.get(id));
      rec.fetched++;
      return 'ok';
    }
    if (r.kind === 'miss') { st.errStreak = 0; rec.missed++; return 'miss'; }
    st.errStreak++; rec.errors++; ctx.errors.push(`${family} ${id}: ${r.message}`); log(`${family} ${id} error: ${r.message}`);
    if (st.errStreak === 5) { log(`${family} walk: 5 consecutive errors at id ${id} — pausing 60 s`); await sleep(60_000); }
    if (st.errStreak >= 10) throw new Error(`${family} walk: 10 consecutive errors at id ${id} — ${r.message}`);
    return 'error';
  };
  // phase 1: range
  if (st.phase === 'range') {
    for (let id = st.nextId; id <= maxKnown; id++) {
      st.nextId = id;
      if (ctx.timeUp()) { await flushGaps(); return { done: false, cursor: st }; }
      const k = known.get(id);
      if (k) { if (!shouldRefresh(k) && k.raw_hash !== '') { rec.unchanged++; continue; } }   // '' = interrupted first write → always finish
      else if (gaps.has(id) && !reprobeDue) continue;
      const res = await handle(id);
      if (res === 'miss' && !k) noteGap(id);
      if (gapUpserts.length + resolved.length >= 100) await flushGaps();
    }
    st.phase = 'forward'; st.nextId = maxKnown + 1; st.misses = 0; st.pending = [];
    if (reprobeDue && ctx.scope === 'full') await ctx.setState(`${family}_gaps_last_reprobe_at`, nowIso());
  }
  // phase 2: forward
  for (let id = st.nextId; ; id++) {
    st.nextId = id;
    if (ctx.timeUp()) { await flushGaps(); return { done: false, cursor: st }; }
    const res = await handle(id);
    if (res === 'miss') {
      st.misses++; st.pending.push(id);
      // Before the FIRST hit of a family (bare floor, empty mirror) the trailing-miss rule
      // does not apply — keep searching up to 2,000 ids for the start of the sequence.
      const limit = st.firstHit === null ? 2000 : cfg.stopAfter;
      // never stop below the ceiling (max id seen in the Path 3 list — a document known to exist)
      if (st.misses >= limit && id >= (opts.ceiling || 0)) break;
    }
  }
  await flushGaps();
  if (st.firstHit !== null && st.firstHit > floor) await ctx.setState(`${family}_walk_floor`, st.firstHit);   // tighten a loose floor
  await ctx.setState(`${family}_max_id`, st.maxSeen);
  rec.note = `max id ${st.maxSeen}; forward stopped at ${st.nextId} after ${cfg.stopAfter} misses`;
  return { done: true };
}

// ── PO processing (shared by walk + discovery) ─────────────────────────
async function upsertPo(ctx, data, knownRow, discovery = null) {
  const { db, sn } = ctx;
  const { po, lines } = mapPo(data);
  if (knownRow && knownRow.raw_hash === '') knownRow = null;   // an interrupted first write — finish it silently, no 'revised' alert
  if (po.sn_po_id === null) { ctx.alerts.push({ kind: 'parse_failure', ref_type: 'po', detail: { keys: Object.keys(data).slice(0, 20) } }); return 'error'; }
  po.raw_hash = await hashDoc(po, lines); po.last_fetched_at = nowIso();
  if (!knownRow) {
    const rows = await db.select('sn_purchase_orders', `sn_po_id=eq.${po.sn_po_id}&select=sn_po_id,raw_hash,first_seen_at,changed_at`);
    knownRow = rows[0] || null;
  }
  if (knownRow && knownRow.raw_hash === po.raw_hash) {
    await db.update('sn_purchase_orders', `sn_po_id=eq.${po.sn_po_id}`, { last_fetched_at: po.last_fetched_at });
    return 'same';
  }
  let outcome;
  if (!knownRow) {
    po.first_seen_at = po.last_fetched_at; po.changed_at = null;
    // header WITHOUT hash first (so lines can reference it), lines, then the hash —
    // a kill in between leaves raw_hash='' and the PO is simply re-fetched next run
    await db.upsert('sn_purchase_orders', [{ ...po, raw_hash: '' }], 'sn_po_id');
    await db.delete('sn_po_lines', `sn_po_id=eq.${po.sn_po_id}`);
    if (lines.length) await db.upsert('sn_po_lines', lines, 'sn_po_line_id');   // upsert = idempotent under retry
    await db.update('sn_purchase_orders', `sn_po_id=eq.${po.sn_po_id}`, { raw_hash: po.raw_hash });
    outcome = 'inserted';
    if (discovery) ctx.alerts.push({ kind: discovery.kind, ref_type: 'po', ref_id: po.sn_po_id, ref_number: po.po_number, detail: discovery.detail });
  } else {
    const [oldRow] = await db.select('sn_purchase_orders', `sn_po_id=eq.${po.sn_po_id}&select=*`);
    const oldLines = await db.select('sn_po_lines', `sn_po_id=eq.${po.sn_po_id}&select=*`);
    po.first_seen_at = knownRow.first_seen_at; po.changed_at = po.last_fetched_at;
    await db.upsert('sn_purchase_orders', [{ ...po, raw_hash: '' }], 'sn_po_id');
    await db.delete('sn_po_lines', `sn_po_id=eq.${po.sn_po_id}`);
    if (lines.length) await db.upsert('sn_po_lines', lines, 'sn_po_line_id');   // upsert = idempotent under retry
    await db.update('sn_purchase_orders', `sn_po_id=eq.${po.sn_po_id}`, { raw_hash: po.raw_hash });
    ctx.alerts.push({ kind: 'po_revised', ref_type: 'po', ref_id: po.sn_po_id, ref_number: po.po_number,
      detail: { header: diffTyped(oldRow, po), lines: diffLines(oldLines, lines, 'sn_po_line_id') } });
    outcome = 'updated';
  }
  if (po.net_amount !== null && po.lines_amount !== null && Math.abs(po.net_amount - po.lines_amount) > 0.01) {
    ctx.alerts.push({ kind: 'header_line_mismatch', ref_type: 'po', ref_id: po.sn_po_id, ref_number: po.po_number, detail: { net_amount: po.net_amount, lines_amount: po.lines_amount } });
  }
  return outcome;
}
/** Fetch a PO referenced by a receipt/invoice line that the mirror does not have yet. */
async function discoverPo(ctx, snPoId, kind, detail) {
  if (!snPoId || ctx._discovered?.has(snPoId)) return;
  (ctx._discovered ||= new Set()).add(snPoId);
  const rows = await ctx.db.select('sn_purchase_orders', `sn_po_id=eq.${snPoId}&select=sn_po_id`);
  if (rows.length) return;
  const r = await ctx.sn.doc('PurchaseOrder', snPoId);
  if (r.kind === 'ok') await upsertPo(ctx, r.data, null, { kind, detail });
  else ctx.errors.push(`discover po ${snPoId}: ${r.kind} ${r.message || ''}`);
}

/** Max id visible in the (scoped) Path 3 list — a lower bound for the family's true max id.
 *  Used as the forward-walk ceiling so an interior gap > stopAfter cannot end the walk early. */
async function listCeiling(ctx, type, idField) {
  try {
    const p = await ctx.sn.list(type, { page: 1, size: 50 });
    return Math.max(0, ...p.data.map((r) => int(r[idField]) || 0));
  } catch (e) { ctx.log(`ceiling ${type}: ${e.message}`); return 0; }
}
async function stagePo(ctx, rec) {
  return walkIds(ctx, rec, 'po', {
    docType: 'PurchaseOrder', table: 'sn_purchase_orders', pk: 'sn_po_id', floor: ctx.cfg.poFloor,
    ceiling: await listCeiling(ctx, 'PurchaseOrder', 'PurchaseOrderID'),
    shouldRefresh: () => ctx.scope === 'full',            // nightly: every known PO re-hashed
    process: async (data, knownRow) => { const o = await upsertPo(ctx, data, knownRow); rec[o === 'inserted' ? 'inserted' : o === 'updated' ? 'updated' : o === 'same' ? 'unchanged' : 'errors']++; },
  });
}

// ── stock receipts ─────────────────────────────────────────────────────
async function upsertSr(ctx, data, knownRow) {
  const { db } = ctx;
  const { sr, lines } = mapSr(data);
  if (knownRow && knownRow.raw_hash === '') knownRow = null;
  if (sr.sn_sr_id === null) { ctx.alerts.push({ kind: 'parse_failure', ref_type: 'sr', detail: { keys: Object.keys(data).slice(0, 20) } }); return 'error'; }
  sr.raw_hash = await hashDoc(sr, lines); sr.last_fetched_at = nowIso();
  let outcome = 'same';
  if (knownRow && knownRow.raw_hash === sr.raw_hash) {
    await db.update('sn_stock_receipts', `sn_sr_id=eq.${sr.sn_sr_id}`, { last_fetched_at: sr.last_fetched_at });
  } else {
    let oldLines = [], oldRow = null;
    if (knownRow) { [oldRow] = await db.select('sn_stock_receipts', `sn_sr_id=eq.${sr.sn_sr_id}&select=*`); oldLines = await db.select('sn_sr_lines', `sn_sr_id=eq.${sr.sn_sr_id}&select=*`); }
    sr.first_seen_at = knownRow ? knownRow.first_seen_at : sr.last_fetched_at; sr.changed_at = knownRow ? sr.last_fetched_at : null;
    await db.upsert('sn_stock_receipts', [{ ...sr, raw_hash: '' }], 'sn_sr_id');
    await db.delete('sn_sr_lines', `sn_sr_id=eq.${sr.sn_sr_id}`);
    if (lines.length) await db.upsert('sn_sr_lines', lines, 'sn_sr_line_id');
    await db.update('sn_stock_receipts', `sn_sr_id=eq.${sr.sn_sr_id}`, { raw_hash: sr.raw_hash });
    if (knownRow) ctx.alerts.push({ kind: 'sr_revised', ref_type: 'sr', ref_id: sr.sn_sr_id, ref_number: sr.sr_number, detail: { header: diffTyped(oldRow, sr), lines: diffLines(oldLines, lines, 'sn_sr_line_id') } });
    outcome = knownRow ? 'updated' : 'inserted';
  }
  // PO discovery from lines (forward walk may lag; also covers old-series POs)
  for (const poId of new Set(lines.map((l) => l.sn_po_id).filter(Boolean))) {
    await discoverPo(ctx, poId, 'po_discovered_via_receipt', { sr_number: sr.sr_number, sn_sr_id: sr.sn_sr_id });
  }
  return outcome;
}
async function stageSr(ctx, rec) {
  const cutoff = new Date(Date.now() - ctx.cfg.docRefreshDays * 86400e3).toISOString().slice(0, 10);
  return walkIds(ctx, rec, 'sr', {
    docType: 'inventorySR', table: 'sn_stock_receipts', pk: 'sn_sr_id', floor: ctx.cfg.srFloor, extraKnownCols: 'document_date',
    ceiling: await listCeiling(ctx, 'inventorySR', 'StockItemTransferID'),
    shouldRefresh: (k) => ctx.scope === 'full' && (!k.document_date || k.document_date >= cutoff),
    process: async (data, knownRow) => { const o = await upsertSr(ctx, data, knownRow); rec[o === 'inserted' ? 'inserted' : o === 'updated' ? 'updated' : o === 'same' ? 'unchanged' : 'errors']++; },
  });
}

// ── supplier invoices ──────────────────────────────────────────────────
async function upsertInvoice(ctx, data, knownRow, via) {
  const { db } = ctx;
  const { inv, lines } = mapInvoice(data, via);
  if (knownRow && knownRow.raw_hash === '') knownRow = null;
  if (inv.sn_invoice_id === null) { ctx.alerts.push({ kind: 'parse_failure', ref_type: 'invoice', detail: { keys: Object.keys(data).slice(0, 20) } }); return 'error'; }
  inv.raw_hash = await hashDoc(inv, lines); inv.last_fetched_at = nowIso();
  let outcome = 'same';
  if (knownRow && knownRow.raw_hash === inv.raw_hash) {
    await db.update('sn_supplier_invoices', `sn_invoice_id=eq.${inv.sn_invoice_id}`, { last_fetched_at: inv.last_fetched_at });
  } else {
    let oldLines = [], oldRow = null;
    if (knownRow) { [oldRow] = await db.select('sn_supplier_invoices', `sn_invoice_id=eq.${inv.sn_invoice_id}&select=*`); oldLines = await db.select('sn_invoice_lines', `sn_invoice_id=eq.${inv.sn_invoice_id}&select=*`); inv.discovered_via = oldRow?.discovered_via || via; }
    inv.first_seen_at = knownRow ? knownRow.first_seen_at : inv.last_fetched_at; inv.changed_at = knownRow ? inv.last_fetched_at : null;
    await db.upsert('sn_supplier_invoices', [{ ...inv, raw_hash: '' }], 'sn_invoice_id');
    await db.delete('sn_invoice_lines', `sn_invoice_id=eq.${inv.sn_invoice_id}`);
    if (lines.length) await db.upsert('sn_invoice_lines', lines, 'sn_invoice_line_id');
    await db.update('sn_supplier_invoices', `sn_invoice_id=eq.${inv.sn_invoice_id}`, { raw_hash: inv.raw_hash });
    if (knownRow) ctx.alerts.push({ kind: 'invoice_revised', ref_type: 'invoice', ref_id: inv.sn_invoice_id, ref_number: inv.doc_number, detail: { header: diffTyped(oldRow, inv), lines: diffLines(oldLines, lines, 'sn_invoice_line_id') } });
    outcome = knownRow ? 'updated' : 'inserted';
  }
  for (const poId of new Set([inv.sn_po_id, ...lines.map((l) => l.sn_po_id)].filter(Boolean))) {
    await discoverPo(ctx, poId, 'po_discovered_via_invoice', { doc_number: inv.doc_number, sn_invoice_id: inv.sn_invoice_id });
  }
  return outcome;
}
async function stageInvoices(ctx, rec) {
  const { sn, db, cfg, log } = ctx;
  const cur = ctx.cursor.stage === 'invoices' && ctx.cursor.phase ? { ...ctx.cursor } : { phase: 'list', page: 1, idx: 0 };
  const cutoff = new Date(Date.now() - cfg.docRefreshDays * 86400e3).toISOString().slice(0, 10);
  const known = new Map((await db.selectAll('sn_supplier_invoices', 'select=sn_invoice_id,raw_hash,first_seen_at,changed_at,document_date')).map((r) => [Number(r.sn_invoice_id), r]));
  // listed/linked ids whose Path 5 fetch definitively misses are remembered as gaps and re-probed weekly, not nightly
  const gapRows = await db.selectAll('sn_id_gaps', 'family=eq.invoice&resolved_at=is.null&select=sn_id,probes');
  const gaps = new Map(gapRows.map((g) => [Number(g.sn_id), g]));
  const lastReprobe = ctx.state.invoice_gaps_last_reprobe_at ? Date.parse(ctx.state.invoice_gaps_last_reprobe_at) : 0;
  const reprobeDue = Date.now() - lastReprobe > cfg.gapReprobeDays * 86400e3;
  const bump = (o) => { rec[o === 'inserted' ? 'inserted' : o === 'updated' ? 'updated' : o === 'same' ? 'unchanged' : 'errors']++; };
  const fetchOne = async (id, via, k) => {
    if (gaps.has(id) && !reprobeDue) return;
    const r = await sn.doc('AP_SupplierInvoice', id);
    if (r.kind === 'ok') {
      rec.fetched++; bump(await upsertInvoice(ctx, r.data, k, via)); if (!k) known.set(id, { raw_hash: '?' });
      if (gaps.has(id)) await db.update('sn_id_gaps', `family=eq.invoice&sn_id=eq.${id}`, { resolved_at: nowIso() });
    } else if (r.kind === 'miss') {
      rec.missed++;
      const g = gaps.get(id);
      await db.upsert('sn_id_gaps', [g ? { family: 'invoice', sn_id: id, last_probed_at: nowIso(), probes: (g.probes || 0) + 1 } : { family: 'invoice', sn_id: id, first_missed_at: nowIso(), last_probed_at: nowIso(), probes: 1 }], 'family,sn_id');
      gaps.set(id, { probes: (g?.probes || 0) + 1 });
    } else { rec.errors++; ctx.errors.push(`invoice ${id}: ${r.message}`); }
  };
  // phase A: SupInv list (complete across departments) — new ids, plus recent known ones in full scope
  if (cur.phase === 'list') {
    for (let page = cur.page; ; page++) {
      cur.page = page; cur.idx = cur.idx || 0;
      const p = await sn.list('AP_SupplierInvoice', { page, size: 200 });
      for (let i = cur.idx; i < p.data.length; i++) {
        cur.idx = i;
        if (ctx.timeUp()) return { done: false, cursor: cur };
        const row = p.data[i]; const id = int(row.TradingInvoiceID ?? row.tableid); if (!id) continue;
        const k = known.get(id);
        if (k && !(ctx.scope === 'full' && (!k.document_date || k.document_date >= cutoff))) { rec.unchanged++; continue; }
        await fetchOne(id, 'list', k && k.raw_hash !== '?' ? k : null);
      }
      cur.idx = 0;
      if (!p.lastPage || page >= p.lastPage || p.data.length === 0) break;
    }
    cur.phase = 'linked'; cur.idx = 0;
  }
  // phase B: INVSI linked from stock receipts (not listable) — fetch unknown ones
  if (cur.phase === 'linked') {
    const linked = await db.selectAll('sn_stock_receipts', 'select=link_source_doc_id&link_source_doc_id=not.is.null&link_source_name=eq.TradingInvoice');
    const ids = [...new Set(linked.map((r) => Number(r.link_source_doc_id)))].filter((id) => !known.has(id) || known.get(id)?.raw_hash === '').sort((a, b) => a - b);
    log(`invoices: ${ids.length} SR-linked INVSI to fetch`);
    for (let i = cur.idx; i < ids.length; i++) {
      cur.idx = i;
      if (ctx.timeUp()) return { done: false, cursor: cur };
      await fetchOne(ids[i], 'sr_link', known.get(ids[i]) && known.get(ids[i]).raw_hash !== '?' ? known.get(ids[i]) : null);
      if (i % 100 === 99) { log(`invoices: linked ${i + 1}/${ids.length}`); ctx.cursor = { stage: 'invoices', ...cur }; await db.update('sn_sync_runs', `id=eq.${ctx.run.id}`, { cursor: ctx.cursor }); }
    }
    log(`invoices: ${ids.length} SR-linked INVSI fetched`);
  }
  if (reprobeDue && ctx.scope === 'full') await ctx.setState('invoice_gaps_last_reprobe_at', nowIso());
  return { done: true };
}
