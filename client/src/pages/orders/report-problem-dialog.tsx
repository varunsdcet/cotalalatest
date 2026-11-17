import { useState } from "react";
import { AlertCircle, Loader2, Phone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { reportOrderProblem } from "@/lib/api";
import { COTALA_SUPPORT_EMAIL, COTALA_SUPPORT_PHONE } from "@/lib/support-contact";

const CATEGORIES = [
  { value: "billing", label: "Billing / payment" },
  { value: "scheduling", label: "Scheduling / appointment" },
  { value: "quality", label: "Photo / print quality" },
  { value: "delivery", label: "Delivery / turnaround" },
  { value: "other", label: "Other" },
] as const;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | number;
  orderTotal?: string | number;
  orderDate?: string;
  onSubmitted?: (msg: string) => void;
};

export function ReportProblemDialog({
  open,
  onOpenChange,
  orderId,
  orderTotal,
  orderDate,
  onSubmitted,
}: Props) {
  const [category, setCategory] = useState<string>("billing");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const reset = () => {
    setCategory("billing");
    setMessage("");
    setError("");
    setSuccess("");
    setSubmitting(false);
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    const trimmed = message.trim();
    if (trimmed.length < 10) {
      setError("Please describe the issue in at least 10 characters.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await reportOrderProblem({
        order_id: orderId,
        category,
        message: trimmed,
      });
      if (res.status) {
        const msg = res.msg || "Your report has been submitted. Our team will contact you shortly.";
        setSuccess(msg);
        setMessage("");
        onSubmitted?.(msg);
      } else {
        setError(res.msg || "Unable to submit your report. Please try again.");
      }
    } catch {
      setError("Unable to submit your report. Please try calling support.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-zinc-950 border-white/15 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[#b388ff] flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Report a problem
          </DialogTitle>
          <DialogDescription className="text-white/60">
            Order #{orderId}
            {orderDate ? ` · placed ${orderDate}` : ""}
            {orderTotal != null ? ` · $${Number(orderTotal).toFixed(2)}` : ""}
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="rounded-lg border border-green-500/40 bg-green-500/10 p-4 text-sm text-green-300">
            {success}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-white/70 uppercase tracking-wide">Issue type</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1.5 w-full h-10 rounded-md border border-white/15 bg-black/50 px-3 text-sm text-white outline-none focus:border-[#b388ff]"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value} className="bg-zinc-900">
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-white/70 uppercase tracking-wide">Describe the problem</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                placeholder="Tell us what went wrong with this order…"
                className="mt-1.5 w-full rounded-md border border-white/15 bg-black/50 px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none focus:border-[#b388ff] resize-none"
              />
            </div>
            {error ? <p className="text-sm text-red-400">{error}</p> : null}
            <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-white/60 space-y-1.5">
              <p className="font-medium text-white/80">Need immediate help?</p>
              <a
                href={`mailto:${COTALA_SUPPORT_EMAIL}?subject=Order%20%23${orderId}`}
                className="block text-[#b388ff] hover:underline"
              >
                Email: {COTALA_SUPPORT_EMAIL}
              </a>
              <a
                href={`tel:${COTALA_SUPPORT_PHONE.replace(/\D/g, "")}`}
                className="flex items-center gap-1.5 text-[#b388ff] hover:underline"
              >
                <Phone className="h-3.5 w-3.5" />
                Phone: {COTALA_SUPPORT_PHONE}
              </a>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleClose(false)}
            className="border-white/20 text-white hover:bg-white/10"
          >
            {success ? "Close" : "Cancel"}
          </Button>
          {!success ? (
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting || message.trim().length < 10}
              className="bg-[#b388ff] hover:bg-[#b388ff]/85 text-white"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit report"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
