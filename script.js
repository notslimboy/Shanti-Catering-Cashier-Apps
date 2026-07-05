const STORAGE_KEY = "kasir-bento-state-v1";
const SYNC_INTERVAL_MS = 5 * 60 * 1000;
const SALES_PAGE_SIZE = 10;
const CUSTOMER_SUGGESTION_LIMIT = 80;
const SUPABASE_URL = "https://ddfalsclevkqhiyojngx.supabase.co";
const SUPABASE_KEY = "sb_publishable_Ve_QZUvSQgQSE9_LcEAHmw_WLaQDSrP";
const CUSTOMER_TAG_ALIAS_PREFIX = "tagalamat:";
const CUSTOMER_TAG_FILTER_ALL = "all";
const CUSTOMER_TAG_FILTER_OTHER = "__other";
const CUSTOMER_TAG_FILTER_OTHER_LABEL = "Lainnya";
const CUSTOMER_HYGIENE_FILTER_ALL = "all";
const CUSTOMER_HYGIENE_FILTER_REVIEW = "needsReview";
const CUSTOMER_HYGIENE_ISSUES = [
  { key: "missingExplicitTag", label: "Tag belum disimpan" },
  { key: "missingResolvedTag", label: "Tanpa tag" },
  { key: "zeroShipping", label: "Ongkir 0" },
  { key: "tagMismatch", label: "Tag beda alamat" },
  { key: "shippingOutlier", label: "Ongkir beda tag" },
  { key: "duplicateAlias", label: "Alias dobel" },
  { key: "similarName", label: "Nama mirip" },
];
const CUSTOMER_HYGIENE_ISSUE_LABELS = new Map(CUSTOMER_HYGIENE_ISSUES.map((issue) => [issue.key, issue.label]));
const CUSTOMER_TAG_FILTER_ORDER = [
  "ITS",
  "Sutorejo",
  "Mulyosari",
  "GOJEK",
  "BPD",
  "Wisper",
  "Bhaskara",
  "Kenjeran",
  "Pantai Mentari",
  "Pakuwon",
  "Keputih",
  "Dharmahusada",
  "Bumi Galaxy",
  "Bumi Marina",
  "Rungkut",
  "Manyar",
  "Kalijudan",
  "Supit",
  CUSTOMER_TAG_FILTER_OTHER_LABEL,
];

const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const integerFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 0,
});

const RECEIPT_FONT_SIZES = {
  small: { body: 11, small: 10 },
  medium: { body: 12, small: 11 },
  large: { body: 13, small: 12 },
};

const DEFAULT_CATEGORY = "Lainnya";
const AI_BULK_PROMPT = `Ringkas chat WhatsApp ini menjadi CSV saja, tanpa markdown.
Kolom wajib:
customer,chatDate,payment,ongkir,item,quantity,unit,harga,note

Aturan:
- Satu baris = satu item pesanan.
- Ulangi customer, chatDate, payment, dan ongkir untuk item dari customer yang sama.
- customer adalah nama kontak WA yang sudah berisi alamat/patokan pelanggan.
- Jika chat menyebut harga custom seperti "Sop Iga 50K", isi kolom harga dengan 50000 dan item tetap "Sop Iga".
- Jika chat menyebut jumlah satuan seperti "Perkedel 10 biji", isi item "Perkedel", quantity 10, dan unit "biji".
- Catatan seperti "sambal pisah", "tidak pakai udang", atau "caonya kotak-kotak" harus masuk ke kolom note pada item yang sesuai.
- Jika ada produk yang sama tetapi memiliki catatan/varian/keterangan yang berbeda (contoh: "2x Siomay tanpa pare" dan "1x Siomay pake pare"), produk tersebut HARUS ditulis sebagai baris terpisah di CSV dengan catatan masing-masing. JANGAN PERNAH menggabungkan kuantitasnya atau menggabungkan catatan mereka menjadi satu baris (seperti "3x Siomay, catatan: tanpa pare; pake pare").
- Abaikan obrolan yang bukan pesanan, gabungkan revisi terakhir dari customer yang sama, dan jangan menebak item kalau tidak disebut.

Contoh:
customer,chatDate,payment,ongkir,item,quantity,unit,harga,note
"Bu Ani - Jl Melati 12","28/5/2026 10.15","Tunai",10000,"Nasi Goreng Rumahan",20,"porsi",,"sambal pisah untuk 5 porsi"`;

function getLocalDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseLocalDateKey(value) {
  const [year, month, day] = String(value || "")
    .split("-")
    .map((part) => Number.parseInt(part, 10));

  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
}

function getDefaultSaleState(overrides = {}) {
  return {
    shipping: 0,
    payment: "Tunai",
    customerName: "",
    customerAddress: "",
    chatDate: "",
    dueText: "",
    orderNote: "",
    sourceDraftId: "",
    ...overrides,
  };
}

const state = {
  products: [],
  cart: [],
  settings: {
    storeName: "Shanti Catering",
    storeAddress: "BHASKARA III / 38",
    footer: "== TERIMA KASIH ==",
    receiptWidth: "58",
    receiptFontSize: "large",
    autoPrint: true,
    printFlow: "direct",
    receiptMode: "complete",
    thermalPrinterDefaulted: true,
    theme: "light",
    dbMode: "supabase",
  },
  sale: getDefaultSaleState(),
  sync: {
    sheetUrl: "https://docs.google.com/spreadsheets/d/183BZtWGEj0JRE7qjTk1jXBnVFbz_oMti7tR2dkisJsc/edit?gid=0#gid=0",
    sheetName: "Menu",
    autoSync: true,
    lastSyncAt: "",
    lastSyncMessage: "",
  },
  columns: {
    name: "nama",
    price: "harga",
    stock: "stok",
    sku: "sku",
  },
  sales: [],
  customers: [],
  salesSummary: {
    totalSales: 0,
    totalRevenue: 0,
    deletedSales: 0,
  },
  salesDate: getLocalDateKey(),
  salesStartDate: getLocalDateKey(),
  salesEndDate: getLocalDateKey(),
  salesRange: "day",
  salesStatus: "active",
  salesSearch: "",
  salesSort: "newest",
  salesPage: 1,
  salesCalendar: {
    field: "start",
    month: getLocalDateKey().slice(0, 7),
    hoverDate: "",
  },
  dailyMenuCalendar: {
    month: getLocalDateKey().slice(0, 7),
  },
  customerSearch: "",
  customerTagFilter: "all",
  customerHygieneFilter: "all",
  selectedCategory: "all",
  dailyMenu: {
    date: getLocalDateKey(),
    productIds: [],
    menusByDate: {},
    onlyToday: false,
    lastImportAt: "",
  },
  heldCarts: [],
  piutang: {
    tab: "belum_lunas",
    search: "",
  },
  editingProductId: null,
  editingProductVariants: [],
  pendingDeleteProductId: null,
  pendingDeleteSale: null,
  pendingAppConfirm: null,
  activeDetailSale: null,
  editingSaleDetail: false,
  checkoutWarningSignature: "",
  importDrafts: [],
  bulkDraftFilter: "all",
  bulkDraftSearch: "",
  lastReceipt: null,
  selectedFile: null,
};

const customerProfilesCache = {
  dirty: true,
  signature: "",
  profiles: [],
  lastSuggestionsHtml: "",
};

const CUSTOMER_ADDRESS_TAG_RULES = [
  { tag: "Sutorejo", pattern: /\b(?:sutorejo|suto|sut)\s*(?:tengah|teng|tgh)\b|\bsutotengah\b|\bsutoteng\b|\bsutotgh\b/ },
  { tag: "Sutorejo", pattern: /\b(?:sutorejo|suto|sut)\s*(?:selatan|sel)\b|\bsutoselatan\b|\bsutosel\b/ },
  { tag: "Sutorejo", pattern: /\b(?:sutorejo|suto|sut)\s*(?:utara|ut)\b|\bsutoutara\b|\bsutout\b/ },
  { tag: "Sutorejo", pattern: /\b(?:sutorejo|suto|sut)\s*(?:timur|tim)\b|\bsutotimur\b|\bsutotim\b/ },
  { tag: "Sutorejo", pattern: /\bsutorejo\b|\bsuto\b|\banak\s*7\s*37\b|\bartha\s*catur\b/ },
  { tag: "BPD", pattern: /\bbpd\b/ },
  { tag: "Mulyosari", pattern: /\bmuly(?:o|osari)?\s*(?:tengah|tng|teng|tgh)\b|\bmulyotengah\b|\bmulyotng\b|\bmulyoteng\b|\bmulyotgh\b/ },
  { tag: "Mulyosari", pattern: /\bmuly(?:o|osari)?\s*(?:utara|ut)\b|\bmulyoutara\b|\bmulyout\b/ },
  { tag: "Mulyosari", pattern: /\bmulyosari\b|\bmulyo\b|\bmuly\b/ },
  { tag: "Wisper", pattern: /\b(?:wisper|wis\s*per|spr)\b/ },
  { tag: "Bhaskara", pattern: /\b(?:bhaskara|bhaska|bhas|bhsksari)\b|\bbu\s*bambang\s*gg\s*1\b|\bzainal\s*gg\s*3\b/ },
  { tag: "Kenjeran", pattern: /\b(?:kenjeran|pantai\s*ment(?:ari|ri)|sahabudin|tuwowo|tohir|babatan|dupak(?:\s*pecah\s*belah)?|pecah\s*belah|ngadi|putro\s*agung)\b/ },
  { tag: "Keputih", pattern: /\bkeputih\b|\bjoko\s*sukolilo\b/ },
  { tag: "Dharmahusada", pattern: /\bdharmahusada\b/ },
  { tag: "Pakuwon", pattern: /\bpakuwon\b|\b(?:puri|griya)\s*asri\b|\bvilla\s*royal\b|\broyal\s+[a-z]?\d\b|\bsan\s*(?:antonio|diego)\b|\bwestwood\b|\bflorence\b|\blaguna\b|\bmutiara\b|\bnenet\b/ },
  { tag: "Bumi Galaxy", pattern: /\bbumi\s*galaxy\s*permai\b|\bbumigalaxypermai\b|\bgalaxy\s*permai\b|\bsma\s*5\s*ratna\s*juli\b|\bsma5ratnajuli\b/ },
  { tag: "Bumi Marina", pattern: /\bbumi\s*marina\b/ },
  { tag: "Rungkut", pattern: /\brungkut\b/ },
  { tag: "Manyar", pattern: /\bmanyar\b/ },
  { tag: "Kalijudan", pattern: /\bkalijudan\b/ },
  { tag: "Supit", pattern: /\bsupit\b/ },
];

const CUSTOMER_TAG_ALIASES = new Map([
  ["gojek", "GOJEK"],
  ["pakuwoncity", "Pakuwon"],
  ["puriasri", "Pakuwon"],
  ["griyaasri", "Pakuwon"],
  ["villaroyal", "Pakuwon"],
  ["royal", "Pakuwon"],
  ["sandiego", "Pakuwon"],
  ["sanantonio", "Pakuwon"],
  ["westwood", "Pakuwon"],
  ["florence", "Pakuwon"],
  ["laguna", "Pakuwon"],
  ["mutiara", "Pakuwon"],
  ["kenejeran", "Kenjeran"],
  ["pantaimentari", "Pantai Mentari"],
  ["pantaimentri", "Pantai Mentari"],
  ["pantainmentari", "Pantai Mentari"],
  ["sahabudin", "Kenjeran"],
  ["tuwowo", "Kenjeran"],
  ["tohir", "Kenjeran"],
  ["babatan", "Kenjeran"],
  ["dupak", "Kenjeran"],
  ["dupakpecahbelah", "Kenjeran"],
  ["pecahbelah", "Kenjeran"],
  ["ngadi", "Kenjeran"],
  ["putroagung", "Kenjeran"],
]);

const CUSTOMER_ITS_BLOCK_PATTERN = /\b(?:its\s*)?(?:perum\s*)?(?:blok\s*)?(?:(p1)\s*[/ -]?\s*\d+|([tuvwjdnxmrficahb])(?!\s*o\s*\d)\s*(?:lama\s*)?(?:[/.-]|\s)*[a-z]?\s*\d+)\b/;
const CUSTOMER_ITS_FALLBACK_PATTERN = /\b(?:its|dptsi|bapkm|sdmo|dpsp|spkb|ftspk|wr\s*3|teknik|tek|t\s*lingkungan|lingku(?:ngan)?|arsitek(?:tur)?|bahasa|mesin|kimia|fisika|geofisika|statistika|mipa|instrumen(?:tasi)?|hidrodinamika|brin|nasdec|riset|research\s*center|gedung\s*riset|gedung\s*rc|rc\s*(?:lt|lantai)|perpus(?:takaan)?|manajemen\s*bisnis)\b/;
const CUSTOMER_GOJEK_PATTERN = /\bgo\s*jek\b|\bgojek\b/;

const SHIPPING_TAG_UNMAPPED_LABEL = "Tanpa tag / Belum dipetakan";
const SHIPPING_COURIER_UNMAPPED_LABEL = "Belum dipetakan";
const SHIPPING_COURIER_GROUPS = [
  { courier: "Hide/Vendi", tags: ["ITS"] },
  { courier: "Yanto", tags: ["Sutorejo", "BPD", "Mulyosari", "Dharmahusada", "Wisper"] },
  { courier: "Sudes", tags: ["Kenjeran", "Pakuwon", "Pantai Mentari", "Bhaskara"] },
  { courier: "GOJEK", tags: ["GOJEK"] },
];
const SHIPPING_COURIER_BY_TAG = new Map(
  SHIPPING_COURIER_GROUPS.flatMap((group) => group.tags.map((tag) => [tag, group.courier]))
);
const SHIPPING_COURIER_ORDER = [
  ...SHIPPING_COURIER_GROUPS.map((group) => group.courier),
  SHIPPING_COURIER_UNMAPPED_LABEL,
];

const saleSearchKeyCache = new WeakMap();

let syncTimer = null;
let syncInFlight = false;
let productSyncInFlight = false;
let productSyncQueued = false;
let bulkBatchInFlight = false;
let renderedTodayDateKey = getLocalDateKey();
let dailyMenuLastReview = [];
const modalScrollLock = {
  active: false,
  scrollY: 0,
  touchStartY: 0,
  bodyStyle: {},
};

const els = {
  sheetUrlInput: document.querySelector("#sheetUrlInput"),
  sheetNameInput: document.querySelector("#sheetNameInput"),
  saveSheetButton: document.querySelector("#saveSheetButton"),
  syncSheetButton: document.querySelector("#syncSheetButton"),
  autoSyncInput: document.querySelector("#autoSyncInput"),
  connectionCard: document.querySelector("#connectionCard"),
  connectionDot: document.querySelector("#connectionDot"),
  connectionText: document.querySelector("#connectionText"),
  lastSyncText: document.querySelector("#lastSyncText"),
  topbarConnectionDot: document.querySelector("#topbarConnectionDot"),
  topbarConnectionText: document.querySelector("#topbarConnectionText"),
  sidebarConnectionDot: document.querySelector("#sidebarConnectionDot"),
  sidebarConnectionText: document.querySelector("#sidebarConnectionText"),
  spreadsheetInput: document.querySelector("#spreadsheetInput"),
  importButton: document.querySelector("#importButton"),
  syncStatus: document.querySelector("#syncStatus"),
  syncModalStatus: document.querySelector("#syncModalStatus"),
  toastContainer: document.querySelector("#toastContainer"),
  nameColumnInput: document.querySelector("#nameColumnInput"),
  priceColumnInput: document.querySelector("#priceColumnInput"),
  stockColumnInput: document.querySelector("#stockColumnInput"),
  skuColumnInput: document.querySelector("#skuColumnInput"),
  itemForm: document.querySelector("#itemForm"),
  itemNameInput: document.querySelector("#itemNameInput"),
  itemPriceInput: document.querySelector("#itemPriceInput"),
  itemCategoryInput: document.querySelector("#itemCategoryInput"),
  itemStockInput: document.querySelector("#itemStockInput"),
  itemUnlimitedInput: document.querySelector("#itemUnlimitedInput"),
  itemSkuInput: document.querySelector("#itemSkuInput"),
  itemAliasInput: document.querySelector("#itemAliasInput"),
  addVariantButton: document.querySelector("#addVariantButton"),
  variantEditorList: document.querySelector("#variantEditorList"),
  itemSubmitButton: document.querySelector("#itemSubmitButton"),
  cancelEditProductButton: document.querySelector("#cancelEditProductButton"),
  dailyMenuTitle: document.querySelector("#dailyMenuTitle"),
  dailyMenuStatus: document.querySelector("#dailyMenuStatus"),
  showAllMenuButton: document.querySelector("#showAllMenuButton"),
  showTodayMenuButton: document.querySelector("#showTodayMenuButton"),
  openDailyMenuButton: document.querySelector("#openDailyMenuButton"),
  dailyMenuDateButton: document.querySelector("#dailyMenuDateButton"),
  dailyMenuDateText: document.querySelector("#dailyMenuDateText"),
  dailyMenuDateMeta: document.querySelector("#dailyMenuDateMeta"),
  dailyMenuDateInput: document.querySelector("#dailyMenuDateInput"),
  dailyMenuCalendarPopover: document.querySelector("#dailyMenuCalendarPopover"),
  dailyMenuCalendarTitle: document.querySelector("#dailyMenuCalendarTitle"),
  dailyMenuCalendarGrid: document.querySelector("#dailyMenuCalendarGrid"),
  previousDailyMenuMonthButton: document.querySelector("#previousDailyMenuMonthButton"),
  nextDailyMenuMonthButton: document.querySelector("#nextDailyMenuMonthButton"),
  dailyMenuTodayButton: document.querySelector("#dailyMenuTodayButton"),
  dailyMenuOnlyInput: document.querySelector("#dailyMenuOnlyInput"),
  dailyMenuFileInput: document.querySelector("#dailyMenuFileInput"),
  dailyMenuCsvInput: document.querySelector("#dailyMenuCsvInput"),
  applyDailyMenuButton: document.querySelector("#applyDailyMenuButton"),
  clearDailyMenuButton: document.querySelector("#clearDailyMenuButton"),
  dailyMenuReview: document.querySelector("#dailyMenuReview"),
  categoryFilter: document.querySelector("#categoryFilter"),
  productList: document.querySelector("#productList"),
  searchInput: document.querySelector("#searchInput"),
  cartList: document.querySelector("#cartList"),
  cartItemBadge: document.querySelector("#cartItemBadge"),
  clearCartButton: document.querySelector("#clearCartButton"),
  holdCartButton: document.querySelector("#holdCartButton"),
  openHeldCartsButton: document.querySelector("#openHeldCartsButton"),
  heldCartsModal: document.querySelector("#heldCartsModal"),
  heldCartList: document.querySelector("#heldCartList"),
  clearInventoryButton: document.querySelector("#clearInventoryButton"),
  completeSaleButton: document.querySelector("#completeSaleButton"),
  openSalesDashboardButton: document.querySelector("#openSalesDashboardButton"),
  salesDashboardModal: document.querySelector("#salesDashboardModal"),
  openCustomerDataButton: document.querySelector("#openCustomerDataButton"),
  customerDataModal: document.querySelector("#customerDataModal"),
  customerSearchInput: document.querySelector("#customerSearchInput"),
  customerTagFilter: document.querySelector("#customerTagFilter"),
  customerHygienePanel: document.querySelector("#customerHygienePanel"),
  customerDepositHint: document.querySelector("#customerDepositHint"),
  openPiutangButton: document.querySelector("#openPiutangButton"),
  piutangModal: document.querySelector("#piutangModal"),
  piutangSearchInput: document.querySelector("#piutangSearchInput"),
  piutangScrollArea: document.querySelector("#piutangScrollArea"),
  piutangList: document.querySelector("#piutangList"),
  piutangStatus: document.querySelector("#piutangStatus"),
  piutangTotalBadge: document.querySelector("#piutangTotalBadge"),
  refreshPiutangButton: document.querySelector("#refreshPiutangButton"),
  tabPiutangBelumLunas: document.querySelector("#tabPiutangBelumLunas"),
  tabPiutangLunas: document.querySelector("#tabPiutangLunas"),
  tabPiutangSemua: document.querySelector("#tabPiutangSemua"),
  customerScrollArea: document.querySelector("#customerScrollArea"),
  customerSimilarSection: document.querySelector("#customerSimilarSection"),
  customerSimilarList: document.querySelector("#customerSimilarList"),
  customerDataList: document.querySelector("#customerDataList"),
  customerDataStatus: document.querySelector("#customerDataStatus"),
  openAddCustomerButton: document.querySelector("#openAddCustomerButton"),
  addCustomerModal: document.querySelector("#addCustomerModal"),
  addCustomerForm: document.querySelector("#addCustomerForm"),
  addCustomerNameInput: document.querySelector("#addCustomerNameInput"),
  addCustomerTagInput: document.querySelector("#addCustomerTagInput"),
  addCustomerShippingInput: document.querySelector("#addCustomerShippingInput"),
  addCustomerDepositInput: document.querySelector("#addCustomerDepositInput"),
  addCustomerAliasesInput: document.querySelector("#addCustomerAliasesInput"),
  cancelAddCustomerButton: document.querySelector("#cancelAddCustomerButton"),
  refreshCustomersButton: document.querySelector("#refreshCustomersButton"),
  openPrinterSetupButton: document.querySelector("#openPrinterSetupButton"),
  openPrinterSetupFromSettingsButton: document.querySelector("#openPrinterSetupFromSettingsButton"),
  printerSetupModal: document.querySelector("#printerSetupModal"),
  printerSetupTestPrintButton: document.querySelector("#printerSetupTestPrintButton"),
  openInventoryModalButton: document.querySelector("#openInventoryModalButton"),
  inventoryModal: document.querySelector("#inventoryModal"),
  inventoryTabButtons: document.querySelectorAll("[data-inventory-tab]"),
  inventoryTabPanels: document.querySelectorAll("[data-inventory-panel]"),
  menuListTabButton: document.querySelector("#menuListTabButton"),
  menuListTabPanel: document.querySelector("#menuListTabPanel"),
  inventorySearchInput: document.querySelector("#inventorySearchInput"),
  inventoryProductsList: document.querySelector("#inventoryProductsList"),
  addNewMenuButton: document.querySelector("#addNewMenuButton"),
  openReceiptSettingsButton: document.querySelector("#openReceiptSettingsButton"),
  receiptSettingsModal: document.querySelector("#receiptSettingsModal"),
  openReceiptPreviewButton: document.querySelector("#openReceiptPreviewButton"),
  receiptPreviewModal: document.querySelector("#receiptPreviewModal"),
  openBulkImportButton: document.querySelector("#openBulkImportButton"),
  openBulkImportButtonTitle: document.querySelector("#openBulkImportButton .nav-copy strong"),
  themeToggleButton: document.querySelector("#themeToggleButton"),
  themeToggleTitle: document.querySelector("#themeToggleTitle"),
  themeToggleCopy: document.querySelector("#themeToggleCopy"),
  appSidebar: document.querySelector("#appSidebar"),
  sidebarMenuButton: document.querySelector("#sidebarMenuButton"),
  closeSidebarButton: document.querySelector("#closeSidebarButton"),
  sidebarOverlay: document.querySelector("#sidebarOverlay"),
  bulkImportModal: document.querySelector("#bulkImportModal"),
  bulkImportFileInput: document.querySelector("#bulkImportFileInput"),
  bulkSummaryInput: document.querySelector("#bulkSummaryInput"),
  bulkImportReview: document.querySelector("#bulkImportReview"),
  parseBulkSummaryButton: document.querySelector("#parseBulkSummaryButton"),
  clearBulkDraftsButton: document.querySelector("#clearBulkDraftsButton"),
  bulkBatchPanel: document.querySelector("#bulkBatchPanel"),
  bulkBatchReadyText: document.querySelector("#bulkBatchReadyText"),
  bulkBatchReviewText: document.querySelector("#bulkBatchReviewText"),
  processReadyDraftsButton: document.querySelector("#processReadyDraftsButton"),
  processPrintReadyDraftsButton: document.querySelector("#processPrintReadyDraftsButton"),
  previewPrintReadyDraftsButton: document.querySelector("#previewPrintReadyDraftsButton"),
  copyAiPromptButton: document.querySelector("#copyAiPromptButton"),
  bulkDraftList: document.querySelector("#bulkDraftList"),
  bulkFilterTabs: document.querySelector("#bulkFilterTabs"),
  bulkFilterAllCount: document.querySelector("#bulkFilterAllCount"),
  bulkFilterReviewCount: document.querySelector("#bulkFilterReviewCount"),
  bulkFilterReadyCount: document.querySelector("#bulkFilterReadyCount"),
  bulkImportStatus: document.querySelector("#bulkImportStatus"),
  bulkSearchLabel: document.querySelector("#bulkSearchLabel"),
  bulkSearchInput: document.querySelector("#bulkSearchInput"),
  bulkLoadingOverlay: document.querySelector("#bulkLoadingOverlay"),
  bulkLoadingProgressBar: document.querySelector("#bulkLoadingProgressBar"),
  bulkLoadingText: document.querySelector("#bulkLoadingText"),
  refreshSalesButton: document.querySelector("#refreshSalesButton"),
  previousSalesDateButton: document.querySelector("#previousSalesDateButton"),
  nextSalesDateButton: document.querySelector("#nextSalesDateButton"),
  todaySalesDateButton: document.querySelector("#todaySalesDateButton"),
  salesDateInput: document.querySelector("#salesDateInput"),
  salesStartDateInput: document.querySelector("#salesStartDateInput"),
  salesEndDateInput: document.querySelector("#salesEndDateInput"),
  salesStartDateButton: document.querySelector("#salesStartDateButton"),
  salesEndDateButton: document.querySelector("#salesEndDateButton"),
  salesStartDateText: document.querySelector("#salesStartDateText"),
  salesEndDateText: document.querySelector("#salesEndDateText"),
  salesStartDateMeta: document.querySelector("#salesStartDateMeta"),
  salesEndDateMeta: document.querySelector("#salesEndDateMeta"),
  salesCalendarPopover: document.querySelector("#salesCalendarPopover"),
  salesCalendarTitle: document.querySelector("#salesCalendarTitle"),
  salesCalendarGrid: document.querySelector("#salesCalendarGrid"),
  salesCalendarInfo: document.querySelector("#salesCalendarInfo"),
  previousSalesCalendarMonthButton: document.querySelector("#previousSalesCalendarMonthButton"),
  nextSalesCalendarMonthButton: document.querySelector("#nextSalesCalendarMonthButton"),
  salesRangeButtons: document.querySelectorAll("[data-sales-range]"),
  salesStatusButtons: document.querySelectorAll("[data-sales-status]"),
  salesSearchInput: document.querySelector("#salesSearchInput"),
  salesSortInput: document.querySelector("#salesSortInput"),
  salesDateLabel: document.querySelector("#salesDateLabel"),
  salesList: document.querySelector("#salesList"),
  salesPagination: document.querySelector("#salesPagination"),
  previousSalesPageButton: document.querySelector("#previousSalesPageButton"),
  nextSalesPageButton: document.querySelector("#nextSalesPageButton"),
  salesPageInfo: document.querySelector("#salesPageInfo"),
  selectedSalesText: document.querySelector("#selectedSalesText"),
  selectedRevenueText: document.querySelector("#selectedRevenueText"),
  selectedSalesLabel: document.querySelector("#selectedSalesLabel"),
  selectedRevenueLabel: document.querySelector("#selectedRevenueLabel"),
  totalSalesText: document.querySelector("#totalSalesText"),
  dailyAverageText: document.querySelector("#dailyAverageText"),
  dailyPaymentBreakdown: document.querySelector("#dailyPaymentBreakdown"),
  dailyItemTotals: document.querySelector("#dailyItemTotals"),
  dailyCourierShipping: document.querySelector("#dailyCourierShipping"),
  dailyReportSection: document.querySelector("#dailyReportSection"),
  printDailyReportButton: document.querySelector("#printDailyReportButton"),
  exportDailyReportButton: document.querySelector("#exportDailyReportButton"),
  exportAllSalesButton: document.querySelector("#exportAllSalesButton"),
  backupDatabaseButton: document.querySelector("#backupDatabaseButton"),
  restoreDatabaseButton: document.querySelector("#restoreDatabaseButton"),
  restoreDatabaseInput: document.querySelector("#restoreDatabaseInput"),
  backupFullAppButton: document.querySelector("#backupFullAppButton"),
  restoreFullAppButton: document.querySelector("#restoreFullAppButton"),
  restoreFullAppInput: document.querySelector("#restoreFullAppInput"),
  databaseStatus: document.querySelector("#databaseStatus"),
  deleteSaleModal: document.querySelector("#deleteSaleModal"),
  deleteSaleMessage: document.querySelector("#deleteSaleMessage"),
  restoreStockOnDeleteInput: document.querySelector("#restoreStockOnDeleteInput"),
  cancelDeleteSaleButton: document.querySelector("#cancelDeleteSaleButton"),
  confirmDeleteSaleButton: document.querySelector("#confirmDeleteSaleButton"),
  deleteProductModal: document.querySelector("#deleteProductModal"),
  deleteProductMessage: document.querySelector("#deleteProductMessage"),
  cancelDeleteProductButton: document.querySelector("#cancelDeleteProductButton"),
  confirmDeleteProductButton: document.querySelector("#confirmDeleteProductButton"),
  appConfirmModal: document.querySelector("#appConfirmModal"),
  appConfirmEyebrow: document.querySelector("#appConfirmEyebrow"),
  appConfirmTitle: document.querySelector("#appConfirmTitle"),
  appConfirmMessage: document.querySelector("#appConfirmMessage"),
  appConfirmNote: document.querySelector("#appConfirmNote"),
  cancelAppConfirmButton: document.querySelector("#cancelAppConfirmButton"),
  confirmAppConfirmButton: document.querySelector("#confirmAppConfirmButton"),
  saleDetailModal: document.querySelector("#saleDetailModal"),
  saleDetailTitle: document.querySelector("#saleDetailTitle"),
  saleDetailBody: document.querySelector("#saleDetailBody"),
  editSaleDetailButton: document.querySelector("#editSaleDetailButton"),
  printSaleDetailButton: document.querySelector("#printSaleDetailButton"),
  printReceiptButton: document.querySelector("#printReceiptButton"),
  customerNameInput: document.querySelector("#customerNameInput"),
  customerProfileHint: document.querySelector("#customerProfileHint"),
  customerSuggestions: document.querySelector("#customerSuggestions"),
  shippingInput: document.querySelector("#shippingInput"),
  paymentInput: document.querySelector("#paymentInput"),
  paymentSelect: document.querySelector("#paymentSelect"),
  paymentSelectButton: document.querySelector("#paymentSelectButton"),
  paymentOptions: document.querySelector("#paymentOptions"),
  paymentOptionButtons: document.querySelectorAll("[data-payment-option]"),
  paymentSelectedIcon: document.querySelector("#paymentSelectedIcon"),
  paymentSelectedText: document.querySelector("#paymentSelectedText"),
  mobileMiniCartButton: document.querySelector("#mobileMiniCartButton"),
  mobileMiniCartCount: document.querySelector("#mobileMiniCartCount"),
  mobileMiniCartTotal: document.querySelector("#mobileMiniCartTotal"),
  subtotalText: document.querySelector("#subtotalText"),
  shippingText: document.querySelector("#shippingText"),
  totalText: document.querySelector("#totalText"),
  checkoutDepositRow: document.querySelector("#checkoutDepositRow"),
  depositText: document.querySelector("#depositText"),
  checkoutValidation: document.querySelector("#checkoutValidation"),
  storeNameInput: document.querySelector("#storeNameInput"),
  storeAddressInput: document.querySelector("#storeAddressInput"),
  footerInput: document.querySelector("#footerInput"),
  receiptWidthInput: document.querySelector("#receiptWidthInput"),
  receiptFontSizeInput: document.querySelector("#receiptFontSizeInput"),
  printFlowInput: document.querySelector("#printFlowInput"),
  receiptModeInput: document.querySelector("#receiptModeInput"),
  autoPrintInput: document.querySelector("#autoPrintInput"),
  testPrintButton: document.querySelector("#testPrintButton"),
  printPreviewButton: document.querySelector("#printPreviewButton"),
  inventoryReviewPanel: document.querySelector("#inventoryReviewPanel"),
  inventoryReviewTitle: document.querySelector("#inventoryReviewTitle"),
  inventoryReviewCopy: document.querySelector("#inventoryReviewCopy"),
  mergeDuplicateProductsButton: document.querySelector("#mergeDuplicateProductsButton"),
  receiptPaper: document.querySelector("#receiptPaper"),
  printArea: document.querySelector("#printArea"),
};

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;

  try {
    const parsed = JSON.parse(saved);
    const savedSettings = parsed.settings && typeof parsed.settings === "object" ? parsed.settings : {};
    const hasThermalPrinterDefault = Object.prototype.hasOwnProperty.call(savedSettings, "thermalPrinterDefaulted");
    state.products = normalizeProductsCollection(Array.isArray(parsed.products) ? parsed.products : []);
    state.cart = Array.isArray(parsed.cart) ? parsed.cart : [];
    state.settings = { ...state.settings, ...savedSettings };
    if (state.settings.storeName === "Kasir Bento" || state.settings.storeName === "Kasir Shanti Catering") state.settings.storeName = "Shanti Catering";
    if (state.settings.storeAddress === "Jl. Contoh No. 12, Jakarta") state.settings.storeAddress = "BHASKARA III / 38";
    if (state.settings.footer === "Terima kasih sudah berbelanja") state.settings.footer = "== TERIMA KASIH ==";
    if (!hasThermalPrinterDefault && state.settings.receiptWidth === "80") state.settings.receiptWidth = "58";
    if (!["58", "80"].includes(String(state.settings.receiptWidth))) state.settings.receiptWidth = "58";
    if (state.settings.receiptFontSize === "medium") state.settings.receiptFontSize = "large";
    if (!["small", "medium", "large"].includes(state.settings.receiptFontSize)) state.settings.receiptFontSize = "large";
    if (!["direct", "preview"].includes(state.settings.printFlow)) state.settings.printFlow = "direct";
    if (state.settings.receiptMode === "compact") state.settings.receiptMode = "complete";
    if (!["compact", "complete"].includes(state.settings.receiptMode)) state.settings.receiptMode = "complete";
    if (!["light", "dark"].includes(state.settings.theme)) state.settings.theme = "light";
    state.settings.dbMode = "supabase";
    state.settings.autoPrint = state.settings.autoPrint !== false;
    state.settings.thermalPrinterDefaulted = true;
    const savedSale = parsed.sale && typeof parsed.sale === "object" ? parsed.sale : {};
    state.sale = normalizeSaleContact({ ...state.sale, ...savedSale });
    if (!Object.prototype.hasOwnProperty.call(savedSale, "shipping") && Object.prototype.hasOwnProperty.call(savedSale, "discount")) {
      state.sale.shipping = Math.max(0, Number(savedSale.discount) || 0);
    }
    if (state.sale.payment === "Cash") state.sale.payment = "Tunai";
    state.sync = { ...state.sync, ...parsed.sync };
    if (!state.sync.sheetUrl) {
      state.sync.sheetUrl = "https://docs.google.com/spreadsheets/d/183BZtWGEj0JRE7qjTk1jXBnVFbz_oMti7tR2dkisJsc/edit?gid=0#gid=0";
    }
    if (!state.sync.sheetName) {
      state.sync.sheetName = "Menu";
    }
    state.columns = { ...state.columns, ...parsed.columns };
    if (state.columns.name === "name") state.columns.name = "nama";
    if (state.columns.price === "price") state.columns.price = "harga";
    if (state.columns.stock === "stock") state.columns.stock = "stok";
    state.heldCarts = Array.isArray(parsed.heldCarts) ? parsed.heldCarts : [];
    state.importDrafts = Array.isArray(parsed.importDrafts) ? parsed.importDrafts.map(normalizeDraftContact) : [];
    state.selectedCategory = typeof parsed.selectedCategory === "string" ? parsed.selectedCategory : "all";
    state.salesSearch = typeof parsed.salesSearch === "string" ? parsed.salesSearch : "";
    const parsedSalesRange = String(parsed.salesRange || "day");
    state.salesRange = parsedSalesRange === "7" ? "week" : parsedSalesRange === "30" ? "custom" : ["day", "week", "all", "custom"].includes(parsedSalesRange) ? parsedSalesRange : "day";
    state.salesStatus = ["active", "deleted", "all"].includes(String(parsed.salesStatus)) ? String(parsed.salesStatus) : "active";
    state.salesSort = ["newest", "oldest"].includes(String(parsed.salesSort)) ? String(parsed.salesSort) : "newest";
    state.salesPage = Math.max(1, Number.parseInt(parsed.salesPage, 10) || 1);
    state.salesDate = typeof parsed.salesDate === "string" ? parsed.salesDate : state.salesDate;
    state.salesStartDate = typeof parsed.salesStartDate === "string" ? parsed.salesStartDate : state.salesDate;
    state.salesEndDate = typeof parsed.salesEndDate === "string" ? parsed.salesEndDate : state.salesDate;
    if (parsed.dailyMenu && typeof parsed.dailyMenu === "object") {
      const dailyMenuDate = typeof parsed.dailyMenu.date === "string" ? parsed.dailyMenu.date : getLocalDateKey();
      const legacyProductIds = Array.isArray(parsed.dailyMenu.productIds) ? parsed.dailyMenu.productIds.map(String) : [];
      const menusByDate = {};
      if (parsed.dailyMenu.menusByDate && typeof parsed.dailyMenu.menusByDate === "object") {
        Object.entries(parsed.dailyMenu.menusByDate).forEach(([dateKey, productIds]) => {
          if (!Array.isArray(productIds)) return;
          menusByDate[dateKey] = productIds.map(String);
        });
      }
      if (legacyProductIds.length && !menusByDate[dailyMenuDate]) {
        menusByDate[dailyMenuDate] = legacyProductIds;
      }
      state.dailyMenu = {
        ...state.dailyMenu,
        date: dailyMenuDate,
        productIds: menusByDate[dailyMenuDate] || legacyProductIds,
        menusByDate,
        onlyToday: Boolean(parsed.dailyMenu.onlyToday),
        lastImportAt: typeof parsed.dailyMenu.lastImportAt === "string" ? parsed.dailyMenu.lastImportAt : "",
      };
    }
    state.lastReceipt = parsed.lastReceipt && typeof parsed.lastReceipt === "object" ? parsed.lastReceipt : null;
    sanitizeCart();
  } catch (error) {
    console.warn("Data kasir tersimpan tidak bisa dibuka", error);
  }
}

function getLocalStateSnapshot() {
  return {
    products: state.products,
    cart: state.cart,
    settings: state.settings,
    sale: state.sale,
    sync: state.sync,
    columns: state.columns,
    salesSearch: state.salesSearch,
    salesRange: state.salesRange,
    salesStatus: state.salesStatus,
    salesSort: state.salesSort,
    salesPage: state.salesPage,
    salesDate: state.salesDate,
    salesStartDate: state.salesStartDate,
    salesEndDate: state.salesEndDate,
    selectedCategory: state.selectedCategory,
    dailyMenu: state.dailyMenu,
    heldCarts: state.heldCarts,
    importDrafts: state.importDrafts,
    lastReceipt: state.lastReceipt,
  };
}

function saveState() {
  const snapshot = getLocalStateSnapshot();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

function getActiveTheme() {
  return state.settings.theme === "dark" ? "dark" : "light";
}

function applyTheme() {
  const theme = getActiveTheme();
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0f1f1c" : "#0f766e");

  if (els.themeToggleButton) {
    const label = theme === "dark" ? "Aktifkan mode terang" : "Aktifkan mode gelap";
    const title = theme === "dark" ? "Mode Terang" : "Mode Gelap";
    const copy = theme === "dark" ? "Balik terang untuk siang hari." : "Nyaman untuk shift malam.";
    els.themeToggleButton.setAttribute("aria-label", label);
    els.themeToggleButton.setAttribute("title", label);
    els.themeToggleButton.setAttribute("aria-pressed", String(theme === "dark"));
    if (els.themeToggleTitle) els.themeToggleTitle.textContent = title;
    if (els.themeToggleCopy) els.themeToggleCopy.textContent = copy;
  }
}

function toggleTheme() {
  state.settings.theme = getActiveTheme() === "dark" ? "light" : "dark";
  applyTheme();
  saveState();
  showToast(`Mode ${state.settings.theme === "dark" ? "gelap" : "terang"} aktif.`);
}

function isSidebarOpen() {
  return document.body.classList.contains("sidebar-open");
}

function openSidebar() {
  document.body.classList.add("sidebar-open");
  els.sidebarMenuButton?.setAttribute("aria-expanded", "true");
  lockPageScroll();
  requestAnimationFrame(() => els.appSidebar?.querySelector("button")?.focus());
}

function closeSidebar() {
  if (!isSidebarOpen()) return;
  document.body.classList.remove("sidebar-open");
  els.sidebarMenuButton?.setAttribute("aria-expanded", "false");
  updateModalScrollLock();
}

function toggleSidebar() {
  if (isSidebarOpen()) closeSidebar();
  else openSidebar();
}

function hasOpenDialog() {
  return Boolean(document.querySelector("dialog[open]"));
}

function lockPageScroll() {
  if (modalScrollLock.active) return;

  modalScrollLock.active = true;
  modalScrollLock.scrollY = window.scrollY || document.documentElement.scrollTop || 0;
  modalScrollLock.bodyStyle = {
    position: document.body.style.position,
    top: document.body.style.top,
    left: document.body.style.left,
    right: document.body.style.right,
    width: document.body.style.width,
    overflow: document.body.style.overflow,
  };

  document.documentElement.classList.add("modal-open");
  document.body.classList.add("modal-open");
  document.body.style.position = "fixed";
  document.body.style.top = `-${modalScrollLock.scrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
  document.body.style.overflow = "hidden";
}

function unlockPageScroll() {
  if (!modalScrollLock.active) return;

  const restoreY = modalScrollLock.scrollY;
  document.documentElement.classList.remove("modal-open");
  document.body.classList.remove("modal-open");
  Object.entries(modalScrollLock.bodyStyle).forEach(([property, value]) => {
    document.body.style[property] = value || "";
  });
  modalScrollLock.active = false;
  modalScrollLock.scrollY = 0;
  modalScrollLock.bodyStyle = {};
  window.scrollTo(0, restoreY);
}

function updateModalScrollLock() {
  if (hasOpenDialog() || isSidebarOpen()) lockPageScroll();
  else unlockPageScroll();
}

function getTopOpenDialog() {
  const dialogs = [...document.querySelectorAll("dialog[open]")];
  return dialogs.at(-1) || null;
}

function getEventElement(target) {
  return target instanceof Element ? target : target?.parentElement || null;
}

function getModalScrollPanel(target, dialog) {
  const element = getEventElement(target);
  if (!element || !dialog.contains(element)) return null;

  let current = element;
  while (current && current !== dialog && dialog.contains(current)) {
    const style = window.getComputedStyle(current);
    const canScrollY = /(auto|scroll)/.test(style.overflowY) && current.scrollHeight > current.clientHeight + 1;
    if (canScrollY) return current;
    current = current.parentElement;
  }

  const panel = element.closest(".modal-panel");
  return panel && dialog.contains(panel) ? panel : null;
}

function shouldBlockModalScroll(target, deltaY = 0) {
  const dialog = getTopOpenDialog();
  if (!dialog) return false;

  const element = getEventElement(target);
  if (!element || !dialog.contains(element)) return true;

  const panel = getModalScrollPanel(element, dialog);
  if (!panel) return true;

  const canScroll = panel.scrollHeight > panel.clientHeight + 1;
  if (!canScroll) return true;

  const atTop = panel.scrollTop <= 0;
  const atBottom = Math.ceil(panel.scrollTop + panel.clientHeight) >= panel.scrollHeight;
  return (deltaY < 0 && atTop) || (deltaY > 0 && atBottom);
}

function handleModalWheel(event) {
  if (shouldBlockModalScroll(event.target, event.deltaY)) {
    event.preventDefault();
  }
}

function handleModalTouchStart(event) {
  modalScrollLock.touchStartY = event.touches?.[0]?.clientY || 0;
}

function handleModalTouchMove(event) {
  const currentY = event.touches?.[0]?.clientY || modalScrollLock.touchStartY;
  const deltaY = modalScrollLock.touchStartY - currentY;
  if (shouldBlockModalScroll(event.target, deltaY)) {
    event.preventDefault();
  }
}

function setupModalScrollLock() {
  const dialogs = document.querySelectorAll("dialog");
  dialogs.forEach((dialog) => {
    dialog.addEventListener("close", () => requestAnimationFrame(() => {
      updateModalScrollLock();
      updateSidebarActiveState();
      refreshToastLayer();
    }));
    dialog.addEventListener("cancel", () => requestAnimationFrame(() => {
      updateModalScrollLock();
      updateSidebarActiveState();
      refreshToastLayer();
    }));
    new MutationObserver(() => {
      updateModalScrollLock();
      updateSidebarActiveState();
      refreshToastLayer();
    }).observe(dialog, {
      attributes: true,
      attributeFilter: ["open"],
    });
  });
  document.addEventListener("wheel", handleModalWheel, { passive: false, capture: true });
  document.addEventListener("touchstart", handleModalTouchStart, { passive: true, capture: true });
  document.addEventListener("touchmove", handleModalTouchMove, { passive: false, capture: true });
  updateModalScrollLock();
}

function openModal(dialog, focusTarget) {
  if (!dialog) return;
  lockPageScroll();
  dialog.showModal();
  updateModalScrollLock();
  updateSidebarActiveState();
  refreshToastLayer({ toFront: true });
  if (focusTarget) {
    requestAnimationFrame(() => focusTarget.focus());
  }
}

function resolveAppConfirm(confirmed = false) {
  const pending = state.pendingAppConfirm;
  state.pendingAppConfirm = null;
  if (pending?.resolve) pending.resolve(Boolean(confirmed));
}

function closeAppConfirm(confirmed = false) {
  resolveAppConfirm(confirmed);
  if (els.appConfirmModal?.open) els.appConfirmModal.close();
}

function openAppConfirm(options = {}) {
  if (!els.appConfirmModal) return Promise.resolve(false);

  const {
    eyebrow = "Konfirmasi",
    title = "Lanjutkan?",
    message = "Yakin mau lanjut?",
    note = "",
    confirmText = "Ya, lanjut",
    cancelText = "Batal",
    variant = "default",
  } = options;

  if (state.pendingAppConfirm) closeAppConfirm(false);

  if (els.appConfirmEyebrow) els.appConfirmEyebrow.textContent = eyebrow;
  if (els.appConfirmTitle) els.appConfirmTitle.textContent = title;
  if (els.appConfirmMessage) els.appConfirmMessage.textContent = message;
  if (els.appConfirmNote) {
    els.appConfirmNote.textContent = note;
    els.appConfirmNote.hidden = !note;
  }
  if (els.cancelAppConfirmButton) els.cancelAppConfirmButton.textContent = cancelText;
  if (els.confirmAppConfirmButton) {
    els.confirmAppConfirmButton.textContent = confirmText;
    els.confirmAppConfirmButton.classList.toggle("danger-button", variant === "danger");
  }

  return new Promise((resolve) => {
    state.pendingAppConfirm = { resolve };
    openModal(els.appConfirmModal, els.cancelAppConfirmButton);
  });
}

function updateSidebarActiveState() {
  const navItems = [
    [els.openBulkImportButton, els.bulkImportModal],
    [els.openSalesDashboardButton, els.salesDashboardModal],
    [els.openCustomerDataButton, els.customerDataModal],
    [els.openPiutangButton, els.piutangModal],
    [els.openReceiptSettingsButton, els.receiptSettingsModal],
    [els.openPrinterSetupButton, els.printerSetupModal],
  ];

  navItems.forEach(([button, dialog]) => {
    if (!button) return;
    const active = Boolean(dialog?.open);
    button.classList.toggle("active", active);
    if (active) {
      button.setAttribute("aria-current", "true");
    } else {
      button.removeAttribute("aria-current");
    }
  });
}

function normalizeSaleContact(sale) {
  const customer = String(sale?.customerName || sale?.customer_name || "").trim();
  const address = String(sale?.customerAddress || sale?.customer_address || "").trim();
  return {
    ...sale,
    customerName: address || customer,
    customerAddress: "",
    dueText: "",
    orderNote: "",
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function deliveryIconHtml() {
  return `<svg class="delivery-icon" aria-hidden="true" focusable="false"><use href="#icon-delivery-rider"></use></svg>`;
}

function shippingLabelHtml(text = "Ongkir") {
  return `<span class="shipping-label">${deliveryIconHtml()}<span>${escapeHtml(text)}</span></span>`;
}

function normalizeKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function debounce(callback, delay = 180) {
  let timeoutId;
  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => callback(...args), delay);
  };
}

function cleanSingleAlias(item) {
  let alias = item;
  if (typeof alias === "string") {
    alias = alias.trim();
    while (typeof alias === "string" && ((alias.startsWith("[") && alias.endsWith("]")) || (alias.startsWith('"') && alias.endsWith('"')) || (alias.startsWith("'") && alias.endsWith("'")))) {
      try {
        const parsed = JSON.parse(alias);
        alias = parsed;
      } catch (e) {
        const old = alias;
        alias = alias.replace(/^["'\[]+|["'\]]+$/g, "").trim();
        if (alias === old) break;
      }
    }
  }
  return alias;
}

function parseAliasList(value) {
  let rawItems = value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        rawItems = JSON.parse(trimmed);
      } catch (e) {
        rawItems = trimmed.split(/[,\n;]+/);
      }
    } else {
      rawItems = trimmed.split(/[,\n;]+/);
    }
  } else if (!Array.isArray(value)) {
    rawItems = [];
  }

  const aliases = [];
  const seen = new Set();

  const addAlias = (item) => {
    const cleaned = cleanSingleAlias(item);
    if (Array.isArray(cleaned)) {
      cleaned.forEach(addAlias);
      return;
    }
    const aliasStr = String(cleaned ?? "").trim();
    const key = normalizeKey(aliasStr);
    if (!aliasStr || seen.has(key) || aliasStr === "[]" || aliasStr === "{}" || aliasStr.match(/^[\[\]"' ]+$/)) return;
    seen.add(key);
    aliases.push(aliasStr);
  };

  rawItems.forEach(addAlias);
  return aliases;
}

function isCustomerTagAlias(alias) {
  return String(alias ?? "").trim().toLowerCase().startsWith(CUSTOMER_TAG_ALIAS_PREFIX);
}

function getCustomerTagFromAlias(alias) {
  const text = String(alias ?? "").trim();
  if (!isCustomerTagAlias(text)) return "";
  return text.slice(CUSTOMER_TAG_ALIAS_PREFIX.length).trim();
}

function makeCustomerTagAlias(tag) {
  return `${CUSTOMER_TAG_ALIAS_PREFIX}${String(tag ?? "").trim()}`;
}

function getCustomerTagAliasKey(customerId) {
  return `tagalamat${normalizeKey(customerId)}`;
}

function splitCustomerTagAliases(aliases) {
  let tag = "";
  const visibleAliases = [];
  parseAliasList(aliases).forEach((alias) => {
    const aliasTag = getCustomerTagFromAlias(alias);
    if (aliasTag) {
      tag = aliasTag;
      return;
    }
    visibleAliases.push(alias);
  });
  return { aliases: visibleAliases, tag };
}

function mergeAliasLists(...values) {
  return parseAliasList(values.flatMap((value) => parseAliasList(value)));
}

function getProductAliases(product) {
  return parseAliasList(product?.aliases ?? product?.alias ?? product?.menuAliases ?? product?.menu_aliases ?? "");
}

function getProductMatchTerms(product) {
  return [product?.name || "", ...getProductAliases(product)].filter(Boolean);
}

function productMatchesName(product, normalizedName) {
  if (!normalizedName) return false;
  return getProductMatchTerms(product).some((term) => normalizeKey(term) === normalizedName);
}

function productContainsName(product, normalizedName) {
  if (!normalizedName) return false;
  return getProductMatchTerms(product).some((term) => {
    const key = normalizeKey(term);
    return key.includes(normalizedName) || normalizedName.includes(key);
  });
}

function normalizeSearchWords(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
}

function getProductSearchValues(product) {
  const variantValues = getProductVariants(product).flatMap((variant) => [
    variant.name,
    variant.receiptLabel,
    variant.unitName,
    ...(Array.isArray(variant.aliases) ? variant.aliases : []),
  ]);
  return [
    product?.name || "",
    product?.sku || "",
    getProductCategory(product),
    ...getProductAliases(product),
    ...variantValues,
  ].filter(Boolean);
}

function getProductSearchIndex(product) {
  const values = getProductSearchValues(product);
  const words = new Set();
  values.forEach((value) => {
    normalizeSearchWords(value).forEach((word) => words.add(normalizeKey(word)));
    const compact = normalizeKey(value);
    if (compact) words.add(compact);
  });

  return {
    fullKey: normalizeKey(values.join(" ")),
    words: [...words].filter(Boolean),
  };
}

function boundedEditDistance(left, right, limit = 2) {
  if (left === right) return 0;
  if (!left || !right) return limit + 1;
  if (Math.abs(left.length - right.length) > limit) return limit + 1;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    let rowMin = current[0];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      const value = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + substitutionCost
      );
      current[rightIndex] = value;
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > limit) return limit + 1;
    previous = current;
  }
  return previous[right.length];
}

function getLooseWordKey(value) {
  return normalizeKey(value).replace(/[aiueo]/g, "");
}

function getSearchWordScore(queryWord, index) {
  if (!queryWord) return 0;
  if (index.fullKey.includes(queryWord)) return 12;

  let bestScore = 0;
  index.words.forEach((word) => {
    if (!word) return;
    if (word === queryWord) {
      bestScore = Math.max(bestScore, 20);
    } else if (word.startsWith(queryWord) || queryWord.startsWith(word)) {
      bestScore = Math.max(bestScore, 14);
    } else if (word.includes(queryWord) || queryWord.includes(word)) {
      bestScore = Math.max(bestScore, 10);
    } else if (queryWord.length >= 4 && word.length >= 4) {
      const typoLimit = Math.max(queryWord.length, word.length) <= 5 ? 1 : 2;
      const distance = boundedEditDistance(queryWord, word, typoLimit);
      if (distance <= typoLimit) bestScore = Math.max(bestScore, 7 - distance);
    } else if (queryWord.length >= 3 && word.length >= 4) {
      const queryLoose = getLooseWordKey(queryWord);
      const wordLoose = getLooseWordKey(word);
      if (queryLoose.length >= 3 && wordLoose.length >= 3) {
        if (wordLoose.includes(queryLoose) || boundedEditDistance(queryLoose, wordLoose, 1) <= 1) {
          bestScore = Math.max(bestScore, 6);
        }
      }
    }
  });

  return bestScore;
}

function getProductSearchScore(product, rawQuery) {
  const queryWords = normalizeSearchWords(rawQuery).map(normalizeKey).filter(Boolean);
  if (!queryWords.length) return 1;

  const index = getProductSearchIndex(product);
  const fullQuery = normalizeKey(rawQuery);
  if (fullQuery && index.fullKey.includes(fullQuery)) return 100 + fullQuery.length;

  let score = 0;
  for (const queryWord of queryWords) {
    const wordScore = getSearchWordScore(queryWord, index);
    if (!wordScore) return 0;
    score += wordScore;
  }
  return score;
}

function productPriceMatches(product, price) {
  const targetPrice = Number(price || 0);
  if (targetPrice <= 0) return false;
  return Number(product?.price || 0) === targetPrice || getProductVariants(product).some((variant) => Number(variant.price || 0) === targetPrice);
}

function getColumnSettings() {
  return {
    name: normalizeKey(els.nameColumnInput.value || state.columns.name || "nama"),
    price: normalizeKey(els.priceColumnInput.value || state.columns.price || "harga"),
    stock: normalizeKey(els.stockColumnInput.value || state.columns.stock || "stok"),
    sku: normalizeKey(els.skuColumnInput.value || state.columns.sku || "sku"),
  };
}

function saveColumnSettings() {
  state.columns = {
    name: els.nameColumnInput.value.trim() || "nama",
    price: els.priceColumnInput.value.trim() || "harga",
    stock: els.stockColumnInput.value.trim() || "stok",
    sku: els.skuColumnInput.value.trim() || "sku",
  };
}

function formatSyncTime(value) {
  if (!value) return "Belum pernah sinkron";
  return `Terakhir sinkron ${new Date(value).toLocaleString("id-ID")}`;
}

function getToastVariant(message, fallback = "info") {
  const normalized = normalizeKey(message);
  if (/(gagal|error|tidak|belum|kosong|valid|hilang|dilewati|offline)/.test(normalized)) return "error";
  if (/(selesai|tersimpan|berhasil|sudah|masuk|diexport|aktif|dibuka)/.test(normalized)) return "success";
  return fallback;
}

function getActiveDialog() {
  return Array.from(document.querySelectorAll("dialog[open]")).at(-1) || null;
}

const toastTimers = new WeakMap();
const activeToastBySignature = new Map();

function isToastPopoverOpen(container = els.toastContainer) {
  return Boolean(container?.matches?.(":popover-open"));
}

function getToastSignature(title, text, variant) {
  return `${variant}::${title}::${text}`;
}

function clearToastTimers(toast) {
  const timers = toastTimers.get(toast);
  if (!timers) return;
  if (timers.hide) window.clearTimeout(timers.hide);
  if (timers.remove) window.clearTimeout(timers.remove);
  toastTimers.delete(toast);
}

function mountToastLayer(options = {}) {
  const container = els.toastContainer;
  if (!container) return;
  if (!container.children.length) {
    releaseToastLayer();
    return;
  }

  const activeDialog = getActiveDialog();
  container.hidden = false;
  container.classList.add("has-toast");
  container.classList.toggle("is-dialog-mounted", Boolean(activeDialog));
  if (!container.hasAttribute("popover")) {
    container.setAttribute("popover", "manual");
  }

  if (typeof container.showPopover === "function" && typeof container.hidePopover === "function") {
    try {
      if (options.toFront && isToastPopoverOpen(container)) container.hidePopover();
      if (!isToastPopoverOpen(container)) container.showPopover();
      container.classList.remove("is-popover-fallback");
      return;
    } catch (error) {
      try {
        container.hidePopover();
      } catch (hideError) {
        // The fallback below will keep the toast visible inside the active modal.
      }
      container.removeAttribute("popover");
    }
  }

  const host = activeDialog || document.body;
  if (container.parentElement !== host) host.append(container);
  container.classList.toggle("is-dialog-mounted", Boolean(activeDialog));
  container.classList.add("is-popover-fallback");
}

function releaseToastLayer() {
  const container = els.toastContainer;
  if (!container) return;
  if (container.children.length) {
    container.hidden = false;
    return;
  }

  if (typeof container.hidePopover === "function") {
    try {
      container.hidePopover();
    } catch (error) {
      // Keep the container mounted; the next toast will refresh the layer.
    }
  }

  container.removeAttribute("popover");
  if (container.parentElement !== document.body) {
    document.body.append(container);
  }
  container.classList.remove("has-toast", "is-dialog-mounted", "is-popover-fallback");
  container.hidden = true;
}

function refreshToastLayer(options = {}) {
  if (!els.toastContainer?.children.length) {
    releaseToastLayer();
    return;
  }
  mountToastLayer(options);
}

function dismissToast(toast) {
  if (!toast) return;
  const signature = toast.dataset.toastSignature;
  if (signature && activeToastBySignature.get(signature) === toast) {
    activeToastBySignature.delete(signature);
  }
  clearToastTimers(toast);
  toast.classList.remove("show", "toast-pulse");
  const remove = window.setTimeout(() => {
    toast.remove();
    releaseToastLayer();
  }, 220);
  toastTimers.set(toast, { remove });
}

function armToastTimer(toast, duration) {
  clearToastTimers(toast);
  const hide = window.setTimeout(() => dismissToast(toast), duration);
  toastTimers.set(toast, { hide });
}

function showToast(message, options = {}) {
  const text = String(message || "").trim();
  if (!text || !els.toastContainer) return;

  const variant = options.variant || getToastVariant(text);
  const title = options.title || (variant === "error" ? "Perlu dicek" : "Notifikasi");
  const duration = Number(options.duration) > 0 ? Number(options.duration) : 3200;
  const signature = getToastSignature(title, text, variant);
  const existingToast = activeToastBySignature.get(signature);
  if (existingToast?.isConnected) {
    existingToast.classList.remove("toast-pulse");
    void existingToast.offsetWidth;
    existingToast.classList.add("show", "toast-pulse");
    refreshToastLayer({ toFront: true });
    armToastTimer(existingToast, duration);
    return;
  }

  const toast = document.createElement("div");
  toast.className = `toast ${variant}`;
  toast.dataset.toastSignature = signature;
  toast.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span>`;
  activeToastBySignature.set(signature, toast);
  els.toastContainer.append(toast);
  refreshToastLayer({ toFront: true });

  requestAnimationFrame(() => toast.classList.add("show"));
  armToastTimer(toast, duration);
}

function setSyncStatus(message, options = {}) {
  state.sync.lastSyncMessage = message;
  els.syncStatus.textContent = message;
  if (els.syncModalStatus) els.syncModalStatus.textContent = message;
  if (options.toast !== false) showToast(message, options);
}

function setDatabaseStatus(message, options = {}) {
  els.databaseStatus.textContent = message;
  if (options.toast !== false) showToast(message, options);
}

function makeReceiptNumber(date = new Date()) {
  const dateKey = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `SH-${dateKey}-DRAFT`;
}

function isSameLocalDate(value, dateKey) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return getLocalDateKey(date) === dateKey;
}

function getSaleDateKey(sale) {
  const receiptMatch = String(sale?.receipt_no || sale?.receiptNo || "").match(/(?:^|-)(\d{8})(?:-|$)/);
  if (receiptMatch) {
    return `${receiptMatch[1].slice(0, 4)}-${receiptMatch[1].slice(4, 6)}-${receiptMatch[1].slice(6, 8)}`;
  }

  const date = new Date(sale?.completed_at || sale?.completedAt || sale?.created_at || "");
  if (Number.isNaN(date.getTime())) return "";
  return getLocalDateKey(date);
}

function addDaysToDateKey(dateKey, days) {
  const date = parseLocalDateKey(dateKey || getLocalDateKey());
  date.setDate(date.getDate() + days);
  return getLocalDateKey(date);
}

function compareDateKeys(left, right) {
  return String(left || "").localeCompare(String(right || ""));
}

function normalizeDateRange(startDate, endDate) {
  let start = startDate || getLocalDateKey();
  let end = endDate || start;
  if (compareDateKeys(start, end) > 0) [start, end] = [end, start];
  return { start, end };
}

function getAllSalesDateRange() {
  const dates = state.sales
    .filter(saleMatchesStatus)
    .map(getSaleDateKey)
    .filter(Boolean)
    .sort(compareDateKeys);
  if (!dates.length) {
    const today = getLocalDateKey();
    return { start: today, end: today };
  }
  return { start: dates[0], end: dates[dates.length - 1] };
}

function getSalesRangeDates() {
  if (state.salesRange === "all") {
    return getAllSalesDateRange();
  }

  if (state.salesRange === "week" || state.salesRange === "7" || state.salesRange === "30") {
    const days = state.salesRange === "week" ? 7 : Number(state.salesRange);
    const end = state.salesEndDate || state.salesDate || getLocalDateKey();
    return normalizeDateRange(addDaysToDateKey(end, -(days - 1)), end);
  }

  if (state.salesRange === "custom") {
    return normalizeDateRange(state.salesStartDate, state.salesEndDate);
  }

  const date = state.salesDate || getLocalDateKey();
  return { start: date, end: date };
}

function isSaleInDateRange(sale, range = getSalesRangeDates()) {
  const dateKey = getSaleDateKey(sale);
  return compareDateKeys(dateKey, range.start) >= 0 && compareDateKeys(dateKey, range.end) <= 0;
}

function formatDateLabel(dateKey) {
  const date = parseLocalDateKey(dateKey);
  const formatted = date.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return dateKey === getLocalDateKey() ? `Hari ini, ${formatted}` : formatted;
}

function formatShortDateLabel(dateKey) {
  return parseLocalDateKey(dateKey).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatSalesDateLabel() {
  if (state.salesRange === "all") return "Semua tanggal";
  const range = getSalesRangeDates();
  if (range.start === range.end) return formatDateLabel(range.start);
  return `${formatDateLabel(range.start)} - ${formatDateLabel(range.end)}`;
}

function getSalesRangeCopy() {
  if (state.salesRange === "week" || state.salesRange === "7") return "mingguan";
  if (state.salesRange === "30") return "30 hari";
  if (state.salesRange === "all") return "semua tanggal";
  if (state.salesRange === "custom") return "custom";
  return "tanggal ini";
}

function getSalesStatusCopy() {
  if (state.salesStatus === "deleted") return "terhapus";
  if (state.salesStatus === "all") return "semua";
  return "aktif";
}

function getProductCategory(product) {
  return String(product?.category || "").trim() || DEFAULT_CATEGORY;
}

function isHiddenHalfMenuProduct(product) {
  return product?.source === "virtual";
}

function getDailyMenuEditorDate() {
  return state.dailyMenu.date || getLocalDateKey();
}

function getTodayMenuDate() {
  return getLocalDateKey();
}

function getDailyMenuMap() {
  if (!state.dailyMenu.menusByDate || typeof state.dailyMenu.menusByDate !== "object") {
    state.dailyMenu.menusByDate = {};
  }
  return state.dailyMenu.menusByDate;
}

function getDailyMenuProductIds(dateKey = getTodayMenuDate()) {
  const map = getDailyMenuMap();
  const menuIds = Array.isArray(map[dateKey]) ? map[dateKey] : [];
  return new Set(menuIds.map(String));
}

function setDailyMenuProductIds(dateKey, productIds) {
  const targetDate = dateKey || getTodayMenuDate();
  const uniqueIds = [...new Set((productIds || []).map(String).filter(Boolean))];
  const map = getDailyMenuMap();
  if (uniqueIds.length) {
    map[targetDate] = uniqueIds;
  } else {
    delete map[targetDate];
  }
  if (state.dailyMenu.date === targetDate) {
    state.dailyMenu.productIds = uniqueIds;
  }
  return uniqueIds;
}

function getDailyMenuProducts(dateKey = getTodayMenuDate()) {
  const ids = getDailyMenuProductIds(dateKey);
  return state.products.filter((product) => ids.has(String(product.id)));
}

function isDailyMenuFilterActive() {
  return Boolean(state.dailyMenu.onlyToday && getDailyMenuProducts(getTodayMenuDate()).length);
}

function getProductFilterPool() {
  if (!isDailyMenuFilterActive()) return state.products;
  return getDailyMenuProducts(getTodayMenuDate());
}

function getVisibleMenuProducts() {
  return getProductFilterPool().filter((product) => !isHiddenHalfMenuProduct(product));
}

function getCategories() {
  const categories = new Set(getVisibleMenuProducts().map(getProductCategory));
  return [...categories].sort((left, right) => left.localeCompare(right, "id-ID"));
}

function renderDailyMenuControls() {
  if (!els.dailyMenuStatus) return;

  const todayDate = getTodayMenuDate();
  const editorDate = getDailyMenuEditorDate();
  const menuProducts = getDailyMenuProducts(todayDate);
  const editorProducts = getDailyMenuProducts(editorDate);
  const dateLabel = formatDateLabel(todayDate);
  const editorDateLabel = formatDateLabel(editorDate);
  const active = isDailyMenuFilterActive();
  if (els.dailyMenuTitle) els.dailyMenuTitle.textContent = active ? "Menu Terjadwal Aktif" : "Menu Katering Harian";
  els.dailyMenuStatus.textContent = menuProducts.length
    ? (active 
        ? `Hanya menampilkan ${menuProducts.length} menu yang terjadwal untuk ${dateLabel}.`
        : `Tersedia ${menuProducts.length} menu terjadwal untuk ${dateLabel}. Menampilkan semua barang.`)
    : `Belum ada menu terjadwal untuk ${dateLabel}. Tekan 'Atur Menu' untuk menambahkan.`;
  els.showAllMenuButton?.classList.toggle("active", !active);
  els.showTodayMenuButton?.classList.toggle("active", active);
  if (els.showTodayMenuButton) els.showTodayMenuButton.disabled = !menuProducts.length;
  if (els.dailyMenuDateInput) els.dailyMenuDateInput.value = editorDate;
  if (els.dailyMenuDateText) els.dailyMenuDateText.textContent = formatShortDateLabel(editorDate);
  if (els.dailyMenuDateMeta) {
    els.dailyMenuDateMeta.textContent = editorDate === todayDate
      ? `${editorProducts.length || "Belum ada"} menu untuk hari ini`
      : `${editorProducts.length || "Belum ada"} menu untuk ${editorDateLabel}`;
  }
  if (els.dailyMenuOnlyInput) els.dailyMenuOnlyInput.checked = Boolean(state.dailyMenu.onlyToday);
  if (els.dailyMenuDateButton) els.dailyMenuDateButton.setAttribute("aria-expanded", String(!els.dailyMenuCalendarPopover?.hidden));
}

function setDailyMenuOnly(enabled) {
  state.dailyMenu.onlyToday = Boolean(enabled);
  state.selectedCategory = "all";
  render();
}

function refreshTodayDateIfChanged() {
  const todayKey = getLocalDateKey();
  if (todayKey === renderedTodayDateKey) return;
  renderedTodayDateKey = todayKey;
  state.selectedCategory = "all";
  render();
}

function setDailyMenuCalendarMonthFromDate(dateKey) {
  state.dailyMenuCalendar.month = String(dateKey || getTodayMenuDate()).slice(0, 7);
}

function renderDailyMenuCalendar() {
  if (!els.dailyMenuCalendarPopover || els.dailyMenuCalendarPopover.hidden || !els.dailyMenuCalendarGrid) return;

  const monthKey = state.dailyMenuCalendar.month || getTodayMenuDate().slice(0, 7);
  const [year, month] = monthKey.split("-").map((part) => Number.parseInt(part, 10));
  const firstDate = new Date(year, month - 1, 1);
  const gridStart = new Date(year, month - 1, 1 - firstDate.getDay());
  const selectedDate = getDailyMenuEditorDate();
  const todayKey = getTodayMenuDate();
  const currentMonthIndex = month - 1;

  if (els.dailyMenuCalendarTitle) els.dailyMenuCalendarTitle.textContent = formatCalendarMonthLabel(monthKey);

  els.dailyMenuCalendarGrid.innerHTML = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    const dateKey = getLocalDateKey(day);
    const selected = dateKey === selectedDate;
    const classes = [
      "sales-calendar-day",
      day.getMonth() !== currentMonthIndex ? "other-month" : "",
      dateKey === todayKey ? "today" : "",
      selected ? "selected-start selected-end" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return `
      <button class="${classes}" type="button" data-daily-menu-date="${dateKey}" aria-label="${escapeHtml(formatDateLabel(dateKey))}">
        <span class="calendar-day-number">${day.getDate()}</span>
      </button>
    `;
  }).join("");
}

function openDailyMenuCalendar() {
  if (!els.dailyMenuCalendarPopover) return;
  setDailyMenuCalendarMonthFromDate(getDailyMenuEditorDate());
  els.dailyMenuCalendarPopover.hidden = false;
  renderDailyMenuControls();
  renderDailyMenuCalendar();
}

function closeDailyMenuCalendar() {
  if (!els.dailyMenuCalendarPopover || els.dailyMenuCalendarPopover.hidden) return;
  els.dailyMenuCalendarPopover.hidden = true;
  renderDailyMenuControls();
}

function setDailyMenuEditorDate(dateKey) {
  const nextDate = dateKey || getTodayMenuDate();
  state.dailyMenu.date = nextDate;
  state.dailyMenu.productIds = [...getDailyMenuProductIds(nextDate)];
  dailyMenuLastReview = [];
  setDailyMenuCalendarMonthFromDate(nextDate);
  render();
}

function selectDailyMenuCalendarDate(dateKey) {
  if (!dateKey) return;
  setDailyMenuEditorDate(dateKey);
  closeDailyMenuCalendar();
}

function parseDailyMenuTextRows(text) {
  const normalized = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return [];

  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const firstColumns = splitCsvLine(lines[0], lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",").map(normalizeKey);
  const hasHeader = firstColumns.some((item) => ["nama", "name", "menu", "item", "barang"].includes(item));

  if (hasHeader) {
    return parseDelimited(normalized).map((row) => ({
      name: String(readObjectValue(row, ["nama", "name", "menu", "item", "barang"], "")).trim(),
      sku: String(readObjectValue(row, ["sku", "kode"], "")).trim(),
      price: parseMoney(readObjectValue(row, ["harga", "price"], 0)),
    })).filter((item) => item.name || item.sku);
  }

  return lines
    .map((line) => {
      const cleanLine = line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim();
      const delimiter = cleanLine.includes("\t") ? "\t" : cleanLine.includes(";") ? ";" : cleanLine.includes(",") ? "," : "";
      if (delimiter) {
        const cells = splitCsvLine(cleanLine, delimiter).map((cell) => cell.trim()).filter(Boolean);
        const price = parseMoney(cells[cells.length - 1]);
        return {
          name: cells.slice(0, price > 0 ? -1 : undefined).join(" ").trim() || cells[0] || "",
          sku: "",
          price,
        };
      }

      const match = cleanLine.match(/^(.+?)\s*[-–—]\s*(?:rp\s*)?([\d.,]+)\s*$/i);
      if (match) {
        return { name: match[1].trim(), sku: "", price: parseMoney(match[2]) };
      }

      return { name: cleanLine, sku: "", price: 0 };
    })
    .filter((item) => item.name || item.sku);
}

function findDailyMenuProduct(entry) {
  const exact = findUniqueProductMatch(state.products, entry.name, entry.sku, entry.price, { allowFuzzy: false });
  if (exact) return { status: "matched", product: exact, entry };

  const normalizedName = normalizeKey(entry.name);
  const exactNameMatches = normalizedName ? state.products.filter((product) => productMatchesName(product, normalizedName)) : [];
  if (exactNameMatches.length > 1 && !entry.price) {
    return { status: "ambiguous", entry, matches: exactNameMatches };
  }

  const fuzzy = findUniqueProductMatch(state.products, entry.name, entry.sku, entry.price);
  if (fuzzy) return { status: "matched", product: fuzzy, entry };

  return { status: "missing", entry, matches: exactNameMatches };
}

function renderDailyMenuReview(reviewRows = dailyMenuLastReview) {
  if (!els.dailyMenuReview) return;

  const editorDate = getDailyMenuEditorDate();
  const menuProducts = getDailyMenuProducts(editorDate);
  const issueRows = reviewRows.filter((row) => row.status !== "matched");
  if (!menuProducts.length && !issueRows.length) {
    els.dailyMenuReview.hidden = true;
    els.dailyMenuReview.innerHTML = "";
    return;
  }

  els.dailyMenuReview.hidden = false;
  const selectedHtml = menuProducts.length
    ? `
      <div class="daily-menu-review-section">
        <strong>Menu ${formatShortDateLabel(editorDate)} (${menuProducts.length})</strong>
        <div class="daily-menu-chip-list">
          ${menuProducts
            .map((product) => `
              <span class="daily-menu-chip">
                ${escapeHtml(product.name)} · ${currency.format(product.price)}
                <button type="button" data-remove-daily-menu="${escapeHtml(product.id)}" aria-label="Hapus ${escapeHtml(product.name)} dari menu hari ini">×</button>
              </span>
            `)
            .join("")}
        </div>
      </div>
    `
    : "";
  const issueHtml = issueRows.length
    ? `
      <div class="daily-menu-review-section">
        <strong>Perlu dicek (${issueRows.length})</strong>
        <ul>
          ${issueRows
            .map((row) => {
              const name = row.entry.name || row.entry.sku || "Menu tanpa nama";
              const price = row.entry.price ? ` ${currency.format(row.entry.price)}` : "";
              const copy = row.status === "ambiguous"
                ? `${name}${price}: nama sama lebih dari satu, isi harga di CSV biar tepat.`
                : `${name}${price}: tidak ditemukan di daftar barang.`;
              return `<li>${escapeHtml(copy)}</li>`;
            })
            .join("")}
        </ul>
      </div>
    `
    : "";

  els.dailyMenuReview.innerHTML = `${selectedHtml}${issueHtml}`;
}

function applyDailyMenuRows(rows) {
  const reviewRows = rows.map(findDailyMenuProduct);
  const seen = new Set();
  const productIds = [];
  reviewRows.forEach((row) => {
    if (row.status !== "matched" || !row.product) return;
    const id = String(row.product.id);
    if (seen.has(id)) return;
    seen.add(id);
    productIds.push(id);
  });

  const date = getDailyMenuEditorDate();
  state.dailyMenu.date = date;
  state.dailyMenu.productIds = setDailyMenuProductIds(date, productIds);
  state.dailyMenu.onlyToday = Boolean(els.dailyMenuOnlyInput?.checked ?? true);
  state.dailyMenu.lastImportAt = new Date().toISOString();
  state.selectedCategory = "all";
  dailyMenuLastReview = reviewRows;
  render();
  renderDailyMenuReview(reviewRows);
  const missing = reviewRows.filter((row) => row.status !== "matched").length;
  setSyncStatus(`${productIds.length} menu untuk ${formatDateLabel(date)} diterapkan.${missing ? ` ${missing} baris perlu dicek.` : ""}`);
}

function applyDailyMenuFromInput() {
  const rows = parseDailyMenuTextRows(els.dailyMenuCsvInput?.value || "");
  if (!rows.length) {
    setSyncStatus("Isi atau upload CSV menu harian dulu.");
    return;
  }
  applyDailyMenuRows(rows);
}

function clearDailyMenu() {
  const date = getDailyMenuEditorDate();
  state.dailyMenu.productIds = setDailyMenuProductIds(date, []);
  if (date === getTodayMenuDate()) state.dailyMenu.onlyToday = false;
  dailyMenuLastReview = [];
  render();
  renderDailyMenuReview([]);
  setSyncStatus(`Menu untuk ${formatDateLabel(date)} sudah dikosongkan.`);
}

function removeDailyMenuProduct(productId) {
  const date = getDailyMenuEditorDate();
  const nextIds = [...getDailyMenuProductIds(date)].filter((id) => String(id) !== String(productId));
  state.dailyMenu.productIds = setDailyMenuProductIds(date, nextIds);
  if (date === getTodayMenuDate() && !nextIds.length) state.dailyMenu.onlyToday = false;
  render();
  renderDailyMenuReview();
}

function openDailyMenuEditor() {
  setInventoryTab("daily");
  renderDailyMenuControls();
  if (!state.dailyMenu.productIds.length && els.dailyMenuOnlyInput) els.dailyMenuOnlyInput.checked = true;
  renderDailyMenuReview();
  openModal(els.inventoryModal, els.dailyMenuCsvInput);
}

async function readDailyMenuFile(file) {
  if (!file) return;
  const text = await file.text();
  els.dailyMenuCsvInput.value = text;
  setSyncStatus(`${file.name} siap diterapkan sebagai menu hari ini.`);
}

function getCustomerNameFromSale(sale) {
  return String(sale?.customer_name || sale?.customerName || sale?.customer_address || sale?.customerAddress || "").trim();
}

function compactCustomerKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-z]+/g, "");
}

function getCustomerTokens(value) {
  return String(value ?? "")
    .toLowerCase()
    .split(/[^0-9a-z]+/g)
    .map((token) => token.trim())
    .filter(Boolean);
}

function getCustomerMatchSignatures(value) {
  const signatures = new Set();
  const compact = compactCustomerKey(value);
  if (compact.length >= 4) signatures.add(compact);

  const tokens = getCustomerTokens(value);
  const textTokens = tokens.filter((token) => !/^\d+$/.test(token));
  const numberTokens = tokens.filter((token) => /^\d+$/.test(token));
  const numberSuffix = numberTokens.join("");

  if (textTokens.length) {
    const initialSignature = `${textTokens.map((token) => (token.length <= 3 ? token : token[0])).join("")}${numberSuffix}`;
    if (initialSignature.length >= 4) signatures.add(initialSignature);
  }

  if (textTokens.length >= 2) {
    const portmanteau = `${textTokens[0].slice(0, 3)}${textTokens[1].slice(0, 3)}${numberSuffix}`;
    if (portmanteau.length >= 4) signatures.add(portmanteau);
  }

  return signatures;
}

function normalizeCustomerTag(value) {
  const tag = String(value ?? "").trim().replace(/\s+/g, " ");
  return CUSTOMER_TAG_ALIASES.get(compactCustomerKey(tag)) || tag;
}

function normalizeCustomerTagText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^0-9a-z]+/g, " ")
    .trim();
}

function inferCustomerAddressTag(...values) {
  const rawText = values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ");
  if (!rawText) return "";

  const tagText = `${normalizeCustomerTagText(rawText)} ${compactCustomerKey(rawText)}`.trim();
  if (CUSTOMER_GOJEK_PATTERN.test(tagText)) return "GOJEK";
  if (CUSTOMER_ITS_FALLBACK_PATTERN.test(tagText)) return "ITS";

  for (const rule of CUSTOMER_ADDRESS_TAG_RULES) {
    if (rule.pattern.test(tagText)) return rule.tag;
  }

  const blockMatch = tagText.match(CUSTOMER_ITS_BLOCK_PATTERN);
  if (blockMatch) return "ITS";
  return "";
}

function resolveCustomerTag(name, aliases = [], tag = "") {
  return normalizeCustomerTag(tag) || inferCustomerAddressTag(name, aliases);
}

function invalidateCustomerProfilesCache() {
  customerProfilesCache.dirty = true;
  customerProfilesCache.signature = "";
  customerProfilesCache.lastSuggestionsHtml = "";
}

function getCustomerProfilesSignature() {
  const newestCustomer = state.customers[0] || {};
  const newestSale = state.sales[0] || {};
  const newestDraft = state.importDrafts[0] || {};
  const newestHeld = state.heldCarts[0] || {};
  return [
    state.customers.length,
    newestCustomer.id || "",
    newestCustomer.name || "",
    newestCustomer.tag || newestCustomer.customerTag || newestCustomer.address_tag || newestCustomer.addressTag || "",
    newestCustomer.updated_at || newestCustomer.updatedAt || "",
    state.sales.length,
    newestSale.id || "",
    newestSale.customer_name || newestSale.customerName || "",
    newestSale.completed_at || newestSale.completedAt || "",
    state.importDrafts.length,
    newestDraft.customerName || "",
    newestDraft.importedAt || "",
    state.heldCarts.length,
    newestHeld.id || "",
    newestHeld.createdAt || "",
    state.lastReceipt?.customerName || "",
    state.lastReceipt?.completedAt || "",
  ].join("|");
}

function getCustomerProfiles() {
  const signature = getCustomerProfilesSignature();
  if (!customerProfilesCache.dirty && customerProfilesCache.signature === signature) {
    return customerProfilesCache.profiles;
  }

  const profiles = new Map();
  const addProfile = (name, shipping = 0, dateValue = "", newDepositBalance, tag = "") => {
    const customerName = String(name || "").trim();
    const key = normalizeKey(customerName);
    if (!key) return;

    const timestamp = dateValue ? new Date(dateValue).getTime() || 0 : 0;
    const current = profiles.get(key);
    const resolvedTag = normalizeCustomerTag(tag);
    
    // Preserve existing deposit balance if newDepositBalance is not provided
    const resolvedDeposit = newDepositBalance !== undefined 
      ? Number(newDepositBalance || 0) 
      : (current ? current.depositBalance : 0);

    // Always keep the highest deposit balance we've seen for this customer
    // because only state.customers provides the true balance
    const maxDeposit = Math.max(current ? current.depositBalance : 0, resolvedDeposit);

    if (!current || timestamp >= current.timestamp) {
      profiles.set(key, {
        name: customerName,
        searchKey: key,
        shipping: Number(shipping || 0),
        depositBalance: maxDeposit,
        tag: resolvedTag || current?.tag || "",
        timestamp,
      });
    } else if (maxDeposit > current.depositBalance) {
      // If we don't update the timestamp/shipping, at least ensure deposit balance isn't lost
      current.depositBalance = maxDeposit;
    }
    if (current && resolvedTag && !current.tag) current.tag = resolvedTag;
  };

  state.customers.forEach((customer) => {
    const normalized = normalizeCustomerRecord(customer);
    addProfile(
      normalized.name,
      normalized.shipping,
      normalized.lastOrderAt,
      normalized.depositBalance,
      normalized.tag
    );
    normalized.aliases.forEach((alias) => addProfile(alias, normalized.shipping, normalized.lastOrderAt, normalized.depositBalance, normalized.tag));
  });
  getActiveSales().forEach((sale) => addProfile(getCustomerNameFromSale(sale), getSaleShipping(sale), sale.completed_at));
  state.importDrafts.forEach((draft) => addProfile(draft.customerName, draft.shipping, draft.importedAt));
  state.heldCarts.forEach((heldCart) => addProfile(heldCart.sale?.customerName, heldCart.sale?.shipping, heldCart.createdAt));
  if (state.lastReceipt) addProfile(state.lastReceipt.customerName, state.lastReceipt.shipping, state.lastReceipt.completedAt);

  customerProfilesCache.profiles = [...profiles.values()].sort((left, right) => right.timestamp - left.timestamp || left.name.localeCompare(right.name, "id-ID"));
  customerProfilesCache.signature = signature;
  customerProfilesCache.dirty = false;
  return customerProfilesCache.profiles;
}

function getCustomerProfile(customerName) {
  const key = normalizeKey(customerName);
  return getCustomerProfiles().find((profile) => profile.searchKey === key) || null;
}

function getActiveCustomerSuggestionQuery() {
  const activeElement = document.activeElement;
  if (activeElement?.getAttribute?.("list") === "customerSuggestions") {
    return activeElement.value || "";
  }
  return els.customerNameInput?.value || state.sale.customerName || "";
}

function getCustomerSuggestionProfiles(query = getActiveCustomerSuggestionQuery()) {
  const profiles = getCustomerProfiles();
  const searchKey = normalizeKey(query);
  if (!searchKey) return profiles.slice(0, CUSTOMER_SUGGESTION_LIMIT);

  return profiles
    .map((profile) => {
      const key = profile.searchKey || normalizeKey(profile.name);
      let score = 0;
      if (key === searchKey) score = 100;
      else if (key.startsWith(searchKey)) score = 80;
      else if (key.includes(searchKey)) score = 50;
      else return null;
      return { profile, score };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || right.profile.timestamp - left.profile.timestamp || left.profile.name.localeCompare(right.profile.name, "id-ID"))
    .slice(0, CUSTOMER_SUGGESTION_LIMIT)
    .map((item) => item.profile);
}

function renderCustomerSuggestions(query) {
  if (!els.customerSuggestions) return;
  const html = getCustomerSuggestionProfiles(query)
    .map((profile) => `<option value="${escapeHtml(profile.name)}"></option>`)
    .join("");
  if (html === customerProfilesCache.lastSuggestionsHtml) return;
  els.customerSuggestions.innerHTML = html;
  customerProfilesCache.lastSuggestionsHtml = html;
}

function applyCustomerDefaults(customerName, targetSale = state.sale) {
  const profile = getCustomerProfile(customerName);
  if (!profile) return false;

  const profileShipping = Number(profile.shipping || 0);
  if (Number(targetSale.shipping || 0) === profileShipping) return false;

  targetSale.shipping = profileShipping;
  return true;
}

function renderCustomerProfileHint() {
  if (!els.customerProfileHint) return;
  const customerName = String(state.sale.customerName || "").trim();

  if (els.customerDepositHint) {
    els.customerDepositHint.hidden = true;
    els.customerDepositHint.textContent = "";
  }

  if (!customerName) {
    els.customerProfileHint.textContent = "Customer/alamat kosong. Isi field ini supaya ongkir terakhir bisa kepakai otomatis.";
    els.customerProfileHint.className = "customer-profile-hint warning";
    return;
  }

  const profile = getCustomerProfile(customerName);
  if (profile) {
    const lastText = profile.timestamp ? ` terakhir ${new Date(profile.timestamp).toLocaleDateString("id-ID")}` : "";
    els.customerProfileHint.textContent = `Customer/alamat lama${lastText}. Ongkir terakhir ${currency.format(profile.shipping)} dipakai otomatis.`;
    els.customerProfileHint.className = "customer-profile-hint success";

    if (profile.depositBalance > 0 && els.customerDepositHint) {
      els.customerDepositHint.textContent = `Pelanggan memiliki saldo deposit ${currency.format(profile.depositBalance)} yang akan otomatis digunakan pada order ini.`;
      els.customerDepositHint.hidden = false;
    }
    return;
  }

  const customerKey = normalizeKey(customerName);
  const partial = getCustomerProfiles().find((item) => item.searchKey.includes(customerKey));
  if (partial) {
    els.customerProfileHint.textContent = `Mirip dengan ${partial.name}. Pilih dari saran untuk pakai ongkir ${currency.format(partial.shipping)}.`;
    els.customerProfileHint.className = "customer-profile-hint";
    return;
  }

  els.customerProfileHint.textContent = "Customer/alamat baru. Ongkir bisa diisi manual.";
  els.customerProfileHint.className = "customer-profile-hint";
}

function setCustomerDataStatus(message, options = {}) {
  const text = String(message || "").trim();
  if (els.customerDataStatus && text) els.customerDataStatus.textContent = text;
  if (options.toast && text) showToast(text, { title: "Data Customer", variant: options.variant || getToastVariant(text) });
}

function getCustomerWrapEditorValue(editor) {
  return String(editor?.textContent || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ");
}

function syncCustomerWrapEditor(editor, options = {}) {
  const fieldName = editor?.dataset?.wrapField;
  const form = editor?.closest?.(".customer-card");
  const input = fieldName ? form?.elements?.[fieldName] : null;
  if (!input) return;
  const value = options.trim ? getCustomerWrapEditorValue(editor).trim() : getCustomerWrapEditorValue(editor);
  input.value = value;
  if (options.trim) editor.textContent = value;
}

function normalizeCustomerRecord(customer) {
  const lastOrderAt = String(customer?.last_order_at ?? customer?.lastOrderAt ?? "").trim();
  const name = String(customer?.name ?? customer?.customerName ?? "").trim();
  const aliasData = splitCustomerTagAliases(customer?.aliases ?? customer?.alias ?? []);
  const aliases = aliasData.aliases;
  const savedTag = aliasData.tag;
  const rawExplicitTag = customer?.tag ?? customer?.customerTag ?? customer?.address_tag ?? customer?.addressTag ?? "";
  const explicitTag = normalizeCustomerTag(rawExplicitTag || savedTag);
  const inferredTag = inferCustomerAddressTag(name, aliases);
  return {
    id: String(customer?.id ?? "").trim(),
    name,
    shipping: parseIntegerInput(customer?.default_shipping ?? customer?.defaultShipping ?? customer?.shipping ?? 0),
    depositBalance: parseIntegerInput(customer?.deposit_balance ?? customer?.depositBalance ?? 0),
    tag: explicitTag || inferredTag,
    explicitTag,
    inferredTag,
    tagSource: explicitTag ? "saved" : inferredTag ? "inferred" : "empty",
    lastOrderAt,
    timestamp: lastOrderAt ? new Date(lastOrderAt).getTime() || 0 : 0,
    aliases,
  };
}

function getCustomerDisplayTag(customer) {
  return String(customer?.tag || "").trim() || CUSTOMER_TAG_FILTER_OTHER_LABEL;
}

function getCustomerTagFilterKey(customer) {
  return String(customer?.tag || "").trim() ? String(customer.tag).trim() : CUSTOMER_TAG_FILTER_OTHER;
}

function isCustomerMatchingTagFilter(customer, filterKey = state.customerTagFilter) {
  if (!filterKey || filterKey === CUSTOMER_TAG_FILTER_ALL) return true;
  if (filterKey === CUSTOMER_TAG_FILTER_OTHER) return !String(customer?.tag || "").trim();
  return String(customer?.tag || "").trim() === filterKey;
}

function getNormalizedCustomersForFilter() {
  return state.customers
    .map(normalizeCustomerRecord)
    .filter((customer) => customer.id && customer.name);
}

function getCustomerTagFilterOptions(customers = getNormalizedCustomersForFilter()) {
  const counts = new Map();
  customers.forEach((customer) => {
    const label = getCustomerDisplayTag(customer);
    counts.set(label, (counts.get(label) || 0) + 1);
  });

  const orderIndex = new Map(CUSTOMER_TAG_FILTER_ORDER.map((tag, index) => [tag, index]));
  const tags = [...counts.keys()].sort((left, right) => {
    const leftIndex = orderIndex.has(left) ? orderIndex.get(left) : Number.MAX_SAFE_INTEGER;
    const rightIndex = orderIndex.has(right) ? orderIndex.get(right) : Number.MAX_SAFE_INTEGER;
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    return left.localeCompare(right, "id-ID");
  });

  return [
    {
      key: CUSTOMER_TAG_FILTER_ALL,
      label: "Semua",
      count: customers.length,
    },
    ...tags.map((tag) => ({
      key: tag === CUSTOMER_TAG_FILTER_OTHER_LABEL ? CUSTOMER_TAG_FILTER_OTHER : tag,
      label: tag,
      count: counts.get(tag) || 0,
    })),
  ];
}

function getSimilarCustomerGroups(customers = getNormalizedCustomersForFilter()) {
  const byId = new Map(customers.map((customer) => [customer.id, customer]));
  const parent = new Map(customers.map((customer) => [customer.id, customer.id]));

  const find = (id) => {
    let root = parent.get(id) || id;
    while (parent.get(root) && parent.get(root) !== root) {
      root = parent.get(root);
    }
    let current = id;
    while (parent.get(current) && parent.get(current) !== root) {
      const next = parent.get(current);
      parent.set(current, root);
      current = next;
    }
    return root;
  };

  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  };

  const signatureMap = new Map();
  customers.forEach((customer) => {
    const signatures = new Set();
    [customer.name, ...customer.aliases].forEach((name) => {
      getCustomerMatchSignatures(name).forEach((signature) => signatures.add(signature));
    });
    signatures.forEach((signature) => {
      const ids = signatureMap.get(signature) || [];
      ids.push(customer.id);
      signatureMap.set(signature, ids);
    });
  });

  signatureMap.forEach((ids) => {
    if (ids.length < 2) return;
    ids.slice(1).forEach((id) => union(ids[0], id));
  });

  const groupMap = new Map();
  customers.forEach((customer) => {
    const root = find(customer.id);
    const group = groupMap.get(root) || [];
    group.push(byId.get(customer.id));
    groupMap.set(root, group);
  });

  return [...groupMap.values()]
    .filter((group) => group.length > 1)
    .map((group) => [...group].sort((left, right) => right.timestamp - left.timestamp || left.name.localeCompare(right.name, "id-ID")))
    .sort((left, right) => right.length - left.length || left[0].name.localeCompare(right[0].name, "id-ID"));
}

function getCustomerHygieneAnalysis(customers = getNormalizedCustomersForFilter()) {
  const issueKeysByCustomer = new Map(customers.map((customer) => [customer.id, new Set()]));
  const issueDetailsByCustomer = new Map(customers.map((customer) => [customer.id, []]));
  const issueCounts = new Map(CUSTOMER_HYGIENE_ISSUES.map((issue) => [issue.key, 0]));
  const aliasesByKey = new Map();
  const shippingByTag = new Map();

  const addIssue = (customer, key, detail = "") => {
    if (!customer?.id || !issueKeysByCustomer.has(customer.id)) return;
    const issueKeys = issueKeysByCustomer.get(customer.id);
    if (issueKeys.has(key)) return;
    issueKeys.add(key);
    issueDetailsByCustomer.get(customer.id).push({
      key,
      label: CUSTOMER_HYGIENE_ISSUE_LABELS.get(key) || key,
      detail: String(detail || "").trim(),
    });
  };

  customers.forEach((customer) => {
    if (!customer.explicitTag) {
      addIssue(customer, "missingExplicitTag", customer.inferredTag ? `Infer ${customer.inferredTag}` : "");
    }
    if (!customer.tag) {
      addIssue(customer, "missingResolvedTag");
    }
    if (customer.shipping === 0) {
      addIssue(customer, "zeroShipping");
    }
    if (customer.explicitTag && customer.inferredTag && normalizeKey(customer.explicitTag) !== normalizeKey(customer.inferredTag)) {
      addIssue(customer, "tagMismatch", `Alamat kebaca ${customer.inferredTag}`);
    }

    customer.aliases.forEach((alias) => {
      const aliasKey = compactCustomerKey(alias);
      if (aliasKey.length < 4) return;
      const entries = aliasesByKey.get(aliasKey) || [];
      entries.push({ customer, alias });
      aliasesByKey.set(aliasKey, entries);
    });

    if (customer.tag) {
      const group = shippingByTag.get(customer.tag) || [];
      group.push(customer);
      shippingByTag.set(customer.tag, group);
    }
  });

  aliasesByKey.forEach((entries) => {
    const uniqueCustomerIds = new Set(entries.map((entry) => entry.customer.id));
    if (uniqueCustomerIds.size < 2) return;

    entries.forEach((entry) => {
      const otherNames = entries
        .filter((other) => other.customer.id !== entry.customer.id)
        .map((other) => other.customer.name)
        .filter(Boolean);
      addIssue(entry.customer, "duplicateAlias", otherNames.length ? `Juga di ${otherNames.slice(0, 2).join(", ")}` : "");
    });
  });

  shippingByTag.forEach((group, tag) => {
    if (group.length < 3) return;
    const counts = new Map();
    group.forEach((customer) => {
      counts.set(customer.shipping, (counts.get(customer.shipping) || 0) + 1);
    });
    if (counts.size < 2) return;

    const [modeShipping] = [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0] - right[0])[0];
    group.forEach((customer) => {
      if (customer.shipping !== modeShipping) {
        addIssue(customer, "shippingOutlier", `${tag} biasanya ${currency.format(modeShipping)}`);
      }
    });
  });

  getSimilarCustomerGroups(customers).forEach((group) => {
    const names = group.map((customer) => customer.name).filter(Boolean);
    group.forEach((customer) => {
      const otherNames = names.filter((name) => name !== customer.name);
      addIssue(customer, "similarName", otherNames.length ? `Mirip ${otherNames.slice(0, 2).join(", ")}` : "");
    });
  });

  let reviewCustomerCount = 0;
  issueKeysByCustomer.forEach((issueKeys) => {
    if (issueKeys.size) reviewCustomerCount += 1;
    issueKeys.forEach((key) => {
      issueCounts.set(key, (issueCounts.get(key) || 0) + 1);
    });
  });

  return {
    issueKeysByCustomer,
    issueDetailsByCustomer,
    issueCounts,
    reviewCustomerCount,
  };
}

function isCustomerMatchingHygieneFilter(customer, analysis, filterKey = state.customerHygieneFilter) {
  if (!filterKey || filterKey === CUSTOMER_HYGIENE_FILTER_ALL) return true;
  const issueKeys = analysis?.issueKeysByCustomer?.get(customer.id) || new Set();
  if (filterKey === CUSTOMER_HYGIENE_FILTER_REVIEW) return issueKeys.size > 0;
  return issueKeys.has(filterKey);
}

function getCustomerHygieneIssueDetails(customer, analysis) {
  return analysis?.issueDetailsByCustomer?.get(customer.id) || [];
}

function renderCustomerHygieneFlags(customer, analysis) {
  const issues = getCustomerHygieneIssueDetails(customer, analysis);
  if (!issues.length) return "";

  return `
    <div class="customer-hygiene-flags" aria-label="Catatan cek data">
      ${issues
        .map((issue) => `
          <span class="customer-hygiene-flag" data-hygiene-issue="${escapeHtml(issue.key)}">
            <strong>${escapeHtml(issue.label)}</strong>
            ${issue.detail ? `<small>${escapeHtml(issue.detail)}</small>` : ""}
          </span>
        `)
        .join("")}
    </div>
  `;
}

function getEditableCustomerRows(customers = getNormalizedCustomersForFilter(), hygieneAnalysis = getCustomerHygieneAnalysis(customers)) {
  const searchKey = normalizeKey(state.customerSearch);
  return customers
    .filter((customer) => isCustomerMatchingTagFilter(customer))
    .filter((customer) => isCustomerMatchingHygieneFilter(customer, hygieneAnalysis))
    .filter((customer) => !searchKey || normalizeKey(customer.name).includes(searchKey) || normalizeKey(customer.tag).includes(searchKey) || customer.aliases.some((alias) => normalizeKey(alias).includes(searchKey)));
}

function renderCustomerSimilarSection(customers = getNormalizedCustomersForFilter()) {
  if (!els.customerSimilarSection || !els.customerSimilarList) return;

  const groups = getSimilarCustomerGroups(customers);
  if (!groups.length) {
    els.customerSimilarSection.hidden = true;
    els.customerSimilarList.innerHTML = "";
    return;
  }

  els.customerSimilarSection.hidden = false;
  els.customerSimilarList.innerHTML = groups
    .map((group, index) => {
      const ids = group.map((customer) => customer.id);
      return `
        <form class="customer-merge-card" data-customer-ids="${escapeHtml(ids.join(","))}">
          <div class="customer-merge-copy">
            <strong>Grup ${index + 1}</strong>
            <span>${escapeHtml(group.map((customer) => customer.name).join(" / "))}</span>
          </div>
          <label>
            Data utama
            <select name="targetId">
              ${group.map((customer) => `<option value="${escapeHtml(customer.id)}">${escapeHtml(customer.name)}</option>`).join("")}
            </select>
          </label>
          <button class="secondary-button" type="submit">Merge</button>
        </form>
      `;
    })
    .join("");
}

function renderCustomerTagFilter(customers = getNormalizedCustomersForFilter()) {
  if (!els.customerTagFilter) return;
  const options = getCustomerTagFilterOptions(customers);
  const optionKeys = new Set(options.map((option) => option.key));
  if (!optionKeys.has(state.customerTagFilter)) state.customerTagFilter = CUSTOMER_TAG_FILTER_ALL;

  if (!customers.length) {
    els.customerTagFilter.innerHTML = "";
    els.customerTagFilter.hidden = true;
    return;
  }

  els.customerTagFilter.hidden = false;
  els.customerTagFilter.innerHTML = `
    <span class="customer-tag-filter-label">Tag alamat</span>
    <div class="customer-tag-filter-chips" role="group" aria-label="Filter tag alamat">
      ${options
        .map((option) => {
          const active = option.key === state.customerTagFilter;
          return `
            <button class="customer-filter-chip${active ? " active" : ""}" type="button" data-customer-tag-filter="${escapeHtml(option.key)}" aria-pressed="${active ? "true" : "false"}">
              <span>${escapeHtml(option.label)}</span>
              <strong>${escapeHtml(option.count)}</strong>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderCustomerHygienePanel(customers = getNormalizedCustomersForFilter(), analysis = getCustomerHygieneAnalysis(customers)) {
  if (!els.customerHygienePanel) return;

  if (!customers.length) {
    els.customerHygienePanel.hidden = true;
    els.customerHygienePanel.innerHTML = "";
    state.customerHygieneFilter = CUSTOMER_HYGIENE_FILTER_ALL;
    return;
  }

  const options = [
    { key: CUSTOMER_HYGIENE_FILTER_ALL, label: "Semua", count: customers.length },
    { key: CUSTOMER_HYGIENE_FILTER_REVIEW, label: "Perlu cek", count: analysis.reviewCustomerCount },
    ...CUSTOMER_HYGIENE_ISSUES.map((issue) => ({
      key: issue.key,
      label: issue.label,
      count: analysis.issueCounts.get(issue.key) || 0,
    })),
  ];
  const optionKeys = new Set(options.map((option) => option.key));
  if (!optionKeys.has(state.customerHygieneFilter)) state.customerHygieneFilter = CUSTOMER_HYGIENE_FILTER_ALL;

  els.customerHygienePanel.hidden = false;
  els.customerHygienePanel.innerHTML = `
    <div class="customer-hygiene-heading">
      <div>
        <p class="eyebrow">Cek Data</p>
        <h3>Tag & ongkir</h3>
      </div>
      <span class="customer-hygiene-score${analysis.reviewCustomerCount ? " attention" : ""}">
        ${analysis.reviewCustomerCount ? `${escapeHtml(analysis.reviewCustomerCount)} perlu cek` : "Aman"}
      </span>
    </div>
    <div class="customer-hygiene-chips" role="group" aria-label="Filter cek data customer">
      ${options
        .map((option) => {
          const active = option.key === state.customerHygieneFilter;
          return `
            <button class="customer-hygiene-chip${active ? " active" : ""}${option.count ? "" : " empty"}" type="button" data-customer-hygiene-filter="${escapeHtml(option.key)}" aria-pressed="${active ? "true" : "false"}">
              <span>${escapeHtml(option.label)}</span>
              <strong>${escapeHtml(option.count)}</strong>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderCustomerDataList(statusMessage = "") {
  if (!els.customerDataList) return;

  const customers = getNormalizedCustomersForFilter();
  const hygieneAnalysis = getCustomerHygieneAnalysis(customers);
  renderCustomerSimilarSection(customers);
  renderCustomerTagFilter(customers);
  renderCustomerHygienePanel(customers, hygieneAnalysis);
  const rows = getEditableCustomerRows(customers, hygieneAnalysis);

  const totalCount = customers.length;
  const countChip = document.getElementById("customerCountChip");
  if (countChip) {
    countChip.textContent = `${totalCount} Customer`;
  }
  if (!state.customers.length) {
    els.customerDataList.innerHTML = `<div class="empty-state">Belum ada data customer.</div>`;
    setCustomerDataStatus(statusMessage || "Data customer masih kosong.");
    return;
  }

  if (!rows.length) {
    els.customerDataList.innerHTML = `<div class="empty-state">Customer tidak ditemukan.</div>`;
    const emptyMessage = state.customerHygieneFilter !== CUSTOMER_HYGIENE_FILTER_ALL
      ? "Tidak ada customer di filter cek data ini."
      : "Tidak ada customer yang cocok dengan pencarian.";
    setCustomerDataStatus(statusMessage || emptyMessage);
    return;
  }

  els.customerDataList.innerHTML = rows
    .map((customer) => `
      <form class="customer-card" data-customer-id="${escapeHtml(customer.id)}" data-original-name="${escapeHtml(customer.name)}">
        <label class="customer-name-field">
          Nama customer
          <span class="customer-wrap-editor" role="textbox" tabindex="0" contenteditable="plaintext-only" data-wrap-field="name" aria-label="Nama customer">${escapeHtml(customer.name)}</span>
          <input name="name" type="hidden" value="${escapeHtml(customer.name)}">
        </label>
        <label class="customer-tag-field">
          Tag alamat
          <span class="customer-wrap-editor" role="textbox" tabindex="0" contenteditable="plaintext-only" data-wrap-field="tag" data-placeholder="Otomatis" aria-label="Tag alamat">${escapeHtml(customer.tag)}</span>
          <input name="tag" type="hidden" value="${escapeHtml(customer.tag)}">
        </label>
        <label class="customer-shipping-field">
          Ongkir
          <span class="customer-money-input">
            <span>Rp</span>
            <input name="defaultShipping" type="text" inputmode="numeric" value="${escapeHtml(formatIntegerInput(customer.shipping))}">
          </span>
        </label>
        <label class="customer-deposit-field">
          Deposit
          <span class="customer-money-input">
            <span>Rp</span>
            <input name="depositBalance" type="text" inputmode="numeric" value="${escapeHtml(formatIntegerInput(customer.depositBalance))}">
          </span>
        </label>
        <button class="primary-button customer-save-button" type="submit">Simpan</button>
        <button class="ghost-button danger customer-remove-button" type="button" data-delete-customer="${escapeHtml(customer.id)}" data-customer-name="${escapeHtml(customer.name)}" aria-label="Hapus ${escapeHtml(customer.name)}" title="Hapus customer">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-trash"></use></svg>
        </button>
        ${renderCustomerHygieneFlags(customer, hygieneAnalysis)}
        ${customer.aliases.length ? `<div class="customer-alias-copy"><span>${escapeHtml(customer.aliases.join(", "))}</span></div>` : ""}
      </form>
    `)
    .join("");

  const statusText = state.customerSearch
    ? `${rows.length} customer cocok.`
    : `${rows.length} customer tersimpan.`;
  setCustomerDataStatus(statusMessage || statusText);
}

async function openCustomerDataManager() {
  state.customerSearch = "";
  state.customerTagFilter = CUSTOMER_TAG_FILTER_ALL;
  state.customerHygieneFilter = CUSTOMER_HYGIENE_FILTER_ALL;
  if (els.customerSearchInput) els.customerSearchInput.value = "";
  renderCustomerDataList("Memuat data customer...");
  openModal(els.customerDataModal, els.customerSearchInput);
  await loadCustomers({ toast: false });
}

function openAddCustomerDialog() {
  els.addCustomerForm?.reset();
  if (els.addCustomerTagInput) els.addCustomerTagInput.value = "";
  if (els.addCustomerShippingInput) els.addCustomerShippingInput.value = "0";
  if (els.addCustomerDepositInput) els.addCustomerDepositInput.value = "0";
  openModal(els.addCustomerModal, els.addCustomerNameInput);
}

async function saveNewCustomer(form) {
  const nameInput = form?.elements?.name;
  const tagInput = form?.elements?.tag;
  const shippingInput = form?.elements?.defaultShipping;
  const depositInput = form?.elements?.depositBalance;
  const aliasesInput = form?.elements?.aliases;
  const submitButton = form?.querySelector('button[type="submit"]');
  const customerName = String(nameInput?.value || "").trim();
  const defaultShipping = parseIntegerInput(shippingInput?.value || 0);
  const depositBalance = parseIntegerInput(depositInput?.value || 0);
  const aliases = String(aliasesInput?.value || "").trim();
  const customerTag = resolveCustomerTag(customerName, parseAliasList(aliases), tagInput?.value || "");

  if (!customerName) {
    setCustomerDataStatus("Nama customer tidak boleh kosong.", { toast: true, variant: "error" });
    nameInput?.focus();
    return;
  }

  if (shippingInput) shippingInput.value = formatIntegerInput(defaultShipping);
  if (depositInput) depositInput.value = formatIntegerInput(depositBalance);
  if (tagInput) tagInput.value = customerTag;
  if (submitButton) submitButton.disabled = true;
  setCustomerDataStatus("Menyimpan customer baru...");

  try {
    const data = await createCustomerInDatabase({
      name: customerName,
      tag: customerTag,
      defaultShipping,
      depositBalance,
      aliases,
    });
    if (data.customer) state.customers.unshift(data.customer);
    invalidateCustomerProfilesCache();
    els.addCustomerModal?.close();
    renderCustomerSuggestions();
    renderCustomerProfileHint();
    renderCustomerDataList("Customer baru tersimpan.");
    showToast("Customer baru tersimpan.", { title: "Data Customer", variant: "success" });
  } catch (error) {
    setCustomerDataStatus(error.message || "Customer gagal disimpan.", { toast: true, variant: "error" });
  } finally {
    if (submitButton?.isConnected) submitButton.disabled = false;
  }
}

async function removeCustomerData(button) {
  const customerId = String(button?.dataset?.deleteCustomer || "").trim();
  const customerName = String(button?.dataset?.customerName || "customer ini").trim();
  if (!customerId) {
    setCustomerDataStatus("ID customer tidak valid.", { toast: true, variant: "error" });
    return;
  }

  const confirmed = await openAppConfirm({
    eyebrow: "Data Customer",
    title: "Hapus customer?",
    message: `${customerName} akan dihapus dari Data Customer.`,
    note: "Riwayat transaksi lama tetap aman.",
    confirmText: "Ya, hapus",
    variant: "danger",
  });
  if (!confirmed) return;

  button.disabled = true;
  setCustomerDataStatus("Menghapus data customer...");

  try {
    await deleteCustomerInDatabase(customerId);
    state.customers = state.customers.filter((customer) => String(customer.id) !== customerId);
    invalidateCustomerProfilesCache();
    renderCustomerSuggestions();
    renderCustomerProfileHint();
    renderCustomerDataList("Data customer dihapus.");
    showToast("Data customer dihapus.", { title: "Data Customer", variant: "success" });
  } catch (error) {
    setCustomerDataStatus(error.message || "Data customer gagal dihapus.", { toast: true, variant: "error" });
  } finally {
    if (button.isConnected) button.disabled = false;
  }
}

async function mergeCustomerGroup(form) {
  const ids = String(form?.dataset?.customerIds || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const targetId = String(form?.elements?.targetId?.value || "").trim();
  const duplicateIds = ids.filter((id) => id !== targetId);
  const submitButton = form?.querySelector('button[type="submit"]');

  if (!targetId || !duplicateIds.length) {
    setCustomerDataStatus("Pilih data utama untuk merge.", { toast: true, variant: "error" });
    return;
  }

  if (submitButton) submitButton.disabled = true;
  setCustomerDataStatus("Menggabungkan data customer...");

  try {
    await mergeCustomersInDatabase({ targetId, duplicateIds });
    await loadCustomers({ toast: false });
    setCustomerDataStatus("Data mirip sudah digabung.");
    showToast("Data customer mirip sudah digabung.", { title: "Data Customer", variant: "success" });
  } catch (error) {
    setCustomerDataStatus(error.message || "Data customer gagal digabung.", { toast: true, variant: "error" });
  } finally {
    if (submitButton?.isConnected) submitButton.disabled = false;
  }
}

async function saveCustomerDataForm(form) {
  const customerId = String(form?.dataset?.customerId || "").trim();
  const originalName = String(form?.dataset?.originalName || "").trim();
  form?.querySelectorAll?.(".customer-wrap-editor").forEach((editor) => {
    syncCustomerWrapEditor(editor, { trim: true });
  });
  const nameInput = form?.elements?.name;
  const tagInput = form?.elements?.tag;
  const shippingInput = form?.elements?.defaultShipping;
  const depositInput = form?.elements?.depositBalance;
  const submitButton = form?.querySelector('button[type="submit"]');
  const customerName = String(nameInput?.value || "").trim();
  const defaultShipping = parseIntegerInput(shippingInput?.value || 0);
  const depositBalance = parseIntegerInput(depositInput?.value || 0);
  const customerTag = resolveCustomerTag(customerName, [], tagInput?.value || "");

  if (!customerId) {
    setCustomerDataStatus("ID customer tidak valid.", { toast: true, variant: "error" });
    return;
  }
  if (!customerName) {
    setCustomerDataStatus("Nama customer tidak boleh kosong.", { toast: true, variant: "error" });
    nameInput?.focus();
    return;
  }

  if (shippingInput) shippingInput.value = formatIntegerInput(defaultShipping);
  if (depositInput) depositInput.value = formatIntegerInput(depositBalance);
  if (tagInput) tagInput.value = customerTag;
  if (submitButton) submitButton.disabled = true;
  setCustomerDataStatus("Menyimpan data customer...");

  try {
    const data = await updateCustomerInDatabase(customerId, {
      name: customerName,
      tag: customerTag,
      defaultShipping,
      depositBalance,
    });
    const updated = data.customer || {};
    const normalized = normalizeCustomerRecord(updated);
    if (!normalized.id) throw new Error("Data customer belum balik dari server.");

    const customerIndex = state.customers.findIndex((customer) => String(customer.id) === normalized.id);
    if (customerIndex >= 0) {
      state.customers[customerIndex] = { ...state.customers[customerIndex], ...updated };
    } else {
      state.customers.unshift(updated);
    }
    invalidateCustomerProfilesCache();

    const activeCustomerKey = normalizeKey(state.sale.customerName);
    const editedCurrentCustomer = activeCustomerKey && [originalName, normalized.name].some((name) => normalizeKey(name) === activeCustomerKey);
    if (editedCurrentCustomer) {
      state.sale.customerName = normalized.name;
      state.sale.shipping = normalized.shipping;
      if (els.customerNameInput) els.customerNameInput.value = normalized.name;
      if (els.shippingInput) els.shippingInput.value = formatIntegerInput(normalized.shipping);
      render();
    }

    await loadCustomers({ toast: false });
    const persisted = state.customers
      .map(normalizeCustomerRecord)
      .find((customer) => customer.id === normalized.id);
    if (!persisted) {
      throw new Error("Data customer tersimpan, tapi belum terbaca ulang dari database.");
    }
    const persistedOk = persisted.name === customerName
      && persisted.shipping === defaultShipping
      && persisted.depositBalance === depositBalance
      && (!customerTag || persisted.tag === customerTag);
    if (!persistedOk) {
      throw new Error("Database belum mengembalikan data terbaru. Coba Muat Ulang lalu simpan lagi.");
    }
    renderCustomerDataList("Data customer tersimpan.");
    showToast("Data customer berhasil diperbarui.", { title: "Data Customer", variant: "success" });
  } catch (error) {
    setCustomerDataStatus(error.message || "Data customer gagal disimpan.", { toast: true, variant: "error" });
  } finally {
    if (submitButton?.isConnected) submitButton.disabled = false;
  }
}

function updateSaleCustomerName(value, options = {}) {
  const previousCustomerKey = normalizeKey(state.sale.customerName);
  const nextCustomerName = String(value || "");
  const nextCustomerKey = normalizeKey(nextCustomerName);
  state.sale.customerName = nextCustomerName;
  resetCheckoutWarnings();

  const shouldApplyDefaults = nextCustomerKey && (options.forceDefaults || nextCustomerKey !== previousCustomerKey);
  if (shouldApplyDefaults && applyCustomerDefaults(nextCustomerName)) {
    els.shippingInput.value = formatIntegerInput(state.sale.shipping);
  }

  renderCustomerProfileHint();
  render();
}

function getProductIdentityKeys(product) {
  const keys = [];
  const skuKey = normalizeKey(product?.sku);
  if (skuKey) return [`sku:${skuKey}`];

  const priceKey = Math.max(0, Number(product?.price || 0));

  getProductMatchTerms(product).forEach((term) => {
    const key = normalizeKey(term);
    if (key) keys.push(`menu:${key}|harga:${priceKey}`);
  });

  return [...new Set(keys)];
}

function sameProductIdentity(left, right) {
  const leftKeys = new Set(getProductIdentityKeys(left));
  return getProductIdentityKeys(right).some((key) => leftKeys.has(key));
}

function getDuplicateProductGroups() {
  const parent = new Map();
  const find = (id) => {
    const current = parent.get(id) || id;
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  };
  const keyOwners = new Map();

  state.products.forEach((product) => {
    parent.set(product.id, product.id);
    getProductIdentityKeys(product).forEach((key) => {
      const ownerId = keyOwners.get(key);
      if (ownerId) union(ownerId, product.id);
      else keyOwners.set(key, product.id);
    });
  });

  const groupsByRoot = new Map();
  state.products.forEach((product) => {
    const root = find(product.id);
    const group = groupsByRoot.get(root) || [];
    group.push(product);
    groupsByRoot.set(root, group);
  });

  return [...groupsByRoot.values()].filter((group) => group.length > 1);
}

function isSaleDeleted(sale) {
  return Boolean(String(sale?.deleted_at || "").trim());
}

function saleMatchesStatus(sale) {
  if (state.salesStatus === "deleted") return isSaleDeleted(sale);
  if (state.salesStatus === "all") return true;
  return !isSaleDeleted(sale);
}

function getActiveSales() {
  return state.sales.filter((sale) => !isSaleDeleted(sale));
}

function getSelectedSales() {
  const range = getSalesRangeDates();
  return state.sales.filter((sale) => saleMatchesStatus(sale) && isSaleInDateRange(sale, range));
}

function saleMatchesSearch(sale, query) {
  if (!query) return true;
  return getSaleSearchKey(sale).includes(query);
}

function getSaleSearchKey(sale) {
  if (!sale || typeof sale !== "object") return "";
  const cached = saleSearchKeyCache.get(sale);
  if (cached) return cached;

  const itemText = (Array.isArray(sale.items) ? sale.items : [])
    .map((item) => `${getReceiptItemDisplayName(item)} ${item.name || ""} ${item.sku || ""} ${item.note || ""}`)
    .join(" ");
  const searchKey = normalizeKey(`${sale.receipt_no || ""} ${sale.payment || ""} ${sale.customer_name || ""} ${sale.customerName || ""} ${sale.customer_address || ""} ${sale.customerAddress || ""} ${sale.chat_date || ""} ${sale.chatDate || ""} ${sale.order_note || ""} ${sale.orderNote || ""} ${sale.due_text || ""} ${sale.dueText || ""} ${itemText}`);
  saleSearchKeyCache.set(sale, searchKey);
  return searchKey;
}

function prepareSalesForSearch(sales = []) {
  sales.forEach(getSaleSearchKey);
  return sales;
}

function getSaleSortTime(sale) {
  const time = Date.parse(sale.completed_at || sale.completedAt || sale.created_at || "");
  return Number.isFinite(time) ? time : 0;
}

function getVisibleSales() {
  const query = normalizeKey(state.salesSearch);
  const direction = state.salesSort === "oldest" ? 1 : -1;
  return getSelectedSales()
    .filter((sale) => saleMatchesSearch(sale, query))
    .sort((saleA, saleB) => {
      const timeDiff = getSaleSortTime(saleA) - getSaleSortTime(saleB);
      if (timeDiff) return timeDiff * direction;
      return String(saleA.receipt_no || "").localeCompare(String(saleB.receipt_no || "")) * direction;
    });
}

function getSaleShipping(sale) {
  return Number(sale.shipping || sale.discount || 0);
}

function getShippingCourierForTag(tag) {
  const normalizedTag = normalizeCustomerTag(tag);
  return SHIPPING_COURIER_BY_TAG.get(normalizedTag) || "";
}

function getSaleShippingCourierLabel(sale) {
  const tag = resolveSaleShippingTag(sale);
  if (!tag) return "-";
  return getShippingCourierForTag(tag) || SHIPPING_COURIER_UNMAPPED_LABEL;
}

function getShippingTagSortIndex(tag) {
  const normalizedTag = normalizeCustomerTag(tag);
  const index = CUSTOMER_TAG_FILTER_ORDER.indexOf(normalizedTag);
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

function getShippingCourierSortIndex(courier) {
  const index = SHIPPING_COURIER_ORDER.indexOf(courier);
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

function resolveSaleShippingTag(sale) {
  const possibleNames = [
    sale?.customer_name,
    sale?.customerName,
    sale?.customer_address,
    sale?.customerAddress,
    getCustomerNameFromSale(sale),
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const seenKeys = new Set();

  for (const name of possibleNames) {
    const key = normalizeKey(name);
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);
    const profile = getCustomerProfile(name);
    const profileTag = normalizeCustomerTag(profile?.tag || "");
    if (profileTag) return profileTag;
  }

  return normalizeCustomerTag(
    inferCustomerAddressTag(
      sale?.customer_name,
      sale?.customerName,
      sale?.customer_address,
      sale?.customerAddress,
      sale?.order_note,
      sale?.orderNote
    )
  );
}

function buildCourierShippingSummary(sales = []) {
  const tagMap = new Map();
  const courierMap = new Map();
  let total = 0;
  let transactionCount = 0;

  sales.forEach((sale) => {
    const shipping = getSaleShipping(sale);
    if (shipping <= 0) return;

    const tag = resolveSaleShippingTag(sale);
    const tagLabel = tag || SHIPPING_TAG_UNMAPPED_LABEL;
    const courier = getShippingCourierForTag(tag) || SHIPPING_COURIER_UNMAPPED_LABEL;
    const tagKey = `${courier}|${tagLabel}`;
    const tagEntry = tagMap.get(tagKey) || { tag: tagLabel, courier, count: 0, total: 0 };
    const courierEntry = courierMap.get(courier) || {
      courier,
      name: courier,
      count: 0,
      total: 0,
      tags: new Map(),
    };
    const courierTagEntry = courierEntry.tags.get(tagLabel) || { tag: tagLabel, count: 0, total: 0 };

    total += shipping;
    transactionCount += 1;
    tagEntry.count += 1;
    tagEntry.total += shipping;
    courierEntry.count += 1;
    courierEntry.total += shipping;
    courierTagEntry.count += 1;
    courierTagEntry.total += shipping;

    tagMap.set(tagKey, tagEntry);
    courierEntry.tags.set(tagLabel, courierTagEntry);
    courierMap.set(courier, courierEntry);
  });

  const sortTags = (left, right) => {
    const courierDiff = getShippingCourierSortIndex(left.courier) - getShippingCourierSortIndex(right.courier);
    if (courierDiff) return courierDiff;
    const tagDiff = getShippingTagSortIndex(left.tag) - getShippingTagSortIndex(right.tag);
    if (tagDiff) return tagDiff;
    return left.tag.localeCompare(right.tag, "id-ID");
  };

  const byTag = [...tagMap.values()].sort(sortTags);
  const byCourier = [...courierMap.values()]
    .map((entry) => ({
      ...entry,
      tags: [...entry.tags.values()].sort((left, right) => {
        const tagDiff = getShippingTagSortIndex(left.tag) - getShippingTagSortIndex(right.tag);
        if (tagDiff) return tagDiff;
        return left.tag.localeCompare(right.tag, "id-ID");
      }),
    }))
    .sort((left, right) => {
      const courierDiff = getShippingCourierSortIndex(left.courier) - getShippingCourierSortIndex(right.courier);
      if (courierDiff) return courierDiff;
      return left.courier.localeCompare(right.courier, "id-ID");
    });

  return { total, transactionCount, byTag, byCourier };
}

function getSaleItemCount(sale) {
  return (Array.isArray(sale.items) ? sale.items : []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

function getSalesCalendarStats(dateKey) {
  const sales = state.sales.filter((sale) => saleMatchesStatus(sale) && getSaleDateKey(sale) === dateKey);
  return {
    count: sales.length,
    revenue: sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0),
    itemCount: sales.reduce((sum, sale) => sum + getSaleItemCount(sale), 0),
  };
}

function getSalesDateMeta(dateKey) {
  const stats = getSalesCalendarStats(dateKey);
  if (!stats.count) return "Tidak ada transaksi";
  return `${stats.count} transaksi · ${currency.format(stats.revenue)}`;
}

function addMonthsToMonthKey(monthKey, delta) {
  const [year, month] = String(monthKey || getLocalDateKey().slice(0, 7))
    .split("-")
    .map((part) => Number.parseInt(part, 10));
  const date = new Date(year || new Date().getFullYear(), (month || new Date().getMonth() + 1) - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatCalendarMonthLabel(monthKey) {
  const [year, month] = String(monthKey || getLocalDateKey().slice(0, 7))
    .split("-")
    .map((part) => Number.parseInt(part, 10));
  return new Date(year || new Date().getFullYear(), (month || 1) - 1, 1).toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });
}

function setSalesCalendarMonthFromDate(dateKey) {
  state.salesCalendar.month = String(dateKey || getLocalDateKey()).slice(0, 7);
}

function renderSalesDateControls(range = getSalesRangeDates()) {
  const allMode = state.salesRange === "all";
  const startMeta = allMode ? `${getSelectedSales().length} transaksi` : getSalesDateMeta(range.start);
  const endMeta = allMode || range.start === range.end ? startMeta : getSalesDateMeta(range.end);

  if (els.salesStartDateText) els.salesStartDateText.textContent = allMode ? "Semua tanggal" : formatShortDateLabel(range.start);
  if (els.salesEndDateText) els.salesEndDateText.textContent = allMode ? "Semua tanggal" : formatShortDateLabel(range.end);
  if (els.salesStartDateMeta) els.salesStartDateMeta.textContent = startMeta;
  if (els.salesEndDateMeta) els.salesEndDateMeta.textContent = endMeta;

  [els.salesStartDateButton, els.salesEndDateButton].forEach((button) => {
    if (!button) return;
    button.disabled = allMode;
    button.setAttribute("aria-expanded", String(!els.salesCalendarPopover?.hidden && !allMode));
  });

  if (els.previousSalesDateButton) els.previousSalesDateButton.disabled = allMode;
  if (els.nextSalesDateButton) els.nextSalesDateButton.disabled = allMode;
}

function updateSalesCalendarInfo(dateKey = "") {
  if (!els.salesCalendarInfo) return;
  const targetDate = dateKey || state.salesCalendar.hoverDate || (state.salesCalendar.field === "end" ? state.salesEndDate : state.salesStartDate) || state.salesDate;
  const stats = getSalesCalendarStats(targetDate);
  const label = formatDateLabel(targetDate);
  els.salesCalendarInfo.classList.toggle("empty", !stats.count);
  els.salesCalendarInfo.innerHTML = stats.count
    ? `<strong>${escapeHtml(label)}</strong><span class="sales-calendar-chip success">${stats.count} transaksi · ${stats.itemCount} item · ${currency.format(stats.revenue)}</span>`
    : `<strong>${escapeHtml(label)}</strong><span class="sales-calendar-chip danger">Belum ada transaksi</span>`;
}

function renderSalesCalendar() {
  if (!els.salesCalendarPopover || els.salesCalendarPopover.hidden || !els.salesCalendarGrid) return;

  const monthKey = state.salesCalendar.month || getLocalDateKey().slice(0, 7);
  const [year, month] = monthKey.split("-").map((part) => Number.parseInt(part, 10));
  const firstDate = new Date(year, month - 1, 1);
  const gridStart = new Date(year, month - 1, 1 - firstDate.getDay());
  const range = getSalesRangeDates();
  const todayKey = getLocalDateKey();
  const currentMonthIndex = month - 1;

  if (els.salesCalendarTitle) els.salesCalendarTitle.textContent = formatCalendarMonthLabel(monthKey);

  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    const dateKey = getLocalDateKey(day);
    const stats = getSalesCalendarStats(dateKey);
    const inRange = state.salesRange !== "all" && compareDateKeys(dateKey, range.start) >= 0 && compareDateKeys(dateKey, range.end) <= 0;
    const classes = [
      "sales-calendar-day",
      day.getMonth() !== currentMonthIndex ? "other-month" : "",
      dateKey === todayKey ? "today" : "",
      stats.count ? "has-sales" : "",
      dateKey === range.start ? "selected-start" : "",
      dateKey === range.end ? "selected-end" : "",
      (dateKey === range.start || dateKey === range.end) && !stats.count ? "selected-empty" : "",
      inRange ? "in-range" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return `
      <button class="${classes}" type="button" data-calendar-date="${dateKey}" aria-label="${escapeHtml(formatDateLabel(dateKey))}, ${stats.count ? `${stats.count} transaksi` : "tanpa transaksi"}">
        <span class="calendar-day-dot" aria-hidden="true"></span>
        <span class="calendar-day-number">${day.getDate()}</span>
      </button>
    `;
  }).join("");

  els.salesCalendarGrid.innerHTML = days;
  updateSalesCalendarInfo();
}

function openSalesCalendar(field = "start") {
  if (!els.salesCalendarPopover || state.salesRange === "all") return;
  state.salesCalendar.field = field === "end" ? "end" : "start";
  state.salesCalendar.hoverDate = "";
  setSalesCalendarMonthFromDate(state.salesCalendar.field === "end" ? state.salesEndDate : state.salesStartDate);
  els.salesCalendarPopover.hidden = false;
  renderSalesDateControls();
  renderSalesCalendar();
}

function closeSalesCalendar() {
  if (!els.salesCalendarPopover || els.salesCalendarPopover.hidden) return;
  els.salesCalendarPopover.hidden = true;
  state.salesCalendar.hoverDate = "";
  renderSalesDateControls();
}

function selectSalesCalendarDate(dateKey) {
  if (!dateKey) return;
  if (state.salesRange === "day") {
    setSalesDate(dateKey);
  } else if (state.salesRange === "week") {
    state.salesEndDate = dateKey;
    state.salesDate = dateKey;
    renderSalesDashboard();
    saveState();
  } else {
    const start = state.salesCalendar.field === "start" ? dateKey : state.salesStartDate;
    const end = state.salesCalendar.field === "end" ? dateKey : state.salesEndDate;
    setCustomSalesRange(start, end);
  }
  closeSalesCalendar();
}

function saleToReceiptPayload(sale) {
  return {
    receiptNo: sale.receiptNo || sale.receipt_no,
    completedAt: sale.completedAt || sale.completed_at,
    storeName: sale.storeName || sale.store_name || state.settings.storeName,
    storeAddress: sale.storeAddress || state.settings.storeAddress,
    footer: sale.footer || state.settings.footer,
    receiptWidth: sale.receiptWidth || state.settings.receiptWidth,
    receiptFontSize: sale.receiptFontSize || state.settings.receiptFontSize,
    receiptMode: sale.receiptMode || state.settings.receiptMode,
    payment: sale.payment || state.sale.payment,
    customerName: sale.customerName || sale.customer_name || sale.customerAddress || sale.customer_address || "",
    customerAddress: "",
    chatDate: sale.chatDate || sale.chat_date || "",
    orderNote: sale.orderNote || sale.order_note || "",
    dueText: sale.dueText || sale.due_text || "",
    subtotal: Number(sale.subtotal || 0),
    shipping: getSaleShipping(sale),
    tax: 0,
    total: Number(sale.total || 0),
    usedDeposit: Number(sale.usedDeposit || 0),
    items: Array.isArray(sale.items) ? sale.items : [],
  };
}

function buildDailyReport(sales = getSelectedSales()) {
  const paymentMap = new Map();
  const itemMap = new Map();
  let revenue = 0;
  let subtotal = 0;
  let shippingTotal = 0;
  let itemCount = 0;

  sales.forEach((sale) => {
    const total = Number(sale.total || 0);
    const saleSubtotal = Number(sale.subtotal || 0);
    const saleShipping = getSaleShipping(sale);
    const payment = String(sale.payment || "Lainnya");
    revenue += total;
    subtotal += saleSubtotal;
    shippingTotal += saleShipping;
    const currentPayment = paymentMap.get(payment) || { name: payment, total: 0, count: 0 };
    currentPayment.total += total;
    currentPayment.count += 1;
    paymentMap.set(payment, currentPayment);

    (Array.isArray(sale.items) ? sale.items : []).forEach((item) => {
      const name = getReceiptItemDisplayName(item);
      const quantity = Number(item.quantity || 0);
      const lineTotal = Number(item.line_total || item.lineTotal || 0);
      itemCount += quantity;
      const current = itemMap.get(name) || { name, quantity: 0, total: 0 };
      current.quantity += quantity;
      current.total += lineTotal;
      itemMap.set(name, current);
    });
  });

  return {
    transactionCount: sales.length,
    revenue,
    subtotal,
    shippingTotal,
    shippingSummary: buildCourierShippingSummary(sales),
    itemCount,
    average: sales.length ? Math.round(revenue / sales.length) : 0,
    payments: [...paymentMap.values()]
      .sort((left, right) => right.total - left.total),
    itemTotals: [...itemMap.values()]
      .sort((left, right) => right.quantity - left.quantity || right.total - left.total || left.name.localeCompare(right.name)),
  };
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[";\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadTextFile(filename, content, type = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(reader.error || new Error("File backup tidak bisa dibaca."));
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64, type = "application/octet-stream") {
  const binary = atob(String(base64 || ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type });
}

function updateConnectionUI() {
  const online = navigator.onLine;
  els.connectionCard.classList.toggle("online", online);
  els.connectionText.textContent = online ? "Terhubung - siap sinkron" : "Tidak ada internet - pakai data tersimpan";
  els.lastSyncText.textContent = `${formatSyncTime(state.sync.lastSyncAt)}. ${state.products.length} barang tersimpan.`;
  checkBackendConnection();
}

async function checkBackendConnection() {
  const dots = [els.topbarConnectionDot, els.sidebarConnectionDot];
  const texts = [els.topbarConnectionText, els.sidebarConnectionText];
  
  const setStatus = (status, label) => {
    dots.forEach((dot) => {
      if (dot) dot.className = `status-dot ${status}`;
    });
    texts.forEach((txt) => {
      if (txt) txt.textContent = label;
    });
  };

  setStatus("connecting", "Menghubungkan...");

  if (state.settings.dbMode === "supabase") {
    if (!navigator.onLine) {
      setStatus("offline", "Offline");
      return;
    }
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from("sales").select("id").limit(1);
      if (error) {
        setStatus("offline", "Cloud Error");
      } else {
        setStatus("online", "Online");
      }
    } catch (err) {
      setStatus("offline", "Offline");
    }
    return;
  }

  try {
    const res = await window.fetch("/api/health", { cache: "no-store" });
    if (res.ok) {
      setStatus("online", "Online");
    } else {
      setStatus("offline", "Offline");
    }
  } catch (err) {
    setStatus("offline", "Offline");
  }
}


function parseMoney(value) {
  if (typeof value === "number") return Math.max(0, value);
  const cleaned = String(value ?? "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function parseIntegerInput(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return 0;
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function formatIntegerInput(value) {
  if (typeof value === "number") return integerFormatter.format(Math.max(0, Math.trunc(value)));
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return integerFormatter.format(Number.parseInt(digits, 10));
}

function formatMoneyInput(input) {
  const value = input.value;
  const cursorPosition = input.selectionStart || 0;
  const textBeforeCursor = value.substring(0, cursorPosition);
  const digitsBeforeCursor = textBeforeCursor.replace(/\D/g, "").length;

  const formatted = formatIntegerInput(value);
  input.value = formatted;

  let newCursorPos = 0;
  let digitCount = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i])) {
      digitCount++;
    }
    newCursorPos = i + 1;
    if (digitCount === digitsBeforeCursor) {
      break;
    }
  }

  input.setSelectionRange(newCursorPos, newCursorPos);
}

function parseStock(value) {
  const parsed = Number.parseInt(String(value ?? "").replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function parseStockInfo(value) {
  const normalized = normalizeKey(value);
  const unlimitedWords = ["unlimited", "bebas", "tanpabatas", "tidakterbatas", "tak terbatas", "takbatas", "infinite"];
  const stockUnlimited = normalized === "∞" || unlimitedWords.some((word) => normalized.includes(normalizeKey(word)));
  return {
    stock: stockUnlimited ? 0 : parseStock(value),
    stockUnlimited,
  };
}

function isStockUnlimited(product) {
  return Boolean(product?.stockUnlimited || product?.unlimitedStock);
}

function getAvailableStock(product) {
  if (!product) return 0;
  if (isStockUnlimited(product)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Number(product.stock || 0) - cartQuantity(product.id));
}

function getStockBadge(product, available = getAvailableStock(product)) {
  if (isStockUnlimited(product)) {
    return { className: "unlimited", label: "Unlimited" };
  }

  if (available <= 0) {
    return { className: "empty", label: "Habis" };
  }

  if (available <= 5) {
    return { className: "low", label: `Menipis · Sisa ${available}` };
  }

  return { className: "safe", label: `Aman · Sisa ${available}` };
}

function makeId(prefix = "item") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readObjectValue(source, keys, fallback = "") {
  if (!source || typeof source !== "object") return fallback;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) return source[key];
  }
  const normalizedMap = Object.entries(source).reduce((record, [key, value]) => {
    record[normalizeKey(key)] = value;
    return record;
  }, {});
  for (const key of keys) {
    const normalizedKey = normalizeKey(key);
    if (Object.prototype.hasOwnProperty.call(normalizedMap, normalizedKey)) return normalizedMap[normalizedKey];
  }
  return fallback;
}

const VARIANT_PRICING_TYPES = new Set(["fixed", "unit", "package", "custom"]);

function normalizePricingType(value) {
  const key = normalizeKey(value || "fixed");
  if (["hargatetap", "fixedprice"].includes(key)) return "fixed";
  if (["persatuan", "perunit", "satuan", "bijian"].includes(key)) return "unit";
  if (["paket", "package"].includes(key)) return "package";
  if (["manual", "hargacustom", "customprice"].includes(key)) return "custom";
  return VARIANT_PRICING_TYPES.has(key) ? key : "fixed";
}

function getVariantTypeLabel(type) {
  const normalized = normalizePricingType(type);
  if (normalized === "unit") return "Per satuan";
  if (normalized === "package") return "Paket";
  if (normalized === "custom") return "Custom";
  return "Harga tetap";
}

function getDefaultVariantId(productId) {
  return `${productId}::normal`;
}

function getHalfVariantId(productId) {
  return `${productId}::half`;
}

function getCustomVariantId(productId) {
  return `${productId}::custom`;
}

function getHalfVariantPrice(price) {
  return Math.round(Number(price || 0) / 2);
}

function getBaseVariantKind(variant = {}, productId = "") {
  const id = String(variant.id || variant.client_id || "").trim();
  const key = normalizeKey(variant.name || "");
  if (id === getDefaultVariantId(productId) || key === "normal") return "normal";
  if (id === getHalfVariantId(productId) || ["1/2", "setengah", "separuh", "halfporsi", "1/2porsi"].includes(key)) return "half";
  if (id === getCustomVariantId(productId) || ["custom", "custominput", "hargacustom", "manual"].includes(key)) return "custom";
  return "";
}

function getBaseVariantDrafts(product = {}) {
  const productId = String(product.id || product.client_id || "draft-menu").trim();
  const price = parseMoney(product.price || 0);
  const baseProduct = { ...product, id: productId, client_id: productId, price };
  return [
    normalizeVariantRecord(
      {
        id: getDefaultVariantId(productId),
        name: "Normal",
        pricingType: "fixed",
        price,
        unitName: "porsi",
        isDefault: true,
        receiptLabel: "",
      },
      baseProduct,
      0
    ),
    normalizeVariantRecord(
      {
        id: getHalfVariantId(productId),
        name: "1/2",
        pricingType: "fixed",
        price: getHalfVariantPrice(price),
        unitName: "porsi",
        receiptLabel: "1/2 porsi",
        isDefault: false,
      },
      baseProduct,
      1
    ),
    normalizeVariantRecord(
      {
        id: getCustomVariantId(productId),
        name: "Custom input",
        pricingType: "custom",
        price: 0,
        unitName: "porsi",
        receiptLabel: "Harga custom",
        isDefault: false,
        allowPriceOverride: true,
      },
      baseProduct,
      2
    ),
  ];
}

function normalizeVariantRecord(variant = {}, product = {}, index = 0) {
  const productId = String(product.id || product.client_id || variant.productId || variant.product_client_id || "").trim();
  const pricingType = normalizePricingType(variant.pricingType || variant.pricing_type);
  const name = String(variant.name || (index === 0 ? "Normal" : `Variasi ${index + 1}`)).trim() || "Normal";
  const id = String(variant.id || variant.client_id || (index === 0 ? getDefaultVariantId(productId) : `${productId}::${makeId("variant")}`)).trim();
  const stockUnlimited = Boolean(
    variant.stockUnlimited ??
      variant.stock_unlimited ??
      product.stockUnlimited ??
      product.stock_unlimited ??
      true
  );
  const unitName = String(variant.unitName || variant.unit_name || (pricingType === "unit" ? "biji" : "porsi")).trim() || "porsi";
  const packageQuantity = Math.max(1, parseIntegerInput(variant.packageQuantity ?? variant.package_quantity ?? 1) || 1);
  const packageUnit = String(variant.packageUnit || variant.package_unit || unitName).trim() || unitName;
  const price = parseMoney(variant.price ?? (index === 0 ? product.price : 0));

  return {
    id,
    client_id: id,
    productId,
    product_client_id: productId,
    name,
    pricingType,
    pricing_type: pricingType,
    price,
    unitName,
    unit_name: unitName,
    packageQuantity,
    package_quantity: packageQuantity,
    packageUnit,
    package_unit: packageUnit,
    receiptLabel: String(variant.receiptLabel || variant.receipt_label || (normalizeKey(name) === "normal" ? "" : name)).trim(),
    receipt_label: String(variant.receiptLabel || variant.receipt_label || (normalizeKey(name) === "normal" ? "" : name)).trim(),
    isDefault: Boolean(variant.isDefault ?? variant.is_default ?? index === 0),
    is_default: Boolean(variant.isDefault ?? variant.is_default ?? index === 0),
    allowQuantityOverride: Boolean(variant.allowQuantityOverride ?? variant.allow_quantity_override ?? true),
    allow_quantity_override: Boolean(variant.allowQuantityOverride ?? variant.allow_quantity_override ?? true),
    allowPriceOverride: Boolean(variant.allowPriceOverride ?? variant.allow_price_override ?? pricingType === "custom"),
    allow_price_override: Boolean(variant.allowPriceOverride ?? variant.allow_price_override ?? pricingType === "custom"),
    stock: stockUnlimited ? 0 : parseStock(variant.stock),
    stockUnlimited,
    stock_unlimited: stockUnlimited,
    aliases: mergeAliasLists(variant.aliases || variant.alias || []),
    sortOrder: parseIntegerInput(variant.sortOrder ?? variant.sort_order ?? index),
    sort_order: parseIntegerInput(variant.sortOrder ?? variant.sort_order ?? index),
    active: variant.active !== false && variant.active !== 0,
    updatedAt: variant.updatedAt || variant.updated_at || "",
  };
}

function ensureProductVariants(product) {
  if (!product) return [];
  const productId = String(product.id || product.client_id || "").trim();
  const sourceVariants = Array.isArray(product?.variants) ? product.variants : [];
  const normalized = sourceVariants
    .map((variant, index) => normalizeVariantRecord(variant, product, index))
    .filter((variant) => variant.name && (variant.pricingType === "custom" || variant.price > 0));
  const findBase = (kind) => normalized.find((variant) => getBaseVariantKind(variant, productId) === kind);
  const normalSeed = findBase("normal") || normalized.find((variant) => variant.isDefault) || normalized[0] || null;
  const normalPrice = parseMoney(normalSeed?.price ?? product.price ?? 0);
  const baseVariants = getBaseVariantDrafts({ ...product, id: productId, price: normalPrice });
  const normalBase = { ...baseVariants[0], ...(normalSeed || {}), id: getDefaultVariantId(productId), client_id: getDefaultVariantId(productId), name: "Normal", pricingType: "fixed", pricing_type: "fixed", price: normalPrice, receiptLabel: "", receipt_label: "", isDefault: true, is_default: true, active: true };
  const halfSeed = findBase("half");
  const halfBase = { ...baseVariants[1], ...(halfSeed || {}), id: getHalfVariantId(productId), client_id: getHalfVariantId(productId), name: "1/2", pricingType: "fixed", pricing_type: "fixed", price: getHalfVariantPrice(normalPrice), receiptLabel: "1/2 porsi", receipt_label: "1/2 porsi", isDefault: false, is_default: false, active: true };
  const customSeed = findBase("custom");
  const customBase = { ...baseVariants[2], ...(customSeed || {}), id: getCustomVariantId(productId), client_id: getCustomVariantId(productId), name: "Custom input", pricingType: "custom", pricing_type: "custom", price: 0, receiptLabel: "Harga custom", receipt_label: "Harga custom", allowPriceOverride: true, allow_price_override: true, isDefault: false, is_default: false, active: true };
  const otherVariants = normalized.filter((variant) => !getBaseVariantKind(variant, productId));

  const arranged = [normalBase, halfBase, customBase, ...otherVariants];

  let defaultSeen = false;
  arranged.forEach((variant, index) => {
    const kind = getBaseVariantKind(variant, productId);
    variant.productId = productId;
    variant.product_client_id = productId;
    variant.sortOrder = index;
    variant.sort_order = index;
    if (variant.pricingType === "custom") {
      variant.price = 0;
      variant.allowPriceOverride = true;
      variant.allow_price_override = true;
    }
    if (kind === "half") {
      variant.price = getHalfVariantPrice(normalPrice);
    }
    if (kind === "normal") {
      variant.isDefault = true;
      variant.is_default = true;
    }
    if (variant.isDefault && !defaultSeen) {
      defaultSeen = true;
    } else {
      variant.isDefault = false;
      variant.is_default = false;
    }
  });
  if (arranged.length && !defaultSeen) {
    arranged[0].isDefault = true;
    arranged[0].is_default = true;
  }
  return arranged.filter((variant) => variant.name && (getBaseVariantKind(variant, productId) || variant.pricingType === "custom" || variant.price > 0));
}

function normalizeProductRecord(product = {}) {
  const id = String(product.id || product.client_id || makeId("product")).trim();
  const base = {
    ...product,
    id,
    client_id: id,
    sku: String(product.sku || "").trim(),
    name: String(product.name || "").trim(),
    price: parseMoney(product.price),
    stock: parseStock(product.stock),
    stockUnlimited: Boolean(product.stockUnlimited || product.stock_unlimited || product.unlimitedStock),
    category: String(product.category || "").trim() || DEFAULT_CATEGORY,
    aliases: mergeAliasLists(product.aliases || product.alias || []),
    source: String(product.source || "manual").trim() || "manual",
  };
  base.variants = ensureProductVariants(base);
  const defaultVariant = getDefaultVariant(base);
  if (defaultVariant?.price > 0) base.price = defaultVariant.price;
  return base;
}

function normalizeProductsCollection(products = []) {
  const normalized = products
    .map(normalizeProductRecord)
    .filter((product) => product.name && product.price > 0 && product.source !== "virtual");

  const mergeUnique = (left = [], right = []) => mergeAliasLists(left, right);
  const variantMergeKey = (variant) => [
    normalizeKey(variant.name),
    normalizePricingType(variant.pricingType),
    Number(variant.price || 0),
    normalizeKey(variant.unitName),
    normalizeKey(variant.receiptLabel),
  ].join("|");
  const identityKey = (product) => {
    const skuKey = normalizeKey(product.sku);
    if (skuKey) return `sku:${skuKey}`;
    return `menu:${normalizeKey(product.name)}|harga:${Number(product.price || 0)}`;
  };
  const productByIdentity = new Map();
  normalized.forEach((product) => {
    const key = identityKey(product);
    const existing = productByIdentity.get(key);
    if (!existing) {
      productByIdentity.set(key, product);
      return;
    }

    existing.aliases = mergeUnique(existing.aliases, product.aliases);
    existing.stockUnlimited = Boolean(existing.stockUnlimited || product.stockUnlimited);
    existing.stock = existing.stockUnlimited ? 0 : Math.max(Number(existing.stock || 0), Number(product.stock || 0));
    existing.category = existing.category || product.category;
    existing.source = existing.source || product.source;
    const variantByKey = new Map(existing.variants.map((variant) => [variantMergeKey(variant), variant]));
    product.variants.forEach((variant) => {
      const variantKey = variantMergeKey(variant);
      if (!variantByKey.has(variantKey)) {
        variantByKey.set(variantKey, normalizeVariantRecord(variant, existing, variantByKey.size));
      }
    });
    existing.variants = ensureProductVariants({ ...existing, variants: [...variantByKey.values()] });
  });

  const deduped = [...productByIdentity.values()];
  const byName = new Map(deduped.map((product) => [normalizeKey(product.name), product]));
  const variantProductIds = new Set();

  deduped.forEach((product) => {
    const match = String(product.name || "").trim().match(/^(.+?)\s+(1\/2|setengah|separuh|jumbo)$/i);
    if (!match) return;
    const parent = byName.get(normalizeKey(match[1]));
    if (!parent || parent.id === product.id) return;
    const rawVariant = match[2].toLowerCase();
    const variantName = rawVariant === "jumbo" ? "Jumbo" : "1/2";
    const receiptLabel = rawVariant === "jumbo" ? "Jumbo" : "1/2 porsi";
    const alreadyExists = parent.variants.some((variant) => normalizeKey(variant.name) === normalizeKey(variantName) || variant.id === product.id);
    if (!alreadyExists) {
      parent.variants.push(
        normalizeVariantRecord(
          {
            id: product.id,
            name: variantName,
            pricingType: "fixed",
            price: product.price,
            unitName: "porsi",
            receiptLabel,
            stock: product.stock,
            stockUnlimited: product.stockUnlimited,
            aliases: product.aliases,
          },
          parent,
          parent.variants.length
        )
      );
      parent.variants = ensureProductVariants(parent);
    }
    variantProductIds.add(product.id);
  });

  return deduped.filter((product) => !variantProductIds.has(product.id));
}

function getProductVariants(product) {
  if (!product) return [];
  product.variants = ensureProductVariants(product);
  return product.variants.filter((variant) => variant.active !== false);
}

function getDefaultVariant(product) {
  const variants = getProductVariants(product);
  return variants.find((variant) => variant.isDefault) || variants[0] || null;
}

function getProductVariant(product, variantId) {
  const variants = getProductVariants(product);
  return variants.find((variant) => String(variant.id) === String(variantId)) || getDefaultVariant(product);
}

function findProductVariantByPrice(product, price) {
  const targetPrice = parseMoney(price);
  if (!product || targetPrice <= 0) return null;
  return getProductVariants(product).find((variant) => Number(variant.price || 0) === targetPrice) || null;
}

function getCartItemVariant(cartItem) {
  const product = getProduct(cartItem?.productId);
  return product ? getProductVariant(product, cartItem.variantId) : null;
}

function getCartItemUnitPrice(cartItem) {
  const variant = getCartItemVariant(cartItem);
  const customPrice = parseMoney(cartItem?.unitPrice ?? cartItem?.finalPrice);
  if (customPrice > 0) return customPrice;
  return Number(variant?.price || 0);
}

function getCartItemUnitName(cartItem) {
  const variant = getCartItemVariant(cartItem);
  return String(cartItem?.unitName || variant?.unitName || "").trim();
}

function getCartItemLineTotal(cartItem) {
  const explicit = parseMoney(cartItem?.lineTotal);
  if (explicit > 0) return explicit;
  return getCartItemUnitPrice(cartItem) * Number(cartItem?.quantity || 0);
}

function getCartItemReceiptLabel(cartItem, product, variant) {
  const quantity = Number(cartItem?.quantity || 0);
  const unitName = getCartItemUnitName(cartItem);
  const customLabel = String(cartItem?.receiptLabel || "").trim();
  if (customLabel) return customLabel;
  if (variant?.pricingType === "unit" && quantity > 1 && unitName) return `${quantity} ${unitName}`;
  return String(variant?.receiptLabel || (normalizeKey(variant?.name) === "normal" ? "" : variant?.name || "")).trim();
}

function getReceiptItemDisplayName(item = {}) {
  const menuName = String(item.menuName || item.menu_name || item.name || "Item").trim();
  const label = String(item.receiptLabel || item.receipt_label || "").trim();
  const variantName = String(item.variantName || item.variant_name || "").trim();
  const unitName = String(item.unitName || item.unit_name || "").trim();
  const quantity = Number(item.unitQuantity || item.unit_quantity || item.quantity || 0);
  let suffix = label;
  if (!suffix && unitName && quantity > 1 && normalizePricingType(item.pricingType || item.pricing_type) === "unit") suffix = `${quantity} ${unitName}`;
  if (!suffix && variantName && normalizeKey(variantName) !== "normal") suffix = variantName;
  return suffix ? `${menuName} (${suffix})` : menuName;
}

function buildSaleItemFromCart(cartItem) {
  const product = getProduct(cartItem.productId);
  if (!product) return null;
  const variant = getProductVariant(product, cartItem.variantId);
  const quantity = Number(cartItem.quantity || 0);
  const price = getCartItemUnitPrice(cartItem);
  const receiptLabel = getCartItemReceiptLabel(cartItem, product, variant);
  return {
    sku: product.sku || "",
    name: getReceiptItemDisplayName({
      menuName: product.name,
      variantName: variant?.name || "",
      unitName: cartItem.unitName || variant?.unitName || "",
      unitQuantity: cartItem.unitQuantity || quantity,
      quantity,
      pricingType: variant?.pricingType || "fixed",
      receiptLabel,
    }),
    menuName: product.name,
    menu_name: product.name,
    productClientId: product.id,
    product_client_id: product.id,
    variantId: variant?.id || "",
    variantClientId: variant?.id || "",
    variant_client_id: variant?.id || "",
    variantName: variant?.name || "",
    variant_name: variant?.name || "",
    unitName: cartItem.unitName || variant?.unitName || "",
    unit_name: cartItem.unitName || variant?.unitName || "",
    unitQuantity: Number(cartItem.unitQuantity || quantity || 0),
    unit_quantity: Number(cartItem.unitQuantity || quantity || 0),
    pricingType: variant?.pricingType || "fixed",
    pricing_type: variant?.pricingType || "fixed",
    receiptLabel,
    receipt_label: receiptLabel,
    price,
    quantity,
    lineTotal: price * quantity,
    line_total: price * quantity,
    note: String(cartItem.note || "").trim(),
  };
}

function normalizePayment(value) {
  const text = String(value || "Tunai").trim();
  const payment = ["Tunai", "Debit", "QRIS", "Transfer"].find((option) => normalizeKey(option) === normalizeKey(text));
  return payment || "Tunai";
}

function setPaymentDropdownOpen(open) {
  if (!els.paymentSelect || !els.paymentSelectButton) return;
  els.paymentSelect.classList.toggle("open", open);
  els.paymentSelectButton.setAttribute("aria-expanded", String(open));
}

function updatePaymentSelectUI() {
  if (!els.paymentInput) return;
  const payment = normalizePayment(state.sale.payment || els.paymentInput.value);
  els.paymentInput.value = payment;
  if (els.paymentSelectedText) els.paymentSelectedText.textContent = payment;
  if (els.paymentSelectedIcon) els.paymentSelectedIcon.textContent = getPaymentIcon(payment);

  els.paymentOptionButtons.forEach((button) => {
    const active = normalizeKey(button.dataset.paymentOption) === normalizeKey(payment);
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    if (button.getAttribute("role") === "radio") button.setAttribute("aria-checked", String(active));
    button.setAttribute("aria-pressed", String(active));
  });
}

function setPaymentMethod(value, options = {}) {
  state.sale.payment = normalizePayment(value);
  resetCheckoutWarnings();
  updatePaymentSelectUI();
  setPaymentDropdownOpen(false);
  if (options.toast !== false) showToast(`Pembayaran dipilih: ${state.sale.payment}.`, { title: "Pembayaran", duration: 1200 });
  if (options.render !== false) render();
}

function getProductTokens(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function getStringSimilarity(str1, str2) {
  const s1 = String(str1 || "").toLowerCase().trim();
  const s2 = String(str2 || "").toLowerCase().trim();
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;
  
  const getBigrams = (s) => {
    const list = [];
    for (let i = 0; i < s.length - 1; i++) {
      list.push(s.substring(i, i + 2));
    }
    return list;
  };
  
  const b1 = getBigrams(s1);
  const b2 = getBigrams(s2);
  if (!b1.length || !b2.length) return 0.0;
  
  const set2 = new Set(b2);
  let intersection = 0;
  b1.forEach((bigram) => {
    if (set2.has(bigram)) {
      intersection++;
      set2.delete(bigram);
    }
  });
  
  return (2.0 * intersection) / (b1.length + b2.length);
}

function getDraftProductMatchQuery(rawName) {
  const hints = parseDraftNameHints(rawName);
  return hints.name || String(rawName || "").trim();
}

function getDraftProductCandidateScore(product, rawName) {
  const query = getDraftProductMatchQuery(rawName);
  if (!query) return 0;
  const terms = [
    product?.name || "",
    product?.sku || "",
    ...getProductAliases(product),
  ].filter(Boolean);
  const similarityScore = Math.max(0, ...terms.map((term) => getStringSimilarity(query, term))) * 30;
  return Math.max(getProductSearchScore(product, query), similarityScore);
}

function getRankedDraftProductCandidates(products, rawName, threshold = 11) {
  return products
    .map((product) => ({ product, score: getDraftProductCandidateScore(product, rawName) }))
    .filter((candidate) => candidate.score >= threshold)
    .sort((a, b) => b.score - a.score);
}

function isClearDraftProductCandidate(best, runnerUp) {
  if (!best) return false;
  if (!runnerUp) return true;
  if (best.score >= runnerUp.score + 6) return true;
  return best.score >= 30 && best.score >= runnerUp.score * 1.25;
}


function findUniqueProductMatch(products, rawName, sku = "", price = 0, options = {}) {
  const normalizedSku = normalizeKey(sku);
  if (normalizedSku) {
    const bySku = products.find((product) => normalizeKey(product.sku) === normalizedSku);
    if (bySku) return bySku;
  }

  const normalizedName = normalizeKey(rawName);
  if (!normalizedName) return null;
  const rawTokens = getProductTokens(rawName);

  const exactMatches = products.filter((product) => productMatchesName(product, normalizedName));
  const exactPriceMatches = Number(price || 0) > 0 ? exactMatches.filter((product) => productPriceMatches(product, price)) : [];
  if (exactPriceMatches.length) return exactPriceMatches[0];
  if (exactMatches.length === 1) return exactMatches[0];
  if (exactMatches.length > 1) return null;

  const allowContainedMatch = normalizedName.length >= 5 || rawTokens.length >= 2 || Number(price || 0) > 0;
  const containedMatches = products.filter((product) => productContainsName(product, normalizedName));
  const containedPriceMatches = Number(price || 0) > 0 ? containedMatches.filter((product) => productPriceMatches(product, price)) : [];
  if (containedPriceMatches.length === 1) return containedPriceMatches[0];
  if (options.allowFuzzy === false) return null;
  if (allowContainedMatch && containedMatches.length === 1) return containedMatches[0];

  if (rawTokens.length >= 2) {
    let bestMatch = null;
    let bestScore = 0;
    products.forEach((product) => {
      const productTokens = new Set(getProductTokens(`${product.name} ${product.sku} ${getProductAliases(product).join(" ")}`));
      const overlap = rawTokens.filter((token) => productTokens.has(token)).length;
      const score = overlap / rawTokens.length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = product;
      }
    });
    if (bestScore >= 0.75) return bestMatch;
  }

  if (rawTokens.length === 1 && normalizedName.length < 5) return null;

  const rankedMatches = getRankedDraftProductCandidates(products, rawName);
  const autoMatches = rankedMatches.filter((candidate) => candidate.score >= 18);
  const priceMatches = Number(price || 0) > 0 ? autoMatches.filter(({ product }) => productPriceMatches(product, price)) : [];
  const candidates = priceMatches.length ? priceMatches : autoMatches;
  const [bestCandidate, runnerUp] = candidates;
  const nearestRunnerUp = priceMatches.length ? runnerUp : rankedMatches.find((candidate) => candidate.product.id !== bestCandidate?.product.id);
  return isClearDraftProductCandidate(bestCandidate, nearestRunnerUp) ? bestCandidate.product : null;
}

function getPreferredProductsForMatching() {
  const dailyProducts = getDailyMenuProducts();
  return dailyProducts.length ? dailyProducts : state.products;
}

function getParentProduct(product) {
  return product;
}

function getAvailableVariants(parentProduct) {
  return getProductVariants(parentProduct);
}

function parseDraftNameHints(rawName) {
  let name = String(rawName || "").trim();
  let price = 0;
  let unitQuantity = 0;
  let unitName = "";
  const priceMatch = name.match(/\b(?:rp\s*)?(\d+(?:[.,]\d+)?)(\s*k)\b/i) || name.match(/\b(?:rp\s*)?(\d[\d.]*)\b\s*$/i);
  if (priceMatch) {
    const numberText = priceMatch[1];
    const tempPrice = parseMoney(numberText) * (priceMatch[2] ? 1000 : 1);
    if (tempPrice >= 1000) {
      price = tempPrice;
      name = name.replace(priceMatch[0], "").trim();
    }
  }
  const unitMatch = name.match(/\b(\d+)\s*(biji|pcs|pc|buah|porsi|paket|box|bungkus)\b/i);
  if (unitMatch) {
    unitQuantity = Math.max(1, parseIntegerInput(unitMatch[1]) || 1);
    unitName = unitMatch[2].toLowerCase();
    name = name.replace(unitMatch[0], "").trim();
  }
  const variantMatch = name.match(/^(.+?)\s+(1\/2|setengah|separuh|jumbo)$/i);
  const variantName = variantMatch ? (variantMatch[2].toLowerCase() === "jumbo" ? "Jumbo" : "1/2") : "";
  if (variantMatch) name = variantMatch[1].trim();
  return { name, price, unitQuantity, unitName, variantName };
}

function resolveDraftProductVariant(rawName, sku = "", explicitPrice = 0, explicitUnitName = "") {
  const hints = parseDraftNameHints(rawName);
  const price = parseMoney(explicitPrice) || hints.price;
  const requestedUnitName = String(explicitUnitName || hints.unitName || "").trim();
  const product = findUniqueProductMatch(getPreferredProductsForMatching(), hints.name || rawName, sku, price, { ignorePrice: true })
    || findUniqueProductMatch(state.products, hints.name || rawName, sku, price, { ignorePrice: true });
  if (!product) return null;

  let variant = null;
  let priceMatchedVariant = null;
  if (hints.variantName) {
    variant = getProductVariants(product).find((item) => normalizeKey(item.name) === normalizeKey(hints.variantName));
  }
  if (price > 0) {
    priceMatchedVariant = findProductVariantByPrice(product, price);
    if (!variant) variant = priceMatchedVariant;
  }
  if (!variant && requestedUnitName) {
    variant = getProductVariants(product).find((item) => normalizePricingType(item.pricingType) === "unit" && normalizeKey(item.unitName) === normalizeKey(requestedUnitName));
  }
  const overrideVariant = price > 0
    ? getProductVariants(product).find((item) => item.allowPriceOverride || normalizePricingType(item.pricingType) === "custom")
    : null;
  if (!variant && overrideVariant) variant = overrideVariant;
  variant = variant || getDefaultVariant(product);
  const usesExplicitPrice = price > 0 && (!priceMatchedVariant || variant?.allowPriceOverride || normalizePricingType(variant?.pricingType) === "custom");
  return {
    product,
    variant,
    finalPrice: usesExplicitPrice ? price : Number(variant?.price || product.price || 0),
    unitQuantity: hints.unitQuantity || 0,
    unitName: requestedUnitName || variant?.unitName || "",
    receiptLabel: hints.unitQuantity && requestedUnitName ? `${hints.unitQuantity} ${requestedUnitName}` : price > 0 && !priceMatchedVariant ? "Harga custom" : "",
    needsReview: price > 0 && !priceMatchedVariant && !(overrideVariant || variant?.allowPriceOverride),
    rawName: hints.name || rawName,
  };
}

function findDraftProductMatch(rawName, sku = "", price = 0) {
  return resolveDraftProductVariant(rawName, sku, price)?.product || null;
}


function normalizeDraftItem(source) {
  const item = typeof source === "string" ? { name: source } : source || {};
  const rawName = String(readObjectValue(item, ["name", "nama", "barang", "item", "product", "menu"], "")).trim();
  const sku = String(readObjectValue(item, ["sku", "kode"], "")).trim();
  const price = parseMoney(readObjectValue(item, ["price", "harga"], 0));
  const explicitUnitName = String(readObjectValue(item, ["unit", "satuan", "unitName", "unit_name"], "")).trim();
  const explicitProductId = String(readObjectValue(item, ["productId", "product_id"], "")).trim();
  const explicitProduct = explicitProductId ? getProduct(explicitProductId) : null;
  const explicitVariantId = String(readObjectValue(item, ["variantId", "variant_id", "variantClientId", "variant_client_id"], "")).trim();
  const resolved = explicitProduct ? { product: explicitProduct, variant: getProductVariant(explicitProduct, explicitVariantId), finalPrice: price, unitName: explicitUnitName } : resolveDraftProductVariant(rawName, sku, price, explicitUnitName);
  const matchedProduct = explicitProduct || resolved?.product;
  const matchedVariant = resolved?.variant;
  const quantityValue = readObjectValue(item, ["quantity", "qty", "jumlah", "jml"], "");
  const quantity = Math.max(1, parseIntegerInput(quantityValue) || resolved?.unitQuantity || 1);
  const note = String(readObjectValue(item, ["note", "notes", "catatan", "keterangan"], "")).trim();
  const unitName = resolved?.unitName || matchedVariant?.unitName || explicitUnitName || "";
  const receiptLabel = resolved?.receiptLabel || (normalizePricingType(matchedVariant?.pricingType) === "unit" && unitName ? `${quantity} ${unitName}` : "");

  return {
    id: String(readObjectValue(item, ["id"], "")) || makeId("draft-item"),
    rawName,
    sku,
    productId: matchedProduct?.id || "",
    variantId: matchedVariant?.id || "",
    unitPrice: resolved?.finalPrice || matchedVariant?.price || matchedProduct?.price || 0,
    unitName,
    unitQuantity: resolved?.unitQuantity || quantity,
    receiptLabel,
    needsReview: Boolean(resolved?.needsReview),
    quantity,
    note,
  };
}

function refreshImportDraftMatches(options = {}) {
  if (!state.importDrafts.length) return false;
  let changed = false;

  state.importDrafts.forEach((draft) => {
    if (String(draft.customerName || "").trim() && Number(draft.shipping || 0) === 0) {
      changed = applyCustomerDefaults(draft.customerName, draft) || changed;
    }

    draft.items = draft.items.map((item) => {
      if (item.productId && getProduct(item.productId)) return item;
      const refreshed = normalizeDraftItem({
        ...item,
        name: item.rawName || item.name || "",
        price: item.unitPrice || item.price || 0,
      });
      if (!refreshed.productId) return item;
      changed = true;
      return {
        ...item,
        productId: refreshed.productId,
        variantId: refreshed.variantId,
        unitPrice: refreshed.unitPrice,
        unitName: refreshed.unitName,
        unitQuantity: refreshed.unitQuantity || item.unitQuantity,
        receiptLabel: refreshed.receiptLabel,
        needsReview: refreshed.needsReview,
      };
    });
  });

  if (changed) {
    if (options.save !== false) saveState();
    if (options.render !== false) renderBulkDrafts();
  }
  return changed;
}

function normalizeDraftContact(draft) {
  const contactName = String(draft?.contactName || draft?.contact || draft?.namaKontak || draft?.nama_kontak || "").trim();
  const address = String(draft?.customerAddress || draft?.address || draft?.alamat || "").trim();
  const customer = String(draft?.customerName || draft?.customer || draft?.namaCustomer || draft?.pelanggan || draft?.nama || "").trim();
  return {
    ...draft,
    customerName: contactName || address || customer,
    customerAddress: "",
    dueText: "",
    orderNote: "",
  };
}

function normalizeDraftOrder(source) {
  const order = source && typeof source === "object" ? source : {};
  const itemsValue = readObjectValue(order, ["items", "pesanan", "orderItems", "order_items", "detail"], []);
  const itemList = Array.isArray(itemsValue) ? itemsValue : Object.values(itemsValue || {});
  const draftItems = itemList.map(normalizeDraftItem).filter((item) => item.rawName || item.productId);
  const contactName = String(readObjectValue(order, ["contactName", "contact", "namaKontak", "nama_kontak", "kontak"], "")).trim();
  const customer = String(readObjectValue(order, ["customer", "customerName", "namaCustomer", "pelanggan", "nama"], "")).trim();
  const address = String(readObjectValue(order, ["address", "customerAddress", "alamat", "lokasi"], "")).trim();
  const customerName = contactName || address || customer;
  const chatDate = String(readObjectValue(order, ["chatDate", "tanggalChat", "tanggal_chat", "tanggalMasuk", "tanggal_masuk", "waktuChat", "waktu_chat"], "")).trim();
  
  let shipping = parseMoney(readObjectValue(order, ["shipping", "ongkir", "ongkosKirim", "ongkos_kirim"], 0));
  if (shipping === 0 && customerName) {
    const profile = getCustomerProfile(customerName);
    if (profile) {
      shipping = Number(profile.shipping || 0);
    }
  }

  return {
    id: String(readObjectValue(order, ["id"], "")) || makeId("draft"),
    importedAt: new Date().toISOString(),
    customerName,
    customerAddress: "",
    chatDate,
    dueText: "",
    orderNote: "",
    payment: normalizePayment(readObjectValue(order, ["payment", "pembayaran"], "Tunai")),
    shipping,
    items: draftItems,
  };
}

function extractDraftOrders(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  const hasOrderItems = Boolean(readObjectValue(value, ["items", "pesanan", "orderItems", "order_items", "detail"], null));
  const hasOrderIdentity = Boolean(readObjectValue(value, ["customer", "customerName", "namaCustomer", "pelanggan", "nama", "contactName", "namaKontak", "nama_kontak", "kontak", "address", "alamat", "chatDate", "tanggalChat", "tanggal_chat", "dueText", "tanggal", "jadwal"], ""));
  if (hasOrderItems && hasOrderIdentity) return [value];
  const collection = readObjectValue(value, ["orders", "pesanan", "drafts", "draftOrders", "data"], null);
  if (Array.isArray(collection)) return collection;
  if (collection && typeof collection === "object") return Object.values(collection);
  return readObjectValue(value, ["items", "pesanan"], null) ? [value] : [];
}

function parseBulkSummaryJson(text) {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("JSON summary masih kosong.");
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || raw;
  let parsed;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new Error("JSON tidak valid. Cek koma, kurung, dan tanda kutip.");
  }

  const orders = extractDraftOrders(parsed).map(normalizeDraftOrder).filter((draft) => draft.items.length);
  if (!orders.length) throw new Error("JSON terbaca, tapi tidak ada pesanan di dalamnya.");
  return orders;
}

function getBulkCsvCell(row, keys, fallback = "") {
  const value = readObjectValue(row, keys, fallback);
  return String(value ?? "").trim();
}

function parseBulkSummaryCsv(text) {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("CSV summary masih kosong.");
  if (/^[\[{]/.test(raw)) return parseBulkSummaryJson(raw);

  const fenced = raw.match(/```(?:csv)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || raw;
  const rows = parseDelimited(candidate);
  if (!rows.length) throw new Error("CSV terbaca, tapi baris pesanannya kosong.");

  const draftsByKey = new Map();
  let lastMeta = null;

  rows.forEach((row, rowIndex) => {
    const explicitCustomer = getBulkCsvCell(row, ["customer", "kontak", "namaKontak", "namaCustomer", "pelanggan"]);
    const customerName = explicitCustomer || lastMeta?.customerName || "";
    const chatDate = getBulkCsvCell(row, ["chatDate", "tanggalChat", "tanggalMasuk", "waktuChat"]) || (explicitCustomer ? "" : lastMeta?.chatDate || "");
    const payment = normalizePayment(getBulkCsvCell(row, ["payment", "pembayaran"]) || (explicitCustomer ? "Tunai" : lastMeta?.payment || "Tunai"));
    const shippingText = getBulkCsvCell(row, ["ongkir", "shipping", "ongkosKirim"]);
    
    // Ambil default ongkir terakhir dari profile jika di CSV kosong atau 0
    let shipping = shippingText ? parseMoney(shippingText) : explicitCustomer ? 0 : lastMeta?.shipping || 0;
    if (shipping === 0 && customerName) {
      const profile = getCustomerProfile(customerName);
      if (profile) {
        shipping = Number(profile.shipping || 0);
      }
    }

    const rawName = getBulkCsvCell(row, ["item", "menu", "barang", "nama", "name", "produk"]);
    const quantity = getBulkCsvCell(row, ["quantity", "qty", "jumlah", "jml"], "1");
    const unit = getBulkCsvCell(row, ["unit", "satuan", "unitName", "unit_name"]);
    const price = getBulkCsvCell(row, ["price", "harga"]);
    const note = getBulkCsvCell(row, ["note", "catatan", "keterangan"]);
    const sku = getBulkCsvCell(row, ["sku", "kode"]);

    if (!rawName && !quantity && !note) return;

    const groupKey = normalizeKey([customerName, chatDate, payment, shipping].join("|")) || `baris${rowIndex + 1}`;
    if (!draftsByKey.has(groupKey)) {
      draftsByKey.set(groupKey, {
        id: makeId("draft"),
        importedAt: new Date().toISOString(),
        customerName,
        customerAddress: "",
        chatDate,
        dueText: "",
        orderNote: "",
        payment,
        shipping,
        items: [],
      });
    }

    const draft = draftsByKey.get(groupKey);
    draft.items.push(normalizeDraftItem({ name: rawName, sku, quantity, unit, price, note }));
    lastMeta = { customerName, chatDate, payment, shipping };
  });

  const drafts = [...draftsByKey.values()].filter((draft) => draft.items.length);
  if (!drafts.length) throw new Error("CSV terbaca, tapi tidak ada item pesanan di dalamnya.");
  return drafts;
}

function getDraftSubtotal(draft) {
  return draft.items.reduce((sum, item) => {
    const product = getProduct(item.productId);
    if (!product) return sum;
    const variant = getProductVariant(product, item.variantId);
    const price = parseMoney(item.unitPrice) || Number(variant?.price || product.price || 0);
    return sum + price * Number(item.quantity || 0);
  }, 0);
}

function getDraftDisplayName(draft) {
  return String(draft?.customerName || "Draft pesanan").trim();
}

function getDraftIssues(draft) {
  const issues = [];
  if (!String(draft.customerName || "").trim()) issues.push({ message: "Customer/alamat kosong", blocking: false });
  if (!String(draft.chatDate || "").trim()) issues.push({ message: "Tanggal chat kosong", blocking: false });
  if (!draft.items.length) issues.push({ message: "Item kosong", blocking: true });

  draft.items.forEach((item) => {
    const product = getProduct(item.productId);
    if (!product) {
      issues.push({ message: `${item.rawName || "Item"} belum cocok barang`, blocking: true });
      return;
    }
    if (!item.quantity || Number(item.quantity) <= 0) {
      issues.push({ message: `${product.name} jumlah kosong`, blocking: true });
      return;
    }
    if (item.needsReview) {
      issues.push({ message: `${product.name} pakai harga custom, cek variasinya`, blocking: false });
    }
    if (!isStockUnlimited(product) && Number(item.quantity) > Number(product.stock || 0)) {
      issues.push({ message: `${product.name} stok kurang`, blocking: true });
    }
  });

  return issues;
}

function getDraftBlockingIssues(draft) {
  return getDraftIssues(draft).filter((issue) => issue.blocking);
}

function getReadyImportDrafts(drafts = state.importDrafts) {
  return drafts.filter((draft) => !getDraftBlockingIssues(draft).length);
}

function getBulkImportValidation(drafts = state.importDrafts) {
  const summary = {
    draftCount: drafts.length,
    itemCount: 0,
    unmatchedItems: [],
    missingCustomer: 0,
    missingChatDate: 0,
    zeroShipping: 0,
    stockIssues: 0,
  };

  drafts.forEach((draft) => {
    if (!String(draft.customerName || "").trim()) summary.missingCustomer += 1;
    if (!String(draft.chatDate || "").trim()) summary.missingChatDate += 1;
    if (!Number(draft.shipping || 0)) summary.zeroShipping += 1;

    draft.items.forEach((item) => {
      summary.itemCount += Number(item.quantity || 0);
      const product = getProduct(item.productId);
      if (!product) {
        summary.unmatchedItems.push(item.rawName || "Item tanpa nama");
        return;
      }
      if (!isStockUnlimited(product) && Number(item.quantity || 0) > Number(product.stock || 0)) {
        summary.stockIssues += 1;
      }
    });
  });

  return summary;
}

function renderBulkBatchPanel(drafts = state.importDrafts) {
  if (!els.bulkBatchPanel) return;
  if (!drafts.length) {
    els.bulkBatchPanel.hidden = true;
    return;
  }

  const readyCount = getReadyImportDrafts(drafts).length;
  const reviewCount = drafts.length - readyCount;
  els.bulkBatchPanel.hidden = false;
  els.bulkBatchReadyText.textContent = `${readyCount} draft siap diproses`;
  els.bulkBatchReviewText.textContent = reviewCount ? `${reviewCount} draft masih perlu review. Batch hanya memproses yang siap.` : "Semua draft bisa langsung diproses.";
  [els.processReadyDraftsButton, els.processPrintReadyDraftsButton].forEach((button) => {
    if (button) button.disabled = !readyCount || bulkBatchInFlight;
  });
}

function renderBulkImportReview(drafts = state.importDrafts) {
  if (!els.bulkImportReview) return;
  if (!drafts.length) {
    els.bulkImportReview.hidden = true;
    els.bulkImportReview.innerHTML = "";
    return;
  }

  const summary = getBulkImportValidation(drafts);
  const chips = [
    { label: `${summary.draftCount} draft`, variant: "safe" },
    { label: `${summary.itemCount} total item`, variant: "safe" },
    summary.unmatchedItems.length ? { label: `${summary.unmatchedItems.length} item belum cocok menu`, variant: "error" } : null,
    summary.missingCustomer ? { label: `${summary.missingCustomer} customer kosong`, variant: "error" } : null,
    summary.missingChatDate ? { label: `${summary.missingChatDate} tanggal chat kosong`, variant: "" } : null,
    summary.zeroShipping ? { label: `${summary.zeroShipping} ongkir 0`, variant: "" } : null,
    summary.stockIssues ? { label: `${summary.stockIssues} stok kurang`, variant: "error" } : null,
  ].filter(Boolean);
  const examples = summary.unmatchedItems.slice(0, 5).map((name) => escapeHtml(name)).join(", ");
  const copy = summary.unmatchedItems.length
    ? `Cek item yang belum cocok sebelum buka keranjang${examples ? `: ${examples}` : ""}.`
    : "Semua item yang terbaca sudah cocok ke daftar barang.";

  els.bulkImportReview.hidden = false;
  els.bulkImportReview.innerHTML = `
    <div>
      <strong>Validasi import</strong>
      <p>${copy}</p>
      <div class="review-chip-list">
        ${chips.map((chip) => `<span class="review-chip ${chip.variant}">${escapeHtml(chip.label)}</span>`).join("")}
      </div>
    </div>
  `;
}

function getProductSelectOptions(selectedProductId, rawName = "") {
  const cleanRawName = String(rawName || "").trim();
  const topRecommendations = cleanRawName
    ? getRankedDraftProductCandidates(state.products, cleanRawName).slice(0, 3).map((r) => r.product)
    : [];
  const options = [`<option value="">Pilih barang</option>`];

  if (topRecommendations.length > 0) {
    options.push(`<optgroup label="Saran Cocok (Fuzzy Match)">`);
    topRecommendations.forEach((product) => {
      const selected = product.id === selectedProductId ? "selected" : "";
      options.push(`<option value="${escapeHtml(product.id)}" ${selected}>${escapeHtml(product.name)} · ${currency.format(product.price)}</option>`);
    });
    options.push(`</optgroup>`);
    
    options.push(`<optgroup label="Semua Menu">`);
    state.products.forEach((product) => {
      const selected = product.id === selectedProductId ? "selected" : "";
      options.push(`<option value="${escapeHtml(product.id)}" ${selected}>${escapeHtml(product.name)} · ${currency.format(product.price)}</option>`);
    });
    options.push(`</optgroup>`);
  } else {
    state.products.forEach((product) => {
      const selected = product.id === selectedProductId ? "selected" : "";
      options.push(`<option value="${escapeHtml(product.id)}" ${selected}>${escapeHtml(product.name)} · ${currency.format(product.price)}</option>`);
    });
  }

  return options.join("");
}

function setBulkImportStatus(message, options = {}) {
  if (els.bulkImportStatus) els.bulkImportStatus.textContent = message;
  if (options.toast !== false) showToast(message, options);
}

function renderBulkDrafts() {
  if (els.openBulkImportButton) {
    const buttonTitle = state.importDrafts.length ? `Import Pesanan (${state.importDrafts.length})` : "Import Pesanan";
    if (els.openBulkImportButtonTitle) {
      els.openBulkImportButtonTitle.textContent = buttonTitle;
    } else {
      els.openBulkImportButton.textContent = buttonTitle;
    }
    els.openBulkImportButton.setAttribute("aria-label", buttonTitle);
  }
  if (!els.bulkDraftList) return;

  if (els.bulkFilterTabs) {
    els.bulkFilterTabs.hidden = !state.importDrafts.length;
  }
  if (els.bulkSearchLabel) {
    els.bulkSearchLabel.hidden = !state.importDrafts.length;
  }

  if (!state.importDrafts.length) {
    els.bulkDraftList.innerHTML = `<div class="empty-state">Belum ada draft pesanan.</div>`;
    renderBulkBatchPanel([]);
    renderBulkImportReview([]);
    if (els.bulkImportStatus) els.bulkImportStatus.textContent = "Belum ada draft pesanan.";
    return;
  }

  // Hitung jumlah count untuk masing-masing filter tab
  const totalAll = state.importDrafts.length;
  const readyDrafts = getReadyImportDrafts(state.importDrafts);
  const totalReady = readyDrafts.length;
  const totalReview = totalAll - totalReady;

  if (els.bulkFilterAllCount) els.bulkFilterAllCount.textContent = totalAll;
  if (els.bulkFilterReadyCount) els.bulkFilterReadyCount.textContent = totalReady;
  if (els.bulkFilterReviewCount) els.bulkFilterReviewCount.textContent = totalReview;

  // Set active class pada filter buttons
  if (els.bulkFilterTabs) {
    const buttons = els.bulkFilterTabs.querySelectorAll("[data-bulk-filter]");
    buttons.forEach((btn) => {
      const isActive = btn.dataset.bulkFilter === state.bulkDraftFilter;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });
  }

  renderBulkBatchPanel(state.importDrafts);
  renderBulkImportReview(state.importDrafts);

  // Saring draft berdasarkan filter aktif dan kata kunci pencarian
  const searchQuery = String(state.bulkDraftSearch || "").trim().toLowerCase();

  let filteredDrafts = state.importDrafts.filter((draft) => {
    if (state.bulkDraftFilter === "ready") {
      return getDraftBlockingIssues(draft).length === 0;
    }
    if (state.bulkDraftFilter === "review") {
      return getDraftBlockingIssues(draft).length > 0;
    }
    return true; // "all"
  });

  if (searchQuery) {
    filteredDrafts = filteredDrafts.filter((draft) => {
      const nameMatch = String(draft.customerName || "").toLowerCase().includes(searchQuery);
      const addressMatch = String(draft.customerAddress || "").toLowerCase().includes(searchQuery);
      return nameMatch || addressMatch;
    });
  }

  if (!filteredDrafts.length) {
    let emptyMessage = "Belum ada draft pesanan.";
    if (searchQuery) {
      emptyMessage = "Tidak ada draft yang cocok dengan pencarian.";
    } else if (state.bulkDraftFilter === "review") {
      emptyMessage = "Tidak ada draft yang perlu review.";
    } else if (state.bulkDraftFilter === "ready") {
      emptyMessage = "Tidak ada draft yang siap.";
    }
    els.bulkDraftList.innerHTML = `<div class="empty-state">${emptyMessage}</div>`;
    return;
  }

  els.bulkDraftList.innerHTML = filteredDrafts
    .map((draft, draftIndex) => {
      const issues = getDraftIssues(draft);
      const blocking = issues.some((issue) => issue.blocking);
      const subtotal = getDraftSubtotal(draft);
      const total = subtotal + Number(draft.shipping || 0);
      const statusClass = issues.length ? "low" : "safe";
      const statusLabel = issues.length ? "Perlu review" : "Siap";
      const itemRows = draft.items
        .map((item) => {
          const product = getProduct(item.productId);
          const variant = product ? getProductVariant(product, item.variantId) : null;
          const price = parseMoney(item.unitPrice) || Number(variant?.price || product?.price || 0);
          const reviewCopy = item.needsReview ? " · cek harga custom" : "";
          const variantCopy = product ? `${variant?.name || "Normal"} · ${currency.format(price)}${reviewCopy}` : "Belum cocok";
          return `
            <div class="bulk-draft-item" data-draft-item="${escapeHtml(item.id)}">
              <label>
                Barang
                <select data-draft-item-product="${escapeHtml(item.id)}">
                  ${getProductSelectOptions(item.productId, item.rawName)}
                </select>
              </label>
              <label>
                Jumlah
                <input type="text" inputmode="numeric" data-draft-item-quantity="${escapeHtml(item.id)}" value="${escapeHtml(formatIntegerInput(item.quantity))}">
              </label>
              <label class="bulk-item-note">
                Catatan
                <input type="text" data-draft-item-note="${escapeHtml(item.id)}" value="${escapeHtml(item.note)}" placeholder="Catatan item">
              </label>
              <button class="icon-button" type="button" data-remove-draft-item="${escapeHtml(item.id)}" aria-label="Hapus item">×</button>
              <p class="bulk-raw-name">${escapeHtml(item.rawName || product?.name || "Item dari CSV")} · ${escapeHtml(variantCopy)}</p>
            </div>
          `;
        })
        .join("");

      return `
        <article class="bulk-draft-card" data-draft-id="${escapeHtml(draft.id)}">
          <div class="bulk-draft-header">
            <div>
              <p class="sale-card-title">Draft ${draftIndex + 1}</p>
              <p class="sale-card-meta">${escapeHtml(getDraftDisplayName(draft))}</p>
            </div>
            <span class="stock-pill ${statusClass}">${statusLabel}</span>
          </div>
          <div class="bulk-draft-fields">
            <label>
              Customer
              <input type="text" list="customerSuggestions" data-draft-field="customerName" value="${escapeHtml(draft.customerName)}">
            </label>
            <label>
              Tanggal chat
              <input type="text" data-draft-field="chatDate" value="${escapeHtml(draft.chatDate || "")}">
            </label>
            <label>
              ${shippingLabelHtml()}
              <input type="text" inputmode="numeric" data-draft-field="shipping" value="${escapeHtml(formatIntegerInput(draft.shipping))}">
            </label>
            <label>
              Pembayaran
              <select data-draft-field="payment">
                ${["Tunai", "Debit", "QRIS", "Transfer"].map((payment) => `<option ${payment === draft.payment ? "selected" : ""}>${payment}</option>`).join("")}
              </select>
            </label>
          </div>
          <div class="bulk-draft-items">
            ${itemRows || `<div class="empty-state">Item belum ada.</div>`}
          </div>
          ${issues.length ? `<p class="bulk-draft-issues">${escapeHtml(issues.map((issue) => issue.message).join(" · "))}</p>` : ""}
          <div class="bulk-draft-footer">
            <strong>${currency.format(total)}</strong>
            <div class="bulk-draft-actions">
              <button class="ghost-button" type="button" data-add-draft-item="${escapeHtml(draft.id)}">Tambah Item</button>
              <button class="ghost-button danger" type="button" data-delete-draft="${escapeHtml(draft.id)}">Hapus</button>
              <button class="primary-button" type="button" data-load-draft="${escapeHtml(draft.id)}" ${blocking || bulkBatchInFlight ? "disabled" : ""}>Buka Keranjang</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  if (els.bulkImportStatus) els.bulkImportStatus.textContent = `${state.importDrafts.length} draft pesanan siap dicek.`;
}

function importBulkSummaryText() {
  try {
    const drafts = parseBulkSummaryCsv(els.bulkSummaryInput.value);
    const summary = getBulkImportValidation(drafts);
    state.importDrafts = [...drafts, ...state.importDrafts].slice(0, 100);
    els.bulkSummaryInput.value = "";
    renderBulkDrafts();
    saveState();
    const warning = summary.unmatchedItems.length ? ` ${summary.unmatchedItems.length} item belum cocok menu.` : "";
    setBulkImportStatus(`${drafts.length} draft pesanan dibuat dari CSV.${warning}`, {
      variant: summary.unmatchedItems.length ? "error" : "success",
    });
  } catch (error) {
    setBulkImportStatus(error.message, { variant: "error" });
  }
}

async function readBulkImportFile(file) {
  if (!file) return;
  try {
    els.bulkSummaryInput.value = await file.text();
    setBulkImportStatus(`${file.name} siap dibuat draft.`);
  } catch {
    setBulkImportStatus("File CSV tidak bisa dibaca.", { variant: "error" });
  } finally {
    els.bulkImportFileInput.value = "";
  }
}

function findImportDraft(draftId) {
  return state.importDrafts.find((draft) => draft.id === draftId);
}

function updateDraftField(draftId, field, value) {
  const draft = findImportDraft(draftId);
  if (!draft) return;
  if (field === "shipping") draft.shipping = parseIntegerInput(value);
  else if (field === "payment") draft.payment = normalizePayment(value);
  else {
    draft[field] = String(value || "").trim();
    if (field === "customerName") applyCustomerDefaults(draft.customerName, draft);
  }
  saveState();
}

function updateDraftItem(draftId, itemId, field, value) {
  const draft = findImportDraft(draftId);
  const item = draft?.items.find((draftItem) => draftItem.id === itemId);
  if (!item) return;
  if (field === "productId") {
    item.productId = value;
    const product = getProduct(value);
    const variant = getDefaultVariant(product);
    item.variantId = variant?.id || "";
    item.unitPrice = Number(variant?.price || product?.price || 0);
    item.unitName = variant?.unitName || "";
    item.unitQuantity = Number(item.quantity || 1);
    item.receiptLabel = normalizePricingType(variant?.pricingType) === "unit" && item.unitName ? `${item.unitQuantity} ${item.unitName}` : "";
    item.needsReview = false;
  }
  if (field === "quantity") {
    item.quantity = Math.max(1, parseIntegerInput(value) || 1);
    item.unitQuantity = item.quantity;
    const product = getProduct(item.productId);
    const variant = product ? getProductVariant(product, item.variantId) : null;
    const unitName = item.unitName || variant?.unitName || "";
    if (normalizePricingType(variant?.pricingType) === "unit" && unitName) {
      item.unitName = unitName;
      item.receiptLabel = `${item.quantity} ${unitName}`;
    }
  }
  if (field === "note") item.note = String(value || "").trim();
  saveState();
}

function addDraftItem(draftId) {
  const draft = findImportDraft(draftId);
  if (!draft) return;
  draft.items.push({ id: makeId("draft-item"), rawName: "", sku: "", productId: "", quantity: 1, note: "" });
  renderBulkDrafts();
  saveState();
}

function removeDraftItem(draftId, itemId) {
  const draft = findImportDraft(draftId);
  if (!draft) return;
  draft.items = draft.items.filter((item) => item.id !== itemId);
  renderBulkDrafts();
  saveState();
}

function deleteImportDraft(draftId) {
  state.importDrafts = state.importDrafts.filter((draft) => draft.id !== draftId);
  renderBulkDrafts();
  saveState();
}

function getDraftCartItems(draft) {
  const cartByProduct = new Map();
  draft.items.forEach((item) => {
    const product = getProduct(item.productId);
    if (!product) return;
    const variant = getProductVariant(product, item.variantId);
    const noteText = String(item.note || "").trim();
    const unitPrice = parseMoney(item.unitPrice) || Number(variant?.price || product.price || 0);
    const key = `${product.id}_${variant?.id || ""}_${unitPrice}_${item.receiptLabel || ""}_${noteText}`;
    const existing = cartByProduct.get(key) || {
      id: makeId("cart-item"),
      productId: product.id,
      variantId: variant?.id || "",
      quantity: 0,
      unitPrice,
      finalPrice: unitPrice,
      lineTotal: 0,
      unitName: item.unitName || variant?.unitName || "",
      unitQuantity: Number(item.unitQuantity || item.quantity || 0),
      receiptLabel: String(item.receiptLabel || "").trim(),
      note: noteText,
    };
    existing.quantity += Number(item.quantity || 0);
    if (normalizePricingType(variant?.pricingType) === "unit" && existing.unitName) {
      existing.unitQuantity = existing.quantity;
      existing.receiptLabel = `${existing.quantity} ${existing.unitName}`;
    }
    existing.lineTotal = existing.unitPrice * existing.quantity;
    cartByProduct.set(key, existing);
  });

  return [...cartByProduct.values()];
}

function getSaleItemsFromDraft(draft) {
  return getDraftCartItems(draft)
    .map((cartItem) => buildSaleItemFromCart(cartItem))
    .filter(Boolean);
}

function buildSalePayloadFromDraft(draft, completedAt = new Date()) {
  const items = getSaleItemsFromDraft(draft);
  const subtotal = items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
  const shipping = Math.max(0, Number(draft.shipping || 0));
  const tax = 0;
  return {
    receiptNo: makeReceiptNumber(completedAt),
    receiptDateKey: getLocalDateKey(completedAt),
    completedAt: completedAt.toISOString(),
    storeName: state.settings.storeName,
    storeAddress: state.settings.storeAddress,
    footer: state.settings.footer,
    receiptWidth: state.settings.receiptWidth,
    receiptFontSize: state.settings.receiptFontSize,
    receiptMode: state.settings.receiptMode,
    payment: draft.payment || "Tunai",
    customerName: String(draft.customerName || "").trim(),
    customerAddress: "",
    chatDate: String(draft.chatDate || "").trim(),
    orderNote: "",
    dueText: "",
    subtotal,
    shipping,
    discount: shipping,
    tax,
    total: subtotal + shipping + tax,
    items,
  };
}

function decrementStockFromDraft(draft) {
  draft.items.forEach((item) => {
    const product = getProduct(item.productId);
    if (!product || isStockUnlimited(product)) return;
    product.stock = Math.max(0, Number(product.stock || 0) - Number(item.quantity || 0));
  });
}

async function loadDraftToCart(draftId) {
  const draft = findImportDraft(draftId);
  if (!draft) return;
  const blockingIssues = getDraftBlockingIssues(draft);
  if (blockingIssues.length) {
    setBulkImportStatus(blockingIssues.map((issue) => issue.message).join(". "), { variant: "error" });
    return;
  }
  if (state.cart.length) {
    const confirmed = await openAppConfirm({
      eyebrow: "Import Pesanan",
      title: "Ganti keranjang aktif?",
      message: "Keranjang aktif akan diganti dengan draft pesanan ini.",
      confirmText: "Ya, ganti",
    });
    if (!confirmed) return;
  }

  state.cart = getDraftCartItems(draft);
  state.sale = getDefaultSaleState({
    shipping: Number(draft.shipping || 0),
    payment: draft.payment || "Tunai",
    customerName: draft.customerName || "",
    customerAddress: "",
    chatDate: draft.chatDate || "",
    dueText: "",
    orderNote: "",
    sourceDraftId: draft.id,
  });
  renderSettings();
  render();
  els.bulkImportModal.close();
  setSyncStatus(`${getDraftDisplayName(draft)} sudah masuk ke keranjang.`);
}

async function previewPrintReadyDrafts() {
  const readyDrafts = getReadyImportDrafts();
  if (!readyDrafts.length) {
    setBulkImportStatus("Belum ada draft siap untuk dipreview.", { variant: "error" });
    return;
  }
  const salePayloads = readyDrafts.map((draft) => {
    const salePayload = buildSalePayloadFromDraft(draft, new Date());
    salePayload.receiptNo = "PREVIEW-DRAFT";
    return salePayload;
  });
  const htmlList = salePayloads.map((salePayload) => receiptHtmlFromSale(salePayload));
  const totalHeightMm = measureReceiptBatchPageHeight(htmlList);
  await printReceiptHtmlInFrame(htmlList, totalHeightMm);
}

async function processReadyImportDrafts(options = {}) {
  if (bulkBatchInFlight) return;
  const shouldPrint = Boolean(options.print);
  const readyDraftIds = getReadyImportDrafts().map((draft) => draft.id);

  if (!readyDraftIds.length) {
    setBulkImportStatus("Belum ada draft siap. Cek item yang masih perlu review dulu.", { variant: "error" });
    return;
  }

  const reviewCount = state.importDrafts.length - readyDraftIds.length;
  const confirmCopy = shouldPrint
    ? `Proses dan cetak ${readyDraftIds.length} draft siap?${reviewCount ? ` ${reviewCount} draft bermasalah akan dilewati.` : ""}`
    : `Proses ${readyDraftIds.length} draft siap jadi transaksi?${reviewCount ? ` ${reviewCount} draft bermasalah akan dilewati.` : ""}`;
  const confirmed = await openAppConfirm({
    eyebrow: "Import Pesanan",
    title: shouldPrint ? "Proses dan cetak draft?" : "Proses draft siap?",
    message: confirmCopy,
    confirmText: shouldPrint ? "Ya, proses & cetak" : "Ya, proses",
  });
  if (!confirmed) return;

  bulkBatchInFlight = true;
  renderBulkDrafts();
  setBulkImportStatus(shouldPrint ? "Memproses draft siap dan menyiapkan cetak batch..." : "Memproses draft siap jadi transaksi...");

  const processed = [];
  const skipped = [];
  let doneCopy = "";

  if (els.bulkLoadingOverlay) {
    els.bulkLoadingOverlay.hidden = false;
    if (els.bulkLoadingProgressBar) els.bulkLoadingProgressBar.style.width = "0%";
    if (els.bulkLoadingText) els.bulkLoadingText.textContent = `Memproses 0 dari ${readyDraftIds.length} draft...`;
  }

  let currentIndex = 0;

  try {
    for (const draftId of readyDraftIds) {
      const draft = findImportDraft(draftId);
      if (!draft) continue;

      const blockingIssues = getDraftBlockingIssues(draft);
      if (blockingIssues.length) {
        skipped.push(`${getDraftDisplayName(draft)}: ${blockingIssues.map((issue) => issue.message).join(", ")}`);
        currentIndex++;
        const progressPercent = Math.round((currentIndex / readyDraftIds.length) * 100);
        if (els.bulkLoadingProgressBar) els.bulkLoadingProgressBar.style.width = `${progressPercent}%`;
        if (els.bulkLoadingText) els.bulkLoadingText.textContent = `Memproses ${currentIndex} dari ${readyDraftIds.length} draft...`;
        continue;
      }

      const salePayload = buildSalePayloadFromDraft(draft, new Date());
      try {
        const savedSale = await saveSaleToDatabase(salePayload);
        if (savedSale.receiptNo) salePayload.receiptNo = savedSale.receiptNo;
        processed.push({ draft, salePayload });
        decrementStockFromDraft(draft);
        state.importDrafts = state.importDrafts.filter((item) => item.id !== draft.id);
        state.lastReceipt = salePayload;
      } catch (error) {
        skipped.push(`${getDraftDisplayName(draft)}: ${error.message}`);
      }

      currentIndex++;
      const progressPercent = Math.round((currentIndex / readyDraftIds.length) * 100);
      if (els.bulkLoadingProgressBar) els.bulkLoadingProgressBar.style.width = `${progressPercent}%`;
      if (els.bulkLoadingText) els.bulkLoadingText.textContent = `Memproses ${currentIndex} dari ${readyDraftIds.length} draft...`;
    }

    saveState();
    renderSettings();
    render();
    await saveProductsToDatabase({ toast: false });
    await loadSalesDashboard();

    if (shouldPrint && processed.length) {
      await printSaleReceiptsBatch(processed.map((entry) => entry.salePayload));
    }

    const skippedCopy = skipped.length ? ` ${skipped.length} draft dilewati: ${skipped.slice(0, 2).join(" | ")}${skipped.length > 2 ? " ..." : ""}` : "";
    doneCopy = processed.length
      ? `${processed.length} draft sudah jadi transaksi${shouldPrint ? " dan dikirim ke dialog cetak" : ""}.${skippedCopy}`
      : `Belum ada draft yang berhasil diproses.${skippedCopy}`;
  } catch (error) {
    doneCopy = `${error.message || "Batch import gagal."} Cek draft yang belum diproses.`;
  } finally {
    if (els.bulkLoadingOverlay) {
      els.bulkLoadingOverlay.hidden = true;
    }
    bulkBatchInFlight = false;
    renderBulkDrafts();
    setBulkImportStatus(doneCopy, { variant: processed.length ? "success" : "error" });
    setSyncStatus(doneCopy);
  }
}

async function copyAiPrompt() {
  try {
    await navigator.clipboard.writeText(AI_BULK_PROMPT);
    setBulkImportStatus("Prompt AI sudah disalin.");
  } catch {
    els.bulkSummaryInput.value = AI_BULK_PROMPT;
    setBulkImportStatus("Prompt AI ditaruh di kolom summary.");
  }
}

function openBulkImport() {
  state.bulkDraftSearch = "";
  if (els.bulkSearchInput) {
    els.bulkSearchInput.value = "";
  }
  renderBulkDrafts();
  openModal(els.bulkImportModal, els.bulkSummaryInput);
}

function updateBulkDraftFromTarget(target, rerender = false) {
  const card = target.closest("[data-draft-id]");
  if (!card) return false;
  const draftId = card.dataset.draftId;
  const field = target.dataset.draftField;
  const itemProductId = target.dataset.draftItemProduct;
  const itemQuantityId = target.dataset.draftItemQuantity;
  const itemNoteId = target.dataset.draftItemNote;

  if (field) updateDraftField(draftId, field, target.value);
  else if (itemProductId) updateDraftItem(draftId, itemProductId, "productId", target.value);
  else if (itemQuantityId) updateDraftItem(draftId, itemQuantityId, "quantity", target.value);
  else if (itemNoteId) updateDraftItem(draftId, itemNoteId, "note", target.value);
  else return false;

  if (rerender) renderBulkDrafts();
  return true;
}

function upsertProduct(product) {
  const incoming = {
    ...product,
    aliases: mergeAliasLists(product.aliases),
  };
  const existingIndex = state.products.findIndex((item) => sameProductIdentity(item, incoming));

  if (existingIndex >= 0) {
    state.products[existingIndex] = normalizeProductRecord({
      ...state.products[existingIndex],
      ...incoming,
      id: state.products[existingIndex].id,
      aliases: mergeAliasLists(state.products[existingIndex].aliases, incoming.aliases),
    });
    return "updated";
  }

  state.products.push(normalizeProductRecord({ ...incoming, id: incoming.id || makeId() }));
  return "created";
}

function sanitizeCart() {
  state.cart = state.cart
    .map((cartItem) => {
      const product = getProduct(cartItem.productId);
      if (!product) return null;
      const variant = getProductVariant(product, cartItem.variantId);
      const requestedQuantity = Math.max(1, Number(cartItem.quantity || 0));
      const unitPrice = getCartItemUnitPrice({ ...cartItem, variantId: variant?.id });
      const quantity = isStockUnlimited(product) ? requestedQuantity : Math.min(requestedQuantity, product.stock);
      return {
        id: cartItem.id || makeId("cart-item"),
        productId: cartItem.productId,
        variantId: variant?.id || "",
        quantity,
        unitPrice,
        finalPrice: unitPrice,
        lineTotal: unitPrice * quantity,
        unitName: cartItem.unitName || variant?.unitName || "",
        unitQuantity: Number(cartItem.unitQuantity || quantity),
        receiptLabel: String(cartItem.receiptLabel || "").trim(),
        note: String(cartItem.note || "").trim(),
      };
    })
    .filter((cartItem) => cartItem && cartItem.quantity > 0);
}

function cartQuantity(productId) {
  return state.cart
    .filter((item) => item.productId === productId)
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

function getProduct(productId) {
  return state.products.find((product) => product.id === productId);
}

function getCustomerDepositBalance() {
  const customerName = String(state.sale.customerName || "").trim();
  if (!customerName) return 0;
  const profile = getCustomerProfile(customerName);
  return profile ? Number(profile.depositBalance || 0) : 0;
}

function getTotals() {
  const subtotal = state.cart.reduce((sum, cartItem) => {
    const product = getProduct(cartItem.productId);
    return sum + (product ? getCartItemLineTotal(cartItem) : 0);
  }, 0);
  const shipping = Math.max(0, state.sale.shipping);
  const grossTotal = subtotal + shipping;
  const depositBalance = getCustomerDepositBalance();
  const usedDeposit = Math.min(depositBalance, grossTotal);
  return {
    subtotal,
    shipping,
    tax: 0,
    deposit: usedDeposit,
    total: grossTotal - usedDeposit,
  };
}

function getCartItems() {
  return state.cart
    .map((cartItem) => {
      return buildSaleItemFromCart(cartItem);
    })
    .filter(Boolean);
}

function buildSalePayload() {
  const completedAt = new Date();
  const totals = getTotals();
  return {
    receiptNo: makeReceiptNumber(completedAt),
    receiptDateKey: getLocalDateKey(completedAt),
    completedAt: completedAt.toISOString(),
    storeName: state.settings.storeName,
    storeAddress: state.settings.storeAddress,
    footer: state.settings.footer,
    receiptWidth: state.settings.receiptWidth,
    receiptFontSize: state.settings.receiptFontSize,
    receiptMode: state.settings.receiptMode,
    payment: state.sale.payment,
    customerName: String(state.sale.customerName || "").trim(),
    customerAddress: "",
    chatDate: String(state.sale.chatDate || "").trim(),
    orderNote: "",
    dueText: "",
    subtotal: totals.subtotal,
    shipping: totals.shipping,
    discount: totals.shipping,
    tax: 0,
    total: totals.subtotal + totals.shipping,
    usedDeposit: totals.deposit,
    items: getCartItems(),
  };
}

function getCheckoutValidationIssues() {
  const issues = [];
  const totals = getTotals();

  if (!state.cart.length) {
    issues.push({ type: "error", blocking: true, message: "Keranjang masih kosong." });
  }

  const productQuantities = new Map();
  state.cart.forEach((cartItem) => {
    const product = getProduct(cartItem.productId);
    if (!product) {
      issues.push({ type: "error", blocking: true, message: "Ada barang di keranjang yang tidak ditemukan di daftar barang." });
      return;
    }

    const quantity = Number(cartItem.quantity || 0);
    if (quantity <= 0) {
      issues.push({ type: "error", blocking: true, message: `${product.name} jumlahnya belum valid.` });
    } else {
      productQuantities.set(cartItem.productId, (productQuantities.get(cartItem.productId) || 0) + quantity);
    }
    if (getCartItemUnitPrice(cartItem) <= 0) {
      issues.push({ type: "error", blocking: true, message: `${product.name} harga belum valid.` });
    }
  });

  productQuantities.forEach((totalQty, productId) => {
    const product = getProduct(productId);
    if (product && !isStockUnlimited(product) && totalQty > Number(product.stock || 0)) {
      issues.push({ type: "error", blocking: true, message: `${product.name} melebihi stok tersedia.` });
    }
  });

  if (state.cart.length && !String(state.sale.customerName || "").trim()) {
    issues.push({ type: "warning", blocking: false, message: "Customer/alamat masih kosong." });
  }

  if (state.cart.length && totals.shipping === 0) {
    issues.push({ type: "warning", blocking: false, message: "Ongkir masih Rp0. Pastikan memang gratis/pickup." });
  }

  if (state.cart.length && (totals.subtotal + totals.shipping) <= 0) {
    issues.push({ type: "error", blocking: true, message: "Total transaksi belum valid." });
  }

  return issues;
}

function getCheckoutWarningSignature(issues = getCheckoutValidationIssues()) {
  return issues
    .filter((issue) => !issue.blocking)
    .map((issue) => issue.message)
    .join("|");
}

function renderCheckoutValidation(force = false) {
  if (!els.checkoutValidation) return;

  const issues = getCheckoutValidationIssues();
  const blocking = issues.some((issue) => issue.blocking);
  const visibleIssues = issues.filter((issue) => force || issue.blocking);
  if (!visibleIssues.length) {
    els.checkoutValidation.hidden = true;
    els.checkoutValidation.innerHTML = "";
    els.checkoutValidation.classList.remove("error", "warning");
    return;
  }

  els.checkoutValidation.hidden = false;
  els.checkoutValidation.classList.toggle("error", blocking);
  els.checkoutValidation.classList.toggle("warning", !blocking);
  els.checkoutValidation.innerHTML = `
    <strong>${blocking ? "Transaksi belum bisa diselesaikan" : "Cek dulu sebelum transaksi selesai"}</strong>
    <ul>
      ${visibleIssues.map((issue) => `<li>${escapeHtml(issue.message)}</li>`).join("")}
    </ul>
  `;
}

function resetCheckoutWarnings() {
  state.checkoutWarningSignature = "";
}

function canCompleteSale() {
  const issues = getCheckoutValidationIssues();
  const blockingIssues = issues.filter((issue) => issue.blocking);
  if (blockingIssues.length) {
    renderCheckoutValidation(true);
    setSyncStatus(blockingIssues[0].message, { variant: "error" });
    return false;
  }

  const warningSignature = getCheckoutWarningSignature(issues);
  if (warningSignature && state.checkoutWarningSignature !== warningSignature) {
    state.checkoutWarningSignature = warningSignature;
    renderCheckoutValidation(true);
    setSyncStatus("Cek peringatan dulu. Kalau datanya sudah benar, klik Selesaikan Transaksi sekali lagi.", { variant: "warning" });
    return false;
  }

  return true;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const fallbackMessage =
      response.status === 501
        ? "Server kasir belum memuat fitur edit/hapus. Restart server SQL dengan python3 server.py lalu coba lagi."
        : "Database tidak merespons.";
    throw new Error(data.error || fallbackMessage);
  }
  return data;
}

let _supabaseInstance = null;

function getSupabaseClient() {
  const url = SUPABASE_URL;
  const key = SUPABASE_KEY;
  
  if (_supabaseInstance) {
    return _supabaseInstance;
  }
  
  if (!window.supabase) {
    throw new Error("SDK Supabase belum ter-load secara penuh. Mohon periksa koneksi internet.");
  }
  
  _supabaseInstance = window.supabase.createClient(url, key);
  return _supabaseInstance;
}


async function dbFetchSales(options = {}) {
  const limit = options.limit || 1000;
  const includeDeleted = options.includeDeleted !== false;
  
  if (state.settings.dbMode === "supabase") {
    const supabase = getSupabaseClient();
    let query = supabase
      .from("sales")
      .select(`
        *,
        sale_items (*)
      `)
      .order("completed_at", { ascending: false })
      .limit(limit);
      
    if (!includeDeleted) {
      query = query.is("deleted_at", null);
    }
    
    const { data: salesData, error } = await query;
    if (error) throw error;
    
    const sales = salesData.map(sale => {
      const items = (sale.sale_items || []).map(item => ({
        id: item.id,
        sku: item.sku || "",
        name: item.name,
        price: Number(item.price || 0),
        quantity: Number(item.quantity || 0),
        lineTotal: Number(item.line_total || 0),
        line_total: Number(item.line_total || 0),
        note: item.note || "",
        productClientId: item.product_client_id || "",
        product_client_id: item.product_client_id || "",
        variantId: item.variant_client_id || "",
        variantClientId: item.variant_client_id || "",
        variant_client_id: item.variant_client_id || "",
        menuName: item.menu_name || item.name || "",
        menu_name: item.menu_name || item.name || "",
        variantName: item.variant_name || "",
        variant_name: item.variant_name || "",
        unitName: item.unit_name || "",
        unit_name: item.unit_name || "",
        unitQuantity: Number(item.unit_quantity || 0),
        unit_quantity: Number(item.unit_quantity || 0),
        pricingType: item.pricing_type || "",
        pricing_type: item.pricing_type || "",
        receiptLabel: item.receipt_label || "",
        receipt_label: item.receipt_label || ""
      }));
      return {
        id: sale.id,
        receipt_no: sale.receipt_no,
        receiptNo: sale.receipt_no,
        completed_at: sale.completed_at,
        completedAt: sale.completed_at,
        store_name: sale.store_name,
        storeName: sale.store_name,
        payment: sale.payment,
        subtotal: Number(sale.subtotal || 0),
        discount: Number(sale.discount || 0),
        tax: Number(sale.tax || 0),
        total: Number(sale.total || 0),
        customer_name: sale.customer_name || "",
        customerName: sale.customer_name || "",
        customer_address: sale.customer_address || "",
        customerAddress: sale.customer_address || "",
        order_note: sale.order_note || "",
        orderNote: sale.order_note || "",
        due_text: sale.due_text || "",
        dueText: sale.due_text || "",
        chat_date: sale.chat_date || "",
        chatDate: sale.chat_date || "",
        deleted_at: sale.deleted_at || null,
        deletedAt: sale.deleted_at || null,
        stock_restored_on_delete: Number(sale.stock_restored_on_delete || 0),
        stockRestoredOnDelete: Number(sale.stock_restored_on_delete || 0),
        paid_amount: Number(sale.paid_amount || 0),
        paidAmount: Number(sale.paid_amount || 0),
        items: items
      };
    }).filter((sale) => !isPartialSupabaseSale(sale));
    
    return { sales };
  } else {
    const url = `/api/sales?limit=${limit}${includeDeleted ? '&includeDeleted=1' : ''}`;
    return requestJson(url);
  }
}

async function dbUpsertCustomer(supabase, name, defaultShipping, lastOrderAt) {
  const nameClean = String(name || "").trim();
  if (!nameClean) return null;

  const shipping = Number(defaultShipping || 0);
  const orderAt = String(lastOrderAt || new Date().toISOString()).trim();

  try {
    // 1. Cari berdasarkan nama langsung
    const { data: existingCust } = await supabase
      .from("customers")
      .select("id, last_order_at, default_shipping")
      .eq("name", nameClean)
      .maybeSingle();

    if (existingCust) {
      const isNewer = !existingCust.last_order_at || orderAt >= existingCust.last_order_at;
      const { error: updErr } = await supabase
        .from("customers")
        .update({
          default_shipping: isNewer ? shipping : existingCust.default_shipping,
          last_order_at: isNewer ? orderAt : existingCust.last_order_at,
          updated_at: new Date().toISOString()
        })
        .eq("id", existingCust.id);
      if (updErr) throw updErr;
      return existingCust.id;
    }

    // 2. Cari berdasarkan alias
    const { data: aliasRec } = await supabase
      .from("customer_aliases")
      .select("customer_id")
      .eq("alias_key", normalizeKey(nameClean))
      .maybeSingle();

    if (aliasRec) {
      const { data: custFromAlias } = await supabase
        .from("customers")
        .select("id, last_order_at, default_shipping")
        .eq("id", aliasRec.customer_id)
        .maybeSingle();

      if (custFromAlias) {
        const isNewer = !custFromAlias.last_order_at || orderAt >= custFromAlias.last_order_at;
        const { error: updErr } = await supabase
          .from("customers")
          .update({
            default_shipping: isNewer ? shipping : custFromAlias.default_shipping,
            last_order_at: isNewer ? orderAt : custFromAlias.last_order_at,
            updated_at: new Date().toISOString()
          })
          .eq("id", custFromAlias.id);
        if (updErr) throw updErr;
        return custFromAlias.id;
      }
    }

    // 3. Tambah customer baru jika tidak ditemukan
    const { data: newCust, error: insErr } = await supabase
      .from("customers")
      .insert({
        name: nameClean,
        default_shipping: shipping,
        last_order_at: orderAt,
        deposit_balance: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insErr) throw insErr;
    return newCust ? newCust.id : null;
  } catch (err) {
    console.error("Gagal melakukan dbUpsertCustomer ke Supabase:", err);
    return null;
  }
}

function getSupabaseMissingSchemaColumn(error, tableName) {
  const message = String(error?.message || error?.details || "");
  // Match any quote style and optional schema prefix like public.tableName or "public"."tableName"
  const match = message.match(/Could not find the ['"]([^'"]+)['"] column of (?:['"]?public['"]?\.)?['"]?([a-zA-Z0-9_-]+)['"]? in the schema cache/i);
  if (match) {
    const matchedTable = match[2];
    if (matchedTable.toLowerCase() === String(tableName).toLowerCase()) {
      return match[1];
    }
  }
  return "";
}

function isSupabaseMissingTableError(error, tableName) {
  const text = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  const table = String(tableName || "").toLowerCase();
  return Boolean(table) && (error?.code === "PGRST205" || text.includes("schema cache")) && text.includes(table);
}

const SUPABASE_SALE_ITEM_EXTENDED_COLUMNS = new Set([
  "product_client_id",
  "variant_client_id",
  "menu_name",
  "variant_name",
  "unit_name",
  "unit_quantity",
  "pricing_type",
  "receipt_label",
]);

function buildSupabaseSaleItem(item, saleId, options = {}) {
  const includeExtendedColumns = options.includeExtendedColumns !== false;
  const dbItem = {
    sale_id: saleId,
    sku: item.sku || "",
    name: item.name,
    price: item.price || 0,
    quantity: item.quantity || 0,
    line_total: item.lineTotal || 0,
    note: item.note || "",
  };

  if (includeExtendedColumns) {
    Object.assign(dbItem, {
      product_client_id: item.productClientId || item.product_client_id || "",
      variant_client_id: item.variantId || item.variantClientId || item.variant_client_id || "",
      menu_name: item.menuName || item.menu_name || item.name || "",
      variant_name: item.variantName || item.variant_name || "",
      unit_name: item.unitName || item.unit_name || "",
      unit_quantity: Number(item.unitQuantity || item.unit_quantity || 0),
      pricing_type: item.pricingType || item.pricing_type || "",
      receipt_label: item.receiptLabel || item.receipt_label || "",
    });
  }

  return dbItem;
}

function stripSupabaseSaleItemExtendedColumns(item) {
  const basicItem = { ...item };
  SUPABASE_SALE_ITEM_EXTENDED_COLUMNS.forEach((column) => {
    delete basicItem[column];
  });
  return basicItem;
}

async function insertSupabaseSaleItems(supabase, dbItems, options = {}) {
  const items = Array.isArray(dbItems) ? dbItems : [];
  if (!items.length) return;

  const { error } = await supabase.from("sale_items").insert(items);
  if (!error) return;

  const missingColumn = getSupabaseMissingSchemaColumn(error, "sale_items");
  if (!missingColumn || !SUPABASE_SALE_ITEM_EXTENDED_COLUMNS.has(missingColumn)) {
    throw error;
  }

  if (options.warn !== false) {
    console.warn(
      `Supabase sale_items belum punya kolom '${missingColumn}', menyimpan item dengan kolom dasar saja.`,
      error
    );
  }
  const fallbackItems = items.map(stripSupabaseSaleItemExtendedColumns);
  const { error: fallbackError } = await supabase.from("sale_items").insert(fallbackItems);
  if (fallbackError) throw fallbackError;
}

async function cleanupSupabaseInsertedSale(supabase, saleId) {
  const { error: deleteError } = await supabase.from("sales").delete().eq("id", saleId);
  if (!deleteError) return;

  const { error: softDeleteError } = await supabase
    .from("sales")
    .update({
      deleted_at: new Date().toISOString(),
      stock_restored_on_delete: 0,
    })
    .eq("id", saleId);

  if (softDeleteError) {
    console.warn("Gagal membersihkan sale Supabase yang itemnya gagal tersimpan.", { deleteError, softDeleteError });
  }
}

function isPartialSupabaseSale(sale) {
  return !sale.deletedAt && (!Array.isArray(sale.items) || sale.items.length === 0);
}

async function saveSaleToDatabase(payload) {
  if (state.settings.dbMode === "supabase") {
    const supabase = getSupabaseClient();
    
    // Generate next receipt number if it is a draft
    let receiptNo = payload.receiptNo;
    if (!receiptNo || receiptNo.endsWith("-DRAFT")) {
      const completedAtDate = payload.completedAt ? new Date(payload.completedAt) : new Date();
      const dateKey = `${completedAtDate.getFullYear()}${String(completedAtDate.getMonth() + 1).padStart(2, "0")}${String(completedAtDate.getDate()).padStart(2, "0")}`;
      const prefix = `SH-${dateKey}-`;
      
      try {
        const { data: latestSales, error: fetchErr } = await supabase
          .from("sales")
          .select("receipt_no")
          .like("receipt_no", `${prefix}%`)
          .not("receipt_no", "ilike", "%draft%")
          .order("receipt_no", { ascending: false })
          .limit(1);
          
        if (!fetchErr && Array.isArray(latestSales) && latestSales.length > 0) {
          const latestReceiptNo = latestSales[0].receipt_no;
          const suffixStr = latestReceiptNo.replace(prefix, "");
          const suffixNum = parseInt(suffixStr, 10);
          if (!isNaN(suffixNum)) {
            receiptNo = `${prefix}${String(suffixNum + 1).padStart(4, "0")}`;
          } else {
            receiptNo = `${prefix}0001`;
          }
        } else {
          receiptNo = `${prefix}0001`;
        }
      } catch (e) {
        console.warn("Gagal generate nomor struk unik dari Supabase, fallback ke timestamp:", e);
        receiptNo = `${prefix}${Date.now().toString().slice(-4)}`;
      }
    }
    
    payload.receiptNo = receiptNo;
    
    const { data: saleData, error: saleError } = await supabase
      .from("sales")
      .insert({
        receipt_no: receiptNo,
        completed_at: payload.completedAt,
        store_name: payload.storeName,
        payment: payload.payment,
        subtotal: payload.subtotal || 0,
        discount: payload.discount || 0,
        tax: payload.tax || 0,
        total: payload.total || 0,
        customer_name: payload.customerName || "",
        customer_address: payload.customerAddress || "",
        order_note: payload.orderNote || "",
        due_text: payload.dueText || "",
        chat_date: payload.chatDate || "",
        paid_amount: payload.paidAmount || 0
      })
      .select()
      .single();
      
    if (saleError) throw saleError;
    
    if (Array.isArray(payload.items) && payload.items.length > 0) {
      const dbItems = payload.items.map(item => buildSupabaseSaleItem(item, saleData.id));
      try {
        await insertSupabaseSaleItems(supabase, dbItems);
      } catch (itemsError) {
        await cleanupSupabaseInsertedSale(supabase, saleData.id);
        throw itemsError;
      }
    }

    // Upsert customer profile
    if (payload.customerName) {
      await dbUpsertCustomer(supabase, payload.customerName, payload.shipping || payload.discount || 0, payload.completedAt);
    }
    
    return { success: true, id: saleData.id, receiptNo: receiptNo };
  } else {
    return requestJson("/api/sales", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }
}

async function deleteSaleFromDatabase(saleId, options = {}) {
  if (state.settings.dbMode === "supabase") {
    const supabase = getSupabaseClient();
    
    const { error } = await supabase
      .from("sales")
      .update({
        deleted_at: new Date().toISOString(),
        stock_restored_on_delete: options.restoreStock ? 1 : 0
      })
      .eq("id", saleId);
      
    if (error) throw error;
    return { success: true };
  } else {
    return requestJson(`/api/sales/${encodeURIComponent(saleId)}`, {
      method: "DELETE",
      body: JSON.stringify({ restoreStock: Boolean(options.restoreStock) }),
    });
  }
}

async function restoreSaleInDatabase(saleId) {
  if (state.settings.dbMode === "supabase") {
    const supabase = getSupabaseClient();
    
    const { error } = await supabase
      .from("sales")
      .update({
        deleted_at: null,
        stock_restored_on_delete: 0
      })
      .eq("id", saleId);
      
    if (error) throw error;
    return { success: true };
  } else {
    return requestJson(`/api/sales/${encodeURIComponent(saleId)}/restore`, {
      method: "POST",
    });
  }
}

async function updateSaleInDatabase(saleId, payload) {
  if (state.settings.dbMode === "supabase") {
    const supabase = getSupabaseClient();
    
    const subtotal = payload.subtotal || (Array.isArray(payload.items) ? payload.items.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 0)), 0) : 0);
    const shipping = Number(payload.shipping || payload.discount || 0);
    const tax = Number(payload.tax || 0);
    const total = payload.total || (subtotal + shipping + tax);
    const customerName = payload.customerName || payload.customer_name || "";
    const chatDate = payload.chatDate || payload.chat_date || "";
    const completedAt = payload.completedAt || payload.completed_at || new Date().toISOString();
    
    const { error: saleError } = await supabase
      .from("sales")
      .update({
        payment: payload.payment,
        subtotal: subtotal,
        discount: shipping,
        tax: tax,
        total: total,
        customer_name: customerName,
        customer_address: payload.customerAddress || payload.customer_address || "",
        order_note: payload.orderNote || payload.order_note || "",
        due_text: payload.dueText || payload.due_text || "",
        chat_date: chatDate,
        paid_amount: payload.paidAmount || payload.paid_amount || 0
      })
      .eq("id", saleId);
      
    if (saleError) throw saleError;
    
    const { error: deleteError } = await supabase.from("sale_items").delete().eq("sale_id", saleId);
    if (deleteError) throw deleteError;
    
    if (Array.isArray(payload.items) && payload.items.length > 0) {
      const dbItems = payload.items.map(item => buildSupabaseSaleItem(
        {
          ...item,
          price: Number(item.price || 0),
          quantity: Number(item.quantity || 0),
          lineTotal: Number(item.lineTotal || item.line_total || (Number(item.price || 0) * Number(item.quantity || 0))),
        },
        saleId
      ));
      await insertSupabaseSaleItems(supabase, dbItems);
    }

    // Upsert customer profile
    if (customerName) {
      await dbUpsertCustomer(supabase, customerName, shipping, completedAt);
    }
    
    // Retrieve and return updated sale to match local API contract
    const { data: updatedSales } = await supabase
      .from("sales")
      .select("*, sale_items(*)")
      .eq("id", saleId)
      .maybeSingle();

    if (updatedSales) {
      const items = (updatedSales.sale_items || []).map(item => ({
        id: item.id,
        sku: item.sku || "",
        name: item.name,
        price: Number(item.price || 0),
        quantity: Number(item.quantity || 0),
        lineTotal: Number(item.line_total || 0),
        line_total: Number(item.line_total || 0),
        note: item.note || "",
        productClientId: item.product_client_id || "",
        product_client_id: item.product_client_id || "",
        variantId: item.variant_client_id || "",
        variantClientId: item.variant_client_id || "",
        variant_client_id: item.variant_client_id || "",
        menuName: item.menu_name || item.name || "",
        menu_name: item.menu_name || item.name || "",
        variantName: item.variant_name || "",
        variant_name: item.variant_name || "",
        unitName: item.unit_name || "",
        unit_name: item.unit_name || "",
        unitQuantity: Number(item.unit_quantity || 0),
        unit_quantity: Number(item.unit_quantity || 0),
        pricingType: item.pricing_type || "",
        pricing_type: item.pricing_type || "",
        receiptLabel: item.receipt_label || "",
        receipt_label: item.receipt_label || ""
      }));
      const mappedSale = {
        id: updatedSales.id,
        receipt_no: updatedSales.receipt_no,
        receiptNo: updatedSales.receipt_no,
        completed_at: updatedSales.completed_at,
        completedAt: updatedSales.completed_at,
        store_name: updatedSales.store_name,
        storeName: updatedSales.store_name,
        payment: updatedSales.payment,
        subtotal: Number(updatedSales.subtotal || 0),
        discount: Number(updatedSales.discount || 0),
        tax: Number(updatedSales.tax || 0),
        total: Number(updatedSales.total || 0),
        customer_name: updatedSales.customer_name || "",
        customerName: updatedSales.customer_name || "",
        customer_address: updatedSales.customer_address || "",
        customerAddress: updatedSales.customer_address || "",
        order_note: updatedSales.order_note || "",
        orderNote: updatedSales.order_note || "",
        due_text: updatedSales.due_text || "",
        dueText: updatedSales.due_text || "",
        chat_date: updatedSales.chat_date || "",
        chatDate: updatedSales.chat_date || "",
        deleted_at: updatedSales.deleted_at || null,
        deletedAt: updatedSales.deleted_at || null,
        stock_restored_on_delete: Number(updatedSales.stock_restored_on_delete || 0),
        stockRestoredOnDelete: Number(updatedSales.stock_restored_on_delete || 0),
        paid_amount: Number(updatedSales.paid_amount || 0),
        paidAmount: Number(updatedSales.paid_amount || 0),
        items: items
      };
      return { success: true, sale: mappedSale };
    }
    
    return { success: true };
  } else {
    return requestJson(`/api/sales/${encodeURIComponent(saleId)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }
}

function isMissingCustomerTagColumnError(error) {
  const message = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
  return message.includes("tag") && (message.includes("column") || message.includes("schema cache") || error?.code === "PGRST204");
}

async function saveSupabaseCustomerTagAlias(supabase, customerId, tag) {
  const aliasKey = getCustomerTagAliasKey(customerId);
  const { error: deleteError } = await supabase
    .from("customer_aliases")
    .delete()
    .eq("alias_key", aliasKey);
  if (deleteError) throw deleteError;

  const tagText = String(tag || "").trim();
  if (!tagText) return;

  const { error: insertError } = await supabase
    .from("customer_aliases")
    .insert({
      customer_id: customerId,
      alias: makeCustomerTagAlias(tagText),
      alias_key: aliasKey,
    });
  if (insertError) throw insertError;
}

async function updateCustomerInDatabase(customerId, payload) {
  if (state.settings.dbMode === "supabase") {
    const supabase = getSupabaseClient();
    let shouldPersistTagAlias = false;

    const customerUpdate = {
      name: payload.name,
      default_shipping: payload.defaultShipping || 0,
      deposit_balance: payload.depositBalance || 0,
      updated_at: new Date().toISOString()
    };
    if (payload.tag !== undefined) customerUpdate.tag = payload.tag || "";

    let { data: customerData, error: customerError } = await supabase
      .from("customers")
      .update(customerUpdate)
      .eq("id", customerId)
      .select()
      .single();

    if (customerError && isMissingCustomerTagColumnError(customerError)) {
      shouldPersistTagAlias = payload.tag !== undefined;
      const fallbackUpdate = { ...customerUpdate };
      delete fallbackUpdate.tag;
      const retry = await supabase
        .from("customers")
        .update(fallbackUpdate)
        .eq("id", customerId)
        .select()
        .single();
      customerData = retry.data ? { ...retry.data, tag: customerUpdate.tag || "" } : retry.data;
      customerError = retry.error;
    }

    if (customerError) throw customerError;
    if (shouldPersistTagAlias) {
      await saveSupabaseCustomerTagAlias(supabase, customerId, customerUpdate.tag || "");
    }
    
    let finalAliases = [];
    if (payload.aliases !== undefined) {
      const rawAliases = Array.isArray(payload.aliases)
        ? payload.aliases
        : typeof payload.aliases === "string"
          ? payload.aliases.split(",").map(a => a.trim()).filter(Boolean)
          : [];
          
      const { error: deleteError } = await supabase.from("customer_aliases").delete().eq("customer_id", customerId);
      if (deleteError) throw deleteError;
      
      if (rawAliases.length > 0) {
        finalAliases = rawAliases;
        const dbAliases = rawAliases.map(alias => ({
          customer_id: customerId,
          alias: alias,
          alias_key: normalizeKey(alias)
        }));
        const { error: aliasError } = await supabase.from("customer_aliases").insert(dbAliases);
        if (aliasError) throw aliasError;
      }
    } else {
      const { data: aliasData } = await supabase.from("customer_aliases").select("alias").eq("customer_id", customerId);
      if (aliasData) {
        finalAliases = aliasData.map(a => a.alias);
      }
    }
    
    return { ok: true, customer: { ...customerData, aliases: finalAliases } };
  } else {
    return requestJson(`/api/customers/${encodeURIComponent(customerId)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }
}

async function createCustomerInDatabase(payload) {
  if (state.settings.dbMode === "supabase") {
    const supabase = getSupabaseClient();
    let shouldPersistTagAlias = false;

    const customerInsert = {
      name: payload.name,
      default_shipping: payload.defaultShipping || 0,
      deposit_balance: payload.depositBalance || 0,
      tag: payload.tag || "",
      last_order_at: ""
    };

    let { data: customerData, error: customerError } = await supabase
      .from("customers")
      .insert(customerInsert)
      .select()
      .single();

    if (customerError && isMissingCustomerTagColumnError(customerError)) {
      shouldPersistTagAlias = Boolean(customerInsert.tag);
      const fallbackInsert = { ...customerInsert };
      delete fallbackInsert.tag;
      const retry = await supabase
        .from("customers")
        .insert(fallbackInsert)
        .select()
        .single();
      customerData = retry.data ? { ...retry.data, tag: customerInsert.tag || "" } : retry.data;
      customerError = retry.error;
    }

    if (customerError) throw customerError;
    if (shouldPersistTagAlias) {
      await saveSupabaseCustomerTagAlias(supabase, customerData.id, customerInsert.tag || "");
    }
    
    let finalAliases = [];
    const rawAliases = Array.isArray(payload.aliases)
      ? payload.aliases
      : typeof payload.aliases === "string"
        ? payload.aliases.split(",").map(a => a.trim()).filter(Boolean)
        : [];
        
    if (rawAliases.length > 0) {
      finalAliases = rawAliases;
      const dbAliases = rawAliases.map(alias => ({
        customer_id: customerData.id,
        alias: alias,
        alias_key: normalizeKey(alias)
      }));
      const { error: aliasError } = await supabase.from("customer_aliases").insert(dbAliases);
      if (aliasError) throw aliasError;
    }
    
    return { ok: true, customer: { ...customerData, aliases: finalAliases } };
  } else {
    return requestJson("/api/customers", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }
}

async function mergeCustomersInDatabase(payload) {
  if (state.settings.dbMode === "supabase") {
    const supabase = getSupabaseClient();
    const targetId = payload.targetId;
    const duplicateIds = payload.duplicateIds || [];
    
    if (!targetId || !duplicateIds.length) {
      throw new Error("Data merge tidak lengkap.");
    }
    
    const { data: targetCust, error: errT } = await supabase
      .from("customers")
      .select("*")
      .eq("id", targetId)
      .single();
    if (errT) throw new Error(`Target customer tidak ditemukan: ${errT.message}`);
    
    let totalDepositToAdd = 0;
    
    for (const sourceId of duplicateIds) {
      const { data: sourceCust, error: errS } = await supabase
        .from("customers")
        .select("*")
        .eq("id", sourceId)
        .single();
        
      if (errS || !sourceCust) {
        console.warn(`Source customer dengan ID ${sourceId} tidak ditemukan, lewati.`);
        continue;
      }
      
      const sourceName = sourceCust.name;
      const { error: aliasInsertError } = await supabase
        .from("customer_aliases")
        .insert({
          customer_id: targetId,
          alias: sourceName,
          alias_key: normalizeKey(sourceName)
        });
      if (aliasInsertError && aliasInsertError.code !== "23505") {
        console.error("Gagal insert alias nama source:", aliasInsertError);
      }
      
      const { error: moveAliasError } = await supabase
        .from("customer_aliases")
        .update({ customer_id: targetId })
        .eq("customer_id", sourceId);
      if (moveAliasError) {
        console.error("Gagal memindahkan alias source:", moveAliasError);
      }
      
      const { error: salesError } = await supabase
        .from("sales")
        .update({ customer_name: targetCust.name })
        .eq("customer_name", sourceName);
      if (salesError) {
        console.error("Gagal mengupdate nama customer di sales:", salesError);
      }
      
      totalDepositToAdd += Number(sourceCust.deposit_balance || 0);
      
      const { error: deleteSourceError } = await supabase
        .from("customers")
        .delete()
        .eq("id", sourceId);
      if (deleteSourceError) {
        console.error("Gagal menghapus source customer:", deleteSourceError);
      }
    }
    
    if (totalDepositToAdd > 0) {
      const newDeposit = Number(targetCust.deposit_balance || 0) + totalDepositToAdd;
      const { error: updateTargetError } = await supabase
        .from("customers")
        .update({
          deposit_balance: newDeposit,
          updated_at: new Date().toISOString()
        })
        .eq("id", targetId);
      if (updateTargetError) {
        console.error("Gagal mengupdate saldo deposit target:", updateTargetError);
      }
    }
    
    return { success: true };
  } else {
    return requestJson("/api/customers/merge", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }
}

async function deleteCustomerInDatabase(customerId) {
  if (state.settings.dbMode === "supabase") {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from("customers").delete().eq("id", customerId);
    if (error) throw error;
    return { success: true };
  } else {
    return requestJson(`/api/customers/${encodeURIComponent(customerId)}`, {
      method: "DELETE",
    });
  }
}

function normalizeProductFromDatabase(product) {
  return normalizeProductRecord({
    ...product,
    id: String(product.client_id || product.id || makeId("sql-product")),
  });
}

async function saveProductsToDatabase(options = {}) {
  if (productSyncInFlight) {
    productSyncQueued = true;
    return;
  }

  productSyncInFlight = true;
  try {
    if (state.settings.dbMode === "supabase") {
      const supabase = getSupabaseClient();
      const { error: variantSchemaError } = await supabase.from("product_variants").select("client_id").limit(1);
      const canPersistVariants = !variantSchemaError;
      if (variantSchemaError && !isSupabaseMissingTableError(variantSchemaError, "product_variants")) {
        throw variantSchemaError;
      }
      const dbProducts = state.products.map(p => ({
        client_id: p.id,
        sku: p.sku || "",
        name: p.name,
        price: p.price || 0,
        stock: p.stock || 0,
        stock_unlimited: p.stockUnlimited ? 1 : 0,
        category: p.category || "",
        aliases: JSON.stringify(p.aliases || []),
        source: p.source || "manual",
        updated_at: new Date().toISOString()
      }));

	      const { error } = await supabase.from("products").upsert(dbProducts, { onConflict: "client_id" });
	      if (error) throw error;
	      if (canPersistVariants) {
	        const productIds = state.products.map((product) => product.id);
	        if (productIds.length) {
	          const { error: deleteVariantError } = await supabase.from("product_variants").delete().in("product_client_id", productIds);
	          if (deleteVariantError) throw deleteVariantError;
	        }
	        const dbVariants = state.products.flatMap((product) =>
	          getProductVariants(product).map((variant, index) => ({
	            client_id: variant.id,
	            product_client_id: product.id,
	            name: variant.name || "Normal",
	            pricing_type: normalizePricingType(variant.pricingType),
	            price: Number(variant.price || 0),
	            unit_name: variant.unitName || "porsi",
	            package_quantity: Number(variant.packageQuantity || 1),
	            package_unit: variant.packageUnit || variant.unitName || "porsi",
	            receipt_label: variant.receiptLabel || "",
	            is_default: variant.isDefault ? 1 : 0,
	            allow_quantity_override: variant.allowQuantityOverride ? 1 : 0,
	            allow_price_override: variant.allowPriceOverride ? 1 : 0,
	            stock: Number(variant.stock || 0),
	            stock_unlimited: variant.stockUnlimited ? 1 : 0,
	            aliases: JSON.stringify(variant.aliases || []),
	            sort_order: index,
	            active: variant.active === false ? 0 : 1,
	            updated_at: new Date().toISOString()
	          }))
	        );
	        if (dbVariants.length) {
	          const { error: variantError } = await supabase.from("product_variants").upsert(dbVariants, { onConflict: "client_id" });
	          if (variantError) throw variantError;
	        }
	      }

	      if (options.toast) {
	        const message = canPersistVariants
	          ? `${state.products.length} barang tersimpan ke Supabase Cloud.`
	          : `${state.products.length} barang tersimpan. Varian belum tersimpan karena Supabase REST belum bisa akses product_variants.`;
	        setSyncStatus(message, { toast: true });
	      }
    } else {
      await requestJson("/api/products", {
        method: "PUT",
        body: JSON.stringify({ products: state.products }),
      });
      if (options.toast) setSyncStatus(`${state.products.length} barang tersimpan ke database SQL.`, { toast: true });
    }
  } catch (error) {
    if (options.toast !== false) setSyncStatus(`${error.message} Barang tetap tersimpan di browser.`);
  } finally {
    productSyncInFlight = false;
    if (productSyncQueued) {
      productSyncQueued = false;
      saveProductsToDatabase({ toast: false });
    }
  }
}

async function clearProductsInDatabase() {
  try {
	    if (state.settings.dbMode === "supabase") {
	      const supabase = getSupabaseClient();
	      const { error: variantError } = await supabase.from("product_variants").delete().neq("id", 0);
	      if (variantError && !isSupabaseMissingTableError(variantError, "product_variants")) throw variantError;
	      const { error } = await supabase.from("products").delete().neq("id", 0);
	      if (error) throw error;
    } else {
      await requestJson("/api/products", { method: "DELETE" });
    }
  } catch (error) {
    setSyncStatus(`${error.message} Barang lokal sudah dihapus, database produk belum bersih.`);
  }
}

async function deleteProductsFromSupabase(clientIds) {
  if (state.settings.dbMode !== "supabase") return;
  try {
    const supabase = getSupabaseClient();
	    const ids = Array.isArray(clientIds) ? clientIds : [clientIds];
	    if (!ids.length) return;
	    const { error: variantError } = await supabase.from("product_variants").delete().in("product_client_id", ids);
	    if (variantError && !isSupabaseMissingTableError(variantError, "product_variants")) throw variantError;
	    const { error } = await supabase.from("products").delete().in("client_id", ids);
    if (error) throw error;
  } catch (error) {
    console.error("Gagal menghapus produk dari Supabase:", error);
  }
}

async function loadProductsFromDatabase(options = {}) {
  try {
	    if (state.settings.dbMode === "supabase") {
	      const supabase = getSupabaseClient();
	      const { data, error } = await supabase.from("products").select("*");
	      if (error) throw error;
	      const { data: variantData, error: variantError } = await supabase.from("product_variants").select("*");
	      if (variantError) {
	        if (!isSupabaseMissingTableError(variantError, "product_variants")) throw variantError;
	        setSyncStatus("Supabase REST belum bisa akses product_variants. Produk tetap dibaca dengan varian otomatis; jalankan docs/supabase-menu-variants.sql lalu reload schema agar varian tersimpan.", { toast: false });
	      }
	      const variantsByProduct = {};
	      (Array.isArray(variantData) ? variantData : []).forEach((variant) => {
	        const productId = String(variant.product_client_id || "");
	        if (!variantsByProduct[productId]) variantsByProduct[productId] = [];
	        variantsByProduct[productId].push(variant);
	      });
	      const sqlProducts = normalizeProductsCollection(
	        Array.isArray(data)
	          ? data.map((product) => normalizeProductFromDatabase({ ...product, variants: variantsByProduct[String(product.client_id || product.id)] || [] }))
	          : []
      );
      if (sqlProducts.length) {
        state.products = sqlProducts;
        const draftsChanged = refreshImportDraftMatches({ save: false, render: false });
        sanitizeCart();
        render();
        if (draftsChanged) saveState();
        if (options.toast) setSyncStatus(`${sqlProducts.length} barang dibaca dari Supabase Cloud.`, { toast: true });
        return sqlProducts;
      }
      return [];
    } else {
      const data = await requestJson("/api/products");
      const sqlProducts = normalizeProductsCollection(Array.isArray(data.products) ? data.products.map(normalizeProductFromDatabase) : []);

      if (sqlProducts.length) {
        state.products = sqlProducts;
        const draftsChanged = refreshImportDraftMatches({ save: false, render: false });
        sanitizeCart();
        render();
        if (draftsChanged) saveState();
        if (options.toast) setSyncStatus(`${sqlProducts.length} barang dibaca dari database SQL.`, { toast: true });
        return sqlProducts;
      }

      if (state.products.length && options.seed !== false) {
        await saveProductsToDatabase({ toast: false });
      }
      return [];
    }
  } catch (error) {
    if (options.toast !== false) setSyncStatus(`${error.message} Aplikasi memakai cache barang di browser.`);
    return state.products;
  }
}

async function loadCustomers(options = {}) {
  try {
    if (state.settings.dbMode === "supabase") {
      const supabase = getSupabaseClient();
      const { data: customersData, error: customerError } = await supabase.from("customers").select("*");
      if (customerError) throw customerError;
      
      const { data: aliasesData, error: aliasError } = await supabase.from("customer_aliases").select("*");
      if (aliasError) throw aliasError;

      const customers = customersData.map(c => {
        const aliases = aliasesData.filter(a => String(a.customer_id) === String(c.id)).map(a => a.alias);
        return {
          id: c.id,
          name: c.name,
          default_shipping: Number(c.default_shipping || 0),
          last_order_at: c.last_order_at || "",
          deposit_balance: Number(c.deposit_balance || 0),
          tag: c.tag || c.customer_tag || c.address_tag || "",
          aliases: aliases
        };
      });

      state.customers = customers;
      invalidateCustomerProfilesCache();
      const draftsChanged = refreshImportDraftMatches({ save: false, render: false });
      renderCustomerSuggestions();
      renderCustomerProfileHint();
      renderCustomerDataList();
      if (draftsChanged) {
        renderBulkDrafts();
        saveState();
      }
      return state.customers;
    } else {
      const data = await requestJson("/api/customers?limit=500");
      state.customers = Array.isArray(data.customers) ? data.customers : [];
      invalidateCustomerProfilesCache();
      const draftsChanged = refreshImportDraftMatches({ save: false, render: false });
      renderCustomerSuggestions();
      renderCustomerProfileHint();
      renderCustomerDataList();
      if (draftsChanged) {
        renderBulkDrafts();
        saveState();
      }
      return state.customers;
    }
  } catch (error) {
    state.customers = [];
    invalidateCustomerProfilesCache();
    renderCustomerSuggestions();
    renderCustomerProfileHint();
    renderCustomerDataList("Data customer belum terbaca.");
    if (options.toast !== false) setDatabaseStatus(`${error.message} Customer database belum terbaca.`);
    return [];
  }
}

async function loadSalesDashboard() {
  try {
    const data = await dbFetchSales({ limit: 1000, includeDeleted: true });
    state.sales = prepareSalesForSearch(Array.isArray(data.sales) ? data.sales : []);
    invalidateCustomerProfilesCache();
    
    if (state.settings.dbMode === "supabase") {
      const activeSales = state.sales.filter(s => !s.deletedAt);
      const deletedSales = state.sales.filter(s => !!s.deletedAt);
      state.salesSummary = {
        totalSales: activeSales.length,
        totalRevenue: activeSales.reduce((acc, s) => acc + (s.total || 0), 0),
        deletedSales: deletedSales.length
      };
      await loadCustomers({ toast: false });
      renderSalesDashboard();
      setDatabaseStatus("Dashboard sudah terhubung ke Supabase Cloud.", { toast: false });
    } else {
      state.salesSummary = {
        totalSales: Number(data.summary?.totalSales || getActiveSales().length),
        totalRevenue: Number(data.summary?.totalRevenue || 0),
        deletedSales: Number(data.summary?.deletedSales || state.sales.filter(isSaleDeleted).length),
      };
      await loadCustomers({ toast: false });
      renderSalesDashboard();
      setDatabaseStatus("Dashboard sudah terhubung ke SQLite.", { toast: false });
    }
  } catch (error) {
    renderSalesDashboard();
    setDatabaseStatus(`${error.message} Hubungkan database atau restart server SQL.`);
  }
}

function getPaymentIcon(name) {
  const key = normalizeKey(name);
  if (key.includes("qris")) return "▦";
  if (key.includes("transfer")) return "↗";
  if (key.includes("debit")) return "▭";
  if (key.includes("tunai") || key.includes("cash")) return "Rp";
  return "•";
}

function renderMiniList(element, items, emptyText, options = {}) {
  if (!items.length) {
    element.innerHTML = `<p class="mini-list-empty">${escapeHtml(emptyText)}</p>`;
    return;
  }

  const maxValue = Math.max(...items.map((item) => Number(item.total ?? item.quantity ?? 0)), 1);
  const graphColors = ["#0f766e", "#2563eb", "#b45309", "#7c3aed", "#be123c", "#15803d", "#0891b2", "#a16207"];
  element.innerHTML = items
    .map(
      (item, index) => {
        const value = Number(item.total ?? item.quantity ?? 0);
        const fill = Math.max(8, Math.round((value / maxValue) * 100));
        const color = graphColors[index % graphColors.length];
        const iconHtml = options.icons ? `<span class="mini-list-icon" aria-hidden="true">${escapeHtml(getPaymentIcon(item.name))}</span>` : "";
        return `
        <div class="mini-list-row" style="--mini-fill: ${fill}%; --mini-color: ${color}">
          <span class="mini-list-fill" aria-hidden="true"></span>
          <span class="mini-list-name">${iconHtml}${escapeHtml(item.name)}</span>
          <strong>${item.total !== undefined ? currency.format(item.total) : `${item.quantity} item`}</strong>
        </div>
      `;
      }
    )
    .join("");
}

function getCourierBadgeText(courier) {
  if (courier === "Hide/Vendi") return "HV";
  if (courier === SHIPPING_COURIER_UNMAPPED_LABEL) return "?";
  return String(courier || "")
    .split(/[\/\s]+/)
    .map((part) => part[0] || "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function renderCourierShippingList(element, summary) {
  if (!element) return;
  const items = Array.isArray(summary?.byCourier) ? summary.byCourier : [];
  if (!items.length) {
    element.innerHTML = `<p class="mini-list-empty">Belum ada ongkir.</p>`;
    return;
  }

  const graphColors = ["#0f766e", "#2563eb", "#b45309", "#7c3aed", "#be123c", "#15803d", "#0891b2", "#a16207"];
  element.innerHTML = items
    .map((item, index) => {
      const color = graphColors[index % graphColors.length];
      const tagChips = item.tags
        .map((tag) => `<span class="courier-shipping-tag-chip">${escapeHtml(tag.tag)} ${currency.format(tag.total)}</span>`)
        .join("");
      return `
        <div class="mini-list-row courier-shipping-row" style="--mini-color: ${color}">
          <span class="mini-list-name">
            <span class="mini-list-icon" aria-hidden="true">${escapeHtml(getCourierBadgeText(item.courier))}</span>
            <span class="courier-shipping-copy">
              <span>${escapeHtml(item.courier)}</span>
              <span class="courier-shipping-tags">
                <span class="courier-shipping-count-chip">${item.count || 0} transaksi</span>
                ${tagChips}
              </span>
            </span>
          </span>
          <strong>${currency.format(item.total)}</strong>
        </div>
      `;
    })
    .join("");
}

function renderDailyReport(selectedSales) {
  const report = buildDailyReport(selectedSales);
  els.dailyAverageText.textContent = currency.format(report.average);
  renderMiniList(els.dailyPaymentBreakdown, report.payments, "Belum ada pembayaran.", { icons: true });
  renderMiniList(
    els.dailyItemTotals,
    report.itemTotals.map((item) => ({ name: item.name, quantity: item.quantity })),
    "Belum ada item terjual."
  );
  renderCourierShippingList(els.dailyCourierShipping, report.shippingSummary);
}

function renderSaleCardItems(items = []) {
  if (!items.length) return `<p class="sale-card-items">Tidak ada item</p>`;

  const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const rows = items
    .map((item) => {
      const quantity = Math.max(0, Number(item.quantity || 0));
      const price = Number(item.price || 0);
      const lineTotal = Number(item.lineTotal || item.line_total || price * quantity);
      const name = getReceiptItemDisplayName(item);
      const note = String(item.note || "").trim();
      return `
        <li class="sale-card-item-row">
          <span class="sale-card-item-qty">${quantity}x</span>
          <span class="sale-card-item-copy">
            <strong>${escapeHtml(name)}</strong>
            ${note ? `<em>${escapeHtml(note)}</em>` : ""}
          </span>
          <strong class="sale-card-item-total">${currency.format(lineTotal)}</strong>
        </li>
      `;
    })
    .join("");

  return `
    <div class="sale-card-items sale-card-item-block">
      <div class="sale-card-item-heading">
        <span>Item pesanan</span>
        <strong>${totalQuantity} item</strong>
      </div>
      <ul class="sale-card-item-list">${rows}</ul>
    </div>
  `;
}

function resetSalesPage() {
  state.salesPage = 1;
}

function updateSalesPagination(totalVisibleSales) {
  const pageCount = Math.max(1, Math.ceil(totalVisibleSales / SALES_PAGE_SIZE));
  state.salesPage = Math.min(Math.max(1, state.salesPage), pageCount);
  const hasMultiplePages = totalVisibleSales > SALES_PAGE_SIZE;

  if (els.salesPagination) els.salesPagination.hidden = !hasMultiplePages;
  if (els.salesPageInfo) {
    const startItem = totalVisibleSales ? (state.salesPage - 1) * SALES_PAGE_SIZE + 1 : 0;
    const endItem = Math.min(state.salesPage * SALES_PAGE_SIZE, totalVisibleSales);
    els.salesPageInfo.textContent = `Halaman ${state.salesPage} dari ${pageCount} · ${startItem}-${endItem} dari ${totalVisibleSales}`;
  }
  if (els.previousSalesPageButton) els.previousSalesPageButton.disabled = state.salesPage <= 1;
  if (els.nextSalesPageButton) els.nextSalesPageButton.disabled = state.salesPage >= pageCount;

  return pageCount;
}

function setSalesPage(page) {
  state.salesPage = Math.max(1, Number.parseInt(page, 10) || 1);
  renderSalesDashboard();
  saveState();
}

function renderSalesDashboard() {
  const range = getSalesRangeDates();
  const selectedSales = getSelectedSales();
  const visibleSales = getVisibleSales();
  const selectedRevenue = selectedSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  state.salesStartDate = range.start;
  state.salesEndDate = range.end;
  if (state.salesRange === "day") state.salesDate = range.start;
  els.salesDateInput.value = state.salesDate || range.end;
  if (els.salesStartDateInput) els.salesStartDateInput.value = range.start;
  if (els.salesEndDateInput) els.salesEndDateInput.value = range.end;
  renderSalesDateControls(range);
  renderSalesCalendar();
  els.salesSearchInput.value = state.salesSearch;
  if (els.salesSortInput) els.salesSortInput.value = state.salesSort;
  els.salesDateLabel.textContent = formatSalesDateLabel();
  els.salesRangeButtons.forEach((button) => {
    const active = button.dataset.salesRange === state.salesRange;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  els.salesStatusButtons.forEach((button) => {
    const active = button.dataset.salesStatus === state.salesStatus;
    const count = button.dataset.salesStatus === "deleted" ? state.salesSummary.deletedSales : button.dataset.salesStatus === "active" ? state.salesSummary.totalSales : state.sales.length;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    button.textContent = `${button.dataset.salesStatus === "deleted" ? "Terhapus" : button.dataset.salesStatus === "all" ? "Semua" : "Aktif"} (${count || 0})`;
  });
  if (els.selectedSalesLabel) els.selectedSalesLabel.textContent = state.salesStatus === "deleted" ? "Struk terhapus" : "Transaksi rentang ini";
  if (els.selectedRevenueLabel) els.selectedRevenueLabel.textContent = state.salesStatus === "deleted" ? "Omzet terhapus" : "Omzet rentang ini";
  if (els.exportDailyReportButton) els.exportDailyReportButton.textContent = range.start === range.end ? "CSV Tanggal Ini" : "CSV Rentang";
  els.selectedSalesText.textContent = String(selectedSales.length);
  els.selectedRevenueText.textContent = currency.format(selectedRevenue);
  els.totalSalesText.textContent = String(state.salesSummary.totalSales || getActiveSales().length);
  if (els.dailyReportSection) {
    els.dailyReportSection.hidden = state.salesStatus === "deleted";
  }
  if (state.salesStatus !== "deleted") {
    renderDailyReport(selectedSales.filter((sale) => !isSaleDeleted(sale)));
  }

  if (!state.sales.length) {
    updateSalesPagination(0);
    els.salesList.innerHTML = `<div class="empty-state">Belum ada transaksi tersimpan. Selesaikan transaksi pertama untuk melihat riwayat penjualan.</div>`;
    return;
  }

  if (!selectedSales.length) {
    updateSalesPagination(0);
    els.salesList.innerHTML = `<div class="empty-state">Belum ada transaksi pada rentang ini.</div>`;
    return;
  }

  if (!visibleSales.length) {
    updateSalesPagination(0);
    els.salesList.innerHTML = `<div class="empty-state">Tidak ada transaksi yang cocok dengan pencarian.</div>`;
    return;
  }

  updateSalesPagination(visibleSales.length);
  const pageStart = (state.salesPage - 1) * SALES_PAGE_SIZE;
  const pagedSales = visibleSales.slice(pageStart, pageStart + SALES_PAGE_SIZE);

  els.salesList.innerHTML = pagedSales
    .map((sale) => {
      const items = Array.isArray(sale.items) ? sale.items : [];
      const itemCount = getSaleItemCount(sale);
      const saleId = String(sale.id ?? "");
      const customerName = String(sale.customer_name || sale.customer_address || "").trim();
      const receiptNo = String(sale.receipt_no || "Struk tanpa nomor").trim();
      const primaryTitle = customerName || "Customer belum diisi";
      const chatDate = String(sale.chat_date || "").trim();
      const shipping = getSaleShipping(sale);
      const deleted = isSaleDeleted(sale);
      const statusLabel = deleted ? "Terhapus" : "Selesai";
      const deletedInfo = deleted ? `<p><span>Dihapus</span><strong>${new Date(sale.deleted_at).toLocaleString("id-ID")}</strong></p>` : "";
      return `
        <article class="sale-card ${deleted ? "deleted" : ""}" data-sale-id="${escapeHtml(saleId)}" tabindex="0" aria-label="Buka detail ${escapeHtml(primaryTitle)} ${escapeHtml(receiptNo)}">
          <div class="sale-card-header">
            <div class="sale-card-heading">
              <div class="sale-card-badges">
                <span class="status-badge ${deleted ? "deleted" : "success"}">${statusLabel}</span>
                <span class="status-badge">${escapeHtml(sale.payment || "Tunai")}</span>
                <span class="status-badge">${itemCount} item</span>
              </div>
              <p class="sale-card-customer">${escapeHtml(primaryTitle)}</p>
              <p class="sale-card-receipt">${escapeHtml(receiptNo)}</p>
            </div>
            <div class="sale-card-actions">
              <strong>${currency.format(Number(sale.total || 0))}</strong>
              <button class="ghost-button sale-print-button" type="button" data-print-sale="${escapeHtml(saleId)}" aria-label="Cetak struk ${escapeHtml(receiptNo)}" ${saleId ? "" : "disabled"}>Cetak Struk</button>
              <button class="ghost-button sale-edit-button" type="button" data-edit-sale="${escapeHtml(saleId)}" aria-label="Edit ${escapeHtml(receiptNo)}" ${saleId && !deleted ? "" : "disabled"}>Edit</button>
              <button class="ghost-button sale-detail-button" type="button" data-view-sale="${escapeHtml(saleId)}" aria-label="Detail ${escapeHtml(receiptNo)}" ${saleId ? "" : "disabled"}>Detail</button>
              ${
                deleted
                  ? `<button class="secondary-button sale-restore-button" type="button" data-restore-sale="${escapeHtml(saleId)}" aria-label="Restore ${escapeHtml(receiptNo)}" ${saleId ? "" : "disabled"}>Restore</button>`
                  : `<button class="ghost-button danger sale-delete-button" type="button" data-delete-sale="${escapeHtml(saleId)}" aria-label="Hapus ${escapeHtml(receiptNo)}" ${saleId ? "" : "disabled"}>Hapus</button>`
              }
            </div>
          </div>
          <div class="sale-card-info">
            <p><span>Selesai</span><strong>${new Date(sale.completed_at).toLocaleString("id-ID")}</strong></p>
            <p><span>Pembayaran</span><strong>${escapeHtml(sale.payment || "Tunai")}</strong></p>
            ${chatDate ? `<p><span>Chat WA</span><strong>${escapeHtml(chatDate)}</strong></p>` : ""}
            ${deletedInfo}
          </div>
          ${renderSaleCardItems(items)}
          <div class="sale-card-summary">
            <span>Subtotal <strong>${currency.format(Number(sale.subtotal || 0))}</strong></span>
            <span>${shippingLabelHtml()} <strong>${currency.format(shipping)}</strong></span>
            <span>Item <strong>${itemCount}</strong></span>
          </div>
        </article>
      `;
    })
    .join("");
}

function findSaleById(saleId) {
  return state.sales.find((sale) => String(sale.id) === String(saleId));
}

function renderPaymentOptions(currentPayment) {
  const current = String(currentPayment || "Tunai").trim() || "Tunai";
  const options = ["Tunai", "Debit", "QRIS", "Transfer"];
  if (!options.some((option) => normalizeKey(option) === normalizeKey(current))) options.push(current);

  return options
    .map((option) => `<option value="${escapeHtml(option)}" ${normalizeKey(option) === normalizeKey(current) ? "selected" : ""}>${escapeHtml(option)}</option>`)
    .join("");
}

function renderSaleEditItemRow(item = {}) {
  const quantity = Math.max(1, Number(item.quantity || 1));
  const price = Number(item.price || 0);
  return `
    <article class="sale-edit-item" data-sale-edit-item>
      <input data-sale-edit-field="product_client_id" type="hidden" value="${escapeHtml(item.productClientId || item.product_client_id || "")}">
      <input data-sale-edit-field="variant_client_id" type="hidden" value="${escapeHtml(item.variantId || item.variantClientId || item.variant_client_id || "")}">
      <input data-sale-edit-field="menu_name" type="hidden" value="${escapeHtml(item.menuName || item.menu_name || item.name || "")}">
      <input data-sale-edit-field="variant_name" type="hidden" value="${escapeHtml(item.variantName || item.variant_name || "")}">
      <input data-sale-edit-field="unit_name" type="hidden" value="${escapeHtml(item.unitName || item.unit_name || "")}">
      <input data-sale-edit-field="unit_quantity" type="hidden" value="${escapeHtml(item.unitQuantity || item.unit_quantity || item.quantity || "")}">
      <input data-sale-edit-field="pricing_type" type="hidden" value="${escapeHtml(item.pricingType || item.pricing_type || "")}">
      <input data-sale-edit-field="receipt_label" type="hidden" value="${escapeHtml(item.receiptLabel || item.receipt_label || "")}">
      <label>
        Item
        <input data-sale-edit-field="name" type="text" value="${escapeHtml(item.name || "")}" placeholder="Nama menu" required>
      </label>
      <label>
        SKU
        <input data-sale-edit-field="sku" type="text" value="${escapeHtml(item.sku || "")}" placeholder="Opsional">
      </label>
      <label>
        Qty
        <input data-sale-edit-field="quantity" type="number" min="1" step="1" value="${quantity}" required>
      </label>
      <label>
        Harga
        <input data-sale-edit-field="price" data-sale-edit-money type="text" inputmode="numeric" pattern="[0-9.]*" value="${escapeHtml(formatIntegerInput(price))}" required>
      </label>
      <label class="sale-edit-item-note">
        Catatan
        <input data-sale-edit-field="note" type="text" value="${escapeHtml(item.note || "")}" placeholder="Opsional">
      </label>
      <button class="ghost-button danger sale-edit-remove-item" type="button" data-remove-sale-edit-item>Hapus</button>
    </article>
  `;
}

function renderSaleEditForm(payload) {
  const items = Array.isArray(payload.items) && payload.items.length ? payload.items : [{ name: "", sku: "", quantity: 1, price: 0, note: "" }];
  return `
    <form class="sale-edit-form" id="saleEditForm">
      <div class="sale-edit-heading">
        <strong>Edit data struk</strong>
        <span>Ubah customer, ongkir, item, qty, harga, lalu simpan dan cetak ulang struk terbaru.</span>
      </div>
      <div class="sale-edit-grid">
        <label>
          Customer / Alamat
          <input name="customerName" type="text" list="customerSuggestions" autocomplete="off" value="${escapeHtml(payload.customerName)}">
        </label>
        <label>
          Pembayaran
          <select name="payment">
            ${renderPaymentOptions(payload.payment)}
          </select>
        </label>
        <label>
          ${shippingLabelHtml()}
          <input name="shipping" type="text" inputmode="numeric" pattern="[0-9.]*" autocomplete="off" data-sale-edit-money value="${escapeHtml(formatIntegerInput(payload.shipping))}">
        </label>
        <label class="sale-edit-wide">
          Tanggal chat
          <input name="chatDate" type="text" autocomplete="off" placeholder="Contoh: 28/05/2026 21.09.55" value="${escapeHtml(payload.chatDate)}">
        </label>
      </div>
      <div class="sale-edit-items">
        <div class="sale-edit-section-heading">
          <strong>Edit item struk</strong>
          <button class="ghost-button" type="button" data-add-sale-edit-item>Tambah Item</button>
        </div>
        <div class="sale-edit-item-list" data-sale-edit-item-list>
          ${items.map(renderSaleEditItemRow).join("")}
        </div>
      </div>
      <div class="sale-edit-preview">
        <span>Total setelah edit</span>
        <strong data-sale-edit-total>${currency.format(payload.total)}</strong>
      </div>
      <div class="modal-actions sale-edit-actions">
        <button class="ghost-button" type="button" data-cancel-sale-edit>Batal</button>
        <button class="primary-button" type="submit" data-save-sale-edit>Simpan Perubahan</button>
      </div>
    </form>
  `;
}

function getSaleEditFormValues(form) {
  const formData = new FormData(form);
  const items = [...form.querySelectorAll("[data-sale-edit-item]")]
    .map((row) => {
      const name = String(row.querySelector('[data-sale-edit-field="name"]')?.value || "").trim();
      const sku = String(row.querySelector('[data-sale-edit-field="sku"]')?.value || "").trim();
      const quantity = parseIntegerInput(row.querySelector('[data-sale-edit-field="quantity"]')?.value || "0");
      const price = parseIntegerInput(row.querySelector('[data-sale-edit-field="price"]')?.value || "0");
      const note = String(row.querySelector('[data-sale-edit-field="note"]')?.value || "").trim();
      return {
        sku,
        name,
        price,
        quantity,
        lineTotal: price * quantity,
        note,
        productClientId: String(row.querySelector('[data-sale-edit-field="product_client_id"]')?.value || "").trim(),
        product_client_id: String(row.querySelector('[data-sale-edit-field="product_client_id"]')?.value || "").trim(),
        variantId: String(row.querySelector('[data-sale-edit-field="variant_client_id"]')?.value || "").trim(),
        variantClientId: String(row.querySelector('[data-sale-edit-field="variant_client_id"]')?.value || "").trim(),
        variant_client_id: String(row.querySelector('[data-sale-edit-field="variant_client_id"]')?.value || "").trim(),
        menuName: String(row.querySelector('[data-sale-edit-field="menu_name"]')?.value || name).trim(),
        menu_name: String(row.querySelector('[data-sale-edit-field="menu_name"]')?.value || name).trim(),
        variantName: String(row.querySelector('[data-sale-edit-field="variant_name"]')?.value || "").trim(),
        variant_name: String(row.querySelector('[data-sale-edit-field="variant_name"]')?.value || "").trim(),
        unitName: String(row.querySelector('[data-sale-edit-field="unit_name"]')?.value || "").trim(),
        unit_name: String(row.querySelector('[data-sale-edit-field="unit_name"]')?.value || "").trim(),
        unitQuantity: parseIntegerInput(row.querySelector('[data-sale-edit-field="unit_quantity"]')?.value || quantity),
        unit_quantity: parseIntegerInput(row.querySelector('[data-sale-edit-field="unit_quantity"]')?.value || quantity),
        pricingType: String(row.querySelector('[data-sale-edit-field="pricing_type"]')?.value || "").trim(),
        pricing_type: String(row.querySelector('[data-sale-edit-field="pricing_type"]')?.value || "").trim(),
        receiptLabel: String(row.querySelector('[data-sale-edit-field="receipt_label"]')?.value || "").trim(),
        receipt_label: String(row.querySelector('[data-sale-edit-field="receipt_label"]')?.value || "").trim(),
      };
    })
    .filter((item) => item.name && item.quantity > 0 && item.price > 0);
  return {
    customerName: String(formData.get("customerName") || "").trim(),
    payment: String(formData.get("payment") || "Tunai").trim() || "Tunai",
    shipping: parseIntegerInput(formData.get("shipping")),
    tax: 0,
    chatDate: String(formData.get("chatDate") || "").trim(),
    items,
  };
}

function updateSaleEditTotalPreview(form = document.querySelector("#saleEditForm")) {
  if (!form || !state.activeDetailSale) return;
  const values = getSaleEditFormValues(form);
  const subtotal = values.items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
  const totalText = form.querySelector("[data-sale-edit-total]");
  if (totalText) totalText.textContent = currency.format(subtotal + values.shipping);
}

async function saveSaleDetailEdit(form) {
  const sale = state.activeDetailSale;
  if (!sale) return;

  const saveButton = form.querySelector("[data-save-sale-edit]");
  if (saveButton) saveButton.disabled = true;
  setDatabaseStatus(`Menyimpan perubahan ${sale.receipt_no}...`);
  const values = getSaleEditFormValues(form);

  if (!values.items.length) {
    if (saveButton) saveButton.disabled = false;
    setDatabaseStatus("Item struk belum valid. Minimal satu item harus punya nama, qty, dan harga.");
    return;
  }

  try {
    const previousSale = JSON.parse(JSON.stringify(sale));
    const data = await updateSaleInDatabase(sale.id, values);
    const updatedSale = data.sale || sale;
    const stockResult = reconcileStockAfterSaleEdit(previousSale, updatedSale);
    if (stockResult.restored || stockResult.decremented) await saveProductsToDatabase({ toast: false });
    const index = state.sales.findIndex((item) => String(item.id) === String(updatedSale.id));
    if (index >= 0) state.sales[index] = updatedSale;
    state.activeDetailSale = updatedSale;
    state.editingSaleDetail = false;
    await loadSalesDashboard();
    state.activeDetailSale = findSaleById(updatedSale.id) || updatedSale;
    renderSaleDetail(state.activeDetailSale);
    const stockCopy = stockResult.restored || stockResult.decremented
      ? ` Stok disesuaikan: +${stockResult.restored}, -${stockResult.decremented}.`
      : "";
    setDatabaseStatus(`Perubahan ${state.activeDetailSale.receipt_no} tersimpan.${stockCopy} Klik Cetak Ulang untuk print struk terbaru.`);
  } catch (error) {
    if (saveButton) saveButton.disabled = false;
    setDatabaseStatus(`${error.message} Perubahan belum tersimpan.`);
  }
}

function renderSaleDetail(sale) {
  const payload = saleToReceiptPayload(sale);
  const items = Array.isArray(payload.items) ? payload.items : [];
  const isEditing = Boolean(state.editingSaleDetail);
  const itemRows = items
    .map((item) => {
      const quantity = Number(item.quantity || 0);
      const price = Number(item.price || 0);
      const lineTotal = Number(item.lineTotal || item.line_total || price * quantity);
      const sku = String(item.sku || "").trim();
      const note = String(item.note || "").trim();
      const meta = [sku, note].filter(Boolean).join(" · ");
      return `
        <article class="sale-detail-item">
          <div class="sale-detail-item-main">
            <span class="sale-detail-quantity">${quantity}x</span>
            <div>
              <strong>${escapeHtml(item.name || "Barang")}</strong>
              ${meta ? `<p>${escapeHtml(meta)}</p>` : ""}
            </div>
          </div>
          <div class="sale-detail-item-total">
            <span>${currency.format(price)} / item</span>
            <strong>${currency.format(lineTotal)}</strong>
          </div>
        </article>
      `;
    })
    .join("");

  els.saleDetailTitle.textContent = payload.receiptNo || "Detail transaksi";
  els.editSaleDetailButton.textContent = isEditing ? "Batal Edit" : "Edit Data";
  els.editSaleDetailButton.setAttribute("aria-pressed", String(isEditing));
  els.editSaleDetailButton.disabled = isSaleDeleted(sale);
  els.printSaleDetailButton.disabled = isEditing;
  els.saleDetailBody.innerHTML = `
    ${
      isEditing
        ? renderSaleEditForm(payload)
        : `<div class="sale-detail-meta">
            <div>
              <span>Tanggal</span>
              <strong>${new Date(payload.completedAt).toLocaleString("id-ID")}</strong>
            </div>
            <div>
              <span>Pembayaran</span>
              <strong>${escapeHtml(payload.payment)}</strong>
            </div>
            <div>
              <span>Total item</span>
              <strong>${getSaleItemCount(sale)}</strong>
            </div>
            ${
              payload.customerName
                ? `<div>
                    <span>Customer / Alamat</span>
                    <strong>${escapeHtml(payload.customerName)}</strong>
                  </div>`
                : ""
            }
            ${
              payload.chatDate
                ? `<div>
                    <span>Tanggal chat</span>
                    <strong>${escapeHtml(payload.chatDate)}</strong>
                  </div>`
                : ""
            }
          </div>`
    }
    <div class="sale-detail-items">
      <div class="sale-detail-section-heading">
        <span>Item pesanan</span>
        <strong>${getSaleItemCount(sale)} item</strong>
      </div>
      ${itemRows || `<div class="empty-state">Tidak ada item di struk ini.</div>`}
    </div>
    <div class="sale-detail-totals">
      <div><span>Subtotal</span><strong>${currency.format(payload.subtotal)}</strong></div>
      <div><span>${shippingLabelHtml()}</span><strong>${currency.format(payload.shipping)}</strong></div>
      <div class="sale-detail-grand-total"><span>Total</span><strong>${currency.format(payload.total)}</strong></div>
    </div>
  `;
  if (isEditing) updateSaleEditTotalPreview();
}

function openSaleDetailModal(saleId) {
  const sale = findSaleById(saleId);
  if (!sale) {
    setDatabaseStatus("Struk tidak ditemukan. Muat ulang dashboard lalu coba lagi.");
    return;
  }

  state.activeDetailSale = sale;
  state.editingSaleDetail = false;
  renderSaleDetail(sale);
  openModal(els.saleDetailModal, els.printSaleDetailButton);
}

function openSaleEditModal(saleId) {
  const sale = findSaleById(saleId);
  if (!sale) {
    setDatabaseStatus("Struk tidak ditemukan. Muat ulang dashboard lalu coba lagi.");
    return;
  }

  if (isSaleDeleted(sale)) {
    setDatabaseStatus("Struk terhapus harus direstore dulu sebelum diedit.");
    return;
  }

  state.activeDetailSale = sale;
  state.editingSaleDetail = true;
  renderSaleDetail(sale);
  openModal(els.saleDetailModal, document.querySelector("#saleEditForm input"));
}

function closeSaleDetailModal() {
  state.activeDetailSale = null;
  state.editingSaleDetail = false;
  els.saleDetailModal.close();
}

function toggleSaleDetailEdit() {
  if (!state.activeDetailSale) return;
  state.editingSaleDetail = !state.editingSaleDetail;
  renderSaleDetail(state.activeDetailSale);
  const focusTarget = state.editingSaleDetail ? document.querySelector("#saleEditForm input") : els.editSaleDetailButton;
  focusTarget?.focus();
}

function printActiveSaleDetail() {
  if (!state.activeDetailSale) return;
  if (state.editingSaleDetail) {
    setDatabaseStatus("Simpan perubahan dulu sebelum cetak ulang.");
    return;
  }
  printSaleReceipt(saleToReceiptPayload(state.activeDetailSale));
}

function printSaleFromList(saleId) {
  const sale = findSaleById(saleId);
  if (!sale) {
    setDatabaseStatus("Struk tidak ditemukan. Muat ulang dashboard lalu coba cetak lagi.");
    return;
  }
  printSaleReceipt(saleToReceiptPayload(sale));
}

function findProductForSaleItem(item) {
  const productClientId = String(item?.productClientId || item?.product_client_id || "").trim();
  if (productClientId) {
    const byId = getProduct(productClientId);
    if (byId) return byId;
  }
  const itemSku = normalizeKey(item?.sku);
  if (itemSku) {
    const productBySku = state.products.find((product) => normalizeKey(product.sku) === itemSku);
    if (productBySku) return productBySku;
  }

  const itemName = normalizeKey(item?.name);
  return state.products.find((product) => productMatchesName(product, itemName));
}

function restoreStockFromSale(sale) {
  const result = { restored: 0, missing: 0, skippedUnlimited: 0 };
  const items = Array.isArray(sale.items) ? sale.items : [];

  items.forEach((item) => {
    const product = findProductForSaleItem(item);
    if (!product) {
      result.missing += 1;
      return;
    }

    if (isStockUnlimited(product)) {
      result.skippedUnlimited += 1;
      return;
    }

    const quantity = Number(item.quantity || 0);
    product.stock = Math.max(0, Number(product.stock || 0)) + quantity;
    result.restored += quantity;
  });

  return result;
}

function decrementStockFromSale(sale) {
  const result = { decremented: 0, missing: 0, skippedUnlimited: 0 };
  const items = Array.isArray(sale.items) ? sale.items : [];

  items.forEach((item) => {
    const product = findProductForSaleItem(item);
    if (!product) {
      result.missing += 1;
      return;
    }

    if (isStockUnlimited(product)) {
      result.skippedUnlimited += 1;
      return;
    }

    const quantity = Number(item.quantity || 0);
    product.stock = Math.max(0, Number(product.stock || 0) - quantity);
    result.decremented += quantity;
  });

  return result;
}

function getSaleProductQuantityMap(items = []) {
  const result = { quantities: new Map(), products: new Map(), missing: 0, skippedUnlimited: 0 };
  items.forEach((item) => {
    const product = findProductForSaleItem(item);
    if (!product) {
      result.missing += 1;
      return;
    }
    if (isStockUnlimited(product)) {
      result.skippedUnlimited += 1;
      return;
    }
    const quantity = Number(item.quantity || 0);
    const key = String(product.id);
    result.quantities.set(key, (result.quantities.get(key) || 0) + quantity);
    result.products.set(key, product);
  });
  return result;
}

function reconcileStockAfterSaleEdit(previousSale, updatedSale) {
  const previous = getSaleProductQuantityMap(previousSale?.items || []);
  const next = getSaleProductQuantityMap(updatedSale?.items || []);
  const ids = new Set([...previous.quantities.keys(), ...next.quantities.keys()]);
  const result = {
    restored: 0,
    decremented: 0,
    missing: previous.missing + next.missing,
    skippedUnlimited: previous.skippedUnlimited + next.skippedUnlimited,
  };

  ids.forEach((id) => {
    const product = next.products.get(id) || previous.products.get(id);
    if (!product) return;
    const oldQuantity = Number(previous.quantities.get(id) || 0);
    const newQuantity = Number(next.quantities.get(id) || 0);
    const delta = newQuantity - oldQuantity;
    if (delta > 0) {
      product.stock = Math.max(0, Number(product.stock || 0) - delta);
      result.decremented += delta;
    } else if (delta < 0) {
      product.stock = Math.max(0, Number(product.stock || 0)) + Math.abs(delta);
      result.restored += Math.abs(delta);
    }
  });

  return result;
}

function openDeleteSaleModal(saleId) {
  const sale = findSaleById(saleId);
  if (!sale) {
    setDatabaseStatus("Struk tidak ditemukan. Muat ulang dashboard lalu coba lagi.");
    return;
  }

  state.pendingDeleteSale = sale;
  els.deleteSaleMessage.textContent = `Yakin mau hapus ${sale.receipt_no}? Struk akan masuk tab Terhapus dan bisa direstore.`;
  els.restoreStockOnDeleteInput.checked = true;
  els.confirmDeleteSaleButton.disabled = false;
  openModal(els.deleteSaleModal, els.cancelDeleteSaleButton);
}

function closeDeleteSaleModal() {
  state.pendingDeleteSale = null;
  els.deleteSaleModal.close();
}

async function confirmDeleteSale() {
  const sale = state.pendingDeleteSale;
  if (!sale) return;

  els.confirmDeleteSaleButton.disabled = true;
  setDatabaseStatus(`Menghapus ${sale.receipt_no}...`);
  const shouldRestoreStock = els.restoreStockOnDeleteInput.checked;

  try {
    await deleteSaleFromDatabase(sale.id, { restoreStock: shouldRestoreStock });
    const receiptNo = sale.receipt_no;
    let restoreMessage = "";
    if (shouldRestoreStock) {
      const restoreResult = restoreStockFromSale(sale);
      render();
      await saveProductsToDatabase({ toast: false });
      restoreMessage = restoreResult.restored
        ? ` Stok kembali ${restoreResult.restored} item.`
        : " Tidak ada stok yang perlu dikembalikan.";
      if (restoreResult.missing) restoreMessage += ` ${restoreResult.missing} item tidak ditemukan di daftar barang.`;
    }
    closeDeleteSaleModal();
    await loadSalesDashboard();
    setDatabaseStatus(`${receiptNo} masuk tab Terhapus.${restoreMessage}`);
  } catch (error) {
    els.deleteSaleMessage.textContent = `${error.message} Coba muat ulang dashboard lalu hapus lagi.`;
    setDatabaseStatus(error.message);
  } finally {
    els.confirmDeleteSaleButton.disabled = false;
  }
}

async function restoreDeletedSale(saleId) {
  const sale = findSaleById(saleId);
  if (!sale) {
    setDatabaseStatus("Struk tidak ditemukan. Muat ulang dashboard lalu coba restore lagi.");
    return;
  }

  setDatabaseStatus(`Merestore ${sale.receipt_no}...`);
  try {
    await restoreSaleInDatabase(saleId);
    let stockMessage = "";
    if (Number(sale.stock_restored_on_delete || 0)) {
      const stockResult = decrementStockFromSale(sale);
      render();
      await saveProductsToDatabase({ toast: false });
      stockMessage = stockResult.decremented
        ? ` Stok dikurangi lagi ${stockResult.decremented} item.`
        : " Tidak ada stok lokal yang perlu dikurangi.";
      if (stockResult.missing) stockMessage += ` ${stockResult.missing} item tidak ditemukan di daftar barang.`;
    }
    state.salesStatus = "active";
    await loadSalesDashboard();
    setDatabaseStatus(`${sale.receipt_no} sudah aktif lagi.${stockMessage}`);
  } catch (error) {
    setDatabaseStatus(`${error.message} Restore belum berhasil.`);
  }
}

function setSalesDate(dateKey) {
  const nextDate = dateKey || getLocalDateKey();
  state.salesDate = nextDate;
  state.salesRange = "day";
  state.salesStartDate = nextDate;
  state.salesEndDate = nextDate;
  resetSalesPage();
  renderSalesDashboard();
  saveState();
}

function setSalesRange(rangeName) {
  const nextRange = String(rangeName) === "7" ? "week" : String(rangeName);
  state.salesRange = ["day", "week", "all", "custom"].includes(nextRange) ? nextRange : "day";
  if (state.salesRange === "day") {
    state.salesDate = state.salesEndDate || state.salesDate || getLocalDateKey();
    state.salesStartDate = state.salesDate;
    state.salesEndDate = state.salesDate;
  } else if (state.salesRange === "week") {
    state.salesEndDate = state.salesEndDate || state.salesDate || getLocalDateKey();
  } else if (state.salesRange === "all") {
    const range = getAllSalesDateRange();
    state.salesStartDate = range.start;
    state.salesEndDate = range.end;
    state.salesDate = range.end;
  } else {
    const range = normalizeDateRange(state.salesStartDate || state.salesDate, state.salesEndDate || state.salesDate);
    state.salesStartDate = range.start;
    state.salesEndDate = range.end;
  }
  resetSalesPage();
  renderSalesDashboard();
  saveState();
}

function setCustomSalesRange(startDate, endDate) {
  const range = normalizeDateRange(startDate || state.salesStartDate, endDate || state.salesEndDate);
  state.salesRange = "custom";
  state.salesStartDate = range.start;
  state.salesEndDate = range.end;
  state.salesDate = range.end;
  resetSalesPage();
  renderSalesDashboard();
  saveState();
}

function setSalesStatus(status) {
  state.salesStatus = ["active", "deleted", "all"].includes(String(status)) ? String(status) : "active";
  resetSalesPage();
  renderSalesDashboard();
  saveState();
}

function shiftSalesDate(dayDelta) {
  if (state.salesRange === "all") return;

  if (state.salesRange === "custom") {
    state.salesStartDate = addDaysToDateKey(state.salesStartDate, dayDelta);
    state.salesEndDate = addDaysToDateKey(state.salesEndDate, dayDelta);
    resetSalesPage();
    renderSalesDashboard();
    saveState();
    return;
  }

  if (state.salesRange === "week" || state.salesRange === "7" || state.salesRange === "30") {
    const days = state.salesRange === "week" ? 7 : Number(state.salesRange);
    state.salesEndDate = addDaysToDateKey(state.salesEndDate || state.salesDate || getLocalDateKey(), dayDelta * days);
    resetSalesPage();
    renderSalesDashboard();
    saveState();
    return;
  }

  setSalesDate(addDaysToDateKey(state.salesDate || getLocalDateKey(), dayDelta));
}

function openSalesDashboard() {
  state.salesStatus = "active";
  setSalesDate(getLocalDateKey());
  openModal(els.salesDashboardModal, els.salesStartDateInput || els.salesDateInput);
  loadSalesDashboard();
}

function renderCategoryFilter() {
  const categories = getCategories();
  const availableKeys = new Set(["all", ...categories.map(normalizeKey)]);
  if (!availableKeys.has(normalizeKey(state.selectedCategory))) state.selectedCategory = "all";

  const buttons = [
    { label: "Semua", value: "all" },
    ...categories.map((category) => ({ label: category, value: category })),
  ];

  els.categoryFilter.innerHTML = buttons
    .map((button) => {
      const active =
        button.value === "all"
          ? state.selectedCategory === "all"
          : normalizeKey(state.selectedCategory) === normalizeKey(button.value);
      return `<button class="category-button ${active ? "active" : ""}" type="button" data-category="${escapeHtml(button.value)}">${escapeHtml(button.label)}</button>`;
    })
    .join("");
}

function renderInventoryReview() {
  if (!els.inventoryReviewPanel) return;
  const groups = getDuplicateProductGroups();
  if (!groups.length) {
    els.inventoryReviewPanel.hidden = true;
    return;
  }

  const examples = groups
    .slice(0, 3)
    .map((group) => group.map((product) => product.name).join(" / "))
    .join("; ");
  els.inventoryReviewPanel.hidden = false;
  els.inventoryReviewTitle.textContent = `${groups.length} duplikat barang terdeteksi`;
  els.inventoryReviewCopy.textContent = `Contoh: ${examples}. Gabungkan akan menyimpan barang pertama, memindahkan nama lain jadi alias, dan pakai stok terbesar.`;
}

function renderProducts() {
  const rawQuery = els.searchInput.value || "";
  renderCategoryFilter();
  renderInventoryReview();
  const activeDailyMenu = isDailyMenuFilterActive();
  const dailyIds = getDailyMenuProductIds();
  const hasDailyMenu = dailyIds.size > 0;
  const products = getVisibleMenuProducts()
    .map((product, index) => ({ product, index, searchScore: getProductSearchScore(product, rawQuery) }))
    .filter(({ product, searchScore }) => {
      const categoryMatch = state.selectedCategory === "all" || normalizeKey(getProductCategory(product)) === normalizeKey(state.selectedCategory);
      return categoryMatch && searchScore > 0;
    })
    .sort((left, right) => {
      if (!rawQuery.trim()) return left.index - right.index;
      return right.searchScore - left.searchScore || left.index - right.index;
    })
    .map(({ product }) => product);

  if (!products.length) {
    els.productList.innerHTML = activeDailyMenu
      ? `<div class="empty-state">Menu hari ini belum ada yang cocok. Klik Atur Menu, lalu paste CSV menu hari ini.</div>`
      : `<div class="empty-state">Belum ada barang. Sinkron Google Sheet, pakai data contoh, atau tambah barang manual.</div>`;
    return;
  }

  els.productList.innerHTML = products
    .map((product) => {
      const available = getAvailableStock(product);
      const stockBadge = getStockBadge(product, available);
      const addDisabled = !isStockUnlimited(product) && available <= 0;
      const aliases = getProductAliases(product);
      const variants = getProductVariants(product);
      const defaultVariant = getDefaultVariant(product);
      const variantButtons = variants
        .map((variant) => {
          const active = String(variant.id) === String(defaultVariant?.id);
          return `
            <button class="product-variant-chip ${active ? "default" : ""}" type="button" data-add="${escapeHtml(product.id)}" data-variant="${escapeHtml(variant.id)}" ${addDisabled ? "disabled" : ""}>
              <span>${escapeHtml(variant.name)}</span>
              <strong>${currency.format(variant.price)}</strong>
            </button>
          `;
        })
        .join("");
      const daily = dailyIds.has(String(product.id));
      const dailyBadge = hasDailyMenu
        ? `<span class="menu-day-pill ${daily ? "today" : "outside"}">${daily ? "Menu Hari Ini" : "Di luar menu hari ini"}</span>`
        : "";
      return `
        <article class="product-card" data-product-id="${escapeHtml(product.id)}">
          <div>
            <p class="product-title">${escapeHtml(product.name)}</p>
            <p class="product-meta"><span>${escapeHtml(product.sku || "Tanpa SKU")}</span>${dailyBadge}</p>
            ${aliases.length ? `<p class="product-aliases">Alias: ${escapeHtml(aliases.join(", "))}</p>` : ""}
          </div>
          <div class="product-actions">
            <strong class="product-price product-action-price">${currency.format(defaultVariant?.price || product.price)}</strong>
            <span class="stock-pill ${stockBadge.className}">${escapeHtml(stockBadge.label)}</span>
            <button class="add-button" type="button" data-add="${escapeHtml(product.id)}" data-variant="${escapeHtml(defaultVariant?.id || "")}" aria-label="Tambah ${escapeHtml(product.name)}" ${addDisabled ? "disabled" : ""}>+</button>
            <button class="ghost-button product-small-button" type="button" data-edit-product="${product.id}">Edit</button>
            <button class="ghost-button danger product-small-button product-delete-button" type="button" data-delete-product="${product.id}" aria-label="Hapus ${escapeHtml(product.name)}" title="Hapus">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-trash"></use></svg>
            </button>
          </div>
          ${variants.length > 1 ? `<div class="product-variant-chips">${variantButtons}</div>` : ""}
        </article>
      `;
    })
    .join("");
}

function renderCartTotals() {
  const totals = getTotals();
  els.subtotalText.textContent = currency.format(totals.subtotal);
  els.shippingText.textContent = currency.format(totals.shipping);
  if (els.checkoutDepositRow && els.depositText) {
    if (totals.deposit > 0) {
      els.depositText.textContent = `-${currency.format(totals.deposit)}`;
      els.checkoutDepositRow.hidden = false;
    } else {
      els.checkoutDepositRow.hidden = true;
    }
  }
  els.totalText.textContent = currency.format(totals.total);
  renderCustomerProfileHint();
  renderCheckoutValidation();
  renderMobileMiniCart();
}

function renderCart() {
  const itemCount = getCartItemCount();
  if (els.cartItemBadge) {
    els.cartItemBadge.textContent = itemCount ? `${itemCount} item` : "Kosong";
    els.cartItemBadge.classList.toggle("empty", itemCount === 0);
  }

  if (!state.cart.length) {
    els.cartList.innerHTML = `<div class="empty-state">Keranjang kosong. Tambah barang untuk mulai transaksi.</div>`;
  } else {
    els.cartList.innerHTML = state.cart
      .map((cartItem) => {
        const product = getProduct(cartItem.productId);
        if (!product) return "";
        const totalInCart = cartQuantity(cartItem.productId);
        const canIncrease = isStockUnlimited(product) || totalInCart < Number(product.stock || 0);
        const variants = getProductVariants(product);
        const activeVariant = getProductVariant(product, cartItem.variantId);
        const unitPrice = getCartItemUnitPrice(cartItem);
        const lineTotal = getCartItemLineTotal(cartItem);
        const label = getCartItemReceiptLabel(cartItem, product, activeVariant);
        
        let variantSelectHtml = "";
        if (variants.length > 1) {
          variantSelectHtml = `
            <div class="cart-variant-select">
              <select class="cart-variant-dropdown" data-change-variant="${cartItem.id}">
                ${variants.map(v => {
                  const selected = String(v.id) === String(activeVariant?.id) ? "selected" : "";
                  return `<option value="${escapeHtml(v.id)}" ${selected}>${escapeHtml(v.name)} (${currency.format(v.price)})</option>`;
                }).join("")}
              </select>
            </div>
          `;
        }
        const customPriceHtml = activeVariant?.allowPriceOverride
          ? `<label class="cart-custom-price">Harga custom <input type="text" inputmode="numeric" data-cart-price="${escapeHtml(cartItem.id)}" value="${escapeHtml(formatIntegerInput(unitPrice))}"></label>`
          : "";
        return `
          <article class="cart-row" data-cart-row="${escapeHtml(cartItem.id)}">
            <div>
              <p class="cart-title">${escapeHtml(label ? `${product.name} (${label})` : product.name)}</p>
              <p class="cart-meta">
                <span class="cart-unit-price">${cartItem.quantity} × ${currency.format(unitPrice)}</span>
                <strong class="cart-line-total">${currency.format(lineTotal)}</strong>
              </p>
              ${variantSelectHtml}
              ${customPriceHtml}
            </div>
            <div class="cart-actions">
              <div class="qty-control" aria-label="Jumlah ${escapeHtml(product.name)}">
                <button type="button" data-decrease="${cartItem.id}" aria-label="Kurangi">−</button>
                <span>${cartItem.quantity}</span>
                <button type="button" data-increase="${cartItem.id}" aria-label="Tambah" ${canIncrease ? "" : "disabled"}>+</button>
              </div>
              <button class="icon-button" type="button" data-remove="${cartItem.id}" aria-label="Hapus barang">×</button>
            </div>
            <textarea class="cart-note-input" data-note="${cartItem.id}" rows="2" placeholder="Catatan item, contoh: pedas, tanpa sambal, bungkus">${escapeHtml(cartItem.note || "")}</textarea>
          </article>
        `;
      })
      .join("");
  }

  renderCartTotals();
}

function renderMobileMiniCart() {
  if (!els.mobileMiniCartButton || !els.mobileMiniCartCount || !els.mobileMiniCartTotal) return;

  const itemCount = state.cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const totals = getTotals();
  const hasItems = itemCount > 0;
  els.mobileMiniCartButton.hidden = !hasItems;
  document.body.classList.toggle("has-mobile-mini-cart", hasItems);
  if (!hasItems) return;

  els.mobileMiniCartCount.textContent = `${itemCount} item di keranjang`;
  els.mobileMiniCartTotal.textContent = currency.format(totals.total);
  els.mobileMiniCartButton.setAttribute("aria-label", `Buka keranjang, ${itemCount} item, total ${currency.format(totals.total)}`);
}

function receiptCustomerHtml(customerName) {
  const cleanName = String(customerName || "").trim();
  if (!cleanName) return "";
  return `<div class="receipt-info receipt-customer"><strong>${escapeHtml(cleanName)}</strong></div>`;
}

function receiptHtmlFromSale(sale) {
  const completedAt = sale.completedAt || sale.completed_at || new Date().toISOString();
  const items = Array.isArray(sale.items) ? sale.items : [];
  const receiptNo = sale.receiptNo || sale.receipt_no || makeReceiptNumber(new Date(completedAt));
  const subtotal = Number(sale.subtotal || 0);
  const shipping = Number(sale.shipping || sale.discount || 0);
  const total = Number(sale.total || 0);
  const usedDeposit = Number(sale.usedDeposit || 0);
  const customerName = String(sale.customerName || sale.customer_name || sale.customerAddress || sale.customer_address || "").trim();
  const chatDate = String(sale.chatDate || sale.chat_date || "").trim();
  const compact = (sale.receiptMode || state.settings.receiptMode || "compact") === "compact";
  const orderInfo = [
    receiptCustomerHtml(customerName),
    chatDate ? `<div class="receipt-info receipt-small">${escapeHtml(chatDate)}</div>` : "",
  ].filter(Boolean).join("");
  const itemHtml = items
    .map((item) => {
      const lineTotal = Number(item.lineTotal || item.line_total || Number(item.price || 0) * Number(item.quantity || 0));
      const note = String(item.note || "").trim();
      const displayName = getReceiptItemDisplayName(item);
      return `
        <div class="receipt-item">
          <div>${escapeHtml(displayName)}</div>
          ${note ? `<div class="receipt-note">Catatan: ${escapeHtml(note)}</div>` : ""}
          <div class="receipt-row receipt-small">
            <span>${Number(item.quantity || 0)} x ${currency.format(Number(item.price || 0))}</span>
            <strong>${currency.format(lineTotal)}</strong>
          </div>
        </div>
      `;
    })
    .join("");
  const headerHtml = compact
    ? `
      <div class="receipt-center receipt-compact-header">
        <h3>${escapeHtml(sale.storeName || sale.store_name || state.settings.storeName)}</h3>
      </div>
    `
    : `
      <div class="receipt-center">
        <img class="receipt-logo" src="logocatering.webp" alt="Logo Shanti Catering">
        <h3>${escapeHtml(sale.storeName || sale.store_name || state.settings.storeName)}</h3>
        <p class="receipt-store-address">${escapeHtml(sale.storeAddress || state.settings.storeAddress).replaceAll("\n", "<br>")}</p>
      </div>
    `;
  const adjustmentRows = [
    !compact || shipping ? `<div class="receipt-row"><span>Ongkir</span><strong>${currency.format(shipping)}</strong></div>` : "",
  ].filter(Boolean).join("");
  const footerHtml = compact ? "" : `<div class="receipt-line"></div><p class="receipt-center">${escapeHtml(sale.footer || state.settings.footer)}</p>`;

  return `
    ${headerHtml}
    ${orderInfo ? `<div class="receipt-line"></div>${orderInfo}` : ""}
    <div class="receipt-line"></div>
    ${itemHtml || `<p class="receipt-center">Keranjang kosong</p>`}
    <div class="receipt-line"></div>
    <div class="receipt-row"><span>Subtotal</span><strong>${currency.format(subtotal)}</strong></div>
    ${adjustmentRows}
    ${usedDeposit > 0 ? `<div class="receipt-row"><span>Potongan Deposit</span><strong>-${currency.format(usedDeposit)}</strong></div>` : ""}
    <div class="receipt-row"><span>Pembayaran</span><strong>${escapeHtml(sale.payment || state.sale.payment)}</strong></div>
    <div class="receipt-line"></div>
    <div class="receipt-row"><strong>Total Bayar</strong><strong>${currency.format(total - usedDeposit)}</strong></div>
    ${footerHtml}
  `;
}

function getCurrentReceiptPayload() {
  const totals = getTotals();
  const now = new Date();
  return {
    receiptNo: makeReceiptNumber(now),
    receiptDateKey: getLocalDateKey(now),
    completedAt: now.toISOString(),
    storeName: state.settings.storeName,
    storeAddress: state.settings.storeAddress,
    footer: state.settings.footer,
    receiptWidth: state.settings.receiptWidth,
    receiptFontSize: state.settings.receiptFontSize,
    receiptMode: state.settings.receiptMode,
    payment: state.sale.payment,
    customerName: String(state.sale.customerName || "").trim(),
    customerAddress: "",
    chatDate: String(state.sale.chatDate || "").trim(),
    orderNote: "",
    dueText: "",
    subtotal: totals.subtotal,
    shipping: totals.shipping,
    tax: 0,
    total: totals.subtotal + totals.shipping,
    usedDeposit: totals.deposit,
    items: getCartItems(),
  };
}

function receiptHtml() {
  return receiptHtmlFromSale(getCurrentReceiptPayload());
}

function getActiveReceiptPayload() {
  return state.cart.length ? getCurrentReceiptPayload() : state.lastReceipt || getCurrentReceiptPayload();
}

function setPrintMode(mode) {
  const reportMode = mode === "report";
  document.documentElement.classList.toggle("report-print-mode", reportMode);
  document.body.classList.toggle("report-print-mode", reportMode);
  if (els.printArea) {
    els.printArea.className = reportMode ? "print-area report-print-area" : "print-area";
  }
}

function setDynamicPrintPageRule(pageSize, margin = "0mm") {
  let style = document.getElementById("dynamic-print-page-style");
  if (!style) {
    style = document.createElement("style");
    style.id = "dynamic-print-page-style";
    document.head.appendChild(style);
  }
  style.textContent = `@media print { @page { size: ${pageSize}; margin: ${margin}; } }`;
}

function getReceiptPrintWidthMm(receiptWidth = state.settings.receiptWidth) {
  return String(receiptWidth) === "58" ? 48 : 72;
}

function getReceiptPageWidthCss() {
  const inlineWidth = document.documentElement.style.getPropertyValue("--receipt-print-width").trim();
  const computedWidth = getComputedStyle(document.documentElement).getPropertyValue("--receipt-print-width").trim();
  const width = inlineWidth || computedWidth || `${getReceiptPrintWidthMm()}mm`;
  return /^\d+(\.\d+)?mm$/.test(width) ? width : `${getReceiptPrintWidthMm()}mm`;
}

function setReceiptPageHeight(pageHeightMm) {
  const width = getReceiptPageWidthCss();
  let pageSize;
  if (pageHeightMm === "auto") {
    pageSize = width;
    document.documentElement.style.setProperty("--receipt-page-height", "auto");
  } else {
    const height = Math.min(Math.max(pageHeightMm, 42), 3000);
    pageSize = `${width} ${height}mm`;
    document.documentElement.style.setProperty("--receipt-page-height", `${height}mm`);
  }
  document.documentElement.style.setProperty("--print-page-size", pageSize);
  document.documentElement.style.setProperty("--print-page-margin", "0mm");
  setDynamicPrintPageRule(pageSize, "0mm");
}

function applyReceiptSettingsStyles(salePayload = {}) {
  setPrintMode("receipt");
  const receiptWidth = salePayload.receiptWidth || state.settings.receiptWidth;
  const fontSizeKey = salePayload.receiptFontSize || state.settings.receiptFontSize;
  const fontSize = RECEIPT_FONT_SIZES[fontSizeKey] || RECEIPT_FONT_SIZES.medium;
  const printWidth = getReceiptPrintWidthMm(receiptWidth);
  document.documentElement.style.setProperty("--receipt-width", `${receiptWidth}mm`);
  document.documentElement.style.setProperty("--receipt-print-width", `${printWidth}mm`);
  document.documentElement.style.setProperty("--print-page-size", `${printWidth}mm var(--receipt-page-height)`);
  document.documentElement.style.setProperty("--print-page-margin", "0mm");
  document.documentElement.style.setProperty("--receipt-font-size", `${fontSize.body}px`);
  document.documentElement.style.setProperty("--receipt-small-font-size", `${fontSize.small}px`);
}

function measureReceiptPageHeight(html) {
  const cleanHtml = html.trim();
  const measure = document.createElement("div");
  measure.className = "receipt-print-measure";
  measure.innerHTML = `<article class="receipt-paper">${cleanHtml}</article>`;
  document.body.appendChild(measure);

  const receipt = measure.querySelector(".receipt-paper");
  const heightPx = receipt ? receipt.getBoundingClientRect().height : measure.getBoundingClientRect().height;
  measure.remove();

  const heightMm = Math.max(Math.ceil((heightPx * 25.4) / 96) + 2, 42);
  setReceiptPageHeight(heightMm);
}

function measureReceiptBatchPageHeight(htmlList) {
  const measure = document.createElement("div");
  measure.className = "receipt-print-measure";
  measure.innerHTML = htmlList.map((html) => `<article class="receipt-paper">${html}</article>`).join("");
  document.body.appendChild(measure);

  const heights = [...measure.querySelectorAll(".receipt-paper")].map((receipt) => receipt.getBoundingClientRect().height);
  measure.remove();

  const totalHeightPx = heights.reduce((sum, h) => sum + h, 0);
  let heightMm = Math.ceil((totalHeightPx * 25.4) / 96) + 2;
  if (htmlList.length > 1) {
    heightMm += (htmlList.length - 1) * 8; // Jarak 8mm antar orderan
  }
  setReceiptPageHeight(heightMm);
  return heightMm;
}

function preparePrintReceipt(salePayload = getActiveReceiptPayload()) {
  applyReceiptSettingsStyles(salePayload);
  const html = receiptHtmlFromSale(salePayload);
  measureReceiptPageHeight(html);
  els.printArea.innerHTML = `<article class="receipt-paper">${html}</article>`;
}

function preparePrintReceiptsBatch(salePayloads = []) {
  if (!salePayloads.length) return;
  applyReceiptSettingsStyles(salePayloads[0]);
  const htmlList = salePayloads.map((salePayload) => receiptHtmlFromSale(salePayload));
  measureReceiptBatchPageHeight(htmlList);
  els.printArea.innerHTML = htmlList.map((html) => `<article class="receipt-paper batch-receipt">${html}</article>`).join('<div class="page-break"></div>');
}

function preparePrintHtml(html) {
  applyReceiptSettingsStyles();
  measureReceiptPageHeight(html);
  els.printArea.innerHTML = `<article class="receipt-paper">${html}</article>`;
}

function ensureReceiptReadyBeforePrint() {
  if (document.documentElement.classList.contains("report-print-mode")) {
    const hasPrintableReport = Boolean(els.printArea?.querySelector(".print-report-a4")?.textContent.trim());
    if (hasPrintableReport) return;
  }

  const hasPrintableReceipt = Boolean(els.printArea?.querySelector(".receipt-paper")?.textContent.trim());
  if (!hasPrintableReceipt) preparePrintReceipt();
}

async function waitForPrintAreaReady() {
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await new Promise((resolve) => requestAnimationFrame(resolve));
  els.printArea?.getBoundingClientRect();
  await new Promise((resolve) => setTimeout(resolve, 80));
}

function waitWithTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

function waitForNextFrame(frameWindow) {
  const scheduleFrame = frameWindow?.requestAnimationFrame?.bind(frameWindow) || requestAnimationFrame;
  return new Promise((resolve) => scheduleFrame(resolve));
}

async function waitForFrameStylesheets(frameDocument, timeoutMs = 2000) {
  const links = [...frameDocument.querySelectorAll('link[rel~="stylesheet"]')];

  await Promise.all(links.map((link) => {
    if (link.sheet) return Promise.resolve();
    return waitWithTimeout(new Promise((resolve) => {
      link.addEventListener("load", resolve, { once: true });
      link.addEventListener("error", resolve, { once: true });
    }), timeoutMs);
  }));

  await waitWithTimeout(new Promise((resolve) => {
    const startedAt = Date.now();
    const checkReady = () => {
      const ready = links.every((link) => {
        if (!link.sheet) return false;
        try {
          void link.sheet.cssRules;
          return true;
        } catch (error) {
          return true;
        }
      });

      if (ready || Date.now() - startedAt >= timeoutMs) {
        resolve();
        return;
      }
      setTimeout(checkReady, 50);
    };
    checkReady();
  }), timeoutMs + 50);
}

async function waitForFrameImages(frameDocument, timeoutMs = 2000) {
  const images = [...frameDocument.images];
  await Promise.all(images.map((image) => {
    const loaded = image.complete
      ? Promise.resolve()
      : new Promise((resolve) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        });
    const decoded = loaded.then(() => image.decode?.().catch(() => {}) || Promise.resolve());
    return waitWithTimeout(decoded, timeoutMs);
  }));
}

async function waitForPrintFrameReady(frame, layoutSelector = ".print-area") {
  let frameDocument = frame.contentDocument;
  if (!frameDocument) return;

  if (frameDocument.readyState !== "complete") {
    await waitWithTimeout(new Promise((resolve) => {
      frame.addEventListener("load", resolve, { once: true });
    }), 1500);
  }

  frameDocument = frame.contentDocument;
  if (!frameDocument) return;

  await waitForFrameStylesheets(frameDocument);
  await waitForFrameImages(frameDocument);
  await waitWithTimeout(frameDocument.fonts?.ready?.catch(() => {}) || Promise.resolve(), 2000);

  const frameWindow = frame.contentWindow;
  await waitForNextFrame(frameWindow);
  await waitForNextFrame(frameWindow);
  frameDocument.querySelector(layoutSelector)?.getBoundingClientRect();
  await new Promise((resolve) => setTimeout(resolve, 80));
}

function receiptPrintArticlesHtml(htmlList = []) {
  const batchClass = htmlList.length > 1 ? " batch-receipt" : "";
  return htmlList.map((html) => `<article class="receipt-paper${batchClass}">${html}</article>`).join("");
}

function prepareReceiptPrintFallback(htmlList = []) {
  if (!els.printArea) return;
  els.printArea.innerHTML = receiptPrintArticlesHtml(htmlList);
}

async function printReceiptHtmlInFrame(htmlList, pageHeightMm, receiptOptions = {}) {
  document.querySelectorAll(".receipt-print-frame").forEach((frame) => frame.remove());

  const frame = document.createElement("iframe");
  frame.className = "receipt-print-frame";
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "1px";
  frame.style.height = "1px";
  frame.style.border = "0";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";
  document.body.appendChild(frame);

  const frameDocument = frame.contentDocument;
  if (!frameDocument) {
    frame.remove();
    prepareReceiptPrintFallback(htmlList);
    window.print();
    return;
  }

  const receiptWidth = receiptOptions.receiptWidth || state.settings.receiptWidth;
  const printWidth = getReceiptPrintWidthMm(receiptWidth);
  const fontSizeKey = receiptOptions.receiptFontSize || state.settings.receiptFontSize;
  const fontSize = RECEIPT_FONT_SIZES[fontSizeKey] || RECEIPT_FONT_SIZES.medium;
  
  let pageSize;
  if (pageHeightMm === "auto") {
    pageSize = `${printWidth}mm`;
  } else {
    pageSize = `${printWidth}mm ${pageHeightMm}mm`;
  }

  const printHtml = receiptPrintArticlesHtml(htmlList);

  frameDocument.open();
  frameDocument.write(`<!doctype html>
<html lang="id" style="--receipt-width: ${receiptWidth}mm; --receipt-print-width: ${printWidth}mm; --receipt-font-size: ${fontSize.body}px; --receipt-small-font-size: ${fontSize.small}px;">
  <head>
    <meta charset="utf-8">
    <title>Struk Belanja</title>
    <link rel="stylesheet" href="${escapeHtml(getPrintStylesheetHref())}">
    <style>
      *, *::before, *::after {
        box-sizing: border-box;
      }
      html, body {
        margin: 0;
        padding: 0;
        background: #fff;
        color: #111;
      }
      .print-area {
        display: block;
        width: ${printWidth}mm;
        margin: 0;
        padding: 0;
        color: #111;
        background: #fff;
      }
      .receipt-paper {
        display: block !important;
        width: ${printWidth}mm;
        min-height: 0;
        margin: 0;
        border: 0;
        border-radius: 0;
        background: #fff;
        color: #111;
        padding: 0.5mm 0.5mm 0 1mm;
        font-family: "Courier New", Courier, monospace;
        font-size: var(--receipt-font-size);
        font-weight: 700;
        line-height: 1.35;
        box-shadow: none;
      }
      .receipt-paper h3,
      .receipt-paper p {
        margin: 0;
      }
      .receipt-paper h3 {
        font-size: 0.82em;
        line-height: 1.12;
      }
      .receipt-logo {
        display: block;
        width: 16mm;
        height: 16mm;
        margin: 0 auto 2mm;
        filter: grayscale(1);
        object-fit: contain;
      }
      .receipt-compact-header h3,
      .receipt-store-address {
        font-size: 0.82em;
        line-height: 1.12;
      }
      .receipt-center {
        text-align: center;
      }
      .receipt-line {
        margin: 5px 0;
        border-top: 1px dashed #222;
      }
      .receipt-row {
        display: flex;
        justify-content: space-between;
        gap: 10px;
      }
      .receipt-row span,
      .receipt-info {
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .receipt-row strong {
        flex-shrink: 0;
        text-align: right;
      }
      .receipt-customer {
        display: grid;
        gap: 2px;
        margin: 4px 0;
        border: 2px solid #111;
        background: transparent;
        padding: 5px 3px;
        font-size: 1.12em;
        font-weight: 900;
        line-height: 1.12;
        text-align: center;
        white-space: normal;
        overflow-wrap: anywhere;
        word-break: break-word;
        letter-spacing: 0;
      }
      .receipt-customer strong {
        display: block;
        font-weight: 800;
        line-height: 1.12;
        -webkit-text-stroke: 0.25px #111;
      }
      .receipt-item {
        margin-bottom: 5px;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .receipt-small,
      .receipt-note {
        font-size: var(--receipt-small-font-size);
      }
      .receipt-note {
        margin-top: 2px;
        color: #333;
      }
      @media print {
        @page { size: ${pageSize}; margin: 0mm; }
        html, body {
          width: ${printWidth}mm;
          min-width: ${printWidth}mm;
          height: auto !important;
          min-height: 0 !important;
          overflow: visible !important;
          margin: 0;
          padding: 0;
          background: #fff;
        }
        .print-area {
          position: static !important;
          display: block !important;
          width: ${printWidth}mm;
          margin: 0;
          padding: 0;
        }
        .batch-receipt {
          height: auto !important;
          min-height: 0 !important;
        }
        .batch-receipt + .batch-receipt {
          margin-top: 4mm !important;
          border-top: 1px dashed #111 !important;
          padding-top: 4mm !important;
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
      }
    </style>
  </head>
  <body>
    <div class="print-area">${printHtml}</div>
  </body>
</html>`);
  frameDocument.close();

  await waitForPrintFrameReady(frame);

  const frameWindow = frame.contentWindow;
  if (!frameWindow) {
    frame.remove();
    prepareReceiptPrintFallback(htmlList);
    window.print();
    return;
  }

  frameWindow.addEventListener("afterprint", () => setTimeout(() => frame.remove(), 60000), { once: true });
  frameWindow.focus();
  frameWindow.print();
}

function getPrintStylesheetHref() {
  const stylesheet = [...document.querySelectorAll('link[rel="stylesheet"]')]
    .map((link) => link.getAttribute("href") || "")
    .find((href) => href.includes("styles.css"));
  return stylesheet || "styles.css";
}

async function printReportHtmlInFrame(html) {
  document.querySelectorAll(".report-print-frame").forEach((frame) => frame.remove());

  const frame = document.createElement("iframe");
  frame.className = "report-print-frame";
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "1px";
  frame.style.height = "1px";
  frame.style.border = "0";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";
  document.body.appendChild(frame);

  const frameDocument = frame.contentDocument;
  if (!frameDocument) {
    frame.remove();
    window.print();
    return;
  }

  frameDocument.open();
  frameDocument.write(`<!doctype html>
<html lang="id" class="report-print-mode" style="--print-page-size: ${REPORT_PRINT_PAGE_SIZE}; --print-page-margin: ${REPORT_PRINT_PAGE_MARGIN}; --receipt-print-width: 48mm; --report-print-width: ${REPORT_PRINT_CONTENT_WIDTH}; --report-print-height: ${REPORT_PRINT_CONTENT_HEIGHT};">
  <head>
    <meta charset="utf-8">
    <title>Laporan Penjualan</title>
    <link rel="stylesheet" href="${escapeHtml(getPrintStylesheetHref())}">
    <style>@media print { @page { size: ${REPORT_PRINT_PAGE_SIZE}; margin: ${REPORT_PRINT_PAGE_MARGIN}; } }</style>
  </head>
  <body class="report-print-mode">
    <div class="print-area report-print-area">${html}</div>
  </body>
</html>`);
  frameDocument.close();

  await waitForPrintFrameReady(frame);

  const frameWindow = frame.contentWindow;
  if (!frameWindow) {
    frame.remove();
    window.print();
    return;
  }

  frameWindow.addEventListener("afterprint", () => setTimeout(() => frame.remove(), 120000), { once: true });
  setTimeout(() => {
    if (frame.isConnected) frame.remove();
  }, 300000);
  frameWindow.focus();
  frameWindow.print();
}

function renderReceipt(salePayload = getActiveReceiptPayload()) {
  applyReceiptSettingsStyles(salePayload);
  const html = receiptHtmlFromSale(salePayload);
  measureReceiptPageHeight(html);
  els.receiptPaper.innerHTML = html;
  els.printArea.innerHTML = `<article class="receipt-paper">${html}</article>`;
}

function openReceiptPreview(salePayload = getActiveReceiptPayload()) {
  renderReceipt(salePayload);
  openModal(els.receiptPreviewModal);
}

async function printSaleReceipt(salePayload = getActiveReceiptPayload()) {
  applyReceiptSettingsStyles(salePayload);
  const html = receiptHtmlFromSale(salePayload).trim();
  
  const measure = document.createElement("div");
  measure.className = "receipt-print-measure";
  measure.innerHTML = `<article class="receipt-paper">${html}</article>`;
  document.body.appendChild(measure);
  const receipt = measure.querySelector(".receipt-paper");
  const heightPx = receipt ? receipt.getBoundingClientRect().height : measure.getBoundingClientRect().height;
  measure.remove();
  
  const heightMm = Math.max(Math.ceil((heightPx * 25.4) / 96) + 2, 42);

  await printReceiptHtmlInFrame([html], heightMm, salePayload);
}

async function printSaleReceiptsBatch(salePayloads = []) {
  if (!salePayloads.length) return;
  const htmlList = salePayloads.map((salePayload) => receiptHtmlFromSale(salePayload));
  const totalHeightMm = measureReceiptBatchPageHeight(htmlList);
  await printReceiptHtmlInFrame(htmlList, totalHeightMm, salePayloads[0]);
}

function getTestReceiptPayload() {
  const now = new Date();
  return {
    receiptNo: "TEST-PRINT",
    completedAt: now.toISOString(),
    storeName: state.settings.storeName,
    storeAddress: state.settings.storeAddress,
    footer: "Test print struk thermal",
    receiptWidth: state.settings.receiptWidth,
    receiptFontSize: state.settings.receiptFontSize,
    receiptMode: state.settings.receiptMode,
    payment: "Tunai",
    subtotal: 15000,
    shipping: 0,
    tax: 0,
    total: 15000,
    items: [
      { name: "Nasi Campur Test", price: 15000, quantity: 1, lineTotal: 15000 },
    ],
  };
}

function formatReportItemList(items = []) {
  if (!items.length) return "Tidak ada item";
  return `
    <div class="report-item-grid">
      ${items
        .map((item) => {
          const quantity = Number(item.quantity || 0);
          const name = String(item.name || "Item").trim();
          const note = String(item.note || "").trim();
          const price = Number(item.price || 0);
          const lineTotal = Number(item.lineTotal || item.line_total || price * quantity);
          return `
            <span class="qty">${quantity}x</span>
            <span class="name">${escapeHtml(name)}${note ? ` <small class="item-note">(${escapeHtml(note)})</small>` : ""}</span>
            <span class="price">@ ${currency.format(price)}</span>
            <span class="total">${currency.format(lineTotal)}</span>
          `;
        })
        .join("")}
    </div>
  `;
}

const REPORT_PRINT_PAGE_SIZE = "210mm 330mm";
const REPORT_PRINT_PAGE_MARGIN = "10mm";
const REPORT_PRINT_CONTENT_WIDTH = "190mm";
const REPORT_PRINT_CONTENT_HEIGHT = "310mm";
const REPORT_SUMMARY_DETAIL_UNIT_LIMIT = 40;
const REPORT_DETAIL_PAGE_UNIT_LIMIT = 46;
const REPORT_DETAIL_ROW_MIN_UNITS = 2;
const REPORT_COURIER_SUMMARY_UNIT_RESERVE = 3;

function estimateReportDetailRowUnits(sale) {
  const customerName = getCustomerNameFromSale(sale) || "Customer belum diisi";
  const items = Array.isArray(sale.items) ? sale.items : [];
  const customerUnits = Math.max(1, Math.ceil(customerName.length / 24));
  
  const itemUnits = items.reduce((total, item) => {
    const name = String(item.name || "Item").trim();
    const note = String(item.note || "").trim();
    const text = `${name}${note ? ` (${note})` : ""}`;
    const itemRowUnits = Math.max(1, Math.ceil(text.length / 32));
    return total + itemRowUnits;
  }, 0);
  
  return Math.max(REPORT_DETAIL_ROW_MIN_UNITS, Math.max(customerUnits, itemUnits));
}

function chunkReportDetailSales(sales, options = {}) {
  if (!sales.length) {
    return [{ sales: [], startIndex: 0 }];
  }

  const firstPageUnitLimit = Number(options.firstPageUnitLimit || REPORT_DETAIL_PAGE_UNIT_LIMIT);
  const lastPageUnitReserve = Math.max(0, Number(options.lastPageUnitReserve || 0));
  const pages = [];
  let pageSales = [];
  let pageStartIndex = 0;
  let pageUnits = 0;
  let pageIndex = 0;

  sales.forEach((sale, index) => {
    const pageUnitLimit = pageIndex === 0 ? firstPageUnitLimit : REPORT_DETAIL_PAGE_UNIT_LIMIT;
    const rowUnits = Math.min(estimateReportDetailRowUnits(sale), REPORT_DETAIL_PAGE_UNIT_LIMIT);
    if (pageSales.length && pageUnits + rowUnits > pageUnitLimit) {
      pages.push({ sales: pageSales, startIndex: pageStartIndex });
      pageSales = [];
      pageUnits = 0;
      pageStartIndex = index;
      pageIndex += 1;
    }

    pageSales.push(sale);
    pageUnits += rowUnits;
  });

  if (pageSales.length) {
    pages.push({ sales: pageSales, startIndex: pageStartIndex });
  }

  if (lastPageUnitReserve > 0 && pages.length) {
    const getPageLimit = (index) => (index === 0 ? firstPageUnitLimit : REPORT_DETAIL_PAGE_UNIT_LIMIT);
    const getPageUnits = (page) => page.sales.reduce((total, sale) => total + Math.min(estimateReportDetailRowUnits(sale), REPORT_DETAIL_PAGE_UNIT_LIMIT), 0);
    const finalPageTarget = Math.max(REPORT_DETAIL_ROW_MIN_UNITS, getPageLimit(pages.length - 1) - lastPageUnitReserve);
    let lastPage = pages[pages.length - 1];
    let lastPageUnits = getPageUnits(lastPage);
    let overflowPage = null;

    while (lastPage.sales.length > 1 && lastPageUnits > finalPageTarget) {
      const movedSale = lastPage.sales.pop();
      const movedIndex = lastPage.startIndex + lastPage.sales.length;
      const movedUnits = Math.min(estimateReportDetailRowUnits(movedSale), REPORT_DETAIL_PAGE_UNIT_LIMIT);
      lastPageUnits -= movedUnits;
      if (!overflowPage) overflowPage = { sales: [], startIndex: movedIndex };
      overflowPage.sales.unshift(movedSale);
      overflowPage.startIndex = movedIndex;
    }

    if (overflowPage) {
      pages.push(overflowPage);
    }
  }

  return pages;
}

function salesReportA4Html() {
  const selectedSales = getSelectedSales()
    .filter((sale) => !isSaleDeleted(sale))
    .sort((left, right) => new Date(left.completed_at).getTime() - new Date(right.completed_at).getTime());
  const report = buildDailyReport(selectedSales);
  const range = getSalesRangeDates();
  const reportDateText = range.start === range.end ? formatDateLabel(range.start) : `${formatDateLabel(range.start)} - ${formatDateLabel(range.end)}`;
  const printedAtText = new Date().toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const renderTransactionRows = (chunk) => {
    return chunk.sales
      .map((sale, offset) => {
        const index = chunk.startIndex + offset;
        const isEven = (index + 1) % 2 === 0;
        const rowClass = isEven ? ' class="row-even"' : "";
        const customerName = getCustomerNameFromSale(sale) || "Customer belum diisi";
        const items = Array.isArray(sale.items) ? sale.items : [];
        const rowspan = Math.max(1, items.length);
        const courier = getSaleShippingCourierLabel(sale);
        const ongkir = getSaleShipping(sale);
        const total = Number(sale.total || 0);
        const bayar = sale.payment || "Tunai";

        if (items.length === 0) {
          return `
            <tr${rowClass}>
              <td>${index + 1}</td>
              <td>${escapeHtml(customerName)}</td>
              <td class="print-report-courier-cell">${escapeHtml(courier)}</td>
              <td>-</td>
              <td class="number">0</td>
              <td class="number">0</td>
              <td class="number">0</td>
              <td class="number">${currency.format(ongkir)}</td>
              <td class="number">${currency.format(total)}</td>
              <td>${escapeHtml(bayar)}</td>
            </tr>
          `;
        }

        return items
          .map((item, itemIdx) => {
            const quantity = Number(item.quantity || 0);
            const name = String(item.name || "Item").trim();
            const note = String(item.note || "").trim();
            const price = Number(item.price || 0);
            const lineTotal = Number(item.lineTotal || item.line_total || price * quantity);
            const menuStr = `${escapeHtml(name)}${note ? ` <small class="item-note">(${escapeHtml(note)})</small>` : ""}`;

            if (itemIdx === 0) {
              return `
                <tr${rowClass}>
                  <td rowspan="${rowspan}">${index + 1}</td>
                  <td rowspan="${rowspan}">${escapeHtml(customerName)}</td>
                  <td rowspan="${rowspan}" class="print-report-courier-cell">${escapeHtml(courier)}</td>
                  <td>${menuStr}</td>
                  <td class="number">${quantity}</td>
                  <td class="number">${currency.format(price)}</td>
                  <td class="number">${currency.format(lineTotal)}</td>
                  <td rowspan="${rowspan}" class="number">${currency.format(ongkir)}</td>
                  <td rowspan="${rowspan}" class="number">${currency.format(total)}</td>
                  <td rowspan="${rowspan}">${escapeHtml(bayar)}</td>
                </tr>
              `;
            } else {
              return `
                <tr${rowClass}>
                  <td>${menuStr}</td>
                  <td class="number">${quantity}</td>
                  <td class="number">${currency.format(price)}</td>
                  <td class="number">${currency.format(lineTotal)}</td>
                </tr>
              `;
            }
          })
          .join("");
      })
      .join("");
  };
  const getDetailPageLabel = (chunk) => {
    const startNo = chunk.sales.length ? chunk.startIndex + 1 : 0;
    const endNo = chunk.sales.length ? chunk.startIndex + chunk.sales.length : 0;
    return chunk.sales.length ? `Transaksi ${startNo}-${endNo} dari ${report.transactionCount}` : "Belum ada transaksi";
  };
  const renderDetailTable = (chunk) => `
    <table class="print-report-transactions">
      <thead>
        <tr>
          <th>No</th>
          <th>Customer</th>
          <th>Kurir</th>
          <th>Menu</th>
          <th class="number">Qty</th>
          <th class="number">Satuan</th>
          <th class="number">Jumlah</th>
          <th class="number">Ongkir</th>
          <th class="number">Total</th>
          <th>Bayar</th>
        </tr>
      </thead>
      <tbody>${renderTransactionRows(chunk) || `<tr><td colspan="10">Belum ada transaksi pada rentang ini.</td></tr>`}</tbody>
    </table>
  `;
  const paymentRows = report.payments
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.name)}</td>
          <td class="number">${item.count || 0}</td>
          <td class="number">${currency.format(item.total)}</td>
        </tr>
      `
    )
    .join("");
  const itemRows = report.itemTotals
    .map(
      (item, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item.name)}</td>
          <td class="number">${item.quantity} item</td>
          <td class="number">${currency.format(item.total)}</td>
        </tr>
      `
    )
    .join("");
  const courierShippingRows = report.shippingSummary.byTag
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.tag)}</td>
          <td>${escapeHtml(item.courier)}</td>
          <td class="number">${item.count || 0}</td>
          <td class="number">${currency.format(item.total)}</td>
        </tr>
      `
    )
    .join("");
  const courierShippingFooter = courierShippingRows
    ? `
      <tfoot>
        <tr>
          <td colspan="3" class="print-report-total-label">Total Ongkir</td>
          <td class="number">${currency.format(report.shippingSummary.total)}</td>
        </tr>
      </tfoot>
    `
    : "";
  const hasCourierShippingSummary = report.shippingSummary.byTag.length > 0;
  const courierSummarySectionHtml = hasCourierShippingSummary
    ? `
      <section class="print-report-section print-report-courier-section">
        <div class="print-report-detail-title-row">
          <h2>Summary Ongkir Kurir</h2>
          <span>${report.shippingSummary.transactionCount || 0} transaksi ongkir</span>
        </div>
        <table class="print-report-courier-table">
          <thead>
            <tr>
              <th>Tag Alamat</th>
              <th>Kurir</th>
              <th class="number">Transaksi</th>
              <th class="number">Total Ongkir</th>
            </tr>
          </thead>
          <tbody>${courierShippingRows}</tbody>
          ${courierShippingFooter}
        </table>
      </section>
    `
    : "";
  const detailPages = chunkReportDetailSales(selectedSales, {
    firstPageUnitLimit: REPORT_SUMMARY_DETAIL_UNIT_LIMIT,
    lastPageUnitReserve: hasCourierShippingSummary ? REPORT_COURIER_SUMMARY_UNIT_RESERVE : 0,
  });
  const firstDetailPage = detailPages[0] || { sales: [], startIndex: 0 };
  const detailPagesHtml = detailPages
    .slice(1)
    .map((chunk, continuedIndex) => {
      const pageIndex = continuedIndex + 1;
      const isLastDetailPage = pageIndex === detailPages.length - 1;
      return `
        <article class="print-report-a4 print-report-page print-report-detail-page">
          <header class="print-report-header print-report-detail-header">
            <div>
              <p class="print-report-eyebrow">Detail Transaksi</p>
              <h1>Daftar Pesanan</h1>
              <p class="print-report-period">Tanggal laporan: ${escapeHtml(reportDateText)}</p>
              <p class="print-report-page-note">${escapeHtml(getDetailPageLabel(chunk))}</p>
            </div>
            <div class="print-report-meta">
              <span>Halaman detail</span>
              <strong>${pageIndex + 1} / ${detailPages.length}</strong>
            </div>
          </header>

          <section class="print-report-section print-report-detail-section">
            ${renderDetailTable(chunk)}
          </section>
          ${isLastDetailPage ? courierSummarySectionHtml : ""}
        </article>
      `;
    })
    .join("");

  return `
    <article class="print-report-a4 print-report-page">
      <header class="print-report-header">
        <div>
          <p class="print-report-eyebrow">Kasir Shanti Catering</p>
          <h1>Laporan Penjualan</h1>
          <p class="print-report-period">Tanggal laporan: ${escapeHtml(reportDateText)}</p>
        </div>
        <div class="print-report-meta">
          <span>Dicetak</span>
          <strong>${escapeHtml(printedAtText)}</strong>
        </div>
      </header>

      <section class="print-report-summary">
        <div class="primary"><span>Total Omzet</span><strong>${currency.format(report.revenue)}</strong></div>
        <div class="primary"><span>Total Pesanan</span><strong>${report.transactionCount}</strong></div>
        <div><span>Total Item</span><strong>${report.itemCount}</strong></div>
        <div><span>Total Ongkir</span><strong>${currency.format(report.shippingTotal)}</strong></div>
      </section>

      <section class="print-report-section">
        <h2>Ringkasan Pembayaran</h2>
        <table class="print-report-payment-table">
          <thead>
            <tr><th>Metode</th><th class="number">Transaksi</th><th class="number">Total</th></tr>
          </thead>
          <tbody>${paymentRows || `<tr><td colspan="3">Belum ada pembayaran.</td></tr>`}</tbody>
        </table>
      </section>

      <section class="print-report-section print-report-detail-section print-report-summary-detail">
        <div class="print-report-detail-title-row">
          <h2>Detail Transaksi</h2>
          <span>Halaman detail 1 / ${detailPages.length}</span>
        </div>
        <p class="print-report-page-note">${escapeHtml(getDetailPageLabel(firstDetailPage))}</p>
        ${renderDetailTable(firstDetailPage)}
      </section>
      ${detailPages.length === 1 ? courierSummarySectionHtml : ""}
    </article>

    ${detailPagesHtml}
  `;
}

function preparePrintReportHtml(html) {
  setPrintMode("report");
  document.documentElement.style.setProperty("--print-page-size", REPORT_PRINT_PAGE_SIZE);
  document.documentElement.style.setProperty("--print-page-margin", REPORT_PRINT_PAGE_MARGIN);
  document.documentElement.style.setProperty("--report-print-width", REPORT_PRINT_CONTENT_WIDTH);
  document.documentElement.style.setProperty("--report-print-height", REPORT_PRINT_CONTENT_HEIGHT);
  setDynamicPrintPageRule(REPORT_PRINT_PAGE_SIZE, REPORT_PRINT_PAGE_MARGIN);
  els.printArea.innerHTML = html;
}

async function printDailyReport() {
  const sales = getSelectedSales().filter((sale) => !isSaleDeleted(sale));
  if (!sales.length) {
    setDatabaseStatus("Belum ada transaksi aktif untuk dicetak di rentang ini.");
    return;
  }
  const reportHtml = salesReportA4Html();
  preparePrintReportHtml(reportHtml);
  await waitForPrintAreaReady();
  await printReportHtmlInFrame(reportHtml);
}

function salesToCsv(sales) {
  const headers = [
    "Nomor Struk",
    "Tanggal",
    "Customer",
    "Tanggal Chat",
    "Pembayaran",
    "Nama Item",
    "SKU",
    "Catatan",
    "Jumlah",
    "Harga",
    "Subtotal Item",
    "Subtotal Transaksi",
    "Ongkir",
    "Total Transaksi",
  ];
  const rows = [headers];

  sales.forEach((sale) => {
    const items = Array.isArray(sale.items) && sale.items.length ? sale.items : [{}];
    items.forEach((item) => {
      rows.push([
        sale.receipt_no,
        new Date(sale.completed_at).toLocaleString("id-ID"),
        sale.customer_name || sale.customer_address || "",
        sale.chat_date || "",
        sale.payment,
        getReceiptItemDisplayName(item),
        item.sku || "",
        item.note || "",
        item.quantity || "",
        item.price || "",
        item.line_total || item.lineTotal || "",
        sale.subtotal || 0,
        getSaleShipping(sale),
        sale.total || 0,
      ]);
    });
  });

  return rows.map((row) => row.map(csvCell).join(";")).join("\n");
}

function exportSales(sales, filename) {
  if (!sales.length) {
    setDatabaseStatus("Belum ada transaksi untuk diexport.");
    return;
  }

  downloadTextFile(filename, `\ufeff${salesToCsv(sales)}`);
  setDatabaseStatus(`${sales.length} transaksi sudah diexport ke CSV.`);
}

async function backupDatabase() {
  await saveProductsToDatabase({ toast: false });
  const link = document.createElement("a");
  link.href = `/api/backup/database?ts=${Date.now()}`;
  link.download = `backup-kasir-shanti-${getLocalDateKey()}.sqlite3`;
  document.body.append(link);
  link.click();
  link.remove();
  setDatabaseStatus("Backup database sedang diunduh.");
}

async function restoreDatabaseBackup(file) {
  if (!file) return;
  const confirmed = await openAppConfirm({
    eyebrow: "Backup DB",
    title: "Restore database?",
    message: `${file.name} akan mengganti data transaksi di SQLite.`,
    note: "Pastikan file backup sudah benar sebelum lanjut.",
    confirmText: "Ya, restore",
    variant: "danger",
  });
  if (!confirmed) return;

  setDatabaseStatus("Mengupload dan memvalidasi backup database...");
  try {
    const response = await fetch("/api/backup/restore", {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Backup-Filename": encodeURIComponent(file.name),
      },
      body: await file.arrayBuffer(),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Restore backup gagal.");
    await loadProductsFromDatabase({ toast: false, seed: false });
    await loadSalesDashboard();
    setDatabaseStatus(data.message || "Backup database berhasil direstore.");
  } catch (error) {
    setDatabaseStatus(`${error.message} Database lama tetap dipakai.`);
  }
}

async function backupFullAppData() {
  setDatabaseStatus("Menyiapkan backup semua data app...");
  try {
    await saveProductsToDatabase({ toast: false });
    saveState();
    const response = await fetch(`/api/backup/database?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Database SQLite tidak bisa dibackup.");
    const databaseBlob = await response.blob();
    const backup = {
      type: "kasir-shanti-catering-full-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      localStorageKey: STORAGE_KEY,
      localState: getLocalStateSnapshot(),
      database: {
        filename: `backup-kasir-shanti-${getLocalDateKey()}.sqlite3`,
        contentType: "application/vnd.sqlite3",
        base64: await blobToBase64(databaseBlob),
      },
    };
    downloadTextFile(`backup-semua-kasir-shanti-${getLocalDateKey()}.json`, JSON.stringify(backup, null, 2), "application/json;charset=utf-8");
    setDatabaseStatus("Backup semua data app sudah diunduh.");
  } catch (error) {
    setDatabaseStatus(`${error.message} Backup semua data gagal.`);
  }
}

async function restoreFullAppData(file) {
  if (!file) return;
  const confirmed = await openAppConfirm({
    eyebrow: "Backup App",
    title: "Restore semua data?",
    message: `${file.name} akan mengganti transaksi SQLite dan data app di browser.`,
    note: "Data saat ini akan diganti oleh isi backup.",
    confirmText: "Ya, restore",
    variant: "danger",
  });
  if (!confirmed) return;

  setDatabaseStatus("Membaca backup semua data app...");
  try {
    const backup = JSON.parse(await file.text());
    if (backup.type !== "kasir-shanti-catering-full-backup" || !backup.localState || !backup.database?.base64) {
      throw new Error("File bukan backup semua data Kasir Shanti Catering.");
    }

    const databaseBlob = base64ToBlob(backup.database.base64, backup.database.contentType || "application/vnd.sqlite3");
    const response = await fetch("/api/backup/restore", {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Backup-Filename": encodeURIComponent(backup.database.filename || file.name),
      },
      body: await databaseBlob.arrayBuffer(),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Restore database gagal.");

    localStorage.setItem(STORAGE_KEY, JSON.stringify(backup.localState));
    loadState();
    renderSettings();
    syncManualStockInputState();
    render();
    await loadProductsFromDatabase({ toast: false, seed: false });
    await loadSalesDashboard();
    setDatabaseStatus("Restore semua data selesai. Inventory, setting, dan database sudah dipulihkan.");
  } catch (error) {
    setDatabaseStatus(`${error.message} Restore semua data dibatalkan.`);
  }
}

function renderSettings() {
  applyTheme();
  els.sheetUrlInput.value = state.sync.sheetUrl;
  els.sheetNameInput.value = state.sync.sheetName;
  els.autoSyncInput.checked = state.sync.autoSync;
  els.nameColumnInput.value = state.columns.name;
  els.priceColumnInput.value = state.columns.price;
  els.stockColumnInput.value = state.columns.stock;
  els.skuColumnInput.value = state.columns.sku;
  els.storeNameInput.value = state.settings.storeName;
  els.storeAddressInput.value = state.settings.storeAddress;
  els.footerInput.value = state.settings.footer;
  els.receiptWidthInput.value = state.settings.receiptWidth;
  els.receiptFontSizeInput.value = state.settings.receiptFontSize;
  els.printFlowInput.value = state.settings.printFlow;
  els.receiptModeInput.value = state.settings.receiptMode;
  els.autoPrintInput.checked = state.settings.autoPrint;
  if (els.dailyMenuDateInput) els.dailyMenuDateInput.value = getDailyMenuEditorDate();
  if (els.dailyMenuOnlyInput) els.dailyMenuOnlyInput.checked = Boolean(state.dailyMenu.onlyToday);
  els.customerNameInput.value = state.sale.customerName || "";
  els.shippingInput.value = formatIntegerInput(state.sale.shipping);
  els.paymentInput.value = state.sale.payment;
  updatePaymentSelectUI();
  renderCustomerProfileHint();
  renderCheckoutValidation();
  setSyncStatus(state.sync.lastSyncMessage || "Tempel link Google Sheet yang bisa dilihat publik untuk sinkron barang.", { toast: false });
}

function syncManualStockInputState() {
  const unlimited = els.itemUnlimitedInput.checked;
  els.itemStockInput.disabled = unlimited;
  els.itemStockInput.required = !unlimited;
  if (unlimited) els.itemStockInput.value = "";
  els.itemStockInput.placeholder = unlimited ? "Unlimited" : "24";
}

function setInventoryTab(tabName) {
  els.inventoryTabButtons.forEach((button) => {
    const active = button.dataset.inventoryTab === tabName;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });

  els.inventoryTabPanels.forEach((panel) => {
    const active = panel.dataset.inventoryPanel === tabName;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
}



function renderInventoryProductsList() {
  if (!els.inventoryProductsList) return;

  const query = (els.inventorySearchInput.value || "").trim().toLowerCase();
  
  const parentProducts = state.products.filter((product) => product.source !== "virtual");

  // 2. Filter parent products based on search query
  const filteredParents = parentProducts.filter((parent) => {
    if (!query) return true;
    
    // Check if parent name, category or SKU matches query
    const nameMatch = (parent.name || "").toLowerCase().includes(query);
    const categoryMatch = (parent.category || "").toLowerCase().includes(query);
    const skuMatch = (parent.sku || "").toLowerCase().includes(query);
    if (nameMatch || categoryMatch || skuMatch) return true;
    
    // Check if any of its variants matches the query
      const variants = getProductVariants(parent);
      const variantMatch = variants.some((v) => {
        const vName = (v.name || "").toLowerCase();
        const vLabel = (v.receiptLabel || "").toLowerCase();
        return vName.includes(query) || vLabel.includes(query);
    });
    return variantMatch;
  });

  // 3. Sort parent products alphabetically by name
  filteredParents.sort((a, b) => (a.name || "").localeCompare(b.name || "", "id-ID"));

  if (filteredParents.length === 0) {
    els.inventoryProductsList.innerHTML = `<div class="empty-state" style="padding: 24px; text-align: center; color: var(--muted);">Menu tidak ditemukan.</div>`;
    return;
  }

  // 4. Render
  els.inventoryProductsList.innerHTML = filteredParents
    .map((parent) => {
      const variants = getProductVariants(parent);
      
      let variantsHtml = "";
      if (variants.length > 0) {
        variantsHtml = `
          <div class="menu-item-variants-container">
            <p class="menu-item-variant-header-text">${variants.length} variasi/cara jual</p>
            ${variants
              .map((v) => {
                return `
                  <div class="menu-item-variant-row">
                    <span class="menu-item-variant-name">
                      ${escapeHtml(v.name)}
                      ${v.isDefault ? '<span class="menu-item-variant-name-label">Default</span>' : ""}
                      <small>${escapeHtml(getVariantTypeLabel(v.pricingType))}${v.receiptLabel ? ` · ${escapeHtml(v.receiptLabel)}` : ""}</small>
                    </span>
                    <span class="menu-item-variant-stock">${escapeHtml(v.unitName || "porsi")}</span>
                    <strong class="menu-item-variant-price">${currency.format(v.price)}</strong>
                    <div class="menu-item-buttons">
                      <button class="ghost-button product-small-button" type="button" data-edit-inventory-product="${escapeHtml(parent.id)}" title="Edit Variasi">Edit</button>
                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>
        `;
      }

      const parentSku = parent.sku ? `<span class="menu-item-sku-pill">${escapeHtml(parent.sku)}</span>` : "";
      
      return `
        <article class="menu-item-group-card">
          <div class="menu-item-parent-row">
            <div class="menu-item-info">
              <h3 class="menu-item-name">${escapeHtml(parent.name)}</h3>
              <div class="menu-item-meta">
                <span class="menu-item-category-pill">${escapeHtml(parent.category || "Lauk")}</span>
                ${parentSku}
              </div>
            </div>
            
            <div class="menu-item-actions-wrapper">
              <div class="menu-item-price-stock">
                <span class="menu-item-price">${currency.format(parent.price)}</span>
                <span class="menu-item-stock">Stok: <span class="menu-item-stock-qty">${parent.stockUnlimited ? "∞" : parent.stock}</span></span>
              </div>
              <div class="menu-item-buttons">
                <button class="ghost-button product-small-button" type="button" data-edit-inventory-product="${escapeHtml(parent.id)}" title="Edit Menu">Edit</button>
                <button class="ghost-button danger product-small-button product-delete-button" type="button" data-delete-inventory-product="${escapeHtml(parent.id)}" title="Hapus Menu">
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-trash"></use></svg>
                </button>
              </div>
            </div>
          </div>
          ${variantsHtml}
        </article>
      `;
    })
    .join("");
}

function render() {
  updatePaymentSelectUI();
  renderCustomerSuggestions();
  renderDailyMenuControls();
  renderProducts();
  renderCart();
  renderReceipt();
  if (els.openHeldCartsButton) {
    els.openHeldCartsButton.textContent = state.heldCarts.length ? `Buka Hold (${state.heldCarts.length})` : "Buka Hold";
  }
  renderBulkDrafts();
  renderDailyMenuReview();
  if (els.heldCartsModal?.open) renderHeldCarts();
  renderInventoryProductsList();
  saveState();
}

function addToCart(productId, variantId = "") {
  const product = getProduct(productId);
  if (!product) return;
  const variant = getProductVariant(product, variantId);
  const existing = state.cart.find((item) => item.productId === productId && String(item.variantId || "") === String(variant?.id || "") && !item.note);
  const available = getAvailableStock(product);
  const previousQuantity = existing?.quantity || 0;
  const unitPrice = Number(variant?.price || product.price || 0);

  if (existing) {
    if (isStockUnlimited(product) || existing.quantity < Number(product.stock || 0)) {
      existing.quantity += 1;
      existing.lineTotal = getCartItemUnitPrice(existing) * existing.quantity;
    }
  } else if (isStockUnlimited(product) || available > 0) {
    state.cart.push({
      id: makeId("cart-item"),
      productId,
      variantId: variant?.id || "",
      quantity: 1,
      unitPrice,
      finalPrice: unitPrice,
      lineTotal: unitPrice,
      unitName: variant?.unitName || "",
      unitQuantity: 1,
      receiptLabel: "",
      note: "",
    });
  }

  resetCheckoutWarnings();
  render();
  if (cartQuantity(productId) > previousQuantity) {
    showToast(`${product.name} masuk keranjang.`, { title: "Keranjang", duration: 1200 });
  }
}

function changeCartQuantity(cartItemId, delta) {
  const cartItem = state.cart.find((item) => item.id === cartItemId);
  if (!cartItem) return;
  const product = getProduct(cartItem.productId);
  if (!product) return;

  const nextQuantity = Math.max(0, cartItem.quantity + delta);
  const totalOtherQuantity = state.cart
    .filter((item) => item.productId === cartItem.productId && item.id !== cartItemId)
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const maxAllowed = isStockUnlimited(product) ? Infinity : Number(product.stock || 0) - totalOtherQuantity;

  cartItem.quantity = Math.min(maxAllowed, nextQuantity);
  cartItem.unitQuantity = Number(cartItem.unitQuantity || cartItem.quantity || 0) === Number(cartItem.quantity || 0) ? cartItem.quantity : Number(cartItem.unitQuantity || cartItem.quantity || 0);
  cartItem.lineTotal = getCartItemUnitPrice(cartItem) * cartItem.quantity;
  state.cart = state.cart.filter((item) => item.quantity > 0);
  resetCheckoutWarnings();
  render();
}

function removeFromCart(cartItemId) {
  const cartItem = state.cart.find((item) => item.id === cartItemId);
  const product = cartItem ? getProduct(cartItem.productId) : null;
  state.cart = state.cart.filter((item) => item.id !== cartItemId);
  resetCheckoutWarnings();
  render();
  if (product) showToast(`${product.name} dihapus dari keranjang.`, { title: "Keranjang", duration: 1200 });
}

function getBlankVariant(overrides = {}) {
  return normalizeVariantRecord(
    {
      id: makeId("variant"),
      name: "Normal",
      pricingType: "fixed",
      price: 0,
      unitName: "porsi",
      packageQuantity: 1,
      packageUnit: "porsi",
      receiptLabel: "",
      isDefault: false,
      allowQuantityOverride: true,
      allowPriceOverride: false,
      stockUnlimited: true,
      active: true,
      ...overrides,
    },
    { id: state.editingProductId || "draft-menu", price: overrides.price || 0 },
    0
  );
}

function ensureEditingVariants() {
  if (!Array.isArray(state.editingProductVariants) || !state.editingProductVariants.length) {
    state.editingProductVariants = getBaseVariantDrafts({ id: state.editingProductId || "draft-menu", price: 0 });
  }
  let hasDefault = false;
  state.editingProductVariants = state.editingProductVariants.map((variant, index) => {
    const normalized = normalizeVariantRecord(variant, { id: state.editingProductId || "draft-menu", price: variant.price || 0 }, index);
    if (normalized.isDefault && !hasDefault) hasDefault = true;
    else {
      normalized.isDefault = false;
      normalized.is_default = false;
    }
    return normalized;
  });
  if (!hasDefault && state.editingProductVariants.length) {
    state.editingProductVariants[0].isDefault = true;
    state.editingProductVariants[0].is_default = true;
  }
}

function renderVariantEditorList() {
  if (!els.variantEditorList) return;
  ensureEditingVariants();
  els.variantEditorList.innerHTML = state.editingProductVariants
    .map((variant, index) => {
      const type = normalizePricingType(variant.pricingType);
      const isBaseVariant = Boolean(getBaseVariantKind(variant, state.editingProductId || "draft-menu"));
      return `
        <article class="variant-editor-card" data-variant-index="${index}">
          <div class="variant-editor-card-head">
            <label class="variant-default-toggle">
              <input type="radio" name="defaultVariant" data-variant-field="isDefault" ${variant.isDefault ? "checked" : ""}>
              <span>Default</span>
            </label>
            <button class="ghost-button danger product-small-button" type="button" data-remove-variant="${index}" ${isBaseVariant || state.editingProductVariants.length <= 1 ? "disabled" : ""}>Hapus</button>
          </div>
          <div class="variant-editor-grid">
            <label>
              Nama variasi
              <input type="text" data-variant-field="name" value="${escapeHtml(variant.name)}" placeholder="Normal">
            </label>
            <label>
              Tipe harga
              <select data-variant-field="pricingType">
                ${[
                  ["fixed", "Harga tetap"],
                  ["unit", "Per satuan"],
                  ["package", "Paket"],
                  ["custom", "Custom/manual"],
                ].map(([value, label]) => `<option value="${value}" ${type === value ? "selected" : ""}>${label}</option>`).join("")}
              </select>
            </label>
            <label>
              Harga
              <input type="text" inputmode="numeric" pattern="[0-9.]*" data-variant-field="price" value="${escapeHtml(formatIntegerInput(variant.price))}" placeholder="35.000">
            </label>
            <label>
              Satuan
              <input type="text" data-variant-field="unitName" value="${escapeHtml(variant.unitName || "porsi")}" placeholder="porsi, biji, box">
            </label>
            <label class="${type === "package" ? "" : "variant-package-only"}">
              Isi paket
              <input type="number" min="1" step="1" data-variant-field="packageQuantity" value="${escapeHtml(variant.packageQuantity || 1)}">
            </label>
            <label class="${type === "package" ? "" : "variant-package-only"}">
              Satuan isi
              <input type="text" data-variant-field="packageUnit" value="${escapeHtml(variant.packageUnit || variant.unitName || "porsi")}" placeholder="biji">
            </label>
            <label class="variant-receipt-label-field">
              Label struk
              <input type="text" data-variant-field="receiptLabel" value="${escapeHtml(variant.receiptLabel || "")}" placeholder="Porsi khusus, 10 biji">
            </label>
          </div>
          <div class="variant-editor-options">
            <label class="check-row">
              <input type="checkbox" data-variant-field="allowQuantityOverride" ${variant.allowQuantityOverride ? "checked" : ""}>
              <span>Jumlah bisa diubah</span>
            </label>
            <label class="check-row">
              <input type="checkbox" data-variant-field="allowPriceOverride" ${variant.allowPriceOverride ? "checked" : ""}>
              <span>Harga bisa custom</span>
            </label>
          </div>
        </article>
      `;
    })
    .join("");
}

function updateEditingVariant(index, field, value, inputType = "text", shouldRender = true) {
  ensureEditingVariants();
  const variant = state.editingProductVariants[index];
  if (!variant) return;
  const productId = state.editingProductId || "draft-menu";
  if (field === "isDefault") {
    state.editingProductVariants.forEach((item, itemIndex) => {
      item.isDefault = itemIndex === index;
      item.is_default = itemIndex === index;
    });
  } else if (field === "price") {
    variant.price = variant.pricingType === "custom" ? 0 : parseMoney(value);
    if (getBaseVariantKind(variant, productId) === "normal") {
      const halfVariant = state.editingProductVariants.find((item) => getBaseVariantKind(item, productId) === "half");
      if (halfVariant) halfVariant.price = getHalfVariantPrice(variant.price);
    }
  } else if (field === "packageQuantity") {
    variant.packageQuantity = Math.max(1, parseIntegerInput(value) || 1);
    variant.package_quantity = variant.packageQuantity;
  } else if (["allowQuantityOverride", "allowPriceOverride"].includes(field)) {
    variant[field] = inputType === "checkbox" ? Boolean(value) : Boolean(value);
  } else if (field === "pricingType") {
    variant.pricingType = normalizePricingType(value);
    variant.pricing_type = variant.pricingType;
    if (variant.pricingType === "custom") {
      variant.price = 0;
      variant.allowPriceOverride = true;
      variant.allow_price_override = true;
    }
  } else {
    variant[field] = String(value || "").trim();
  }
  if (shouldRender) renderVariantEditorList();
}

function addEditingVariant() {
  ensureEditingVariants();
  state.editingProductVariants.push(getBlankVariant({ name: `Variasi ${state.editingProductVariants.length + 1}`, price: getDefaultVariant({ id: "draft", variants: state.editingProductVariants })?.price || 0 }));
  renderVariantEditorList();
}

function removeEditingVariant(index) {
  ensureEditingVariants();
  if (state.editingProductVariants.length <= 1) return;
  if (getBaseVariantKind(state.editingProductVariants[index], state.editingProductId || "draft-menu")) return;
  const removedDefault = state.editingProductVariants[index]?.isDefault;
  state.editingProductVariants.splice(index, 1);
  if (removedDefault && state.editingProductVariants[0]) state.editingProductVariants[0].isDefault = true;
  renderVariantEditorList();
}

function resetProductForm() {
  state.editingProductId = null;
  state.editingProductVariants = getBaseVariantDrafts({ id: "draft-menu", price: 0 });
  els.itemForm.reset();
  els.itemSubmitButton.textContent = "Simpan Barang";
  els.cancelEditProductButton.hidden = true;
  syncManualStockInputState();
  renderVariantEditorList();
}

function startEditProduct(productId) {
  const product = getProduct(productId);
  if (!product) return;

  state.editingProductId = productId;
  setInventoryTab("manual");
  els.itemNameInput.value = product.name || "";
  els.itemPriceInput.value = formatIntegerInput(product.price || 0);
  els.itemCategoryInput.value = getProductCategory(product);
  els.itemSkuInput.value = product.sku || "";
  els.itemAliasInput.value = getProductAliases(product).join(", ");
  els.itemUnlimitedInput.checked = isStockUnlimited(product);
  els.itemStockInput.value = isStockUnlimited(product) ? "" : product.stock || 0;
  state.editingProductVariants = getProductVariants(product).map((variant, index) => normalizeVariantRecord(variant, product, index));
  renderVariantEditorList();
  syncManualStockInputState();
  els.itemSubmitButton.textContent = "Update Barang";
  els.cancelEditProductButton.hidden = false;
  openModal(els.inventoryModal, els.itemNameInput);
}

function saveProductForm() {
  const name = els.itemNameInput.value.trim();
  const category = els.itemCategoryInput.value.trim() || DEFAULT_CATEGORY;
  const stockUnlimited = els.itemUnlimitedInput.checked;
  const stock = stockUnlimited ? 0 : parseStock(els.itemStockInput.value);
  const sku = els.itemSkuInput.value.trim();
  const aliases = mergeAliasLists(els.itemAliasInput.value).filter((alias) => normalizeKey(alias) !== normalizeKey(name));
  ensureEditingVariants();
  const productId = state.editingProductId || makeId();
  const draftVariants = state.editingProductVariants.map((variant, index) => normalizeVariantRecord(variant, { id: productId }, index));
  const normalVariant = draftVariants.find((variant) => getBaseVariantKind(variant, productId) === "normal") || draftVariants.find((variant) => variant.isDefault) || draftVariants[0];
  const price = Number(normalVariant?.price || 0);
  const variants = ensureProductVariants({ id: productId, price, stock, stockUnlimited, variants: draftVariants });

  if (!name || !variants.length || price <= 0) return;

  if (state.editingProductId) {
    const product = getProduct(state.editingProductId);
    if (!product) return;
    Object.assign(product, {
      name,
      price,
      category,
      stock,
      stockUnlimited,
      sku,
      aliases,
      variants: variants.map((variant) => ({ ...variant, productId: product.id, product_client_id: product.id })),
      source: product.source || "manual",
    });
    sanitizeCart();
    setSyncStatus(`${name} sudah diupdate.`);
  } else {
    const result = upsertProduct({
      id: productId,
      name,
      price,
      stock,
      stockUnlimited,
      sku,
      aliases,
      category,
      source: "manual",
      variants: variants.map((variant) => ({ ...variant, productId, product_client_id: productId })),
    });
    setSyncStatus(result === "updated" ? `${name} cocok dengan barang lama, data diupdate.` : `${name} sudah masuk ke daftar barang.`);
  }

  resetProductForm();
  setInventoryTab("list");
  render();
  saveProductsToDatabase({ toast: false });
}

function deleteProduct(productId) {
  const product = getProduct(productId);
  if (!product) return;

  state.products = state.products.filter((item) => item.id !== productId);
  state.cart = state.cart.filter((item) => item.productId !== productId);
  state.heldCarts = state.heldCarts
    .map((heldCart) => ({
      ...heldCart,
      cart: heldCart.cart.filter((item) => item.productId !== productId),
    }))
    .filter((heldCart) => heldCart.cart.length);
  state.dailyMenu.productIds = state.dailyMenu.productIds.filter((id) => id !== productId);

  if (state.editingProductId === productId) resetProductForm();
  setSyncStatus(`${product.name} sudah dihapus.`);
  render();
  deleteProductsFromSupabase(productId);
  saveProductsToDatabase({ toast: false });
}

function openDeleteProductModal(productId) {
  const product = getProduct(productId);
  if (!product) return;
  state.pendingDeleteProductId = productId;
  if (els.deleteProductMessage) {
    const sku = String(product.sku || "").trim();
    els.deleteProductMessage.textContent = `Hapus ${product.name}${sku ? ` (${sku})` : ""} dari daftar barang?`;
  }
  openModal(els.deleteProductModal, els.cancelDeleteProductButton);
}

function closeDeleteProductModal() {
  state.pendingDeleteProductId = null;
  els.deleteProductModal?.close();
}

function confirmDeleteProduct() {
  const productId = state.pendingDeleteProductId;
  if (!productId) {
    closeDeleteProductModal();
    return;
  }
  state.pendingDeleteProductId = null;
  deleteProduct(productId);
  els.deleteProductModal?.close();
}

function mergeDuplicateProducts() {
  const groups = getDuplicateProductGroups();
  if (!groups.length) {
    setSyncStatus("Tidak ada duplikat barang yang perlu digabung.");
    return;
  }

  const idMap = new Map();
  const duplicateIds = new Set();
  groups.forEach((group) => {
    const primary = group
      .slice()
      .sort((left, right) => state.products.indexOf(left) - state.products.indexOf(right))[0];
    const aliases = mergeAliasLists(primary.aliases);
    group.forEach((product) => {
      if (product.id === primary.id) return;
      idMap.set(product.id, primary.id);
      duplicateIds.add(product.id);
      aliases.push(product.name, ...getProductAliases(product));
      if (!primary.sku && product.sku) primary.sku = product.sku;
      if (!primary.category && product.category) primary.category = product.category;
      if (isStockUnlimited(product)) {
        primary.stockUnlimited = true;
        primary.stock = 0;
      } else if (!isStockUnlimited(primary)) {
        primary.stock = Math.max(Number(primary.stock || 0), Number(product.stock || 0));
      }
    });
    primary.aliases = mergeAliasLists(aliases.filter((alias) => normalizeKey(alias) !== normalizeKey(primary.name)));
  });

  const remapCart = (cart) => {
    const merged = new Map();
    cart.forEach((cartItem) => {
      const productId = idMap.get(cartItem.productId) || cartItem.productId;
      const noteText = String(cartItem.note || "").trim();
      const key = `${productId}_${noteText}`;
      const current = merged.get(key) || {
        id: cartItem.id || makeId("cart-item"),
        productId,
        quantity: 0,
        note: noteText
      };
      current.quantity += Number(cartItem.quantity || 0);
      merged.set(key, current);
    });
    return [...merged.values()];
  };

  state.cart = remapCart(state.cart);
  state.heldCarts = state.heldCarts.map((heldCart) => ({ ...heldCart, cart: remapCart(heldCart.cart) }));
  state.importDrafts.forEach((draft) => {
    draft.items.forEach((item) => {
      if (idMap.has(item.productId)) item.productId = idMap.get(item.productId);
    });
  });
  state.products = state.products.filter((product) => !duplicateIds.has(product.id));
  sanitizeCart();
  setSyncStatus(`${duplicateIds.size} barang duplikat digabung. Nama lama disimpan sebagai alias.`);
  render();
  deleteProductsFromSupabase(Array.from(duplicateIds));
  saveProductsToDatabase({ toast: false });
}

function updateCartItemNote(cartItemId, note) {
  const cartItem = state.cart.find((item) => item.id === cartItemId);
  if (!cartItem) return;
  cartItem.note = note;
  saveState();
  renderReceipt();
}

function updateCartItemPrice(cartItemId, value, sourceInput = null) {
  const cartItem = state.cart.find((item) => item.id === cartItemId);
  if (!cartItem) return;
  const price = parseMoney(value);
  cartItem.unitPrice = price;
  cartItem.finalPrice = price;
  cartItem.lineTotal = price * Number(cartItem.quantity || 0);
  resetCheckoutWarnings();
  const row = sourceInput?.closest(".cart-row");
  row?.querySelector(".cart-unit-price")?.replaceChildren(`${cartItem.quantity} × ${currency.format(price)}`);
  row?.querySelector(".cart-line-total")?.replaceChildren(currency.format(cartItem.lineTotal));
  renderCartTotals();
  renderReceipt();
  saveState();
}

function changeCartItemVariant(cartItemId, targetVariantId) {
  const cartItem = state.cart.find((item) => item.id === cartItemId);
  if (!cartItem) return;

  const product = getProduct(cartItem.productId);
  if (!product) return;
  const targetVariant = getProductVariant(product, targetVariantId);
  if (!targetVariant) return;

  cartItem.variantId = targetVariant.id;
  cartItem.unitPrice = Number(targetVariant.price || 0);
  cartItem.finalPrice = cartItem.unitPrice;
  cartItem.unitName = targetVariant.unitName || "";
  cartItem.unitQuantity = Number(cartItem.quantity || 1);
  cartItem.receiptLabel = "";
  cartItem.lineTotal = cartItem.unitPrice * Number(cartItem.quantity || 0);

  saveState();
  render();
}

function getCartItemCount(cart = state.cart) {
  return cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

function getCartSubtotal(cart = state.cart) {
  return cart.reduce((sum, cartItem) => {
    const product = getProduct(cartItem.productId);
    return sum + (product ? getCartItemLineTotal(cartItem) : 0);
  }, 0);
}

function getHeldCartTotal(heldCart) {
  const subtotal = getCartSubtotal(heldCart.cart);
  const shipping = Math.max(0, Number(heldCart.sale?.shipping || 0));
  return subtotal + shipping;
}

function holdCurrentCart() {
  if (!state.cart.length) {
    setSyncStatus("Keranjang masih kosong. Tidak ada transaksi yang perlu ditahan.");
    return;
  }

  const heldCart = {
    id: makeId("hold"),
    createdAt: new Date().toISOString(),
    cart: state.cart.map((item) => ({ ...item })),
    sale: { ...state.sale },
  };
  state.heldCarts = [heldCart, ...state.heldCarts].slice(0, 20);
  state.cart = [];
  state.sale = getDefaultSaleState();
  renderSettings();
  setSyncStatus("Transaksi ditahan. Buka Hold untuk melanjutkan nanti.");
  render();
}

function renderHeldCarts() {
  if (!state.heldCarts.length) {
    els.heldCartList.innerHTML = `<div class="empty-state">Belum ada transaksi tertahan.</div>`;
    return;
  }

  els.heldCartList.innerHTML = state.heldCarts
    .map((heldCart, index) => {
      const itemCount = getCartItemCount(heldCart.cart);
      const total = getHeldCartTotal(heldCart);
      const itemNames = heldCart.cart
        .map((item) => {
          const product = getProduct(item.productId);
          return product ? `${item.quantity}x ${product.name}` : "";
        })
        .filter(Boolean)
        .join(", ");

      const customerName = String(heldCart.sale?.customerName || "").trim();
      const titleSuffix = customerName ? ` - ${customerName}` : "";

      return `
        <article class="held-cart-card">
          <div>
            <p class="sale-card-title">Hold ${index + 1}${escapeHtml(titleSuffix)}</p>
            <p class="sale-card-meta">${new Date(heldCart.createdAt).toLocaleString("id-ID")} · ${itemCount} item · ${currency.format(total)}</p>
            <p class="sale-card-items">${escapeHtml(itemNames || "Item tidak ditemukan")}</p>
          </div>
          <div class="held-cart-actions">
            <button class="primary-button" type="button" data-resume-hold="${escapeHtml(heldCart.id)}">Lanjutkan</button>
            <button class="ghost-button danger" type="button" data-delete-hold="${escapeHtml(heldCart.id)}">Hapus</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function openHeldCarts() {
  renderHeldCarts();
  openModal(els.heldCartsModal);
}

async function resumeHeldCart(holdId) {
  const heldCart = state.heldCarts.find((item) => item.id === holdId);
  if (!heldCart) return;
  if (state.cart.length) {
    const confirmed = await openAppConfirm({
      eyebrow: "Hold",
      title: "Buka transaksi hold?",
      message: "Keranjang aktif akan diganti dengan transaksi tertahan ini.",
      confirmText: "Ya, buka",
    });
    if (!confirmed) return;
  }

  state.cart = heldCart.cart.map((item) => ({ ...item }));
  state.sale = getDefaultSaleState(heldCart.sale);
  state.heldCarts = state.heldCarts.filter((item) => item.id !== holdId);
  sanitizeCart();
  renderSettings();
  setSyncStatus("Transaksi tertahan sudah dibuka lagi.");
  render();
  els.heldCartsModal.close();
}

function deleteHeldCart(holdId) {
  state.heldCarts = state.heldCarts.filter((item) => item.id !== holdId);
  renderHeldCarts();
  saveState();
}

function splitCsvLine(line, delimiter) {
  const cells = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

function parseDelimited(text) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return [];

  const firstLine = normalized.split("\n")[0] ?? "";
  const delimiter = firstLine.includes("\t") ? "\t" : firstLine.includes(";") ? ";" : ",";
  const rows = normalized.split("\n").map((line) => splitCsvLine(line, delimiter));
  const headers = rows.shift().map((header) => normalizeKey(header));

  return rows
    .filter((row) => row.some(Boolean))
    .map((row) =>
      headers.reduce((record, header, index) => {
        record[header] = row[index] ?? "";
        return record;
      }, {})
    );
}

async function readSpreadsheet(file) {
  const extension = file.name.split(".").pop().toLowerCase();

  if (extension === "xlsx" || extension === "xls") {
    if (!window.XLSX) {
      throw new Error("Impor Excel butuh koneksi internet. Simpan file sebagai CSV, lalu impor lagi.");
    }
    const buffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return window.XLSX.utils.sheet_to_json(sheet, { defval: "" }).map((row) => {
      return Object.entries(row).reduce((record, [key, value]) => {
        record[normalizeKey(key)] = value;
        return record;
      }, {});
    });
  }

  const text = await file.text();
  return parseDelimited(text);
}

function rowsToProducts(rows, source) {
  const columns = getColumnSettings();
  const productsByKey = new Map();
  let skipped = 0;
  let duplicates = 0;

  rows.forEach((row) => {
    const name = String(row[columns.name] ?? "").trim();
    const price = parseMoney(row[columns.price]);
    const stockInfo = parseStockInfo(row[columns.stock]);
    const sku = String(row[columns.sku] ?? "").trim();
    const category = String(row[normalizeKey("kategori")] ?? row[normalizeKey("category")] ?? "").trim();
    const aliases = mergeAliasLists(readObjectValue(row, ["alias", "aliases", "aliasMenu", "alias_menu", "namaAlias", "nama_alias"], ""));

    if (!name || price <= 0) {
      skipped += 1;
      return;
    }

    const key = sku ? `sku:${normalizeKey(sku)}` : `menu:${normalizeKey(name)}|harga:${price}`;
    if (productsByKey.has(key)) duplicates += 1;
    const existing = productsByKey.get(key);
    productsByKey.set(key, {
      name,
      price,
      stock: stockInfo.stock,
      stockUnlimited: stockInfo.stockUnlimited,
      sku,
      aliases: mergeAliasLists(existing?.aliases, existing?.name && existing.name !== name ? existing.name : "", aliases),
      category,
      source,
    });
  });

  return {
    products: [...productsByKey.values()],
    skipped,
    duplicates,
  };
}

function applyInventoryRows(rows, options = {}) {
  const source = options.source || "local";
  const replaceSource = Boolean(options.replaceSource);
  const normalized = rowsToProducts(rows, source);
  let created = 0;
  let updated = 0;

  if (replaceSource) {
    const incoming = normalized.products.map((product) => {
      const existing = state.products.find((item) => sameProductIdentity(item, product));
      if (existing) updated += 1;
      else created += 1;
      return { ...product, id: existing?.id || makeId() };
    });
    const localProducts = state.products.filter((product) => {
      if (product.source === source) return false;
      return !incoming.some((incomingProduct) => sameProductIdentity(incomingProduct, product));
    });
    state.products = [...incoming, ...localProducts];
  } else {
    normalized.products.forEach((product) => {
      const result = upsertProduct(product);
      if (result === "created") created += 1;
      if (result === "updated") updated += 1;
    });
  }

  sanitizeCart();
  return { created, updated, skipped: normalized.skipped, duplicates: normalized.duplicates };
}

function buildGoogleSheetCsvUrl(rawUrl, sheetName) {
  const value = rawUrl.trim();
  if (!value) throw new Error("Tempel link Google Sheet dulu.");

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Link Google Sheet belum valid.");
  }

  const isGoogleSheet = url.hostname.includes("docs.google.com") && url.pathname.includes("/spreadsheets/");
  if (!isGoogleSheet) return value;

  if (url.pathname.endsWith("/pubhtml")) {
    url.pathname = url.pathname.replace(/\/pubhtml$/, "/pub");
    url.searchParams.set("output", "csv");
    return url.toString();
  }

  if (url.searchParams.get("output") === "csv" || url.searchParams.get("tqx")?.includes("out:csv")) {
    return url.toString();
  }

  const idMatch = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
  if (!idMatch) throw new Error("ID Google Sheet tidak terbaca dari link itu.");

  const gidFromHash = url.hash.match(/gid=(\d+)/)?.[1];
  const gid = url.searchParams.get("gid") || gidFromHash;
  const csvUrl = new URL(`https://docs.google.com/spreadsheets/d/${idMatch[1]}/gviz/tq`);
  csvUrl.searchParams.set("tqx", "out:csv");

  if (sheetName.trim()) {
    csvUrl.searchParams.set("sheet", sheetName.trim());
  } else if (gid) {
    csvUrl.searchParams.set("gid", gid);
  }

  return csvUrl.toString();
}

async function fetchGoogleSheetRows() {
  if (!navigator.onLine) {
    throw new Error("Perangkat sedang offline. Aplikasi tetap memakai data barang terakhir.");
  }

  const csvUrl = buildGoogleSheetCsvUrl(state.sync.sheetUrl, state.sync.sheetName);
  const response = await fetch(csvUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Google Sheet tidak bisa dibuka. Pastikan link bisa dilihat publik atau sudah dipublikasikan sebagai CSV.");
  }

  const text = await response.text();
  if (/^\s*</.test(text)) {
    throw new Error("Google mengirim halaman web, bukan CSV. Publikasikan sheet sebagai CSV atau cek nama tab.");
  }

  return parseDelimited(text);
}

function saveSheetSettings() {
  state.sync.sheetUrl = els.sheetUrlInput.value.trim();
  state.sync.sheetName = els.sheetNameInput.value.trim();
  state.sync.autoSync = els.autoSyncInput.checked;
  saveColumnSettings();
  saveState();
  updateConnectionUI();
  startAutoSync();
}

async function syncGoogleSheet(options = {}) {
  if (syncInFlight) return;
  saveSheetSettings();

  if (!state.sync.sheetUrl) {
    setSyncStatus("Tempel link Google Sheet yang bisa dilihat publik untuk sinkron barang.");
    return;
  }

  syncInFlight = true;
  els.syncSheetButton.disabled = true;
  if (!options.silent) setSyncStatus("Sedang sinkron Google Sheet...");

  try {
    const rows = await fetchGoogleSheetRows();
    const result = applyInventoryRows(rows, { source: "google", replaceSource: true });
    await saveProductsToDatabase({ toast: false });
    state.sync.lastSyncAt = new Date().toISOString();
    const duplicateInfo = result.duplicates ? ` ${result.duplicates} duplikat dari sheet digabung.` : "";
    setSyncStatus(`Sinkron selesai. ${result.created} barang baru, ${result.updated} barang diperbarui, ${result.skipped} baris dilewati.${duplicateInfo}`, { toast: !options.silent });
    render();
  } catch (error) {
    setSyncStatus(error.message);
    saveState();
  } finally {
    syncInFlight = false;
    els.syncSheetButton.disabled = false;
    updateConnectionUI();
  }
}

function startAutoSync() {
  if (syncTimer) clearInterval(syncTimer);
  if (!state.sync.autoSync) return;

  syncTimer = setInterval(() => {
    if (navigator.onLine && state.sync.sheetUrl) {
      syncGoogleSheet({ silent: true });
    }
  }, SYNC_INTERVAL_MS);
}

async function completeSale() {
  if (!canCompleteSale()) return;

  const salePayload = buildSalePayload();
  els.completeSaleButton.disabled = true;
  setSyncStatus("Menyimpan transaksi ke database SQL...");

  try {
    const savedSale = await saveSaleToDatabase(salePayload);
    if (savedSale.receiptNo) salePayload.receiptNo = savedSale.receiptNo;
    if (savedSale.usedDeposit) salePayload.usedDeposit = savedSale.usedDeposit;
  } catch (error) {
    setSyncStatus(`${error.message} Transaksi belum diselesaikan.`);
    els.completeSaleButton.disabled = false;
    return;
  }

  state.lastReceipt = salePayload;
  state.cart.forEach((cartItem) => {
    const product = getProduct(cartItem.productId);
    if (!product) return;
    if (isStockUnlimited(product)) return;
    product.stock = Math.max(0, product.stock - cartItem.quantity);
  });
  if (state.sale.sourceDraftId) {
    state.importDrafts = state.importDrafts.filter((draft) => draft.id !== state.sale.sourceDraftId);
  }
  state.cart = [];
  state.sale = getDefaultSaleState();
  resetCheckoutWarnings();
  renderSettings();
  render();
  await saveProductsToDatabase({ toast: false });
  await loadSalesDashboard();

  if (!state.settings.autoPrint) {
    preparePrintReceipt(salePayload);
    setSyncStatus("Transaksi selesai. Auto print mati, tekan Cetak Struk kalau perlu.");
    els.completeSaleButton.disabled = false;
    return;
  }

  if (state.settings.printFlow === "preview") {
    openReceiptPreview(salePayload);
    setSyncStatus("Transaksi selesai. Preview struk dibuka, tekan Cetak Struk saat siap.");
    els.completeSaleButton.disabled = false;
    return;
  }

  setSyncStatus("Transaksi tersimpan. Membuka dialog cetak struk...");
  await printSaleReceipt(salePayload);
  setSyncStatus("Transaksi selesai. Pilih printer thermal 58mm/80mm di dialog print.");
  els.completeSaleButton.disabled = false;
}

async function importSpreadsheet() {
  const file = state.selectedFile;
  if (!file) return;

  els.importButton.disabled = true;
  setSyncStatus("Sedang membaca file...");

  try {
    const rows = await readSpreadsheet(file);
    const result = applyInventoryRows(rows, { source: "file" });
    await saveProductsToDatabase({ toast: false });
    const duplicateInfo = result.duplicates ? ` ${result.duplicates} duplikat file digabung.` : "";
    setSyncStatus(`Impor selesai. ${result.created} barang baru, ${result.updated} barang diperbarui, ${result.skipped} baris dilewati.${duplicateInfo}`);
    render();
  } catch (error) {
    setSyncStatus(error.message);
  } finally {
    els.importButton.disabled = false;
  }
}

function bindEvents() {
  window.addEventListener("beforeprint", ensureReceiptReadyBeforePrint);
  const scheduleSalesSearchRender = debounce(() => {
    resetSalesPage();
    renderSalesDashboard();
    saveState();
  }, 180);

  els.sidebarMenuButton?.addEventListener("click", toggleSidebar);
  els.closeSidebarButton?.addEventListener("click", closeSidebar);
  els.sidebarOverlay?.addEventListener("click", closeSidebar);
  els.appSidebar?.addEventListener("click", (event) => {
    if (event.target.closest(".sidebar-nav button")) closeSidebar();
  });
  window.addEventListener("resize", () => {
    if (window.matchMedia("(min-width: 1101px)").matches) closeSidebar();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isSidebarOpen()) closeSidebar();
  });
  els.themeToggleButton.addEventListener("click", toggleTheme);

  els.spreadsheetInput.addEventListener("change", (event) => {
    const [file] = event.target.files;
    state.selectedFile = file ?? null;
    els.importButton.disabled = !file;
    setSyncStatus(file ? `${file.name} siap diimpor.` : "Belum ada file yang dipilih.");
  });

  els.importButton.addEventListener("click", importSpreadsheet);
  els.showAllMenuButton.addEventListener("click", () => setDailyMenuOnly(false));
  els.showTodayMenuButton.addEventListener("click", () => setDailyMenuOnly(true));
  els.openDailyMenuButton.addEventListener("click", openDailyMenuEditor);
  els.dailyMenuDateButton.addEventListener("click", () => {
    if (els.dailyMenuCalendarPopover.hidden) openDailyMenuCalendar();
    else closeDailyMenuCalendar();
  });
  els.previousDailyMenuMonthButton.addEventListener("click", () => {
    state.dailyMenuCalendar.month = addMonthsToMonthKey(state.dailyMenuCalendar.month, -1);
    renderDailyMenuCalendar();
  });
  els.nextDailyMenuMonthButton.addEventListener("click", () => {
    state.dailyMenuCalendar.month = addMonthsToMonthKey(state.dailyMenuCalendar.month, 1);
    renderDailyMenuCalendar();
  });
  els.dailyMenuTodayButton.addEventListener("click", () => selectDailyMenuCalendarDate(getTodayMenuDate()));
  els.dailyMenuCalendarGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-daily-menu-date]");
    if (button) selectDailyMenuCalendarDate(button.dataset.dailyMenuDate);
  });
  els.dailyMenuDateInput.addEventListener("change", () => {
    setDailyMenuEditorDate(els.dailyMenuDateInput.value || getTodayMenuDate());
  });
  els.dailyMenuOnlyInput.addEventListener("change", () => {
    state.dailyMenu.onlyToday = Boolean(els.dailyMenuOnlyInput.checked);
    render();
  });
  els.dailyMenuFileInput.addEventListener("change", (event) => {
    const [file] = event.target.files;
    readDailyMenuFile(file);
    event.target.value = "";
  });
  els.applyDailyMenuButton.addEventListener("click", applyDailyMenuFromInput);
  els.clearDailyMenuButton.addEventListener("click", clearDailyMenu);
  els.dailyMenuReview.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-daily-menu]");
    if (removeButton) removeDailyMenuProduct(removeButton.dataset.removeDailyMenu);
  });
  els.openBulkImportButton.addEventListener("click", openBulkImport);
  els.bulkImportFileInput.addEventListener("change", (event) => {
    const [file] = event.target.files;
    readBulkImportFile(file);
  });
  els.parseBulkSummaryButton.addEventListener("click", importBulkSummaryText);
  els.bulkSearchInput?.addEventListener("input", (event) => {
    state.bulkDraftSearch = event.target.value;
    renderBulkDrafts();
  });
  els.processReadyDraftsButton.addEventListener("click", () => processReadyImportDrafts({ print: false }));
  els.processPrintReadyDraftsButton.addEventListener("click", () => processReadyImportDrafts({ print: true }));
  els.previewPrintReadyDraftsButton?.addEventListener("click", previewPrintReadyDrafts);
  els.copyAiPromptButton.addEventListener("click", copyAiPrompt);
  els.clearBulkDraftsButton.addEventListener("click", async () => {
    if (!state.importDrafts.length) return;
    const confirmed = await openAppConfirm({
      eyebrow: "Import Pesanan",
      title: "Hapus semua draft?",
      message: "Semua draft pesanan hasil import akan dihapus dari daftar review.",
      confirmText: "Ya, hapus draft",
      variant: "danger",
    });
    if (!confirmed) return;
    state.importDrafts = [];
    renderBulkDrafts();
    saveState();
    setBulkImportStatus("Semua draft pesanan dihapus.");
  });
  els.bulkImportModal.addEventListener("click", (event) => {
    if (event.target === els.bulkImportModal) {
      els.bulkImportModal.close();
    }
  });
  if (els.bulkFilterTabs) {
    const buttons = els.bulkFilterTabs.querySelectorAll("[data-bulk-filter]");
    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        state.bulkDraftFilter = button.dataset.bulkFilter;
        renderBulkDrafts();
        saveState();
      });
    });
  }
  els.bulkDraftList.addEventListener("input", (event) => {
    updateBulkDraftFromTarget(event.target, false);
  });
  els.bulkDraftList.addEventListener("change", (event) => {
    updateBulkDraftFromTarget(event.target, true);
  });
  els.bulkDraftList.addEventListener("click", (event) => {
    const card = event.target.closest("[data-draft-id]");
    const addItemButton = event.target.closest("[data-add-draft-item]");
    const removeItemButton = event.target.closest("[data-remove-draft-item]");
    const deleteButton = event.target.closest("[data-delete-draft]");
    const loadButton = event.target.closest("[data-load-draft]");

    if (addItemButton) addDraftItem(addItemButton.dataset.addDraftItem);
    if (removeItemButton && card) removeDraftItem(card.dataset.draftId, removeItemButton.dataset.removeDraftItem);
    if (deleteButton) deleteImportDraft(deleteButton.dataset.deleteDraft);
    if (loadButton) loadDraftToCart(loadButton.dataset.loadDraft);
  });
  els.refreshSalesButton.addEventListener("click", loadSalesDashboard);
  els.openSalesDashboardButton.addEventListener("click", openSalesDashboard);
  els.openCustomerDataButton.addEventListener("click", openCustomerDataManager);
  els.refreshCustomersButton.addEventListener("click", async () => {
    setCustomerDataStatus("Memuat ulang data customer...");
    await loadCustomers({ toast: false });
  });
  els.openAddCustomerButton.addEventListener("click", openAddCustomerDialog);
  els.cancelAddCustomerButton.addEventListener("click", () => {
    els.addCustomerModal.close();
  });
  els.addCustomerModal.addEventListener("click", (event) => {
    if (event.target === els.addCustomerModal) {
      els.addCustomerModal.close();
    }
  });
  els.addCustomerShippingInput.addEventListener("input", () => {
    formatMoneyInput(els.addCustomerShippingInput);
  });
  els.addCustomerDepositInput.addEventListener("input", () => {
    formatMoneyInput(els.addCustomerDepositInput);
  });
  els.addCustomerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveNewCustomer(event.target);
  });
  els.customerSearchInput.addEventListener("input", () => {
    state.customerSearch = els.customerSearchInput.value;
    renderCustomerDataList();
  });
  els.customerTagFilter?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-customer-tag-filter]");
    if (!button) return;
    state.customerTagFilter = button.dataset.customerTagFilter || CUSTOMER_TAG_FILTER_ALL;
    renderCustomerDataList();
  });
  els.customerHygienePanel?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-customer-hygiene-filter]");
    if (!button) return;
    state.customerHygieneFilter = button.dataset.customerHygieneFilter || CUSTOMER_HYGIENE_FILTER_ALL;
    renderCustomerDataList();
  });
  els.customerSimilarList.addEventListener("submit", (event) => {
    if (!event.target.matches(".customer-merge-card")) return;
    event.preventDefault();
    mergeCustomerGroup(event.target);
  });
  els.customerDataList.addEventListener("input", (event) => {
    if (event.target.matches('input[name="defaultShipping"]') || event.target.matches('input[name="depositBalance"]')) {
      formatMoneyInput(event.target);
    }
    if (event.target.matches(".customer-wrap-editor")) {
      syncCustomerWrapEditor(event.target);
    }
  });
  els.customerDataList.addEventListener("keydown", (event) => {
    if (!event.target.matches(".customer-wrap-editor")) return;
    if (event.key === "Enter") {
      event.preventDefault();
      event.target.blur();
    }
  });
  els.customerDataList.addEventListener("paste", (event) => {
    if (!event.target.matches(".customer-wrap-editor")) return;
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain") || "";
    document.execCommand("insertText", false, text.replace(/\s+/g, " ").trim());
  });
  els.customerDataList.addEventListener("focusout", (event) => {
    if (event.target.matches(".customer-wrap-editor")) {
      syncCustomerWrapEditor(event.target, { trim: true });
    }
  });
  els.customerDataList.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete-customer]");
    if (deleteButton) removeCustomerData(deleteButton);
  });
  els.customerDataList.addEventListener("submit", (event) => {
    if (!event.target.matches(".customer-card")) return;
    event.preventDefault();
    saveCustomerDataForm(event.target);
  });
  els.customerDataModal.addEventListener("click", (event) => {
    if (event.target === els.customerDataModal) {
      els.customerDataModal.close();
    }
  });
  els.openPiutangButton.addEventListener("click", openPiutangManager);
  els.refreshPiutangButton.addEventListener("click", () => {
    loadPiutangData({ toast: true });
  });
  els.piutangSearchInput.addEventListener("input", () => {
    state.piutang.search = els.piutangSearchInput.value;
    renderPiutangList();
  });
  els.tabPiutangBelumLunas.addEventListener("click", () => {
    switchPiutangTab("belum_lunas", els.tabPiutangBelumLunas);
  });
  els.tabPiutangLunas.addEventListener("click", () => {
    switchPiutangTab("lunas", els.tabPiutangLunas);
  });
  els.tabPiutangSemua.addEventListener("click", () => {
    switchPiutangTab("semua", els.tabPiutangSemua);
  });
  els.piutangModal.addEventListener("click", (event) => {
    if (event.target === els.piutangModal) {
      els.piutangModal.close();
    }
  });

  els.piutangList.addEventListener("submit", (event) => {
    if (!event.target.matches(".piutang-pay-form")) return;
    event.preventDefault();
    submitPiutangPayment(event.target);
  });
  els.piutangList.addEventListener("click", (event) => {
    const revokeButton = event.target.closest("[data-revoke-sale-id]");
    if (revokeButton) {
      revokePiutangPayment(revokeButton.dataset.revokeSaleId);
    }
  });
  els.printDailyReportButton.addEventListener("click", printDailyReport);
  els.exportDailyReportButton.addEventListener("click", () => {
    const range = getSalesRangeDates();
    const suffix = range.start === range.end ? range.start : `${range.start}_sd_${range.end}`;
    exportSales(getSelectedSales(), `laporan-penjualan-${suffix}.csv`);
  });
  els.exportAllSalesButton.addEventListener("click", () => {
    exportSales(state.sales, `laporan-penjualan-semua-${getLocalDateKey()}.csv`);
  });
  els.backupDatabaseButton.addEventListener("click", backupDatabase);
  els.restoreDatabaseButton.addEventListener("click", () => els.restoreDatabaseInput.click());
  els.restoreDatabaseInput.addEventListener("change", (event) => {
    const [file] = event.target.files;
    restoreDatabaseBackup(file);
    event.target.value = "";
  });
  els.backupFullAppButton.addEventListener("click", backupFullAppData);
  els.restoreFullAppButton.addEventListener("click", () => els.restoreFullAppInput.click());
  els.restoreFullAppInput.addEventListener("change", (event) => {
    const [file] = event.target.files;
    restoreFullAppData(file);
    event.target.value = "";
  });
  els.salesDateInput.addEventListener("change", () => setSalesDate(els.salesDateInput.value));
  els.salesStartDateInput.addEventListener("change", () => setCustomSalesRange(els.salesStartDateInput.value, els.salesEndDateInput.value));
  els.salesEndDateInput.addEventListener("change", () => setCustomSalesRange(els.salesStartDateInput.value, els.salesEndDateInput.value));
  els.salesStartDateButton?.addEventListener("click", () => openSalesCalendar("start"));
  els.salesEndDateButton?.addEventListener("click", () => openSalesCalendar("end"));
  els.previousSalesCalendarMonthButton?.addEventListener("click", () => {
    state.salesCalendar.month = addMonthsToMonthKey(state.salesCalendar.month, -1);
    renderSalesCalendar();
  });
  els.nextSalesCalendarMonthButton?.addEventListener("click", () => {
    state.salesCalendar.month = addMonthsToMonthKey(state.salesCalendar.month, 1);
    renderSalesCalendar();
  });
  els.salesCalendarGrid?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-calendar-date]");
    if (button) selectSalesCalendarDate(button.dataset.calendarDate);
  });
  els.salesCalendarGrid?.addEventListener("mouseover", (event) => {
    const button = event.target.closest("[data-calendar-date]");
    if (!button) return;
    state.salesCalendar.hoverDate = button.dataset.calendarDate;
    updateSalesCalendarInfo(state.salesCalendar.hoverDate);
  });
  els.salesCalendarGrid?.addEventListener("mouseleave", () => {
    state.salesCalendar.hoverDate = "";
    updateSalesCalendarInfo();
  });
  els.salesRangeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setSalesRange(button.dataset.salesRange);
      if (button.dataset.salesRange === "all") closeSalesCalendar();
    });
  });
  els.salesStatusButtons.forEach((button) => {
    button.addEventListener("click", () => setSalesStatus(button.dataset.salesStatus));
  });
  els.salesSearchInput.addEventListener("input", () => {
    state.salesSearch = els.salesSearchInput.value;
    scheduleSalesSearchRender();
  });
  els.salesSortInput?.addEventListener("change", () => {
    state.salesSort = ["newest", "oldest"].includes(els.salesSortInput.value) ? els.salesSortInput.value : "newest";
    resetSalesPage();
    renderSalesDashboard();
    saveState();
  });
  els.previousSalesPageButton?.addEventListener("click", () => setSalesPage(state.salesPage - 1));
  els.nextSalesPageButton?.addEventListener("click", () => setSalesPage(state.salesPage + 1));
  els.previousSalesDateButton.addEventListener("click", () => shiftSalesDate(-1));
  els.nextSalesDateButton.addEventListener("click", () => shiftSalesDate(1));
  els.todaySalesDateButton.addEventListener("click", () => setSalesDate(getLocalDateKey()));
  els.salesList.addEventListener("click", (event) => {
    const detailButton = event.target.closest("[data-view-sale]");
    const deleteButton = event.target.closest("[data-delete-sale]");
    const restoreButton = event.target.closest("[data-restore-sale]");
    const printButton = event.target.closest("[data-print-sale]");
    const editButton = event.target.closest("[data-edit-sale]");
    if (printButton) {
      printSaleFromList(printButton.dataset.printSale);
      return;
    }
    if (editButton) {
      openSaleEditModal(editButton.dataset.editSale);
      return;
    }
    if (restoreButton) {
      restoreDeletedSale(restoreButton.dataset.restoreSale);
      return;
    }
    if (detailButton) {
      openSaleDetailModal(detailButton.dataset.viewSale);
      return;
    }
    if (deleteButton) {
      openDeleteSaleModal(deleteButton.dataset.deleteSale);
      return;
    }
    const card = event.target.closest("[data-sale-id]");
    if (card && !event.target.closest("button")) openSaleDetailModal(card.dataset.saleId);
  });
  els.salesList.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.target.closest("button, input, a")) return;
    const card = event.target.closest("[data-sale-id]");
    if (!card) return;
    event.preventDefault();
    openSaleDetailModal(card.dataset.saleId);
  });
  els.cancelDeleteSaleButton.addEventListener("click", closeDeleteSaleModal);
  els.confirmDeleteSaleButton.addEventListener("click", confirmDeleteSale);
  els.deleteSaleModal.addEventListener("click", (event) => {
    if (event.target === els.deleteSaleModal) {
      closeDeleteSaleModal();
    }
  });
  els.cancelDeleteProductButton.addEventListener("click", closeDeleteProductModal);
  els.confirmDeleteProductButton.addEventListener("click", confirmDeleteProduct);
  els.deleteProductModal.addEventListener("click", (event) => {
    if (event.target === els.deleteProductModal) {
      closeDeleteProductModal();
    }
  });
  els.deleteProductModal.addEventListener("close", () => {
    state.pendingDeleteProductId = null;
  });
  els.cancelAppConfirmButton.addEventListener("click", () => closeAppConfirm(false));
  els.confirmAppConfirmButton.addEventListener("click", () => closeAppConfirm(true));
  els.appConfirmModal.addEventListener("click", (event) => {
    if (event.target === els.appConfirmModal) {
      closeAppConfirm(false);
    }
  });
  els.appConfirmModal.addEventListener("close", () => resolveAppConfirm(false));
  els.printSaleDetailButton.addEventListener("click", printActiveSaleDetail);
  els.editSaleDetailButton.addEventListener("click", toggleSaleDetailEdit);
  els.saleDetailBody.addEventListener("input", (event) => {
    const form = event.target.closest("#saleEditForm");
    if (!form) return;
    if (event.target.matches("[data-sale-edit-money]")) {
      formatMoneyInput(event.target);
    }
    updateSaleEditTotalPreview(form);
  });
  els.saleDetailBody.addEventListener("change", (event) => {
    const form = event.target.closest("#saleEditForm");
    if (form) updateSaleEditTotalPreview(form);
  });
  els.saleDetailBody.addEventListener("click", (event) => {
    const addItemButton = event.target.closest("[data-add-sale-edit-item]");
    if (addItemButton) {
      const form = event.target.closest("#saleEditForm");
      const list = form?.querySelector("[data-sale-edit-item-list]");
      if (list) {
        list.insertAdjacentHTML("beforeend", renderSaleEditItemRow({ quantity: 1 }));
        updateSaleEditTotalPreview(form);
        list.querySelector("[data-sale-edit-item]:last-child input")?.focus();
      }
      return;
    }

    const removeItemButton = event.target.closest("[data-remove-sale-edit-item]");
    if (removeItemButton) {
      const form = event.target.closest("#saleEditForm");
      const rows = form ? [...form.querySelectorAll("[data-sale-edit-item]")] : [];
      if (rows.length <= 1) {
        setDatabaseStatus("Struk harus punya minimal satu item.");
        return;
      }
      removeItemButton.closest("[data-sale-edit-item]")?.remove();
      updateSaleEditTotalPreview(form);
      return;
    }

    if (!event.target.closest("[data-cancel-sale-edit]")) return;
    state.editingSaleDetail = false;
    renderSaleDetail(state.activeDetailSale);
    els.editSaleDetailButton.focus();
  });
  els.saleDetailBody.addEventListener("submit", (event) => {
    if (!event.target.matches("#saleEditForm")) return;
    event.preventDefault();
    saveSaleDetailEdit(event.target);
  });
  els.saleDetailModal.addEventListener("click", (event) => {
    if (event.target === els.saleDetailModal) {
      closeSaleDetailModal();
    }
  });
  els.saleDetailModal.addEventListener("close", () => {
    state.activeDetailSale = null;
    state.editingSaleDetail = false;
  });
  els.saveSheetButton.addEventListener("click", () => {
    saveSheetSettings();
    setSyncStatus("Pengaturan Google Sheet tersimpan. Tekan Sinkron Sekarang saat siap.");
  });
  els.syncSheetButton.addEventListener("click", () => syncGoogleSheet());
  els.autoSyncInput.addEventListener("change", () => {
    saveSheetSettings();
    setSyncStatus(state.sync.autoSync ? "Sinkron otomatis aktif. Data akan diperbarui saat online." : "Sinkron otomatis dijeda. Pakai Sinkron Sekarang jika perlu.");
  });

  [els.nameColumnInput, els.priceColumnInput, els.stockColumnInput, els.skuColumnInput].forEach((input) => {
    input.addEventListener("change", () => {
      saveColumnSettings();
      saveState();
    });
  });

  els.itemForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveProductForm();
  });

  els.itemPriceInput.addEventListener("input", () => {
    formatMoneyInput(els.itemPriceInput);
  });
  els.addVariantButton?.addEventListener("click", addEditingVariant);
  els.variantEditorList?.addEventListener("input", (event) => {
    const field = event.target.closest("[data-variant-field]");
    if (!field) return;
    const card = event.target.closest("[data-variant-index]");
    const index = Number(card?.dataset.variantIndex || 0);
    if (field.dataset.variantField === "price") formatMoneyInput(field);
    updateEditingVariant(index, field.dataset.variantField, field.type === "checkbox" ? field.checked : field.value, field.type, false);
  });
  els.variantEditorList?.addEventListener("change", (event) => {
    const field = event.target.closest("[data-variant-field]");
    if (!field) return;
    const card = event.target.closest("[data-variant-index]");
    const index = Number(card?.dataset.variantIndex || 0);
    updateEditingVariant(index, field.dataset.variantField, field.type === "checkbox" ? field.checked : field.value, field.type);
  });
  els.variantEditorList?.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-variant]");
    if (removeButton) removeEditingVariant(Number(removeButton.dataset.removeVariant || 0));
  });
  els.itemUnlimitedInput.addEventListener("change", syncManualStockInputState);
  els.cancelEditProductButton.addEventListener("click", () => {
    resetProductForm();
    setInventoryTab("list");
  });
  els.mergeDuplicateProductsButton.addEventListener("click", mergeDuplicateProducts);

  els.categoryFilter.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    state.selectedCategory = button.dataset.category;
    render();
  });

  els.productList.addEventListener("click", (event) => {
    const addButton = event.target.closest("[data-add]");
    const editButton = event.target.closest("[data-edit-product]");
    const deleteButton = event.target.closest("[data-delete-product]");
    if (addButton) addToCart(addButton.dataset.add, addButton.dataset.variant || "");
    if (editButton) startEditProduct(editButton.dataset.editProduct);
    if (deleteButton) openDeleteProductModal(deleteButton.dataset.deleteProduct);
  });

  els.cartList.addEventListener("click", (event) => {
    const decrease = event.target.closest("[data-decrease]");
    const increase = event.target.closest("[data-increase]");
    const remove = event.target.closest("[data-remove]");

    if (decrease) changeCartQuantity(decrease.dataset.decrease, -1);
    if (increase) changeCartQuantity(increase.dataset.increase, 1);
    if (remove) removeFromCart(remove.dataset.remove);
  });

  els.cartList.addEventListener("input", (event) => {
    const noteInput = event.target.closest("[data-note]");
    const priceInput = event.target.closest("[data-cart-price]");
    if (noteInput) updateCartItemNote(noteInput.dataset.note, noteInput.value);
    if (priceInput) {
      formatMoneyInput(priceInput);
      updateCartItemPrice(priceInput.dataset.cartPrice, priceInput.value, priceInput);
    }
  });

  els.cartList.addEventListener("change", (event) => {
    const changeVariant = event.target.closest("[data-change-variant]");
    if (changeVariant) {
      changeCartItemVariant(changeVariant.dataset.changeVariant, changeVariant.value);
    }
  });

  els.searchInput.addEventListener("input", renderProducts);

  els.clearCartButton.addEventListener("click", () => {
    state.cart = [];
    state.sale = getDefaultSaleState();
    renderSettings();
    render();
    showToast("Keranjang dikosongkan.", { title: "Keranjang", duration: 1400 });
  });

  els.mobileMiniCartButton.addEventListener("click", () => {
    document.querySelector(".panel-cart")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  els.holdCartButton.addEventListener("click", holdCurrentCart);
  els.openHeldCartsButton.addEventListener("click", openHeldCarts);
  els.heldCartsModal.addEventListener("click", (event) => {
    if (event.target === els.heldCartsModal) {
      els.heldCartsModal.close();
      return;
    }

    const resumeButton = event.target.closest("[data-resume-hold]");
    const deleteButton = event.target.closest("[data-delete-hold]");
    if (resumeButton) resumeHeldCart(resumeButton.dataset.resumeHold);
    if (deleteButton) deleteHeldCart(deleteButton.dataset.deleteHold);
  });

  els.clearInventoryButton.addEventListener("click", async () => {
    const confirmed = await openAppConfirm({
      eyebrow: "Kelola Barang",
      title: "Hapus semua barang?",
      message: "Semua barang dan isi keranjang di perangkat ini akan dihapus.",
      note: "Transaksi lama tetap tersimpan, tapi daftar barang perlu disinkron ulang.",
      confirmText: "Ya, hapus semua",
      variant: "danger",
    });
    if (!confirmed) return;
    state.products = [];
    state.cart = [];
    state.heldCarts = [];
    resetProductForm();
    setSyncStatus("Semua barang di perangkat ini sudah dihapus.");
    render();
    clearProductsInDatabase();
  });

  els.completeSaleButton.addEventListener("click", completeSale);
  els.salesDashboardModal.addEventListener("click", (event) => {
    if (event.target === els.salesDashboardModal) {
      els.salesDashboardModal.close();
    }
  });
  els.openInventoryModalButton.addEventListener("click", () => {
    const activePanel = document.querySelector(".tab-panel.active");
    const focusTarget = activePanel?.dataset.inventoryPanel === "manual" ? els.itemNameInput : 
                        activePanel?.dataset.inventoryPanel === "daily" ? els.dailyMenuCsvInput : 
                        activePanel?.dataset.inventoryPanel === "list" ? els.inventorySearchInput : 
                        els.sheetUrlInput;
    openModal(els.inventoryModal, focusTarget);
  });
  els.inventoryModal.addEventListener("click", (event) => {
    if (event.target === els.inventoryModal) {
      els.inventoryModal.close();
    }
  });
  els.inventoryTabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setInventoryTab(button.dataset.inventoryTab);
      const focusTarget = button.dataset.inventoryTab === "manual" ? els.itemNameInput : 
                          button.dataset.inventoryTab === "daily" ? els.dailyMenuCsvInput : 
                          button.dataset.inventoryTab === "list" ? els.inventorySearchInput : 
                          els.sheetUrlInput;
      if (focusTarget) focusTarget.focus();
    });
  });
  // Kelola Menu tab listeners
  els.addNewMenuButton.addEventListener("click", () => {
    resetProductForm();
    setInventoryTab("manual");
    els.itemNameInput.focus();
  });

  els.inventorySearchInput.addEventListener("input", () => {
    renderInventoryProductsList();
  });

  els.inventoryProductsList.addEventListener("click", (event) => {
    const editBtn = event.target.closest("[data-edit-inventory-product]");
    const deleteBtn = event.target.closest("[data-delete-inventory-product]");
    if (editBtn) {
      startEditProduct(editBtn.dataset.editInventoryProduct);
    } else if (deleteBtn) {
      openDeleteProductModal(deleteBtn.dataset.deleteInventoryProduct);
    }
  });

  els.openReceiptSettingsButton.addEventListener("click", () => {
    openModal(els.receiptSettingsModal, els.storeNameInput);
  });
  els.openPrinterSetupButton.addEventListener("click", () => {
    openModal(els.printerSetupModal, els.printerSetupTestPrintButton);
  });
  els.openPrinterSetupFromSettingsButton.addEventListener("click", () => {
    openModal(els.printerSetupModal, els.printerSetupTestPrintButton);
  });
  els.printerSetupModal.addEventListener("click", (event) => {
    if (event.target === els.printerSetupModal) {
      els.printerSetupModal.close();
    }
  });
  els.printerSetupTestPrintButton.addEventListener("click", () => {
    printSaleReceipt(getTestReceiptPayload());
  });
  els.receiptSettingsModal.addEventListener("click", (event) => {
    if (event.target === els.receiptSettingsModal) {
      els.receiptSettingsModal.close();
    }
  });
  els.openReceiptPreviewButton.addEventListener("click", () => {
    openReceiptPreview();
  });
  els.receiptPreviewModal.addEventListener("click", (event) => {
    if (event.target === els.receiptPreviewModal) {
      els.receiptPreviewModal.close();
    }
  });

  els.printReceiptButton.addEventListener("click", () => {
    printSaleReceipt();
  });

  els.printPreviewButton.addEventListener("click", (event) => {
    event.preventDefault();
    printSaleReceipt();
  });

  els.testPrintButton.addEventListener("click", () => {
    printSaleReceipt(getTestReceiptPayload());
  });

  els.customerNameInput.addEventListener("input", () => {
    updateSaleCustomerName(els.customerNameInput.value);
  });
  els.customerNameInput.addEventListener("change", () => {
    updateSaleCustomerName(els.customerNameInput.value, { forceDefaults: true });
  });

  els.shippingInput.addEventListener("input", () => {
    resetCheckoutWarnings();
    state.sale.shipping = parseIntegerInput(els.shippingInput.value);
    formatMoneyInput(els.shippingInput);
    render();
  });

  els.shippingInput.addEventListener("blur", () => {
    els.shippingInput.value = formatIntegerInput(state.sale.shipping);
  });

  els.paymentInput.addEventListener("change", () => {
    setPaymentMethod(els.paymentInput.value);
  });

  els.paymentSelectButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    setPaymentDropdownOpen(!els.paymentSelect.classList.contains("open"));
  });

  els.paymentOptionButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      setPaymentMethod(button.dataset.paymentOption);
    });
  });

  document.addEventListener("click", (event) => {
    if (els.paymentSelect && !els.paymentSelect.contains(event.target)) setPaymentDropdownOpen(false);
    if (els.salesCalendarPopover && !els.salesCalendarPopover.hidden && !event.target.closest(".sales-date-controls")) closeSalesCalendar();
    if (els.dailyMenuCalendarPopover && !els.dailyMenuCalendarPopover.hidden && !event.target.closest(".daily-menu-date-field")) closeDailyMenuCalendar();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setPaymentDropdownOpen(false);
    if (event.key === "Escape") closeSalesCalendar();
    if (event.key === "Escape") closeDailyMenuCalendar();
  });

  [els.storeNameInput, els.storeAddressInput, els.footerInput, els.receiptWidthInput, els.receiptFontSizeInput, els.printFlowInput, els.receiptModeInput, els.autoPrintInput].forEach((input) => {
    input.addEventListener("input", () => {
      state.settings.storeName = els.storeNameInput.value;
      state.settings.storeAddress = els.storeAddressInput.value;
      state.settings.footer = els.footerInput.value;
      state.settings.receiptWidth = els.receiptWidthInput.value;
      state.settings.receiptFontSize = els.receiptFontSizeInput.value;
      state.settings.printFlow = els.printFlowInput.value;
      state.settings.receiptMode = els.receiptModeInput.value;
      state.settings.autoPrint = els.autoPrintInput.checked;
      render();
    });
  });

  window.addEventListener("online", () => {
    refreshTodayDateIfChanged();
    updateConnectionUI();
    if (state.sync.autoSync && state.sync.sheetUrl) syncGoogleSheet({ silent: true });
  });

  window.addEventListener("offline", updateConnectionUI);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshTodayDateIfChanged();
    if (document.visibilityState !== "visible" || !state.sync.autoSync || !state.sync.sheetUrl) return;
    const lastSyncTime = state.sync.lastSyncAt ? new Date(state.sync.lastSyncAt).getTime() : 0;
    if (Date.now() - lastSyncTime > SYNC_INTERVAL_MS) syncGoogleSheet({ silent: true });
  });

  window.setInterval(refreshTodayDateIfChanged, 60000);
  window.setInterval(checkBackendConnection, 15000);
}

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("service-worker.js").then((reg) => {
    reg.addEventListener("updatefound", () => {
      const newWorker = reg.installing;
      if (newWorker) {
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            console.log("Pembaruan aplikasi terdeteksi, memuat ulang halaman...");
            window.location.reload();
          }
        });
      }
    });
  }).catch(() => {
    console.info("Service worker registration skipped.");
  });

  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}

loadState();
applyTheme();
renderSettings();
setupModalScrollLock();
syncManualStockInputState();
bindEvents();
render();
renderSalesDashboard();
updateConnectionUI();
startAutoSync();
loadProductsFromDatabase({ toast: false });
loadSalesDashboard();

// === CATATAN PIUTANG & DEPOSIT MANAGEMENT ===

function openPiutangManager() {
  if (els.piutangSearchInput) {
    els.piutangSearchInput.value = "";
    state.piutang.search = "";
  }

  switchPiutangTab("belum_lunas", els.tabPiutangBelumLunas);
  openModal(els.piutangModal, els.piutangSearchInput);
  loadPiutangData();
}

async function loadPiutangData(options = {}) {
  const { toast = false } = options;
  setPiutangStatus("Memuat data piutang...");

  try {
    const salesData = await dbFetchSales({ limit: 1000, includeDeleted: false });
    if (salesData && Array.isArray(salesData.sales)) {
      state.sales = prepareSalesForSearch(salesData.sales);
      invalidateCustomerProfilesCache();
    }

    await loadCustomers({ toast: false });

    renderPiutangList();
    setPiutangStatus("");
    if (toast) showToast("Data piutang dan deposit dimuat ulang.");
  } catch (error) {
    console.error("Error loading piutang data:", error);
    setPiutangStatus(`Gagal memuat data piutang: ${error.message}`);
    if (toast) showToast(`Gagal memuat: ${error.message}`);
  }
}

function setPiutangStatus(message) {
  if (!els.piutangStatus) return;
  els.piutangStatus.textContent = message;
  els.piutangStatus.hidden = !message;
}

function switchPiutangTab(tabName, activeBtn) {
  state.piutang.tab = tabName;

  [els.tabPiutangBelumLunas, els.tabPiutangLunas, els.tabPiutangSemua].forEach(btn => {
    if (btn) btn.classList.remove("active");
  });

  if (activeBtn) activeBtn.classList.add("active");
  renderPiutangList();
}

function renderPiutangList() {
  if (!els.piutangList) return;

  const tab = state.piutang.tab;
  const search = (state.piutang.search || "").trim().toLowerCase();

  let filtered = state.sales.filter(sale => {
    if (sale.deleted_at || sale.deletedAt) return false;

    const remaining = Number(sale.total || 0) - Number(sale.paid_amount || 0);
    const isLunas = remaining <= 0;

    if (tab === "belum_lunas" && isLunas) return false;
    if (tab === "lunas" && !isLunas) return false;

    return true;
  });

  if (search) {
    filtered = filtered.filter(sale => {
      const name = String(sale.customer_name || sale.customerName || "").toLowerCase();
      const receiptNo = String(sale.receipt_no || sale.receiptNo || "").toLowerCase();
      return name.includes(search) || receiptNo.includes(search);
    });
  }

  const allBelumLunasSales = state.sales.filter(sale => {
    if (sale.deleted_at || sale.deletedAt) return false;
    return (Number(sale.total || 0) - Number(sale.paid_amount || 0)) > 0;
  });

  const totalPiutangAmount = allBelumLunasSales.reduce((acc, sale) => {
    return acc + (Number(sale.total || 0) - Number(sale.paid_amount || 0));
  }, 0);

  if (els.piutangTotalBadge) {
    els.piutangTotalBadge.textContent = `Total Piutang: ${currency.format(totalPiutangAmount)}`;
    els.piutangTotalBadge.classList.toggle("lunas", totalPiutangAmount <= 0);
  }

  if (!filtered.length) {
    els.piutangList.innerHTML = `
      <div class="empty-state">
        <p>Tidak ada data piutang yang cocok.</p>
      </div>
    `;
    return;
  }

  els.piutangList.innerHTML = filtered.map(sale => {
    const total = Number(sale.total || 0);
    const paid = Number(sale.paid_amount || 0);
    const remaining = total - paid;
    const isLunas = remaining <= 0;
    const items = Array.isArray(sale.items) ? sale.items : [];
    const payments = Array.isArray(sale.payments) ? sale.payments : [];

    const dateStr = sale.completed_at || sale.completedAt || "";
    const formattedDate = dateStr ? new Date(dateStr).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }) : "-";

    const itemRowsHtml = items.map(item => `
      <div class="piutang-card-item-row">
        <span><span class="item-qty">${item.quantity}x</span> ${escapeHtml(item.name)}</span>
        <span>${currency.format(Number(item.price || 0) * Number(item.quantity || 0))}</span>
      </div>
    `).join("");

    const paymentRowsHtml = payments.map(pay => {
      const payDate = pay.payment_date || pay.paymentDate || pay.created_at || "";
      const formattedPayDate = payDate ? new Date(payDate).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      }) : "-";

      const isDeposit = pay.note && (pay.note.includes("Deposit") || pay.note.includes("deposit"));
      const logClass = isDeposit ? "payment-log-row deposit-type" : "payment-log-row";
      const noteCopy = pay.note ? ` (${escapeHtml(pay.note)})` : "";

      return `
        <div class="${logClass}">
          <span>${escapeHtml(formattedPayDate)}${noteCopy}</span>
          <strong>+ ${currency.format(pay.amount)}</strong>
        </div>
      `;
    }).join("");

    const payFormHtml = isLunas ? `
      <div class="piutang-revoke-action">
        <button class="ghost-button danger piutang-revoke-button" type="button" data-revoke-sale-id="${sale.id}">
          Ubah ke Belum Lunas
        </button>
      </div>
    ` : `
      <form class="piutang-pay-form" data-sale-id="${sale.id}">
        <label>
          Input Pembayaran
          <input class="piutang-payment-input" type="text" inputmode="numeric" pattern="[0-9.]*" placeholder="Contoh: 50.000" autocomplete="off" required>
        </label>
        <button class="primary-button" type="submit">Simpan</button>
      </form>
    `;

    return `
      <article class="piutang-card" id="piutangCard-${sale.id}">
        <div class="piutang-card-header">
          <div class="piutang-card-title-group">
            <h3 class="piutang-card-title">${escapeHtml(sale.receipt_no || sale.receiptNo || "")}</h3>
            <span class="piutang-card-date">${formattedDate}</span>
          </div>
          <span class="piutang-status-pill ${isLunas ? 'paid' : 'unpaid'}">${isLunas ? 'Lunas' : 'Belum Lunas'}</span>
        </div>

        <div class="piutang-card-body">
          <div class="piutang-cust-info">
            <strong>${escapeHtml(sale.customer_name || sale.customerName || "Tanpa Nama")}</strong>
            <p>${escapeHtml(sale.customer_address || sale.customerAddress || "Tidak ada alamat")}</p>

            <div class="piutang-card-items-detail" id="piutangItems-${sale.id}">
              ${itemRowsHtml || "<p>Tidak ada rincian item barang.</p>"}
            </div>
          </div>

          <div class="piutang-financial-summary">
            <div class="piutang-financial-row">
              <span>Total Transaksi</span>
              <strong>${currency.format(total)}</strong>
            </div>
            <div class="piutang-financial-row">
              <span>Sudah Dibayar</span>
              <strong>${currency.format(paid)}</strong>
            </div>
            <div class="piutang-financial-row debt ${isLunas ? 'lunas' : ''}">
              <span>Sisa Tagihan</span>
              <strong>${currency.format(remaining)}</strong>
            </div>
          </div>
        </div>

        ${payments.length ? `
          <div class="piutang-payment-logs">
            <h4 class="piutang-payment-title">Riwayat Pembayaran:</h4>
            ${paymentRowsHtml}
          </div>
        ` : ""}

        ${payFormHtml}
      </article>
    `;
  }).join("");

  els.piutangList.querySelectorAll(".piutang-payment-input").forEach(input => {
    input.addEventListener("input", () => {
      input.value = formatIntegerInput(input.value);
    });
  });
}

async function dbSubmitPiutangPayment(saleId, amount) {
  if (state.settings.dbMode === "supabase") {
    const supabase = getSupabaseClient();
    
    const { data: sale, error: getSaleError } = await supabase
      .from("sales")
      .select("*")
      .eq("id", saleId)
      .single();
      
    if (getSaleError) throw getSaleError;
    
    const remainingDebt = Number(sale.total || 0) - Number(sale.paid_amount || 0);
    if (remainingDebt <= 0) {
      throw new Error("Transaksi ini sudah lunas.");
    }
    
    const amountToApply = Math.min(amount, remainingDebt);
    const depositToAdd = amount - amountToApply;
    const newPaidAmount = Number(sale.paid_amount || 0) + amountToApply;
    
    let note = "Pembayaran Cicilan";
    if (depositToAdd > 0) {
      note = `Bayar Rp ${amount.toLocaleString('id-ID')} (Kelebihan Rp ${depositToAdd.toLocaleString('id-ID')} masuk deposit)`;
    }
    
    const { error: paymentError } = await supabase
      .from("sale_payments")
      .insert({
        sale_id: saleId,
        amount: amount,
        payment_date: new Date().toISOString(),
        note: note
      });
    if (paymentError) throw paymentError;
    
    const { error: updateSaleError } = await supabase
      .from("sales")
      .update({ paid_amount: newPaidAmount })
      .eq("id", saleId);
    if (updateSaleError) throw updateSaleError;
    
    if (depositToAdd > 0 && sale.customer_name) {
      const { data: customer, error: getCustError } = await supabase
        .from("customers")
        .select("*")
        .eq("name", sale.customer_name)
        .single();
        
      if (!getCustError && customer) {
        const newBalance = Number(customer.deposit_balance || 0) + depositToAdd;
        await supabase
          .from("customers")
          .update({ deposit_balance: newBalance, updated_at: new Date().toISOString() })
          .eq("id", customer.id);
      } else {
        await supabase
          .from("customers")
          .insert({
            name: sale.customer_name,
            deposit_balance: depositToAdd,
            last_order_at: ""
          });
      }
    }
    
    return { ok: true };
  } else {
    return requestJson(`/api/sales/${encodeURIComponent(saleId)}/payments`, {
      method: "POST",
      body: JSON.stringify({
        amount: amount,
        paymentDate: new Date().toISOString()
      })
    });
  }
}

async function dbRevokePiutangPayment(saleId) {
  if (state.settings.dbMode === "supabase") {
    const supabase = getSupabaseClient();
    
    const { data: sale, error: getSaleError } = await supabase
      .from("sales")
      .select("*")
      .eq("id", saleId)
      .single();
    if (getSaleError) throw getSaleError;
    
    const { data: payments, error: getPaymentsError } = await supabase
      .from("sale_payments")
      .select("*")
      .eq("sale_id", saleId);
    if (getPaymentsError) throw getPaymentsError;
    
    let depositAdjustment = 0;
    for (const pay of (payments || [])) {
      const note = pay.note || "";
      const amt = Number(pay.amount || 0);
      if (note === "Otomatis Potong Deposit") {
        depositAdjustment += amt;
      } else if (note.includes("Kelebihan Rp")) {
        const cleanNote = note.replace(/\./g, "").replace(/,/g, "");
        const match = cleanNote.match(/Kelebihan Rp\s*(\d+)/);
        if (match) {
          const excess = parseInt(match[1], 10);
          if (!isNaN(excess)) {
            depositAdjustment -= excess;
          }
        }
      }
    }
    
    if (sale.customer_name && depositAdjustment !== 0) {
      const { data: customer, error: getCustError } = await supabase
        .from("customers")
        .select("*")
        .eq("name", sale.customer_name)
        .single();
        
      if (!getCustError && customer) {
        const newBalance = Math.max(0, Number(customer.deposit_balance || 0) + depositAdjustment);
        await supabase
          .from("customers")
          .update({ deposit_balance: newBalance, updated_at: new Date().toISOString() })
          .eq("id", customer.id);
      }
    }
    
    const { error: delError } = await supabase.from("sale_payments").delete().eq("sale_id", saleId);
    if (delError) throw delError;
    
    const { error: updError } = await supabase.from("sales").update({ paid_amount: 0 }).eq("id", saleId);
    if (updError) throw updError;
    
    return { ok: true };
  } else {
    return requestJson(`/api/sales/${encodeURIComponent(saleId)}/revoke-lunas`, {
      method: "POST"
    });
  }
}

async function submitPiutangPayment(form) {
  const saleId = form.dataset.saleId;
  const input = form.querySelector(".piutang-payment-input");
  const amount = parseIntegerInput(input.value);
  const submitBtn = form.querySelector("button[type='submit']");

  if (amount <= 0) {
    showToast("Nominal pembayaran tidak valid.");
    return;
  }

  submitBtn.disabled = true;
  setPiutangStatus("Menyimpan pembayaran...");

  try {
    const response = await dbSubmitPiutangPayment(saleId, amount);

    if (response.ok) {
      showToast("Pembayaran cicilan berhasil disimpan.");
      await loadPiutangData();
      await loadSalesDashboard();
      await loadCustomers({ toast: false });
    }
  } catch (error) {
    console.error("Error submitting piutang payment:", error);
    showToast(`Gagal menyimpan: ${error.message}`);
    setPiutangStatus(`Error: ${error.message}`);
  } finally {
    submitBtn.disabled = false;
  }
}

async function revokePiutangPayment(saleId) {
  const confirmed = await openAppConfirm({
    eyebrow: "Batalkan Status Lunas",
    title: "Ubah Kembali ke Belum Lunas?",
    message: "Apakah kamu yakin ingin membatalkan status lunas transaksi ini dan mengembalikannya ke Belum Lunas?",
    note: "Semua riwayat pembayaran (cicilan) untuk transaksi ini akan dihapus dari sistem, dan saldo deposit customer akan disesuaikan otomatis.",
    confirmText: "Ya, Batalkan Lunas",
    variant: "danger",
  });
  if (!confirmed) return;

  setPiutangStatus("Membatalkan status lunas...");

  try {
    const response = await dbRevokePiutangPayment(saleId);

    if (response.ok) {
      showToast("Status pembayaran dikembalikan ke Belum Lunas.");
      await loadPiutangData();
      await loadSalesDashboard();
      await loadCustomers({ toast: false });
    }
  } catch (error) {
    console.error("Error revoking piutang payment:", error);
    showToast(`Gagal membatalkan lunas: ${error.message}`);
    setPiutangStatus(`Error: ${error.message}`);
  } finally {
    setPiutangStatus("");
  }
}

async function migrateDataToSupabase() {
  const confirmed = await openAppConfirm({
    eyebrow: "Migrasi Database",
    title: "Migrasi Data ke Supabase Cloud?",
    message: "Apakah kamu yakin ingin memigrasikan semua data lokal (Barang, Pelanggan, dan Transaksi Penjualan beserta Pembayaran) ke Supabase Cloud?",
    note: "Data di Supabase Cloud saat ini akan ditimpa atau digabungkan. Pastikan koneksi internet stabil selama proses berlangsung.",
    confirmText: "Ya, Mulai Migrasi",
    variant: "warning",
  });
  
  if (!confirmed) return;
  
  console.log("Memulai migrasi database ke Supabase Cloud...");
  showToast("Menghubungkan Supabase...", { duration: 2000 });
  
  try {
    const supabase = getSupabaseClient();
    
    // 1. Ambil data lokal
    console.log("Membaca data lokal...");
    
    let localProducts = [];
    try {
      const prodRes = await requestJson("/api/products");
      localProducts = Array.isArray(prodRes.products) ? prodRes.products : state.products;
    } catch (e) {
      localProducts = state.products;
    }
    
    let localCustomers = [];
    try {
      const custRes = await requestJson("/api/customers?limit=10000");
      localCustomers = Array.isArray(custRes.customers) ? custRes.customers : [];
    } catch (e) {
      console.warn("Gagal membaca customer lokal:", e);
    }
    
    let localSales = [];
    try {
      const salesRes = await requestJson("/api/sales?limit=10000&includeDeleted=1");
      localSales = Array.isArray(salesRes.sales) ? salesRes.sales : [];
    } catch (e) {
      console.warn("Gagal membaca sales lokal:", e);
    }
    
	    // 2. Migrasikan Products
	    localProducts = normalizeProductsCollection(localProducts);
	    console.log(`Mengirim ${localProducts.length} barang...`);
	    if (localProducts.length > 0) {
      const dbProducts = localProducts.map(p => ({
        client_id: p.id || p.client_id,
        sku: p.sku || "",
        name: p.name,
        price: p.price || 0,
        stock: p.stock || 0,
        stock_unlimited: p.stockUnlimited ? 1 : 0,
        category: p.category || "",
        aliases: JSON.stringify(p.aliases || []),
        source: p.source || "manual",
        updated_at: new Date().toISOString()
      }));
	      const { error } = await supabase.from("products").upsert(dbProducts, { onConflict: "client_id" });
	      if (error) throw new Error(`Gagal migrasi produk: ${error.message}`);
	      const dbVariants = localProducts.flatMap((product) =>
	        getProductVariants(product).map((variant, index) => ({
	          client_id: variant.id,
	          product_client_id: product.id,
	          name: variant.name || "Normal",
	          pricing_type: normalizePricingType(variant.pricingType),
	          price: Number(variant.price || 0),
	          unit_name: variant.unitName || "porsi",
	          package_quantity: Number(variant.packageQuantity || 1),
	          package_unit: variant.packageUnit || variant.unitName || "porsi",
	          receipt_label: variant.receiptLabel || "",
	          is_default: variant.isDefault ? 1 : 0,
	          allow_quantity_override: variant.allowQuantityOverride ? 1 : 0,
	          allow_price_override: variant.allowPriceOverride ? 1 : 0,
	          stock: Number(variant.stock || 0),
	          stock_unlimited: variant.stockUnlimited ? 1 : 0,
	          aliases: JSON.stringify(variant.aliases || []),
	          sort_order: index,
	          active: variant.active === false ? 0 : 1,
	          updated_at: new Date().toISOString()
	        }))
	      );
	      if (dbVariants.length) {
	        const { error: variantError } = await supabase.from("product_variants").upsert(dbVariants, { onConflict: "client_id" });
	        if (variantError) throw new Error(`Gagal migrasi variasi produk: ${variantError.message}`);
	      }
	    }
    
    // 3. Migrasikan Customers & Aliases
    console.log(`Mengirim ${localCustomers.length} pelanggan...`);
    if (localCustomers.length > 0) {
      const dbCustomers = localCustomers.map(c => ({
        id: c.id,
        name: c.name,
        default_shipping: c.default_shipping || 0,
        last_order_at: c.last_order_at || "",
        deposit_balance: c.deposit_balance || 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));
      
      const { error: custError } = await supabase.from("customers").upsert(dbCustomers);
      if (custError) throw new Error(`Gagal migrasi customer: ${custError.message}`);
      
      const dbAliases = [];
      localCustomers.forEach(c => {
        if (Array.isArray(c.aliases)) {
          c.aliases.forEach(alias => {
            dbAliases.push({
              customer_id: c.id,
              alias: alias,
              alias_key: normalizeKey(alias)
            });
          });
        }
      });
      
      if (dbAliases.length > 0) {
        await supabase.from("customer_aliases").delete().neq("id", 0);
        const { error: aliasError } = await supabase.from("customer_aliases").insert(dbAliases);
        if (aliasError) throw new Error(`Gagal migrasi customer alias: ${aliasError.message}`);
      }
    }
    
    // 4. Migrasikan Sales & Items & Payments
    console.log(`Mengirim ${localSales.length} transaksi...`);
    
    if (localSales.length > 0) {
      const idMap = new Map();
      const allDbItems = [];
      const allDbPayments = [];
      
      for (let i = 0; i < localSales.length; i++) {
        const sale = localSales[i];
        console.log(`Memproses transaksi (${i + 1}/${localSales.length})...`);
        
        const saleRecord = {
          receipt_no: sale.receiptNo || sale.receipt_no,
          completed_at: sale.completedAt || sale.completed_at,
          store_name: sale.storeName || sale.store_name,
          payment: sale.payment,
          subtotal: sale.subtotal || 0,
          discount: sale.discount || 0,
          tax: sale.tax || 0,
          total: sale.total || 0,
          customer_name: sale.customerName || sale.customer_name || "",
          customer_address: sale.customerAddress || sale.customer_address || "",
          order_note: sale.orderNote || sale.order_note || "",
          due_text: sale.dueText || sale.due_text || "",
          chat_date: sale.chatDate || sale.chat_date || "",
          deleted_at: sale.deletedAt || sale.deleted_at || null,
          stock_restored_on_delete: sale.stockRestoredOnDelete || sale.stock_restored_on_delete || 0,
          paid_amount: sale.paidAmount || sale.paid_amount || 0,
          created_at: sale.completedAt || sale.completed_at || new Date().toISOString()
        };
        
        const { data: insertedSale, error: saleError } = await supabase
          .from("sales")
          .insert(saleRecord)
          .select("id")
          .single();
          
        if (saleError) {
          console.error(`Gagal mengirim transaksi ${saleRecord.receipt_no}:`, saleError);
          if (saleError.code === "23505") { // Duplicate key
            const { data: existing } = await supabase
              .from("sales")
              .select("id")
              .eq("receipt_no", saleRecord.receipt_no)
              .single();
            if (existing) {
              idMap.set(sale.id, existing.id);
            }
          } else {
            throw new Error(`Gagal mengirim transaksi: ${saleError.message}`);
          }
        } else if (insertedSale) {
          idMap.set(sale.id, insertedSale.id);
        }
        
        const newSaleId = idMap.get(sale.id);
        if (newSaleId) {
          const items = sale.items || [];
          items.forEach(item => {
            allDbItems.push({
              sale_id: newSaleId,
              sku: item.sku || "",
	              name: item.name,
	              price: item.price || 0,
	              quantity: item.quantity || 0,
	              line_total: item.lineTotal || item.line_total || 0,
	              note: item.note || "",
	              product_client_id: item.productClientId || item.product_client_id || "",
	              variant_client_id: item.variantId || item.variantClientId || item.variant_client_id || "",
	              menu_name: item.menuName || item.menu_name || item.name || "",
	              variant_name: item.variantName || item.variant_name || "",
	              unit_name: item.unitName || item.unit_name || "",
	              unit_quantity: Number(item.unitQuantity || item.unit_quantity || 0),
	              pricing_type: item.pricingType || item.pricing_type || "",
	              receipt_label: item.receiptLabel || item.receipt_label || ""
	            });
          });
          
          const payments = sale.payments || [];
          payments.forEach(pay => {
            allDbPayments.push({
              sale_id: newSaleId,
              amount: pay.amount || 0,
              payment_date: pay.paymentDate || pay.payment_date || new Date().toISOString(),
              note: pay.note || "",
              created_at: pay.createdAt || pay.created_at || new Date().toISOString()
            });
          });
        }
      }
      
      if (allDbItems.length > 0) {
        console.log(`Mengirim ${allDbItems.length} detail barang transaksi...`);
        const chunkSize = 200;
        for (let i = 0; i < allDbItems.length; i += chunkSize) {
          const chunk = allDbItems.slice(i, i + chunkSize);
          try {
            await insertSupabaseSaleItems(supabase, chunk);
          } catch (itemsError) {
            throw new Error(`Gagal migrasi detail barang: ${itemsError.message}`);
          }
        }
      }
      
      if (allDbPayments.length > 0) {
        console.log(`Mengirim ${allDbPayments.length} riwayat pembayaran...`);
        const chunkSize = 200;
        for (let i = 0; i < allDbPayments.length; i += chunkSize) {
          const chunk = allDbPayments.slice(i, i + chunkSize);
          const { error: paymentsError } = await supabase.from("sale_payments").insert(chunk);
          if (paymentsError) throw new Error(`Gagal migrasi pembayaran: ${paymentsError.message}`);
        }
      }
    }
    
    showToast("Migrasi data ke Supabase Cloud sukses total! Selamat database cloud kamu sudah terisi.", { variant: "success" });
  } catch (error) {
    console.error("Migration error:", error);
    showToast(`Migrasi gagal di tengah jalan: ${error.message}`, { variant: "error" });
  }
}

window.migrateDataToSupabase = migrateDataToSupabase;
