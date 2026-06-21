// ═══════════════════════════════════════════════════════════════════
// COPRI ASPHALT DELIVERY — Google Apps Script Backend v4
// ═══════════════════════════════════════════════════════════════════
// Deploy: Extensions -> Apps Script -> Deploy -> New Deployment
//         Type: Web App | Execute as: Me | Access: Anyone
// After any change: Deploy -> Manage -> create New Version
//
// IMPORTANT before deploying:
//   File -> (gear) Project Settings -> check "Time zone" is Asia/Kuwait,
//   and in the SHEET: File -> Settings -> Time zone = (GMT+03:00) Kuwait.
//
// v4 note: ALL Arabic strings live in the COL / LABEL constants below,
// one per line. The rest of the code is pure ASCII and refers to them by
// name. This avoids the bidirectional-text corruption that scrambles
// Arabic-in-the-middle-of-code when the file is pasted into the editor.
// ═══════════════════════════════════════════════════════════════════

const SHEET_ID       = "1LWCr3w_UF1HHSduHTz4WitRtFpQJBly4w_Wf9EaYGu4";
const DISPATCH_SHEET = "Dispatch Log";
const RECEIPT_SHEET  = "Receipt Log";
const TZ             = "Asia/Kuwait";

// ── Arabic column names — the ONLY place Arabic appears in code ──────
// Each value is alone on its line (key: "arabic",) which pastes safely.
const COL = {
  ts:          "الطابع الزمني",
  project:     "المشروع",
  contract:    "رقم العقد",
  workOrder:   "رقم أمر العمل",
  note:        "رقم سند التسليم",
  plant:       "رقم المصنع",
  truck:       "رقم الشاحنة",
  driver:      "اسم السائق",
  mix:         "نوع الخلطة",
  weight:      "الوزن (طن)",
  tempDisp:    "درجة الحرارة عند الإرسال",
  site:        "الموقع المستلم",
  block:       "القطعة / من كم",
  street:      "الشارع / إلى كم",
  locType:     "نوع الموقع",
  clerk:       "اسم المشرف",
  remarks:     "ملاحظات",
  status:      "الحالة",
  company:     "الشركة",
  naqel:       "الناقل",
  driverPhone: "هاتف السائق",
  loadNumber:  "رقم الحمولة",
  notifyEng:   "مهندس الإخطار",
  engineer:    "اسم المهندس",
  decision:    "القرار",
  weightArr:   "الوزن عند الاستلام (طن)",
  tempArr:     "درجة الحرارة عند الوصول",
};

// Location-type labels stored in the sheet
const LABEL = {
  block_street: "قطعة / شارع",
  km_range:     "نطاق كيلومتر",
  named:        "اسم الشارع",
};

// Other Arabic literals used by the code
const STATUS_TRANSIT = "في الطريق";
const AR_LEGACY_NOTE = "نموذج";
const AR_LEGACY_WO   = "مهندس";

// ── Column order for each sheet (pure ASCII, built from COL) ─────────
const DISPATCH_HEADERS = [
  COL.ts, COL.project, COL.contract, COL.workOrder, COL.note, COL.plant,
  COL.truck, COL.driver, COL.mix, COL.weight, COL.tempDisp, COL.site,
  COL.block, COL.street, COL.locType, COL.clerk, COL.remarks, COL.status,
  COL.company, COL.naqel, COL.driverPhone, COL.loadNumber, COL.notifyEng,
];

const RECEIPT_HEADERS = [
  COL.ts, COL.note, COL.workOrder, COL.engineer, COL.decision,
  COL.weightArr, COL.tempArr, COL.remarks,
];

// ── Location type <-> label helpers ─────────────────────────────────
function locLabel(code) { return LABEL[code] || LABEL.block_street; }
function locCode(v) {
  v = String(v || "");
  if (v.indexOf(LABEL.named) > -1 || v === "named") return "named";
  if (v.indexOf(LABEL.km_range) > -1 || v.indexOf("km") > -1) return "km_range";
  return "block_street";
}

// ── Date helpers ────────────────────────────────────────────────────
function fmtKW(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, "dd/MM/yyyy, HH:mm");
  return String(v || "");
}
function isoOrRaw(v) {
  return (v instanceof Date) ? v.toISOString() : String(v || "");
}
// Normalize for matching: trim + collapse runs of whitespace to one space.
// Keeps the load count stable when a street name is typed with extra/odd spaces.
function norm(s) { return String(s || "").trim().replace(/\s+/g, " "); }

// Start of the current load-counting shift = the most recent 12:00 noon in
// Kuwait (work runs overnight, so the day boundary is noon, not midnight).
// Kuwait is UTC+3 year-round (no DST), so the +03:00 offset is safe.
function shiftStart() {
  const now      = new Date();
  const ymd      = Utilities.formatDate(now, TZ, "yyyy-MM-dd");
  let   boundary = new Date(ymd + "T12:00:00+03:00");
  if (now.getTime() < boundary.getTime()) boundary = new Date(boundary.getTime() - 86400000);
  return boundary;
}

