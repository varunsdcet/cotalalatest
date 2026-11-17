import { useState } from "react";
import { Ban, Loader2, PencilLine } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cancelPortalOrder, requestOrderChange, type OrderChangeType } from "@/lib/api";

const CHANGE_TYPES: Array<{ value: OrderChangeType; label: string }> = [
  { value: "schedule", label: "Schedule / appointment time" },
  { value: "address", label: "Property address" },
  { value: "services", label: "Services" },
  { value: "contact", label: "Contact details" },
  { value: "notes", label: "Notes / instructions" },
  { value: "other", label: "Other" },
];

const fieldClass =
  "mt-1.5 w-full rounded-md border border-white/15 bg-black/50 px-3 text-sm text-white outline-none focus:border-[#b388ff]";
const labelClass = "text-xs font-medium text-white/70 uppercase tracking-wide";

type BaseProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | number;
  onSuccess: (msg: string) => void;
};

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function RequestChangeDialog({ open, onOpenChange, orderId, onSuccess }: BaseProps) {
  const [changeType, setChangeType] = useState<OrderChangeType>("schedule");
  const [message, setMessage] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setChangeType("schedule");
    setMessage("");
    setPreferredDate("");
    setPreferredTime("");
    setError("");
    setSubmitting(false);
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    const trimmed = message.trim();
    if (trimmed.length < 5) {
      setError("Please describe the change you need.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await requestOrderChange({
        id: orderId,
        change_type: changeType,
        message: trimmed,
        ...(preferredDate ? { preferred_date: preferredDate } : {}),
        ...(preferredTime ? { preferred_time: preferredTime } : {}),
      });
      if (res?.status) {
        onSuccess(res.msg || "Change request submitted");
        handleClose(false);
      } else {
        setError(res?.msg || res?.message || "Unable to submit your change request.");
      }
    } catch (err) {
      setError(errorMessage(err, "Unable to submit your change request. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-zinc-950 border-white/15 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[#b388ff] flex items-center gap-2">
            <PencilLine className="h-5 w-5" />
            Request changes
          </DialogTitle>
          <DialogDescription className="text-white/60">Order #{orderId}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className={labelClass}>What needs to change?</label>
            <select
              value={changeType}
              onChange={(e) => setChangeType(e.target.value as OrderChangeType)}
              className={`${fieldClass} h-10`}
            >
              {CHANGE_TYPES.map((c) => (
                <option key={c.value} value={c.value} className="bg-zinc-900">
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Details</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="e.g. Can we move this to Friday afternoon?"
              className={`${fieldClass} py-2 resize-none placeholder:text-white/35`}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Preferred date (optional)</label>
              <input
                type="date"
                value={preferredDate}
                onChange={(e) => setPreferredDate(e.target.value)}
                className={`${fieldClass} h-10 [color-scheme:dark]`}
              />
            </div>
            <div>
              <label className={labelClass}>Preferred time (optional)</label>
              <input
                type="time"
                value={preferredTime}
                onChange={(e) => setPreferredTime(e.target.value)}
                className={`${fieldClass} h-10 [color-scheme:dark]`}
              />
            </div>
          </div>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleClose(false)}
            className="border-white/20 text-white hover:bg-white/10"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || message.trim().length < 5}
            className="bg-[#b388ff] hover:bg-[#b388ff]/85 text-white"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CancelOrderDialog({ open, onOpenChange, orderId, onSuccess }: BaseProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleClose = (next: boolean) => {
    if (!next) {
      setReason("");
      setError("");
      setSubmitting(false);
    }
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("Please tell us why you are cancelling.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await cancelPortalOrder(orderId, trimmed);
      if (res?.status) {
        onSuccess(res.msg || "Order cancelled");
        handleClose(false);
      } else {
        setError(res?.msg || res?.message || "Unable to cancel this order.");
      }
    } catch (err) {
      setError(errorMessage(err, "Unable to cancel this order. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-zinc-950 border-white/15 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[#ff777e] flex items-center gap-2">
            <Ban className="h-5 w-5" />
            Cancel order
          </DialogTitle>
          <DialogDescription className="text-white/60">
            Order #{orderId} will be cancelled. This can't be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className={labelClass}>Reason for cancelling</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Let us know why you're cancelling…"
            className={`${fieldClass} py-2 resize-none placeholder:text-white/35`}
          />
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleClose(false)}
            className="border-white/20 text-white hover:bg-white/10"
          >
            Keep order
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || !reason.trim()}
            className="bg-[#ff4d6d] hover:bg-[#ff4d6d]/85 text-white"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
