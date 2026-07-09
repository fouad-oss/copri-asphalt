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
const STATUS_NA      = "لا ينطبق";

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
  menuBackfill:"إنشاء تقارير كل أيام العمل (مرة واحدة)",
  menuFixWO:   "تصحيح أوامر العمل للبيانات السابقة",
  menuOps:     "تحديث العمليات اليومية",
  menuClean:   "تحديث بيانات Looker (Asphalt — Clean)",
  doneBackfill:"تم إنشاء تقارير جميع أيام العمل وحفظها في Drive.",
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
  hDelta:      "مدة الوصول",
  plantTitle:  "تقرير المصنع اليومي",
  copriTitle:  "تقرير كوبري اليومي",
  workDay:     "يوم العمل (من الظهر إلى الظهر)",
  totalLoads:  "إجمالي الحمولات",
  totalTons:   "إجمالي الوزن (طن)",
  byPlant:     "حسب المصنع",
  bySite:      "حسب الموقع",
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
  contractNo:  "رقم العقد",
  footer:      "كوبري للمشاريع الإنشائية — منظومة التتبع الرقمي",
};

// ── Weekly / monthly period reports ─────────────────────────────────
// Days use the same noon-to-noon boundary as the daily report. A "week"
// is 7 such work-days starting on the weekday below; a "month" is the
// calendar month (1st noon → 1st-of-next-month noon).
//   WEEK_START_U: ISO weekday the week begins on — 1=Mon … 7=Sun.
//   6 = Saturday (Kuwait week). Change this one value to move the boundary.
const WEEK_START_U = 6;
// Arabic labels for the period reports (kept out of the ASCII code, like REP).
const REPP = {
  menuWeekCur:  "تقرير الأسبوع الحالي (PDF)",
  menuWeekPrev: "تقرير الأسبوع السابق (PDF)",
  menuMonthCur: "تقرير الشهر الحالي (PDF)",
  menuMonthPrev:"تقرير الشهر السابق (PDF)",
  weekPlantTitle:  "تقرير المصنع الأسبوعي",
  weekCopriTitle:  "تقرير كوبري الأسبوعي",
  monthPlantTitle: "تقرير المصنع الشهري",
  monthCopriTitle: "تقرير كوبري الشهري",
  periodWeek:  "الأسبوع",
  periodMonth: "الشهر",
  days:        "أيام",
  flagsTitle:  "التنبيهات",
  flagsCard:   "التنبيهات",
  noFlags:     "لا توجد تنبيهات لهذه الفترة",
  flagType:    "نوع التنبيه",
  flagNotReceived: "لم يُستلم",
  flagTempDrop:    "انخفاض حرارة",
  flagRemarks:     "ملاحظات المهندس",
  hDate:       "التاريخ",
  hRemarks:    "الملاحظات",
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

  // Milling module (separable) — returns a response if it handled the request.
  const _mg = millingDoGet_(e);
  if (_mg) return _mg;

  // Materials module (separable) — returns a response if it handled the request.
  const _mat = materialsDoGet_(e);
  if (_mat) return _mat;

  // Cheap "did reference change?" probe — reads only the max file-modified time
  // across the ref files (cached 20s). The client polls this and only pulls the
  // full ?ref=1 payload when this value changes.
  if (e.parameter.refver) return ContentService.createTextOutput(JSON.stringify({ version: readRefVersion_() }))
    .setMimeType(ContentService.MimeType.JSON);

  // Staff-editable reference data (streets / work orders / sites / drivers /
  // settings / access) — the web app reads this at load and overlays defaults.
  if (e.parameter.ref) return ContentService.createTextOutput(readReferenceCached_(e.parameter.nocache))
    .setMimeType(ContentService.MimeType.JSON);

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

    // Milling module (separable) — returns a response if it handled the action.
    const _mp = millingDoPost_(p);
    if (_mp) return _mp;

    // Materials module (separable) — returns a response if it handled the action.
    const _matp = materialsDoPost_(p);
    if (_matp) return _matp;

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
      .addItem(REPP.menuWeekCur,  "generateCurrentWeekReports")
      .addItem(REPP.menuWeekPrev, "generatePreviousWeekReports")
      .addItem(REPP.menuMonthCur, "generateCurrentMonthReports")
      .addItem(REPP.menuMonthPrev,"generatePreviousMonthReports")
      .addSeparator()
      .addItem(REP.menuBackfill,"backfillReports")
      .addItem(REP.menuFixWO,   "applyFixedWorkOrders")
      .addItem(REP.menuOps,     "rebuildDailyOps")
      .addItem(REP.menuClean,   "rebuildAsphaltClean")
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
        rTempArr = rh.indexOf(COL.tempArr), rWeightArr = rh.indexOf(COL.weightArr), rTs = rh.indexOf(COL.ts),
        rRem = rh.indexOf(COL.remarks);
  for (let i = 1; i < r.length; i++) {
    const note = String(r[i][rNote] || ""); if (!note) continue;
    recByNote[note] = { decision: r[i][rDec] || "", tempArr: r[i][rTempArr] || "", weightArr: r[i][rWeightArr] || "", ts: r[i][rTs],
                        remarks: (rRem > -1 ? (r[i][rRem] || "") : "") };
  }

  const ix = {
    ts: dh.indexOf(COL.ts), note: dh.indexOf(COL.note), company: dh.indexOf(COL.company),
    project: dh.indexOf(COL.project), contract: dh.indexOf(COL.contract), site: dh.indexOf(COL.site), mix: dh.indexOf(COL.mix),
    weight: dh.indexOf(COL.weight), tempDisp: dh.indexOf(COL.tempDisp), driver: dh.indexOf(COL.driver),
    plant: dh.indexOf(COL.plant), wo: dh.indexOf(COL.workOrder), load: dh.indexOf(COL.loadNumber),
    status: dh.indexOf(COL.status),
    block: dh.indexOf(COL.block), street: dh.indexOf(COL.street), locType: dh.indexOf(COL.locType),
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
      contract: row[ix.contract] || "",
      site: row[ix.site] || "",
      mix: row[ix.mix] || "",
      tons: Number(row[ix.weight]) || 0,
      tempDisp: row[ix.tempDisp] || "",
      driver: row[ix.driver] || "",
      plant: row[ix.plant] || "",
      workOrder: row[ix.wo] || "",
      block: row[ix.block] || "",
      street: row[ix.street] || "",
      locationType: locCode(row[ix.locType]),
      load: row[ix.load] || "",
      status: String(row[ix.status] || ""),
      decision: rec ? rec.decision : "",
      tempArr: rec ? rec.tempArr : "",
      delta: (rec && rec.ts instanceof Date) ? fmtDur_(rec.ts.getTime() - t.getTime()) : "-",
      // Extra fields used by the weekly/monthly period reports (ignored by daily):
      day: workDayKey(ms),
      received: !!(rec && rec.ts instanceof Date),
      recRemarks: rec ? (rec.remarks || "") : "",
    });
  }
  return out;
}

// Format a duration (ms) as H:MM; "-" if unknown/invalid.
function fmtDur_(ms) {
  if (!(ms > 0)) return "-";
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60), m = mins % 60;
  return h + ":" + (m < 10 ? "0" + m : m);
}

