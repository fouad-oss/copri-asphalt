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

// ── Daily work-day report config + labels (Arabic isolated here) ─────
const REPORT_FOLDER  = "Copri Asphalt Daily Reports";
const REPORT_EMAIL   = "fszoghby@gmail.com";   // "" to skip email
const DAILYOPS_SHEET = "Daily Operations";     // tab rebuilt by rebuildDailyOps()
// Company name counted as the "Copri side" of the reports
const COPRI_COMPANY = "كوبري";
const REP = {
  menuTitle:   "تقارير كوبري",
  menuCurrent: "وردية اليوم الحالية (PDF)",
  menuPrev:    "الوردية السابقة (PDF)",
  menuOps:     "تحديث العمليات اليومية",
  done:        "تم إنشاء التقارير وحفظها في Drive وإرسالها بالبريد.",
  doneOps:     "تم تحديث جدول العمليات اليومية.",
  opsTitle:    "العمليات اليومية (حسب يوم العمل)",
  updated:     "آخر تحديث",
  dailySummary:"ملخص يومي",
  workDayCol:  "يوم العمل",
  copriLoads:  "حمولات كوبري",
  copriTons:   "وزن كوبري (طن)",
  otherLoads:  "حمولات أخرى",
  otherTons:   "وزن أخرى (طن)",
  hTempDisp:   "حرارة الإرسال",
  hTempArr:    "حرارة الوصول",
  plantTitle:  "تقرير المصنع اليومي",
  copriTitle:  "تقرير كوبري اليومي",
  workDay:     "يوم العمل (من الظهر إلى الظهر)",
  totalLoads:  "إجمالي الحمولات",
  totalTons:   "إجمالي الوزن (طن)",
  byPlant:     "حسب المصنع",
  byMix:       "حسب نوع الخلطة",
  byCompany:   "حسب الشركة",
  details:     "التفاصيل",
  noData:      "لا توجد بيانات لهذه الوردية",
  loads:       "حمولات",
  tons:        "طن",
  hTime:       "الوقت",
  hNote:       "رقم السند",
  hProject:    "المشروع",
  hSite:       "الموقع",
  hMix:        "الخلطة",
  hTons:       "الوزن",
  hTemp:       "الحرارة",
  hDriver:     "السائق",
  hPlant:      "المصنع",
  hLoad:       "الحمولة",
  hStatus:     "الحالة",
  hWO:         "أمر العمل",
  hCompany:    "الشركة",
};

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

// ═══════════════════════════════════════════════════════════════════
// DAILY WORK-DAY REPORTS (PDF)  — plant side + Copri side
// ═══════════════════════════════════════════════════════════════════
// Work day = noon..noon (Kuwait), matching the load counter. Generates two
// PDFs for a shift, saves them to a Drive folder, and emails them.
//   - Sheet menu (reload the sheet to see it): REP.menuTitle
//   - Auto-daily: run createReportTrigger() once to install a ~12:15 trigger
//     that reports the just-closed shift.
// All Arabic comes from REP / data values — the builders below are ASCII.

// Sheet menu (simple trigger; appears after reloading the spreadsheet)
function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu(REP.menuTitle)
      .addItem(REP.menuCurrent, "generateCurrentShiftReports")
      .addItem(REP.menuPrev,    "generatePreviousShiftReports")
      .addSeparator()
      .addItem(REP.menuOps,     "rebuildDailyOps")
      .addToUi();
  } catch (e) { /* not in a UI context */ }
}

// The noon..noon window (ms) that contains the given instant.
function shiftWindow(anchorMs) {
  const anchor = new Date(anchorMs);
  const ymd    = Utilities.formatDate(anchor, TZ, "yyyy-MM-dd");
  const noon   = new Date(ymd + "T12:00:00+03:00").getTime();
  if (anchorMs >= noon) return { start: noon, end: noon + 86400000 };
  return { start: noon - 86400000, end: noon };
}

