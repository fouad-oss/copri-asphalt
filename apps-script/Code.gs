// ═══════════════════════════════════════════════════════════════════
// COPRI ASPHALT DELIVERY — Google Apps Script Backend v3
// ═══════════════════════════════════════════════════════════════════
// Deploy: Extensions → Apps Script → Deploy → New Deployment
//         Type: Web App | Execute as: Me | Access: Anyone
// After any change: Deploy → Manage → create New Version
//
// IMPORTANT before deploying:
//   File → (gear) Project Settings → check "Time zone" is Asia/Kuwait,
//   and in the SHEET: File → Settings → Time zone = (GMT+03:00) Kuwait.
//   This makes the real-Date timestamps display correctly.
//
// Changes vs v2 (each marked  ✦ FIX  below):
//   1. Timestamps are written as real Date() values, not text strings.
//      → fixes Monthly Summary #VALUE! and makes doGet's instanceof Date
//        branch actually work.
//   2. Display endpoints (note, checkReceipt) format the Date to a clean
//      Kuwait string so the app shows "17/06/2026, 14:17" not raw ISO.
//   3. "نوع الموقع" is stored as an Arabic label, with a reverse-map on
//      read so the app's locationType logic keeps working.
//   4. Server-side duplicate-note guard: a dispatch whose note already
//      exists is not written again (defence-in-depth; the app also checks).
// ═══════════════════════════════════════════════════════════════════

const SHEET_ID       = "1LWCr3w_UF1HHSduHTz4WitRtFpQJBly4w_Wf9EaYGu4";
const DISPATCH_SHEET = "Dispatch Log";
const RECEIPT_SHEET  = "Receipt Log";
const TZ             = "Asia/Kuwait";

// ── Column definitions — change here if you add/remove columns ──────
const DISPATCH_HEADERS = [
  "الطابع الزمني",            // A
  "المشروع",                  // B
  "رقم العقد",                // C
  "رقم أمر العمل",            // D
  "رقم سند التسليم",          // E
  "رقم المصنع",               // F
  "رقم الشاحنة",              // G
  "اسم السائق",               // H
  "نوع الخلطة",               // I
  "الوزن (طن)",               // J
  "درجة الحرارة عند الإرسال", // K
  "الموقع المستلم",           // L
  "القطعة / من كم",           // M
  "الشارع / إلى كم",          // N
  "نوع الموقع",               // O  (قطعة / شارع  أو  نطاق كيلومتر)
  "اسم المشرف",               // P
  "ملاحظات",                  // Q
  "الحالة",                   // R
];

const RECEIPT_HEADERS = [
  "الطابع الزمني",            // A
  "رقم سند التسليم",          // B
  "رقم أمر العمل",            // C
  "اسم المهندس",              // D
  "القرار",                   // E
  "الوزن عند الاستلام (طن)", // F
  "درجة الحرارة عند الوصول", // G
  "ملاحظات",                  // H
];

// ── ✦ FIX 3: location type <-> Arabic label helpers ─────────────────
const LOC_LABEL = { block_street: "قطعة / شارع", km_range: "نطاق كيلومتر" };
// Write a human label to the sheet
function locLabel(code) { return LOC_LABEL[code] || LOC_LABEL.block_street; }
// Read any stored value (new label OR legacy code) back to a code the app understands
function locCode(v) {
  v = String(v || "");
  return (v.indexOf("كيلومتر") > -1 || v.indexOf("km") > -1) ? "km_range" : "block_street";
}

// ── ✦ FIX 2: format a Date cell to a clean Kuwait display string ────
function fmtKW(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, "dd/MM/yyyy, HH:mm");
  return String(v || "");
}
// Return a value suitable for client-side date math (ISO if it's a real Date)
function isoOrRaw(v) {
  return (v instanceof Date) ? v.toISOString() : String(v || "");
}

