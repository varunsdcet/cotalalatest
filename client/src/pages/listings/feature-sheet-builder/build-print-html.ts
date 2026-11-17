import type { RenderedPanels } from "./render-panels";
import { PRINT_LAYOUT } from "./defaults";

/**
 * Exact port of `doPrint()` from Feature_sheet_builder2.html.
 * Preview panels (556×748) are scaled into 8.5×11in halves inside 17.5×11.5in bleed doc.
 */
export function buildFeatureSheetPrintHtml(
  panels: RenderedPanels,
  options?: { autoPrint?: boolean },
): string {
  const autoPrint = options?.autoPrint === true;
  const bg = panels.bgColor || "#ffffff";
  const {
    finishWidthIn: FINISH_W,
    finishHeightIn: FINISH_H,
    docWidthIn: DOC_W,
    docHeightIn: DOC_H,
    bleedIn: BLEED,
    markOffsetIn: MARK_OFFSET,
    safetyIn: SAFETY,
    refWidthPx: REF_W,
    refHeightPx: REF_H,
  } = PRINT_LAYOUT;

  const MARK_LEN = Math.max(0.05, BLEED - MARK_OFFSET);
  const MARK_W = "0.5pt";
  const TARGET_W_PX = 8.5 * 96;
  const TARGET_H_PX = 11 * 96;
  const scaleX = TARGET_W_PX / REF_W;
  const scaleY = TARGET_H_PX / REF_H;

  function trimMarks(): string {
    const c = "#000";
    let marks = "";
    const xs = [0, FINISH_W / 2, FINISH_W];
    const ys = [0, FINISH_H];
    xs.forEach((x) => {
      ys.forEach((y) => {
        const top = y === 0 ? BLEED - MARK_OFFSET - MARK_LEN : BLEED + FINISH_H + MARK_OFFSET;
        marks += `<div style="position:absolute;top:${top}in;left:${BLEED + x}in;width:${MARK_W};height:${MARK_LEN}in;background:${c};transform:translateX(-50%)"></div>`;
      });
    });
    [0, FINISH_W].forEach((x) => {
      ys.forEach((y) => {
        const left = x === 0 ? BLEED - MARK_OFFSET - MARK_LEN : BLEED + FINISH_W + MARK_OFFSET;
        marks += `<div style="position:absolute;top:${BLEED + y}in;left:${left}in;width:${MARK_LEN}in;height:${MARK_W};background:${c};transform:translateY(-50%)"></div>`;
      });
    });
    return marks;
  }

  function scaledPanel(innerHTML: string, extraClass = ""): string {
    return (
      `<div class="panelhalf ${extraClass}">` +
      `<div class="panelscale" style="width:${REF_W}px;height:${REF_H}px;transform:scale(${scaleX.toFixed(5)},${scaleY.toFixed(5)});">` +
      innerHTML +
      `</div></div>`
    );
  }

  function sheetHTML(leftHTML: string, rightHTML: string, label: string): string {
    return (
      `<div class="psheet">` +
      `<div class="docbox">` +
      `<div class="finishbox">` +
      scaledPanel(leftHTML, "") +
      scaledPanel(rightHTML, "foldline") +
      `<div class="safetybox"></div>` +
      `</div>` +
      trimMarks() +
      `</div>` +
      `<div class="sheetlabel">${label}</div>` +
      `</div>`
    );
  }

  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Feature Sheet — Print</title>` +
    `<style>` +
    `*{box-sizing:border-box;margin:0;padding:0}` +
    `@page{size:${DOC_W}in ${DOC_H}in;margin:0}` +
    `html,body{width:${DOC_W}in;background:#888;font-family:Arial,sans-serif;height:auto}` +
    `.psheet{width:${DOC_W}in;height:${DOC_H}in;max-height:${DOC_H}in;display:flex;flex-direction:column;align-items:center;justify-content:center;page-break-after:always;page-break-inside:avoid;break-inside:avoid;overflow:hidden}` +
    `.psheet:last-child{page-break-after:auto}` +
    `.docbox{position:relative;width:${DOC_W}in;height:${DOC_H}in;background:${bg}}` +
    `.finishbox{position:absolute;top:${BLEED}in;left:${BLEED}in;width:${FINISH_W}in;height:${FINISH_H}in;display:flex;overflow:hidden;background:${bg}}` +
    `.panelhalf{width:8.5in;height:11in;overflow:hidden;position:relative;flex-shrink:0}` +
    `.panelscale{transform-origin:top left;position:relative}` +
    `.foldline{border-left:none}` +
    `.safetybox{position:absolute;top:${SAFETY}in;left:${SAFETY}in;right:${SAFETY}in;bottom:${SAFETY}in;border:0.5pt dashed rgba(255,0,0,0.4);pointer-events:none}` +
    `.sheetlabel{display:none}` +
    `.qr-slot svg{display:block;width:100%;height:100%}` +
    `@media print{.safetybox{display:none}}` +
    `@media screen{body{padding:24px 0}.psheet{box-shadow:0 0 0 1px rgba(0,0,0,0.15);margin-bottom:24px;height:${DOC_H}in}.sheetlabel{display:block;font-size:11px;color:#333;margin-top:6px}}` +
    `</style></head><body>` +
    sheetHTML(
      panels.p1,
      panels.p2,
      `Sheet 1 of 2 — Exterior · ${DOC_W}"×${DOC_H}" doc size (incl. 0.25in bleed) · trim ${FINISH_W}"×${FINISH_H}"`,
    ) +
    sheetHTML(
      panels.p3,
      panels.p4,
      `Sheet 2 of 2 — Interior · ${DOC_W}"×${DOC_H}" doc size (incl. 0.25in bleed) · trim ${FINISH_W}"×${FINISH_H}"`,
    ) +
    (autoPrint
      ? `<script>window.onload=function(){setTimeout(function(){window.print();},500);};<\/script>`
      : "") +
    `</body></html>`
  );
}