function esc_(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function fmt2_(n) { return (Math.round((Number(n) || 0) * 100) / 100).toFixed(2); }

// Report header logos (base64 PNG data URIs) — Copri on the right, MPW on the left.
const COPRI_LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAWUAAACWCAMAAAAxKmmKAAAAkFBMVEX///////7+//74//z//v/+/v/+/v7+/v3+/f79/v39/f38/fz3/fr8/Pz7+vvz+vbt9PHl5ujP7NrP2NS13MKW16+yxbxrwIZIxnRJvnBJuG40xWs0vmg0uGWWq59iq3JTsW1Tp2tGsmpHqGU3smM2p10frVccoU5yjoAskE4SlUMRhTpPXnA/PFMaGC4EAg+xqJ9sAAA7hUlEQVR42u1di2Ki2pI1xtDBFyDKQwFFXoLG/P/fzVq1QVHBpPv0ubdnpumOiYqKi6Keq2oPBv+7N32gvU4Nc6oN/m7/3jY1V/ssz73F6/Bb+w+1YWvD/fqPm0cvf2nXvfWhPubtcPj/DmNj6VdVVRTHY+VO376GeGC5W7e1rVbqx12p+9FKHmn+cLfrDTYPm7vm5qsXtbblamkvl7ZtLxb2snlsib8WkycHor3978H4dZEdj0UarIMwr6rVUP8S5Ff3iLNSlceqxG1ZHbGVWaUe5H38ws2RzxeyR7MVl994BX5jl0Jeh135LnwFb9XGBxb9BzJznMH/EhU3XbpVkSX7ne/vkyQsjl/CrA+sXRUGYZpmqe+n6X6/51+ev5e/1/ILt/y9TrHt/V2cqC0M8zzFK4N1mvG1WR7kOR7Lc75fGPIGDwTY8Al5Xh3dae+BzE+nwex/hdWz3OMx93xcxrsdYViX1WIw/ALlRRJ6IYDk1Z9le99f75M9AV77fFD+5D35D/T322Zb77E/zgrgz3gmsixMswBwe9gNJ2qtnsSvDGc+2HhVYvQeiPkRDcZ/PMRDyHFR5WkS7zyFTRJv18d0MX4KszZYFn6YApHdbo9Ts9v56gThntr2+ANnbcc9XBcPU74p0556HjvjwzKI8r6W8WTnyjthi+OY5wO3Ma6vrDR7D8T6tP98jbFYJVWREoltlu6SMkmy0PeC6li49nT4TC+vquCw2yT7BjIFLbEDWPijAZuPyKOQzCwjzJR6fE4il8H+sq35cKYeVqBjCwMfr4MG6zmOl+jT+NNFWTeTY7n3qAyhA6vjdrHYlnDmctqc7XT8RJQNt0q3uw2UMVUvJLLABb/m1a9kNk3X0MeisvEkNMo+pJbF/oGPXzyVIVUwNESKD/d93NRKOcBFkiq59+GSrLO0cvvMhPFxtn782V6GFZUlLlt3vQ/yoijcBYzM64pGPXOX5jPNrA/sMg/jOOUVnwskODn8j0fyAooWf2Y5n8UjeQFrh3uypXuiiwfwKH8HYvdg7WgUczGMly3YiO1cF+s+82edz3+0LL8ay/KY7JJ14vsJ3DgXug+BgzZxYncBgDXtqVp2jmEQx5lyvUr1v/6RO2orL3+pO+XlgbLi3eaJ6rKP3C0Leu7cymyfBbhQ+syf83l+/4NdjOkqg7KARt0HsC5xtBxougivNsIvXR8+95an0RHi6S6XjoPAwUYssVwymEBEgT+W7c1eMNjAb9NcWObtc3w938FZOc2d1e3mJlRARY/HPDt8nud9slyHpPX2Y6ZP2puO7/jsS04NbqZpTHV9ht84evzcnG19MptNp1NDnsXzi4Vp4cZo3nZiRlVF3QnvKw/LGC++4Kp9AbHylpNinxerweQnTiyujp8P1JYZ1HZY9Zi/+QdQ7pDlme0sJXx0LOWBIFSNIsaaUbRiMBqpyHLR900ng6iissuycomDYGDF6+u4em0U6dRariLGr3CFskxdeXJJNhKhL9zySJfVo0eb+yv9p/NKiyLf5ZU7nGrcmNGQPIVWJyy01sZH5fdA8hradza93ib6skxpmHviEvN8Ps8nj/rMPDQqyFGCALloKa+LgkpXRrdinA5gn/KCJmoxeDfjIzDE3V1jrV4MV2m47LqldPDzCidCTquDt98gzFu7+PF9F5dCfXnUf9Qb75lGN8rwMPJ8NZj+u3oNbjl9njDPuj1m+/PcrTGWJS2q5AoacV3E1SYMNx4cnM2GPhUUUXWMF51h7gRyVHhBlvH84k5ZBMEmrJb1Yb0uY6QFVHyKTSVmoBfW4dFXkLwsyjLcBPRH3TWeQASA80CfgD4c4pMsF3c1pckvytVjADsczN3Kiwug/Prvo0z3Iz8uu43f+aPL+kE/ZAXcwDwezBuQhyOn8nZZiGsc8VdMp57X+jFfDLpgfh24FUKpFMBCg1pJRRe/Wg41OQUQ9GzvAfjNBl7omt5QiMB1tw7qq07Dy30kFWIJyZIk3jMUwB+ISBI4DcA8KcW8iz8QG0PtUZSXRRzDFXN/Si//GsrHHFdiWnZqtfkBKA+6Uc6R+cq3+mzYPDRcVd527UGR7tIsyRjPIz7KjrvpqEM7vw7dCt5XVhDlgREXe0GZWl6naKewyj71RFlvTBYgR1Otag3lHoMAqQV8yprpAkh8FnpwTdNw70sgsa/DiV2aZ11neoTAD2cnzFf/EZRDHFDZGZfMPz46UdaghfM1/PR4MLlBGcK2T+gpYsPlvkEcVcC8TbplOVnvC9gyXdOmQBnnuhCUJ3qch4hlU/FMS8hlHCclFAISNo0sE2UEV8j2BhR0bkiJbcJNmENfBfiHh9c+0gv+bg99+D7szHruoVEgy7P/FMq7aafxO527ZdlM8v0+rJLBVZZ15AQgGmlEbzFyt1mZIbDETlHXO+gDv0pSnKka5YpJF5FlRmTZBsmbYru0YLpY8xi+Ti0XsVgL5S2zuoVIecYf5YVkRSUGsxQHhqkcZH6KbDruQNmE0klSWP7B/FsJqdqhhDGdDn9BYwDlrDI71fLp46MbZTfzdxvI8hXlSVTlEA334kZEJVQmcemQZU1/B8rZTlDWR0ZyXANWQXk2iMp8g/QKxHyk6eMxve/xbLQq0zQJj41eXipFkiRK3MvODVooTdJOlHE9rnMIQVpGX6E8NOCnL90dz50kgOCiWjj9PynLSZp1ZfKRxDide1De5nskytsoI/MS4Bu5k3ntJA6dJNnuvBy4DDtR3u39LFd6OalwZRdICAvKx3wDJ8E19WtVbTJclWGwT2u9zAtN5Go6wf+6XPfS2DVI23QBJBarbSYa4/URZWh/uiHQGNFzjTGxVm6myiJqQ7YEd1J3tTT176Jc5QEuVr9yXzuynh+9GsPFWfXy7S3K3tYvds1Dk7G1TeBveMgtPByNNpzvEJa0rB/cMaUx5oNtFSJNlq1eW2ZzMnBLGNz02BynNhbHf4wgc3K/6bgC1PW0LQNav9cuWV4eU0F51YcyzrBuLlYlnUp4pqEHr4f/uQUsQWUr6zsSLSiHQDmoMqMjifFx6vExDDfb77x0e3mSSYFqE++hMWqUISxpsd16m8R+VBmQZRQPILAKZTOp4A1nR4VyXMFXKLPl66jtYG+RPyPK03aAL1LcAc/LUIO613CYm12nxuBXKH0k/Z96cuYqROUuhRFPJF+fSEUFsaYPdY8Lq6oCd2F8F+U1PGbr4VI5fEIt9+rlJAaIbZRXRZClxQXlyWRVFcluQ4M1GXbJMo76IstHuAOC8nA2SBCiZGWyGLzcohyG+6ByfyZQM1wUNTplWYO7WHpAedODMl5gLrbHKmfJet8k5F2Xv/CTxMnOYxEXxfKFEujetI3SGIirvM1x+fJQ8jufeq0ffIx10HKCIBtRFSbBRZbh9NcV3CPAmz5mauI82LoB9TKyA4cS6W/Ry0Q5Qza8Sqy2OhdZRh7351DGYW5gYdNpB8rLYxYgmbepOj25IaLL5FjstqhGrVOp/SEzH9IVB+ZAfc3SDCpOMSLgHWgAr4ul+RTlNPH87FExG+ePfpTjdA3r595qjGAX5vVDLxqMGMKwGP8P9kPpsEGZLjLoI4NttgnWdJ6J8jb1Aq8DZSQC4GN8P4TAYZZFmKzDLh9DXx2zMIZe7vTktNHEQS7Kk2qtlE1Yj4buYTmKhRKg7aLEiMBr7aXIt6xWZbnoTUs5Ff1lb51U2fQhifEEZRelrLy61cvHcBfc+vj6k6wjUd7mEmFrtFJh2vgYLny2MIPGaNF7JsNtiUS9+BjDb26DoYkCYOx3oIyE1/YYokSKL7F6RHk4GuIkePs0IBWAZepCnHM6cjCGTLFkiDt9KVmx/I3HjgerpzBDlFGkoj7PijuB1w7PUIbG2Hk3enkClPd+sX1rHhrNJsgQT97f37XO3C5lOVMJIiMuIct5oVBeQWWkXnaXjd2WqFcC5Z+JB4xtmezWRfY660C5DHyog+788nBZ5MhF7TagV2SQYIShW3jJpoEE98qNkaktBWaEmngP1AnDAvhp/bK8Ccj1QHZs8VCMOj3RGHlGV/helmn97mPpV70ngx7E26BYMju5iLMglDhEw1e2Y1yWqEeuTIZbRp3HdGOYnH21apL6dRxmXP4w1N7qXv2ACzuVdkTYNH5FmO6UJzd5KKKsEBgFAZgDASPLxF0pT0Krv4q1jBj2o8gKixz76yzIj66hDftQrqOSPaVEf/DjTr3+MtIKSVDdW794HboL1nSaSg1z/e7KelAdPyC+2D0OQldS9TuqPqUxtPHkUILw4EEv+kj8uZ6irMGo7+I0X0fRdrtTAfRuJ64rPVi1j6SP1KYeIDsCSmEx0u9TRctjmINpIXp5el/aXh0L5EHI0kBVMRLxG9MNRy5f3HNFyTswvEeQCin1y3DxhSeHpFwCyPIbx298eIaylYTrXXijlyerwtsixVXeFCNle7wmxUUOt3G4SXg1ZsLEIcpAY6Yh6e2h7L4v65IA465MXNY0yBhT16mKK2tNEdWE1Has4zT+oLgN+c8L8y4tSJkoPSi9nR/eozwczRh87plURTEx0gcvDHRu3kCbTGZQD6aLQ0lzpCBp+rQ+V+4SlSTJpjjeKOYZ/bhnKO+TvLrVGIUfI/u4phnOmCmTnFwY0MLdozxGVg8ob4HyXhHUkIOjXtZVueoIXbgWMhSpVJLKT0kjQcINXitSzj5pUshjx6Bskr3TMK/gy0Ls8SicWRQT4AIAyAeUtYF9LDbQGFAJd5nP4eSV6iJc84opYxz6pLuCqOnT0WARQVioVSJz+DyPwQh7Dz1/m8qY04/r0csa88tgCUOWp1clsqs2EEhGRz7MVOqT2AdffF90oFzL8i7wgBG+D3Ha5MVSCivabHI4lqlKYTKvCXJJEMCu72OkOjPAJpnOhuNKxom3EVBJOkG6H1rE82QfKQQ073vnLcORoca408usBkKXJRCRjG7j/En+TcMLbZR50iy2WC+eDjq9DOXJUf8AjeONYrZFlHuzRQmKPpuW2wajvTsGrM3RbYcbT9oNvqTHJNCjxtCYuvABmuf6khEWtkgTPuu6GSWw40UO01MoFkpILuUWRayETi45KrnkbhCdIeGZiiNLb4DZHJTYyP9RG/fxFzfmT9K0fpY2enneRgQVx9zfkkRU7RaTSb+Ayu7TwTIp1yms0ZJEZ7PH+lWhTyIYrrij31LME6Uw+j25gtavLcu4zMuqTvKK956RdgO3PetGeVuk8X6ziWtWTs5c8bYuiYsFamUzM/JGUg+k2Ty7yXIqnorKcdIZuOwvj132urMMzClWXraGq5be6eUJUqrFJkDGNkXNcvB10m02sFAcyoNCLNC2q2rPNG1ITi4YYCD0mTfV66coI+2ehC2U8aCNaz+WTXFPUfuDWt51ogyNEQvKuTDZhVgQRU7UJFM0GJepZdv2hUaydMs9ylS5u7QdeUCYKmCj2HRqZE9nabeZKPUruS/oMONbjYfjBw8z2Unmc972o/E5Qbj2ggJ1rMnX4SW5hKxrKTZzVa5eO6ml5KOSpbvO2twXCfyeoVx4O8ry8wT4Mg2Z0Fx1Wb8492N/Uy37jn9yJ0cLVALhlf1UVNLPxChzvJmPjNetXh7rq5KJ4MDLUPeefFETYUZ7aq1imGgS5ELkRY/VYwW1RhnxEZJ6AUrIzRNv0RcoJyBkSxa/dexzEIHmpAPN5/g/mxkTO4EeTYtOlLfBeruG/zGZTibTkY6s+1SfaTdGfHxNGU8nrJWw5j0Z36aSJ1IzeL7NHoxftUEKM93Ft/llCbz3a9AMUhQRJl/ri6kdlUcY+gRpJdghEEGrfNHpY2S7mAoj8Svv9Zr1PH98PLd+PlJD11pJZ5VhaCPttc+Rd3u9s75jBHiQ5b3kMVjdWILwtrotqgzbr2G2KID4HZf/XJQlS4tqzD5kFh91yYva04cLgMbogWmUyRcXxMAgvQnuA+I6eEl+CMtPBpH56GMAZUShe1Ap/OJq/mYK436U40xVpJ5dVLAkQNlvNMaiFQIqlCHLQtcgAaPKj9WNtcFlbdznl+OHPMCv1ZTB/0D8vIYnF96gPAEeyOLF8f7oDvTR0/fAF3KRXVaMBNA6qorV3PWmqrzV0niIsHEi4GMgLskL65rEUCA/yXyywBI/LZnhHKJU4fpAecpMvauPG40wHtq4GlDAQmCqI7Y6HL0N5fr6xYazabx6lX46ctMm0y0oIEmZmb8DZTq5sBjMFrX5GEMUV45IqGzjonS0/q9G7/vVWqEamAu9yUPYmgeuW8YM5xGtxua9jxHA0sIRSBAVXC/H6AuUEfv5+3YNu1uWnXIDa01Zhlwfqfd11ZYIN5NZxD2ZcTrctuS4kY9/a70YpZaW/4moG1dm6Rq/wfpNkNbcwSP2cQR5C2U6tjnSoRBIZLfHfUI8lFpVhiYLxASIfsAQKyNeeFs2ru1X9uJBL2fIivgecv/+Bp0PlwR+g3KvXkYKDdyit5neRXRUf850pwyp+fA9SFM55suL4p+6mYvkL54Cl3IyOByDzbFsaYzh2ICoFK5lML59NSy33CFVd/xpZmdncn8HYgL6llJ6ci2U36G5QkK/qUDT1XsvUd1aAlB/j1IVOyHg5wPX0XQCpb4VT+42Jsc1zcAVTUHQ3SFKl3d+XL8sI80Aopb7hatjZ7guifKUcUBxzCKwsIWKvMoQKQeFin3HQ3SCCJFea+n043EnSUfpGt1nCVzw4Dep5YzEhFBQbuUxkPFykSOH88EyVQ//GY8a1BVI/JJTsy4pxzBk2B18neWUybs7Y1WjDJ5TjGSAnyW1rEXPUab5QA177e+Wzzc3ZbhWsO63zJgQp0VGUnJdgRe3R7Fxr1gEOjky0WsrDU6CMzL5aaHSclWx3iPYKXbG70B5UeC41qgwwZnYXFGmH1ehSJPAwVwN+zwMw1xRH2cs/pGuhnrbYCbuJNMak2nr4h62UIbXsl4T5XBft6Rph0Zh9PvLyESywIJu2nb+sciL650ckMKuKpQjsAdznEjFuZI0nE8yskoX6trddYYaK/JYSKr57E1CZZMtMOVxqf8GtTykH4cQAZy+LG2hrAvKgH7fF/fBoizcLcxmGNZda+7iW3wMoMyKFCALs32pCtnzj69RzkF0BZ3QZ+ULgQ8SPmTCsk9L+oL4EPiBwVqqEfrE2JI3j31REkYTKC5YMgPcS0pSm83bhnQ4+QEGc06iHQm6u3XKrNzRnf4Ob9lwCw+uN1FW3KJpC2WPernCNfOj2zeFwymdfNJxmbjQgGBzmZZlyc+1iCM3wxbKOKX8PCZ4lKK1zo3C6LV+WS65X+QZPW93aZtlFjOWbs2mjxblSerlgRkdtszpSBMie0NDGg1r9KMHi7cfNnpekAlCdmgLGlOAvmo07/0WBibaghmT4NhQbKEnN7+WfAtyL9YFcBh2Rf2zWNhl+MZsF2btAVnAjK2UQvzdkbbdzCfYxssWylKRQkkKwlV4UwmvL6LcjTIOFJczi+g5UU7Ykww9lUr2MeMnsxuRPQo5NQi6GqgQzIjZMWqVPJcmkWjwRc7LimK8osilc79K+itrP8vADDZoS0Ve+jaLLyizGLPvMX4gPoH3hGtfGARkCcBR5hFe1aTqf5GKDXymFso5jB9Yaric4dYYko+7iHK3xhgYBxaKBDRpdKMnXtXTDmCp5DPkA5mOLLLjQdNneBvTXm3Zh0vqpOcu9P7sLcKTyQxnfLKIttQuWewinhr9noEf6PKDZCElBKFct3JyNcqZoNwV1HKHaq2CPTWFgCSYteqaBSVmT2IM5G4j0wQulcALGxHt75xXkIundPXjulEeDazDITqoLTpEN5vDmwP/M+doM3tpOfYEbrGuMH2fzy1rziBPe/kqd9ZkeebE4W3ym6aqrOSqh0nJ4q1Hl33WAnGDAHtXuoOuPnmU18sqb7aAhqfpVmU+LmRtJkTY7iER5u6ChhIqfAzp5NpnsJ2ZqNCWH9cny1/i04Ma5HP6qiva9/Q7oGmTKTddx+6/reneOQail1Egdr28avsYQJl1VaCs9aB8bOq31VH9v44aaUq6Jcz7bpcFTcOXeHKe1CozkOxAkCLKYCE+18t0CbjNmd+cy+/5lO2exnyGNr2FycznnHsgTYmf2eSmLVEbj7Wfg0z7rWMNoJcBA656jmUoqpb1g4+xQUVmV27NQTeL5PCwkaNGcgYah3gbJ+hZgmeENoMblAO2y6X05VJF9WnLch/KdxRHbciznKyMJRj1xb/eD/PPNhvkLJT80PUDF7HF4EJ5RnqCkEbMloPveub6dHqh3Mjv6RK1ZQRjLZSZxUeineE49EYhRSmrrTG+NeoFUVPMJslsFR+R9dkb73/uYCq2HoknkVKW/VatBN1qUNkkGqfdgjIcvc/GY3UN4/+7/P3+PhqN3uVWAr7JZMG6LVzEBmVavzBcs/1I7GUplMRWUHI6H74z6gURPCwKUqfwNb1NVSz+YGHWpMkd7hqcAlfJ8qSVbg/pB4NoNez+2sPXVwlX2UyPPzuTHUgfIrC90ctgPoJKCWoJjKWvBmXorQD7+yjDkSzSVVYC5fKBMfUnbcOBXYEht8bwkB0N/rW6itCuSIky6sbm6JG+P11Gq+tkM/dxypkaP+CioAXd7hntkyc+BhKfmyCtKbitlNz3UGbhn8bWNSP59UePOtKZUdwnoMaswfYLWzVsTotC5oD1CUQU95fjBMwyoQMUVdXmp1WXu8rTyDBxCj5G6RttPoZHdzn14exl9Zioa1jyTZRZntnCui5GJsiQ7kL7g0UZ7j7YAB5Sg8ACA8ta1VU0HiLFAd7gJu+ou4NYfZRRL2tfOtI4VE3avsnlDIWIw4kxmdD21+vqgrLiY1ARIcYOURhU7zy+KubvokxunjmnYZ6bgz99ntQINRxe1D7rfm1DR5WBTn0k+KvtfZZ4CEEvydzjlCLOIsJAInhlPt2VeJ+S4MOw29v5Hun6m8IzrpnPMhSHBhkjMKjqWokWicd8OHwfZfbgsB4mOdbJ4A/fUO3MwbnBFwe7u40yatjwmAHWQw1b1zCuomSLbI7kBecdpDLXKGXrE4PAIpMZU5LMSZm/afvLnMLGTBk01LXud1XM30aZ01VEhH/ofzrGUl1FDzLn+wV51kJZV3yMAPM8QX3Ttdu479Tww6QlWai95InFaAAHiHwiqSm/GdPubIG4RtgymQ4hdlhcKFxXxfxNlDG8tZ6i8539hA/cwfa9TEe5TEmpmS3tcLehu9zP79HvY+Lh9V0ebDU6jcDlXYPaGbRlGR6zA7BQjnY9eP1taUZIoPhkQg3jreMohpjtQpiXoMY76knOMEIr+jK6orwE7x/pEcylgQcWTG/Jy99DWcPXeL8mHvrnFQHh95Zy/MZooTYtW9e/s9M3LYJTQi0ke0G53SGsacjPogdqC24Zmiu+FwCi1ThbPnVqYP2QmgLKrpteh/e9Oedv+hjD+su/WjiRC0uZ1VEXfIpCbEAeOKpqYeiPO3L4kzTIyGZeRl3Vbys763aLcnj5kwWLaa1arw3U8ia4fRjvOFwCZehJps9uO4THjCmCPejuoM27NzBrDR3s+ltyOejOz0SNT1o7IIUzn2tX6wcuCTWGv0fIpt30+n0tyxj0LABzlhdMQrZ3pZGI2bfJ6+SW4i6TIl03U6n8zGW3OHC+oAI36gBqOLNZdJQySV8JLbbcuZw0ZQjx2JBBbUKeVYN6lapcs0aBnV4vZ27swFYh1MWbxHdeGRUzUurUy15eOu1n9SGMXA7eGXoAKM36F5lDfTaVcTnlbtHbuyo+hi/TQtfrotVYcgmyn6LMMTWm48aSBsxVlSBHZfux5Ki9Q37cjB3iatKgjLRLuOPoijLaB451uUENvMikgJtJLaLcgs0B9g/of+CBCyecu7LuQmp4LnnI3HUuouyUdcBQLrV7NiLS9b40egT3njHPQLXxmU1C9ReFxqcDWfG+IOeQDV+5b6NhP8oYRQF/D1vlT0fX3p1voKxTOtcVB2UlcPE57JIp1JKzHxlw2sOmk3pCUllJiJlk3XMCt4eGdhkSOW1TK3dCWl8Ha+xB/5NDeUBbDTiiBLNRxTpjpoxHvok4rbwI+Z6BlHY52nNlTes3BLETQzyD7KHhguYPTC20qey3ii1y08UA6suG46bAgkWT9XA06RfkgbnEBCcEGx7SeNMnKAcyjBUxyXF1M0X1S72M91yRYAFEOLmcX5pfmycsk5pUPFSXG7SFsSqrjFndtWAjI40wPmoHcVxeq3/G+7ZKfZqklJXZNbFEyORT6NDklldIDegzoIzHWMhcqxInm3h9bpLnOe4WSmeMFxWoHx5ave8pskOaPz8Ah2i3De4nnenv0BkbHt46RH6Rdq2zf2c4GQshsWC7AcwavkkvyugHSjkXFyS0oz14ZIn3o4zJWSiXYgRvwAqrL+Mscc9n24yXcmJsTbPWRJDRu4eWGldGwjL9R3Aw8zUtkqspRxswZHnPPhzleorySEmVgpJeewibJgxXPSkf00NV+gWKIdkRZXwIhta6da+OXW3c7aarORUJI0y5BTVwt+XT9/1+i6zaS4AXhBnY9XDI3m+Bhs2fSHPllg1/aMVAPBgeQS8Y9qCMIbgUC7St3XSimV+hTE4G55juyPYXtSlTDI/kqoCV4XmotsuRaWMdDS5o9aYGyEplrliURY40DHagbrkNqQj02QqNPyykoeZQ7pAaIe+ADYEycdorSMuBGDJUzXZYOAAkAmEkiJ0k4QPftygXynUGyts4IH1a75jbUICBFSCkqO5RHnJyUonmqpDvty85P3Qojrqu+Ke6FMeM5YoYQ+ozn3EgasqO3oOyU2w8n/OFsuKmW398+vhCY5guSOgownAgUxzRYZgaC3TOQsSoFcpsIQpNo7d4ZGzvo38u2boRnfdVdIjh3WzWuy3iVXehDAfyMUAZOd9wxUYR+nIY7Wk7EeAmlQcuPYrvGOcoPc3LV2PAHTBWBz6fEx3KhK2DbCBTsC6qYBt7mHPWlcR0jxsQEvfb/HHS2RvJqjlR3on6A9VhtbTkPUbvkx/0+fG5sDMFshc5r0lMdMBUqmM06dMYFZrFUL7fZ7cdHlrTidaNsiYNW2j+3IKZ4trmtTfLsJ3DKQvLYz02UeY4ccwzMD449tWNWTgxjN92iwQYHVOtRjnwIJn3/FnwpsANJn0Rz0iSHDDDVo9uV9GAl4tSEOYrvNYoo28TjMculFn8A8pKY0wea7oOZF2Gv8MqpGhtTBP6iTJuZLhYregfYkAzksUkZ6A/rkRXUX0muvv9hCXup6V1N+VMdTx0j8XXdEz98ZEDxBW7VGGvrnqU1dzpCpOthBKu61Z8RFkRXOFSOqBanR4LkFq27J1G9nHKAipRho+xzbZmHTbLz2zyA+op8eltYlaYc1Tj/k0uzKKIvHVzNEIskFk2ealwXcCxg3XLHhPy0tqQKZSrjjmf+ggTEjDDgEs8MM8GDS1OqlrIRMY4pGs2gOOYElynFamUz9jydfeOlyXTx0kvp9Nnj8ZAz8CGVpiMsnGriA+lNSPjAbpxomIpB63rUKllItzIS7JhCDcISeky3SaBp2acCcrgUu/zvXUTrY3AKsdoNSQP2fEAF58Z3NJ4kMBhHLAhmMDpSmPQ+nVoDKFeZK5P69c5TXU8mDpbNBFzgsaesThoLjDGitvDbkbf9TmNZA16GTRyBpYkxaI3ws7IsNm5+/up7TPFF+iR5Sl9SujUyls8HiPyh9lWJW/0kbUtQUXwUo5IvDsKfc4pFVtyiBXPECgXnotGx5QoX3F+B9FohQ7RJC4F5YD8kVuUhcQ/30LRorkd3uGw1hgx+vY6ZJlzVFKgvI8ffYzL2CIXwx24eEmiFikBAyvNiHi9IkFKnhrsEicX1azVJ1FJitjUS+9XIHirJzd0oQyWOCbOcoon4oRJlz6xrJEmeQqINcweB4kO5vqjywntgnE+7Bevh+kUpEGxL0MbXJdsGuN8ROT7weBbRBl0xvJ2YYo3Xh3TXb7fppJbVCijirGGxtCGnXPEN8z53kXYLcbJ4NVGMErXkiugMOe/ZvoyEZhpFtEyAdMND2RK7fgMZczCQ9EAFJvS6pgm12v9FuTgBHliPp+qKzwSIQTH1mjc2V+LlkB4JHuGRESZiVgPpJPJdDZ7fx+z/j6ijQPHgYMFiD+0L77rzZigoWRUByZ0zY4oq4UdFiUXy+lEWWbi0yL5ebbsKbizRwo0PfiRbKZnLBWwIIKjwA8tI1MyyWox+IpUWddKdtvN4zIPKpXRjTKaxVHR8Qu3b0B0nalD6hvTcfDNi+hF7+5QRe8T42XJf01EltFFe/ExXl/BI3mdLlYsTmAIBMISFjr2/IYmE1/CcZpNxmr6G0eB5rAVCjcYOHgIfSgvpNLs98ly0z5rwUNkmkTCAJkQS7TzVBL4W2L84ysqGnvFQinMHJf33W2a04ey8Kw3KYcO6c+LT3A8M8Zt6bqPoQGzViBQTkvsIShzjli2a0rxDMV9b5vAM0W+BSgvXjh0AfzsbH9zFZl01UuOuAH5ZqUo3gsMi4HLlxidwQLmebAd6gnKYsvJVHWYxrpZ8YGhimMzTTj+mu4nGgMoJ61Wv8FNz183yhjzCcNRFF813dO9J8q5O+mhHmN0e4mOz7Tke1Evs4aRiDlX/FzeIqxDigQ5LXo0jErWTCJexu/zfEiWKmGRMzzGltKRiyOzV92yLIQf9OrBYjhPKTq6Uj6IozD4X4hx7oGRldJXE/1b1AS59HdxkU07hql+9KOMkVlxkX2F8hjvj++f9PCBVVsfgoz0gjINllqbSRXQOPURzHdZlmlb4uIZsUURVLa1jGoo5CwI1zKTGBxmnMNtFMocfwRh7TxKesw5roie+dA3TNXm2H9MZckJlXvjiDHtmwQQZouQ8Kp2k47l0M7dPgZRDjcITr9C+eVFX0kLQT8/kSgnHpyMtEE5Ew4ODLsXXzspaNPRl4ZmOhJ1mD/d8VRARaKMzCH8TPrvEni1ZWw3BwXrx3aBzBoNu9uEC7zJ1ygrzXFD7NX6xuz0ocyoJEuOHbPEdTY+9MhyjBbPrzUGFfgRSf3tM5SXaEnDmi656GW3ENYIizfkRzGJt2ZnBcJDSC0zLWKwZdEy5A88NRV/pxbWYnxwXF05sdAY0C2dUYl8Ca/C2cuxTMW3ZokPW0trDH+SzORgHgJafjrHVDD72acxsIhFXH2Jsv6KQbbp1s1XfZUdzujDEI9AzhitHxNhsGClrP14Ga/FKvx2RTdYiDpq4bFMZffgryEsl5XjtlErW02NwYRH2XOUWGwKqufJZODfRxlbkf4Rd689x7l9T1B2u4ZrPVg/dAjstoXbV9iZ6sgDxZiSmonGwOxaBFdBnqLFKHFhbyIxcJjiYlsz6SsRlKV5YM9pkBkTowUHBCBGw9SCQYsHuSjVIobdKIvHnG/Df3+9EtEYyF4W21nnOpXnHn+ZHXN7N2AjX6/JGNaMKE6fKtZmDwsUSiLb7lCXB/t9yPyylFfXS7KuXx8MVt06vpH6yVJWezJM2z3SYKJ1aTF4bV8yCyai+6wfPWascrD1/iMoVwhKk54VjqAyulEeOwhPd2HaG5UMGx9jgYFmIC6hTKm/dZ4Ma4ecs7tBgD8air/sb7dsOGiwGHPjZPzaoDNdHbDqmlygQ8E1xryVPI9v7RxQhofSpzFoNHLvPyXLGCuT5N1TJ8AX6EQZBZ0jRpGiEr3oKz0uUGscKvPHzCHnzHSR29mfzTRKXtoyjQSZN8pyYqHCot8uB9YiA3O9hLI0mO9E1nPCYayex5LN1pjcopwmfT4GHbMIM+b/Iyscwfohn+hNe5a27UPZYoUPpczY6IJZ1wGuGBXBBL71GmsQjB/2HM6ZkkeY6zE/oTOPwdyxxwkw2rNBg9C35TUnJyPuOZ8pPd4Un6CXuY5XaY6GfWPe8N2L1cyoeSoSsrMVSd1n6N4iucy6ZyLds870hwnFWIeBhYeyZ3T07HDuQZlJIGQC2Un9fu896JM5viDGBeAJkkjAYs22SNTro9s90W/Lzi44wj7nXmjMFqF8wjUn8/7Vf3WVx4Cfe5UMMDmwAt3aWxfJouXHio/Rq5dlCmK2TX/LVK8WOXowam/oPRnPxsyxp33rrmpYRLE7v4xSAoghNS/kJswcTsDBMDn1RK5EMqIYjQMVpIAm12XthyxuIO5DbOw3be/Kk0OkkFq9siwogzdT3KxJaOyZfytSLId8dWYWbLDvRxn8QsgXVlhxoqjVtiC9oRK9q4cvTQ1Rq6tB1t2Tn+WivdVDilXXFH+piflQhPcTPm+ynz0oI6NVAGVMl8BCp5huMb1wxEac/sV5ANWOo8L0MXohkO9HxFD4S5mIIruRYAMyAxgToApzzb7RQPkYyOBhNLX1TGOUnJ0FlIc3/ajSeZy1pyAujqQPFaX1NuwZxeUeIcuIfI91C3WzDvtl6XZylmQahWoGv6xZUi9cwiGZnAwsSwyTALFvb7KSGzdMNU6Du2m1N6mMnooU5kSUpcuZihig5lq3i0/gw2MwVtDNro3ALlqgOw3R8g7sCv86iGjhgjaQoNjvcZSOlEOBcoJaydalLD/RGMjie1gBo33QoGoeMX4DyxPkEukNcdEMZbom2MWLHusnM1UxnDYmAwzdCiF5daksJcgB6wFvZUZcqlauDfL2FtajM9U6McIlyxv8W33vPDkYUBzm/esmzHvrfqRFcKU3NDMX4LuxwLuQiaKJVB6FAFyKX8HV+yjNMp+q2kcrudxQAqsyWTourOBfjOrSCehrXK7nqcYQViwYU7cHjQW/QKFIwjwxJqpTjChjLfbO6uplRCLy2aiZ43tw3fGdLJhXb66rfmA3XGixtFnhfS+MMXWjhjfsmQNAI+VOSio7GTYgq8Nz4QJKNHAK894pkCz+9S3tjuXUMUGXi+6B7snTqP5jyOr2cMBaMPnxqKoQQ7YRHDmWNuUSXEUtCsi4cWH5zYYTSGuTxaFxe8zDKGPzicagW4Q5E/H03rkswevCBXIZvY1sESKufD8d940gMpkn58S9WEaUyphSTvsQmDGveOvKw5AQWfM9lmdiPlOv3q6WcN+ht101CieXV9eru6t3Ap8kr/pntDmf/dwiROcVCZ7ont94or5Au5JPx5w4Eg0XNaNpxHUsc9APMzKRQtWBD3WTpABZRgkOG+YZWS/JrkSGuFeWJw5HJ4P5ZdzZtAjGLoGvDX9FJlnqtH5cRcroT7SDjgKdACgTjk/Bi5MLQuRP7GQ69LYeE0t81Q6KhFPjKYNfALIs/67ABe9+J73ZsToJQLntEz1Gf70aYzh8XaC7D7WQtDXeBQNSgRyYMEtr2upVN5dq9Y+Qnyj7yihwtYK1fnWffXab+1Vqjp74GOUGVIj8YXVpI+XaF+nmcm2uqo3MuF71hU6yVCc4RMlarTkqyy8Kg4/TyvHFOMiKHFUOvxf+qaSf2KYjhJj6hzwvtv5Si3u+rF9KLULSyF7xJSFQx7R/sJX5nCU+d1B8RCakPv17DriG8k1c+3XQ7kcDjjZm9YPpC59CaT1khotjeUD9V2vOBchZOeeoI0G36ivaYknWXcXF0zELwLzjH2XIGmGJkU2VyTI4uI/LBqoLLWHD/rWaiS3Ov+AaylJcYFMK048TyVGjYUkVfa4oTjIFy6ofi38yuFw2/o2iYLCRHxlwvpFZJPgq/BV4G65o8mTm0vz0pNud1ErkajjapdG2YHomGD3yer/kN+cfLhxWz2qSZiHyTkKXdrMycaWmRR+jeadm1kbWtWk0utkDa1FdNsjGYHo4N3f7VqOUJn12NtGEK9J5dl0Suh6EcRnbrUj/HN4tcquml7MBDZ2V8meujI50WnK+eaoezzLoyuOzeYOa8/Es+8p0NtBjmjIjcQz8b2cxeBgO2OSPLHtJYmgMZ81dOTIstZ0QnzuRrKjtIt+57PtUQ024RhtSZN86GZwyw4nWeJZp5plTT59xD/2VvZnD4+GyETF7b9uDrbC5QjpVDykr2NoSWb+p3kQHqwcT9aDq2uANSJKxjEnv30znefeO9BJMpUdGZn4Zg76V61XXAXflOp9qxcmHwhkLa5Op8TtbBn8YxpNR3HMcjjp0q55WdjOuzLKuj1832b/+WdSvrt+hefpus63nU2Dfvq6J3Qby+rNTorXvDHvypV81yWoDmST6fGzvYDAYDf5PbcPravHD7+wqK9L31NaalbZ+aSRD12Mo1w2/c+iafj8YVg2H1TT9blbsL23a4O/2d/u7/d3+bn+3v9vf7e/2f2ObfWcbPz4yHt/e7dqp792+s3XspWFN196tKXQ28ytHf0/tr20v8p+IEtabkzr/72z84HuxqaMaEYvxrMnZOFxiTFYek992/cD9Vu9mt55VL+nZv+9Nbt7hsiEf0Pea+plLfgEZB0k+GIpLoTD+E2SA2+BlNBKsf7zIerN1Wsj+/Pw8n/H/z98+vrud7n7X967DTH9xAzP/xEnUrfHTDn8cu5VbwgQ4bMySIWdk1YlE66NZDe0/vLWwu9z2Ydl6umP7/C9vT0VDZcVnrdTfd7c6X3iTJGw/eT2vVncu8fdu9r+0OZdNBFZ+R4eurTUlvJGH+lICweXv9vNb2/YZ6rbe7mVM3Z1fhn3/3bq24V+R+hO2tzemxt+49Z+r/9TBjOe//aO08d9z3Fkv+q1v+TL4w2HW5v9ii9AIcfHbfVeUE5m/GxTL/n8jowi47pTB5UJ+uzw806yPz5vRmh2X/9tPfrR9Pjv/le/8rn3r2kQL58n5bYL1/rDukhM5Blc3uRzKeGYcTvY1Ah63V2fWOBtzrH3vCrzuNrdOeEvtydlv/vjNl9B4MH4bj1sSM+v+hPH48Hk2tN/xgZhBMHA+7KuYYtHrEyIhzp2fGS3iwfyGMWbMHi9/81sf2HZajf+KJA94pGbPMd0u/3369YutJXYvXEzG/vhsrUc/HzufJ2R1BvMIlCrhF44H5uns8EedDMxwOZNXg3TaG0eSnM42ztSnM3i5isHsUbh5BZ7tVpORjbyA2bPskn04GT80rn51+ogG83/iG81vroY5BOvDQh91zQPWxmZ0iro+4N2xjLlj/Q5Ztj8OhnO6Gja4hgdQRimcQjZXKFMr2+fmZMwHLYY0IQfANlHWLnNtBiSDag/TwD8/7WtfxmfkfF5fdHdgOPtKvUiXzC+b+mbl5nEL5QhHcfj8UJx2KKQPHIXWAU10Ps95GL/kkZmgql0/dGwaL+OLw0LDd5Ds3oFk8xplTISyI3seYehZg3pkaS9YYxGPzHgK8I680ZprBSNAIATaW9tUwue3zp/Wlex2MI0o6tN7GMDEUwr5/zjbv4qyNh+/OWjM+3CudCsCEM2tgzMbNBJzsjre/wfOxtnAk7+Gst1IyQUBTC4RIVXOhQTxtsVz3qCMmzGc2/HgrVEESG3PYRwgihgCRYAHF5ShXz4kB3tS2kCbjZXBHIynLZT5BeUt5/P37g5chbJ5+mWUZ6LqJN92c8nMaVnn9WXpfNJFveqUlnmG2jR7qXJc+mz8+Mhboxw/Dlrb1kURu33makSiVXscI4h3g7JyKGqjbKqBiAPDmo9NioE2tG5QFvUiI6o+T/URmrP6FdjJarn7szsxGav12uqm/QeUa6dHUzUNrfWyMQRkpl17k+XZ8RyLoeF0HxyIs3ONAOTLO7xCxvgETJOcN6fkxnmSD9Ca9/9GlDYe37lTFyUM/XdW+mEuOrr+Ayo5GjQoa/QFNLlVT2gadfHJIhSAdma2UX4jlCfLMA0Hb2vwXU/yhfAK44JyazOZVlTZ27thYoP5W4Py+Hvr2rVDdjyN9tIPOItcp3ne7qCEpf7kkY9pCT9V7vuS2qzTb1obSqPDkttcjNJs1yUtFgeaDiZwiY1GEcxhBSLLORNchHefn+oPMXSC8kwQPWCqXMSHbBWbUJnBeoi5tl9uUZ6NIMqWrpuQo+hdfMVPLmyP2dDGoNEYeJ3OpaUjZQXrI3NOhOUgcF81xkUv2ydwmrWxc5DqhqW+IHbAAxy65WB/g9lklj5sEVe+m6rR4Ub5FLMXnHUOasG78qudVSIZsMPPkAdscV2NyGYvArU3rWCH3Tgdbm03LMnhs3bDKByfH+9KCTD8shmEEVx5JlKyTIfhgjKs4JshbsXE4BPz2huiNsNzc9HLw4tenuNtTqZNy02YYPLO+IIc9Dr/cf40mwXSYVN56aA9oz5WvOx8gJ4RdK/W74qyw+9AcyGq9sPR5o17f+KpjAbK06/1MK14e/uQK+L9B44W8m0rjWE0RQv7RPdnRn/JlsuKX4zwGHKw88cpJB8mpWt4QRleqYWv0Fx3Y5ORCGEe84zMCZlCWZDkH+gYvEE5Ghj1c6cGZcryeCan6Z0A6xeUdbrF7LhXYjubE+W38Rwoz64on4AgLwxMwFMo03ezDRr1O5RrvazxIfPHXFw7ng2139sPnmkVrQNkNRmZkA6c6zKzKIPI8SpvWQnWnR4yTtRvM7NBGXfx7T6JMj733vq+8cqenz5b61A4RObw2bLU9Z0Rv605v8hyjSQt8z3K8weUxatXD59uZJkmBZehPW88CVETswH0zkuDsrjkulwxcBgF5bm6kKLaEtudKL9P5AQj0ogI20zaDfkSkU2eJ1Y+bLnQxvMW9YCSplCO+OSPe5Rn6vH6YAXlaMYzYsihXD3dsfikEAnnnZi+1GZYw+xPfDa/i7gr2rs2kjs8cB7reAyUcfHPxi94HH/MtYvGwJFSK0Rjo749cY/3uaZQ1vB1MfDrFmWl7c4HUwgu2lxrUD6Jj8Gc+DvfWsMcRxu3eLWGJV2pOQAH8MdLxtAzwBIfoAnKk8YFHSuUh9QbEiO9DRuUHXq+4rjQWtw5f7covz+g/P5iMRq8Q7mW5fOtxqDddZQsW02E8AKNaPOCaKUZI4Wy6OVoJKH0TA6lbpOXBJy6rAeDG1k+SBytKVmWo3RQfjy3PDnuc3Za7rwpAkyUrz5GJOXKw5nw89UvHJ5ytvVXoiyyTE8OTfiilwWfd6L8NhOU4avPTeU3CMrRTDRGxM98gwgAyPH8x/uPutAxZkrxRmO8UNtDoC7bfAzzIbJ8tuQuBQ6PfRgQwqssR/RFfqAQjI9yDmccSPTBKxHxBQTWwRkcG9HHCB4GyrqnRpbh8dLIfp5PVGE0yrIs9kkpNlgj3Dt8yNMwOXhjxFHCY4Dhmr0o1fdBn2IwIlgyjZli8iY2VpEd8IdZawy6JpF6OdxYWJqPyIa7dZLCMsvxlOUPodPg4Uj+gNDOORZOUB7NZmISLMswLKP2zyOll22RGRJr5OInp+Zaerc/ToKypsGAn/AlcVYMpubGambQaGA3GkNJo/iyDk0KT94FZeix8cWsQsSl5924PmJCns8W1LZsdRiC+AaWyo4unITmjwNcT6Ox2Cc6mJ8H59zag6chau7C3I9qWVZCzwv3auNtrdEYzBnUb8lXfpxuCBGwEfbHI1FCmbkWyvWh4nGNxjZioCnhXf09xDu7o1p8KpRFmG8JGA1b5LNGmSM8KVlw1ejg8fYwvrTdWZxYFIlzKIPsLfjMDmWHHqSkJe2IzjQXcneuxhHmYjCrSQuWYUficNp1KCgUBrybKbcW/FDTVkwck1Jb83PsMa3HwbqgPFb545q5YynzQlnmW/CqiQy+GHoYV4Nj1a4AAwRIo9w7HeQ3iUC1oy8oM0KD23xSoSXDFpHlDz4CT3Xm1KviXFaHa/GTaj3Mpb0OEPno455yo1Cuzw9wk0ucEfrpJpQyP6OHzFb0NrsNCxFpPivJvv3EyuGyEHmzRx13zSX8eKvDeRD5tHf1l/Xp1Msm4TIdXSJSxqGaYpBa1CPmWK2NPn7Taoaidkkf0vppjF255HJUy7hojBnUtBh7cSh48T9SDq+27m2sMqLG7QZjS7fTlkWycQLnuNW40623TJRv07VR7wyHh405DNM2/nldWsKIGnsTFwXzF2K0v6zy4WuNn83EYpqrXmBeE9tsQfo0gwaTmWp8iGld3Mxfy7xf0hpPclCH6C6LYX18D+XRi+j4Q63r/hnMRlPPo3t9oB15k4h0/k8nj928BW1eROfG4cfZKmJGvDWTYHD+S0V3lc7SvqwLPDKVvvkViDCM3D9HWeWHztC8A5U4glc4QzR4MP/pZQKfh/r1LKzGD+rlSHlI9LAt611F32e6TNHg/ZdS76fapvxrdAvTscaW/XsYxDPQqVUKPrLebFhhI7L+eZVSJTDOtQcBW/kO35Qm6lLp0cY8wYhJtNkvSYf4oP/PSTOGJb3soBnbM5NOMM+nYZo3kjHGXr8qKr+lyPd/g+LkUF8gE/HyF4x/bRNqw4Fpiv9CW8//AJUp5y9GOwFbAAAAAElFTkSuQmCC";
const MPW_LOGO   = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAUwAAAB4CAMAAACuLDtiAAADAFBMVEX///////7+/////v7+/v/+/v7+/v39/v7+/f39/f79/f39/fz9/Pv8/f38/P38/Pz8/Pv7/Pz8+/v7+/z7+/v8+/r6+/v7+vn6+vv6+vr6+vn6+fj5+vr5+fn5+fj5+Pf4+vn4+Pj39/f29vX19fX29PP09PTz8/Pz8vLx8fHw8PDv7+/u7u7t7e3t7Ovq6+vq6unp6uno6eno6Ofm5+fm5ubl5eXj5OTj4uPh4uLp0q3ruGXntmXls2HismHisF7f4ODe3t7d3dzb29vZ2dnetHDfrl3drV7drFzaq17aqlzZqVvYqV3YqVzYqVvYqFvW19fU1dXT09LR0dHPz8/NzczKy8vIycnHx8fFxcXDw8PBwsHAwcHHuJ/WqV3XqFzVqF29v7+7vLy6u7q4uLi1t7i0tbSxs7OvsLCrra2pqamRrLtfruZcq+I9ra0BrVQBqVPWp1vVp1vTp17UplrSpl3TpVrMo2DHnluto5O7l1yjpaWio6OhoaGen56bnZ6bm5uXmZmVl5aSlZaxj1ikiFiRkpKPj42Mjo+Ji4uGiIeDhoacgFKDgn99f397fXyTdkuIckx6eXZ9aUVdp9tap9xaptxapttaptpapdlvgpB1dnZydXVwcnJxcGptcHBncHZpbW5Yn9AtlH8+dZQVcrxqamlvZldmaGdjZmdhZGRtX0VjYFlfX19dYF9dXlxZYV9aXFtZW1tNYm87YoEWarYWZq4aY6QgYJTkGzriGDjnFjdnVTmeLD9XWVlWV1NWVExYTDVRVVVPUlNQUlBNT01JTU5LSkVHSUhFSEhHRT5JPys2V245TVw+RUo/QkE3QUc+Pzw6PT07OzY3OzoxO0E2NzQ4NCkyNTMvNDYuMjEvLyoqLiwqLCgtKCEXUnweMz4kJiQgIyMfIB8dHx4cHRwZGxsWGRkVFxUSFRQQExINEA8LDg0KDQsIDAsHCgkGCQgFCQgHCAUFCAgFCAcFCAYFBwYECAcECAYEBwcEBwYEBwUDBwcCBgUABAMAAQHNGt+xAAAyhUlEQVR42u19CVxb15nvSTK3yVPTp6aj2qNp9FKWgDGbMZv5sS/D5jpm38ILZRca+zW2CTDsq0BsAlMncQWRoQwGYSAYJ3ZTIgwWBBmwDMagKMK22Bcb8IwayJ3YvO9KYjV27NSddhpOYhD3nHOX//327ztHCP2QG5VGoyo/kajqJk6+gQEeWvCHtmdAgK+jkToVWxtGQTvtic0gUzQ21s8gITXdME7/2I3LpYWFl8cYlKyx+sLC0svDY6LiwL1UtDt9aGJMmKK9A9hjGpCcVtJQoxNCTl3sQN5YT2mii7Orm6urbcJw7fAJV1dXNzfnQ4mlw7dqPRubLBDy4Q9Gaezgtj2WmE9Xlyd8Ujcrnu4pPOHs5u7u4uL2XlxCQuHDnISEuONuzi7u7u628aXD03kmNBjpP9DkqHgLO21L084UpyISIjsV3GqNt3Y/6OLyXkJ2dmHp2XNtnWOX286dLS3Mzk74tbPLQXfrxPav8uyISUwpQ2sHzQ0kSVKAYd/Qtg/9BJlnfdV6wvaYu+17iYWlbYM3zxcnRQZ6OXoHRSazO74cOFdamPiOrftx6/j2Gyn7AXsHUaUJgabqLD/sRlL9DhKdRGSkFtndE28d62KTUFjWeY0d+sKW0eoR5dc7SwsTbFxjrROH24JJgGMlyAZsVer+0LE0cjBBiC5mIDVkxh4utIx1t0ksOXeNDdIQ6WqCoUSlaKTYqTmQqUYHyHDMi3utviTB5uAxq5Kv8owQFaWJAxEyczBcfzM/VCwPpNS01TKSBoIAS/+Onn9xjrNOKLl8JRk61VB4prpimP5MxYFGRIuoCUNqYIS+kN51ueQ9mzjb+B6eN6Kh8CF6UkPbR0lGiPyDxtKR356TmD096IQoKKa/zDLOxaWw/UoMQruoZBQuCKQ5BEYzPEgchq8YUXSTWKYYiUQFaz31SmuOjXusVb0oAmjTZ2QsMbGwh2fxA6ZN0mu6XWVWttYlnU7opyhrKMcSyLK+Ow8hGoVMI3kJmWlsbl1T54B2Et1jEGGUgLwoDIgPo1DRK8VdZfE2cZaF4iS0C/ldLbS2talv3Ev+waJJQ+X1LsecC7/0Bv5kDSfaxlnn9NQ5IIrSn2zk85qLM5MZ6QudHckHupARd6ppH1Ij4HqRQkPe59uzreNss4fT4ETBkhznkHcu5yPqD1QL/RNKvhrv5p4oDgMezx+Odz1mU9LPBIxfQCQsIFXNJzMlprihUzRY3s031YtBdh3COgbMoyiobxdCxVdLrI87J36VgdRRzFCCu0viFxHoh+mxk0keg4kusSeGUkHqMYfj3d9xKRNGIQqZRNJ5HbHFKSm87qG2gmjPvasztMIKJHymGUQ5KKQghh4JMa6V2RxzThxORWo/yuv5lzirwk4H7H//TxFyz1MiUV74uNQlzrq9AoiJIU4AL7z1ig/SJCiLztFgTo5JamIMFOajhoamGpX2GkhLXUbtYD/bAtDvlJiS1FGgsN7muHO2OBJRtOtaLeNs6jk/34X9TzEKnx+aP0dpl+PdbEuFWiTk82W28zuurXxHRJhCdmaaQmZ4gTicIEa1jfBrAk52LNFQwYvGjakKoevZRaCZM+hFQnbCEmvXhMuR/1MYXduciEc8nxdDNRNm28TGf+WDXtszUGIb4lp/xQJMS+NkkgOzWJyPvLq9tAhF5BSVzio6WZSbGmFPwKcJVidLemUoEvnpALzISVhme9y5rEuDiqJvxMdalfBMKX8RjU6iIDLlSU7x43y7R4NjimYvEvthlA3WB/b9XTgKKi5zO2bVk/fyj1Fjq+0x15JrTkgN87rCQtp8WT4ztTKXhtTpH52ra2npJVpLXe25k0CsZAgVOzZxIqNEMYgMhpLHQKHrr0LauYimxW4HRm9N+YsYmxjBBxudAhJ1o4eAEURGUiNtfEAywqjU1RexYZ4CMow1yQjGFDNVUW4KhURZPeXqxKfE8sdegmxb15xucAIZN0685ZYt8UEUDLNjqO0VdPuxysOckPnJtpbeC9VVp48eOXLk6Omq6gu9Hzfn66DX1XU0ULJwJQo8cyCIt79KPOyS2E/HkGdnjrN1YZMjifwXkHAODOQf/iiBrXZr6G0WLxgyJxBeHUt+ZFrmlKADBfMtVHoI2xRewDYc+u73TEHlZTZxVrciXyHrSbLd3RJG6IqbISF94aA3etsT7eJ09lZXETCe+uD06dPvnzoFn6uqWy4X/ASZZTHzxEUIcej/C2ak3nKLtSm8pkt+KYPQ6O3p6LlHkOAtCyab+sfoq6hgILujNnTvqW3ci5wq/de5ImbIC6ll5MEEErKPWB1I1qwo1ydQInNH2hhm4zgPGRQnARnBw+Tt58WocNTOzAByfioOI9FoNI/z2Ta2ZXV7EKqrd3c7DOY2BM21TJCpSGhHwJryRW/1b4EeoX344QcEnEd+W/X+0SOnq/s6w1FoU2WoMU+PzwLipCF2q+3B463liGTcWGptW1jrQFF7HXvOhKlz/pvigcUgFZgYshi6V7yhO215OSNgUJ66RoKGM3i/ccOsBNFImINgNEPZAYw0MkJSiMfw/TrITLwgCTx/vxEBVyfh9wbwSQslmANz3fCB+hRCVAF4fplNrM2tYETyGUpwO5Qz8YUTomHUt8tFQmNQ6Vo116tPHwEIP1A2Asre61Xvnz59CqjzZhEydUC7OjvFXi+AOPK/Ics5bJMt9CGjNAVp0p+BR566WQTRHD3WadFQjrMVD0MGHQJhhNGvC8In5RlrlKkmWhw9IMIloAeQQbc8HVEV72BfRWQMhzBZTMC8ppBy73MPiJcaEZzkQFtlcHe+pnL2JC5Cpp015O9kMRIybRrs/jLH1ra0Rg8hYYmbe9xI9QXC9yHps2v2A5YOl/sIBicIcw1KWceF38JfH4IErbp+ThM4w5CfCuICFQ1UV99yiXUp+xi9bMYD0iwZFA7W7vkLRDe9khRxaHh0gG9KXg4fqUr3A+3rngt2GFrKXZeKBXgtpVYugREUZBdAQE4It47FLukCW52C0vA5DqJk4HmIf59PwuDd61OQEVklMLvlYkS/P+NH0DOZ8vgnISM/YYEHpz3+LZCYL2BBogSXg2W9R44C+wJ/a2qB0vT74sJpIMALF6qBrQHKo0daRvMjWo588KEK2qpegQWcSA/uzru/perI6b4yW+dsQQCGstptjp0YzvJkCy2eM5pqWMyEyIl4OiUsI3gNcdgxJsUfDmo1LQZri+T562Ay8QpUvESAifQjksJeV6qh1Lvp3KlQ6M7F8XtcjDcbhirkAm04JxVFAG3BuckwsA6XIRNWnhZZeb7HPQkJM6wt+EdQP5auOUSKsQsIM2G06gNg3ws3MhQmhc8XF4ASOzIiopjXLhyFnupRrvee4Ooja0x/9FSvwFTBUUWD1VVHPzxaNRx/zKaMh5B3Q46zZXsGUqtgP9/cEBmZdeNiiMhgpDcyCyDHLATdgfb0T07PTHLhqSrxSNQhLyatXTQV56L0ZSkF0ywYn5yeFjjA/ZIwEmhvcw1WBVmbKcLvCudEVJQnF+iAtMC8Bu+zaASJGpCArMeIE+mCjFVLrfB4XJyWjOh8CvI9B8/ck0ZCnqJEF/f6llMKhKquCUwQ2b6t90hVX7KxOnpJ+0Be3/tVd/iBe5DuGYUyUiikD06fOtpXq/cq8ujvqzp69PQHp0631NvY5vA9EInTaumcwwMBDDbBc9VAwaM4TphvZNQ8N9+5FzXgzQi0BtHGgyHogkehBjmbvAZmDIAZvSRVR773iDFLmYSdCm1vBKqZH6Mgkk70JD4eAKjLu4wJR918EJ8Da0CzdlIPZeBTCAuWgk5VY88tDnpj5O1tX2oxE2FZrW7u8Vf9EVZRetw9fqwKwPzgw1NHqy4MJaOP+o5UtdBJyMIbrv4KU/pltC5M9LhwBNj96KmjR4+eAtZ//+hNFmJJgCzfJ3Q9kOaJt96pL34RxVxOOGg1HIkhNpPyPOnSb6ohdWrUD6ljqfN3FwA5Nt6BaHx81MecOQtGEvMbBqqRl6uvgRkBYPoujRiglKUJpiF9tgiR9VLCSfZS2d7kBTmhaPYO4nIOoC7vNiWcK+7MIH5eH2XMAY3T8WlkOIAPIhS2ODslL9qeNIEW64BkzrRa2pZywGD/MtvWvbTlg/eV/HvqVFXXBOie3kyMiiU1ghRIk+Urgh1vZlUdrWq53tXRdb2l6tSpozDy5lhH1dFTyonQV+psVcJ/FZlUlthYtme9gvwg2Yk9P/fn5AjmJRv3A703MGaWIW8gZ8q7wZY7uchUk0j2klHKN0mII+dqrl0zCG9ABwBMEoW+2IA4i5FgSc4no2S8QWPXFG4HQQaxLFo0x0BRX/c7gB8dOpmp1r3og9QkYCYE4tNkjL404oRqpOqR8q5923p1ZBTRBFK7ppDgcoSiLye4Od+qUkECaB6tqv7dkaozPqDSOSu+9oN8R+VZ9M5U9TX6vQltj09t3+9aqo8era5ew/KD00eqh61cs8+BcVwOfF74EcTphiyeI5i6jfelornZDDuPcrzOjDY+qPH2osTHySx0Ym4M55r5OHJmY1DBnyrU4KnNfQgd74M3IaPpSbqTvW8HPnq/09MpeBBPMeDjHUGIj/sgz8nBALsMIN9wXGQORjZH4oGicQjf0OcFmBNQJtLpng3T7BwJ39c0tr3UJKEULlB2fbxr/FWQNLzSd9yzryvBPHXq1PvETwCGSQI91IGLJfRVF3X/9a6g3TrmSgtF+PW1qqOnYfzqOyD4/ItsV5dW4Jokxbn9EBKEP0fHXIt7H1+YnMNnFQJwCi+gIgnxW9nmZ3G8TQ9lgWmEUVFlJiFg7HFIARbgcvzRtjg3roFYio8gOAJAXmBAO9/MT83JveDBhyRkA3yIoLvFNHQSX1yUS/22AxND6sVAkKx2K+ecGogC3Sy0da6vPn3qg/dPvU/oFgLQqqq+TPRLFMSfHbFfmxglhVhweDO4Cn4CaUzyjeqjH2xqhAqytirjvYC8akG33QKmymVRniOaezJFuWaC+cm5kUrZonwcstOBc/OT83dnBJUzd2en5keBKTLGgyDlgo2lKTKqACYyls4vLNybE3FH5u4tzI+Mz8/P1o3OL8qTEVY7D+0uGP4BE0zIeaFQmfyevJhwetgDZO0Fwvx3lKQh08bZWTlhRWxHmBaVAQgrbrW0as1XQ95tia42BJcTEJ5pOfO7qqqj1V3cDKgq0K6bni/y/ifVPPVUL7ArMoXqflfEMcgixqdm3VBa53PnnFpv9EJlmZVVa8ZPUShvz/O22o2jmEk6KIjFC1Ta8KyYANAktIBUJsMDSMo3DLgc2zveDLkBkhFeTng8jNzU0H0w2JORy9BUi0yyQFoMTjEo/dDUVAbdD4xKsygDGAjhr6K6IkPw3r2m2zASoT21OHPBYNDq593t1N9OZpKQ3/n9yKyixFYhMjPOJrgmDoFCOV3dxQnz9E1va6luIHiZEjQkzJJF5BmrxJ4OC+51D39SKIF3ipIiEeNM1akPN4FZ9UWic0J9EqHcrGxL2YZon8jweVqaq/U3a34qtnp4c7yHDPx/PiU6VwJKGVszrklrU7FNVji2OQzlkcYomMXz4DMjKVmAS43sWPQssZy5bcCbjEL5CPmdzXZ264kGkVni5lrYcvrUhy21rysHRLaBKYf0ioeK/LMGYlj2qovpsOCD/+RsnT1h6CWBtCVI88MP1/AEu72l0NmmFdgmq/6Ec/Y5kBBS0+fuUioQhdS9KkSmApI4sIYTFRUv4MvLuFykPLZhMPFTOX91ErbxNUCYyFEMclRiCkDlyZdxMKe8Jfgy3myIba/MI0GSRNfH2yae80foeomNc2v1B6eqK5Di1CSls+bd1fmzJE9GM8szWcWpe/PQXoZojGPHotKQId0OYqvVR44qbU6V0Pxtdau1ZesZeB9nE51P9PggJPJBf5U6NMSRjY+NcNSw7+EaGLTJmnQVnxkySRK8GWO+jKu7HZPvAVGTBuGBtHYb28KPHNDuLgjmDledqhKtyVcIAmkliyFekOWYVMGhKo1MSKmxnGrHOQwhSgGXITjiJTIKaqmuItpRFbeD0OyxtCnhaiMPhQaCcQ0QPQr4a6RdkYGvF/a94v0wx0xJ4GS0Vx14lIR27dsuAoYhp9EgxGQhlNdjqZBqHvxsF5uxqiPVjJ+sR//Nuf3eaLdukn5KbcXeyOhXFAdNRCKWRVqyCAvMNUAxYS+CWK5p+qjmHO931b89tQYmeJQ1TkivFiTyLQgmsJMRY+ivQZxEmOdJsZ4nR81VEyHjTVYKlu3OhKEDYzcYRWCW5rVbWtfn/x8UcTbBJX6kuvqmwfqLCejivYY0MHo4YtaV79OV+RKvxaMG4jV0z0wh+MAd1OhwtOoC/ySZTxhWSjDbQXicDUYv1ZVaWxISmZmfcasf/XVY/fvH+rENaaXHJy8g0t+TfWswCZEKWi0t26GiKJlQ5iM1NSLSKpaUlME8iKBQUGooxqrjmGJdYEWgGCEY4w75qFgEn6W+ERGEVKD+A3pZjYJe/Kjltx8qzfY2UOdngbXrwDZqTyajLMlw4hfo77Vo/cDV+ISrUASY32pl2ZMFOaWz8c7ZDeBdrooXnaL+UCI0TVJj+KG8plx7lMajaecPRqHXf2SXSSoeQBQdZnFuIJFYwTyd3gDSpKCKaogbEWB+nGMbXw/1M1CNYA05Sn9+u1tix98tmPuasm3dWq8yOGXAhxC7zCt9zzmnQZ+2OsKpTWQELj/osJRyU5R3hcna61GZXttpCNGrvXmOiN2PtJFnTXMAGHNUxO/K8nd8Bb2GBFUK54kA80R9moIybcsK0m6U2RzM4T4hR/akP5+NI58iIffcwdzDyXGJtSrs+bKeoEwMFZSecM75SGtN74UJGURaDVLzPPB0C65wBuwR9x6XCBhjMSMQw+iHGjhSpJiOXoNCpdGHvX29/+r/Ctmvj0hxHDldVwivKgNhlWWW1u1fDmdbHT9Ykr+htGfV4iM+EcUU2FYl/GyPAwVPVJLqxFtlJIlCVZnZZKoyv07aXGakuIc1AbtVwq5Pf4KWyyu1Ph5nfaL+av2JnmQSpZgAk6u1QahmEul68KxqIsjk4q7MWosYiVj/VbisOpeHvcwZRFQyyZRfqUMQ5soE+1//X1/eK//wi+vVF6qhfVxo+059BgU7U5ZYf7XMxjb2mPvZpMenIbbQ2J+7ooj6pJfxmFoQ8jPVGmxpkVBycSjuoFV2+7lZSJRmlcZDvEN7/Ykc0qhqZPIuFMxzACEgDOL61vC5+cRr0+cloZfLAUz4L2kwTJ0aJL7V/vn/pRO54n9OKc6FVg5W63uEzLxy63JrolXI8UMhzje81q6taWGxT+GEkPdbmBvTqGy29kY2jOL5bKAeyncSBqaWxK7JtyPyjAcOmBoaUjaQNoY86JkFyhP5MAqSESmm1msjbe43hzkmq8ufzMzNt0QRnOjM/O8QIhjyGraKO3QoJM7WOqf98pmYglI32xyeztoAxw4lV6qldadHhDeM5ArYeSmsWnX04i56rSOZWjlIUldTx8J57H2Ix/Txzf68nfEyUpRqKiRujrXb2byk8i/asy2d40IOHTp2cExzjei7u4Vd0UQdbXRX9wBvDwNfSlX4d4TvBaX14mWoICP+IKGN9ReYsm2QesoRJFSxuCyDgDAKlXQLB0YGmos91qqFqKh8Al9SjNTvmFoaRL7SpfOaRAWNYjIJ1YiEwiE2onqmg5OTJO4aiEZU0prvj2EVxHQytup8kra3jb5IdIeHPHQ81tYqu/XyNXFpQvxlvbXu4LsVKQExoaEpV7iR0eH8UQaPlxHjVRuz66VdHLCkEHeQGPfTmLqB8ow0ZJjlEcDYs1qao0b1PBefUCq51tqaaAkcDlc5/KtEIWWV8vZVLOJ4px6Foi9YxicyqIHigUCMCrYVlUjdQvdYliamKFmmQKlidKQmFIKrEf4tGRoGYpyMKesnFByNkX2+wQucojwRybt2GR8p6sJxkSdZkzgZDbJigYMLkxSCwNUZ4rttyKFBlqaOKauTiBdEn8ZxdhgyHMJl2rSgJlzgoU7MpGJwR4RuDRqYn4AiVOKaZKrKC3ikaRSV2hw/dEgJp2VCSX39uR6J3lqR4b7kgXluZF16RAfEdlGxRCuZbcFABRC8cBCcDAiI6pT5xjQ0sWsbhdxuPkc8YLBBV5KQl/jqufqywnhL51jlNUKATklr7oDxyBQ+A4s4UmbnFtp+CUte7RQdWkjXXKEevChE1krbhHg9/pPFquIrpL3V3aOZ6hMd9Dm5qWq9yMJ8DdIpn8cJtqIRYAMyfPk00jMjPguXCPPMC4CC0xuaayvmcObv+UJEFILDb4PpPEUscjQyUdG1JtoD06fWLqi/X3M7wwFDET0gNJUtJNbV2jqhsHR6/2qnMbdpZUXGEbFTOqNNjFGR9EeRHMSKqhRmMriCqKjkIIHUgjnQKBxsaK4Vr6zc9UU/+xm2/piBt0pz4q2t3WNDVFc4ZnvLYz3D7CfplC1379MZ6O9fEpjqZLCbk2gpHH5BxeBAoxMWyq7l6CEfnmRssMKJIcVFnCRfFk8Q0czs7OjoztfjC7oZhI4xZ4tGBxp8kEfTAs5jh0JshuQPYR1NxFhaKA7g8E9qBxbxOveRBfg0a1DU7IMsREttiF5cV6xHIqd2SCTdBJ2QAcYGKjUfX5gvwPZ2DmhRkjqlEkEaWSO9QkDncmkdkJ0M72wbYCL/tpFRUYHJo2iSkNPV+MOrz3oo5PgxV1vLrzzXVERUTDQXQJqemh65UsOVzDUJ+zOvcFIFjT58DtWzmSGZzese4HcOjE4sPLz3X8Uvb35R0cOWzq7Hj6+d/tDhxCH19Uv7jOTmL83RYyaTOpYE+h5dS8sFhnx8abxfvLRchzgzS2KtA13LtSnSqSgevjgqZmeNLC1Pytm5y/hogCZnSeQFNX/GvCUJa2RZasGApIWkP4mIEfkuExl0zt0FZsYiPqDFnFtatkBX8Hsi6dJyP81ctMRHNXNLQiOUP/t1R9tyKMHotHFIjOt1SiRLnchHxkHp04vc5m9mGV6CpeURuZQCYJIdRv/E9rOXLnJSxsa2TahpFJdZxR5abyFxzq2MVzYM0K5dmX+48nBlZaBWOldeO5TPzItMLjaoCETas0N5V8SsgfE6ycrKA/m9FchKYNh61d6raWAqhGw49zHbeiZpA5ijKY7j+OBYpaFoSbBfO3RsPlfD4e58t4XT0KIEeTXMC1H47FwR8owwDJUtVTjtMz05P58XbIo67w1QUdZ0AKG8MufnolD0+DJrX948HmVPRNQhn4sPpHfcW2ow3t85LzA16ZifNQMwZ53szy/MvQ1X60D+gvkOtYCxpWLtmBmlWq+Tz3ubTbHqliTqMXOBduKlcqQpXB708B+fbwr3xjrwSZTeD5mQCPloHvKJIW0bOArr2QQmWC8lijomsNRfp/7jT15H+/grc4vyBfnk0OS9fvHU0KBksFs6IOU3dy3eE41Mi2TTsrvfLsrx+RW2OnXXi6B7XicrtKg+G5ZebDz1cbdbFhuYwkfGJJUvycd89gwsdZggcxmei6E5yMdSBcsSpF6+JPpHvwl8StwRhuykS/mKAhc5nIBCX56J0ZOJ1KgQ0YHiIQ/MRLp4HsXM4x7KE/suLcyIR9qSIXHdsCSwR7X4HAEmpBfp+Gy6LggVZNAIFJi3MB+MPCIUQhiLxBeLI+7apS2MRrBllJh7UD8HAM856YzimdAvwKfoM0TRV9DX+PQg33/7cJ1xQ6Htpkd+K0GsTSiyFwk+3wcGvFrnyr0HOL4C5LdCtIcPHip+r9yHYw+J/x8Qab17K0St2x5jwvZ+EewK5Hk50XUTYbqW8KibwMzDAqRfs8n2QJlmmNMonkch38XPk/Z2Lksw/coloT454Dy+hE+EWowsFWvRSCxc7g31Vuay+7We32RBkR4JNSwMeJKNpfJGteR53JesUHz+y3LI44IapWLNACatEZ8j2HyaSqXjM0n6BJgW/KVODDKVobRVuaMxg0vYMuSHz/IEzVDFhadQKLzlGU/TMTwPihBB5Kbhs7mQaAvtXlrCZaHb5S1ILzHarWIPb6Qfm1sehImsm1JTd+bMGV4N3a55ZR7H5UB9kORcAKb/D+n16zdH/mPl4fwCHJUrkqcLDwa9Y4gZlbwayHGh18lhtyw3CZBYm2EfbGPxgywTUbOueCIT4f02fcxBJs8loTl5M9IR3JdguhX3hRqmeaGOqZKlPEfJMlTSQhHQIrFemHpyUcIfNUOEzVK5BJVp/rIlJjnpntxHdeL78jrVUpTmBZEZ1HXMaqEri6COixam7IxF9ztIZo33BVCqschcR4IvXxyrQRYS+awkFYuZWoAwb8e8yMRkVA6RcdQmn9gjkcu8yE4sL6e8kSUmom5nalo052wizRDnerhERM3HF25funTx0qVLF3iXxx/O3/9PQO3+/W9XVqS9ly4S7VKvdOXht/fvw/H/JDrGzl+ACYoZH9dAKJjZumYoKM7rWtissbEqhzkNqUt1fQwlj8kHGVjk5GKRsePdxQ5d/cHFES37rvsD++kTlR4BA18zaNKFUV6tNndxIVQHpvp9cxevJZ6GiiInlhvCOnCZHWLPL4aZEyfWYMsXRYF2QLY0VLc0K2iWLS42Uvj4XHr+NJQj+UoXhchbdL/LwXEIn2pidQQq74ghX5yjI23uAj5oDqb9koSRN40noSjittDegcVp7Qh8oetlxt18x2jpIn37jNoryVtI861EcQW/5dLFT/9d2T69eKlvluBugr3nrt+++Imq45OLt6/fXe2Y7ts0o6WJB0UIIRsJ02XYbxNhTk/NFhCy33fw7tQ8J3jw7vRkjGR2djy9aHZmpok9P7VwMlSCL85Ps/agfKD9COb47Kx4PyGNO/EJ5co3MoUuxeX/1eWF0sdmZ2VFhMEScW9q5p6AWAJLRr5Dy3iHaEzIwjqFM1Csxd1rKpqZmeJy5FP3TkIp5dIyft5IaeXoTt2VaZNR9H/dq4UwgUPjN2BzJlG9huC2GKhhenaWi2ru3at8e/LrxcXJDDXS9i6lEa9kMz86D/cSuFzqvQncfLP34r9/8unF232DIyNf9ik6LvbeuQ49io5LvX1fjkhv9t1WzOiDGdfv9F4i8Lyt8FTXWqx1GXdTKINmZmiiQ5j3akZGhsY6Gsb7DU01zYwM9+/R22+430jPxNBEn6Jn5uFpDLY17YCnBdprbGhoQtRiYk6zIvLqmkw9B18LEPJEp7ki86UJjrmxoephdR3ttHX091CR6R5DJy8jNUQxhksYEmcHobrHzsthLaxjaKRPOFPGRtoEuprm3h7wtxpxW1rIaL+hkSFSh18UfTMPDyPSY3McMVdPHNxIQ+6FfQDYzfJQ430GBsahdTcvfAKwfXrx4qefwocLN+sijA0MDEyjPt7aURkMEwyMw7k3ez/9pK90o/QICYn/ygsjY88lckhj47mI+uflIP5S7VVO/WbSDJHd5EfpqQTcS2+aZVzru/SJol3qu840ffMlVccB1nVVx6eX+q6l7lPNeEHDgH7+zrDbBnP9UKxVOxPbGp/FNn0ifq7GMLC1g5vKAlRTguUS80eM5g0mLrY1zow2rpHacPbt4sXYtreJreXhscettQKPsZITiHwEm3WQe2nTGxs34/iphndBFzDw9S6275s/3dDx8zf9OYqOKwWeGj/e0PGSAbdso5F53LawYx8KryinPYeXT00a4iIa+ttrWPLY5QnxeM8mRj8UN+INhBdRwOtoKA7TJgjxx7t37/7n3btfJQjvjVDo4BUE/YIwRV9VHN9NIPmSdgS7saOuIFzjJeQ35nZs/Ywhh+NvSUdkl2cDn1d1JvqbXMlq35bjmpBTuNm+di8UhvGvXwD9DAbQ9Vqf3WsO5o92e4JEVHbcLPdY73h1tz/veu+lTxUdPHrTZonpml2YnbDJNvr7TKol9Vgec3c/tKm5v3Xj5kWQhEQjBGVXyj6NN37+81+8qc8QElJyteN6F12f6HhDwzT1Wt/6jIs3hze7VYcOursfc7nlj/7OdzgxryvZ7J0r0EwcBbP8QktLywXQ1Z982nv92hkWi9NFqOlPFR0XoAPA673ZxWGxuNeuX/hkvePTi18lbhIbSrFZVvH3vlEcCUKasH/EVjAPlUqETamB3oGpDVcI2MBCB/eGsIQuXjjflBsdGpPfxAfY1jsAyS5eSqBXUHqz8GaZ89YzHnNPGHH472K3v5ZQxbA3ilutjm2lI7e4L1iqEb+EIs1LBH0SpHeppY3pGZnf8MUXNdHmmYJNHSmvqWawepyPbzlfyDGbnjTyMz7t0+6Ahj03dYZh2xtXT3sZMuYhKLTe+vCH3BK+oqNXVPrFh8MH9r1woYX/UeCLWbd6SrKJXYu6tNHbH6k62k6qQsowI+nWia10CQ5QabOu6g5Jf2GNTDF8hqWFRD4Ne54FdxFXE222onnYLfur6HB6mI/TPsUoh6iUFDpspYl4PfEJhdnuh2HXoo6fw9+e9NTkKGX6Zp+Tb3h0GONW4luPCszsIaf1J9RR31IGsP3z7PG0p60mJR+/gQamsDk31A+bcBlPvZMFMEuwj5JjqIxwzMGDOJGOk5njI0XOhllPs1gEwivpPfGPMOZbLjkP7vT23bl5JsJJfX0jvWBpbOHct4XuIcddEi4zXlo/zZseUWfu3OntvfMf2e6PYpk4HLZ2Kz4FbHa6hdKZwBQLQklK/0SVcIQ7IhORbI+67jpfRA3OzIzUCGQyPRVZWRJarbcgfhEDyVhBrjq2YbW9+fm0rWCSHiMxSGg/a0m1TF17ZkC9X4ggPxo+WN6fvtVfDVhir2ecsSdsdrGb3f6OyyO06ZLz5UWIAV2605fma/+GIoJqnDdc+qvC9lJbgCvEpWSU4WuxW4Gxg3/G9T7F6KFNwSIljzsn3Mj40erjeEx2F9VO5SMtp1VmJyEPnQ2UhylJhtI07hvsiXQYMzhzV/niea/HbMBBRm0CfbTXZH3Hg+a0J1OmYq0eLI4kCgcGF+r0KYqXSGtuUx/qhOXoyIkZkeyzlRP2TqQTu2Zg372hz54z7b9+hDYPuhVKIaYJ4aDbd1pSw4KCwpK7euLjE5ytFUZkiG32zb47Z5JDg4LC01ru3IZQ0aVLt4e3wdI2oafgF2ukwZ6FH6kB5BSRmRHSDQyCBaymQ0nGmsggNED16n1DQW7YS5u1NQkBIBikHDgPOeH99hjZ2AHztPAgUrY6Th7GyCvYi4zUvR1I6hy2hfajYK7WqHsaOZmsqoj1NfZkFCgTBa6ljLlc1CVS+am+B7bytL44CqnS7EhP/wkcT8YM6trf22JngxNokzMhq7xwGyju4u070HqnEkvO5sTFKuzSw64JZy/9+yVFx20iAHe7+vzErcStRhFE2BOuFr+xXgWRu8wj1o4EiifYDPOizqFuX82KRV6xoROfLywmeEu76EpTdwwpeUqcT4el+GSRxLE8n0wJ43VQ/euEpHwRx9uQ6WnK7fSLEnRLM8mBDXyzmAVhceDjKJOCxDCJtB4PJ0aaeJPJWgMjEf7RUeEKoicXN6CGIYhlAly58rSt3v9eEVSLaPhpEZKmiP0kpQXLUM70JFhvtZCO2WRfrc3PPXP7tiru29XzbX18SMgq5ZbeuaTq+PT27TMszpX2R2TvsWNWiTcKXt3Al+Yd+HJzNCVwSEr3cWQ4hs1W7OXIWXRNkcgwagl8JFIWHm7aPOMVNS6MAmYjI5Ho/Mg+EslPIqP6dN1Dnos1KOV+MSoXqEVG2HWN2XtKZfYRc7xoh61gkpG/o1J15UfnJSkLZTzNMcSYCUO+oolU5DMuG5mcnBqT1QInkJgdiDtCbG2nz5JMMbbKzD1tyUi/YbJcC1aXcEc9nlSjR0E/L+jJtnI/vlVzJLTzIr1SOS23FW12uqa27LDK+TxmXTJadEHZ0cL+t9Cky/Uu7lvoMtbVKqc/Y/MmQxoxvLuQEGgjamt0A+iyJliiGIg8ZpoyciGojTQHoR7ZFxYtSnkK+YaJBuoWKgDUJqkGKp7BNPhiffZo1/7KdKTuE9o4GoAapWZoOu9RmUlDFQyaBpWqLG2DXzSa3UAQlRo4waTUCs5LPS1YHFZ6clJq8VinOpWWwkfFMpCZaim1MQNMqiZ1U9PlpaFk8Um4Q3Wao4z1RKkMQKdchbqtR8EoG2b7Ic90oq4tlZv0sv+X2W4qBrbN5nlHEcdz/81RPbKyJ8fqcMgWU932vbLuqM27rMGaMBQ2JcK6AMzIDmb+VB1KWgxFb0+1pWdEQhZHe6QLatXup+yRNqtpQPAaE0rM+DiUeHVIQOBOQwXbZEotc4RVa25Wy00SynyobVI7yhQL2womrJq8wtzymKGjCrGdaQFrn0Upa4e9FoganG6UOwpvwKk7yVCc/AhCRUwNXig62WQAS0ALGrWxJy3eoGqitytbE63dt4o8q/jWq5xo1Sgo2ujIUQ057O5WX648/HpSZU+ZjXXsFizdbbLryz2V28mttQGWEea7UIMEI+a6tbidkUygzsBjDlhMinSRMSBCbbpritj3LDRH6oDV4JZFUn2nCWCs5hkn47a7ushiRFJuJB0vhzQ4C3EnIxB/RAfN1ejYYVvApCHeZFHmhpbBHFzIZ2YUiDL1u7vzJYKM3LyCgqKTNc0dy9ysvPN1kEkCmWnauTAwK8zK3NQyCqBusnKwoKPNR5qfLuRpP2klDNwIRS16ZKzk1+5blbGrZWJrO4+d5GPwAnrVLgO2clwr0ci+mmdn6Jl8prG9LN7y8FYF5v5e6cxgoNqWK7FFgo4BgRNKnRPRo8YG8kUSP3uxrFI3aVzSUUyEQjxFwsaBdHKaTMSAPTJoqSNSJkoZ64iImhis65ClQvpxNIJaORpOcuyUsZtlWVEiaSq5barDD9sqMzGnjqmJTW2gUjYxeVdgjuhC6dScbGJsfHxsVDbYXSydnBI7onAeISo9ivOZ4qnxzTMn22iYD186x9/bOC2TRj8JSzKK4lWAPGwtfARMIE5ny/iy1vqayjOVlTXthe4H13psstsruTX1rSUnLF1jt5pEAGZJ61ket4Lnt9GS0A9OyqSDOtekpzqhoMxArwgz5J0WDts9pKYpd56wSM70RxqBYZGhUG5GfTsizF+d5Ef3wYJSo52CIDluGqiJ7PzhJdmlxvgEOQSEhwaRLRgpmqtsDnv8UVSftX2D3t7QAs2RZ6CXh8IJiZGyAkMD/Px8PCz01JF9UCAoMB2L1b31nILf3tSC/RTFgd5iDjLwD3IkP8kbIpECJOKchBOW1gcPPdpCjrtaWiXklJSVlRbG224qHzpRWJKTYGnp/giUCjStLePjC0eEThi2/S53GzcHI23qIn3fAAesIbmSuaoetj1LRHBEpC+bJamhbbmd1dFk8rab+2IWJ5ndAxbkp3H4TSpa3Wzjjh/atikK5KwsLS2tXY9vjqxZW1lvKnXbbA3EWSa0F2hujsyQKRSKYvcc+EmGAlKoHCVTFPsFqfYHI1GIP5U/icPwaDAJHEf4pPA+yZjiHwwhnluxLRSMXr2IATNsfbUieXODwfai5ubaA/yJWnNEWT1IrBJVbHS0BiL5kUZCeuwxoR+4EeTv3CvqNWTEHk60jn0MLETS8jg0pSl6PPb4msI+HvLYKb+OtcoZztP8b95gnKSj/qRudS8nJydk5EN+9sgVzU/3KVdgUtAbycOFVgePH/quBkLUxjn2O4cdinW3Kr1Bf+FvcbN2DH2PfVyfZRKMC+yGteGPJ04V7x62LRnOUZapPwnyOPi+izbPv8LXCHxH7Fm57Oj7RDGfZRKMdCj+KgeIM+SJZBnfPrsy1XrCNe5Jw+LciW9nMP3r5RD+BjJCGuFftCdYhzwOzpDYg7YlY9+u/Gnl21s5tocfO+z4YavEqwL/n/7Av48BNha9VR9vc2g7nAAj2NN+DoqucfnDh7M9ibbHth/mbp3Q+lXSvh/6964Qy9ztWGP14FeGbA4ihYQcO2ib3TPz8OGfiOrWP3298mC6PdH28LFN2hxGhTjbJF6+lWGG/YBZfAOcVAumeLjwPWe3t1bxDAkJecv1Vzk3Zh88/K8/qbZW+tODh0szV7PdXN9agxPwdnOGbwHrTzEm73wd0CqcpL3htWNXCxOdVREid+df59RPLDx4+ODrDTtVff3g4X8u3Dqb7e6sAtPVNbH0hqwiSAfbgXKzhaobwR6aKCWivVDENjS9cP/hwweP7PwF8C4sTN7IVmSFDtZPi4qCtHa+f3K7FvBl+wmCheMs21cWtkFyFc97KyWWirRQwg2h0w5s23lEdnUjOcqsLYD5+edzDx8H5kzvHSWYkMookbGNyDvgbW0xc+2/dnc9uArmHz8fe/jto0h++/WK9N3frILp7uqWcGMiaEdePtLog1dz4t5xcQdvhgDzsz/0zD/YpH9wfPnBg7vX3yXAtAKD093lnbjC/u7QHei20+l0UX9hwnsuzscsWwHMz/74+dQWNB88HP39bxRgWr7l7PZeYulg19s7evxxhQ8+5788m5MQb1n2+R8+I9C8NQ/LflTt2wcP5u+8C1gCmIWWUIF0VgL7ayHyDpaP+5YYpJV5TXQ2u14B5mef/aF1+sHD1fZgso+AkgCzLOfsQFfKq4/ZI2CnqeAEcMyYV0bb//BHBZp//HykuaGRaA1XJL9XYvnuu1/K+Ol6qtE77UnMTqTwA86pwPzsc95qz5s8FZS/+X0HsX/urh0Gfxo8aT8zr/l8lTKbtF4n2i9ft//4XRWX//6kAYW2g+TThq5frVwDs+GXKmVvtgZmXy62o8Kf4ds9uU8C80462vHHn7rBt2eo1Pm2YN6M2gHzWb6tLkilgbYB8zfvfuyBdvzxpxear7z58eePBbOv+P/siMxn+0pkJZ9vB+aOyHy29jMUfvmzP24L5m/e7fDZ4fJnaq+80fH5Y8DsY7++kzl7Rj5ntv7hj9uA+Zt3r0XvcPmz7leu20VIzW3A/Eh7x498ZlMzsx2k5lYwgTB3jMxnJ02qOkGaj4DZ95Harh3CRM+8YNVT8vkfNoMJaHab76jy7+UGJQ8/QpkD4TtYfj8d9FLB8GebKVOc+iJ1h8m/XyROvWD48wb11UL8j3slGbtIO1h+34SletZ0gzJlRibpXJlkvLZjrv8ZaL4aKctTfgeZGkcc8OJOgOPPS6ab8STE4r9U6UmdnRT5n+9ZBnSLi0b4njum+vMxksz8DL+vQfT/AUT8+tUldBBtAAAAAElFTkSuQmCC";

// Fixed work-order numbers, keyed by site + block (or named street). A rule
// with only `block` matches all streets in that block; only `street` matches by
// street/name regardless of block. Returns "*" when the location has no mapping.
// KEEP IN SYNC with CONFIG.workOrders in index.html.
const WORK_ORDERS = [
  { site: "بيان", block: "11", wo: "67" },
  { site: "بيان", block: "10", wo: "68" },
  { site: "سلوى", block: "9",  wo: "64" },
  { site: "مشرف", street: "59", wo: "49" },
  { site: "بيان", street: "خالد بن عبد العزيز", wo: "53" },  // named main street
];
function normSp_(s) { return String(s == null ? "" : s).trim().replace(/\s+/g, " "); }
function woFor_(x) {
  const site = normSp_(x.site);
  let blockKey = "", streetKey = "";
  if (x.locationType === "named") { streetKey = normSp_(x.block); }                 // name stored in block
  else if (x.locationType === "km_range") { return "*"; }                          // highways — no WO map
  else { blockKey = normSp_(x.block); streetKey = normSp_(x.street); }
  for (var i = 0; i < WORK_ORDERS.length; i++) {
    var r = WORK_ORDERS[i];
    if (normSp_(r.site) !== site) continue;
    if (r.block  != null && normSp_(r.block)  !== blockKey)  continue;
    if (r.street != null && normSp_(r.street) !== streetKey) continue;
    return String(r.wo);
  }
  return "*";
}

// Shared, Copri-branded styling so both PDFs look identical.
function reportCss_() {
  return "<style>" +
    "body{font-family:Arial,'Arial Unicode MS',sans-serif;direction:rtl;color:#1A1A2E;font-size:11px;margin:0;}" +
    ".hdr{width:100%;border-collapse:collapse;border-bottom:3px solid #00A651;margin-bottom:10px;}" +
    ".hdr td{vertical-align:middle;padding:4px;}" +
    ".logo-img{height:52px;width:auto;display:block;}" +
    ".mpw-img{height:46px;width:auto;display:block;}" +
    ".h-title{font-size:17px;font-weight:bold;color:#1A1A2E;}" +
    ".h-sub{font-size:9px;color:#666;}" +
    ".cards{width:100%;border-collapse:separate;border-spacing:6px 0;margin-bottom:10px;}" +
    ".card{background:#e8f5ee;border:1px solid #00A651;border-radius:6px;padding:7px;text-align:center;}" +
    ".card .lbl{font-size:9px;color:#007A3D;}" +
    ".card .val{font-size:18px;font-weight:bold;color:#007A3D;}" +
    ".proj{margin:14px 0 0;padding:7px 10px;background:#e8f5ee;border-right:4px solid #00A651;border-radius:4px;overflow:hidden;}" +
    ".proj .nm{font-size:13px;font-weight:bold;color:#1A1A2E;}" +
    ".proj .ct{font-size:10px;font-weight:bold;color:#007A3D;margin-right:10px;}" +
    ".proj .tt{font-size:9px;color:#666;float:left;}" +
    "h2{font-size:11px;color:#fff;background:#1A1A2E;padding:4px 8px;margin:6px 0 4px;border-radius:4px;}" +
    "table.data{border-collapse:collapse;width:100%;margin-bottom:4px;}" +
    "table.data th{background:#00A651;color:#fff;font-size:9px;padding:4px 3px;border:1px solid #00813f;}" +
    "table.data td{border:1px solid #d8d8d2;padding:3px;font-size:9px;text-align:center;}" +
    "tr.alt td{background:#f4f4f0;}" +
    ".foot{margin-top:12px;border-top:1px solid #ddd;padding-top:4px;text-align:center;color:#999;font-size:8px;}" +
    ".empty{color:#888;font-size:10px;padding:8px;}" +
    "</style>";
}
function workDayLabel_(win) {
  return Utilities.formatDate(new Date(win.start), TZ, "dd/MM/yyyy HH:mm") + " - " +
         Utilities.formatDate(new Date(win.end),   TZ, "dd/MM/yyyy HH:mm");
}
function repHeader_(title, win) {
  return reportCss_() +
    "<table class='hdr'><tr>" +
      "<td style='width:140px;text-align:right'><img class='logo-img' src='" + COPRI_LOGO + "'/></td>" +
      "<td style='text-align:center'><div class='h-title'>" + title + "</div>" +
        "<div class='h-sub'>" + REP.workDay + ": " + workDayLabel_(win) + "</div>" +
        "<div class='h-sub'>" + REP.updated + " " + Utilities.formatDate(new Date(), TZ, "dd/MM/yyyy HH:mm") + "</div></td>" +
      "<td style='width:140px;text-align:left'><img class='mpw-img' src='" + MPW_LOGO + "'/></td>" +
    "</tr></table>";
}
function repFooter_() { return "<div class='foot'>" + REP.footer + "</div>"; }
function cards_(pairs) {
  let t = "<table class='cards'><tr>";
  pairs.forEach(function (p) { t += "<td class='card'><div class='lbl'>" + p[0] + "</div><div class='val'>" + p[1] + "</div></td>"; });
  return t + "</tr></table>";
}
function dataRows_(arr) {
  let t = "";
  arr.forEach(function (cells, i) {
    t += "<tr class='" + (i % 2 ? "alt" : "") + "'>";
    cells.forEach(function (c) { t += "<td>" + c + "</td>"; });
    t += "</tr>";
  });
  return t;
}

// Plant-side: every dispatch this shift, with totals by plant and by mix.
function plantReportHtml_(rows, win) {
  let totalTons = 0; const byPlant = {}, bySite = {}, byMix = {};
  rows.forEach(function (x) {
    totalTons += x.tons;
    (byPlant[x.plant] = byPlant[x.plant] || { loads: 0, tons: 0 }); byPlant[x.plant].loads++; byPlant[x.plant].tons += x.tons;
    (bySite[x.site] = bySite[x.site] || { loads: 0, tons: 0 }); bySite[x.site].loads++; bySite[x.site].tons += x.tons;
    (byMix[x.mix] = byMix[x.mix] || { loads: 0, tons: 0 }); byMix[x.mix].loads++; byMix[x.mix].tons += x.tons;
  });
  let h = repHeader_(REP.plantTitle, win);
  h += cards_([[REP.totalLoads, rows.length], [REP.totalTons, fmt2_(totalTons)]]);
  function totBlock(title, obj, head) {
    const body = Object.keys(obj).map(function (k) { return [esc_(k || "-"), obj[k].loads, fmt2_(obj[k].tons)]; });
    return "<h2>" + title + "</h2><table class='data'><tr><th>" + head + "</th><th>" + REP.loads + "</th><th>" + REP.tons + "</th></tr>" + dataRows_(body) + "</table>";
  }
  h += totBlock(REP.byPlant, byPlant, REP.hPlant);
  h += totBlock(REP.bySite, bySite, REP.hSite);
  h += totBlock(REP.byMix, byMix, REP.hMix);
  h += "<h2>" + REP.details + "</h2>";
  if (!rows.length) return h + "<div class='empty'>" + REP.noData + "</div>" + repFooter_();
  h += "<table class='data'><tr><th>" + REP.hTime + "</th><th>" + REP.hNote + "</th><th>" + REP.hCompany + "</th><th>" + REP.hSite + "</th><th>" + REP.hMix + "</th><th>" + REP.hTons + "</th><th>" + REP.hTemp + "</th><th>" + REP.hPlant + "</th><th>" + REP.hDriver + "</th><th>" + REP.hStatus + "</th></tr>";
  h += dataRows_(rows.map(function (x) {
    return [esc_(x.time), esc_(x.note), esc_(x.company), esc_(x.site), esc_(x.mix), fmt2_(x.tons), esc_(x.tempDisp), esc_(x.plant), esc_(x.driver), esc_(x.status)];
  }));
  return h + "</table>" + repFooter_();
}

// Copri company rows only.
function copriRows_(allRows) {
  return allRows.filter(function (x) { return String(x.company).trim() === COPRI_COMPANY; });
}

// Distinct Copri project names active in a shift, in first-seen order.
function copriProjects_(allRows) {
  const seen = {}, list = [];
  copriRows_(allRows).forEach(function (x) { const p = x.project || "-"; if (!seen[p]) { seen[p] = 1; list.push(p); } });
  return list;
}

// Body of a Copri report: summary cards + per-project contract banner + per-site
// tables with receipt status. `rows` must already be Copri-filtered.
function copriBody_(rows) {
  if (!rows.length) return "<div class='empty'>" + REP.noData + "</div>";
  let gTons = 0; rows.forEach(function (x) { gTons += x.tons; });
  let h = cards_([[REP.totalLoads, rows.length], [REP.totalTons, fmt2_(gTons)]]);
  const groups = {};
  rows.forEach(function (x) {
    const p = x.project || "-", s = x.site || "-";
    (groups[p] = groups[p] || {}); (groups[p][s] = groups[p][s] || []).push(x);
  });
  Object.keys(groups).forEach(function (p) {
    // Contract banner — name (project) + number + project totals. All rows in a
    // project share the same contract, so read the number off the first one.
    let contractNo = "", projTons = 0, projLoads = 0;
    Object.keys(groups[p]).forEach(function (s) {
      groups[p][s].forEach(function (x) { projTons += x.tons; projLoads++; if (!contractNo) contractNo = x.contract || ""; });
    });
    h += "<div class='proj'><span class='nm'>" + esc_(p) + "</span>" +
         (contractNo ? "<span class='ct'>" + REP.contractNo + ": " + esc_(contractNo) + "</span>" : "") +
         "<span class='tt'>" + projLoads + " " + REP.loads + " &middot; " + fmt2_(projTons) + " " + REP.tons + "</span></div>";
    Object.keys(groups[p]).forEach(function (s) {
      const list = groups[p][s]; let st = 0; list.forEach(function (x) { st += x.tons; });
      h += "<h2>" + esc_(s) + " &mdash; " + list.length + " " + REP.loads + " &middot; " + fmt2_(st) + " " + REP.tons + "</h2>";
      h += "<table class='data'><tr><th>" + REP.hTime + "</th><th>" + REP.hNote + "</th><th>" + REP.hLoad + "</th><th>" + REP.hWO + "</th><th>" + REP.hMix + "</th><th>" + REP.hTons + "</th><th>" + REP.hTemp + "</th><th>" + REP.hDelta + "</th><th>" + REP.hStatus + "</th></tr>";
      h += dataRows_(list.map(function (x) {
        const status = x.decision ? x.decision : x.status;
        return [esc_(x.time), esc_(x.note), esc_(x.load), esc_(woFor_(x)), esc_(x.mix), fmt2_(x.tons), esc_(x.tempArr || x.tempDisp), esc_(x.delta), esc_(status)];
      }));
      h += "</table>";
    });
  });
  return h;
}

// Combined Copri-side report — every Copri project, grouped by project / site.
function copriReportHtml_(allRows, win) {
  return repHeader_(REP.copriTitle, win) + copriBody_(copriRows_(allRows)) + repFooter_();
}

// Single-project Copri report — same layout, limited to one project.
function copriProjectReportHtml_(allRows, win, project) {
  const rows = copriRows_(allRows).filter(function (x) { return (x.project || "-") === project; });
  const shortName = String(project).replace(/^كوبري\s*[—–-]\s*/, "");
  return repHeader_(REP.copriTitle + " — " + shortName, win) + copriBody_(rows) + repFooter_();
}

// Make a project name safe to use as a file name.
function sanitizeFile_(s) {
  return String(s).replace(/[\\\/:*?"<>|]+/g, " ").replace(/\s+/g, "_").replace(/^_+|_+$/g, "");
}

function reportFolder_() {
  const it = DriveApp.getFoldersByName(REPORT_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(REPORT_FOLDER);
}

// Build the named report PDFs for a shift: plant, combined Copri, and one per
// Copri project. Same builders everywhere → identical branding.
function shiftPdfs_(rows, win, day) {
  const pdfs = [
    Utilities.newBlob(plantReportHtml_(rows, win), "text/html", "p.html").getAs("application/pdf").setName("Plant_" + day + ".pdf"),
    Utilities.newBlob(copriReportHtml_(rows, win), "text/html", "c.html").getAs("application/pdf").setName("Copri_" + day + ".pdf"),
  ];
  copriProjects_(rows).forEach(function (p) {
    pdfs.push(Utilities.newBlob(copriProjectReportHtml_(rows, win, p), "text/html", "x.html")
                .getAs("application/pdf").setName("Copri_" + sanitizeFile_(p) + "_" + day + ".pdf"));
  });
  return pdfs;
}

// Generate reports for the shift containing anchorMs; save to Drive + email.
function generateReportsForShift(anchorMs) {
  const win  = shiftWindow(anchorMs);
  const rows = collectShift(win);
  const day  = Utilities.formatDate(new Date(win.start), TZ, "yyyy-MM-dd");
  const folder = reportFolder_();
  const pdfs = shiftPdfs_(rows, win, day);
  pdfs.forEach(function (b) { folder.createFile(b); });
  if (REPORT_EMAIL) {
    MailApp.sendEmail({
      to: REPORT_EMAIL,
      subject: "Copri Asphalt daily reports - " + day,
      body: "Plant-side, Copri-side, and per-project work-day reports attached.\nWork day: " + workDayLabel_(win),
      attachments: pdfs,
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
  try { rebuildAsphaltClean(); } catch (e) {}
}

// ═══════════════════════════════════════════════════════════════════
// WEEKLY / MONTHLY PERIOD REPORTS (PDF)
// ═══════════════════════════════════════════════════════════════════
// Same builders/branding as the daily report, but summary-oriented so a
// month's PDF stays short: totals per site and per mix (type), plus a
// Flags section listing the problem loads (not received / big temp drop /
// engineer remarks on receival). collectShift() already accepts any
// {start,end} window, so the whole period is collected the same way.

// The 7-work-day week window (noon..noon days) containing an instant.
function weekWindow(anchorMs) {
  const startNoon = shiftWindow(anchorMs).start;
  const u    = parseInt(Utilities.formatDate(new Date(startNoon), TZ, "u"), 10); // 1=Mon..7=Sun
  const diff = (u - WEEK_START_U + 7) % 7;
  const start = startNoon - diff * 86400000;
  return { start: start, end: start + 7 * 86400000 };
}

// The calendar-month window (1st noon → 1st-of-next-month noon) containing
// an instant, judged by the work-day it belongs to.
function monthWindow(anchorMs) {
  const startNoon = shiftWindow(anchorMs).start;
  const ym    = Utilities.formatDate(new Date(startNoon), TZ, "yyyy-MM");
  const y     = parseInt(ym.slice(0, 4), 10), m = parseInt(ym.slice(5, 7), 10);
  const ny    = (m === 12) ? y + 1 : y, nm = (m === 12) ? 1 : m + 1;
  const start = new Date(ym + "-01T12:00:00+03:00").getTime();
  const end   = new Date(ny + "-" + (nm < 10 ? "0" + nm : nm) + "-01T12:00:00+03:00").getTime();
  return { start: start, end: end };
}

// Strip the "كوبري — " prefix from a project name (no Arabic literal in code).
function shortProj_(p) {
  return String(p).replace(new RegExp("^" + COPRI_COMPANY + "\\s*[\\u2014\\u2013-]\\s*"), "");
}

// dd/MM/yyyy – dd/MM/yyyy over the work-day labels covered by the window.
function periodRangeLabel_(win) {
  return Utilities.formatDate(new Date(win.start), TZ, "dd/MM/yyyy") + " – " +
         Utilities.formatDate(new Date(win.end - 86400000), TZ, "dd/MM/yyyy");
}
function periodDayCount_(win) { return Math.round((win.end - win.start) / 86400000); }

// Period header: same logos/branding as the daily one, period-aware sub-line.
function periodHeader_(title, win, periodWord) {
  return reportCss_() +
    "<table class='hdr'><tr>" +
      "<td style='width:140px;text-align:right'><img class='logo-img' src='" + COPRI_LOGO + "'/></td>" +
      "<td style='text-align:center'><div class='h-title'>" + title + "</div>" +
        "<div class='h-sub'>" + periodWord + ": " + periodRangeLabel_(win) +
          " (" + periodDayCount_(win) + " " + REPP.days + ")</div>" +
        "<div class='h-sub'>" + REP.updated + " " + Utilities.formatDate(new Date(), TZ, "dd/MM/yyyy HH:mm") + "</div></td>" +
      "<td style='width:140px;text-align:left'><img class='mpw-img' src='" + MPW_LOGO + "'/></td>" +
    "</tr></table>";
}

// { loads, tons } accumulator keyed by an arbitrary field.
function bump_(obj, key, tons) {
  const k = key || "-";
  (obj[k] = obj[k] || { loads: 0, tons: 0 }); obj[k].loads++; obj[k].tons += tons;
}
// A totals table (key / loads / tons), keys sorted.
function totBlock_(title, obj, head) {
  const body = Object.keys(obj).sort().map(function (k) { return [esc_(k || "-"), obj[k].loads, fmt2_(obj[k].tons)]; });
  return "<h2>" + title + "</h2><table class='data'><tr><th>" + head + "</th><th>" +
         REP.loads + "</th><th>" + REP.tons + "</th></tr>" + dataRows_(body) + "</table>";
}
// Roll a set of rows into totals by plant / company / site / mix.
function periodAgg_(rows) {
  const a = { loads: rows.length, tons: 0, byPlant: {}, bySite: {}, byMix: {}, byCompany: {} };
  rows.forEach(function (x) {
    a.tons += x.tons;
    bump_(a.byPlant, x.plant, x.tons);
    bump_(a.byCompany, x.company, x.tons);
    bump_(a.bySite, x.site, x.tons);
    bump_(a.byMix, x.mix, x.tons);
  });
  return a;
}

// Flagged loads in a period: not received, big temp drop, or engineer
// remarks on receival. A load can raise more than one flag.
function periodFlags_(rows) {
  const out = [];
  rows.forEach(function (x) {
    const types = [];
    const tD = Number(x.tempDisp), tA = Number(x.tempArr);
    if (!x.received) types.push(REPP.flagNotReceived);
    if (!isNaN(tD) && !isNaN(tA) && tA > 0 && (tD - tA) > TEMP_DROP_WARN) types.push(REPP.flagTempDrop);
    if (String(x.recRemarks || "").trim() !== "") types.push(REPP.flagRemarks);
    if (types.length) out.push({ x: x, types: types });
  });
  out.sort(function (a, b) { return String(a.x.day).localeCompare(String(b.x.day)); });
  return out;
}
function flagsTableHtml_(flagged) {
  let h = "<h2>" + REPP.flagsTitle + " (" + flagged.length + ")</h2>";
  if (!flagged.length) return h + "<div class='empty'>" + REPP.noFlags + "</div>";
  h += "<table class='data'><tr>" +
       "<th>" + REPP.hDate + "</th><th>" + REP.hNote + "</th><th>" + REP.hProject + "</th><th>" + REP.hSite + "</th>" +
       "<th>" + REP.hMix + "</th><th>" + REP.hTons + "</th><th>" + REP.hTempDisp + "</th><th>" + REP.hTempArr + "</th>" +
       "<th>" + REPP.flagType + "</th><th>" + REPP.hRemarks + "</th></tr>";
  h += dataRows_(flagged.map(function (f) {
    const x = f.x;
    return [esc_(x.day), esc_(x.note), esc_(shortProj_(x.project)), esc_(x.site), esc_(x.mix),
            fmt2_(x.tons), esc_(x.tempDisp), esc_(x.tempArr || "-"),
            f.types.join(" • "), esc_(x.recRemarks || "")];
  }));
  return h + "</table>";
}

// Plant-side period report: overall totals + by plant / company / site / mix.
function periodPlantHtml_(rows, win, title, periodWord) {
  const a = periodAgg_(rows);
  let h = periodHeader_(title, win, periodWord);
  h += cards_([[REP.totalLoads, a.loads], [REP.totalTons, fmt2_(a.tons)]]);
  if (!rows.length) return h + "<div class='empty'>" + REP.noData + "</div>" + repFooter_();
  h += totBlock_(REP.byPlant, a.byPlant, REP.hPlant);
  h += totBlock_(REP.byCompany, a.byCompany, REP.hCompany);
  h += totBlock_(REP.bySite, a.bySite, REP.hSite);
  h += totBlock_(REP.byMix, a.byMix, REP.hMix);
  return h + repFooter_();
}

// Copri-side period report: per-project quantities per site and per mix (type),
// plus the flags section. `project` limits it to one project (per-project PDF).
function periodCopriHtml_(allRows, win, title, periodWord, project) {
  let rows = copriRows_(allRows);
  if (project) rows = rows.filter(function (x) { return (x.project || "-") === project; });
  let h = periodHeader_(title, win, periodWord);
  if (!rows.length) return h + "<div class='empty'>" + REP.noData + "</div>" + repFooter_();
  const a = periodAgg_(rows);
  const flagged = periodFlags_(rows);
  h += cards_([[REP.totalLoads, a.loads], [REP.totalTons, fmt2_(a.tons)], [REPP.flagsCard, flagged.length]]);
  const groups = {};
  rows.forEach(function (x) { const p = x.project || "-"; (groups[p] = groups[p] || []).push(x); });
  Object.keys(groups).forEach(function (p) {
    const list = groups[p]; let projTons = 0, contractNo = "";
    list.forEach(function (x) { projTons += x.tons; if (!contractNo) contractNo = x.contract || ""; });
    h += "<div class='proj'><span class='nm'>" + esc_(p) + "</span>" +
         (contractNo ? "<span class='ct'>" + REP.contractNo + ": " + esc_(contractNo) + "</span>" : "") +
         "<span class='tt'>" + list.length + " " + REP.loads + " &middot; " + fmt2_(projTons) + " " + REP.tons + "</span></div>";
    const bySite = {}, byMix = {};
    list.forEach(function (x) { bump_(bySite, x.site, x.tons); bump_(byMix, x.mix, x.tons); });
    h += totBlock_(REP.bySite, bySite, REP.hSite);
    h += totBlock_(REP.byMix, byMix, REP.hMix);
  });
  h += flagsTableHtml_(flagged);
  return h + repFooter_();
}

// Titles/labels/file-tag for a period kind ("week" | "month").
function periodTitles_(kind) {
  return (kind === "month")
    ? { plant: REPP.monthPlantTitle, copri: REPP.monthCopriTitle, word: REPP.periodMonth, tagName: "Month" }
    : { plant: REPP.weekPlantTitle,  copri: REPP.weekCopriTitle,  word: REPP.periodWeek,  tagName: "Week"  };
}

// Build the period PDFs: plant, combined Copri, one per Copri project.
function periodPdfs_(rows, win, kind, tag) {
  const t = periodTitles_(kind);
  const pdfs = [
    Utilities.newBlob(periodPlantHtml_(rows, win, t.plant, t.word), "text/html", "p.html")
      .getAs("application/pdf").setName("Plant_" + t.tagName + "_" + tag + ".pdf"),
    Utilities.newBlob(periodCopriHtml_(rows, win, t.copri, t.word, null), "text/html", "c.html")
      .getAs("application/pdf").setName("Copri_" + t.tagName + "_" + tag + ".pdf"),
  ];
  copriProjects_(rows).forEach(function (p) {
    pdfs.push(Utilities.newBlob(periodCopriHtml_(rows, win, t.copri + " — " + shortProj_(p), t.word, p), "text/html", "x.html")
                .getAs("application/pdf").setName("Copri_" + sanitizeFile_(p) + "_" + t.tagName + "_" + tag + ".pdf"));
  });
  return pdfs;
}

// Collect the window, build the PDFs, save to Drive + email.
function generatePeriodReports_(anchorMs, kind) {
  const win  = (kind === "month") ? monthWindow(anchorMs) : weekWindow(anchorMs);
  const rows = collectShift(win);
  const tag  = (kind === "month")
    ? Utilities.formatDate(new Date(win.start), TZ, "yyyy-MM")
    : Utilities.formatDate(new Date(win.start), TZ, "yyyy-MM-dd");
  const folder = reportFolder_();
  const pdfs = periodPdfs_(rows, win, kind, tag);
  pdfs.forEach(function (b) { folder.createFile(b); });
  if (REPORT_EMAIL) {
    MailApp.sendEmail({
      to: REPORT_EMAIL,
      subject: "Copri Asphalt " + (kind === "month" ? "monthly" : "weekly") + " reports - " + tag,
      body: "Plant-side, Copri-side, and per-project reports attached.\nPeriod: " + periodRangeLabel_(win),
      attachments: pdfs,
    });
  }
  return win;
}

function generateCurrentWeekReports() {
  generatePeriodReports_(Date.now(), "week");
  try { SpreadsheetApp.getUi().alert(REP.done); } catch (e) {}
}
function generatePreviousWeekReports() {
  generatePeriodReports_(weekWindow(Date.now()).start - 1000, "week");
  try { SpreadsheetApp.getUi().alert(REP.done); } catch (e) {}
}
function generateCurrentMonthReports() {
  generatePeriodReports_(Date.now(), "month");
  try { SpreadsheetApp.getUi().alert(REP.done); } catch (e) {}
}
function generatePreviousMonthReports() {
  generatePeriodReports_(monthWindow(Date.now()).start - 1000, "month");
  try { SpreadsheetApp.getUi().alert(REP.done); } catch (e) {}
}

// Installed time-trigger handlers (report the period that just closed).
function weeklyReportTrigger()  { generatePeriodReports_(weekWindow(Date.now()).start - 1000, "week"); }
function monthlyReportTrigger() { generatePeriodReports_(monthWindow(Date.now()).start - 1000, "month"); }

// Optional installers — run ONCE from the editor to auto-generate periods.
// Weekly fires on the week-start weekday (Saturday) ~13:00 for the prior week;
// monthly fires on the 1st ~13:00 for the prior month.
function createWeeklyReportTrigger() {
  ScriptApp.newTrigger("weeklyReportTrigger").timeBased().onWeekDay(ScriptApp.WeekDay.SATURDAY).atHour(13).create();
}
function createMonthlyReportTrigger() {
  ScriptApp.newTrigger("monthlyReportTrigger").timeBased().onMonthDay(1).atHour(13).create();
}

// ── One-time backfill: reports for every work day that has data ────────
// Walks noon-to-noon work days from the first dispatch to the last and writes
// the full report set for each day into the Drive folder, with the current
// branding. Idempotent: files that already exist (by name) are skipped, so it
// is safe to re-run — e.g. if it hits the Apps Script ~6-min limit, just run it
// again to resume. Does NOT email (avoids flooding the inbox for old days).
function backfillReports() {
  const ss   = SpreadsheetApp.openById(SHEET_ID);
  const d    = ss.getSheetByName(DISPATCH_SHEET).getDataRange().getValues();
  const tsIx = d[0].indexOf(COL.ts);
  let minMs = Infinity, maxMs = -Infinity;
  for (let i = 1; i < d.length; i++) {
    const t = d[i][tsIx];
    if (t instanceof Date) { const ms = t.getTime(); if (ms < minMs) minMs = ms; if (ms > maxMs) maxMs = ms; }
  }
  if (!isFinite(minMs)) { Logger.log("Backfill: no dispatch data found."); return; }

  const folder = reportFolder_();
  let days = 0, created = 0, skipped = 0;
  for (let anchor = shiftWindow(minMs).start; anchor <= maxMs; anchor = shiftWindow(anchor).end) {
    const win  = shiftWindow(anchor);
    const rows = collectShift(win);
    if (!rows.length) continue;
    const day = Utilities.formatDate(new Date(win.start), TZ, "yyyy-MM-dd");
    shiftPdfs_(rows, win, day).forEach(function (blob) {
      if (folder.getFilesByName(blob.getName()).hasNext()) { skipped++; return; }
      folder.createFile(blob); created++;
    });
    days++;
  }
  const msg = "Backfill done: " + days + " work days, " + created + " files created, " + skipped + " already existed (folder: " + REPORT_FOLDER + ").";
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(REP.doneBackfill + "\n\n" + msg); } catch (e) {}
  return msg;
}

// Rewrite the stored work-order column for past *Copri* dispatch rows to the
// fixed value from WORK_ORDERS. Reports already derive the WO live, so this is
// only for correcting stored data / the in-app history. Idempotent; non-Copri
// rows are left untouched (the WO rules only cover Copri sites).
function applyFixedWorkOrders() {
  const ss   = SpreadsheetApp.openById(SHEET_ID);
  const sh   = ss.getSheetByName(DISPATCH_SHEET);
  const data = sh.getDataRange().getValues();
  const h    = data[0];
  const ixCo = h.indexOf(COL.company), ixSite = h.indexOf(COL.site), ixBlock = h.indexOf(COL.block),
        ixStreet = h.indexOf(COL.street), ixLoc = h.indexOf(COL.locType), ixWO = h.indexOf(COL.workOrder);
  let changed = 0;
  const col = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    let wo = row[ixWO];
    if (String(row[ixCo]).trim() === COPRI_COMPANY) {
      const v = woFor_({ site: row[ixSite], block: row[ixBlock], street: row[ixStreet], locationType: locCode(row[ixLoc]) });
      if (String(wo) !== v) changed++;
      wo = v;
    }
    col.push([wo]);
  }
  if (col.length) sh.getRange(2, ixWO + 1, col.length, 1).setValues(col);
  const msg = "Fixed work orders applied to " + changed + " past Copri rows (of " + col.length + ").";
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
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

// ═══════════════════════════════════════════════════════════════════
// ── MILLING MODULE ─────────────────────────────────────────────────
// Self-contained milling-program workflow. Wired into doGet/doPost via
// millingDoGet_() and millingDoPost_(). All names prefixed "milling"/MCOL/
// MILL so the module can be extracted cleanly later.
// ═══════════════════════════════════════════════════════════════════
const MILLING_SHEET = "Milling Programs";
const MCOL = {
  programId:        "رقم البرنامج",
  project:          "المشروع",
  workOrder:        "رقم أمر العمل",
  site:             "الموقع",
  block:            "القطعة",
  street:           "الشارع",
  depth:            "سماكة القشط",
  itemCode:         "رمز البند",
  area:             "المساحة المطلوب قشطها (م²)",
  machines:         "عدد ماكينات القشط",
  requestedDate:    "التاريخ المطلوب",
  priority:         "الأولوية",
  engineer:         "اسم المهندس",
  submittedAt:      "وقت التقديم",
  status:           "الحالة",
  pmName:           "اسم مدير المشروع",
  pmDecision:       "قرار مدير المشروع",
  pmNote:           "ملاحظات مدير المشروع",
  pmDecidedAt:      "وقت قرار المدير",
  audit:            "سجل المراجعات",
  marcoScheduledAt: "وقت جدولة ماركو",
  marcoNote:        "ملاحظات ماركو",
  engNotes:         "ملاحظات المهندس",
};
const MILLING_HEADERS = [
  MCOL.programId, MCOL.project, MCOL.workOrder, MCOL.site, MCOL.block, MCOL.street,
  MCOL.depth, MCOL.itemCode, MCOL.area, MCOL.machines, MCOL.requestedDate, MCOL.priority,
  MCOL.engineer, MCOL.submittedAt, MCOL.status, MCOL.pmName, MCOL.pmDecision,
  MCOL.pmNote, MCOL.pmDecidedAt, MCOL.audit, MCOL.marcoScheduledAt, MCOL.marcoNote,
  MCOL.engNotes,
];
// Status values (Arabic).
const MILL = {
  pending:  "بانتظار الموافقة",
  rejected: "مرفوض",
  review:   "مراجعة",
  approved: "معتمد",
  scheduled:"مجدول",
  progress: "قيد التنفيذ",
  complete: "مكتمل",
};

// ── MATERIALS RECEIPT MODULE — constants (separable) ────────────────
// Arabic lives ONLY in MATCOL (one string per line) — the bidi-safety rule.
const MATERIALS_SHEET = "Materials Log";
const MATERIAL_FOLDER = "Materials Receipts";   // Drive folder for receipt photos
const MATCOL = {
  receiptId:     "رقم الاستلام",
  timestamp:     "الطابع الزمني",
  receiver:      "اسم المستلم",
  project:       "المشروع",
  site:          "الموقع",
  workOrder:     "رقم أمر العمل",
  block:         "القطعة",
  street:        "الشارع / الموقع التفصيلي",
  category:      "فئة المادة",
  material:      "المادة",
  quantity:      "الكمية",
  unit:          "الوحدة",
  rate:          "السعر",
  amount:        "القيمة",
  supplier:      "المورد",
  subcontractor: "المقاول من الباطن",
  photoUrl:      "صورة الإيصال",
  remarks:       "ملاحظات",
};
const MATERIALS_HEADERS = [
  MATCOL.receiptId, MATCOL.timestamp, MATCOL.receiver, MATCOL.project, MATCOL.site,
  MATCOL.workOrder, MATCOL.block, MATCOL.street, MATCOL.category, MATCOL.material,
  MATCOL.quantity, MATCOL.unit, MATCOL.rate, MATCOL.amount, MATCOL.supplier,
  MATCOL.subcontractor, MATCOL.photoUrl, MATCOL.remarks,
];

// Run once in the Apps Script editor to create the Milling Programs tab.
function setupMillingSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName(MILLING_SHEET);
  if (!sh) sh = ss.insertSheet(MILLING_SHEET);
  const range = sh.getRange(1, 1, 1, MILLING_HEADERS.length);
  range.setValues([MILLING_HEADERS]);
  range.setFontWeight("bold").setBackground("#1a1a2e").setFontColor("#00A651").setFontSize(10);
  sh.setFrozenRows(1);
  sh.setColumnWidths(1, MILLING_HEADERS.length, 150);
  SpreadsheetApp.flush();
  Logger.log("Milling Programs sheet ready - " + MILLING_HEADERS.length + " cols.");
}

function millingSheet_() { return SpreadsheetApp.openById(SHEET_ID).getSheetByName(MILLING_SHEET); }
function millingNow_()   { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX"); }

function millingRowToObj_(headers, row) {
  const o = {};
  Object.keys(MCOL).forEach(function (k) { o[k] = row[headers.indexOf(MCOL[k])]; });
  try { o.audit = JSON.parse(o.audit || "[]"); } catch (e) { o.audit = []; }
  if (o.requestedDate instanceof Date) o.requestedDate = Utilities.formatDate(o.requestedDate, TZ, "yyyy-MM-dd");
  else o.requestedDate = String(o.requestedDate || "");
  return o;
}
function millingAllObjs_() {
  const sh = millingSheet_(); if (!sh) return [];
  const data = sh.getDataRange().getValues(); if (data.length < 2) return [];
  const h = data[0];
  return data.slice(1).map(function (r) { return millingRowToObj_(h, r); });
}
function millingFindRow_(programId) {
  const sh = millingSheet_(); if (!sh) return null;
  const data = sh.getDataRange().getValues();
  const idx = data[0].indexOf(MCOL.programId);
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idx]) === String(programId)) return { sheet: sh, headers: data[0], rowIndex: i + 1, row: data[i] };
  }
  return null;
}
// Build a sheet row (header order) from an object keyed by MCOL keys.
function millingObjToRow_(o) {
  return MILLING_HEADERS.map(function (hdr) {
    for (var k in MCOL) { if (MCOL[k] === hdr) return (o[k] != null ? o[k] : ""); }
    return "";
  });
}

// ── GET routing ──
function millingDoGet_(e) {
  const p = e.parameter;
  if (p.millingProgram || p.millingReport) {
    const id = p.millingProgram || p.millingReport;
    const found = millingFindRow_(id);
    return jsonResponse({ program: found ? millingRowToObj_(found.headers, found.row) : null });
  }
  if (p.millingByEngineer) {
    const name = String(p.millingByEngineer);
    return jsonResponse({ programs: millingAllObjs_().filter(function (x) { return String(x.engineer) === name; }) });
  }
  if (p.millingPMQueue) {   // awaiting a PM decision (client filters by PM's projects)
    return jsonResponse({ programs: millingAllObjs_().filter(function (x) { return x.status === MILL.pending || x.status === MILL.review; }) });
  }
  if (p.millingDecided) {   // PM history — everything already decided
    return jsonResponse({ programs: millingAllObjs_().filter(function (x) { return x.status !== MILL.pending && x.status !== MILL.review; }) });
  }
  if (p.millingMarcoQueue) {
    return jsonResponse({ programs: millingAllObjs_().filter(function (x) { return x.status === MILL.approved || x.status === MILL.scheduled || x.status === MILL.progress; }) });
  }
  return null;
}

// ── POST routing ──
function millingDoPost_(p) {
  if (p.type === "submitMillingProgram") return millingSubmit_(p);
  if (p.type === "updateMillingStatus")  return millingUpdateStatus_(p);
  if (p.type === "reviseMillingProgram") return millingRevise_(p);
  return null;
}

function millingSubmit_(p) {
  const sh = millingSheet_();
  if (!sh) return jsonResponse({ success: false, error: "Milling sheet missing - run setupMillingSheet()" });
  if (millingFindRow_(p.programId)) return jsonResponse({ success: false, duplicate: true });
  const now = millingNow_();
  const audit = [{ action: "submitted", by: p.engineerName || "", role: "engineer", ts: now }];
  const o = {
    programId: p.programId, project: p.project || "", workOrder: p.workOrder || "",
    site: p.site || "", block: p.block || "", street: p.street || "",
    depth: p.depth || "", itemCode: p.itemCode || "", area: p.area || "", machines: p.machines || "",
    requestedDate: p.requestedDate || "", priority: p.priority || "",
    engineer: p.engineerName || "", submittedAt: now, status: MILL.pending,
    pmName: "", pmDecision: "", pmNote: "", pmDecidedAt: "",
    audit: JSON.stringify(audit), marcoScheduledAt: "", marcoNote: "", engNotes: p.notes || "",
  };
  sh.appendRow(millingObjToRow_(o));
  SpreadsheetApp.flush();
  return jsonResponse({ success: true, programId: p.programId });
}

function millingUpdateStatus_(p) {
  const found = millingFindRow_(p.programId);
  if (!found) return jsonResponse({ success: false, error: "not found" });
  const obj = millingRowToObj_(found.headers, found.row);
  const audit = obj.audit || [];
  const now = millingNow_();
  const sets = {};
  var action, role = p.role || "";
  switch (p.decision) {
    case "approve":
      sets.status = MILL.approved; sets.pmName = p.by || ""; sets.pmDecision = MILL.approved;
      sets.pmNote = p.note || ""; sets.pmDecidedAt = now; action = "approved"; role = "pm"; break;
    case "reject":
      if (!p.note) return jsonResponse({ success: false, error: "note required" });
      sets.status = MILL.rejected; sets.pmName = p.by || ""; sets.pmDecision = MILL.rejected;
      sets.pmNote = p.note; sets.pmDecidedAt = now; action = "rejected"; role = "pm"; break;
    case "schedule":
      sets.status = MILL.scheduled; sets.marcoScheduledAt = now; sets.marcoNote = p.note || "";
      action = "scheduled"; role = "marco"; break;
    case "start":
      sets.status = MILL.progress; action = "started"; role = "marco"; break;
    case "complete":
      sets.status = MILL.complete; action = "completed"; break;
    default:
      return jsonResponse({ success: false, error: "unknown decision" });
  }
  const ev = { action: action, by: p.by || "", role: role, ts: now };
  if (p.note) ev.note = p.note;
  audit.push(ev);
  sets.audit = JSON.stringify(audit);
  Object.keys(sets).forEach(function (k) {
    const col = found.headers.indexOf(MCOL[k]) + 1;
    if (col > 0) found.sheet.getRange(found.rowIndex, col).setValue(sets[k]);
  });
  SpreadsheetApp.flush();
  return jsonResponse({ success: true, status: sets.status });
}

function millingRevise_(p) {
  const found = millingFindRow_(p.programId);
  if (!found) return jsonResponse({ success: false, error: "not found" });
  const obj = millingRowToObj_(found.headers, found.row);
  if (obj.status !== MILL.rejected) return jsonResponse({ success: false, error: "not revisable" });
  const audit = obj.audit || [];
  const now = millingNow_();
  const sets = {
    project: p.project, workOrder: p.workOrder, site: p.site, block: p.block, street: p.street,
    depth: p.depth, itemCode: p.itemCode, area: p.area, machines: p.machines, requestedDate: p.requestedDate,
    priority: p.priority, engNotes: p.notes, status: MILL.review,
  };
  audit.push({ action: "revised", by: p.engineerName || obj.engineer, role: "engineer", ts: now });
  sets.audit = JSON.stringify(audit);
  Object.keys(sets).forEach(function (k) {
    if (sets[k] === undefined) return;
    const col = found.headers.indexOf(MCOL[k]) + 1;
    if (col > 0) found.sheet.getRange(found.rowIndex, col).setValue(sets[k]);
  });
  SpreadsheetApp.flush();
  return jsonResponse({ success: true });
}

// ═══════════════════════════════════════════════════════════════════
// MATERIALS RECEIPT MODULE — backend (separable)
// Simple one-and-done record: receiver submits, we save the receipt photo to
// Drive and append a row. No approval workflow. All ASCII; Arabic via MATCOL.
// ═══════════════════════════════════════════════════════════════════
// Run once in the Apps Script editor to create the Materials Log tab.
function setupMaterialsSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName(MATERIALS_SHEET);
  if (!sh) sh = ss.insertSheet(MATERIALS_SHEET);
  const range = sh.getRange(1, 1, 1, MATERIALS_HEADERS.length);
  range.setValues([MATERIALS_HEADERS]);
  range.setFontWeight("bold").setBackground("#1a1a2e").setFontColor("#00A651").setFontSize(10);
  sh.setFrozenRows(1);
  sh.setColumnWidths(1, MATERIALS_HEADERS.length, 150);
  SpreadsheetApp.flush();
  Logger.log("Materials Log sheet ready - " + MATERIALS_HEADERS.length + " cols.");
}

function materialsSheet_() { return SpreadsheetApp.openById(SHEET_ID).getSheetByName(MATERIALS_SHEET); }

// Drive folder for receipt photos (created on first use, like reportFolder_).
function materialFolder_() {
  const it = DriveApp.getFoldersByName(MATERIAL_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(MATERIAL_FOLDER);
}

// Decode a base64 image data-URL, save it to Drive, return a shareable URL.
function materialSavePhoto_(dataUrl, receiptId) {
  if (!dataUrl) return "";
  const m = String(dataUrl).match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
  if (!m) return "";
  const ext = (m[1].split("/")[1] || "jpg").toLowerCase();
  const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], receiptId + "." + ext);
  const file = materialFolder_().createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  return file.getUrl();
}

