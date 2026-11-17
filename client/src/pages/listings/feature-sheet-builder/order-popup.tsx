import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Download, Loader2, Smile, X } from "lucide-react";
import { buildPrintColorProfilePayload } from "@/lib/print-color-profile";
import { buildFeatureSheetPdfPayload } from "@/lib/feature-sheet-pdf-payload";
import {
  getPrintProductDetails,
  OVERSIZE_FEATURE_SHEET_PRINT_PRODUCT_ID,
  placeOversizePrintOrder,
  type PrintInventoryStockRow,
  type PrintProductRow,
} from "@/lib/api";
import type { FeatureListingFinalSnapshot } from "../feature-listing-preview";
import { downloadOversizePdfViaApi, submitOversizePdfViaApi } from "@/lib/oversize-pdf-api";
import { buildFeatureSheetPrintHtml } from "./build-print-html";
import type { FeatureSheetFormState, RenderedPanels } from "./render-panels";

type Props = {
  open: boolean;
  tourId: string;
  form: FeatureSheetFormState;
  panels: RenderedPanels;
  snapshot: FeatureListingFinalSnapshot | null;
  onClose: () => void;
};

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

export function FeatureSheetOrderPopup({ open, tourId, form, panels, snapshot, onClose }: Props) {
  const [quantity, setQuantity] = useState("25");
  const [printLoading, setPrintLoading] = useState(true);
  const [printError, setPrintError] = useState<string | null>(null);
  const [productDetail, setProductDetail] = useState<PrintProductRow | null>(null);
  const [stockOptions, setStockOptions] = useState<PrintInventoryStockRow[]>([]);
  const [selectedStockId, setSelectedStockId] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [ordering, setOrdering] = useState(false);

  useEffect(() => {
    if (!open) return;
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
        const initial = (!Number.isNaN(def) ? opts.find((s) => s.id === def) : undefined) ?? opts[0];
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
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const selectedStock = useMemo(
    () => stockOptions.find((s) => s.id === selectedStockId) ?? null,
    [stockOptions, selectedStockId],
  );
  const finalTotal = oversizeBaseTotals[quantity] ?? 45;
  const displayAddress = form.addr || snapshot?.listingAddress || "";

  const buildPdfPayload = async (submitMode: "download_pdf" | "approve_proof_print", orderId?: string | number) => {
    const colorProfile = await buildPrintColorProfilePayload();
    const printHtml = buildFeatureSheetPrintHtml(panels, { autoPrint: false });
    const qtyNum = Number(quantity) || 25;
    const base = buildFeatureSheetPdfPayload({
      form,
      panels,
      printHtml,
      tourId,
      listingSnapshot: snapshot,
      colorProfile,
      submitMode,
      proofOrder: {
        quantity: qtyNum,
        deliveryMethod: "ship",
        shippingAddress: displayAddress,
        courier: "standard",
      },
    });
    return {
      ...base,
      order: {
        ...(typeof base.order === "object" && base.order ? base.order : {}),
        quantity,
        finalTotalCad: Number(finalTotal.toFixed(2)),
        selectedStock: selectedStock
          ? { id: selectedStock.id, name: selectedStock.name, description: selectedStock.description ?? "" }
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
      printOrder: {
        productId: OVERSIZE_FEATURE_SHEET_PRINT_PRODUCT_ID,
        stockId: selectedStockId,
        stockName: selectedStock?.name ?? "",
        quantity,
        amount: finalTotal,
        orderId,
      },
    };
  };

  const downloadPdf = () => {
    void (async () => {
      if (!tourId) {
        window.alert("Missing listing id.");
        return;
      }
      setPdfDownloading(true);
      try {
        const inner = await buildPdfPayload("download_pdf");
        await downloadOversizePdfViaApi(inner, tourId);
      } catch (e) {
        console.error(e);
        window.alert(e instanceof Error ? e.message : "Could not download PDF.");
      } finally {
        setPdfDownloading(false);
      }
    })();
  };

  const placeOrderAndDownload = () => {
    void (async () => {
      if (!tourId) {
        window.alert("Missing listing id.");
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
          if (orderRes.status) {
            orderId = orderRes.data?.order_id;
            const proofId = orderRes.data?.printjob_id ?? orderRes.data?.order_id;
            if (proofId) {
              const goProof = window.confirm(
                "Order placed. Open proof review to approve your feature sheet print?",
              );
              if (goProof) window.location.href = `/proof-review?id=${proofId}`;
            }
          } else console.warn("print-order declined", orderRes.msg ?? orderRes.message);
        } catch (err) {
          console.warn("print-order API failed, continuing with PDF download", err);
        }

        const inner = await buildPdfPayload("approve_proof_print", orderId);
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

  if (!open) return null;

  return (
    <div
      className="fsb-order-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Download and order feature sheet"
      onClick={onClose}
    >
      <div className="fsb-order-popup" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-violet-500/25 px-4 py-3">
          <h2 className="text-[15px] font-bold tracking-tight text-white">
            {productDetail?.name ?? "Oversized Feature Sheets"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          <p className="text-[20px] font-bold leading-tight tracking-tight text-white">
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
              productDetail?.description ?? "11 × 17 in · Full colour · Creased & folded to 8.5 × 11 in"
            )}
          </p>

          <div className="mt-5 space-y-5">
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
              {detailsOpen ? (
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
              ) : null}
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-zinc-800 p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Final total</p>
              <p className="text-[11px] text-zinc-500">PDF auto-attached · order placed directly</p>
            </div>
            <p className="text-xl font-bold tabular-nums text-white">
              ${finalTotal.toFixed(2)} <span className="text-sm font-semibold text-zinc-400">CAD</span>
            </p>
          </div>
          <button
            type="button"
            className="mt-3 w-full rounded-xl border border-zinc-700 bg-zinc-900 py-3 text-[13px] font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={pdfDownloading || ordering}
            onClick={downloadPdf}
          >
            {pdfDownloading ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Generating…
              </span>
            ) : (
              <span className="inline-flex items-center justify-center gap-2">
                <Download className="h-4 w-4" aria-hidden />
                Download PDF
              </span>
            )}
          </button>
          <button
            type="button"
            className="mt-2 w-full rounded-xl bg-zinc-800 py-3.5 text-[14px] font-bold text-white shadow-lg transition hover:bg-zinc-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={ordering || pdfDownloading}
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
      </div>
    </div>
  );
}