// ── GET: fetch dispatch row by note number ──────────────────────────
function doGet(e) {
  const ss = SpreadsheetApp.openById(SHEET_ID);

  // ── 1. One-time receipt check ─────────────────────────────────────
  if (e.parameter.checkReceipt) {
    const note    = e.parameter.checkReceipt;
    const receipt = ss.getSheetByName(RECEIPT_SHEET);
    const rData   = receipt.getDataRange().getValues();
    const rh      = rData[0];
    const noteIdx = rh.indexOf("رقم سند التسليم");
    for (let i = 1; i < rData.length; i++) {
      if (String(rData[i][noteIdx]) === String(note)) {
        return jsonResponse({
          alreadyReceived: true,
          engineer:  rData[i][rh.indexOf("اسم المهندس")] || "",
          decision:  rData[i][rh.indexOf("القرار")] || "",
          timestamp: fmtKW(rData[i][rh.indexOf("الطابع الزمني")]), // ✦ FIX 2
        });
      }
    }
    return jsonResponse({ alreadyReceived: false });
  }

  // ── 2. Engineer history (receipts + pending) ─────────────────────
  // Client filters to "today" using the ISO timestamps returned below.
  if (e.parameter.engineer) {
    const engName = e.parameter.engineer;
    const receipt = ss.getSheetByName(RECEIPT_SHEET);
    const rData   = receipt.getDataRange().getValues();
    const rh      = rData[0];
    const disp    = ss.getSheetByName(DISPATCH_SHEET);
    const dData   = disp.getDataRange().getValues();
    const dh      = dData[0];

    // Get all receipts for this engineer
    const receipts = [];
    const receivedNotes = new Set();
    for (let i = 1; i < rData.length; i++) {
      const row = rData[i]; if (!row[0]) continue;
      if (String(row[rh.indexOf("اسم المهندس")]) !== engName) continue;
      const noteNum = String(row[rh.indexOf("رقم سند التسليم")]);
      receivedNotes.add(noteNum);
      // Find matching dispatch row
      let dispRow = null;
      for (let j = 1; j < dData.length; j++) {
        if (String(dData[j][dh.indexOf("رقم سند التسليم")]) === noteNum) { dispRow = dData[j]; break; }
      }
      receipts.push({
        noteNumber:       noteNum,
        timestamp:        isoOrRaw(row[rh.indexOf("الطابع الزمني")]), // ✦ FIX 1/2
        decision:         row[rh.indexOf("القرار")] || "",
        weightArrival:    row[rh.indexOf("الوزن عند الاستلام (طن)")] || "",
        remarks:          row[rh.indexOf("ملاحظات")] || "",
        project:          dispRow ? dispRow[dh.indexOf("المشروع")] || "" : "",
        workOrder:        dispRow ? dispRow[dh.indexOf("رقم أمر العمل")] || "" : "",
        mixType:          dispRow ? dispRow[dh.indexOf("نوع الخلطة")] || "" : "",
        weightDispatched: dispRow ? dispRow[dh.indexOf("الوزن (طن)")] || "" : "",
      });
    }

    // Get all pending dispatches (status = في الطريق, not already received)
    const pending = [];
    for (let i = 1; i < dData.length; i++) {
      const row     = dData[i]; if (!row[0]) continue;
      const status  = String(row[dh.indexOf("الحالة")] || "");
      const noteNum = String(row[dh.indexOf("رقم سند التسليم")]);
      if ((status === "في الطريق" || !status) && !receivedNotes.has(noteNum)) {
        pending.push({
          noteNumber:   noteNum,
          isoTimestamp: isoOrRaw(row[dh.indexOf("الطابع الزمني")]), // ✦ FIX 1
          project:      row[dh.indexOf("المشروع")] || "",
          workOrder:    row[dh.indexOf("رقم أمر العمل")] || "",
          plant:        row[dh.indexOf("رقم المصنع")] || "",
          driverName:   row[dh.indexOf("اسم السائق")] || "",
          mixType:      row[dh.indexOf("نوع الخلطة")] || "",
          weight:       row[dh.indexOf("الوزن (طن)")] || "",
          tempDispatch: row[dh.indexOf("درجة الحرارة عند الإرسال")] || "",
          site:         row[dh.indexOf("الموقع المستلم")] || "",
        });
      }
    }
    return jsonResponse({ receipts, pending });
  }

  // ── 3. Fetch dispatch by note number ──────────────────────────────
  const note = e.parameter.note;
  if (!note) return jsonResponse({ error: "note parameter required" });

  const sheet = ss.getSheetByName(DISPATCH_SHEET);
  const data  = sheet.getDataRange().getValues();
  const h     = data[0]; // headers row

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[h.indexOf("رقم سند التسليم")]) === String(note)) {
      return jsonResponse({
        found: true,
        row: {
          project:      row[h.indexOf("المشروع")] || "",
          contract:     row[h.indexOf("رقم العقد")] || "",
          workOrder:    row[h.indexOf("رقم أمر العمل")] || "",
          noteNumber:   row[h.indexOf("رقم سند التسليم")],
          plant:        row[h.indexOf("رقم المصنع")] || "",
          truckNumber:  row[h.indexOf("رقم الشاحنة")],
          driverName:   row[h.indexOf("اسم السائق")],
          mixType:      row[h.indexOf("نوع الخلطة")],
          weight:       row[h.indexOf("الوزن (طن)")],
          tempDispatch: row[h.indexOf("درجة الحرارة عند الإرسال")],
          site:         row[h.indexOf("الموقع المستلم")],
          block:        row[h.indexOf("القطعة / من كم")] || "",
          street:       row[h.indexOf("الشارع / إلى كم")] || "",
          locationType: locCode(row[h.indexOf("نوع الموقع")]), // ✦ FIX 3: label → code
          clerkName:    row[h.indexOf("اسم المشرف")],
          timestamp:    fmtKW(row[h.indexOf("الطابع الزمني")]),  // ✦ FIX 2
        }
      });
    }
  }
  return jsonResponse({ found: false });
}