// ── GET ─────────────────────────────────────────────────────────────
function doGet(e) {
  const ss = SpreadsheetApp.openById(SHEET_ID);

  // 1. One-time receipt check
  if (e.parameter.checkReceipt) {
    const note    = e.parameter.checkReceipt;
    const receipt = ss.getSheetByName(RECEIPT_SHEET);
    const rData   = receipt.getDataRange().getValues();
    const rh      = rData[0];
    const noteIdx = rh.indexOf(COL.note);
    for (let i = 1; i < rData.length; i++) {
      if (String(rData[i][noteIdx]) === String(note)) {
        return jsonResponse({
          alreadyReceived: true,
          engineer:  rData[i][rh.indexOf(COL.engineer)] || "",
          decision:  rData[i][rh.indexOf(COL.decision)] || "",
          timestamp: fmtKW(rData[i][rh.indexOf(COL.ts)]),
        });
      }
    }
    return jsonResponse({ alreadyReceived: false });
  }

  // 1b. Next load number for an exact location this shift
  // Counts dispatch rows matching project + site + block + street whose
  // timestamp is at/after the most recent noon (Kuwait), then returns +1.
  // (For a named street the name is stored in block with street empty, so it
  // is counted the same way.) Each dispatch advances the count immediately —
  // no receipt confirmation from the site is required.
  if (e.parameter.nextLoad) {
    const proj     = norm(e.parameter.project);
    const site     = norm(e.parameter.site);
    const block    = norm(e.parameter.block);
    const street   = norm(e.parameter.street);
    const siteOnly = !!e.parameter.siteOnly;   // count by project+site only (block/street optional)
    const sheet  = ss.getSheetByName(DISPATCH_SHEET);
    const data   = sheet.getDataRange().getValues();
    const h      = data[0];
    const tsIdx  = h.indexOf(COL.ts);
    const pIdx   = h.indexOf(COL.project);
    const sIdx   = h.indexOf(COL.site);
    const bIdx   = h.indexOf(COL.block);
    const stIdx  = h.indexOf(COL.street);
    const boundary = shiftStart().getTime();
    let count = 0;
    for (let i = 1; i < data.length; i++) {
      const row = data[i]; if (!row[0]) continue;
      const t = row[tsIdx];
      if (!(t instanceof Date) || t.getTime() < boundary) continue;
      if (norm(row[pIdx]) !== proj) continue;
      if (norm(row[sIdx]) !== site) continue;
      if (!siteOnly) {
        if (norm(row[bIdx])  !== block)  continue;
        if (norm(row[stIdx]) !== street) continue;
      }
      count++;
    }
    return jsonResponse({ count: count, next: count + 1 });
  }

  // 2. Engineer history (receipts + pending)
  if (e.parameter.engineer) {
    const engName = e.parameter.engineer;
    const receipt = ss.getSheetByName(RECEIPT_SHEET);
    const rData   = receipt.getDataRange().getValues();
    const rh      = rData[0];
    const disp    = ss.getSheetByName(DISPATCH_SHEET);
    const dData   = disp.getDataRange().getValues();
    const dh      = dData[0];

    const receipts = [];
    const receivedNotes = new Set();
    for (let i = 1; i < rData.length; i++) {
      const row = rData[i]; if (!row[0]) continue;
      if (String(row[rh.indexOf(COL.engineer)]) !== engName) continue;
      const noteNum = String(row[rh.indexOf(COL.note)]);
      receivedNotes.add(noteNum);
      let dispRow = null;
      for (let j = 1; j < dData.length; j++) {
        if (String(dData[j][dh.indexOf(COL.note)]) === noteNum) { dispRow = dData[j]; break; }
      }
      receipts.push({
        noteNumber:       noteNum,
        timestamp:        isoOrRaw(row[rh.indexOf(COL.ts)]),
        decision:         row[rh.indexOf(COL.decision)] || "",
        weightArrival:    row[rh.indexOf(COL.weightArr)] || "",
        remarks:          row[rh.indexOf(COL.remarks)] || "",
        project:          dispRow ? dispRow[dh.indexOf(COL.project)] || "" : "",
        workOrder:        dispRow ? dispRow[dh.indexOf(COL.workOrder)] || "" : "",
        mixType:          dispRow ? dispRow[dh.indexOf(COL.mix)] || "" : "",
        weightDispatched: dispRow ? dispRow[dh.indexOf(COL.weight)] || "" : "",
        loadNumber:       dispRow ? dispRow[dh.indexOf(COL.loadNumber)] || "" : "",
      });
    }

    const pending = [];
    const notifyIdx = dh.indexOf(COL.notifyEng);
    for (let i = 1; i < dData.length; i++) {
      const row     = dData[i]; if (!row[0]) continue;
      const status  = String(row[dh.indexOf(COL.status)] || "");
      const noteNum = String(row[dh.indexOf(COL.note)]);
      // Only this engineer's assigned loads. Excludes plant-only dispatches
      // (e.g. Green Line) which have no notified engineer.
      const notifiedEng = notifyIdx > -1 ? String(row[notifyIdx] || "").trim() : "";
      if (notifiedEng !== String(engName).trim()) continue;
      if ((status === STATUS_TRANSIT || !status) && !receivedNotes.has(noteNum)) {
        pending.push({
          noteNumber:   noteNum,
          isoTimestamp: isoOrRaw(row[dh.indexOf(COL.ts)]),
          project:      row[dh.indexOf(COL.project)] || "",
          workOrder:    row[dh.indexOf(COL.workOrder)] || "",
          plant:        row[dh.indexOf(COL.plant)] || "",
          naqel:        row[dh.indexOf(COL.naqel)] || "",
          driverName:   row[dh.indexOf(COL.driver)] || "",
          driverPhone:  row[dh.indexOf(COL.driverPhone)] || "",
          mixType:      row[dh.indexOf(COL.mix)] || "",
          weight:       row[dh.indexOf(COL.weight)] || "",
          tempDispatch: row[dh.indexOf(COL.tempDisp)] || "",
          site:         row[dh.indexOf(COL.site)] || "",
          loadNumber:   row[dh.indexOf(COL.loadNumber)] || "",
        });
      }
    }
    return jsonResponse({ receipts, pending });
  }

  // 3. Fetch dispatch by note number
  const note = e.parameter.note;
  if (!note) return jsonResponse({ error: "note parameter required" });

  const sheet = ss.getSheetByName(DISPATCH_SHEET);
  const data  = sheet.getDataRange().getValues();
  const h     = data[0];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[h.indexOf(COL.note)]) === String(note)) {
      return jsonResponse({
        found: true,
        row: {
          project:      row[h.indexOf(COL.project)] || "",
          contract:     row[h.indexOf(COL.contract)] || "",
          workOrder:    row[h.indexOf(COL.workOrder)] || "",
          noteNumber:   row[h.indexOf(COL.note)],
          plant:        row[h.indexOf(COL.plant)] || "",
          truckNumber:  row[h.indexOf(COL.truck)],
          naqel:        row[h.indexOf(COL.naqel)] || "",
          driverName:   row[h.indexOf(COL.driver)],
          driverPhone:  row[h.indexOf(COL.driverPhone)] || "",
          company:      row[h.indexOf(COL.company)] || "",
          mixType:      row[h.indexOf(COL.mix)],
          weight:       row[h.indexOf(COL.weight)],
          tempDispatch: row[h.indexOf(COL.tempDisp)],
          site:         row[h.indexOf(COL.site)],
          block:        row[h.indexOf(COL.block)] || "",
          street:       row[h.indexOf(COL.street)] || "",
          locationType: locCode(row[h.indexOf(COL.locType)]),
          clerkName:    row[h.indexOf(COL.clerk)],
          loadNumber:   row[h.indexOf(COL.loadNumber)] || "",
          timestamp:    fmtKW(row[h.indexOf(COL.ts)]),
        }
      });
    }
  }
  return jsonResponse({ found: false });
}

