/* ── Accounting labels — THE central UI-string object ─────────────────
   BRIEF-accounting-rebuild-final.md: accounting screens are English
   only, and every UI string lives here — never hardcoded inline.
   Vendor/item/master-data VALUES render exactly as in the SN masters;
   only UI chrome comes from this object.

   AR_DICT below is the APPROVED Arabic dictionary from the brief's
   appendix, stored for a future language switch — DO NOT build the
   switch now. Statuses and lifecycle labels remain English in all
   languages. */

export const L = {
  app: {
    title: "Accounting",
    logout: "Log out",
    retry: "Retry",
    loadError: "Couldn't load data — check the connection.",
    noAccess: "This area is for the accountant. Ask the office to enable your account.",
  },
  nav: {
    audit: "Audit queue",
    poRegister: "PO register",
    bundling: "Bundling",
    bundles: "Bundles",
    grn: "GRN",
  },
  tabs: {
    asphalt: "Asphalt",
    materials: "Materials",
  },
  status: {
    matched: "Matched",
    dispatched_not_received: "Dispatched, not received",
    received_not_dispatched: "Received, not dispatched",
    not_received: "Not received",
    no_po: "No PO",
  },
  register: {
    heading: "PO register",
    search: "Search PO number, SN number, or vendor…",
    noPos: "No active POs.",
    noPosHint: "POs arrive from the SpectroNova import or manual entry.",
    pickPo: "Pick a PO to see its line balances.",
    noDate: "no date",
    noLines: "No lines registered yet — balances are tracked per line.",
    line: (n: number) => `Line ${n}`,
    lumpSum: "Lump sum",
    ordered: "Ordered",
    bundled: "Bundled",
    pendingShort: (n: string) => `${n} in draft`,
    remaining: "Remaining",
    over: "Over by",
    complete: "Complete",
    nearLimit: "Nearing limit",
    addLines: "Add lines",
    addLinesHint: "SN imports carry PO headers only — type the lines once per PO.",
    colItem: "Item / description",
    colQty: "Qty",
    colUnit: "UOM",
    colRate: "Unit price",
    colRemarks: "Remarks (laying method…)",
    addRow: "Add row",
    save: "Save lines",
    saving: "Saving…",
    saveFailed: "Couldn't save — check the entries and try again.",
    itemRequired: "Every line needs an item description.",
    showingPos: (n: number, total: number) => `showing ${n} of ${total} POs`,
  },
  audit: {
    heading: "Audit queue",
    hint: "Unmatched notes cannot be bundled.",
    oldestUnmatched: (days: number) => `oldest unmatched: ${days}d`,
    colNote: "Delivery note no.",
    colSite: "Site",
    colVendor: "Vendor",
    colItem: "Item",
    colQtyT: "Qty (t)",
    colQty: "Qty",
    colStatus: "Status",
    empty: "No delivery notes here yet.",
    emptyHint: "Notes appear as the plant dispatches and sites capture deliveries.",
    showing: (n: number, total: number) => `showing ${n} of ${total}`,
    all: "All",
  },
} as const

/* Approved Arabic dictionary (brief appendix) — future switch only. */
export const AR_DICT = {
  bundle: "تجميعة",
  bundles: "التجميعات",
  bundling: "التجميع",
  auditQueue: "قائمة التدقيق",
  audit: "تدقيق",
  deliveryNote: "سند تسليم",
  supplierDnNo: "رقم سند تسليم المورد",
  grn: "سند استلام بضاعة",
  grnDisclaimer: "مستند داعم من كوبري — ليس سجلاً في SpectroNova",
  po: "أمر شراء",
  poLine: "بند أمر الشراء",
  qty: "الكمية",
  uom: "الوحدة",
  unitPrice: "سعر الوحدة",
  amount: "المبلغ",
  tons: "طن",
  kwd: "د.ك",
  // Statuses and lifecycle labels remain ENGLISH in all languages.
} as const
