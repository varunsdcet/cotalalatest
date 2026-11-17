import { Download, Eye, Loader2, MessageCircle, Upload } from "lucide-react";
import type { ReactNode } from "react";
import cotalaBlk from "@/pages/images/cotala-blk.png";

export function BrandKitBar({
  onSave,
  onLoadClick,
}: {
  onSave: () => void;
  onLoadClick: () => void;
}) {
  return (
    <div className="fsb-brand-bar">
      <div className="fsb-brand-bar-title">Brand Kit (Agent & Design)</div>
      <div className="fsb-brand-bar-actions">
        <button type="button" className="fsb-btn fsb-btn-sm" onClick={onSave}>
          <Download className="inline h-3 w-3" aria-hidden /> Save
        </button>
        <button type="button" className="fsb-btn fsb-btn-sm fsb-btn-outline" onClick={onLoadClick}>
          <Upload className="inline h-3 w-3" aria-hidden /> Load
        </button>
      </div>
    </div>
  );
}

export function FeatureSheetTopbar() {
  return (
    <div className="fsb-topbar">
      <img src={cotalaBlk} className="fsb-topbar-logo" alt="Cotala" />
    </div>
  );
}

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="fsb-fg">
      <label className="fsb-fl">{label}</label>
      <div className="fsb-cr">
        <input type="color" className="fsb-cs" value={value} onChange={(e) => onChange(e.target.value)} />
        <input className="fsb-ci" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}

export function SheetPhotoHeader({
  title,
  onPreview,
}: {
  title: string;
  onPreview: () => void;
}) {
  return (
    <div className="fsb-sheet-header">
      <div className="fsb-sheet-header-title">{title}</div>
      <button type="button" className="fsb-btn fsb-btn-sm fsb-btn-outline" onClick={onPreview}>
        <Eye className="inline h-3 w-3" aria-hidden /> Preview
      </button>
    </div>
  );
}

export function RangeField({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="fsb-fg" style={{ marginBottom: 0 }}>
      <label className="fsb-fl">{label}</label>
      <input
        type="range"
        className="fsb-range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function CheckboxLabel({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="fsb-check-label">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}
