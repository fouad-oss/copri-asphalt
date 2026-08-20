#!/usr/bin/env node
// SpectroNova read-API smoke test / schema discovery.
// Read-only: only POST /spectro-auth, /spectro-tabledata, /spectro-documentdata.
// Zero deps (Node >= 18, native fetch). Credentials from .env.sn (gitignored) or env vars.
// Raw dumps -> sn-api-dumps/<run-ts>/ (gitignored). Summary -> sn-api-dumps/<run-ts>/SUMMARY.json
//
// Usage:  node scripts/sn-api-probe.mjs            (from repo root)
//         node scripts/sn-api-probe.mjs --size 20   (override page size)
//
// Never logs the password or the token value.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://workflow.spectronovasoft.com/webhook';

// ---------- env ----------
function loadEnvFile(p) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnvFile(path.join(ROOT, '.env.sn'));
loadEnvFile(path.join(ROOT, '.env.local'));

const EMAIL = process.env.SN_API_EMAIL;
const PASSWORD = process.env.SN_API_PASSWORD;
const TENANT_ID = process.env.SN_TENANT_ID;
if (!EMAIL || !PASSWORD || !TENANT_ID) {
  console.error('Missing SN_API_EMAIL / SN_API_PASSWORD / SN_TENANT_ID — fill in .env.sn at repo root. Aborting before any network call.');
  process.exit(2);
}

// ---------- gitignore guard ----------
const gi = fs.existsSync(path.join(ROOT, '.gitignore')) ? fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8') : '';
for (const must of ['.env.sn', 'sn-api-dumps/']) {
  if (!gi.split(/\r?\n/).some((l) => l.trim() === must)) {
    console.error(`.gitignore does not contain "${must}" — refusing to run.`);
    process.exit(2);
  }
}

// ---------- args ----------
const argv = process.argv.slice(2);
const SIZE = Number(argv[argv.indexOf('--size') + 1]) || 50;
const ONLY = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : 'all'; // all | po

// ---------- output dir ----------
const RUN = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = path.join(ROOT, 'sn-api-dumps', RUN);
fs.mkdirSync(OUT, { recursive: true });
const dump = (name, obj) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj, null, 2), 'utf8');

const summary = { run: RUN, base: BASE, size: SIZE, auth: {}, types: {}, path5: {}, clause: [], poHunt: {}, behavior: { timings: [], notes: [] } };
const log = (...a) => console.log(...a);

// ---------- http ----------
let TENANT_HEADER = null;
async function post(pathname, body, { auth = false, label = '' } = {}) {
  const url = `${BASE}${pathname}${auth ? '' : `?tenantid=${encodeURIComponent(TENANT_ID)}`}`;
  const headers = { 'Content-Type': 'application/json' };
  if (!auth) headers['x-tenant'] = TENANT_HEADER;
  const t0 = performance.now();
  let res, text, json, err;
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    text = await res.text();
    try { json = JSON.parse(text); } catch { json = null; }
  } catch (e) { err = String(e); }
  const ms = Math.round(performance.now() - t0);
  summary.behavior.timings.push({ label: label || pathname, ms, http: res?.status ?? null, bodyStatus: json?.status ?? null, code: json?.code ?? null });
  if (err) return { ok: false, ms, error: err };
  return { ok: res.ok, http: res.status, ms, json, text, headers: Object.fromEntries(res.headers.entries()) };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- schema helpers ----------
const looksDate = (v) => typeof v === 'string' && (/^\d{4}-\d{2}-\d{2}/.test(v) || /^\d{1,2}\/\d{1,2}\/\d{4}/.test(v) || /^\/Date\(/.test(v));
const looksHtml = (v) => typeof v === 'string' && /<[a-z][^>]*>/i.test(v);
const looksNumStr = (v) => typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim());
const hasArabic = (v) => typeof v === 'string' && /[؀-ۿ]/.test(v);
const hasMojibake = (v) => typeof v === 'string' && /Ã|Ø[\x80-\xBF]|�|\?{3,}/.test(v);

