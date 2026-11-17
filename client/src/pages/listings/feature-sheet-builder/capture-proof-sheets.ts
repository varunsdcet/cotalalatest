import html2canvas from "html2canvas";
import type { RenderedPanels } from "./render-panels";

const PG_STYLE =
  "width:556px;height:748px;position:relative;overflow:hidden;flex-shrink:0;display:flex;flex-direction:column;";

function buildSheetElement(leftHtml: string, rightHtml: string): HTMLDivElement {
  const sheet = document.createElement("div");
  sheet.style.display = "flex";
  sheet.style.width = "1112px";
  sheet.style.height = "748px";
  sheet.style.background = "#fff";
  sheet.innerHTML =
    `<div style="${PG_STYLE}">${leftHtml}</div>` +
    `<div style="${PG_STYLE}">${rightHtml}</div>`;
  return sheet;
}

/** Low-res JPG proofs — same as HTML mockup `showProof()` (html2canvas @ 0.4 quality). */
export async function captureProofSheetImages(panels: RenderedPanels): Promise<{
  sheet1Jpg: string;
  sheet2Jpg: string;
}> {
  const offscreen = document.createElement("div");
  offscreen.style.position = "absolute";
  offscreen.style.top = "-9999px";
  offscreen.style.left = "-9999px";
  offscreen.style.width = "1112px";
  offscreen.style.background = "#fff";

  const sheet1 = buildSheetElement(panels.p1, panels.p2);
  const sheet2 = buildSheetElement(panels.p3, panels.p4);
  offscreen.appendChild(sheet1);
  offscreen.appendChild(sheet2);
  document.body.appendChild(offscreen);

  try {
    const opt = { scale: 1, useCORS: true, logging: false } as const;
    const canvas1 = await html2canvas(sheet1, opt);
    const canvas2 = await html2canvas(sheet2, opt);
    return {
      sheet1Jpg: canvas1.toDataURL("image/jpeg", 0.4),
      sheet2Jpg: canvas2.toDataURL("image/jpeg", 0.4),
    };
  } finally {
    document.body.removeChild(offscreen);
  }
}