function materialsRowToObj_(headers, row) {
  const o = {};
  Object.keys(MATCOL).forEach(function (k) { o[k] = row[headers.indexOf(MATCOL[k])]; });
  o.timestamp = isoOrRaw(o.timestamp);
  return o;
}
function materialsAllObjs_() {
  const sh = materialsSheet_(); if (!sh) return [];
  const data = sh.getDataRange().getValues(); if (data.length < 2) return [];
  const h = data[0];
  return data.slice(1).filter(function (r) { return r[0]; }).map(function (r) { return materialsRowToObj_(h, r); });
}
function materialsFindRow_(receiptId) {
  const sh = materialsSheet_(); if (!sh) return null;
  const data = sh.getDataRange().getValues();
  const idx = data[0].indexOf(MATCOL.receiptId);
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idx]) === String(receiptId)) return true;
  }
  return null;
}
function materialsObjToRow_(o) {
  return MATERIALS_HEADERS.map(function (hdr) {
    for (var k in MATCOL) { if (MATCOL[k] === hdr) return (o[k] != null ? o[k] : ""); }
    return "";
  });
}

// ── GET routing ──
function materialsDoGet_(e) {
  const p = e.parameter;
  if (p.materialsByReceiver) {
    const name = String(p.materialsByReceiver);
    return jsonResponse({ receipts: materialsAllObjs_().filter(function (x) { return String(x.receiver) === name; }) });
  }
  if (p.materialsAll) {
    return jsonResponse({ receipts: materialsAllObjs_() });
  }
  return null;
}

