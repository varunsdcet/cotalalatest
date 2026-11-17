import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useLocation } from "wouter";
import { Check, ChevronDown, ChevronRight, Download, Loader2, Smile, X } from "lucide-react";
import { QRCode } from "react-qrcode-logo";
import lightLogo from "@/pages/images/logos/light-logo.svg";
import whiteBackImg from "@/pages/images/whiteback.png";
import royalLePageImg from "@/pages/images/royal-lepage.png";
import { normalizeCssColor } from "@/lib/normalize-css-color";
import { buildPrintColorProfilePayload } from "@/lib/print-color-profile";
import {
  getPrintProductDetails,
  OVERSIZE_FEATURE_SHEET_PRINT_PRODUCT_ID,
  placeOversizePrintOrder,
  type PrintInventoryStockRow,
  type PrintProductRow,
} from "@/lib/api";
import {
  compactFeatureListingSnapshotForStorage,
  FeatureListingPage4Static,
  FEATURE_LISTING_SNAPSHOT_SAVED_EVENT,
  featureSheetP2BodyText,
  featureSheetPublicRemarksBody,
  pickCotalaFooterLogoForTextColor,
  readFeatureListingFinalSnapshot,
  readFeatureSheetAgentBrokerageLogoUrl,
  type FeatureListingFinalSnapshot,
} from "./feature-listing-preview";
import { downloadOversizePdfViaApi, submitOversizePdfViaApi } from "@/lib/oversize-pdf-api";
import "./oversize-feature-sheets-order.css";

type OversizePdfInnerPayloadSource = {
  listingSnapshot: FeatureListingFinalSnapshot;
  images: {
    coverImage: string;
    primaryImages: string[];
    secondaryImages: string[];
  };
  theme: unknown;
  components: unknown;
  pages: unknown;
  tour: unknown;
  derivedContent: unknown;
  order: unknown;
  product: unknown;
  assets: unknown;
  output: unknown;
  schemaVersion: unknown;
  generatedAt: unknown;
};

function buildOversizePdfInnerPayload(pdfBuildJsonPayload: OversizePdfInnerPayloadSource): Record<string, unknown> {
  return {
    listingSnapshot: pdfBuildJsonPayload.listingSnapshot,
    images: pdfBuildJsonPayload.images,
    theme: pdfBuildJsonPayload.theme,
    components: pdfBuildJsonPayload.components,
    pages: pdfBuildJsonPayload.pages,
    tour: pdfBuildJsonPayload.tour,
    derivedContent: pdfBuildJsonPayload.derivedContent,
    order: pdfBuildJsonPayload.order,
    product: pdfBuildJsonPayload.product,
    assets: pdfBuildJsonPayload.assets,
    output: pdfBuildJsonPayload.output,
    schemaVersion: pdfBuildJsonPayload.schemaVersion,
    generatedAt: pdfBuildJsonPayload.generatedAt,
  };
}

function stocksForPrintProduct(
  product: PrintProductRow,
  stocks: PrintInventoryStockRow[],
): PrintInventoryStockRow[] {
  const opt = (product.optionalstock ?? "").trim();
  if (opt) {
    const ids = new Set(
      opt
        .split(/[\s,]+/)
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !Number.isNaN(n)),
    );
    const filtered = stocks.filter((s) => ids.has(s.id));
    return filtered.length > 0 ? filtered : stocks;
  }
  const d = parseInt((product.defaultstock ?? "").trim(), 10);
  if (!Number.isNaN(d)) {
    const row = stocks.find((s) => s.id === d);
    return row ? [row] : stocks;
  }
  return stocks;
}

function glossStockOptions(stocks: PrintInventoryStockRow[]): PrintInventoryStockRow[] {
  const match100 = stocks.filter((s) => /100\s*lb/i.test(s.name) && /gloss/i.test(s.name));
  const match111 = stocks.filter((s) => /111\s*lb/i.test(s.name) && /gloss/i.test(s.name));
  const picked: PrintInventoryStockRow[] = [];
  const seen = new Set<number>();
  for (const row of [...match100, ...match111]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    picked.push(row);
  }
  if (picked.length > 0) return picked;
  const anyGloss = stocks.filter((s) => /gloss/i.test(s.name));
  return anyGloss.length > 0 ? anyGloss : FALLBACK_GLOSS_STOCKS;
}

function getTourIdFromSearch(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return params.get("id")?.trim() ?? "";
}

/** Must match `FEATURE_LISTING_CACHE_PREFIX` in feature-listing.tsx (v2 bump). */
const FEATURE_LISTING_CACHE_PREFIX = "cotala_feature_listing_cache_v2_";