function profile(records) {
  const fields = {};
  for (const r of records) {
    if (!r || typeof r !== 'object') continue;
    for (const [k, v] of Object.entries(r)) {
      const f = (fields[k] ||= { nulls: 0, types: new Set(), date: 0, html: 0, numstr: 0, arabic: 0, mojibake: 0, sample: undefined, distinct: new Set() });
      if (v === null || v === undefined || v === '') { f.nulls++; continue; }
      f.types.add(Array.isArray(v) ? 'array' : typeof v);
      if (looksDate(v)) f.date++;
      if (looksHtml(v)) f.html++;
      if (looksNumStr(v)) f.numstr++;
      if (hasArabic(v)) f.arabic++;
      if (hasMojibake(v)) f.mojibake++;
      if (f.sample === undefined) f.sample = v;
      if (f.distinct.size < 1000) f.distinct.add(typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
  }
  const n = records.length;
  const out = {};
  for (const [k, f] of Object.entries(fields)) {
    let type = [...f.types].join('|') || 'null';
    if (f.date && f.date === n - f.nulls) type += ' (date-like)';
    if (f.numstr && f.numstr === n - f.nulls) type += ' (numeric-string)';
    if (f.html) type += ` (html in ${f.html})`;
    out[k] = {
      type,
      alwaysNull: f.nulls === n,
      nullCount: f.nulls,
      distinct: f.distinct.size,
      unique: f.distinct.size === n - f.nulls && n - f.nulls > 1,
      arabic: f.arabic > 0,
      mojibake: f.mojibake > 0,
      sample: typeof f.sample === 'string' && f.sample.length > 120 ? f.sample.slice(0, 120) + '…' : f.sample,
    };
  }
  return out;
}

function guessIdField(prof, records) {
  const cands = Object.keys(prof).filter((k) => /id$/i.test(k) || /^tableid$/i.test(k) || /workflowdocumentid/i.test(k));
  const unique = cands.filter((k) => prof[k].unique || records.length <= 1);
  return { candidates: cands, uniqueCandidates: unique, tableid: prof.tableid ? 'present' : 'absent', WorkflowDocumentID: prof.WorkflowDocumentID ? 'present' : 'absent' };
}

const PO_RE = /(^|[^a-z])(po|lpo|purchase\s*order|purchaseorder|porder|order\s*no|ordernumber|refno|referenceno|reference\s*number|referencenumber)/i;

// ======================================================================
async function main() {
  log(`SN API probe — run ${RUN}, page size ${SIZE}, dumps → ${path.relative(ROOT, OUT)}`);

  // ---- 1. Auth ----
  const a = await post('/spectro-auth', { email: EMAIL, password: PASSWORD }, { auth: true, label: 'auth' });
  const aj = a.json;
  summary.auth = {
    http: a.http, ms: a.ms, bodyStatus: aj?.status, code: aj?.code,
    topLevelKeys: aj ? Object.keys(aj) : null,
    tokenPresent: !!aj?.token, tokenLength: aj?.token?.length ?? 0,
    tenantInfoKeys: aj?.tenantInfo && typeof aj.tenantInfo === 'object' ? Object.keys(aj.tenantInfo) : typeof aj?.tenantInfo,
    tenantInfoNestedKeys: aj?.tenantInfo && typeof aj.tenantInfo === 'object'
      ? Object.fromEntries(Object.entries(aj.tenantInfo).filter(([, v]) => v && typeof v === 'object').map(([k, v]) => [k, Object.keys(v)]))
      : null,
  };
  // dump auth response with secrets masked
  const masked = aj ? JSON.parse(JSON.stringify(aj)) : { raw: a.text?.slice(0, 500), error: a.error };
  if (masked.token) masked.token = `<masked len=${aj.token.length}>`;
  const maskDeep = (o) => { for (const k in o) { if (o[k] && typeof o[k] === 'object') maskDeep(o[k]); else if (/connection|secret|password|key/i.test(k)) o[k] = '<masked>'; } };
  maskDeep(masked);
  dump('00-auth.masked.json', masked);
  log(`auth: http=${a.http} status=${aj?.status} token=${aj?.token ? 'present' : 'ABSENT'} tenantInfo keys=${JSON.stringify(summary.auth.tenantInfoKeys)}`);
  if (aj?.status !== 'success' || !aj?.tenantInfo) {
    summary.auth.verdict = 'AUTH FAILED — stopped';
    dump('SUMMARY.json', summary);
    console.error(`Auth failed (${aj?.code || a.error || a.http}). Stopping — no retries.`);
    process.exit(1);
  }
  TENANT_HEADER = JSON.stringify(aj.tenantInfo);

  if (ONLY === 'po') { await poDeepDive(); dump('SUMMARY.json', summary); return; }

  // ---- 2. Path 3 for the nine documented types ----
  const TYPES = ['Vendors', 'item', 'GLCOA', 'GLCostCenter', 'AP_SupplierInvoice', 'GRN', 'inventorySR', 'JV', 'PaymentSp'];
  const firstRecord = {};
  for (const T of TYPES) {
    const r = await post('/spectro-tabledata', { DocumentType: T, Clause: '', page: 1, size: SIZE }, { label: `p3:${T}` });
    const j = r.json;
    dump(`10-p3-${T}.json`, j ?? { raw: r.text?.slice(0, 2000), error: r.error });
    const data = Array.isArray(j?.data) ? j.data : [];
    const prof = profile(data);
    const info = {
      http: r.http, ms: r.ms, bodyStatus: j?.status, code: j?.code, message: j?.message ?? j?.error ?? null,
      envelopeKeys: j ? Object.keys(j) : null,
      totalCount: j?.totalCount ?? null, last_page: j?.last_page ?? null, returned: data.length,
      fields: prof, id: guessIdField(prof, data),
      poRefFields: Object.keys(prof).filter((k) => PO_RE.test(k)),
      arabicFields: Object.keys(prof).filter((k) => prof[k].arabic),
      mojibakeFields: Object.keys(prof).filter((k) => prof[k].mojibake),
      alwaysNullFields: Object.keys(prof).filter((k) => prof[k].alwaysNull),
      htmlFields: Object.keys(prof).filter((k) => /html/.test(prof[k].type)),
      nestedFields: Object.keys(prof).filter((k) => /object|array/.test(prof[k].type)),
    };
    summary.types[T] = info;
    firstRecord[T] = data[0] ?? null;
    if (data[0]) dump(`11-p3-${T}.sample.json`, data[0]);
    log(`p3 ${T.padEnd(20)} status=${j?.status} total=${j?.totalCount} last_page=${j?.last_page} returned=${data.length} fields=${Object.keys(prof).length} ${r.ms}ms${j?.code ? ' code=' + j.code : ''}`);
    await sleep(400);
  }

  // ---- 3. Path 5 on Vendors / AP_SupplierInvoice / JV (+ case-sensitivity test) ----
  const P5 = [['Vendors', 'Vendors'], ['vendors', 'Vendors'], ['AP_SupplierInvoice', 'AP_SupplierInvoice'], ['JV', 'JV'], ['GRN', 'GRN']];
  for (const [docType, srcType] of P5) {
    const rec = firstRecord[srcType];
    if (!rec) { summary.path5[docType] = { skipped: 'no path-3 record' }; continue; }
    const idCands = ['tableid', 'WorkflowDocumentID', 'TableID', 'Id', 'ID', 'id'].filter((k) => rec[k] != null);
    const idField = idCands[0] ?? Object.keys(rec).find((k) => /id$/i.test(k) && rec[k] != null);
    const idVal = rec[idField];
    const r = await post('/spectro-documentdata', { DocumentType: docType, DocumentId: idVal }, { label: `p5:${docType}` });
    const j = r.json;
    dump(`20-p5-${docType}.json`, j ?? { raw: r.text?.slice(0, 2000), error: r.error });
    // find the record payload wherever it is
    const payload = j?.data ?? j?.document ?? j?.result ?? j;
    const recObj = Array.isArray(payload) ? payload[0] : payload;
    const p5Keys = recObj && typeof recObj === 'object' ? Object.keys(recObj) : [];
    const p3Keys = Object.keys(rec);
    const nested = p5Keys.filter((k) => recObj[k] && typeof recObj[k] === 'object');
    summary.path5[docType] = {
      http: r.http, ms: r.ms, bodyStatus: j?.status, code: j?.code, message: j?.message ?? null,
      usedIdField: idField, idValueType: typeof idVal,
      envelopeKeys: j ? Object.keys(j) : null,
      payloadIsArray: Array.isArray(payload), payloadLength: Array.isArray(payload) ? payload.length : null,
      p5FieldCount: p5Keys.length, p3FieldCount: p3Keys.length,
      onlyInP5: p5Keys.filter((k) => !p3Keys.includes(k)),
      onlyInP3: p3Keys.filter((k) => !p5Keys.includes(k)),
      nestedFields: Object.fromEntries(nested.map((k) => [k, Array.isArray(recObj[k]) ? `array[${recObj[k].length}]${recObj[k][0] && typeof recObj[k][0] === 'object' ? ' keys=' + Object.keys(recObj[k][0]).join(',') : ''}` : 'object keys=' + Object.keys(recObj[k]).join(',')])),
      poRefFields: p5Keys.filter((k) => PO_RE.test(k)),
    };
    log(`p5 ${docType.padEnd(20)} status=${j?.status} id=${idField} p3fields=${p3Keys.length} p5fields=${p5Keys.length} nested=${nested.length} ${r.ms}ms${j?.code ? ' code=' + j.code : ''}`);
    await sleep(400);
  }

  // ---- 4. Clause filtering ----
  async function clauseTest(T, clause, note) {
    const r = await post('/spectro-tabledata', { DocumentType: T, Clause: clause, page: 1, size: 5 }, { label: `clause:${T}` });
    const j = r.json;
    const entry = { type: T, clause, note, bodyStatus: j?.status, code: j?.code, message: j?.message ?? null, totalCount: j?.totalCount ?? null, returned: Array.isArray(j?.data) ? j.data.length : null, ms: r.ms };
    summary.clause.push(entry);
    log(`clause ${T} [${clause}] → status=${j?.status} total=${j?.totalCount} returned=${entry.returned}${j?.code ? ' code=' + j.code : ''}`);
    await sleep(400);
    return entry;
  }
  const vend = firstRecord.Vendors;
  if (vend) {
    const idKey = ['ContactDirectoryID', 'tableid'].find((k) => vend[k] != null);
    const raw = String(vend[idKey]); const num = (raw.match(/\d+/) || [])[0];
    if (num) {
      await clauseTest('Vendors', `${idKey}=${num}`, `real ${idKey} from p3 record (expect 1)`);
      await clauseTest('Vendors', `${idKey}=999999999`, 'bogus id (expect 0 if clause honored)');
    }
  }
  // date filter attempt on a document type with a date-looking field
  for (const T of ['AP_SupplierInvoice', 'JV', 'PaymentSp', 'GRN']) {
    const rec = firstRecord[T]; if (!rec) continue;
    const dateField = Object.keys(rec).find((k) => looksDate(rec[k]) && !/<[a-z]/i.test(rec[k]));
    if (!dateField) continue;
    const bracket = /\s/.test(dateField) ? `[${dateField}]` : dateField;
    await clauseTest(T, `${bracket}>='2025-01-01'`, `date filter ISO on ${dateField} (sample=${rec[dateField]})`);
    await clauseTest(T, `${bracket}>='01/01/2025'`, `date filter dd/MM/yyyy on ${dateField}`);
    await clauseTest(T, `${bracket}>='2099-01-01'`, 'far-future date (expect 0 if honored)');
    break;
  }

  // ---- 5. PO hunt ----
  summary.poHunt.refFieldsOnDocs = Object.fromEntries(Object.entries(summary.types).map(([T, i]) => [T, i.poRefFields]));
  summary.poHunt.refFieldsOnPath5 = Object.fromEntries(Object.entries(summary.path5).map(([T, i]) => [T, i.poRefFields ?? []]));
  const GUESSES = ['PO', 'LPO', 'PurchaseOrder', 'AP_PurchaseOrder', 'POrder', 'PurchaseVoucher', 'PurchaseOrderDetail', 'AP_PurchaseVoucher'];
  summary.poHunt.typeGuesses = {};
  for (const G of GUESSES) {
    const r = await post('/spectro-tabledata', { DocumentType: G, Clause: '', page: 1, size: 1 }, { label: `guess:${G}` });
    const j = r.json;
    const data = Array.isArray(j?.data) ? j.data : [];
    summary.poHunt.typeGuesses[G] = { bodyStatus: j?.status, code: j?.code, message: (j?.message ?? j?.error ?? '')?.toString().slice(0, 200), totalCount: j?.totalCount ?? null, fields: data[0] ? Object.keys(data[0]) : [] };
    if (data[0]) dump(`30-guess-${G}.sample.json`, data[0]);
    log(`guess ${G.padEnd(20)} status=${j?.status} total=${j?.totalCount ?? '-'} fields=${data[0] ? Object.keys(data[0]).length : 0}${j?.code ? ' code=' + j.code : ''}`);
    await sleep(400);
  }

  // ---- 6. Behavior: pagination past last_page, small type ----
  const smallT = Object.entries(summary.types).filter(([, i]) => i.bodyStatus === 'success' && i.last_page != null).sort((a, b) => (a[1].totalCount ?? 1e9) - (b[1].totalCount ?? 1e9))[0]?.[0];
  if (smallT) {
    const lp = Number(summary.types[smallT].last_page) || 1;
    const r = await post('/spectro-tabledata', { DocumentType: smallT, Clause: '', page: lp + 5, size: SIZE }, { label: `past-last:${smallT}` });
    const j = r.json;
    summary.behavior.pastLastPage = { type: smallT, requestedPage: lp + 5, last_page: lp, bodyStatus: j?.status, code: j?.code, returned: Array.isArray(j?.data) ? j.data.length : null, totalCount: j?.totalCount ?? null };
    log(`past-last ${smallT} page ${lp + 5} → status=${j?.status} returned=${summary.behavior.pastLastPage.returned}`);
  }
  // rate-limit hints from headers
  const probeHeaders = (await post('/spectro-tabledata', { DocumentType: 'Vendors', Clause: '', page: 1, size: 1 }, { label: 'hdr' })).headers || {};
  summary.behavior.responseHeaders = Object.fromEntries(Object.entries(probeHeaders).filter(([k]) => /rate|limit|retry|server|content-type|cache/i.test(k)));
  const ms = summary.behavior.timings.map((t) => t.ms);
  summary.behavior.timingStats = { n: ms.length, min: Math.min(...ms), max: Math.max(...ms), avg: Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) };
  summary.behavior.httpStatuses = [...new Set(summary.behavior.timings.map((t) => t.http))];
  summary.behavior.utf8 = { arabicSeenIn: Object.fromEntries(Object.entries(summary.types).map(([T, i]) => [T, i.arabicFields])), mojibakeSeenIn: Object.fromEntries(Object.entries(summary.types).map(([T, i]) => [T, i.mojibakeFields])) };

  await poDeepDive();

  dump('SUMMARY.json', summary);
  log(`\nDone. ${summary.behavior.timings.length} requests, avg ${summary.behavior.timingStats.avg}ms, http statuses ${JSON.stringify(summary.behavior.httpStatuses)}. Summary → ${path.relative(ROOT, path.join(OUT, 'SUMMARY.json'))}`);
}

// ======================================================================
// PO deep dive — the strategic question. Uses only the two documented data endpoints.
//  a) PurchaseOrder list (size 10): which POs does the list viewer expose?
//  b) AP_SupplierInvoice: find a line with PurchaseOrderID → Path 5 PurchaseOrder by that ID
//     (does the document viewer return a PO the list viewer hides? with lines?)
//  c) inventorySR Path 5: are stock-receipt lines PO-linked?
//  d) Clause on inventorySR by PurchaseOrderNumber (quoted string) + non-ambiguous date filters.
async function poDeepDive() {
  const D = (summary.poDeep ||= {});
  const p3 = (T, Clause, size = 10, page = 1, label) => post('/spectro-tabledata', { DocumentType: T, Clause, page, size }, { label: label || `po:${T}` });
  const p5 = (T, id, label) => post('/spectro-documentdata', { DocumentType: T, DocumentId: id }, { label: label || `po5:${T}` });
  const strip = (s) => (typeof s === 'string' ? s.replace(/<[^>]+>/g, '').trim() : s);

  // a) PurchaseOrder list
  let r = await p3('PurchaseOrder', '', 10);
  let rows = Array.isArray(r.json?.data) ? r.json.data : [];
  dump('40-po-list.json', r.json ?? { raw: r.text?.slice(0, 2000) });
  D.list = { bodyStatus: r.json?.status, totalCount: r.json?.totalCount, returned: rows.length, poNumbers: rows.map((x) => ({ id: x.PurchaseOrderID, no: strip(x['PO Number']) || x.SearchNumber, type: x.Type, status: x.DocumentStatus, supplier: strip(x.Supplier), date: x.Date, net: x.NetAmount })) };
  log(`po list: total=${r.json?.totalCount} → ${D.list.poNumbers.map((p) => p.no).join(', ')}`);
  await sleep(400);

  // b) invoice → PO id → Path 5 PurchaseOrder
  r = await p3('AP_SupplierInvoice', '', 10, 1, 'po:inv-list');
  const invs = Array.isArray(r.json?.data) ? r.json.data : [];
  D.invoiceToPo = [];
  let poIds = new Set();
  for (const inv of invs.slice(0, 4)) {
    await sleep(400);
    const d = await p5('AP_SupplierInvoice', inv.tableid, 'po5:inv');
    const doc = d.json?.data ?? {};
    const items = Array.isArray(doc.Items) ? doc.Items : [];
    const rec = {
      invoice: doc.DocumentNumber ?? inv.DocumentNumber, header: { PurchaseOrderNumber: doc.PurchaseOrderNumber, PODate: doc.PODate, DefaultPurchaseOrderID: doc.DefaultPurchaseOrderID, LinkSourceName: doc.LinkSourceName, LinkSourceDocID: doc.LinkSourceDocID },
      lines: items.map((it) => ({ LineNumber: it.LineNumber, ItemCode: it.ItemCode, ItemID: it.ItemID, Quantity: it.Quantity, UOMCode: it.UOMCode, UnitPriceFC: it.UnitPriceFC, AmountFC: it.AmountFC, PurchaseOrderID: it.PurchaseOrderID, PurchaseOrderLineID: it.PurchaseOrderLineID, OrderLineNumber: it.OrderLineNumber, LinkSourceDocType: it.LinkSourceDocType, LinkSourceDocID: it.LinkSourceDocID, CostCode: it.CostCode })),
    };
    D.invoiceToPo.push(rec);
    for (const it of items) if (it.PurchaseOrderID && Number(it.PurchaseOrderID) > 0) poIds.add(String(it.PurchaseOrderID));
    if (doc.DefaultPurchaseOrderID && Number(doc.DefaultPurchaseOrderID) > 0) poIds.add(String(doc.DefaultPurchaseOrderID));
    log(`inv ${rec.invoice}: PO#=${doc.PurchaseOrderNumber} DefaultPurchaseOrderID=${doc.DefaultPurchaseOrderID} lines=${items.length} linePOids=${[...new Set(items.map((i) => i.PurchaseOrderID))].join('|')}`);
  }
  dump('41-po-invoice-links.json', D.invoiceToPo);

  // If invoices gave no PO id, try the PO list ids themselves and a PurchaseOrderDetail id
  const listIds = D.list.poNumbers.map((p) => p.id).filter(Boolean);
  const tryIds = [...poIds].slice(0, 2);
  if (listIds[0]) tryIds.push(String(listIds[0]));
  D.path5PO = [];
  for (const id of tryIds) {
    await sleep(400);
    const d = await p5('PurchaseOrder', id);
    const doc = d.json?.data;
    const keys = doc && typeof doc === 'object' ? Object.keys(doc) : [];
    const nested = keys.filter((k) => doc[k] && typeof doc[k] === 'object');
    const lineArr = nested.map((k) => doc[k]).find((v) => Array.isArray(v) && v.length && typeof v[0] === 'object');
    D.path5PO.push({
      id, fromListViewer: listIds.includes(id) || listIds.includes(Number(id)), bodyStatus: d.json?.status, code: d.json?.code, message: d.json?.message?.slice?.(0, 200), fieldCount: keys.length,
      poNumber: doc?.DocumentNumber ?? doc?.['PO Number'] ?? doc?.SearchNumber, type: doc?.Type ?? doc?.TypeDescription, status: doc?.DocumentStatus ?? doc?.WorkflowStatusCode ?? doc?.PostedStatus, supplier: strip(doc?.Supplier ?? doc?.ToCompany ?? doc?.ToContactName), netAmount: doc?.NetAmount, date: doc?.DocumentDate ?? doc?.Date,
      nested: Object.fromEntries(nested.map((k) => [k, Array.isArray(doc[k]) ? `array[${doc[k].length}]` : 'object'])),
      lineKeys: lineArr ? Object.keys(lineArr[0]) : [],
      lineSample: lineArr ? Object.fromEntries(Object.entries(lineArr[0]).filter(([k]) => /item|qty|quantity|price|amount|uom|line|desc|cost/i.test(k)).slice(0, 25)) : null,
    });
    if (doc) dump(`42-po-path5-${id}.json`, d.json);
    log(`p5 PurchaseOrder ${id}${listIds.includes(id) ? ' (in list)' : ' (NOT in list)'}: status=${d.json?.status} fields=${keys.length} nested=${JSON.stringify(D.path5PO.at(-1).nested)} lineKeys=${D.path5PO.at(-1).lineKeys.length}${d.json?.code ? ' code=' + d.json.code : ''}`);
  }

  // c) inventorySR Path 5
  await sleep(400);
  r = await p3('inventorySR', '', 3, 1, 'po:sr-list');
  const sr = (r.json?.data ?? [])[0];
  if (sr) {
    await sleep(400);
    const d = await p5('inventorySR', sr.StockItemTransferID, 'po5:sr');
    const doc = d.json?.data ?? {};
    const keys = Object.keys(doc);
    const nested = keys.filter((k) => doc[k] && typeof doc[k] === 'object');
    const lineArr = nested.map((k) => doc[k]).find((v) => Array.isArray(v) && v.length && typeof v[0] === 'object');
    D.stockReceiptPath5 = { id: sr.StockItemTransferID, bodyStatus: d.json?.status, code: d.json?.code, fieldCount: keys.length, headerPoFields: Object.fromEntries(keys.filter((k) => /purchaseorder|po(number|date|id)|linksource/i.test(k)).map((k) => [k, doc[k]])), nested: Object.fromEntries(nested.map((k) => [k, Array.isArray(doc[k]) ? `array[${doc[k].length}]` : 'object'])), lineKeys: lineArr ? Object.keys(lineArr[0]) : [], linePoFields: lineArr ? Object.fromEntries(Object.entries(lineArr[0]).filter(([k]) => /purchaseorder|po(number|date|id)|linksource|itemcode|quantity|unitprice|amountfc/i.test(k))) : null };
    if (doc) dump('43-sr-path5.json', d.json);
    log(`p5 inventorySR ${sr.StockItemTransferID}: status=${d.json?.status} fields=${keys.length} nested=${JSON.stringify(D.stockReceiptPath5.nested)} headerPO=${JSON.stringify(D.stockReceiptPath5.headerPoFields)}`);

    // c2) the decisive test: SR line → PurchaseOrderID (a material PO the list viewer hides) → Path 5 PurchaseOrder
    const hiddenId = lineArr?.[0]?.PurchaseOrderID;
    const linkedTI = doc.DefaultPurchaseOrderID ?? doc.LinkSourceDocID;
    D.hiddenPO = [];
    for (const [T, id, why] of [['PurchaseOrder', hiddenId, 'PurchaseOrderID from SR line (not in PurchaseOrder list viewer)'], ['AP_SupplierInvoice', linkedTI, 'SR header DefaultPurchaseOrderID/LinkSourceDocID (a TradingInvoice id)'], ['PurchaseOrder', 999999999, 'nonexistent id — error shape']]) {
      if (!id) continue;
      await sleep(400);
      const x = await p5(T, id, `po5-hidden:${T}`);
      const dd = x.json?.data ?? {};
      const lines = dd.Item ?? dd.Items ?? [];
      const rec = {
        type: T, id, why, bodyStatus: x.json?.status, code: x.json?.code, message: x.json?.message?.slice?.(0, 200), fieldCount: Object.keys(dd).length,
        inListViewer: T === 'PurchaseOrder' ? listIds.map(String).includes(String(id)) : null,
        header: { DocumentNumber: dd.DocumentNumber, Type: dd.Type ?? dd.OrderType, PostedStatus: dd.PostedStatus, DocumentStatus: dd.DocumentStatus, WorkflowStatusCode: dd.WorkflowStatusCode, Supplier: strip(dd.ToCompany ?? dd.ToContactName), FromCompany: dd.FromCompany, DocumentDate: dd.DocumentDate, NetAmount: dd.NetAmount, RevisionNumber: dd.RevisionNumber, LastModifiedOn: dd.LastModifiedOn, LinkSourceDocType: dd.LinkSourceDocType, LinkSourceDocID: dd.LinkSourceDocID, DefaultPurchaseOrderID: dd.DefaultPurchaseOrderID, PurchaseOrderNumber: dd.PurchaseOrderNumber, ContractID: dd.ContractID },
        nLines: lines.length,
        line0: lines[0] ? Object.fromEntries(Object.entries(lines[0]).filter(([k]) => /^(ItemCode|ItemID|ItemDescription|Description|QuantityOrdered|QuantityReceived|Quantity|UOMCode|OrderUnitPrice|UnitPriceFC|OrderLineAmount|AmountFC|PurchaseType|PurchaseOrderID|PurchaseOrderLineID|CostCode|Total|IsClosed)$/.test(k)).map(([k, v]) => [k, strip(v)])) : null,
      };
      D.hiddenPO.push(rec);
      if (x.json?.data) dump(`44-p5-${T}-${id}.json`, x.json);
      log(`p5 ${T} ${id} [${why}]: status=${x.json?.status} fields=${rec.fieldCount} doc=${rec.header.DocumentNumber} type=${rec.header.Type} lines=${rec.nLines}${x.json?.code ? ' code=' + x.json.code : ''}`);
    }
  }

  // d) clause tests
  D.clauses = [];
  const ct = async (T, clause, note) => {
    await sleep(400);
    const x = await p3(T, clause, 5, 1, `po-clause:${T}`);
    const j = x.json;
    const e = { type: T, clause, note, bodyStatus: j?.status, code: j?.code, message: j?.message?.match?.(/Exception: ([^\r\n]+)/)?.[1]?.slice(0, 120), totalCount: j?.totalCount ?? null };
    D.clauses.push(e); log(`clause ${T} [${clause}] → ${j?.status} total=${j?.totalCount ?? '-'} ${e.message ?? ''}`);
  };
  const poNo = sr?.PurchaseOrderNumber;
  if (poNo) { await ct('inventorySR', `PurchaseOrderNumber='${poNo}'`, 'quoted string filter on PO number'); await ct('inventorySR', `PurchaseOrderNumber='PO/ZZZZ'`, 'bogus PO number (expect 0)'); }
  await ct('inventorySR', `ReferenceNumber='${sr?.ReferenceNumber}'`, 'quoted string filter on ReferenceNumber');
  await ct('AP_SupplierInvoice', `ReferenceInvoiceDate>='2026-07-01'`, 'ISO date on ReferenceInvoiceDate');
  await ct('AP_SupplierInvoice', `ReferenceInvoiceDate>='2099-01-01'`, 'far-future ISO date (expect 0)');
  await ct('AP_SupplierInvoice', `TradingInvoiceID>0`, 'numeric id filter (expect all)');
  await ct('AP_SupplierInvoice', `FromContactDirectoryID=210267`, 'vendor filter on invoices');
  await ct('JV', `PostingDate>='2026-08-01'`, 'ISO date on JV PostingDate');
  await ct('JV', `PostingDate>='2099-01-01'`, 'far-future (expect 0)');
  await ct('JV', `PostingDate>='01/08/2026'`, 'dd/MM/yyyy date on JV PostingDate');
  await ct('PurchaseOrder', `PurchaseOrderID>0`, 'PO list numeric filter (expect 6)');
  await ct('PurchaseOrder', `PurchaseOrderID=-1`, 'PO list bogus (0 if honored)');
}

main().catch((e) => { console.error('probe crashed:', e?.message || e); dump('SUMMARY.json', summary); process.exit(1); });