// ── POST routing ──
function materialsDoPost_(p) {
  if (p.type === "submitMaterialReceipt") return materialsSubmit_(p);
  return null;
}

function materialsSubmit_(p) {
  const sh = materialsSheet_();
  if (!sh) return jsonResponse({ success: false, error: "Materials sheet missing - run setupMaterialsSheet()" });
  if (materialsFindRow_(p.receiptId)) return jsonResponse({ success: false, duplicate: true });
  const photoUrl = materialSavePhoto_(p.photoData, p.receiptId);
  const o = {
    receiptId: p.receiptId, timestamp: new Date(), receiver: p.receiverName || "",
    project: p.project || "", site: p.site || "", workOrder: p.workOrder || "", block: p.block || "", street: p.street || "",
    category: p.category || "", material: p.material || "", quantity: p.quantity || "",
    unit: p.unit || "", rate: p.rate || "", amount: p.amount || "",
    supplier: p.supplier || "", subcontractor: p.subcontractor || "",
    photoUrl: photoUrl, remarks: p.remarks || "",
  };
  sh.appendRow(materialsObjToRow_(o));
  SpreadsheetApp.flush();
  return jsonResponse({ success: true, receiptId: p.receiptId });
}

// ═══════════════════════════════════════════════════════════════════
// STAFF-EDITABLE REFERENCE DATA (one Google Sheet FILE per unit)
// ═══════════════════════════════════════════════════════════════════
// The web app fetches these at load (?ref=1) and rebuilds/overlays its config.
// Each unit is a separate spreadsheet (own sharing). File IDs live in SCRIPT
// PROPERTIES so re-pasting Code.gs NEVER wipes them — set them once with
// setRefIds() below. Column ORDER matters (rows read by position).
//   1) fill setRefIds() with your file IDs and Run it once
//   2) run setupReferenceFiles() to create each file's tabs
const REF_SOURCES = [
  { unit: "plant",     prop: "REF_PLANT_ID" },   // Settings + Clients + Client Projects + plant lists
  { unit: "materials", prop: "REF_MATERIALS_ID" },
  { unit: "milling",   prop: "REF_MILLING_ID" },
  { unit: "project",   prop: "REF_HAWALLI_ID",  project: "كوبري — صيانة حولي" },
  { unit: "project",   prop: "REF_HIGHWAYS_ID", project: "كوبري — الطرق السريعة" },
];
// Accept a bare spreadsheet ID or a full Sheet URL.
function refId_(v) { var m = String(v || "").match(/\/d\/([a-zA-Z0-9_-]+)/); return m ? m[1] : String(v || "").trim(); }
// Resolve a source's spreadsheet ID (inline id wins, else its Script Property).
function refSourceId_(src) {
  if (src.id) return refId_(src.id);
  var v = src.prop ? PropertiesService.getScriptProperties().getProperty(src.prop) : "";
  return v ? refId_(v) : "";
}
// Set your file IDs ONCE: fill these in and Run this function. Saved to Script
// Properties, which survives Code.gs pastes. Blank values are skipped (so a fresh
// paste with these blank won't erase what you saved). IDs may be a URL or bare id.
function setRefIds() {
  var ids = {
    REF_PLANT_ID:     "",
    REF_HAWALLI_ID:   "",
    REF_HIGHWAYS_ID:  "",
    REF_MATERIALS_ID: "",
    REF_MILLING_ID:   "",
  };
  var props = PropertiesService.getScriptProperties(), saved = [];
  Object.keys(ids).forEach(function (k) { if (ids[k]) { props.setProperty(k, refId_(ids[k])); saved.push(k); } });
  Logger.log("Saved: " + (saved.join(", ") || "(nothing — all blank)"));
}

