import i18n from "@/lib/i18n"

/* Boards-module strings (namespace "boards") — registered on the shared
   i18n instance when the lazy chunk loads. Arabic is primary. */

const AR = {
  title: "لوحات المعلومات",
  plantTitle: "لوحة المصنع",
  execTitle: "لوحة الإدارة العامة",
  back: "◂ كل اللوحات",
  updated: "حُدّثت {{when}}",
  loading: "جارٍ تحميل البيانات…",
  error: "تعذّر تحميل البيانات — تحقق من الاتصال وحاول مجدداً",
  retry: "إعادة المحاولة",

  ranges: { today: "اليوم", day: "📅 يوم محدد", range: "📆 فترة", all: "الكل", from: "من", to: "إلى" },

  home: {
    pick: "اختر اللوحة — لكل وحدة لوحتها الخاصة",
    exec: "الإدارة العامة", execDesc: "نظرة شاملة — كل الوحدات والمشاريع",
    plant: "المصنع", plantDesc: "الإرساليات حسب الشركة والموقع والخلطة",
    projectDesc: "استلامات الأسفلت والمواد للمشروع",
    acctPrefix: "محاسبة المواد — ", acctDesc: "كشف توريدات المواد بالتفصيل — للمحاسب",
    millingSoon: "لوحة القشط — قريباً",
  },

  kpi: {
    trips: "عدد الدروب", tripsUnit: "درب", tripsDrill: "درب · اضغط للتفاصيل ▾", tripsSent: "درب مرسل",
    tonsOut: "الكميات الصادرة (طن)", tonsRecv: "الكميات المستلمة (طن)", tonsRecvSub: "مؤكدة بالموقع",
    clients: "شركات مخدومة", clientsUnit: "عميل",
    avgLoad: "متوسط الحمولة", avgLoadUnit: "طن / درب",
    acceptPct: "نسبة الاستلام", acceptOf: "{{acc}} مستلمة من {{total}}",
    totalTons: "الكمية الإجمالية (طن)", copriTons: "كميات كوبري (طن)", copriTonsSub: "مشاريعنا",
    otherTons: "كميات الغير (طن)", otherTonsSub: "عملاء المصنع",
    acceptCopri: "نسبة الاستلام — كوبري",
    matReceipts: "استلامات المواد", matReceiptsUnit: "إيصال",
    matItems: "أصناف موردة", matItemsUnit: "بند",
    matSubs: "مقاولون من الباطن", matSups: "موردون",
  },

  cards: {
    byCompany: "الكميات حسب الشركة (طن)", daily: "الكميات اليومية (طن)",
    bySite: "الكميات حسب الموقع (طن)", byPlant: "الكميات حسب المصنع (طن)",
    byTransport: "النقل — كوبري / مقاول خارجي", byMix: "الكميات حسب نوع الخلطة (طن)",
    byProject: "الكميات حسب المشروع (طن)", byWO: "الكميات حسب أمر العمل (طن)", woPrefix: "أمر ",
    receiptStatus: "حالة الاستلام", receiptStatusCopri: "حالة استلام الأسفلت — مشاريع كوبري",
    quality: "جودة التسليم (الاستلامات المؤكدة)",
    matByProject: "استلامات المواد حسب المشروع",
    matByCat: "المواد حسب الفئة (استلامات)", matBySub: "المواد حسب المقاول من الباطن",
    matByRec: "المواد حسب المستلم", matBySite: "المواد حسب الموقع",
    matNone: "لا توجد استلامات مواد في هذه الفترة",
  },

  quality: {
    shortWeight: "نقص وزن (≤ -{{v}} ط)", avgDw: "متوسط فرق الوزن",
    tempDrop: "انخفاض حرارة (≤ -{{v}}°)", avgDt: "متوسط فرق الحرارة",
    shipments: "{{n}} شحنة", tons: "{{v}} ط", deg: "{{v}}°",
  },

  st: { accepted: "مقبولة", pending: "قيد الانتظار", rejected: "مرفوضة" },

  trips: {
    title: "تفاصيل الدروب — {{day}}", none: "لا توجد دروب في هذا اليوم",
    error: "تعذّر تحميل التفاصيل — حاول مجدداً", tons: "طن",
  },

  acct: {
    title: "محاسبة المواد — {{proj}}", log: "سجل التوريدات ({{n}})",
    none: "لا توجد توريدات مواد في هذه الفترة", more: "عرض المزيد ({{n}})",
    print: "🖨️ طباعة كشف", printNone: "لا توجد توريدات في هذه الفترة",
    supplier: "المورد", sub: "المقاول", receiver: "المستلم", photo: "🧾 صورة الإيصال",
    byItem: "الكميات حسب البند", byCat: "المواد حسب الفئة (استلامات)",
    bySub: "حسب المقاول من الباطن (استلامات)", bySup: "حسب المورد (استلامات)",
    byRec: "حسب المستلم (استلامات)",
  },

  report: {
    make: "📄 إنشاء تقرير", day: "تقرير يوم", range: "تقرير فترة", month: "تقرير شهر",
    go: "إنشاء", popup: "يرجى السماح بالنوافذ المنبثقة لإنشاء التقرير",
    dataError: "تعذّر تحميل البيانات — تحقق من الاتصال",
  },

  pin: {
    plantTitle: "تسجيل الدخول — مدير المصنع", financeTitle: "تسجيل الدخول — المدير المالي",
    name: "الاسم", namePick: "اختر الاسم", pin: "الرمز السري", enter: "دخول",
    wrong: "الاسم أو الرمز غير صحيح", listError: "تعذّر تحميل القائمة — تحقق من الاتصال وحدّث الصفحة",
  },

  desk: {
    logout: "خروج",
    plantTitle: "بوابة مدير المصنع", plantSub: "المصنع — الإرساليات · البرامج · الطلبات",
    financeTitle: "اعتماد العملاء — المالية", financeSub: "طلبات إضافة عملاء الأسفلت — الاعتماد المالي",
    tabBoard: "📊 لوحة المصنع", tabPrograms: "🗓️ برامج الأسفلت", tabRequests: "➕ طلب أمر عمل",
  },

  prog: {
    add: "+ برنامج لعميل خارجي", hideForm: "إخفاء النموذج ▴",
    copriNote: "برامج مشاريع كوبري تصل من مهندسي المواقع — الإضافة هنا لعملاء المصنع الخارجيين فقط.",
    company: "الشركة", companyPick: "اختر الشركة", project: "المشروع / العميل", projectPick: "اختر المشروع",
    date: "تاريخ العمل", site: "الموقع", sitePh: "مثال: مشرف",
    block: "القطعة", blockPh: "اختياري", street: "الشارع", streetPh: "رقم أو اسم",
    mixes: "الخلطات وعدد السيارات", mixPick: "اختر النوع", loadsPh: "عدد السيارات", addMix: "+ خلطة أخرى",
    plant: "المصنع", plantPick: "اختر المصنع", loadTime: "موعد التحميل", paveTime: "موعد الفرش",
    notes: "ملاحظات", notesPh: "جهة التنسيق، تفاصيل…",
    save: "حفظ البرنامج", saving: "جارٍ الحفظ…",
    reqFields: "الشركة والمشروع والتاريخ والموقع مطلوبة", failed: "حدث خطأ — حاول مجدداً",
    none: "لا توجد برامج مسجلة — تصل برامج الأعمال من مهندسي المواقع وتظهر هنا.",
    past: "الأيام السابقة", today: "اليوم", tomorrow: "غداً",
    noMix: "خلطة غير محددة", forClient: "لـ {{c}}", loadsUnit: "سيارة",
    loadLbl: "تحميل", paveLbl: "فرش",
    done: "تم التنفيذ ✓", cancel: "إلغاء ✕",
    confirmDone: "تأكيد تنفيذ هذا البرنامج؟", confirmCancel: "إلغاء هذا البرنامج؟ (سوء أحوال جوية / عطل مصنع…)",
    yes: "نعم", no: "تراجع",
    stPlanned: "مخطط", stDone: "منفذ", stCancelled: "ملغي",
  },

  req: {
    title: "طلب إضافة أمر عمل",
    explain: "طلب أمر عمل جديد لاستلام الأسفلت — حدّد العميل والكميات وسعر الوحدة لكل خلطة. يُعتمد الطلب من المدير المالي، ويظهر العميل في نموذج الإرسال بعد الموافقة.",
    company: "الشركة", companyPick: "اختر الشركة", newCompany: "شركة أخرى / جديدة",
    newCompanyName: "اسم الشركة الجديدة", newCompanyPh: "اسم الشركة",
    client: "اسم العميل / المشروع", clientPh: "مثال: مشروع صيانة الجهراء",
    contract: "رقم العقد", contractPh: "اختياري",
    payment: "طريقة الدفع", cash: "نقدي", credit: "آجل",
    items: "الخلطات — الكمية وسعر الوحدة", mixHead: "نوع الخلطة", qtyHead: "الكمية (طن)", rateHead: "سعر الطن (د.ك)",
    mixPick: "اختر النوع", qtyPh: "الكمية", ratePh: "السعر", addItem: "+ خلطة أخرى",
    details: "تفاصيل", detailsPh: "الموقع، جهة التنسيق، سبب الإضافة…",
    send: "إرسال الطلب للاعتماد 📨", sending: "جارٍ الإرسال…",
    reqFields: "الشركة واسم العميل وطريقة الدفع مطلوبة",
    reqItems: "لكل خلطة: النوع والكمية وسعر الوحدة مطلوبة",
    failed: "حدث خطأ — حاول مجدداً",
    sent: "✓ تم تسجيل الطلب — بانتظار اعتماد المالية",
    whatsapp: "إبلاغ {{name}} عبر WhatsApp 💬",
    prior: "الطلبات السابقة", priorNone: "لا توجد طلبات سابقة.",
    byLine: "طلبه {{by}} · {{when}}", officeReply: "رد المكتب:",
    contractLbl: "عقد {{c}}", itemLine: "{{mix}}: {{qty}} طن × {{rate}} د.ك",
    financeFallback: "المدير المالي",
    waBody: "طلب إضافة أمر عمل:", waCompany: "الشركة", waClient: "العميل", waContract: "العقد",
    waPayment: "الدفع", waDetails: "تفاصيل", waBy: "مقدم الطلب", waApprove: "للاعتماد",
  },

  fin: {
    pending: "بانتظار قرارك", pendingNone: "لا توجد طلبات بانتظار الاعتماد.",
    decided: "قرارات سابقة", approve: "موافقة ✓", reject: "رفض ✕",
    notePh: "ملاحظة (اختياري — مطلوبة عند الرفض)", noteReq: "اذكر سبب الرفض",
    reply: "الرد:",
  },

  chip: {
    "مخطط": "مخطط", "منفذ": "منفذ", "ملغي": "ملغي",
    "قيد المراجعة": "قيد المراجعة", "موافَق عليه": "موافَق عليه", "مرفوض": "مرفوض",
    "في الطريق": "في الطريق", "مقبول": "مقبول", "لا ينطبق": "لا ينطبق",
  },

  rep: {
    dispatchTitle: "تقرير الإرساليات", daily: "يومي", period: "فترة", monthPrefix: "شهر ",
    dayOf: "يوم {{d}}", fromTo: "من {{f}} إلى {{t}}", made: "أُنشئ {{when}}",
    trips: "عدد الدروب", tonsOut: "الكميات الصادرة (طن)", tonsRecv: "الكميات المستلمة (طن)",
    acceptCopri: "نسبة الاستلام — كوبري", avgLoad: "متوسط الحمولة (طن)",
    byCompany: "الكميات حسب الشركة", byProject: "الكميات حسب المشروع",
    byDay: "الكميات حسب اليوم", bySite: "الكميات حسب الموقع", byMix: "الكميات حسب نوع الخلطة",
    colItem: "البند", colTrips: "الدروب", colTons: "الكمية (طن)",
    colDay: "اليوم", colOut: "صادرة (طن)", colRecv: "مستلمة (طن)",
    detail: "تفاصيل الدروب ({{n}})",
    colNote: "السند", colTime: "الوقت", colCompanyProj: "الشركة / المشروع", colSite: "الموقع",
    colMix: "الخلطة", colTon: "طن", colStatus: "الحالة",
    footer: "شركة كوبري للمشاريع الإنشائية — طُبع من منظومة التتبع الرقمي",
    matTitle: "كشف توريدات المواد — {{proj}}",
    matDetail: "تفاصيل التوريدات ({{n}})",
    matCols: { ts: "التاريخ", id: "رقم الإيصال", cat: "الفئة", item: "البند", qty: "الكمية", unit: "الوحدة", sup: "المورد", sub: "المقاول من الباطن", rec: "المستلم", site: "الموقع" },
    matByCat: "الإجمالي حسب الفئة", matBySub: "الإجمالي حسب المقاول من الباطن", matBySup: "الإجمالي حسب المورد",
    byCount: "(بالعدد)", colCount: "العدد",
    kMats: "استلامات المواد", kItems: "أصناف موردة", kSubs: "مقاولون من الباطن", kSups: "موردون",
  },

  units: { tons: "ط", tonsFull: "طن" },
} as const