// Collect dispatch rows in the window, each joined with its receipt (if any).
function collectShift(win) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const d  = ss.getSheetByName(DISPATCH_SHEET).getDataRange().getValues();
  const dh = d[0];
  const r  = ss.getSheetByName(RECEIPT_SHEET).getDataRange().getValues();
  const rh = r[0];

  const recByNote = {};
  const rNote = rh.indexOf(COL.note), rDec = rh.indexOf(COL.decision),
        rTempArr = rh.indexOf(COL.tempArr), rWeightArr = rh.indexOf(COL.weightArr);
  for (let i = 1; i < r.length; i++) {
    const note = String(r[i][rNote] || ""); if (!note) continue;
    recByNote[note] = { decision: r[i][rDec] || "", tempArr: r[i][rTempArr] || "", weightArr: r[i][rWeightArr] || "" };
  }

  const ix = {
    ts: dh.indexOf(COL.ts), note: dh.indexOf(COL.note), company: dh.indexOf(COL.company),
    project: dh.indexOf(COL.project), site: dh.indexOf(COL.site), mix: dh.indexOf(COL.mix),
    weight: dh.indexOf(COL.weight), tempDisp: dh.indexOf(COL.tempDisp), driver: dh.indexOf(COL.driver),
    plant: dh.indexOf(COL.plant), wo: dh.indexOf(COL.workOrder), load: dh.indexOf(COL.loadNumber),
    status: dh.indexOf(COL.status),
  };
  const out = [];
  for (let j = 1; j < d.length; j++) {
    const row = d[j]; const t = row[ix.ts];
    if (!(t instanceof Date)) continue;
    const ms = t.getTime();
    if (ms < win.start || ms >= win.end) continue;
    const note = String(row[ix.note] || "");
    const rec  = recByNote[note] || null;
    out.push({
      time: Utilities.formatDate(t, TZ, "HH:mm"),
      note: note,
      company: row[ix.company] || "",
      project: row[ix.project] || "",
      site: row[ix.site] || "",
      mix: row[ix.mix] || "",
      tons: Number(row[ix.weight]) || 0,
      tempDisp: row[ix.tempDisp] || "",
      driver: row[ix.driver] || "",
      plant: row[ix.plant] || "",
      workOrder: row[ix.wo] || "",
      load: row[ix.load] || "",
      status: String(row[ix.status] || ""),
      decision: rec ? rec.decision : "",
      tempArr: rec ? rec.tempArr : "",
    });
  }
  return out;
}