/** So `/feature-listing` restores from sessionStorage and skips full reload (same shape as editor autosave). */
function seedFeatureListingSessionCacheFromSnapshot(
  tourId: string,
  snap: FeatureListingFinalSnapshot,
): void {
  if (!tourId.trim()) return;
  const cacheKey = `${FEATURE_LISTING_CACHE_PREFIX}${tourId}`;
  const desc =
    snap.listingDescription && snap.listingDescription.length > 8000
      ? `${snap.listingDescription.slice(0, 8000)}…`
      : snap.listingDescription;
  const compacted = compactFeatureListingSnapshotForStorage(snap);
  const fallbackBrokerLogo = readFeatureSheetAgentBrokerageLogoUrl();
  const payload = {
    coverImage: snap.coverImage,
    primaryImages: snap.primaryImages.slice(0, 12),
    secondaryImages: snap.secondaryImages.slice(0, 12),
    listingAddress: snap.listingAddress,
    mlsNumber: null as string | null,
    agentName: snap.agentName,
    agentPhone: snap.agentPhone,
    agentEmail: snap.agentEmail,
    agentWebsite: snap.agentWebsite,
    brokerage: "",
    listingDescription: desc,
    price: snap.price,
    style: "",
    tax: snap.tax,
    maintFee: snap.maintFee,
    size: snap.size,
    bedrooms: snap.bedrooms,
    bathrooms: snap.bathrooms,
    mainFloorSqft: "",
    balconySqft: "",
    totalLivable: "",
    totalExtras: "",
    pageBgColor: snap.pageBgColor,
    pageTextColor: snap.pageTextColor,
    agentHeadshot: snap.agentHeadshot,
    agentLogo: snap.agentLogo?.trim() || fallbackBrokerLogo || null,
    scrapeData: compacted.scrapeData,
  };
  try {
    const json = JSON.stringify(payload);
    sessionStorage.setItem(cacheKey, json);
  } catch {
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k?.startsWith(FEATURE_LISTING_CACHE_PREFIX) && k !== cacheKey) {
          try {
            sessionStorage.removeItem(k);
          } catch {
            /* ignore */
          }
        }
      }
      sessionStorage.setItem(cacheKey, JSON.stringify(payload));
    } catch (e) {
      console.error("seedFeatureListingSessionCacheFromSnapshot", e);
    }
  }
}

function readFeatureListingSessionCache(tourId: string): FeatureListingFinalSnapshot | null {
  try {
    const raw = sessionStorage.getItem(`${FEATURE_LISTING_CACHE_PREFIX}${tourId}`);
    if (!raw) return null;
    const c = JSON.parse(raw) as Partial<FeatureListingFinalSnapshot> & {
      listingPhotos?: string[];
      mlsNumber?: string | null;
      brokerage?: string;
      style?: string;
      mainFloorSqft?: string;
      balconySqft?: string;
      totalLivable?: string;
      totalExtras?: string;
    };
  
    return {
      version: 1,
      tourId,
      pageBgColor: c.pageBgColor ?? "#ffffff",
      pageTextColor: c.pageTextColor ?? "#374151",
      listingAddress: c.listingAddress ?? "",
      coverImage: c.coverImage ?? "",
      primaryImages: Array.isArray(c.primaryImages) ? c.primaryImages : [],
      secondaryImages: Array.isArray(c.secondaryImages) ? c.secondaryImages : [],
      agentName: c.agentName ?? "Janice Bruni",
      agentPhone: c.agentPhone ?? "604-825-4046",
      agentEmail: c.agentEmail ?? "janice@janicebruni.com",
      agentWebsite: c.agentWebsite ?? "www.janicebruni.com",
      agentHeadshot: c.agentHeadshot ?? null,
      agentLogo:
        (typeof c.agentLogo === "string" && c.agentLogo.trim()
          ? c.agentLogo.trim()
          : readFeatureSheetAgentBrokerageLogoUrl()) ?? null,
      price: c.price ?? null,
      listingDescription: c.listingDescription ?? null,
      maintFee: c.maintFee ?? "",
      size: c.size ?? "",
      bedrooms: c.bedrooms ?? "",
      bathrooms: c.bathrooms ?? "",
      tax: c.tax ?? "",
      scrapeData: c.scrapeData ?? null,
    };
  } catch {
    return null;
  }
}

/** Quantity → CAD total (25 / 50 / 75 / 100 / 250). */
const oversizeBaseTotals: Record<string, number> = {
  "25": 45,
  "50": 70,
  "75": 91.05,
  "100": 109.6,
  "250": 198.25,
};

const FALLBACK_GLOSS_STOCKS: PrintInventoryStockRow[] = [
  { id: -100, name: "100 lb glossy paper", description: "100 lb glossy paper" },
  { id: -111, name: "111 lb gloss paper", description: "111 lb gloss paper" },
];

/**
 * Each sheet: 1632×1056px white frame; safe content 1580×1004 (26px inset) — see `oversize-feature-sheets-order.css`.
 */
const printPageFrameStyle = (textColor: string): CSSProperties => ({
  color: textColor,
});
/** MLS / description column vs cover / hero column — one row fills full 11″ page height */
const oversizeSpreadGridCols =
  "grid h-full min-h-0 grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-0";