// ── POST ────────────────────────────────────────────────────────────
function doPost(e) {
  // Serialize writes so the duplicate-note guard is atomic. Without this,
  // two near-simultaneous submits can both pass the check and double-write.
  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); }
  catch (err) { return jsonResponse({ success: false, error: "busy, please retry" }); }
  try {
    const p  = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(SHEET_ID);

    if (p.type === "dispatch") {
      const dispatch = ss.getSheetByName(DISPATCH_SHEET);

      // Server-side duplicate guard — don't write the same note twice
      const dData   = dispatch.getDataRange().getValues();
      const dh      = dData[0];
      const noteIdx = dh.indexOf(COL.note);
      for (let i = 1; i < dData.length; i++) {
        if (String(dData[i][noteIdx]) === String(p.noteNumber)) {
          return jsonResponse({ success: false, duplicate: true });
        }
      }

      // Must match DISPATCH_HEADERS order exactly
      dispatch.appendRow([
        new Date(),
        p.project   || "",
        p.contract  || "",
        p.workOrder || "",
        p.noteNumber,
        p.plant     || "",
        p.truckNumber,
        p.driverName,
        p.mixType,
        p.weight,
        p.tempDispatch,
        p.site,
        p.block        || "",
        p.street       || "",
        locLabel(p.locationType),
        p.clerkName,
        p.remarks   || "",
        STATUS_TRANSIT,
        p.company     || "",
        p.naqel       || "",
        p.driverPhone || "",
        p.loadNumber  || "",
        p.notifyEngineer || "",
      ]);
      SpreadsheetApp.flush();   // commit before releasing the lock
    }

    if (p.type === "receipt") {
      // Must match RECEIPT_HEADERS order exactly
      ss.getSheetByName(RECEIPT_SHEET).appendRow([
        new Date(),
        p.noteNumber,
        p.workOrder     || "",
        p.engineerName,
        p.decision,
        p.weightArrival || "",
        p.tempArrival   || "",
        p.remarks       || "",
      ]);

      // Update status in Dispatch Log
      const dispatch  = ss.getSheetByName(DISPATCH_SHEET);
      const data      = dispatch.getDataRange().getValues();
      const h         = data[0];
      const noteIdx   = h.indexOf(COL.note);
      const statusIdx = h.indexOf(COL.status);
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][noteIdx]) === String(p.noteNumber)) {
          dispatch.getRange(i + 1, statusIdx + 1).setValue(p.decision);
          break;
        }
      }
    }

    return jsonResponse({ success: true });
  } catch (err) {
    return jsonResponse({ error: err.message });
  } finally {
    lock.releaseLock();
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Run once to create/reset sheet headers ──────────────────────────
// Select this function and click Run in the Apps Script editor.
function setupSheets() {
  const ss = SpreadsheetApp.openById(SHEET_ID);

  function setupSheet(name, headers, headerColor) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    const range = sheet.getRange(1, 1, 1, headers.length);
    range.setValues([headers]);
    range.setFontWeight("bold")
         .setBackground("#1a1a2e")
         .setFontColor(headerColor)
         .setFontSize(10);
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, headers.length, 140);
  }

  setupSheet(DISPATCH_SHEET, DISPATCH_HEADERS, "#00A651");
  setupSheet(RECEIPT_SHEET,  RECEIPT_HEADERS,  "#00A651");

  SpreadsheetApp.flush();
  Logger.log("Sheets ready - Dispatch: " + DISPATCH_HEADERS.length + " cols, Receipt: " + RECEIPT_HEADERS.length + " cols");
}