function esc_(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function fmt2_(n) { return (Math.round((Number(n) || 0) * 100) / 100).toFixed(2); }
function reportCss_() {
  return "<style>" +
    "body{font-family:Arial,'Arial Unicode MS',sans-serif;direction:rtl;color:#111;font-size:11px;}" +
    "h1{font-size:16px;color:#007A3D;margin:0 0 2px;}" +
    ".sub{color:#555;font-size:10px;margin-bottom:8px;}" +
    "h2{font-size:12px;background:#1a1a2e;color:#fff;padding:3px 6px;margin:10px 0 4px;}" +
    "table{border-collapse:collapse;width:100%;margin-bottom:6px;}" +
    "th,td{border:1px solid #999;padding:2px 4px;text-align:center;font-size:10px;}" +
    "th{background:#eee;}.tot{font-weight:bold;background:#e8f5ee;font-size:11px;}" +
    "</style>";
}
function workDayLabel_(win) {
  return Utilities.formatDate(new Date(win.start), TZ, "dd/MM/yyyy HH:mm") + " — " +
         Utilities.formatDate(new Date(win.end),   TZ, "dd/MM/yyyy HH:mm");
}

// Plant-side: every dispatch this shift, with totals by plant and by mix.
function plantReportHtml_(rows, win) {
  let totalTons = 0; const byPlant = {}, byMix = {};
  rows.forEach(function (x) {
    totalTons += x.tons;
    (byPlant[x.plant] = byPlant[x.plant] || { loads: 0, tons: 0 }); byPlant[x.plant].loads++; byPlant[x.plant].tons += x.tons;
    (byMix[x.mix] = byMix[x.mix] || { loads: 0, tons: 0 }); byMix[x.mix].loads++; byMix[x.mix].tons += x.tons;
  });
  let h = reportCss_();
  h += "<h1>" + REP.plantTitle + "</h1><div class='sub'>" + REP.workDay + ": " + workDayLabel_(win) + "</div>";
  h += "<table><tr><td class='tot'>" + REP.totalLoads + ": " + rows.length + "</td><td class='tot'>" + REP.totalTons + ": " + fmt2_(totalTons) + "</td></tr></table>";
  function totTable(title, obj, head) {
    let t = "<h2>" + title + "</h2><table><tr><th>" + head + "</th><th>" + REP.loads + "</th><th>" + REP.tons + "</th></tr>";
    Object.keys(obj).forEach(function (k) { t += "<tr><td>" + esc_(k) + "</td><td>" + obj[k].loads + "</td><td>" + fmt2_(obj[k].tons) + "</td></tr>"; });
    return t + "</table>";
  }
  h += totTable(REP.byPlant, byPlant, REP.hPlant);
  h += totTable(REP.byMix, byMix, REP.hMix);
  h += "<h2>" + REP.details + "</h2>";
  if (!rows.length) return h + "<div>" + REP.noData + "</div>";
  h += "<table><tr><th>" + REP.hTime + "</th><th>" + REP.hNote + "</th><th>" + REP.hCompany + "</th><th>" + REP.hSite + "</th><th>" + REP.hMix + "</th><th>" + REP.hTons + "</th><th>" + REP.hTemp + "</th><th>" + REP.hPlant + "</th><th>" + REP.hDriver + "</th><th>" + REP.hStatus + "</th></tr>";
  rows.forEach(function (x) {
    h += "<tr><td>" + esc_(x.time) + "</td><td>" + esc_(x.note) + "</td><td>" + esc_(x.company) + "</td><td>" + esc_(x.site) + "</td><td>" + esc_(x.mix) + "</td><td>" + fmt2_(x.tons) + "</td><td>" + esc_(x.tempDisp) + "</td><td>" + esc_(x.plant) + "</td><td>" + esc_(x.driver) + "</td><td>" + esc_(x.status) + "</td></tr>";
  });
  return h + "</table>";
}

// Copri-side: Copri company only, grouped by project / site with receipt status.
function copriReportHtml_(allRows, win) {
  const rows = allRows.filter(function (x) { return String(x.company).trim() === COPRI_COMPANY; });
  let h = reportCss_();
  h += "<h1>" + REP.copriTitle + "</h1><div class='sub'>" + REP.workDay + ": " + workDayLabel_(win) + "</div>";
  if (!rows.length) return h + "<div>" + REP.noData + "</div>";
  let gTons = 0; rows.forEach(function (x) { gTons += x.tons; });
  h += "<table><tr><td class='tot'>" + REP.totalLoads + ": " + rows.length + "</td><td class='tot'>" + REP.totalTons + ": " + fmt2_(gTons) + "</td></tr></table>";
  const groups = {};
  rows.forEach(function (x) {
    const p = x.project || "-", s = x.site || "-";
    (groups[p] = groups[p] || {}); (groups[p][s] = groups[p][s] || []).push(x);
  });
  Object.keys(groups).forEach(function (p) {
    Object.keys(groups[p]).forEach(function (s) {
      const list = groups[p][s]; let st = 0; list.forEach(function (x) { st += x.tons; });
      h += "<h2>" + esc_(p) + " / " + esc_(s) + " — " + list.length + " " + REP.loads + " · " + fmt2_(st) + " " + REP.tons + "</h2>";
      h += "<table><tr><th>" + REP.hTime + "</th><th>" + REP.hNote + "</th><th>" + REP.hLoad + "</th><th>" + REP.hWO + "</th><th>" + REP.hMix + "</th><th>" + REP.hTons + "</th><th>" + REP.hTemp + "</th><th>" + REP.hStatus + "</th></tr>";
      list.forEach(function (x) {
        const status = x.decision ? x.decision : x.status;
        h += "<tr><td>" + esc_(x.time) + "</td><td>" + esc_(x.note) + "</td><td>" + esc_(x.load) + "</td><td>" + esc_(x.workOrder) + "</td><td>" + esc_(x.mix) + "</td><td>" + fmt2_(x.tons) + "</td><td>" + esc_(x.tempArr || x.tempDisp) + "</td><td>" + esc_(status) + "</td></tr>";
      });
      h += "</table>";
    });
  });
  return h;
}

function reportFolder_() {
  const it = DriveApp.getFoldersByName(REPORT_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(REPORT_FOLDER);
}

// Generate both PDFs for the shift containing anchorMs; save to Drive + email.
function generateReportsForShift(anchorMs) {
  const win  = shiftWindow(anchorMs);
  const rows = collectShift(win);
  const day  = Utilities.formatDate(new Date(win.start), TZ, "yyyy-MM-dd");
  const plantPdf = Utilities.newBlob(plantReportHtml_(rows, win), "text/html", "p.html").getAs("application/pdf").setName("Plant_" + day + ".pdf");
  const copriPdf = Utilities.newBlob(copriReportHtml_(rows, win), "text/html", "c.html").getAs("application/pdf").setName("Copri_" + day + ".pdf");
  const folder = reportFolder_();
  folder.createFile(plantPdf);
  folder.createFile(copriPdf);
  if (REPORT_EMAIL) {
    MailApp.sendEmail({
      to: REPORT_EMAIL,
      subject: "Copri Asphalt daily reports - " + day,
      body: "Plant-side and Copri-side work-day reports attached.\nWork day: " + workDayLabel_(win),
      attachments: [plantPdf, copriPdf],
    });
  }
  return win;
}

function generateCurrentShiftReports() {
  generateReportsForShift(Date.now());
  try { SpreadsheetApp.getUi().alert(REP.done); } catch (e) {}
}
function generatePreviousShiftReports() {
  const cur = shiftWindow(Date.now());
  generateReportsForShift(cur.start - 1000);   // anchor just before this shift's noon
  try { SpreadsheetApp.getUi().alert(REP.done); } catch (e) {}
}
// Installed time-trigger handler: report the just-closed shift + refresh ops.
function dailyReportTrigger() {
  const cur = shiftWindow(Date.now());
  generateReportsForShift(cur.start - 1000);
  try { rebuildDailyOps(); } catch (e) {}
}

// The work-day (noon-shift) date string for a timestamp.
function workDayKey(ms) {
  return Utilities.formatDate(new Date(shiftWindow(ms).start), TZ, "yyyy-MM-dd");
}

// Rebuild the "Daily Operations" tab grouped by work day (noon-to-noon):
// a per-day summary followed by the per-load detail with a work-day column.
function rebuildDailyOps() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(DAILYOPS_SHEET) || ss.insertSheet(DAILYOPS_SHEET);
  sh.clear();
  sh.setRightToLeft(true);

  const d = ss.getSheetByName(DISPATCH_SHEET).getDataRange().getValues(); const dh = d[0];
  const r = ss.getSheetByName(RECEIPT_SHEET).getDataRange().getValues(); const rh = r[0];

  const recByNote = {};
  const rNote = rh.indexOf(COL.note), rDec = rh.indexOf(COL.decision), rTempArr = rh.indexOf(COL.tempArr);
  for (let i = 1; i < r.length; i++) {
    const n = String(r[i][rNote] || ""); if (!n) continue;
    recByNote[n] = { decision: r[i][rDec] || "", tempArr: r[i][rTempArr] || "" };
  }

  const ix = {
    ts: dh.indexOf(COL.ts), note: dh.indexOf(COL.note), company: dh.indexOf(COL.company),
    project: dh.indexOf(COL.project), site: dh.indexOf(COL.site), mix: dh.indexOf(COL.mix),
    weight: dh.indexOf(COL.weight), tempDisp: dh.indexOf(COL.tempDisp), driver: dh.indexOf(COL.driver),
    plant: dh.indexOf(COL.plant), load: dh.indexOf(COL.loadNumber), status: dh.indexOf(COL.status),
  };

  const round2 = function (n) { return Math.round((Number(n) || 0) * 100) / 100; };
  const summary = {}; const details = [];
  for (let j = 1; j < d.length; j++) {
    const row = d[j]; const t = row[ix.ts]; if (!(t instanceof Date)) continue;
    const wd = workDayKey(t.getTime());
    const company = row[ix.company] || ""; const tons = Number(row[ix.weight]) || 0;
    const note = String(row[ix.note] || ""); const rec = recByNote[note] || null;
    const isCopri = String(company).trim() === COPRI_COMPANY;
    const s = (summary[wd] = summary[wd] || { loads: 0, tons: 0, cL: 0, cT: 0, oL: 0, oT: 0 });
    s.loads++; s.tons += tons;
    if (isCopri) { s.cL++; s.cT += tons; } else { s.oL++; s.oT += tons; }
    details.push([
      t.getTime(),  // sort key (removed before write)
      wd, Utilities.formatDate(t, TZ, "HH:mm"), note, company,
      row[ix.project] || "", row[ix.site] || "", row[ix.mix] || "", round2(tons),
      row[ix.tempDisp] || "", rec ? rec.tempArr : "", row[ix.driver] || "",
      row[ix.plant] || "", row[ix.load] || "",
      (rec && rec.decision) ? rec.decision : String(row[ix.status] || ""),
    ]);
  }
  details.sort(function (a, b) { return a[0] - b[0]; });
  details.forEach(function (x) { x.shift(); });   // drop sort key

  const W = 15;  // max columns (detail width)
  const rows = [];
  const pad = function (a) { while (a.length < W) a.push(""); return a; };
  const mark = { titles: [], headers: [], sections: [] };
  const add = function (a) { rows.push(pad(a)); return rows.length; };  // 1-based row index

  mark.titles.push(add([REP.opsTitle]));
  add([REP.updated + ": " + Utilities.formatDate(new Date(), TZ, "dd/MM/yyyy HH:mm")]);
  add([]);
  mark.sections.push(add([REP.dailySummary]));
  mark.headers.push(add([REP.workDayCol, REP.totalLoads, REP.totalTons, REP.copriLoads, REP.copriTons, REP.otherLoads, REP.otherTons]));
  Object.keys(summary).sort().forEach(function (wd) {
    const s = summary[wd];
    add([wd, s.loads, round2(s.tons), s.cL, round2(s.cT), s.oL, round2(s.oT)]);
  });
  add([]);
  mark.sections.push(add([REP.details]));
  mark.headers.push(add([
    REP.workDayCol, REP.hTime, REP.hNote, REP.hCompany, REP.hProject, REP.hSite, REP.hMix,
    REP.hTons, REP.hTempDisp, REP.hTempArr, REP.hDriver, REP.hPlant, REP.hLoad, REP.hStatus,
  ]));
  details.forEach(function (x) { add(x); });

  sh.getRange(1, 1, rows.length, W).setValues(rows);

  // Formatting
  mark.titles.forEach(function (rIdx) {
    sh.getRange(rIdx, 1).setFontSize(14).setFontWeight("bold").setFontColor("#007A3D");
  });
  mark.sections.forEach(function (rIdx) {
    sh.getRange(rIdx, 1).setFontWeight("bold").setFontSize(12);
  });
  mark.headers.forEach(function (rIdx) {
    sh.getRange(rIdx, 1, 1, W).setFontWeight("bold").setBackground("#1a1a2e").setFontColor("#ffffff");
  });
  sh.setFrozenRows(0);
  try { sh.autoResizeColumns(1, W); } catch (e) {}

  try { SpreadsheetApp.getUi().alert(REP.doneOps); } catch (e) {}
}
// Run once to install the daily ~12:15 trigger (just after the noon boundary).
function createReportTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "dailyReportTrigger") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("dailyReportTrigger").timeBased().atHour(12).nearMinute(15).everyDays(1).create();
}
