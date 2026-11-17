import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import type { Notice } from "./helpers";

export function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  const Icon = notice.kind === "success" ? CheckCircle2 : AlertCircle;
  return (
    <p className={`ma-notice ma-notice--${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
      <Icon className="w-4 h-4 shrink-0" />
      <span>{notice.text}</span>
    </p>
  );
}

export function SectionLoading({ label }: { label: string }) {
  return (
    <div className="ma-loading">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

export function SectionError({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="ma-error-box">
      <AlertCircle className="w-5 h-5 shrink-0" />
      <span className="flex-1">{text}</span>
      {onRetry ? (
        <button type="button" className="recovery-btn" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}
