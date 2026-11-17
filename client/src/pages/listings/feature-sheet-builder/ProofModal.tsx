import { Loader2 } from "lucide-react";
import type { ProofOrderState } from "./types";

type ProofModalProps = {
  open: boolean;
  loading: boolean;
  sheet1Jpg: string | null;
  sheet2Jpg: string | null;
  order: ProofOrderState;
  submitting: boolean;
  onClose: () => void;
  onOrderChange: (patch: Partial<ProofOrderState>) => void;
  onApprove: () => void;
};

export function ProofModal({
  open,
  loading,
  sheet1Jpg,
  sheet2Jpg,
  order,
  submitting,
  onClose,
  onOrderChange,
  onApprove,
}: ProofModalProps) {
  if (!open) return null;

  const ship = order.deliveryMethod === "ship";

  return (
    <div className="fsb-proof-modal" role="dialog" aria-modal="true" aria-label="Review Proof and Order">
      <div className="fsb-proof-header">
        <h2>Review Proof &amp; Order</h2>
        <button type="button" className="fsb-btn" onClick={onClose} disabled={submitting}>
          ← Back to Editor
        </button>
      </div>

      <div className="fsb-proof-body">
        <div className="fsb-proof-preview-col">
          <div className="fsb-proof-preview-label">Low Resolution Proof</div>
          <div className="fsb-proof-preview-stack">
            {loading ? (
              <div className="fsb-proof-loading">
                <Loader2 className="mb-2 h-8 w-8 animate-spin" aria-hidden />
                Generating low-resolution image proofs... please wait.
              </div>
            ) : (
              <>
                <div className="fsb-proof-sheet-title">Sheet 1: Exterior</div>
                {sheet1Jpg ? (
                  <img src={sheet1Jpg} alt="Sheet 1 proof" className="fsb-proof-img" />
                ) : null}
                <div className="fsb-proof-sheet-title">Sheet 2: Interior</div>
                {sheet2Jpg ? (
                  <img src={sheet2Jpg} alt="Sheet 2 proof" className="fsb-proof-img" />
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className="fsb-proof-order-card">
          <h3>Order Details</h3>
          <div className="fsb-fg">
            <label className="fsb-fl">Quantity</label>
            <input
              type="number"
              className="fsb-fi"
              min={1}
              value={order.quantity}
              onChange={(e) => onOrderChange({ quantity: Math.max(1, Number(e.target.value) || 1) })}
            />
          </div>
          <div className="fsb-fg">
            <label className="fsb-fl">Delivery Method</label>
            <select
              className="fsb-fi"
              value={order.deliveryMethod}
              onChange={(e) =>
                onOrderChange({ deliveryMethod: e.target.value as ProofOrderState["deliveryMethod"] })
              }
            >
              <option value="pickup">Pickup (Free)</option>
              <option value="ship">Ship to Address</option>
            </select>
          </div>
          {ship ? (
            <div className="fsb-proof-shipping">
              <div className="fsb-fg">
                <label className="fsb-fl">Shipping Address</label>
                <textarea
                  className="fsb-fi"
                  rows={3}
                  placeholder="Enter full address"
                  value={order.shippingAddress}
                  onChange={(e) => onOrderChange({ shippingAddress: e.target.value })}
                />
              </div>
              <div className="fsb-fg" style={{ marginBottom: 0 }}>
                <label className="fsb-fl">Courier Service</label>
                <select
                  className="fsb-fi"
                  value={order.courier}
                  onChange={(e) => onOrderChange({ courier: e.target.value as ProofOrderState["courier"] })}
                >
                  <option value="standard">Standard (3-5 Business Days)</option>
                  <option value="express">Express (1-2 Business Days)</option>
                  <option value="overnight">Overnight Delivery</option>
                </select>
              </div>
            </div>
          ) : null}
          <button
            type="button"
            className="fsb-btn fsb-btnp fsb-proof-approve"
            disabled={loading || submitting}
            onClick={onApprove}
          >
            {submitting ? (
              <>
                <Loader2 className="inline h-4 w-4 animate-spin" aria-hidden /> Submitting…
              </>
            ) : (
              "Approve Proof & Submit"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
