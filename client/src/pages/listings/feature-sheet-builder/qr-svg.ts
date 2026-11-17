import qrcode from "qrcode-generator";

/** Same as Feature_sheet_builder2.html `normalizeUrl` + `qrcode(0,"M")`. */
export function normalizeTourUrl(raw: string): string {
  let u = (raw || "").trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u;
}

function colorizeQrSvg(rawSvg: string, qrColor: string): string {
  return rawSvg
    .replace(/="#000000"/gi, `="${qrColor}"`)
    .replace(/="#000"/gi, `="${qrColor}"`)
    .replace(/="black"/gi, `="${qrColor}"`)
    .replace("<svg ", '<svg style="width:100%;height:100%;display:block;" ');
}

/** Inline SVG for 36×36 slot — matches mockup `createSvgTag({cellSize:2,margin:1})`. */
export function renderQrSlotInnerHtml(tourUrl: string, qrColor = "#000000"): string {
  const url = normalizeTourUrl(tourUrl);
  if (!url) {
    return '<div style="font-size:4.5px;color:#999;text-align:center;line-height:1.2">NO TOUR<br>URL SET</div>';
  }
  try {
    const qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();
    return colorizeQrSvg(qr.createSvgTag({ cellSize: 2, margin: 1 }), qrColor);
  } catch {
    return '<div style="font-size:4px;color:#c00;text-align:center;line-height:1.2">QR ERROR</div>';
  }
}
