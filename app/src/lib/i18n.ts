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