// Header rows (bilingual). Keep in sync with the key arrays used when reading.
const RH_KV        = ["المفتاح  /  Key", "القيمة  /  Value"];
const RH_CLIENTS   = ["الشركة المستلمة  /  Company", "كوبري؟ (نعم/لا)  /  isCopri"];
const RH_CLIENTPRJ = ["الشركة  /  Company", "المشروع  /  Project", "رقم العقد  /  Contract",
                      "نوع الموقع (block_street/km_range)  /  LocationType", "شوارع مسماة؟ (نعم/لا)  /  AllowNamedStreet"];
const RH_CLERKS    = ["الاسم  /  Name", "الرمز السري  /  PIN"];
const RH_DRIVERS   = ["اسم السائق  /  Driver", "الهاتف  /  Phone", "رقم اللوحة  /  Plate",
                      "الشركة/المقاول  /  Company", "كوبري؟ (نعم/لا)  /  Copri"];
const RH_ONE_MIX   = ["نوع الخلطة  /  Mix Type"];
const RH_ONE_PLANT = ["رقم المصنع  /  Plant"];
const RH_ONE_TRANS = ["الناقل  /  Transporter"];
const RH_ONE_REJ   = ["سبب الرفض  /  Rejection Reason"];
const RH_STAFF     = ["الاسم  /  Name", "الرمز السري  /  PIN", "الهاتف  /  Phone",
                      "المهمة (asphalt/civil/both)  /  Function", "قشط؟ (نعم/لا)  /  Milling"];
