// Legacy 4-copy A5 delivery-note print template, ported VERBATIM from
// index.html (TEMPLATE_HTML). Do NOT restyle: the printed note is a legal
// paper document calibrated for the plant printer (A5 landscape, kiosk
// mode). print-color-adjust: exact keeps backgrounds on paper when
// Chrome --kiosk-printing auto-confirms with "background graphics" off.
// The QR <canvas> must be REMOVED (not hidden) before makeCopies() clones
// the sheet - a cloned canvas is a blank bitmap; the <img> clones fine.
export const TEMPLATE_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<style>
  /* print-color-adjust forces backgrounds/colors onto paper even when the
     "background graphics" print option is off — required for kiosk-printing,
     which auto-confirms with default settings. */
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @page { size: A5 landscape; margin: 8mm; }
  body { font-family: 'Segoe UI', 'Arial Unicode MS', Arial, sans-serif; font-size: 9pt; color: #000; direction: rtl; background: #fff; }
  .note { width: 100%; border: 2px solid #000; padding: 4px; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 4px; }
  .header-logo { font-size: 13pt; font-weight: 700; color: #00A651; border: 2px solid #00A651; padding: 3px 10px; border-radius: 3px; }
  .header-title { text-align: center; flex: 1; }
  .header-title .main { font-size: 11pt; font-weight: 700; }
  .header-title .sub { font-size: 8pt; color: #333; }
  .header-note-box { text-align: left; border: 2px solid #000; padding: 4px 8px; min-width: 90px; }
  .header-note-box .lbl { font-size: 7pt; color: #555; }
  .header-note-box .num { font-size: 16pt; font-weight: 700; color: #00A651; direction: ltr; }
  .meta-row { display: flex; gap: 4px; margin-bottom: 4px; }
  .field { flex: 1; border: 1px solid #999; padding: 3px 5px; }
  .field .lbl { font-size: 6.5pt; color: #555; font-weight: 600; border-bottom: 1px solid #ddd; margin-bottom: 2px; }
  .field .val { font-size: 9pt; font-weight: 600; min-height: 13px; }
  .field.wide { flex: 2; }
  .field.xwide { flex: 3; }
  .remarks-row { border: 1px solid #999; padding: 3px 5px; margin-bottom: 4px; min-height: 20px; }
  .remarks-row .lbl { font-size: 6.5pt; color: #555; font-weight: 600; }
  .remarks-row .val { font-size: 8.5pt; min-height: 12px; }
  .sig-section { display: flex; gap: 4px; border-top: 1px solid #000; padding-top: 4px; }
  .sig-box { flex: 1; border: 1px solid #999; text-align: center; padding: 3px; min-height: 52px; display: flex; flex-direction: column; justify-content: space-between; }
  .sig-box .sig-lbl { font-size: 7pt; font-weight: 700; background: #1a1a2e; color: #fff; padding: 2px; margin: -3px -3px 4px -3px; }
  .sig-box .sig-name { font-size: 7.5pt; color: #333; margin-bottom: 4px; }
  .sig-box .sig-line { border-bottom: 1px solid #999; margin: 0 6px; height: 18px; }
  .sig-box .sig-stamp { font-size: 7pt; color: #aaa; margin-top: 2px; }
  .note-footer { text-align: center; font-size: 6.5pt; color: #aaa; border-top: 1px solid #ddd; margin-top: 3px; padding-top: 2px; }
  .copy-label { text-align: center; font-size: 9pt; font-weight: 700; border-top: 2px solid #000; margin-top: 3px; padding-top: 3px; letter-spacing: .3px; }
  .sheet { page-break-after: always; }
  .sheet:last-child { page-break-after: auto; }
  @media screen { body { background: #eaeae6; padding: 20px; } .note { max-width: 740px; margin: 0 auto 20px; background: #fff; box-shadow: 0 2px 16px rgba(0,0,0,0.15); padding: 8px; } }
  @media print { body { background: #fff; } }
</style>
</head>
<body>
<div id="sheets">
<div class="sheet">
<div class="note">
  <div class="header">
    <div class="header-logo">كوبري</div>
    <div class="header-title">
      <div class="main">سند تسليم أسفلت</div>
      <div class="sub" id="org-line">شركة كوبري للمشاريع الإنشائية</div>
      <div class="sub" id="contract-display">رقم العقد:</div>
    </div>
    <div class="header-note-box">
      <div class="lbl">رقم السند</div>
      <div class="num" id="note-number"></div>
      <div class="lbl" style="margin-top:3px;border-top:1px solid #ccc;padding-top:3px">رقم الحمولة (هذا الموقع)</div>
      <div class="num" id="load-number" style="font-size:13pt"></div>
    </div>
  </div>
  <div class="meta-row">
    <div class="field"><div class="lbl">التاريخ</div><div class="val" id="date"></div></div>
    <div class="field"><div class="lbl">الوقت</div><div class="val" id="time"></div></div>
    <div class="field"><div class="lbl">أمر العمل</div><div class="val" id="work-order"></div></div>
    <div class="field"><div class="lbl">رقم المصنع</div><div class="val" id="plant"></div></div>
    <div class="field"><div class="lbl">رقم الشاحنة</div><div class="val" id="truck"></div></div>
    <div class="field wide"><div class="lbl">اسم السائق</div><div class="val" id="driver"></div></div>
  </div>
  <div class="meta-row">
    <div class="field wide"><div class="lbl">نوع الخلطة</div><div class="val" id="mix-type"></div></div>
    <div class="field"><div class="lbl">درجة الحرارة عند الإرسال</div><div class="val" id="temp"></div></div>
    <div class="field wide"><div class="lbl">الموقع المستلم</div><div class="val" id="site"></div></div>
    <div class="field"><div class="lbl" id="block-label">القطعة</div><div class="val" id="block"></div></div>
    <div class="field"><div class="lbl" id="street-label">الشارع</div><div class="val" id="street"></div></div>
  </div>
  <div class="meta-row">
    <div class="field wide"><div class="lbl">الوزن عند الإرسال (طن) / Dispatched Weight</div><div class="val" style="font-size:13pt;color:#00A651;font-weight:700" id="net-weight"></div></div>
    <div class="field wide"><div class="lbl">الوزن عند الاستلام (طن) / Received Weight</div><div class="val" style="min-height:20px"></div></div>
    <div class="field"><div class="lbl">درجة الحرارة عند الاستلام</div><div class="val" style="min-height:20px"></div></div>
  </div>
  <div class="remarks-row"><div class="lbl">ملاحظات</div><div class="val" id="remarks"></div></div>
  <div class="sig-section">
    <div class="sig-box"><div class="sig-lbl">كاتب المصنع / Plant Clerk</div><div class="sig-name" id="clerk-name"></div><div class="sig-line"></div><div class="sig-stamp">التوقيع</div></div>
    <div class="sig-box" style="flex:1.5"><div class="sig-lbl">مهندس الموقع / Site Engineer</div><div class="sig-name"></div><div class="sig-line"></div><div class="sig-stamp">التوقيع</div></div>
    <div class="sig-box qr-box" style="flex:1.2;align-items:center;justify-content:center"><div class="sig-lbl">رابط الاستلام / Receipt Link</div><div id="qr-code" style="margin:4px auto"></div><div class="sig-stamp" style="font-size:6pt" id="qr-note-label"></div></div>
    <div class="sig-box"><div class="sig-lbl">ختم المصنع / Plant Stamp</div><div class="sig-name"></div><div class="sig-line"></div><div class="sig-stamp">الختم الرسمي</div></div>
    <div class="sig-box"><div class="sig-lbl">ختم الوزارة / MPW Stamp</div><div class="sig-name"></div><div class="sig-line"></div><div class="sig-stamp">الختم الرسمي</div></div>
  </div>
  <div class="copy-label" id="copy-label"></div>
  <div class="note-footer">كوبري للمشاريع الإنشائية — سند رقم <span id="footer-note"></span> — طُبع من منظومة التتبع الرقمي</div>
</div>
</div>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>
<script>
function generateQR(noteNumber, baseUrl) {
  var receiptUrl = baseUrl + '?note=' + encodeURIComponent(noteNumber);
  document.getElementById('qr-note-label').textContent = 'سند رقم ' + noteNumber;
  var qrDiv = document.getElementById('qr-code');
  qrDiv.innerHTML = '';
  if (typeof QRCode !== 'undefined') {
    new QRCode(qrDiv, { text: receiptUrl, width: 72, height: 72, colorDark: "#1a1a2e", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M });
    // qrcodejs renders both a <canvas> and an <img> of the same code. The
    // canvas must GO (not just hide): cloneNode() copies a canvas as a blank
    // bitmap, so the copies keep only the <img>, which clones fine.
    var _cv = qrDiv.querySelector('canvas');
    if (_cv && qrDiv.querySelector('img')) _cv.parentNode.removeChild(_cv);
  }
}
// Duplicate the filled sheet once per copy label (driver / site engineer /
// plant / head office). Must run AFTER all fields + QR are injected — the
// clones are snapshots, not live.
function makeCopies(labels) {
  var container = document.getElementById('sheets');
  var sheet = container.querySelector('.sheet');
  sheet.querySelector('#copy-label').textContent = labels[0];
  for (var i = 1; i < labels.length; i++) {
    var c = sheet.cloneNode(true);
    c.querySelector('#copy-label').textContent = labels[i];
    container.appendChild(c);
  }
}
<\/script>
</body>
</html>`;
