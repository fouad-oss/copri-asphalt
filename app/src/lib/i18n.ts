import i18n from "i18next"
import { initReactI18next } from "react-i18next"

// ALL strings from the first screen (copri-frontend-SKILL). Arabic is the
// default working language; dir is set once on the root from the saved
// preference — everything else follows via logical properties.
const resources = {
  ar: {
    translation: {
      app: { title: "بوابة كوبري", tagline: "The Art of Construction", logout: "خروج" },
      nav: {
        home: "الرئيسية", approvals: "الاعتمادات", commitments: "الالتزامات",
        deliveries: "التوريدات", masters: "البيانات الرئيسية", reports: "التقارير", admin: "الإدارة",
      },
      login: {
        title: "تسجيل الدخول", email: "البريد الإلكتروني", password: "كلمة المرور",
        signIn: "دخول", pinToggle: "الدخول بالرمز السري (مؤقت)", pin: "الرمز السري",
        pinSignIn: "دخول بالرمز", badCreds: "بريد أو كلمة مرور غير صحيحة",
        badPin: "رمز سري خاطئ", pinRetired: "الدخول بالرمز أُوقف — استخدم البريد وكلمة المرور",
        notEnabled: "الحساب غير مفعّل في البوابة — راجع المسؤول",
        network: "تعذّر الاتصال — حاول مجدداً", required: "أكمل الحقول المطلوبة",
      },
      status: {
        pending: "قيد المراجعة", approved: "معتمد", rejected: "مرفوض", cancelled: "ملغي",
        active: "نشط", closed: "مغلق", waiting: "بانتظار", exception: "استثناء", draft: "مسودة", issued: "صادر",
      },
      queue: {
        oldest: "الأقدم: {{days}} يوم", empty: "لا عناصر بانتظارك — القائمة فارغة",
        batchApprove: "اعتماد الدفعة", willApprove: "سيُعتمد {{ok}} · استثناءات {{ex}}",
        exception: "استثناء", approve: "سيُعتمد", exceptionReason: "سبب الاستثناء",
        unmapped: "غير مرتبط ببند — الربط شرط الاعتماد", mapHint: "اربط ببند أمر شراء…",
        noSuggestions: "لا بنود مقترحة — لا مورد مطابق بأوامر نشطة",
        approvedN: "اعتُمد {{n}}", exceptedN: "استثناءات {{n}}", skippedN: "تخطّى {{n}} غير مرتبط",
        withAccountant: "لدى المحاسب", batchTitle: "دفعة الاعتماد اليومية — اربط ثم اعتمد",
        sitePhoto: "صورة السند", siteNote: "سند موقع", openQty: "متبقٍ {{n}}",
      },
      register: {
        search: "بحث…", empty: "لا سجلات بعد — تُنشأ الالتزامات من الطلبات أو الإدخال اليدوي.",
        number: "الرقم", vendor: "المورد / المقاول", costCenter: "مركز التكلفة",
        value: "القيمة", received: "استلام", invoiced: "فواتير", status: "الحالة",
        origin: { rf: "طلب", manual: "يدوي", import: "مستورد" },
        title: "سجل الالتزامات",
      },
      match: {
        title: "المطابقة الثلاثية", ordered: "أمر", received: "استلام", invoiced: "فواتير",
        uninvoiced: "غير مفوتر", fullyInvoiced: "مفوتر بالكامل",
        overInvoiced: "فواتير تفوق الاستلام بـ {{v}}", pendingN: "{{n}} بانتظار الاعتماد",
        lines: "البنود", grns: "استلامات GRN", siteNotes: "سندات الموقع", invoices: "فواتير المورد",
        lineOrdered: "طلب", lineReceived: "استلم", lineOpen: "متبقٍ", lineDone: "مكتمل",
        pendingSuffix: "بانتظار",
      },
      home: {
        waitingOnYou: "بانتظارك", batch: "دفعة الاعتماد اليومية", queue: "قائمة الاعتماد",
        register: "سجل الالتزامات", match: "المطابقة", welcome: "مرحباً {{name}}",
      },
      common: {
        loading: "جارٍ التحميل…", error: "تعذّر التحميل — تحقق من الاتصال", retry: "إعادة المحاولة",
        save: "حفظ", cancel: "إلغاء", details: "التفاصيل", by: "بواسطة", on: "في",
      },
      stub: {
        title: "تُنقل هذه الشاشة في الموجة القادمة — استخدم البوابة الحالية مؤقتاً",
        hint: "app.copri.com/?rf=1",
      },
      tabs: {
        batch: "الاعتماد اليومي", requests: "قائمة الاعتماد", register: "السجل",
        blankets: "المظلات", subs: "مقاولو الباطن", newRequest: "طلب جديد",
        manualPo: "أمر شراء يدوي", grn: "استلام GRN", exceptions: "الاستثناءات",
        vendors: "الموردون", items: "المواد", ccs: "مراكز التكلفة",
        sync: "التصدير والمزامنة", recharge: "التحميل الداخلي", audit: "سجل التدقيق", gates: "سلاسل الاعتماد",
      },
      req: {
        type: "نوع الطلب", typeWO: "أمر عمل — مقاول (RF-WO)", typeLPO: "أمر شراء — مورد (RF-LPO)",
        typeCON: "عقد (RF-Contract)", cc: "مركز التكلفة الطالب", ccPick: "اختر مركز التكلفة",
        vendor: "المورد / المقاول", vendorPick: "اختر من القائمة الموحدة",
        callOff: "سحب من مظلة (LPO)", callOffNone: "بدون — طلب مستقل",
        callOffHint: "السحب ضمن حدود وصلاحية المظلة يُعتمد تلقائياً",
        blLine: "بند المظلة", blLinePick: "اختر البند", blQty: "الكمية المطلوبة",
        isBlanket: "هذا الطلب مظلة (Blanket LPO) — بنود يُسحب منها لاحقاً",
        blCat: "فئة المظلة", blCatPick: "اختر الفئة", blRateRef: "مرجع السعر",
        validFrom: "سارية من", validTo: "سارية حتى",
        linesTitle: "بنود المظلة — الكمية هي أداة الرقابة والقيمة تُشتق (كمية × سعر)",
        lineItem: "المادة / الخدمة", lineUnit: "الوحدة", lineQty: "الكمية المتفق عليها",
        lineRate: "السعر المتفق (د.ك)", addLine: "+ إضافة بند", removeLine: "حذف",
        linesTotal: "مجموع البنود: {{v}}", desc: "الوصف", descPh: "وصف الأعمال / المواد المطلوبة",
        value: "القيمة التقديرية (د.ك)", send: "إرسال الطلب",
        sentAuto: "اعتماد تلقائي — رقم الالتزام", sentQueue: "أُرسل للاعتماد",
        again: "طلب جديد", remaining: "متبقٍ {{n}} من {{m}}",
        errCeiling: "تجاوز سقف المظلة — المتبقي {{v}}", errLineQty: "تجاوز كمية البند — المتبقي {{n}}",
        errGeneric: "تعذّر إرسال الطلب — راجع البيانات", myRequests: "طلباتي وما آلت إليه",
        gate: "المرحلة الحالية", gateTrail: "مسار الاعتماد", waitingGate: "بانتظار {{label}}",
        ownRequest: "طلبك — لا يمكنك اعتماده (فصل المهام)", approve: "اعتماد", reject: "رفض",
        noteOptional: "ملاحظة (اختياري — مطلوبة عند الرفض)", noteRequired: "اذكر سبب الرفض",
        decidedLog: "قرارات سابقة", otherGates: "في مراحل أخرى", why: "سبب التوجيه",
      },
      po: {
        manualTitle: "تسجيل أمر شراء قائم", manualHint: "باب الإدخال المفتوح — يُقيّد بالاستثناءات بعد اعتماد بوابة الطلبات",
        lines: "بنود الأمر", amount: "المبلغ", note: "ملاحظة", saved: "سُجّل برقم", save: "تسجيل الأمر",
      },
      grn: {
        title: "استلام GRN — على أمر شراء نشط", lpo: "أمر الشراء", lpoPick: "اختر أمر الشراء",
        line: "البند (اختياري)", desc: "وصف المستلَم", qty: "الكمية", unit: "الوحدة",
        amount: "القيمة (د.ك)", invoiceNo: "رقم فاتورة المورد (اختياري)", invoiceDate: "تاريخ الفاتورة",
        nearDup: "فاتورة مشابهة خلال 30 يوماً ({{no}} بتاريخ {{date}}) — تأكيد التسجيل رغم ذلك؟",
        force: "تسجيل رغم التشابه", saved: "سُجّل الاستلام", save: "تسجيل الاستلام", recent: "آخر الاستلامات",
        dupInvoice: "الفاتورة مسجلة مسبقاً لهذا المورد",
      },
      blanket: {
        title: "لوحة المظلات", linesMode: "بنود", ceiling: "السقف", drawn: "مسحوب", left: "متبقي",
        derived: "القيمة المشتقة: مسحوب {{a}} من {{b}}", validity: "سارية {{from}} ← {{to}}",
        rateRef: "مرجع السعر", empty: "لا مظلات نشطة — اعتماد طلب LPO مُعلَّم كمظلة يُنشئ واحدة.",
      },
      subs: {
        title: "سجل عقود الباطن", registerTitle: "تسجيل عقد مقاول باطن", commitment: "الالتزام",
        commitmentPick: "اختر التزام العقد (CON)", commitmentHint: "عقد جديد؟ أنشئ طلب RF-Contract أولاً — لا عقد بلا التزام",
        scope: "النطاق", retention: "نسبة الاحتجاز %", advance: "الدفعة المقدمة (د.ك)",
        docUrl: "رابط مستند العقد (اختياري)", register: "تسجيل العقد",
        contractValue: "العقد", certified: "مصدَّق", certs: "{{n}} شهادة", retentionHeld: "احتجاز محتجز",
        pendingCharges: "مواد معلقة للاسترداد", deductedCharges: "مواد مخصومة", advanceShort: "دفعة مقدمة",
        certsTitle: "شهادات الدفع", chargesTitle: "مواد مسلّمة للمقاول (استرداد)",
        certLine: "شهادة #{{n}}", gross: "إجمالي", ret: "احتجاز", back: "استرداد مواد", net: "الصافي",
        pendingWith: "معلق — لدى المحاسب", deducted: "مخصوم",
        addCharge: "إضافة مواد مسلّمة للمقاول", chargeDesc: "الوصف", chargeAmount: "قيمة الاسترداد",
        recordCert: "تسجيل شهادة دفع", certGross: "إجمالي الشهادة", certPeriod: "الفترة (مثال: 2026-06)",
        deductOn: "خصم مواد معلقة على هذه الشهادة", netPreview: "الصافي: {{g}} − احتجاز {{rp}}% ({{r}}) − مواد ({{c}}) = {{n}}",
        alreadyRegistered: "هذا الالتزام مسجل مسبقاً", empty: "لا عقود مسجلة بعد — يُنشأ العقد باعتماد طلب RF-Contract ثم تسجيل شروطه هنا.",
        doc: "مستند العقد",
      },
      recharge: {
        title: "التحميل الداخلي الشهري", period: "الفترة (شهر)", run: "توليد فواتير الفترة",
        missing: "أسعار ناقصة — أضفها في recharge_rates ثم أعد التوليد:",
        rates: "الأسعار المعتمدة", noRates: "لا توجد أسعار معتمدة بعد — تُضاف في جدول recharge_rates.",
        invoices: "الفواتير الداخلية", issue: "إصدار", issued: "صادر",
      },
      sync: {
        title: "التصدير إلى SpectroNova", create: "إنشاء دفعة تصدير", note: "ملاحظة الدفعة",
        batches: "دفعات التصدير", rows: "{{n}} صف", acked: "{{n}} مُرحّل", downloadCsv: "تنزيل CSV",
        ack: "تم ترحيله", unack: "تراجع", pendingRows: "بانتظار التصدير: {{n}}",
        health: "حالة المزامنة", exported: "مُصدَّر", pending: "معلق", unmatched: "غير مرحّل",
        emptyPending: "لا صفوف بانتظار التصدير.",
      },
      masters: {
        vendors: "الموردون والمقاولون", items: "المواد (القائمة الموحدة)", ccs: "مراكز التكلفة",
        name: "الاسم", kind: "النوع", unit: "الوحدة", category: "الفئة", code: "الرمز",
        kindMap: { supplier: "مورد", subcontractor: "مقاول باطن", internal: "داخلي", other: "أخرى" },
        division: "قسم", project: "مشروع", spectronova: "رمز SpectroNova",
        itemsEmpty: "القائمة الموحدة تُعبّأ من أداة التنقية بعد اعتماد قرارات المحاسب.",
        hint: "التعديل عبر لوحة Supabase حتى مرحلة الصلاحيات",
      },
      admin: {
        audit: "سجل التدقيق", gates: "سلاسل الاعتماد", chain: "السلسلة", gateNo: "المرحلة",
        capability: "الصلاحية", label: "التسمية", auditEmpty: "لا حركات بعد.",
        capMap: { approver: "معتمد المكتب الرئيسي", finance_approver: "معتمد مالي", accountant: "محاسب", admin: "مسؤول" },
      },
      deliveries: {
        exceptions: "الاستثناءات المفتوحة", resolveHint: "اربط بأمر شراء ثم البند",
        poPick: "اربط بأمر شراء…", linePick: "اختر البند", resolve: "ربط واعتماد",
        resolved: "رُبط واعتُمد", reason: "السبب", empty: "لا استثناءات مفتوحة ✅",
        recent: "آخر التقاطات الموقع", captureNote: "التقاط الموقع يبقى على بوابة المهندسين الحالية حتى مرحلة الالتقاط دون اتصال",
      },
    },
  },
  en: {
    translation: {
      app: { title: "COPRI Portal", tagline: "The Art of Construction", logout: "Sign out" },
      nav: {
        home: "Home", approvals: "Approvals", commitments: "Commitments",
        deliveries: "Deliveries", masters: "Masters", reports: "Reports", admin: "Admin",
      },
      login: {
        title: "Sign in", email: "Email", password: "Password",
        signIn: "Sign in", pinToggle: "PIN sign-in (interim)", pin: "PIN",
        pinSignIn: "Sign in with PIN", badCreds: "Wrong email or password",
        badPin: "Wrong PIN", pinRetired: "PIN sign-in is retired — use email and password",
        notEnabled: "Account not enabled for the portal — contact the admin",
        network: "Connection failed — try again", required: "Fill the required fields",
      },
      status: {
        pending: "Under review", approved: "Approved", rejected: "Rejected", cancelled: "Cancelled",
        active: "Active", closed: "Closed", waiting: "Waiting", exception: "Exception", draft: "Draft", issued: "Issued",
      },
      queue: {
        oldest: "oldest: {{days}} d", empty: "Nothing waiting on you — the queue is clear",
        batchApprove: "Approve batch", willApprove: "{{ok}} to approve · {{ex}} exceptions",
        exception: "Exception", approve: "Will approve", exceptionReason: "Exception reason",
        unmapped: "Not mapped to a PO line — mapping is required to approve", mapHint: "Map to a PO line…",
        noSuggestions: "No suggested lines — no vendor match on active POs",
        approvedN: "{{n}} approved", exceptedN: "{{n}} exceptions", skippedN: "{{n}} skipped unmapped",
        withAccountant: "with accountant", batchTitle: "Daily batch — map, then approve",
        sitePhoto: "Receipt photo", siteNote: "Site note", openQty: "{{n}} open",
      },
      register: {
        search: "Search…", empty: "No records yet — commitments arrive from requests or manual entry.",
        number: "Number", vendor: "Vendor / Subcontractor", costCenter: "Cost center",
        value: "Value", received: "Received", invoiced: "Invoiced", status: "Status",
        origin: { rf: "Request", manual: "Manual", import: "Imported" },
        title: "Commitment register",
      },
      match: {
        title: "Three-way match", ordered: "Ordered", received: "Received", invoiced: "Invoiced",
        uninvoiced: "Uninvoiced", fullyInvoiced: "Fully invoiced",
        overInvoiced: "Invoiced exceeds received by {{v}}", pendingN: "{{n}} awaiting approval",
        lines: "Lines", grns: "GRNs", siteNotes: "Site notes", invoices: "Supplier invoices",
        lineOrdered: "ordered", lineReceived: "received", lineOpen: "open", lineDone: "complete",
        pendingSuffix: "pending",
      },
      home: {
        waitingOnYou: "Waiting on you", batch: "Daily batch", queue: "Approval queue",
        register: "Commitment register", match: "Match view", welcome: "Welcome {{name}}",
      },
      common: {
        loading: "Loading…", error: "Failed to load — check the connection", retry: "Retry",
        save: "Save", cancel: "Cancel", details: "Details", by: "by", on: "on",
      },
      stub: {
        title: "This screen migrates in the next wave — use the legacy portal for now",
        hint: "app.copri.com/?rf=1",
      },
      tabs: {
        batch: "Daily batch", requests: "Approval queue", register: "Register",
        blankets: "Blankets", subs: "Subcontracts", newRequest: "New request",
        manualPo: "Manual PO", grn: "GRN receipt", exceptions: "Exceptions",
        vendors: "Vendors", items: "Items", ccs: "Cost centers",
        sync: "Export & sync", recharge: "Internal recharge", audit: "Audit log", gates: "Approval chains",
      },
      req: {
        type: "Request type", typeWO: "Work order — subcontractor (RF-WO)", typeLPO: "Purchase order — supplier (RF-LPO)",
        typeCON: "Contract (RF-Contract)", cc: "Requesting cost center", ccPick: "Pick a cost center",
        vendor: "Vendor / Subcontractor", vendorPick: "Pick from the canonical list",
        callOff: "Call-off from a blanket (LPO)", callOffNone: "None — standalone request",
        callOffHint: "Call-offs inside the blanket's limits and validity auto-approve",
        blLine: "Blanket line", blLinePick: "Pick the line", blQty: "Requested quantity",
        isBlanket: "This request IS a blanket LPO — lines drawn down later",
        blCat: "Blanket category", blCatPick: "Pick a category", blRateRef: "Rate reference",
        validFrom: "Valid from", validTo: "Valid to",
        linesTitle: "Blanket lines — quantity is the control, value is derived (qty × rate)",
        lineItem: "Item / service", lineUnit: "Unit", lineQty: "Agreed quantity",
        lineRate: "Agreed rate (KD)", addLine: "+ Add line", removeLine: "Remove",
        linesTotal: "Lines total: {{v}}", desc: "Description", descPh: "Works / materials requested",
        value: "Estimated value (KD)", send: "Submit request",
        sentAuto: "Auto-approved — commitment no.", sentQueue: "Sent for approval",
        again: "New request", remaining: "{{n}} of {{m}} left",
        errCeiling: "Blanket ceiling exceeded — {{v}} remaining", errLineQty: "Line quantity exceeded — {{n}} remaining",
        errGeneric: "Could not submit — check the data", myRequests: "My requests and their fate",
        gate: "Current gate", gateTrail: "Approval trail", waitingGate: "Waiting for {{label}}",
        ownRequest: "Your request — you cannot approve it (separation of duties)", approve: "Approve", reject: "Reject",
        noteOptional: "Note (optional — required to reject)", noteRequired: "State the rejection reason",
        decidedLog: "Past decisions", otherGates: "At other gates", why: "Routing reason",
      },
      po: {
        manualTitle: "Register an existing PO", manualHint: "The always-open intake door — restricted to exceptions once the request portal earns trust",
        lines: "PO lines", amount: "Amount", note: "Note", saved: "Registered as", save: "Register PO",
      },
      grn: {
        title: "GRN — goods receipt against an active LPO", lpo: "Purchase order", lpoPick: "Pick the LPO",
        line: "Line (optional)", desc: "Received description", qty: "Quantity", unit: "Unit",
        amount: "Amount (KD)", invoiceNo: "Supplier invoice no. (optional)", invoiceDate: "Invoice date",
        nearDup: "Similar invoice within 30 days ({{no}} dated {{date}}) — record anyway?",
        force: "Record despite similarity", saved: "GRN recorded", save: "Record GRN", recent: "Recent GRNs",
        dupInvoice: "Invoice already recorded for this vendor",
      },
      blanket: {
        title: "Blanket board", linesMode: "lines", ceiling: "Ceiling", drawn: "Drawn", left: "Remaining",
        derived: "Derived value: {{a}} drawn of {{b}}", validity: "Valid {{from}} → {{to}}",
        rateRef: "Rate reference", empty: "No active blankets — approving an LPO request marked as blanket creates one.",
      },
      subs: {
        title: "Subcontract register", registerTitle: "Register a subcontract", commitment: "Commitment",
        commitmentPick: "Pick the CON commitment", commitmentHint: "New contract? Raise an RF-Contract first — no contract without a commitment",
        scope: "Scope", retention: "Retention %", advance: "Advance (KD)",
        docUrl: "Contract document link (optional)", register: "Register contract",
        contractValue: "Contract", certified: "Certified", certs: "{{n}} certs", retentionHeld: "Retention held",
        pendingCharges: "Materials pending recovery", deductedCharges: "Materials deducted", advanceShort: "Advance",
        certsTitle: "Payment certificates", chargesTitle: "Materials issued to sub (recovery)",
        certLine: "Certificate #{{n}}", gross: "Gross", ret: "Retention", back: "Material back-charge", net: "Net",
        pendingWith: "Pending — with accountant", deducted: "Deducted",
        addCharge: "Add materials issued to sub", chargeDesc: "Description", chargeAmount: "Recovery amount",
        recordCert: "Record a payment certificate", certGross: "Certificate gross", certPeriod: "Period (e.g. 2026-06)",
        deductOn: "Deduct pending charges on this certificate", netPreview: "Net: {{g}} − retention {{rp}}% ({{r}}) − materials ({{c}}) = {{n}}",
        alreadyRegistered: "This commitment is already registered", empty: "No contracts yet — approve an RF-Contract, then register its terms here.",
        doc: "Contract document",
      },
      recharge: {
        title: "Monthly internal recharge", period: "Period (month)", run: "Generate period invoices",
        missing: "Missing rates — add them in recharge_rates then re-run:",
        rates: "Approved rates", noRates: "No approved rates yet — added in the recharge_rates table.",
        invoices: "Internal invoices", issue: "Issue", issued: "Issued",
      },
      sync: {
        title: "Export to SpectroNova", create: "Create export batch", note: "Batch note",
        batches: "Export batches", rows: "{{n}} rows", acked: "{{n}} posted", downloadCsv: "Download CSV",
        ack: "Posted", unack: "Undo", pendingRows: "Awaiting export: {{n}}",
        health: "Sync health", exported: "Exported", pending: "Pending", unmatched: "Unposted",
        emptyPending: "No rows awaiting export.",
      },
      masters: {
        vendors: "Vendors & subcontractors", items: "Items (canonical)", ccs: "Cost centers",
        name: "Name", kind: "Kind", unit: "Unit", category: "Category", code: "Code",
        kindMap: { supplier: "Supplier", subcontractor: "Subcontractor", internal: "Internal", other: "Other" },
        division: "Division", project: "Project", spectronova: "SpectroNova code",
        itemsEmpty: "The canonical list is seeded by the dedup tool once the accountant's decisions land.",
        hint: "Edited in the Supabase dashboard until the permissions phase",
      },
      admin: {
        audit: "Audit log", gates: "Approval chains", chain: "Chain", gateNo: "Gate",
        capability: "Capability", label: "Label", auditEmpty: "No activity yet.",
        capMap: { approver: "Head-office approver", finance_approver: "Finance approver", accountant: "Accountant", admin: "Admin" },
      },
      deliveries: {
        exceptions: "Open exceptions", resolveHint: "Map to a PO, then the line",
        poPick: "Map to a PO…", linePick: "Pick the line", resolve: "Map & approve",
        resolved: "Mapped & approved", reason: "Reason", empty: "No open exceptions ✅",
        recent: "Recent site captures", captureNote: "Field capture stays on the current engineers' portal until the offline-capture phase",
      },
    },
  },
} as const

export type Lang = "ar" | "en"
const saved = (localStorage.getItem("copri_lang") as Lang) || "ar"

i18n.use(initReactI18next).init({
  resources,
  lng: saved,
  fallbackLng: "ar",
  interpolation: { escapeValue: false },
})

export function applyDir(lang: Lang) {
  document.documentElement.lang = lang
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr"
}
export function setLang(lang: Lang) {
  localStorage.setItem("copri_lang", lang)
  i18n.changeLanguage(lang)
  applyDir(lang)
}
applyDir(saved)

/** DB v1 stores Arabic status literals; render them via i18n keys so the
 *  English UI stays English (skill: coded values → i18n vocabulary). */
const STATUS_KEYS: Record<string, string> = {
  "قيد المراجعة": "status.pending", "معتمد": "status.approved", "مرفوض": "status.rejected",
  "ملغي": "status.cancelled", "نشط": "status.active", "مغلق": "status.closed",
  "بانتظار": "status.waiting", "استثناء": "status.exception", "مسودة": "status.draft", "صادر": "status.issued",
}
export function statusKey(dbValue: string | null | undefined): string {
  return (dbValue && STATUS_KEYS[dbValue]) || dbValue || "—"
}

export default i18n