const EN = {
  title: "Dashboards",
  plantTitle: "Plant board",
  execTitle: "Management board",
  back: "◂ All boards",
  updated: "Updated {{when}}",
  loading: "Loading data…",
  error: "Could not load data — check the connection and retry",
  retry: "Retry",

  ranges: { today: "Today", day: "📅 Specific day", range: "📆 Period", all: "All", from: "From", to: "To" },

  home: {
    pick: "Pick a board — every unit has its own",
    exec: "Management", execDesc: "Overview — all units and projects",
    plant: "Plant", plantDesc: "Dispatches by company, site and mix",
    projectDesc: "Asphalt receipts and materials for the project",
    acctPrefix: "Materials accounting — ", acctDesc: "Itemized materials statement — for the accountant",
    millingSoon: "Milling board — coming soon",
  },

  kpi: {
    trips: "Trips", tripsUnit: "trips", tripsDrill: "trips · tap for detail ▾", tripsSent: "dispatched",
    tonsOut: "Dispatched (tons)", tonsRecv: "Received (tons)", tonsRecvSub: "confirmed on site",
    clients: "Clients served", clientsUnit: "clients",
    avgLoad: "Avg load", avgLoadUnit: "tons / trip",
    acceptPct: "Receipt rate", acceptOf: "{{acc}} received of {{total}}",
    totalTons: "Total (tons)", copriTons: "COPRI tons", copriTonsSub: "our projects",
    otherTons: "Third-party tons", otherTonsSub: "plant clients",
    acceptCopri: "Receipt rate — COPRI",
    matReceipts: "Material receipts", matReceiptsUnit: "receipts",
    matItems: "Items supplied", matItemsUnit: "items",
    matSubs: "Subcontractors", matSups: "Suppliers",
  },

  cards: {
    byCompany: "Tons by company", daily: "Daily tons",
    bySite: "Tons by site", byPlant: "Tons by plant",
    byTransport: "Transport — COPRI / external", byMix: "Tons by mix type",
    byProject: "Tons by project", byWO: "Tons by work order", woPrefix: "WO ",
    receiptStatus: "Receipt status", receiptStatusCopri: "Asphalt receipt status — COPRI projects",
    quality: "Delivery quality (confirmed receipts)",
    matByProject: "Material receipts by project",
    matByCat: "Materials by category (receipts)", matBySub: "Materials by subcontractor",
    matByRec: "Materials by receiver", matBySite: "Materials by site",
    matNone: "No material receipts in this period",
  },

  quality: {
    shortWeight: "Weight shortage (≤ -{{v}} t)", avgDw: "Avg weight delta",
    tempDrop: "Temp drop (≤ -{{v}}°)", avgDt: "Avg temp delta",
    shipments: "{{n}} loads", tons: "{{v}} t", deg: "{{v}}°",
  },

  st: { accepted: "Accepted", pending: "Pending", rejected: "Rejected" },

  trips: {
    title: "Trip detail — {{day}}", none: "No trips on this day",
    error: "Could not load detail — retry", tons: "t",
  },

  acct: {
    title: "Materials accounting — {{proj}}", log: "Delivery log ({{n}})",
    none: "No material deliveries in this period", more: "Show more ({{n}})",
    print: "🖨️ Print statement", printNone: "No deliveries in this period",
    supplier: "Supplier", sub: "Subcontractor", receiver: "Receiver", photo: "🧾 Receipt photo",
    byItem: "Quantities by item", byCat: "By category (receipts)",
    bySub: "By subcontractor (receipts)", bySup: "By supplier (receipts)",
    byRec: "By receiver (receipts)",
  },

  report: {
    make: "📄 Generate report", day: "Day report", range: "Period report", month: "Month report",
    go: "Create", popup: "Allow pop-ups to generate the report",
    dataError: "Could not load data — check the connection",
  },

  pin: {
    plantTitle: "Sign in — Plant manager", financeTitle: "Sign in — Finance manager",
    name: "Name", namePick: "Pick a name", pin: "PIN", enter: "Sign in",
    wrong: "Wrong name or PIN", listError: "Could not load the list — check the connection and refresh",
  },

  desk: {
    logout: "Sign out",
    plantTitle: "Plant manager portal", plantSub: "Plant — dispatches · programs · requests",
    financeTitle: "Client approval — Finance", financeSub: "Asphalt client requests — finance approval",
    tabBoard: "📊 Plant board", tabPrograms: "🗓️ Asphalt programs", tabRequests: "➕ Work-order request",
  },

  prog: {
    add: "+ Program for external client", hideForm: "Hide form ▴",
    copriNote: "COPRI project programs arrive from site engineers — add here for external plant clients only.",
    company: "Company", companyPick: "Pick a company", project: "Project / client", projectPick: "Pick a project",
    date: "Work date", site: "Site", sitePh: "e.g. Mishref",
    block: "Block", blockPh: "optional", street: "Street", streetPh: "number or name",
    mixes: "Mixes and truck counts", mixPick: "Pick a type", loadsPh: "Trucks", addMix: "+ Another mix",
    plant: "Plant", plantPick: "Pick a plant", loadTime: "Load time", paveTime: "Paving time",
    notes: "Notes", notesPh: "Coordinator, details…",
    save: "Save program", saving: "Saving…",
    reqFields: "Company, project, date and site are required", failed: "Something went wrong — retry",
    none: "No programs yet — site engineers' work programs appear here.",
    past: "Previous days", today: "Today", tomorrow: "Tomorrow",
    noMix: "Mix not set", forClient: "For {{c}}", loadsUnit: "trucks",
    loadLbl: "load", paveLbl: "pave",
    done: "Executed ✓", cancel: "Cancel ✕",
    confirmDone: "Confirm this program as executed?", confirmCancel: "Cancel this program? (weather / plant fault…)",
    yes: "Yes", no: "Back",
    stPlanned: "Planned", stDone: "Executed", stCancelled: "Cancelled",
  },

  req: {
    title: "Work-order request",
    explain: "Request a new asphalt work order — set the client, quantities and unit rate per mix. Finance approves; the client appears on the dispatch form after approval.",
    company: "Company", companyPick: "Pick a company", newCompany: "Other / new company",
    newCompanyName: "New company name", newCompanyPh: "Company name",
    client: "Client / project name", clientPh: "e.g. Jahra maintenance project",
    contract: "Contract no.", contractPh: "optional",
    payment: "Payment", cash: "Cash", credit: "Credit",
    items: "Mixes — quantity and unit rate", mixHead: "Mix type", qtyHead: "Qty (tons)", rateHead: "Rate/ton (KD)",
    mixPick: "Pick a type", qtyPh: "Qty", ratePh: "Rate", addItem: "+ Another mix",
    details: "Details", detailsPh: "Location, coordinator, reason…",
    send: "Send for approval 📨", sending: "Sending…",
    reqFields: "Company, client and payment method are required",
    reqItems: "Each mix row needs type, quantity and rate",
    failed: "Something went wrong — retry",
    sent: "✓ Request recorded — awaiting finance approval",
    whatsapp: "Notify {{name}} on WhatsApp 💬",
    prior: "Previous requests", priorNone: "No previous requests.",
    byLine: "By {{by}} · {{when}}", officeReply: "Office reply:",
    contractLbl: "Contract {{c}}", itemLine: "{{mix}}: {{qty}} t × {{rate}} KD",
    financeFallback: "Finance manager",
    waBody: "Work-order request:", waCompany: "Company", waClient: "Client", waContract: "Contract",
    waPayment: "Payment", waDetails: "Details", waBy: "Requested by", waApprove: "Approve",
  },

  fin: {
    pending: "Waiting on you", pendingNone: "No requests awaiting approval.",
    decided: "Previous decisions", approve: "Approve ✓", reject: "Reject ✕",
    notePh: "Note (optional — required to reject)", noteReq: "State the rejection reason",
    reply: "Reply:",
  },

  chip: {
    "مخطط": "Planned", "منفذ": "Executed", "ملغي": "Cancelled",
    "قيد المراجعة": "Under review", "موافَق عليه": "Approved", "مرفوض": "Rejected",
    "في الطريق": "In transit", "مقبول": "Accepted", "لا ينطبق": "N/A",
  },

  rep: {
    dispatchTitle: "Dispatch report", daily: "Daily", period: "Period", monthPrefix: "Month ",
    dayOf: "Day {{d}}", fromTo: "{{f}} to {{t}}", made: "Generated {{when}}",
    trips: "Trips", tonsOut: "Dispatched (tons)", tonsRecv: "Received (tons)",
    acceptCopri: "Receipt rate — COPRI", avgLoad: "Avg load (tons)",
    byCompany: "Tons by company", byProject: "Tons by project",
    byDay: "Tons by day", bySite: "Tons by site", byMix: "Tons by mix type",
    colItem: "Item", colTrips: "Trips", colTons: "Tons",
    colDay: "Day", colOut: "Out (t)", colRecv: "Received (t)",
    detail: "Trip detail ({{n}})",
    colNote: "Note", colTime: "Time", colCompanyProj: "Company / project", colSite: "Site",
    colMix: "Mix", colTon: "t", colStatus: "Status",
    footer: "COPRI Construction Enterprises — printed from the digital tracking system",
    matTitle: "Materials delivery statement — {{proj}}",
    matDetail: "Delivery detail ({{n}})",
    matCols: { ts: "Date", id: "Receipt no.", cat: "Category", item: "Item", qty: "Qty", unit: "Unit", sup: "Supplier", sub: "Subcontractor", rec: "Receiver", site: "Site" },
    matByCat: "Total by category", matBySub: "Total by subcontractor", matBySup: "Total by supplier",
    byCount: "(count)", colCount: "Count",
    kMats: "Material receipts", kItems: "Items supplied", kSubs: "Subcontractors", kSups: "Suppliers",
  },

  units: { tons: "t", tonsFull: "tons" },
}

i18n.addResourceBundle("ar", "boards", AR, true, true)
i18n.addResourceBundle("en", "boards", EN, true, true)

export default i18n