// ── POST: write dispatch or receipt row ─────────────────────────────
function doPost(e) {
  try {
    const p  = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(SHEET_ID);

    if (p.type === "dispatch") {
      const dispatch = ss.getSheetByName(DISPATCH_SHEET);

      // ✦ FIX 4: server-side duplicate guard — don't write the same note twice
      const dData   = dispatch.getDataRange().getValues();
      const dh      = dData[0];
      const noteIdx = dh.indexOf("رقم سند التسليم");
      for (let i = 1; i < dData.length; i++) {
        if (String(dData[i][noteIdx]) === String(p.noteNumber)) {
          return jsonResponse({ success: false, duplicate: true });
        }
      }

      dispatch.appendRow([
        new Date(),                       // ✦ FIX 1: real Date, not p.timestamp
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
        locLabel(p.locationType),         // ✦ FIX 3: store Arabic label
        p.clerkName,
        p.remarks   || "",
        "في الطريق",
      ]);
    }

    if (p.type === "receipt") {
      ss.getSheetByName(RECEIPT_SHEET).appendRow([
        new Date(),                       // ✦ FIX 1: real Date, not p.timestamp
        p.noteNumber,
        p.workOrder     || "",
        p.engineerName,
        p.decision,
        p.weightArrival || "",
        p.tempArrival   || "",
        p.remarks       || "",
      ]);

      // Update status in Dispatch Log
      const dispatch = ss.getSheetByName(DISPATCH_SHEET);
      const data     = dispatch.getDataRange().getValues();
      const h        = data[0];
      const noteIdx  = h.indexOf("رقم سند التسليم");
      const statusIdx = h.indexOf("الحالة");
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
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Run once to create/reset sheet headers ──────────────────────────
// Select this function and click Run in the Apps Script editor
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
  Logger.log("✓ Sheets created — Dispatch: " + DISPATCH_HEADERS.length + " cols, Receipt: " + RECEIPT_HEADERS.length + " cols");
}

// ═══════════════════════════════════════════════════════════════════
// ONE-TIME DATA CLEANUP
// ═══════════════════════════════════════════════════════════════════
// Removes the legacy, mis-aligned rows from an earlier form version
// (the ones where the note column holds a mix type like "نموذج I" and
//  the receipt's work-order column holds an engineer name like "مهندس").
//
// SAFE BY DEFAULT: DRY_RUN = true only LOGS what it would delete.
// Review the log (View → Logs), then set DRY_RUN = false and run again.
// ═══════════════════════════════════════════════════════════════════
function cleanupLegacyRows() {
  const DRY_RUN = true;   // ← set to false to actually delete
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let removed = 0;

  // 1) Dispatch Log: delete rows whose note number looks like "نموذج ..."
  const disp   = ss.getSheetByName(DISPATCH_SHEET);
  const dVals  = disp.getDataRange().getValues();
  const dNote  = dVals[0].indexOf("رقم سند التسليم");
  for (let i = dVals.length - 1; i >= 1; i--) {          // bottom-up so indexes stay valid
    if (/نموذج/.test(String(dVals[i][dNote]))) {
      Logger.log((DRY_RUN ? "[dry] " : "") + "Dispatch row " + (i + 1) + " → note=" + dVals[i][dNote]);
      if (!DRY_RUN) disp.deleteRow(i + 1);
      removed++;
    }
  }

  // 2) Receipt Log: delete rows where the work-order column holds "مهندس..."
  //    (symptom of the old shifted schema with no work-order field)
  const rec    = ss.getSheetByName(RECEIPT_SHEET);
  const rVals  = rec.getDataRange().getValues();
  const rWO    = rVals[0].indexOf("رقم أمر العمل");
  for (let i = rVals.length - 1; i >= 1; i--) {
    if (/مهندس/.test(String(rVals[i][rWO]))) {
      Logger.log((DRY_RUN ? "[dry] " : "") + "Receipt row " + (i + 1) + " → workOrder=" + rVals[i][rWO]);
      if (!DRY_RUN) rec.deleteRow(i + 1);
      removed++;
    }
  }

  Logger.log((DRY_RUN ? "DRY RUN — " : "DONE — ") + removed + " row(s) " + (DRY_RUN ? "would be" : "were") + " removed.");
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
  // Logger.log("✓ All data rows cleared (headers kept).");
}