const RH_ONE_SITE  = ["الموقع  /  Site"];
const RH_STREETS   = ["الموقع  /  Site", "اسم الشارع  /  Street"];
const RH_WO        = ["الموقع  /  Site", "القطعة  /  Block", "الشارع  /  Street", "التخصص  /  Discipline",
                      "رقم أمر العمل  /  WO#", "الحالة (جاري=active)  /  Status", "الوصف  /  Description"];
const RH_ONE_SUP   = ["المورد  /  Supplier"];
const RH_ONE_SUB   = ["المقاول من الباطن  /  Subcontractor"];
const RH_CAT       = ["الفئة  /  Category", "المادة  /  Item", "الوحدة  /  Unit"];
const RH_MGR       = ["الاسم  /  Name", "الرمز السري  /  PIN", "الدور (pm/marco)  /  Role", "المشاريع  /  Projects"];
const RH_MACH      = ["الرمز  /  ID", "الاسم  /  Name", "العرض  /  Width"];
const RH_ONE_PRIO  = ["الأولوية  /  Priority"];

// Which tabs each unit file has: [tabName, headerRow].
const REF_SPEC = {
  plant: [
    ["Settings", RH_KV], ["Clients", RH_CLIENTS], ["Client Projects", RH_CLIENTPRJ],
    ["Clerks", RH_CLERKS], ["Drivers", RH_DRIVERS], ["Mix Types", RH_ONE_MIX],
    ["Plants", RH_ONE_PLANT], ["Transporters", RH_ONE_TRANS], ["Rejection Reasons", RH_ONE_REJ],
  ],
  project: [
    ["Project Info", RH_KV], ["Staff", RH_STAFF], ["Sites", RH_ONE_SITE],
    ["Streets", RH_STREETS], ["Work Orders", RH_WO],
  ],
  materials: [
    ["Suppliers", RH_ONE_SUP], ["Subcontractors", RH_ONE_SUB], ["Catalog", RH_CAT],
  ],
  milling: [
    ["Managers", RH_MGR], ["Machines", RH_MACH], ["Priorities", RH_ONE_PRIO],
  ],
};

