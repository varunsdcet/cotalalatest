import { useEffect, useMemo, useState } from "react";
import { Loader2, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getProofSendToPrintOptions, sendProofToPrint } from "@/lib/api";

type Rec = Record<string, unknown>;

const asRec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string =>
  typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "";

interface StockOption {
  id: string;
  name: string;
  onhand: number | null;
}

interface ShippingOption {
  value: string;
  label: string;
}

interface AddressOption {
  id: string;
  label: string;
  address: string;
  isDefault: boolean;
}

interface PrintOptions {
  productName: string;
  description: string;
  stocks: StockOption[];
  quantities: number[];
  shipping: ShippingOption[];
  addresses: AddressOption[];
  subtotal: number | null;
  defaultStock: string;
  defaultQty: string;
  defaultShipping: string;
}

const NO_ADDRESS_SHIPPING = new Set(["cotala", "pickup"]);

function parseOptions(data: Rec): PrintOptions {
  const proof = asRec(data.proof);
  const product = asRec(data.product);
  const stocks = asArr(data.stock_types)
    .map((row) => {
      const r = asRec(row);
      const onhand = Number(r.onhand);
      return { id: str(r.id), name: str(r.name) || `Stock ${str(r.id)}`, onhand: Number.isFinite(onhand) ? onhand : null };
    })
    .filter((s) => s.id);
  const quantities = asArr(data.quantities)
    .map((q) => Number(q))
    .filter((q) => Number.isFinite(q) && q > 0);
  const proofQty = Number(proof.qty);
  if (Number.isFinite(proofQty) && proofQty > 0 && !quantities.includes(proofQty)) {
    quantities.push(proofQty);
    quantities.sort((a, b) => a - b);
  }
  const shipping = asArr(data.shipping_options)
    .map((row) => {
      const r = asRec(row);
      return { value: str(r.value), label: str(r.label) || str(r.value) };
    })
    .filter((s) => s.value);
  const addresses = asArr(data.addresses)
    .map((row) => {
      const r = asRec(row);
      return { id: str(r.id), label: str(r.label), address: str(r.address), isDefault: r.is_default === true };
    })
    .filter((a) => a.id);
  const proofStock = str(proof.stock);
  const defaultStock = stocks.some((s) => s.id === proofStock) ? proofStock : stocks[0]?.id || "";
  const defaultQty = Number.isFinite(proofQty) && proofQty > 0 ? String(proofQty) : quantities[0] ? String(quantities[0]) : "";
  const defaultAddress = addresses.find((a) => a.isDefault);
  const defaultShipping =
    defaultAddress && shipping.some((s) => s.value === defaultAddress.id)
      ? defaultAddress.id
      : shipping[0]?.value || "";
  const subtotal = Number(data.subtotal);
  return {
    productName: str(product.name) || str(proof.description) || "Print proof",
    description: str(proof.description),
    stocks,
    quantities,
    shipping,
    addresses,
    subtotal: Number.isFinite(subtotal) ? subtotal : null,
    defaultStock,
    defaultQty,
    defaultShipping,
  };
}

export interface SendToPrintModalProps {
  proofId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listingAddress: string;
  proofUrl?: string;
  onSent?: () => void;
}

