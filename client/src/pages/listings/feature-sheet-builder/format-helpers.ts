/** Input formatters from Feature_sheet_builderReverted.html */

export function fmtCurrencyValue(raw: string): string {
  if (!raw.trim()) return "";
  const num = raw.replace(/[^\d.]/g, "");
  if (!num) return "";
  const p = num.split(".");
  p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `$${p.length > 1 ? `${p[0]}.${p[1].substring(0, 2)}` : p[0]}`;
}

export function fmtTextWithNumbers(raw: string): string {
  if (!raw.trim()) return "";
  const val = raw.replace(/,/g, "");
  return val.replace(/\d+/g, (m) => m.replace(/\B(?=(\d{3})+(?!\d))/g, ","));
}

export function fmtStrataValue(raw: string, label: "Maint." | "Lot Size"): string {
  if (label === "Maint.") return fmtCurrencyValue(raw);
  if (!raw.trim()) return "";
  let val = raw.replace(/,/g, "").replace(/\.\d+/g, "");
  return val.replace(/\d+/g, (m) => m.replace(/\B(?=(\d{3})+(?!\d))/g, ","));
}

export function fmtPhoneValue(raw: string): string {
  if (!raw.trim()) return "";
  const num = raw.replace(/[^\d]/g, "");
  if (num.length >= 10) {
    return `${num.slice(0, 3)}.${num.slice(3, 6)}.${num.slice(6, 10)}`;
  }
  return raw;
}
