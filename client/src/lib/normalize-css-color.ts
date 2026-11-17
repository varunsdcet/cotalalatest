/**
 * Fixes common API/typo hex issues so browsers paint correctly.
 * e.g. `#fffff` (5 digits) → `#ffffff`; `#abc` → `#aabbcc`.
 * Non-hex values (rgb(), named colors) returned unchanged.
 */
export function normalizeCssColor(input: string): string {
  const s = (input || "").trim();
  if (!s) return "#ffffff";
  const m = s.match(/^#([0-9a-fA-F]+)$/i);
  if (!m) return s;
  const d = m[1];
  if (d.length === 3) {
    const [r, g, b] = d.split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (d.length === 5) {
    return `#${d}f`.toLowerCase();
  }
  if (d.length === 6 || d.length === 8) {
    return `#${d}`.toLowerCase();
  }
  return s;
}

/** Sheet / theme backgrounds treated as “white” for my-listings broker logo (`imagepath` vs `url2`). */
export function isLikelyWhiteSheetBackground(input: string): boolean {
  const n = normalizeCssColor(input || "#ffffff").toLowerCase();
  if (n === "#ffffff" || n === "#fff") return true;
  const m = n.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (!m) return false;
  const hex = m[1].toLowerCase();
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return r >= 248 && g >= 248 && b >= 248;
}
