import type { RenderedPanels } from "./render-panels";
import { buildFeatureSheetPrintHtml } from "./build-print-html";

/** Same as mockup `doPrint()` — new tab + optional auto print dialog. */
export function openFeatureSheetPrintWindow(
  panels: RenderedPanels,
  options?: { autoPrint?: boolean },
): void {
  const html = buildFeatureSheetPrintHtml(panels, { autoPrint: options?.autoPrint === true });
  const w = window.open("", "_blank");
  if (!w) {
    window.alert("Please allow pop-ups to print.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
