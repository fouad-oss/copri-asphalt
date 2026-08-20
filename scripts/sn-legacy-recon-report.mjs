#!/usr/bin/env node
// Legacy ↔ SN PO reconciliation report → SN_LEGACY_PO_RECONCILIATION.md (report only, no writes).
// Reads commitments (sn_po) and sn_purchase_orders via PostgREST with the service key from .env.sn.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env.sn'), 'utf8').split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]));
const U = (env.SUPABASE_URL || 'https://abwsxqnppihrmkhydkai.supabase.co') + '/rest/v1';
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
const get = async (q) => (await fetch(`${U}/${q}`, { headers: H })).json();
const [L, S, CL, BN] = await Promise.all([
  get('commitments?select=id,number,sn_po,status,value,vendors(name)&sn_po=neq.&limit=5000'),
  get('sn_purchase_orders?select=sn_po_id,po_number,is_fixed_asset,is_closed,supplier_name,department,net_amount,line_count&limit=5000'),
  get('commitment_lines?select=commitment_id&limit=10000'),
  get('bundles?select=commitment_line_id,commitment_lines(commitment_id)&limit=10000'),
]);
const key = (s) => String(s || '').toUpperCase().replace(/[^0-9A-Z/]/g, '');
const lc = {}, bc = {};
for (const c of CL) lc[c.commitment_id] = (lc[c.commitment_id] || 0) + 1;
for (const b of BN) { const id = b.commitment_lines?.commitment_id; if (id) bc[id] = (bc[id] || 0) + 1; }
const sm = new Map(S.map((p) => [key(p.po_number), p])), lm = new Map(L.map((c) => [key(c.sn_po), c]));
const matched = [], legacyOnly = [], snOnly = [];
for (const c of L) { const p = sm.get(key(c.sn_po)); if (p) matched.push([c, p]); else legacyOnly.push(c); }
for (const p of S) if (!lm.has(key(p.po_number))) snOnly.push(p);
const dv = matched.filter(([c, p]) => c.value != null && p.net_amount != null && Math.abs(Number(c.value) - Number(p.net_amount)) > 0.005);
const withLines = matched.filter(([c]) => lc[c.id]), withBundles = matched.filter(([c]) => bc[c.id]);
const dep = {}; for (const p of snOnly) { const k = (p.is_fixed_asset ? 'Fixed asset' : 'Material') + ' · ' + p.department; dep[k] = (dep[k] || 0) + 1; }
const closedMatched = matched.filter(([, p]) => p.is_closed).length;
const today = new Date().toISOString().slice(0, 10);
const md = `# Legacy ↔ SpectroNova PO reconciliation (report only — nothing deleted)

*Generated ${today} by \`scripts/sn-legacy-recon-report.mjs\` from the SN mirror (${S.length} SN POs) against the ${L.length} imported app POs (\`commitments\` with \`sn_po\`). Match key: normalised SN PO number. Live version: view \`sn_legacy_po_recon\` (migration 0065) + the SN sync panel.*

| Bucket | Count |
|---|---|
| **Matched** (app import ↔ SN mirror) | **${matched.length}** |
| Legacy-only (app PO with no SN twin) | **${legacyOnly.length}** |
| SN-only (in SN, never imported) | **${snOnly.length}** |

- Matched POs that carry **app-entered lines**: ${withLines.length} (${withLines.map(([c]) => c.sn_po).join(', ') || '—'}); with **bundles**: ${withBundles.length} (${withBundles.map(([c]) => c.sn_po + ' ×' + bc[c.id]).join(', ') || '—'}). Everything else in the legacy register is header-only → switching the register to the SN mirror loses no line data.
- Matched POs now **closed** in SN: ${closedMatched}.
- **Value deltas** (app \`value\` vs SN \`NetAmount\`): ${dv.length}
${dv.map(([c, p]) => `  - ${c.sn_po} (${c.number}, ${c.vendors?.name || ''}): app ${Number(c.value).toFixed(3)} vs SN ${Number(p.net_amount).toFixed(3)} (Δ ${(Number(p.net_amount) - Number(c.value)).toFixed(3)}) — ${p.line_count} SN lines`).join('\n')}
${legacyOnly.length ? `\nLegacy-only: ${legacyOnly.map((c) => c.sn_po + ' (' + c.number + ')').join(', ')}\n` : ''}
## SN-only POs (${snOnly.length}) — never imported into the app
${Object.entries(dep).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

Material SN-only numbers: ${snOnly.filter((p) => !p.is_fixed_asset).map((p) => p.po_number).sort().join(', ')}

## Recommendation
- Retiring the ${L.length} imported rows is safe from a data-loss standpoint once \`po_source\` = sn (only ${withBundles.length} legacy bundle(s) reference a legacy line; they keep working through the legacy branch of \`bundle_transcription\`). The decision is Fouad's; the sync deletes nothing.
- Review the ${dv.length} value delta(s) with accounting (likely later revisions/discounts in SN).
`;
fs.writeFileSync(path.join(ROOT, 'SN_LEGACY_PO_RECONCILIATION.md'), md);
console.log(md.split('\n').slice(0, 24).join('\n'));
