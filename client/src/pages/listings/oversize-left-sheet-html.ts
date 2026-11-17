/**
 * Build + download standalone HTML for **page 1 full spread** (MLS left + welcome/cover/agent/brokerage right).
 * Opens in any browser; uses embedded CSS + Tailwind CDN for utility classes on the markup.
 */
import oversizeFeatureSheetsCss from "./oversize-feature-sheets-order.css?raw";
import indexTableFragmentCss from "./oversize-html-export-index-fragment.css?raw";

function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildOversizeLeftSheetHtmlDocument(
  root: HTMLElement,
  options: { tourId: string; title?: string },
): string {
  const el = root.querySelector("[data-oversize-page1-export]");
  if (!el) {
    throw new Error("Missing [data-oversize-page1-export] — nothing to export.");
  }
  const bodyInner = el.outerHTML;
  const title = options.title ?? `Oversize page 1 sheet — tour ${options.tourId}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtmlAttr(title)}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
${indexTableFragmentCss}
  </style>
  <style>
${oversizeFeatureSheetsCss}
  </style>
</head>
<body class="oversize-feature-sheet-print" style="margin:0;padding:16px;background:#f4f4f5;">
  ${bodyInner}
</body>
</html>
`;
}

export function downloadOversizeLeftSheetHtml(root: HTMLElement | null, tourId: string): void {
  if (!root) return;
  const safeId = String(tourId).replace(/[^\w-]+/g, "_");
  const html = buildOversizeLeftSheetHtmlDocument(root, { tourId: safeId });
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `oversize-page1-sheet-${safeId}.html`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