export default function SendToPrintModal({
  proofId,
  open,
  onOpenChange,
  listingAddress,
  proofUrl,
  onSent,
}: SendToPrintModalProps) {
  const [options, setOptions] = useState<PrintOptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stock, setStock] = useState("");
  const [quantity, setQuantity] = useState("");
  const [shipping, setShipping] = useState("");
  const [address, setAddress] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !proofId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setSubmitError(null);
    setSuccess(null);
    setAccepted(false);
    getProofSendToPrintOptions(proofId)
      .then((res) => {
        if (cancelled) return;
        if (!res.status || !res.data) {
          setLoadError(res.msg || res.message || "Could not load print options for this proof.");
          return;
        }
        const parsed = parseOptions(asRec(res.data));
        setOptions(parsed);
        setStock(parsed.defaultStock);
        setQuantity(parsed.defaultQty);
        setShipping(parsed.defaultShipping);
      })
      .catch((err) => {
        console.error("Failed to load send-to-print options", err);
        if (!cancelled) setLoadError("Could not load print options. Please try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, proofId]);

  const needsAddress = shipping !== "" && !NO_ADDRESS_SHIPPING.has(shipping);

  useEffect(() => {
    if (!options) return;
    if (shipping === "listing") {
      setAddress(listingAddress);
    } else if (shipping === "other") {
      setAddress("");
    } else {
      setAddress(options.addresses.find((a) => a.id === shipping)?.address || "");
    }
  }, [shipping, options, listingAddress]);

  const selectedStock = useMemo(() => options?.stocks.find((s) => s.id === stock), [options, stock]);

  const handleSubmit = async () => {
    if (!proofId || !options) return;
    setSubmitError(null);
    if (!stock) return setSubmitError("Choose a stock type.");
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) return setSubmitError("Choose a quantity.");
    if (!shipping) return setSubmitError("Choose a shipping option.");
    if (needsAddress && !address.trim()) return setSubmitError("Enter a shipping address.");
    if (!accepted) return setSubmitError("Please confirm you approve this proof for printing.");
    setSubmitting(true);
    try {
      const numericStock = Number(stock);
      const res = await sendProofToPrint({
        id: proofId,
        stock_type: Number.isFinite(numericStock) ? numericStock : stock,
        quantity: qty,
        shipping,
        ...(needsAddress ? { address: address.trim() } : {}),
        approval_accepted: true,
      });
      if (res.status) {
        setSuccess(res.msg || res.message || "Proof sent to print.");
        onSent?.();
      } else {
        setSubmitError(res.msg || res.message || "Could not send this proof to print.");
      }
    } catch (err) {
      console.error("Failed to send proof to print", err);
      setSubmitError("Could not send this proof to print. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ld-print-modal bg-[#111] text-white border-white/10 max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-white">Approve &amp; Send to Print</DialogTitle>
          <DialogDescription className="text-white/60">
            {options?.productName || "Review your options, approve the proof and send it to print."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-white/70 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading print options…
          </div>
        ) : loadError ? (
          <div className="flex items-start gap-2 text-red-400 text-sm py-4">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {loadError}
          </div>
        ) : success ? (
          <div className="flex flex-col items-center text-center gap-3 py-6">
            <CheckCircle2 className="w-10 h-10 text-[#3ddc84]" />
            <p className="text-white font-semibold">{success}</p>
            <button
              type="button"
              className="mt-2 px-6 py-2 rounded-full bg-[#b284f6] text-black font-semibold text-sm"
              onClick={() => onOpenChange(false)}
            >
              Done
            </button>
          </div>
        ) : options ? (
          <div className="space-y-4">
            {proofUrl && (
              <a
                href={proofUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-[#b388ff] hover:underline"
              >
                View proof PDF <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}

            <div>
              <label htmlFor="ld-stock">Stock type</label>
              <select id="ld-stock" value={stock} onChange={(e) => setStock(e.target.value)}>
                {options.stocks.length === 0 && <option value="">No stock options</option>}
                {options.stocks.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {selectedStock && selectedStock.onhand !== null && selectedStock.onhand <= 0 && (
                <p className="text-xs text-amber-400 mt-1">This stock may be limited; production could take longer.</p>
              )}
            </div>

            <div>
              <label htmlFor="ld-qty">Quantity</label>
              <select id="ld-qty" value={quantity} onChange={(e) => setQuantity(e.target.value)}>
                {options.quantities.length === 0 && <option value="">No quantities available</option>}
                {options.quantities.map((q) => (
                  <option key={q} value={String(q)}>
                    {q}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="ld-ship">Shipping</label>
              <select id="ld-ship" value={shipping} onChange={(e) => setShipping(e.target.value)}>
                {options.shipping.length === 0 && <option value="">No shipping options</option>}
                {options.shipping.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {needsAddress && (
              <div>
                <label htmlFor="ld-address">Shipping address</label>
                <textarea
                  id="ld-address"
                  rows={2}
                  value={address}
                  placeholder="Street, City, Province, Postal code"
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>
            )}

            {options.subtotal !== null && options.subtotal > 0 && (
              <p className="text-sm text-white/70">
                Subtotal: <span className="text-white font-semibold">${options.subtotal.toFixed(2)}</span>{" "}
                <span className="text-white/50">+ tax</span>
              </p>
            )}

            <label className="!flex items-start gap-2 !normal-case !text-sm !font-normal !text-white cursor-pointer">
              <input
                type="checkbox"
                className="accent-[#b284f6] w-4 h-4 mt-0.5"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
              />
              I have reviewed this proof and approve it for printing. Changes can't be made after it is sent to print.
            </label>

            {submitError && (
              <div className="flex items-start gap-2 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {submitError}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                className="px-5 py-2 rounded-full border border-white/40 text-white text-sm hover:bg-white/5"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting || !accepted}
                className="px-6 py-2 rounded-full bg-[#b284f6] text-black font-semibold text-sm disabled:opacity-50 inline-flex items-center gap-2"
                onClick={handleSubmit}
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                SEND TO PRINT
              </button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