/** Right column (cover / gallery): brand bg + profile text colour */
const oversizeRightColumnStyle = (bg: string, textColor: string): CSSProperties => ({
  backgroundColor: bg,
  color: textColor,
});

const OversizeMiddlePreview = forwardRef<HTMLDivElement, { data: FeatureListingFinalSnapshot }>(
  function OversizeMiddlePreview({ data }, ref) {
  const pageBgColor = normalizeCssColor(data.pageBgColor ?? "#ffffff");
  const pageTextColor = normalizeCssColor(data.pageTextColor ?? "#374151");
  const oversizeP2Body = featureSheetP2BodyText(data.listingDescription, data.scrapeData ?? null);
  const oversizePublicRemarks = featureSheetPublicRemarksBody(
    data.listingDescription,
    data.scrapeData ?? null,
  );
  /** Same as feature sheet P2: public remarks first, else tour description / legal. */
  const oversizeP2SheetBlockText = oversizePublicRemarks || oversizeP2Body;

  const pageFrame = printPageFrameStyle(pageTextColor);
  /** Shell must use sheet bg — CSS used #fff and the 26px inset read as white strips on coloured sheets. */
  const pageShellStyle: CSSProperties = { ...pageFrame, backgroundColor: pageBgColor };

  return (
    <div
      ref={ref}
      data-oversize-print-root
      className="oversize-feature-sheet-print mx-auto flex w-full flex-col items-center gap-5 pb-6"
    >
      {/* Page 1 of 2 — 17″ × 11″ */}
      <div
        className="oversize-fs-page-shell box-border shrink-0 overflow-hidden rounded-sm shadow-2xl ring-1 ring-black/10"
        style={pageShellStyle}
      >
        <div className="oversize-fs-page-content">
          <div
            className={`${oversizeSpreadGridCols} h-full min-h-0`}
            data-oversize-page1-export
          >
          {/* pl-5 matches inner -20px margin so overflow-hidden does not clip the footer Cotala mark */}
          <div
            data-oversize-left-sheet
            className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden pl-5"
            style={{ backgroundColor: pageBgColor, color: pageTextColor }}
          >
            <div
              className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-0.5 pt-0.5"
              style={{ marginLeft: "-20px", marginTop: 0, width: "calc(100% + 20px)" }}
            >
              <FeatureListingPage4Static
                scrape={data.scrapeData ?? undefined}
                footerLogo={pickCotalaFooterLogoForTextColor(pageTextColor)}
                brandTextColor={pageTextColor}
                sheetListingDescription={data.listingDescription}
                compactOversize
                oversizePdfSpacing
              />
            </div>
          </div>

          <div
            className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden px-0.5"
            data-pdf-oversize-right-column
            style={oversizeRightColumnStyle(pageBgColor, pageTextColor)}
          >
            <div
              className="shrink-0 px-0.5 pb-2.5 pt-8 text-center"
              style={{ color: pageTextColor }}
              data-pdf-oversize-welcome
            >
              <p className="text-[18px] opacity-70">Welcome to</p>
              <h1 className="text-[13px] pt-1 font-semibold leading-tight tracking-wide">
                {data.listingAddress || "-"}
              </h1>
            </div>
            <div
              className="relative mt-1 mb-1 pt-5 w-full shrink-0 aspect-[5/4] overflow-hidden"
              data-pdf-oversize-cover
            >
              {data.coverImage?.trim() ? (
                <img
                  src={data.coverImage}
                  className="absolute inset-0 h-full w-full object-cover"
                  alt="P1"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-slate-300 text-[8px] text-slate-600">
                  Property Image
                </div>
              )}
            </div>
            <div
              className="mt-8 mb-3 grid shrink-0 grid-cols-[minmax(0,17%)_minmax(0,1fr)_minmax(0,22%)] items-center gap-0.5 px-1 py-1"
              data-pdf-oversize-agent-row
            >
              <div className="flex justify-center">
                {data.agentHeadshot?.trim() ? (
                  <img
                    src={data.agentHeadshot}
                    className="aspect-square h-12 w-12 max-w-[3rem] rounded-full object-cover"
                    alt="Agent"
                    data-pdf-oversize-agent-headshot
                  />
                ) : (
                  <img
                    src={
                      data.agentLogo?.trim() ||
                      readFeatureSheetAgentBrokerageLogoUrl() ||
                      royalLePageImg
                    }
                    className="h-10 max-h-12 w-auto max-w-[3rem] object-contain"
                    alt="Brokerage"
                    data-pdf-oversize-brokerage-logo
                  />
                )}
              </div>
              <div className="min-w-0 text-center" style={{ color: pageTextColor }}>
                <h2 className="mb-2.5 text-[14px] font-semibold leading-tight">{data.agentName}</h2>
                <p className="mt-2.5 mb-2.5 text-[9px] leading-tight" style={{ opacity: 0.92 }}>
                  {data.agentPhone}
                </p>
                <p className="mt-0.5 mb-0.5 text-[9px] leading-tight" style={{ opacity: 0.92 }}>
                  {data.agentEmail}
                </p>
                <p className="text-[9px] leading-tight" style={{ opacity: 0.92 }}>
                  {data.agentWebsite}
                </p>
              </div>
              <div className="flex min-h-0 min-w-0 items-center justify-end pr-0.5">
                {data.agentHeadshot?.trim() ? (
                  <img
                    src={
                      data.agentLogo?.trim() ||
                      readFeatureSheetAgentBrokerageLogoUrl() ||
                      royalLePageImg
                    }
                    className="h-10 max-h-14 w-auto max-w-full object-contain object-right"
                    alt="Brokerage"
                    data-pdf-oversize-brokerage-logo
                  />
                ) : null}
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>

      {/* Page 2 of 2 — 17″ × 11″ */}
      <div
        className="oversize-fs-page-shell box-border shrink-0 overflow-hidden rounded-sm shadow-2xl ring-1 ring-black/10"
        style={pageShellStyle}
      >
        <div className="oversize-fs-page-content">
          <div className={`${oversizeSpreadGridCols} h-full min-h-0`}>
          <div
            className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
            style={{ backgroundColor: pageBgColor, color: pageTextColor }}
          >
            <div className="flex min-h-0 min-w-0 flex-1 flex-col px-1 py-0.5">
              <h1
                className="oversize-fs-page2-title mb-0.5 shrink-0"
                style={{ color: pageTextColor }}
              >
                {data.listingAddress || "-"}
              </h1>
              <div className="mb-1 flex shrink-0 flex-wrap items-baseline gap-1.5">
                <span className="text-[7px] uppercase opacity-70">Listed For</span>
                <span className="text-[12px] font-semibold tabular-nums">
                  {data.price ? `$${Number(data.price).toLocaleString()}` : "-"}
                </span>
              </div>
              <div
                data-pdf-export="listing-description"
                className="mb-1 min-h-0 flex-1 overflow-y-auto whitespace-pre-line text-justify text-[9px] leading-tight"
                aria-label="Public remarks when available; otherwise tour description or legal description"
              >
                {oversizeP2SheetBlockText ? oversizeP2SheetBlockText : "\u00a0"}
              </div>
              <div className="mb-1 shrink-0 border-y py-1 text-[6px] tracking-wide opacity-80">
                <div className="flex flex-wrap gap-1.5">
                  <span>
                    MAINT FEE <b>{data.maintFee && data.maintFee.trim() !== "" ? data.maintFee : "-"}</b>
                  </span>
                  <span>|</span>
                  <span>
                    SIZE <b>{data.size && data.size.trim() !== "" ? `${data.size} SF` : "-"}</b>
                  </span>
                  <span>|</span>
                  <span>{data.bedrooms && data.bedrooms.trim() !== "" ? data.bedrooms : "-"} BED</span>
                  <span>|</span>
                  <span>{data.bathrooms && data.bathrooms.trim() !== "" ? data.bathrooms : "-"} BATH</span>
                  <span>|</span>
                  <span>
                    TAXES <b>{data.tax && data.tax.trim() !== "" ? data.tax : "-"}</b>
                  </span>
                </div>
              </div>
              {data.primaryImages[0]?.trim() ? (
                <div className="relative mb-1 aspect-[5/3] w-full shrink-0 overflow-hidden">
                  <img
                    src={data.primaryImages[0]}
                    className="absolute inset-0 h-full w-full object-cover"
                    alt="P2"
                  />
                </div>
              ) : (
                <div className="relative mb-1 flex aspect-[5/3] w-full shrink-0 items-center justify-center bg-slate-300 text-[7px] text-slate-600">
                  Interior Image
                </div>
              )}
              <div className="grid shrink-0 grid-cols-3 gap-0.5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="relative aspect-square w-full min-w-0 overflow-hidden">
                    {data.primaryImages[i]?.trim() ? (
                      <img
                        src={data.primaryImages[i]}
                        className="absolute inset-0 h-full w-full object-cover"
                        alt={`P${i + 2}`}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-slate-300 text-[6px] text-slate-500">
                        Image
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div
            className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden px-0.5"
            style={oversizeRightColumnStyle(pageBgColor, pageTextColor)}
          >
            <div className="relative mb-2 aspect-[21/9] w-full shrink-0 overflow-hidden">
              {data.primaryImages[4]?.trim() ? (
                <img
                  src={data.primaryImages[4]}
                  className="absolute inset-0 h-full w-full object-cover"
                  alt="P6"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-slate-300 text-[7px] text-slate-500">
                  Hero
                </div>
              )}
              <div
                className="absolute right-0 top-0 flex max-w-[30%] flex-col items-center px-1 py-1 text-center shadow-md"
                style={{ backgroundColor: pageBgColor, color: pageTextColor }}
              >
                <div className="flex aspect-square w-11 max-w-full shrink-0 items-center justify-center [&_canvas]:!max-h-full [&_canvas]:!max-w-full">
                  <QRCode
                    value={`https://www.cotala.com/${data.tourId}`}
                    size={40}
                    quietZone={2}
                    bgColor="#FFFFFF"
                    fgColor="#000000"
                    qrStyle="squares"
                  />
                </div>
                <p
                  className="mt-0.5 max-w-full text-[6px] leading-tight"
                  style={{ color: pageTextColor, opacity: 0.8 }}
                >
                  cotala.com/{data.tourId}
                </p>
              </div>
            </div>
            <div
              className="grid min-h-0 flex-1 grid-cols-3 gap-1"
              style={{ gridTemplateRows: "repeat(3, minmax(0, 1fr))" }}
            >
              {Array.from({ length: 9 }, (_, idx) => {
                const url = idx === 0 ? data.primaryImages[5] : data.secondaryImages[idx - 1];
                return (
                  <div key={idx} className="relative min-h-0 min-w-0 overflow-hidden">
                    {url?.trim() ? (
                      <img
                        src={url}
                        className="absolute inset-0 h-full w-full object-cover"
                        alt={`P${idx + 7}`}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-slate-300 text-[6px] text-slate-500">
                        Photo
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
  },
);

export default function OversizeFeatureSheetsOrder() {
  const [, setLocation] = useLocation();
  const tourId = getTourIdFromSearch();
  const [quantity, setQuantity] = useState("25");
  const [printLoading, setPrintLoading] = useState(true);
  const [printError, setPrintError] = useState<string | null>(null);
  const [productDetail, setProductDetail] = useState<PrintProductRow | null>(null);
  const [stockOptions, setStockOptions] = useState<PrintInventoryStockRow[]>([]);
  const [selectedStockId, setSelectedStockId] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const sheetPdfRef = useRef<HTMLDivElement>(null);
  const [snapshot, setSnapshot] = useState<FeatureListingFinalSnapshot | null>(null);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [ordering, setOrdering] = useState(false);

  const reloadSnapshot = useCallback(() => {
    if (!tourId) {
      setSnapshot(null);
      return;
    }
    const exact = readFeatureListingFinalSnapshot(tourId);
    if (exact) {
      setSnapshot(exact);
      return;
    }
    setSnapshot(readFeatureListingSessionCache(tourId));
  }, [tourId]);

  useEffect(() => {
    reloadSnapshot();
  }, [reloadSnapshot]);

  useEffect(() => {
    const onSaved = (ev: Event) => {
      const tid = (ev as CustomEvent<{ tourId?: string }>).detail?.tourId;
      if (tid != null && String(tid) === String(tourId)) reloadSnapshot();
    };
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (
        e.key.startsWith("cotala_feature_listing_final_snapshot") ||
        e.key.startsWith("cotala_feature_listing_oversize_snap_v1_") ||
        e.key.includes("cotala_feature_listing_cache_v2_")
      ) {
        reloadSnapshot();
      }
    };
    window.addEventListener(FEATURE_LISTING_SNAPSHOT_SAVED_EVENT, onSaved as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(FEATURE_LISTING_SNAPSHOT_SAVED_EVENT, onSaved as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, [tourId, reloadSnapshot]);

  useEffect(() => {
    let cancelled = false;
    setPrintLoading(true);
    setPrintError(null);
    void getPrintProductDetails()
      .then((res) => {
        if (cancelled) return;
        if (!res.status || !res.data?.productdetail) {
          setPrintError(res.msg ?? "Could not load product");
          setStockOptions(FALLBACK_GLOSS_STOCKS);
          setSelectedStockId(FALLBACK_GLOSS_STOCKS[0]?.id ?? null);
          return;
        }
        const pd = res.data.productdetail;
        const stocks = Array.isArray(res.data.stocks) ? res.data.stocks : [];
        const opts = glossStockOptions(stocksForPrintProduct(pd, stocks));
        setProductDetail(pd);
        setStockOptions(opts);
        const def = parseInt((pd.defaultstock ?? "").trim(), 10);
        const initial =
          (!Number.isNaN(def) ? opts.find((s) => s.id === def) : undefined) ?? opts[0];
        setSelectedStockId(initial?.id ?? null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setPrintError(e instanceof Error ? e.message : "Could not load product");
        setStockOptions(FALLBACK_GLOSS_STOCKS);
        setSelectedStockId(FALLBACK_GLOSS_STOCKS[0]?.id ?? null);
      })
      .finally(() => {
        if (!cancelled) setPrintLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedStock = useMemo(
    () => stockOptions.find((s) => s.id === selectedStockId) ?? null,
    [stockOptions, selectedStockId],
  );

  const finalTotal = oversizeBaseTotals[quantity] ?? 45;

  const displayAddress = snapshot?.listingAddress ?? "";
  const normalizedPageBgColor = normalizeCssColor(snapshot?.pageBgColor ?? "#ffffff");
  const normalizedPageTextColor = normalizeCssColor(snapshot?.pageTextColor ?? "#374151");

  const pdfBuildJsonPayload = useMemo(() => {
    if (!snapshot) return null;
    const footerLogoForPage4 = pickCotalaFooterLogoForTextColor(normalizedPageTextColor);
    const page2BodyText = featureSheetP2BodyText(snapshot.listingDescription, snapshot.scrapeData ?? null);
    const page2PublicRemarks = featureSheetPublicRemarksBody(
      snapshot.listingDescription,
      snapshot.scrapeData ?? null,
    );

    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      output: {
        type: "oversize_feature_sheet_pdf",
        pageSize: {
          widthInches: 17,
          heightInches: 11,
        },
        totalPages: 2,
      },
      tour: {
        tourId,
        listingAddress: snapshot.listingAddress,
      },
      theme: {
        colors: {
          pageBackground: normalizedPageBgColor,
          pageText: normalizedPageTextColor,
          qrBackground: "#FFFFFF",
          qrForeground: "#000000",
        },
      },
      listingSnapshot: snapshot,
      images: {
        coverImage: snapshot.coverImage ?? "",
        primaryImages: Array.isArray(snapshot.primaryImages) ? snapshot.primaryImages : [],
        secondaryImages: Array.isArray(snapshot.secondaryImages) ? snapshot.secondaryImages : [],
      },
      components: {
        featureListingPage4Static: {
          scrape: snapshot.scrapeData ?? null,
          footerLogo: footerLogoForPage4,
          brandTextColor: normalizedPageTextColor,
          sheetListingDescription: snapshot.listingDescription ?? null,
          compactOversize: true,
          oversizePdfSpacing: true,
        },
      },
      pages: {
        page1: {
          leftColumn: {
            component: "FeatureListingPage4Static",
            propsRef: "components.featureListingPage4Static",
          },
          rightColumn: {
            welcomeAddress: snapshot.listingAddress ?? "",
            coverImage: snapshot.coverImage ?? "",
            agent: {
              name: snapshot.agentName ?? "",
              phone: snapshot.agentPhone ?? "",
              email: snapshot.agentEmail ?? "",
              website: snapshot.agentWebsite ?? "",
              headshot: snapshot.agentHeadshot ?? null,
              logo:
                snapshot.agentLogo?.trim() ||
                readFeatureSheetAgentBrokerageLogoUrl() ||
                royalLePageImg,
            },
          },
        },
        page2: {
          listingAddress: snapshot.listingAddress ?? "",
          listedForPrice: snapshot.price ?? null,
          bodyText: page2PublicRemarks || page2BodyText || "",
          publicRemarks: page2PublicRemarks,
          fallbackBodyText: page2BodyText,
          statsRow: {
            maintFee: snapshot.maintFee ?? "",
            size: snapshot.size ?? "",
            bedrooms: snapshot.bedrooms ?? "",
            bathrooms: snapshot.bathrooms ?? "",
            tax: snapshot.tax ?? "",
          },
          heroImage: snapshot.primaryImages[4] ?? "",
          qr: {
            value: `https://www.cotala.com/${snapshot.tourId}`,
            label: `cotala.com/${snapshot.tourId}`,
            bgColor: "#FFFFFF",
            fgColor: "#000000",
          },
        },
      },
      derivedContent: {
        page2BodyText,
        page2PublicRemarks,
      },
      order: {
        quantity,
        finalTotalCad: Number(finalTotal.toFixed(2)),
        selectedStock: selectedStock
          ? {
              id: selectedStock.id,
              name: selectedStock.name,
              description: selectedStock.description ?? "",
            }
          : null,
      },
      product: productDetail
        ? {
            id: productDetail.id,
            name: productDetail.name,
            description: productDetail.description ?? "",
            defaultStock: productDetail.defaultstock ?? "",
            optionalStock: productDetail.optionalstock ?? "",
          }
        : null,
      assets: {
        fallbackBrokerageLogo: readFeatureSheetAgentBrokerageLogoUrl() || royalLePageImg,
      },
    };
  }, [
    snapshot,
    tourId,
    normalizedPageBgColor,
    normalizedPageTextColor,
    quantity,
    finalTotal,
    selectedStock,
    productDetail,
  ]);

  const panelClose = () => {
    setLocation(
      tourId ? `/feature-sheet-builder?id=${encodeURIComponent(tourId)}` : "/feature-sheet",
      { replace: true },
    );
  };

  const placeOrderAndDownload = () => {
    void (async () => {
      if (!tourId) {
        window.alert("Missing listing id.");
        return;
      }
      if (!pdfBuildJsonPayload) {
        window.alert("Sheet preview is missing. Go back and finish the feature sheet first.");
        return;
      }
      setOrdering(true);
      try {
        let orderId: string | number | undefined;
        try {
          const orderRes = await placeOversizePrintOrder({
            tour_id: tourId,
            prod: OVERSIZE_FEATURE_SHEET_PRINT_PRODUCT_ID,
            stock_id: selectedStockId,
            stock_name: selectedStock?.name ?? "",
            quantity,
            amount: finalTotal,
            notes: `Feature sheet print · ${selectedStock?.name ?? "stock"} · qty ${quantity}`,
          });
          if (orderRes.status) orderId = orderRes.data?.order_id;
          else console.warn("print-order declined", orderRes.msg ?? orderRes.message);
        } catch (err) {
          console.warn("print-order API failed, continuing with PDF download", err);
        }

        const colorProfile = await buildPrintColorProfilePayload();
        const inner = {
          ...buildOversizePdfInnerPayload(pdfBuildJsonPayload),
          colorProfile,
          printColorProfile: colorProfile.name,
          iccProfileBase64: colorProfile.iccBase64,
          iccProfileFilename: colorProfile.filename,
          submitMode: "approve_proof_print",
          printOrder: {
            productId: OVERSIZE_FEATURE_SHEET_PRINT_PRODUCT_ID,
            stockId: selectedStockId,
            stockName: selectedStock?.name ?? "",
            quantity,
            amount: finalTotal,
            orderId,
          },
        };
        try {
          await submitOversizePdfViaApi(inner);
        } catch (err) {
          console.warn("PDF print submit failed", err);
        }
        await downloadOversizePdfViaApi(inner, tourId);
      } catch (e) {
        console.error(e);
        window.alert(e instanceof Error ? e.message : "Could not place order or download PDF.");
      } finally {
        setOrdering(false);
      }
    })();
  };

  return (
    <div className="min-h-screen bg-[#101622] text-slate-100">
      <header className="flex h-16 items-center justify-between border-b border-slate-700/60 bg-slate-900/90 px-4 md:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={panelClose}
            className="flex h-10 w-10 items-center justify-center rounded-lg transition-opacity hover:opacity-90"
            aria-label="Back to feature sheet editor"
          >
            <img src={whiteBackImg} alt="" className="h-6 w-6 object-contain" />
          </button>
          <img src={lightLogo} alt="Cotala Logo" className="h-7 w-auto" />
          <span className="text-xs font-semibold text-slate-300">Oversized Feature Sheets</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {tourId ? (
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  if (!pdfBuildJsonPayload) {
                    window.alert("Snapshot missing. Save Feature Listing preview first.");
                    return;
                  }
                  setPdfDownloading(true);
                  try {
                    const colorProfile = await buildPrintColorProfilePayload();
                    const inner = {
                      ...buildOversizePdfInnerPayload(pdfBuildJsonPayload),
                      colorProfile,
                      printColorProfile: colorProfile.name,
                      iccProfileBase64: colorProfile.iccBase64,
                      iccProfileFilename: colorProfile.filename,
                    };
                    await downloadOversizePdfViaApi(inner, tourId);
                  } catch (e) {
                    console.error(e);
                    window.alert(
                      e instanceof Error ? e.message : "Could not download PDF from server.",
                    );
                  } finally {
                    setPdfDownloading(false);
                  }
                })();
              }}
              disabled={!snapshot || pdfDownloading}
              title={
                !snapshot
                  ? "Save Feature Listing preview first (Finished Editing)"
                  : "POST JSON: { user_id, data } then download PDF"
              }
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-600 bg-slate-800/80 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pdfDownloading ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              ) : (
                <Download className="h-4 w-4 shrink-0" aria-hidden />
              )}
              {pdfDownloading ? "Generating…" : "Download PDF"}
            </button>
          ) : null}
        </div>
      </header>

      <main className="flex h-[calc(100vh-4rem)] min-h-0 overflow-hidden">
        <section className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-slate-900/60 p-4 md:p-6">
          {snapshot ? (
            <OversizeMiddlePreview ref={sheetPdfRef} data={snapshot} />
          ) : (
            <div className="mx-auto mt-8 max-w-md rounded-xl border border-slate-700 bg-slate-950/80 p-6 text-center text-sm text-slate-300">
              <p className="font-semibold text-white">Preview data not found</p>
              <p className="mt-2">
                Open <strong>Feature Listing</strong> with the same tour id, then click{" "}
                <strong>Finished Editing</strong> (saves preview for this listing). Or open Oversize in the
                same tab session right after editing Feature Listing.
              </p>
            </div>
          )}
        </section>

        {/* Reference-style product panel */}
        <aside className="flex h-full min-h-0 w-full max-w-[340px] shrink-0 flex-col border-l border-white/10 bg-[#0b0b0f] text-[#f4f4f5]">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* Panel top bar */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-violet-500/25 bg-[#0b0b0f]/95 px-4 py-3 backdrop-blur-sm">
              <h2 className="text-[15px] font-bold tracking-tight text-white">
                {productDetail?.name ?? "Oversized Feature Sheets"}
              </h2>
              <button
                type="button"
                onClick={panelClose}
                className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white"
                aria-label="Close"
              >
                <X className="h-5 w-5" strokeWidth={2} />
              </button>
            </div>

            <div className="px-4 pb-4 pt-5">
              <p className="text-[22px] font-bold leading-tight tracking-tight text-white">
                {productDetail?.name ?? "Professional oversized feature sheets"}
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
                {printLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" aria-hidden />
                    Loading product…
                  </span>
                ) : printError ? (
                  <span className="text-amber-400/90">{printError}</span>
                ) : (
                  productDetail?.description ??
                  "11 × 17 in · Full colour · Creased & folded to 8.5 × 11 in"
                )}
              </p>
            </div>

            <div className="space-y-5 px-4 py-6">
              {/* Stock type — options from products.print optionalstock / defaultstock; descriptions from products.inventory */}
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Stock type
                </label>
                <div className="relative">
                  <select
                    value={selectedStockId ?? ""}
                    onChange={(e) => setSelectedStockId(Number(e.target.value))}
                    disabled={stockOptions.length === 0}
                    className="w-full appearance-none rounded-lg border border-zinc-700 bg-zinc-900/80 py-3 pl-3 pr-10 text-[14px] text-white outline-none transition focus:border-violet-500 focus:ring-1 focus:ring-violet-500 disabled:opacity-50"
                  >
                    {stockOptions.length === 0 ? (
                      <option value="">No stock options</option>
                    ) : (
                      stockOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))
                    )}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                </div>
                {selectedStock?.description?.trim() ? (
                  <p className="mt-2 text-[12px] leading-relaxed text-zinc-500">{selectedStock.description}</p>
                ) : null}
              </div>

              {/* Quantity + price row */}
              <div>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    How many?
                  </label>
                  <span className="text-[14px] font-bold tabular-nums text-white">
                    ${finalTotal.toFixed(2)} <span className="text-xs font-semibold text-zinc-400">CAD</span>
                  </span>
                </div>
                <div className="relative">
                  <select
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full appearance-none rounded-lg border border-zinc-700 bg-zinc-900/80 py-3 pl-3 pr-10 text-[14px] text-white outline-none transition focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                  >
                    <option value="25">25</option>
                    <option value="50">50</option>
                    <option value="75">75</option>
                    <option value="100">100</option>
                    <option value="250">250</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                </div>
              </div>

              {/* Listing + shipping (same address) */}
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Listing address
                </label>
                <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 px-3 py-2.5 text-[13px] leading-snug text-zinc-300">
                  {displayAddress || "—"}
                </div>
              </div>
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Shipping address
                </label>
                <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 px-3 py-2.5 text-[13px] leading-snug text-zinc-300">
                  {displayAddress || "—"}
                </div>
              </div>

              {/* Happiness-style block */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="flex gap-3">
                  <Smile className="mt-0.5 h-5 w-5 shrink-0 text-violet-400" />
                  <div>
                    <p className="text-[13px] font-semibold text-white">Quality guarantee</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">
                      Oversized feature sheets ship print-ready. Questions about your order? Our team will help
                      you adjust files or reprint when needed.
                    </p>
                  </div>
                </div>
              </div>

              {/* Details accordion */}
              <div className="overflow-hidden rounded-xl border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setDetailsOpen((o) => !o)}
                  className="flex w-full items-center justify-between gap-2 bg-zinc-900/40 px-4 py-3 text-left transition hover:bg-zinc-900/70"
                >
                  <span className="flex items-center gap-2 text-[13px] font-semibold text-white">
                    <Check className="h-4 w-4 text-violet-400" strokeWidth={2.5} />
                    Product details
                  </span>
                  {detailsOpen ? (
                    <ChevronDown className="h-4 w-4 text-zinc-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-zinc-500" />
                  )}
                </button>
                {detailsOpen && (
                  <div className="space-y-2 border-t border-zinc-800 px-4 py-3 text-[12px] leading-relaxed text-zinc-400">
                    <p className="font-medium text-zinc-300">Product</p>
                    <p>{productDetail?.description ?? "—"}</p>
                    {selectedStock?.description?.trim() ? (
                      <>
                        <p className="pt-1 font-medium text-zinc-300">Stock</p>
                        <p>{selectedStock.description}</p>
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sticky footer */}
          <div className="shrink-0 border-t border-zinc-800 bg-[#0b0b0f] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Final total</p>
                <p className="text-[11px] text-zinc-500">Ready for cart checkout</p>
              </div>
              <p className="text-xl font-bold tabular-nums text-white">
                ${finalTotal.toFixed(2)} <span className="text-sm font-semibold text-zinc-400">CAD</span>
              </p>
            </div>
            <button
              type="button"
              className="mt-4 w-full rounded-xl bg-zinc-800 py-3.5 text-[14px] font-bold text-white shadow-lg transition hover:bg-zinc-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={ordering || !snapshot}
              onClick={placeOrderAndDownload}
            >
              {ordering ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Placing order…
                </span>
              ) : (
                "Place order & download"
              )}
            </button>
          </div>
        </aside>
      </main>
    </div>
  );
}