// ═══════════════════════════════════════════════════════════════════
// ONE-TIME DATA CLEANUP
// ═══════════════════════════════════════════════════════════════════
// Removes legacy mis-aligned rows from an earlier form version.
// SAFE BY DEFAULT: DRY_RUN = true only LOGS what it would delete.
// Review the log (View -> Logs), then set DRY_RUN = false and run again.
// ═══════════════════════════════════════════════════════════════════
function cleanupLegacyRows() {
  const DRY_RUN = true;   // set to false to actually delete
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const reNote = new RegExp(AR_LEGACY_NOTE);
  const reWO   = new RegExp(AR_LEGACY_WO);
  let removed = 0;

  const disp   = ss.getSheetByName(DISPATCH_SHEET);
  const dVals  = disp.getDataRange().getValues();
  const dNote  = dVals[0].indexOf(COL.note);
  for (let i = dVals.length - 1; i >= 1; i--) {
    if (reNote.test(String(dVals[i][dNote]))) {
      Logger.log((DRY_RUN ? "[dry] " : "") + "Dispatch row " + (i + 1));
      if (!DRY_RUN) disp.deleteRow(i + 1);
      removed++;
    }
  }

  const rec    = ss.getSheetByName(RECEIPT_SHEET);
  const rVals  = rec.getDataRange().getValues();
  const rWO    = rVals[0].indexOf(COL.workOrder);
  for (let i = rVals.length - 1; i >= 1; i--) {
    if (reWO.test(String(rVals[i][rWO]))) {
      Logger.log((DRY_RUN ? "[dry] " : "") + "Receipt row " + (i + 1));
      if (!DRY_RUN) rec.deleteRow(i + 1);
      removed++;
    }
  }

  Logger.log((DRY_RUN ? "DRY RUN - " : "DONE - ") + removed + " row(s) affected.");
}

// ═══════════════════════════════════════════════════════════════════
// OPTIONAL: wipe ALL data rows (keep headers) for a clean go-live start.
// Irreversible. Uncomment the body and run only if you want a fresh sheet.
// ═══════════════════════════════════════════════════════════════════
function wipeAllData() {
  // const ss = SpreadsheetApp.openById(SHEET_ID);
  // [DISPATCH_SHEET, RECEIPT_SHEET].forEach(function (name) {
  //   const sh = ss.getSheetByName(name);
  //   const last = sh.getLastRow();
  //   if (last > 1) sh.deleteRows(2, last - 1);
  // });
  // Logger.log("All data rows cleared (headers kept).");
}