// Run once in the Apps Script editor: creates each configured file's tabs.
function setupReferenceFiles() {
  REF_SOURCES.forEach(function (src) {
    var id = refSourceId_(src);
    if (!id) { Logger.log("skip " + src.unit + " (no id set)"); return; }
    var ss;
    try { ss = SpreadsheetApp.openById(id); } catch (e) { Logger.log("cannot open " + src.unit + ": " + e); return; }
    (REF_SPEC[src.unit] || []).forEach(function (spec) {
      var sh = ss.getSheetByName(spec[0]) || ss.insertSheet(spec[0]);
      var r = sh.getRange(1, 1, 1, spec[1].length);
      r.setValues([spec[1]]);
      r.setFontWeight("bold").setBackground("#1a1a2e").setFontColor("#00A651").setFontSize(10);
      sh.setFrozenRows(1); sh.setColumnWidths(1, spec[1].length, 190);
    });
    Logger.log("Reference tabs ready in the " + src.unit + " file" + (src.project ? " (" + src.project + ")" : ""));
  });
}

// ── Read helpers ──
function refRows_(ss, name, keys) {
  var sh = ss.getSheetByName(name); if (!sh) return [];
  var data = sh.getDataRange().getValues(); var out = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i], blank = true;
    for (var j = 0; j < keys.length; j++) { if (row[j] !== "" && row[j] != null) { blank = false; break; } }
    if (blank) continue;
    var o = {};
    for (var k = 0; k < keys.length; k++) { o[keys[k]] = (row[k] == null) ? "" : String(row[k]).trim(); }
    out.push(o);
  }
  return out;
}
function refCol_(ss, name) { return refRows_(ss, name, ["value"]).map(function (r) { return r.value; }).filter(function (x) { return x; }); }
function refKV_(ss, name) { var o = {}; refRows_(ss, name, ["key", "value"]).forEach(function (r) { if (r.key) o[r.key] = r.value; }); return o; }

// Aggregate every configured file into one payload for the app.
function readReference_() {
  var a = {
    version: "", settings: {}, clients: [], clientProjects: [], clerks: [], drivers: [],
    mixTypes: [], plants: [], transporters: [], rejectionReasons: [],
    projectInfo: [], staff: [], sites: [], streets: [], workOrders: [],
    suppliers: [], subcontractors: [], catalog: [], managers: [], machines: [], priorities: [],
  };
  REF_SOURCES.forEach(function (src) {
    var id = refSourceId_(src);
    if (!id) return;
    var ss; try { ss = SpreadsheetApp.openById(id); } catch (e) { return; }
    if (src.unit === "plant") {
      a.settings = refKV_(ss, "Settings"); a.version = a.settings.dataVersion || a.version;
      a.clients = refRows_(ss, "Clients", ["company", "isCopri"]);
      a.clientProjects = refRows_(ss, "Client Projects", ["company", "project", "contract", "locationType", "allowNamedStreet"]);
      a.clerks = refRows_(ss, "Clerks", ["name", "pin"]);
      a.drivers = refRows_(ss, "Drivers", ["name", "phone", "plate", "company", "copri"]);
      a.mixTypes = refCol_(ss, "Mix Types"); a.plants = refCol_(ss, "Plants");
      a.transporters = refCol_(ss, "Transporters"); a.rejectionReasons = refCol_(ss, "Rejection Reasons");
    } else if (src.unit === "project") {
      var info = refKV_(ss, "Project Info");
      a.projectInfo.push({ project: src.project, company: info.Company || "", contract: info.Contract || "",
        locationType: info.LocationType || "", allowNamedStreet: info.AllowNamedStreet || "" });
      refRows_(ss, "Staff", ["name", "pin", "phone", "function", "milling"]).forEach(function (r) { r.project = src.project; a.staff.push(r); });
      refRows_(ss, "Sites", ["site"]).forEach(function (r) { a.sites.push({ project: src.project, site: r.site }); });
      refRows_(ss, "Streets", ["site", "street"]).forEach(function (r) { a.streets.push({ project: src.project, site: r.site, street: r.street }); });
      refRows_(ss, "Work Orders", ["site", "block", "street", "discipline", "wo", "status", "description"]).forEach(function (r) { r.project = src.project; a.workOrders.push(r); });
    } else if (src.unit === "materials") {
      a.suppliers = refRows_(ss, "Suppliers", ["supplier"]).map(function (r) { return r.supplier; }).filter(Boolean);
      a.subcontractors = refRows_(ss, "Subcontractors", ["subcontractor"]).map(function (r) { return r.subcontractor; }).filter(Boolean);
      a.catalog = refRows_(ss, "Catalog", ["category", "item", "unit"]);
    } else if (src.unit === "milling") {
      a.managers = refRows_(ss, "Managers", ["name", "pin", "role", "projects"]);
      a.machines = refRows_(ss, "Machines", ["id", "name", "width"]);
      a.priorities = refCol_(ss, "Priorities");
    }
  });
  return a;
}

// Cheap change-detection token: the newest Drive modification time across all
// ref files. Changes the instant anyone edits a ref file, and getLastUpdated()
// is far cheaper than openById()+read, so the client can poll it. Cached 20s so
// concurrent users stay quota-safe. This is the string the client compares.
function readRefVersion_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get("copri_ref_ver");
  if (hit) return hit;
  var maxT = 0;
  try {
    REF_SOURCES.forEach(function (src) {
      var id = refSourceId_(src);
      if (!id) return;
      var t = DriveApp.getFileById(id).getLastUpdated().getTime();
      if (t > maxT) maxT = t;
    });
  } catch (e) {}
  var ver = String(maxT);
  try { cache.put("copri_ref_ver", ver, 20); } catch (e) {}
  return ver;
}

// Cached reference JSON. Reading the per-unit files takes ~15s, so cache the
// built JSON (ScriptCache, 2 min) — normal loads are then instant. The refresh
// button passes nocache=1 to force a fresh rebuild (staff see edits immediately).
function readReferenceCached_(nocache) {
  var cache = CacheService.getScriptCache();
  if (!nocache) { var hit = cache.get("copri_ref"); if (hit) return hit; }
  var json = JSON.stringify(readReference_());
  try { if (json.length < 100000) cache.put("copri_ref", json, 120); } catch (e) {}
  return json;
}

// ═══════════════════════════════════════════════════════════════════
// DATA HYGIENE & LOOKER LAYER
// ═══════════════════════════════════════════════════════════════════
// Raw logs (Dispatch/Receipt) stay append-only and UNTOUCHED. This adds a
// non-destructive derived layer for cleanup + dashboards:
//   • backupRegister()      — timestamped full copy (run before anything).
//   • listTabs()            — log every tab + row/col counts.
//   • setupReferenceTab()   — a "Reference" tab with the canonical street map
//                             (single source of truth; edit it freely).
//   • rebuildAsphaltClean() — a derived "Asphalt — Clean" tab: one normalized
//                             row per dispatch (joined to its receipt) → Looker.
// ═══════════════════════════════════════════════════════════════════
const REFERENCE_SHEET = "Reference";
const CLEAN_SHEET     = "Asphalt — Clean";
const TEMP_DROP_WARN  = 30;    // °C — flag if arrival temp drops more than this
const WEIGHT_SHORT    = 0.5;   // tons — flag if received is short by more than this

// Default street canonicalization (raw spelling -> approved name), seeded from
// the live data. The Reference tab overrides this once created.
const STREET_CANON = {
  "خالد بن عبد العزيز":     "خالد بن عبد العزيز",
  "خالد بن عبدالعزيز":       "خالد بن عبد العزيز",
  "شارع خالد بن عبد العزيز": "خالد بن عبد العزيز",
  "شارع خالد بن عبدالعزيز":  "خالد بن عبد العزيز",
  "شارع خالد عبدالعزيز":     "خالد بن عبد العزيز",
  "شارع عبدالعزيز الخالد":   "خالد بن عبد العزيز",
  "شارع عبدالله دشت":       "عبدالله دشت",
};

function backupRegister() {
  const file = DriveApp.getFileById(SHEET_ID);
  const name = file.getName() + " — backup " + Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH-mm");
  const copy = file.makeCopy(name);
  Logger.log("Backup created: " + name + "\n" + copy.getUrl());
  return copy.getUrl();
}

// ═══════════════════════════════════════════════════════════════════
// DISPATCH CLEANUP — read-only audit (writes a report tab, changes NO data)
// ═══════════════════════════════════════════════════════════════════
// Run backupRegister() first, then auditCleanup(). It scans Dispatch Log and
// writes a "Cleanup Audit" tab enumerating every affected row so the fixes can
// be reviewed before applyCleanup() touches anything.
const CLEAN_AUDIT_SHEET = "Cleanup Audit";
const AUDIT_MAX_WEIGHT  = 50;   // tons — flag a dispatch weight above this

function auditCleanup() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(DISPATCH_SHEET);
  var data = sheet.getDataRange().getValues();
  var h = data[0];
  var iNote = h.indexOf(COL.note), iTs = h.indexOf(COL.ts), iDrv = h.indexOf(COL.driver),
      iTruck = h.indexOf(COL.truck), iWt = h.indexOf(COL.weight), iSite = h.indexOf(COL.site),
      iBlock = h.indexOf(COL.block), iStreet = h.indexOf(COL.street), iStatus = h.indexOf(COL.status),
      iComp = h.indexOf(COL.company), iLoad = h.indexOf(COL.loadNumber), iWO = h.indexOf(COL.workOrder);

  function s(x) { return (x == null) ? "" : String(x); }
  var out = [["Section", "SheetRow", "Note", "Date", "Driver", "Truck", "Weight",
              "Site", "Block", "Street", "Status", "Company", "Load", "Detail"]];
  function rowVals(i, section, detail) {
    var r = data[i];
    return [section, i + 1, s(r[iNote]), s(r[iTs]), s(r[iDrv]), s(r[iTruck]), s(r[iWt]),
            s(r[iSite]), s(r[iBlock]), s(r[iStreet]), s(r[iStatus]), s(r[iComp]), s(r[iLoad]), detail || ""];
  }

  // Index notes -> row indices
  var noteRows = {};
  for (var i = 1; i < data.length; i++) {
    if (!data[i][iNote] && data[i][iNote] !== 0) continue;
    var n = s(data[i][iNote]).trim();
    (noteRows[n] = noteRows[n] || []).push(i);
  }

  // A) exact-duplicate notes + "00"-suffix pairs
  var seenPair = {};
  for (var n in noteRows) {
    if (noteRows[n].length > 1) {
      noteRows[n].forEach(function (i) { out.push(rowVals(i, "DUP_EXACT", "note " + n + " x" + noteRows[n].length)); });
    }
    if (n.length > 2 && n.slice(-2) === "00") {
      var base = n.slice(0, -2);
      if (noteRows[base]) {
        var pid = base + "/" + n;
        if (!seenPair[pid]) {
          seenPair[pid] = 1;
          noteRows[base].forEach(function (i) { out.push(rowVals(i, "DUP_SUFFIX", "pair " + pid + " — BASE")); });
          noteRows[n].forEach(function (i) { out.push(rowVals(i, "DUP_SUFFIX", "pair " + pid + " — 00-suffix")); });
        }
      }
    }
  }

  // B) weights out of (0, MAX]
  for (var i = 1; i < data.length; i++) {
    if (!data[i][iNote]) continue;
    var w = parseFloat(s(data[i][iWt]).replace(",", "."));
    if (!isFinite(w) || w <= 0 || w > AUDIT_MAX_WEIGHT) out.push(rowVals(i, "WEIGHT", "weight=" + s(data[i][iWt])));
  }

  // C) non-Copri deliveries stuck in transit — count only (rule-based fix; the
  // full 190-row list would truncate the tallies below).
  var ncCount = 0;
  for (var i = 1; i < data.length; i++) {
    if (!data[i][iNote]) continue;
    if (s(data[i][iComp]).trim() !== COPRI_COMPANY && s(data[i][iStatus]).trim() === STATUS_TRANSIT) ncCount++;
  }

  // D) truck numbers that are not plain English integers — count + a sample.
  var truckBad = 0;
  for (var i = 1; i < data.length; i++) {
    if (!data[i][iNote]) continue;
    var t = s(data[i][iTruck]).trim();
    if (t && (/[\u0660-\u0669]/.test(t) || /\./.test(t) || !/^\d+$/.test(t))) {
      truckBad++;
      if (truckBad <= 12) out.push(rowVals(i, "TRUCK", "truck=" + t));
    }
  }

  // E) WO backfill candidates (still "*")
  var woStar = 0;
  for (var i = 1; i < data.length; i++) { if (data[i][iNote] && s(data[i][iWO]).trim() === "*") woStar++; }

  // F) site & street spelling tallies (spot variants)
  var siteT = {}, streetT = {};
  for (var i = 1; i < data.length; i++) {
    if (!data[i][iNote]) continue;
    var si = s(data[i][iSite]).trim(); if (si) siteT[si] = (siteT[si] || 0) + 1;
    var st = s(data[i][iStreet]).trim(); if (st) streetT[st] = (streetT[st] || 0) + 1;
  }
  Object.keys(siteT).sort().forEach(function (k) {
    out.push(["SITE_TALLY", "", "", "", "", "", "", k, "", "", "", "", "", "count=" + siteT[k]]);
  });
  Object.keys(streetT).sort().forEach(function (k) {
    out.push(["STREET_TALLY", "", "", "", "", "", "", "", "", k, "", "", "", "count=" + streetT[k]]);
  });

  // Tab inventory — so the non-raw tabs to delete can be picked safely.
  ss.getSheets().forEach(function (t) {
    out.push(["TABS", "", "", "", "", "", "", "", "", "", "", "", Math.max(t.getLastRow() - 1, 0),
      "tab='" + t.getName() + "'  cols=" + t.getLastColumn()]);
  });

  // Summary line at the top
  out.splice(1, 0, ["SUMMARY", "", "", "", "", "", "", "", "", "", "", "", "",
    "dispatchRows=" + (data.length - 1) + "  nonCopriTransit=" + ncCount + "  woStar=" + woStar + "  trucksBad=" + truckBad]);

  // In-DB tab (for the user to eyeball).
  var sh = ss.getSheetByName(CLEAN_AUDIT_SHEET);
  if (sh) ss.deleteSheet(sh);
  sh = ss.insertSheet(CLEAN_AUDIT_SHEET);
  sh.getRange(1, 1, out.length, out[0].length).setValues(out);
  sh.setFrozenRows(1);

  // Standalone copy, shared with REPORT_EMAIL — small enough to read externally
  // (the in-DB tab is unreachable once the workbook is large).
  var auditSS = SpreadsheetApp.create("Copri Cleanup Audit " + Utilities.formatDate(new Date(), TZ, "MM-dd HH-mm"));
  var ash = auditSS.getSheets()[0];
  ash.getRange(1, 1, out.length, out[0].length).setValues(out);
  ash.setFrozenRows(1);
  try { if (REPORT_EMAIL) auditSS.addViewer(REPORT_EMAIL); } catch (e) {}
  Logger.log("Audit done — " + (out.length - 1) + " rows. No data changed.\nStandalone: " + auditSS.getUrl() + "\nid=" + auditSS.getId());
  return auditSS.getId();
}

// ═══════════════════════════════════════════════════════════════════
// DISPATCH CLEANUP — apply the fixes. Run backupRegister() first, then
// applyCleanup() with DRY_RUN=true, review the plan file, then set
// DRY_RUN=false and run again to write. deleteDerivedTabs() is separate.
// ═══════════════════════════════════════════════════════════════════
// Canonical maps (variant -> canonical), one pair per line (Arabic isolated).
const SITE_CANON = {
  "الجا بريه": "الجابريه",
  "منطقه الدسمه": "الدسمه",
  "منطقه السالميه": "السالميه",
  "السالميه متفرقات": "السالميه",
  "قصربيان": "قصر بيان",
  "جابر الاحمد +الصلبيخات": "جابر الاحمد",
  "جابر الاحمد + الصليبخات": "جابر الاحمد",
  "شركه مبارك العنزي منطقه السره": "السره",
};
// Named-street canon, applied AFTER a leading STREET_PREFIX ("شارع ") is stripped.
const NAMED_STREET_CANON = {
  "خالد بن عبد العزيز": "خالد بن عبدالعزيز",
  "خالد عبدالعزيز": "خالد بن عبدالعزيز",
  "قصربيان": "قصر بيان",
  "المثني": "المثنى",
};
const STREET_PREFIX = "شارع ";      // stripped from the start of named streets
const WEIGHT_FIX_NOTE = "126043";   // yesterday's typo 33163 -> 33
// Raw tabs to KEEP; deleteDerivedTabs() removes everything else.
const RAW_TABS_KEEP = ["Dispatch Log", "Receipt Log", "Materials Log", "Milling Programs",
  "حولي — Hawalli", "طرق سريعة — Expressway"];

function cln_(x) { return String(x == null ? "" : x).trim().replace(/\s+/g, " "); }
function cleanTruck_(t) {
  var s = String(t == null ? "" : t);
  // Arabic-Indic digits U+0660..U+0669 -> ASCII (escapes only — never paste Arabic mid-expression).
  s = s.replace(/[\u0660-\u0669]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); });
  s = s.replace(/[^0-9]/g, "").replace(/^0+/, "");
  return s;
}
function writePlanFile_(title, rows) {
  var f = SpreadsheetApp.create(title + " " + Utilities.formatDate(new Date(), TZ, "MM-dd HH-mm"));
  var sh = f.getSheets()[0];
  sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sh.setFrozenRows(1);
  try { if (REPORT_EMAIL) f.addViewer(REPORT_EMAIL); } catch (e) {}
  return f.getId();
}
// Asphalt/both work-order lookup from the reference files (site+block / site+street).
function buildWoResolver_() {
  var byBlock = {}, byStreet = {}, n = 0;
  try {
    var ref = readReference_();
    ((ref && ref.workOrders) || []).forEach(function (w) {
      if (!w.wo) return;
      var disc = String(w.discipline || "").toLowerCase();
      if (disc && !/both|asphalt/.test(disc)) return;
      var site = cln_(w.site);
      if (w.block)  { byBlock[site + "|" + cln_(w.block)]   = String(w.wo); n++; }
      if (w.street) { byStreet[site + "|" + cln_(w.street)] = String(w.wo); n++; }
    });
  } catch (e) {}
  return { byBlock: byBlock, byStreet: byStreet, count: n };
}

function applyCleanup() {
  var DRY_RUN = true;   // ← set to false to actually write changes

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(DISPATCH_SHEET);
  var data = sheet.getDataRange().getValues(), nR = data.length, h = data[0];
  var iNote = h.indexOf(COL.note), iTruck = h.indexOf(COL.truck), iWt = h.indexOf(COL.weight),
      iSite = h.indexOf(COL.site), iBlock = h.indexOf(COL.block), iLoc = h.indexOf(COL.locType),
      iStatus = h.indexOf(COL.status), iComp = h.indexOf(COL.company), iWO = h.indexOf(COL.workOrder);

  var wo = buildWoResolver_();
  var log = [["Change", "SheetRow", "Note", "Field", "Old", "New"]];
  var c = { truck: 0, weight: 0, status: 0, site: 0, street: 0, woFill: 0, woMiss: 0, del: 0, renum: 0 };
  var unmapped = {};
  var DEL_BASES = { "125889": "12588900", "125983": "12598300", "126116": "12611600" };

  // Column snapshots we may rewrite.
  var cTruck = [], cWt = [], cSite = [], cBlock = [], cStatus = [], cWO = [], cNote = [];
  for (var i = 0; i < nR; i++) {
    cTruck.push([data[i][iTruck]]); cWt.push([data[i][iWt]]); cSite.push([data[i][iSite]]);
    cBlock.push([data[i][iBlock]]); cStatus.push([data[i][iStatus]]); cWO.push([data[i][iWO]]); cNote.push([data[i][iNote]]);
  }
  var delRows = [];

  for (var i = 1; i < nR; i++) {
    var r = data[i]; if (!r[iNote] && r[iNote] !== 0) continue;
    var note = cln_(r[iNote]), row = i + 1;

    var t0 = String(r[iTruck] == null ? "" : r[iTruck]), t1 = cleanTruck_(t0);
    if (t1 && t1 !== t0) { cTruck[i][0] = t1; c.truck++; log.push(["TRUCK", row, note, "Truck", t0, t1]); }

    if (note === WEIGHT_FIX_NOTE && String(r[iWt]) !== "33") { cWt[i][0] = 33; c.weight++; log.push(["WEIGHT", row, note, "Weight", String(r[iWt]), "33"]); }

    if (cln_(r[iComp]) !== COPRI_COMPANY && cln_(r[iStatus]) === STATUS_TRANSIT) {
      cStatus[i][0] = STATUS_NA; c.status++; log.push(["STATUS", row, note, "Status", STATUS_TRANSIT, STATUS_NA]);
    }

    var siteV = cln_(r[iSite]);
    if (SITE_CANON[siteV]) { cSite[i][0] = SITE_CANON[siteV]; c.site++; log.push(["SITE", row, note, "Site", siteV, SITE_CANON[siteV]]); }
    var siteKey = SITE_CANON[siteV] || siteV;

    var isNamed = cln_(r[iLoc]) === LABEL.named, blockV = cln_(r[iBlock]), nameKey = "";
    if (isNamed) {
      var st = blockV;
      if (st.indexOf(STREET_PREFIX) === 0) st = cln_(st.slice(STREET_PREFIX.length));   // drop "شارع "
      if (NAMED_STREET_CANON[st]) st = NAMED_STREET_CANON[st];
      nameKey = st;
      if (st !== blockV) { cBlock[i][0] = st; c.street++; log.push(["STREET", row, note, "Street", blockV, st]); }
      else if (blockV && !/^\d+$/.test(blockV)) unmapped[blockV] = (unmapped[blockV] || 0) + 1;
    }

    if (cln_(r[iComp]) === COPRI_COMPANY && cln_(r[iWO]) === "*") {
      var hit = isNamed ? (wo.byStreet[siteKey + "|" + cln_(nameKey)] || wo.byBlock[siteKey + "|" + cln_(nameKey)])
                        : wo.byBlock[siteKey + "|" + blockV];
      if (hit) { cWO[i][0] = hit; c.woFill++; log.push(["WO", row, note, "WorkOrder", "*", hit]); }
      else c.woMiss++;
    }

    if (DEL_BASES[note]) { delRows.push(row); c.del++; log.push(["DELETE", row, note, "(dup base)", "", "row removed"]); }
    for (var b in DEL_BASES) if (note === DEL_BASES[b]) { cNote[i][0] = Number(b); c.renum++; log.push(["RENUM", row, note, "Note", note, b]); }
  }

  Object.keys(unmapped).sort().forEach(function (k) { log.push(["UNMAPPED_STREET", "", "", "Street(name)", k, "count=" + unmapped[k]]); });
  var summary = "truck=" + c.truck + " weight=" + c.weight + " status=" + c.status + " site=" + c.site +
    " street=" + c.street + " woFill=" + c.woFill + " woMiss=" + c.woMiss + " del=" + c.del + " renum=" + c.renum +
    " | woRefKeys=" + wo.count + " | DRY_RUN=" + DRY_RUN;
  log.splice(1, 0, ["SUMMARY", "", "", "", "", summary]);

  if (DRY_RUN) {
    var planId = writePlanFile_("Copri Cleanup Plan", log);
    Logger.log("DRY RUN — nothing written.\n" + summary + "\nplan id=" + planId);
    return planId;
  }

  sheet.getRange(1, iTruck + 1, nR, 1).setValues(cTruck);
  sheet.getRange(1, iWt + 1, nR, 1).setValues(cWt);
  sheet.getRange(1, iSite + 1, nR, 1).setValues(cSite);
  sheet.getRange(1, iBlock + 1, nR, 1).setValues(cBlock);
  sheet.getRange(1, iStatus + 1, nR, 1).setValues(cStatus);
  sheet.getRange(1, iWO + 1, nR, 1).setValues(cWO);
  sheet.getRange(1, iNote + 1, nR, 1).setValues(cNote);
  delRows.sort(function (a, b) { return b - a; }).forEach(function (rn) { sheet.deleteRow(rn); });
  Logger.log("APPLIED.\n" + summary);
}

function deleteDerivedTabs() {
  var DRY_RUN = true;   // ← set to false to actually delete
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var keep = {}; RAW_TABS_KEEP.forEach(function (n) { keep[n] = 1; });
  var plan = [];
  ss.getSheets().forEach(function (s) {
    var nm = s.getName();
    if (!keep[nm]) plan.push(nm + " (" + Math.max(s.getLastRow() - 1, 0) + " rows)");
  });
  if (DRY_RUN) { Logger.log("DRY RUN — would delete " + plan.length + " tabs:\n" + plan.join("\n")); return; }
  ss.getSheets().forEach(function (s) { if (!keep[s.getName()]) ss.deleteSheet(s); });
  Logger.log("Deleted " + plan.length + " derived tabs:\n" + plan.join("\n"));
}

function listTabs() {
  SpreadsheetApp.openById(SHEET_ID).getSheets().forEach(function (s) {
    Logger.log(s.getName() + "  —  " + Math.max(s.getLastRow() - 1, 0) + " rows, " + s.getLastColumn() + " cols");
  });
}

function setupReferenceTab() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(REFERENCE_SHEET) || ss.insertSheet(REFERENCE_SHEET);
  sh.clearContents();
  const rows = [["النص المُدخل (الشارع)", "الاسم المعتمد"]];
  Object.keys(STREET_CANON).forEach(function (k) { rows.push([k, STREET_CANON[k]]); });
  sh.getRange(1, 1, rows.length, 2).setValues(rows);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, 2).setFontWeight("bold").setBackground("#1a1a2e").setFontColor("#00A651");
  sh.autoResizeColumns(1, 2);
  SpreadsheetApp.flush();
  Logger.log("Reference tab ready — " + (rows.length - 1) + " street mappings (edit freely).");
}

// Street map from the Reference tab if present, else the built-in default.
function readStreetMap_() {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(REFERENCE_SHEET);
  if (!sh) return STREET_CANON;
  const data = sh.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < data.length; i++) {
    const k = normSp_(data[i][0]), v = normSp_(data[i][1]);
    if (k && v) map[k] = v;
  }
  return Object.keys(map).length ? map : STREET_CANON;
}
function canonStreet_(map, s) {
  const v = normSp_(s);
  if (!v) return "";
  if (map[v]) return map[v];
  const v2 = v.replace(/^شارع\s+/, "");   // drop a leading "شارع " for consistency
  return map[v2] || v2;
}
function cleanPhone_(p) {
  const d = String(p == null ? "" : p).replace(/[^\d]/g, "");
  if (!d) return "";
  if (d.indexOf("965") === 0 && d.length === 11) return "+965" + d.slice(3);
  if (d.length === 8) return "+965" + d;
  return "+" + d;   // foreign / unexpected — kept, flagged with the leading +
}
function cleanTruck_(v) {
  if (v == null || v === "") return "";
  if (typeof v === "number" && Math.floor(v) === v) return String(v);
  return String(v).trim();
}

// Build the derived "Asphalt — Clean" tab — the Looker source. One normalized
// row per dispatch, joined to its receipt. Non-destructive (raw logs untouched).
function rebuildAsphaltClean() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const d  = ss.getSheetByName(DISPATCH_SHEET).getDataRange().getValues();
  const r  = ss.getSheetByName(RECEIPT_SHEET).getDataRange().getValues();
  const dh = d[0], rh = r[0];
  const smap = readStreetMap_();

  const rN = rh.indexOf(COL.note), rDec = rh.indexOf(COL.decision), rEng = rh.indexOf(COL.engineer),
        rTempArr = rh.indexOf(COL.tempArr), rWArr = rh.indexOf(COL.weightArr), rTs = rh.indexOf(COL.ts);
  const recByNote = {};
  for (let i = 1; i < r.length; i++) {
    const note = String(r[i][rN] || ""); if (!note) continue;
    recByNote[note] = { decision: r[i][rDec] || "", engineer: r[i][rEng] || "",
                        tempArr: r[i][rTempArr], weightArr: r[i][rWArr], ts: r[i][rTs] };
  }
  const ix = {};
  ["ts","note","company","project","contract","site","mix","weight","tempDisp","driver",
   "driverPhone","truck","naqel","plant","loadNumber","status","block","street","locType"]
    .forEach(function (k) { ix[k] = dh.indexOf(COL[k]); });

  const headers = ["يوم العمل","التاريخ","الوقت","الشركة","المشروع","رقم العقد","رقم أمر العمل",
    "الموقع","القطعة","الشارع","نوع الموقع","رقم السند","المصنع","الناقل","السائق","هاتف السائق",
    "رقم الشاحنة","نوع الخلطة","طن مرسل","طن مستلم","فرق الطن","حرارة الإرسال","حرارة الوصول",
    "فرق الحرارة","رقم الحمولة","المهندس","الحالة","القرار","مدة الوصول (دقيقة)","مستلم؟",
    "انحراف حرارة","نقص وزن",
    "مستلم (1/0)","انحراف (1/0)","مرفوض (1/0)","الأسبوع","ساعة الإرسال",
    "كوبري (1/0)","طن مرسل (كوبري)"];
  const out = [headers];

  for (let j = 1; j < d.length; j++) {
    const row = d[j]; const t = row[ix.ts];
    if (!(t instanceof Date)) continue;
    const note = String(row[ix.note] || "");
    const rec  = recByNote[note] || null;
    const lt   = locCode(row[ix.locType]);
    const isKm = lt === "km_range", isNamed = lt === "named";

    const rawStreet = isNamed ? row[ix.block] : row[ix.street];
    const canonSt   = isKm ? normSp_(row[ix.street]) : canonStreet_(smap, rawStreet);
    const blockOut  = isNamed ? "" : normSp_(row[ix.block]);

    let woX;
    if (isNamed)    woX = { site: row[ix.site] || "", block: canonSt, street: "", locationType: "named" };
    else if (isKm)  woX = { site: row[ix.site] || "", block: "", street: "", locationType: "km_range" };
    else            woX = { site: row[ix.site] || "", block: normSp_(row[ix.block]), street: canonSt, locationType: "block_street" };
    const wo = woFor_(woX);

    const tonsD = Number(row[ix.weight]) || 0;
    const tonsR = (rec && Number(rec.weightArr) > 0) ? Number(rec.weightArr) : "";
    const dTons = (tonsR !== "") ? Math.round((tonsR - tonsD) * 100) / 100 : "";
    const tD = Number(row[ix.tempDisp]);
    const tA = (rec && Number(rec.tempArr) > 0) ? Number(rec.tempArr) : "";
    const dTemp = (!isNaN(tD) && tA !== "") ? Math.round((tA - tD) * 10) / 10 : "";
    const transit = (rec && rec.ts instanceof Date) ? Math.round((rec.ts.getTime() - t.getTime()) / 60000) : "";
    const received = (rec && rec.ts instanceof Date) ? "نعم" : "لا";
    const tempDev   = (dTemp !== "" && dTemp <= -TEMP_DROP_WARN);
    const weightDev = (dTons !== "" && dTons <= -WEIGHT_SHORT);
    const recvNum   = (rec && rec.ts instanceof Date) ? 1 : 0;
    const rejNum    = /رفض/.test(rec ? String(rec.decision) : "") ? 1 : 0;
    const week      = Utilities.formatDate(t, TZ, "YYYY-'W'ww");
    const hour      = Number(Utilities.formatDate(t, TZ, "H"));
    const isCopri   = String(row[ix.company] || "").trim() === COPRI_COMPANY;

    out.push([
      workDayKey(t.getTime()),
      Utilities.formatDate(t, TZ, "yyyy-MM-dd"),
      Utilities.formatDate(t, TZ, "HH:mm"),
      row[ix.company] || "", row[ix.project] || "", row[ix.contract] || "", wo,
      row[ix.site] || "", blockOut, canonSt, (LABEL[lt] || lt), note,
      row[ix.plant] || "", row[ix.naqel] || "", row[ix.driver] || "", cleanPhone_(row[ix.driverPhone]),
      cleanTruck_(row[ix.truck]), row[ix.mix] || "", tonsD, tonsR, dTons,
      (isNaN(tD) ? "" : tD), tA, dTemp, row[ix.loadNumber] || "",
      rec ? rec.engineer : "", String(row[ix.status] || ""), rec ? rec.decision : "",
      transit, received,
      tempDev ? "⚠" : "", weightDev ? "⚠" : "",
      recvNum, (tempDev || weightDev) ? 1 : 0, rejNum, week, hour,
      isCopri ? 1 : 0, isCopri ? tonsD : "",
    ]);
  }

  const sh = ss.getSheetByName(CLEAN_SHEET) || ss.insertSheet(CLEAN_SHEET);
  sh.clearContents();
  sh.getRange(1, 1, out.length, headers.length).setValues(out);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#1a1a2e").setFontColor("#00A651").setFontSize(10);
  SpreadsheetApp.flush();
  Logger.log("Asphalt — Clean rebuilt: " + (out.length - 1) + " rows.");
  return out.length - 1;
}
