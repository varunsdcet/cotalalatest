import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

/** Assumes 96 CSS px per inch (browser default). */
const PX_PER_MM = 96 / 25.4;

/** html2canvas only supports rgb/rgba/hsl + named colors — not oklch/lab/etc. */
const MODERN_COLOR_RE = /oklch\s*\(|oklab\s*\(|\blch\s*\(|\blab\s*\(|color\s*\(\s*display-p3/i;

function cssColorToRgbCanvas(cssColor: string): string {
  const t = (cssColor || "").trim().toLowerCase();
  if (t === "transparent" || t === "rgba(0, 0, 0, 0)" || t === "rgba(0,0,0,0)") return "rgba(0, 0, 0, 0)";
  try {
    const c = document.createElement("canvas");
    c.width = 1; c.height = 1;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return "#000000";
    ctx.fillStyle = cssColor;
    ctx.fillRect(0, 0, 1, 1);
    const data = ctx.getImageData(0, 0, 1, 1).data;
    const r = data[0];
    const g = data[1];
    const b = data[2];
    const a = data[3];
    return a < 255 ? `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(4)})` : `rgb(${r}, ${g}, ${b})`;
  } catch { return "#000000"; }
}

function isColorOnlyProperty(prop: string): boolean {
  return /^(color|background-color|fill|stroke|caret-color|column-rule-color|outline-color|text-decoration-color)$/i.test(prop)
    || /color$/i.test(prop);
}

function coerceCssValueForHtml2Canvas(prop: string, value: string): string {
  const v = (value || "").trim();
  if (!v || !MODERN_COLOR_RE.test(v)) return v;
  const colorishName = isColorOnlyProperty(prop);
  if (colorishName && !/\bgradient\b/i.test(v)) return cssColorToRgbCanvas(v);
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;";
  document.body.appendChild(probe);
  try {
    probe.style.setProperty(prop, v);
    const resolved = getComputedStyle(probe).getPropertyValue(prop);
    if (resolved && !MODERN_COLOR_RE.test(resolved)) return resolved;
  } catch { /* invalid */ } finally { document.body.removeChild(probe); }
  if (/^box-shadow$|^filter$|^backdrop-filter$/i.test(prop)) return "none";
  if (colorishName) return cssColorToRgbCanvas(v);
  return v;
}

function stripAuthorStylesFromClone(clonedDoc: Document): void {
  clonedDoc.querySelectorAll('link[rel="stylesheet"]').forEach((n) => n.remove());
  clonedDoc.querySelectorAll("style").forEach((n) => n.remove());
}

function isStyleableElement(el: Element): el is HTMLElement | SVGElement {
  return el instanceof HTMLElement || el instanceof SVGElement;
}

function sanitizeClonedDocumentShell(clonedDoc: Document): void {
  const html = clonedDoc.documentElement;
  const body = clonedDoc.body;
  if (html instanceof HTMLElement) {
    const bg = getComputedStyle(html).getPropertyValue("background-color");
    if (MODERN_COLOR_RE.test(bg)) html.style.setProperty("background-color", cssColorToRgbCanvas(bg), "important");
  }
  if (body instanceof HTMLElement) {
    const cs = getComputedStyle(body);
    const bg = cs.getPropertyValue("background-color");
    const col = cs.getPropertyValue("color");
    if (MODERN_COLOR_RE.test(bg)) body.style.setProperty("background-color", cssColorToRgbCanvas(bg), "important");
    if (MODERN_COLOR_RE.test(col)) body.style.setProperty("color", cssColorToRgbCanvas(col), "important");
  }
}

const SKIP_COMPUTED_PROPS = new Set([
  "overflow", "overflow-x", "overflow-y", "overflow-clip-margin",
  "will-change", "contain", "content-visibility", "isolation", "z-index",
]);

function inlineComputedStylesOntoClone(originalRoot: HTMLElement, clonedRoot: HTMLElement): void {
  const walk = (orig: Element, clone: Element): void => {
    if (orig.nodeType !== Node.ELEMENT_NODE || clone.nodeType !== Node.ELEMENT_NODE) return;
    if (isStyleableElement(orig) && isStyleableElement(clone)) {
      const cs = getComputedStyle(orig);
      for (let i = 0; i < cs.length; i++) {
        const name = cs.item(i);
        if (SKIP_COMPUTED_PROPS.has(name)) continue;
        if (name === "position") {
          const pos = cs.getPropertyValue("position");
          if ((pos === "absolute" || pos === "fixed" || pos === "sticky") && clone instanceof HTMLElement) {
            clone.style.setProperty("position", "relative", "important");
          }
          continue;
        }
        let val = cs.getPropertyValue(name);
        if (!val) continue;
        let attempts = 0;
        while (MODERN_COLOR_RE.test(val) && attempts < 3) { val = coerceCssValueForHtml2Canvas(name, val); attempts++; }
        if (MODERN_COLOR_RE.test(val)) {
          if (/^box-shadow$|^filter$|^backdrop-filter$/i.test(name)) val = "none";
          else if (isColorOnlyProperty(name) && !/\bgradient\b/i.test(val)) val = "rgb(0, 0, 0)";
          else if (/^background$/i.test(name)) val = "none";
          else val = "none";
        }
        clone.style.setProperty(name, val, "important");
      }
    }
    const oChildren = Array.from(orig.children);
    const cChildren = Array.from(clone.children);
    for (let j = 0; j < oChildren.length && j < cChildren.length; j++) walk(oChildren[j], cChildren[j]);
  };
  walk(originalRoot, clonedRoot);
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE-DOM PRE-PROCESSING APPROACH
//
// Instead of patching the html2canvas internal clone (which is unreliable
// because: the clone is deep-copied after author styles are stripped, selector
// matching breaks, and images outside [data-oversize-print-root] are missed),
// we now mutate the LIVE DOM directly before html2canvas runs, then fully
// restore every change afterward.
//
// Benefits:
//   • We operate on the exact nodes html2canvas will rasterize — no copy issues
//   • Image src replacements are visible to html2canvas immediately
//   • No selector scope bugs (the logo was outside the old search root)
//   • Every change is recorded and fully undone in the finally block
// ─────────────────────────────────────────────────────────────────────────────

interface StyleRestore { el: HTMLElement; prop: string; prev: string; prevPriority: string; }
interface TextRestore  { el: HTMLElement; prev: string | null; }

interface LiveDomSnapshot {
  styles: StyleRestore[];
  texts: TextRestore[];
}

/** Record + apply a style change to a live element. */
function liveSet(el: HTMLElement, prop: string, value: string, snap: LiveDomSnapshot): void {
  snap.styles.push({ el, prop, prev: el.style.getPropertyValue(prop), prevPriority: el.style.getPropertyPriority(prop) });
  el.style.setProperty(prop, value, "important");
}

/** Record + remove a style property from a live element. */
function liveRemove(el: HTMLElement, prop: string, snap: LiveDomSnapshot): void {
  snap.styles.push({ el, prop, prev: el.style.getPropertyValue(prop), prevPriority: el.style.getPropertyPriority(prop) });
  el.style.removeProperty(prop);
}

/** Record + replace text content on a live element. */
function liveText(el: HTMLElement, text: string, snap: LiveDomSnapshot): void {
  snap.texts.push({ el, prev: el.textContent });
  el.textContent = text;
}

function applyLiveFixes(root: HTMLElement): LiveDomSnapshot {
  const snap: LiveDomSnapshot = { styles: [], texts: [] };

  // ── 1. BROKERAGE LOGO ────────────────────────────────────────────────────
  // Remove object-fit/object-position which cause html2canvas to clip the bitmap,
  // and ensure the cell has enough width to show the full wordmark.
  root.querySelectorAll<HTMLImageElement>("[data-pdf-oversize-brokerage-logo]").forEach((img) => {
    const cell = img.parentElement;
    if (cell) {
      liveSet(cell, "overflow",     "visible", snap);
      liveSet(cell, "min-height",   "52px",    snap);
      liveSet(cell, "min-width",    "120px",   snap);
      liveSet(cell, "max-width",    "260px",   snap);
      liveSet(cell, "width",        "auto",    snap);
      liveSet(cell, "display",      "flex",    snap);
      liveSet(cell, "align-items",  "center",  snap);
      liveSet(cell, "flex-shrink",  "0",       snap);
    }
    liveSet(img,    "display",    "block",  snap);
    liveSet(img,    "width",      "auto",   snap);
    liveSet(img,    "height",     "auto",   snap);
    liveSet(img,    "max-height", "52px",   snap);
    liveSet(img,    "max-width",  "240px",  snap);
    liveRemove(img, "object-fit",           snap);
    liveRemove(img, "object-position",      snap);
  });

  // ── 1b. COTALA FOOTER WORDMARK (page 4 / oversize MLS column) ───────────
  root.querySelectorAll<HTMLImageElement>("[data-pdf-cotala-footer-logo]").forEach((img) => {
    const cell = img.closest("td");
    if (cell) {
      liveSet(cell, "overflow", "visible", snap);
      liveSet(cell, "vertical-align", "top", snap);
    }
    liveSet(img, "display", "block", snap);
    liveSet(img, "width", "auto", snap);
    liveSet(img, "max-width", "88px", snap);
    liveSet(img, "height", "auto", snap);
    liveRemove(img, "object-fit", snap);
    liveRemove(img, "object-position", snap);
  });

  // ── 2. AGENT ROW + RIGHT COLUMN ──────────────────────────────────────────
  const agentRow = root.querySelector<HTMLElement>("[data-pdf-oversize-agent-row]");
  if (agentRow) {
    liveSet(agentRow, "overflow",      "visible", snap);
    liveSet(agentRow, "padding-top",   "6px",     snap);
    liveSet(agentRow, "padding-bottom","10px",    snap);
    liveSet(agentRow, "align-items",   "center",  snap);
    liveSet(agentRow, "flex-shrink",   "0",       snap);
  }

  root.querySelectorAll<HTMLElement>("[data-pdf-oversize-agent-headshot]").forEach((img) => {
    liveSet(img, "display",     "block",   snap);
    liveSet(img, "overflow",    "visible", snap);
    liveSet(img, "flex-shrink", "0",       snap);
  });

  const rightCol = root.querySelector<HTMLElement>("[data-pdf-oversize-right-column]");
  if (rightCol) {
    liveSet(rightCol, "overflow",      "visible", snap);
    liveSet(rightCol, "padding-bottom","8px",     snap);
    liveSet(rightCol, "align-items",   "stretch", snap);
  }

  // ── 3. LEFT COLUMN OVERLAP ───────────────────────────────────────────────
  // The vertical divider between label and value columns was collapsing into the
  // text when position was blanket-stripped. Enforce fixed table layout so columns
  // cannot bleed into each other.
  root.querySelectorAll<HTMLElement>("table.nested-Table").forEach((tbl) => {
    liveSet(tbl, "table-layout", "fixed", snap);
    liveSet(tbl, "width",        "100%",  snap);
  });
  root.querySelectorAll<HTMLElement>(".body-table-container table").forEach((tbl) => {
    if (tbl.classList.contains("nested-Table")) return;
    liveSet(tbl, "table-layout", "fixed", snap);
    liveSet(tbl, "width",        "100%",  snap);
  });
  // Fix 3-col bathroom matrix overflow ("No. of Pieces" escaping right edge) by
  // overriding global th width (130px) only for this table in PDF.
  root.querySelectorAll<HTMLElement>("table.nested-Table th").forEach((th) => {
    const t = (th.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    if (t !== "no. of pieces") return;
    const table = th.closest("table.nested-Table");
    if (!(table instanceof HTMLElement)) return;
    liveSet(table, "table-layout", "fixed", snap);
    liveSet(table, "width", "100%", snap);
    table.querySelectorAll<HTMLElement>("th, td").forEach((cell) => {
      liveSet(cell, "width", "33.333%", snap);
      liveSet(cell, "max-width", "0", snap);
      liveSet(cell, "white-space", "normal", snap);
      liveSet(cell, "word-break", "break-word", snap);
      liveSet(cell, "overflow-wrap", "anywhere", snap);
      if (cell.tagName === "TH") {
        liveSet(cell, "font-size", "8px", snap);
      }
    });
  });
  // Keep visible breathing room around divider lines in PDF.
  root.querySelectorAll<HTMLElement>(".body-table-container hr").forEach((rule) => {
    liveSet(rule, "display",       "block", snap);
    liveSet(rule, "margin-top",    "6px",   snap);
    liveSet(rule, "margin-bottom", "4px",   snap);
    liveSet(rule, "line-height",   "0",     snap);
    liveSet(rule, "clear",         "both",  snap);
  });

  // ── 4. COVER IMAGE ───────────────────────────────────────────────────────
  const cover = root.querySelector<HTMLElement>("[data-pdf-oversize-cover]");
  if (cover) {
    liveSet(cover, "position",   "relative", snap);
    liveSet(cover, "z-index",    "0",        snap);
    liveSet(cover, "margin-top", "8px",      snap);
    liveSet(cover, "overflow",   "visible",  snap);
  }

  // ── 5. WELCOME BLOCK ─────────────────────────────────────────────────────
  const welcome = root.querySelector<HTMLElement>("[data-pdf-oversize-welcome]");
  if (welcome) {
    liveSet(welcome, "position",       "relative", snap);
    liveSet(welcome, "z-index",        "3",        snap);
    liveSet(welcome, "padding-bottom", "10px",     snap);
    liveSet(welcome, "margin-bottom",  "6px",      snap);
    const p = welcome.querySelector<HTMLElement>("p");
    if (p) {
      if (/^welcome\s+to$/i.test((p.textContent ?? "").replace(/\s+/g, " ").trim())) {
        liveText(p, "Welcome\u00a0to", snap);
      }
      liveSet(p, "display",        "block",  snap);
      liveSet(p, "margin-bottom",  "6px",    snap);
      liveSet(p, "letter-spacing", "0.04em", snap);
      liveSet(p, "word-spacing",   "0.12em", snap);
    }
    const h1 = welcome.querySelector<HTMLElement>("h1");
    if (h1) {
      liveSet(h1, "margin-top", "0",        snap);
      liveSet(h1, "position",   "relative", snap);
      liveSet(h1, "z-index",    "1",        snap);
    }
  }

  // ── 6. FOOTER CREDIT ("Produced and printed by…") ────────────────────────
  root.querySelectorAll<HTMLElement>("[data-pdf-footer-credit], .cotala-footer-credit").forEach((el) => {
    liveSet(el, "display",        "block",  snap);
    liveSet(el, "white-space",    "normal", snap);
    liveSet(el, "letter-spacing", "0.03em", snap);
    liveSet(el, "word-spacing",   "0.08em", snap);
    el.querySelectorAll<HTMLElement>("span, a").forEach((child) => {
      liveSet(child, "display",    "inline", snap);
      liveSet(child, "white-space","normal", snap);
    });
  });

  // ── 7. GENERIC inline-flex text wrappers ─────────────────────────────────
  root.querySelectorAll<HTMLElement>("*").forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.display !== "inline-flex" && cs.display !== "inline-block") return;
    if (el.querySelector("img, table, svg")) return;
    const allTextual = Array.from(el.children).every(
      (c) => c instanceof HTMLElement && !c.querySelector("img, table, svg"),
    );
    if (!allTextual) return;
    liveSet(el, "display",      "inline", snap);
    liveSet(el, "white-space",  "normal", snap);
    liveSet(el, "word-spacing", "0.06em", snap);
  });

  // ── 8. "Listed For" row ──────────────────────────────────────────────────
  root.querySelectorAll<HTMLElement>("span").forEach((span) => {
    if (!/^listed\s+for$/i.test((span.textContent ?? "").replace(/\s+/g, " ").trim())) return;
    liveText(span, "Listed\u00a0For", snap);
    const row = span.parentElement;
    if (row) {
      liveSet(row, "flex-wrap",   "nowrap",   snap);
      liveSet(row, "align-items", "baseline", snap);
      liveSet(row, "gap",         "0.5rem",   snap);
    }
    liveSet(span, "white-space", "nowrap", snap);
    const next = span.nextElementSibling as HTMLElement | null;
    if (next) liveSet(next, "white-space", "nowrap", snap);
  });

  // ── 9. MLS table cell spacing ────────────────────────────────────────────
  root.querySelectorAll<HTMLElement>("table.nested-Table th, table.nested-Table td").forEach((el) => {
    if (el.closest("tfoot") || el.closest(".footer-table")) return;
    liveSet(el, "letter-spacing", "normal",     snap);
    liveSet(el, "word-spacing",   "normal",     snap);
    liveSet(el, "white-space",    "normal",     snap);
    liveSet(el, "display",        "table-cell", snap);
    const pdfSpacing = el.closest(".feature-sheet-p4-pdf-spacing");
    const py = pdfSpacing ? "1px" : "0";
    liveSet(el, "padding-top",    py,           snap);
    liveSet(el, "padding-bottom", py,           snap);
    if (el.tagName === "TH") { liveSet(el, "padding-right", "6px", snap); liveSet(el, "padding-left", "0", snap); }
    else { liveSet(el, "padding-left", "6px", snap); }
  });

  root.querySelectorAll<HTMLElement>(".footer-table td, tfoot td").forEach((el) => {
    if (el.classList.contains("t-footer-col-2")) return;
    liveSet(el, "letter-spacing", "normal", snap);
    liveSet(el, "word-spacing",   "normal", snap);
    liveSet(el, "white-space",    "normal", snap);
    liveSet(el, "line-height",    "1.35",   snap);
    if (parseFloat(getComputedStyle(el).fontSize) < 9) liveSet(el, "font-size", "10px", snap);
  });

  // ── 10. Footer disclaimer + listing description ───────────────────────────
  root.querySelectorAll<HTMLElement>("table.footer-table td.t-footer-col-2").forEach((el) => {
    liveSet(el, "font-size",      "8px",    snap);
    liveSet(el, "line-height",    "1.35",   snap);
    liveSet(el, "letter-spacing", "0.04em", snap);
    liveSet(el, "word-spacing",   "0.06em", snap);
    liveSet(el, "white-space",    "normal", snap);
    liveSet(el, "vertical-align", "top",    snap);
    liveSet(el, "padding-top",    "2px",    snap);
    liveSet(el, "padding-bottom", "2px",    snap);
  });

  root.querySelectorAll<HTMLElement>('[data-pdf-export="listing-description"]').forEach((el) => {
    liveSet(el, "font-size",      "9px",    snap);
    liveSet(el, "line-height",    "1.45",   snap);
    liveSet(el, "letter-spacing", "0.04em", snap);
    liveSet(el, "word-spacing",   "0.06em", snap);
    liveSet(el, "white-space",    "normal", snap);
    liveSet(el, "min-height",     "0",      snap);
    liveSet(el, "max-height",     "none",   snap);
    liveSet(el, "overflow",       "visible",snap);
    liveSet(el, "overflow-y",     "visible",snap);
    liveSet(el, "margin-top",     "0",      snap);
    liveSet(el, "padding-top",    "0",      snap);
    const prev = el.previousElementSibling as HTMLElement | null;
    if (prev) liveSet(prev, "margin-bottom", "0", snap);
  });

  return snap;
}

function restoreLiveFixes(snap: LiveDomSnapshot): void {
  for (let i = snap.styles.length - 1; i >= 0; i--) {
    const { el, prop, prev, prevPriority } = snap.styles[i];
    if (prev) el.style.setProperty(prop, prev, prevPriority);
    else el.style.removeProperty(prop);
  }
  for (let i = snap.texts.length - 1; i >= 0; i--) {
    const { el, prev } = snap.texts[i];
    if (prev !== null) el.textContent = prev;
  }
}

// ─── SVG → PNG for brokerage logos ───────────────────────────────────────────

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function ensureImageDecoded(img: HTMLImageElement): Promise<void> {
  if (img.complete && img.naturalWidth > 0) return;
  try { if (typeof img.decode === "function") await img.decode(); } catch { /* fall through */ }
  if (img.naturalWidth > 0) return;
  await new Promise<void>((resolve, reject) => {
    const ok  = () => { cleanup(); resolve(); };
    const err = () => { cleanup(); reject(new Error("image load failed")); };
    const cleanup = () => { img.removeEventListener("load", ok); img.removeEventListener("error", err); };
    img.addEventListener("load", ok);
    img.addEventListener("error", err);
  });
}

async function imageElementToPngDataUrl(img: HTMLImageElement): Promise<string | null> {
  try { await ensureImageDecoded(img); } catch { return null; }
  const { naturalWidth: w, naturalHeight: h } = img;
  if (!w || !h) return null;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  try { ctx.drawImage(img, 0, 0); return c.toDataURL("image/png"); } catch { return null; }
}

async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!res.ok) return null;
    return readBlobAsDataUrl(await res.blob());
  } catch { return null; }
}

function cotalaSvgToPngUrl(resolved: string): string | null {
  if (!/\.svg(\?|#|$)/i.test(resolved)) return null;
  try {
    const u = new URL(resolved, window.location.href);
    const host = u.hostname.toLowerCase();
    if (host !== "cotala.com" && !host.endsWith(".cotala.com")) return null;
    if (!/\/brokerages\//.test(u.pathname)) return null;
  } catch { return null; }
  return resolved.replace(/\.svg(?=\?|#|$)/i, ".png");
}

/**
 * Replaces every image src with a data URL on the LIVE DOM (not in onclone).
 * Searches the entire root so the brokerage logo — which is outside
 * [data-oversize-print-root] — is always included.
 */
async function inlineImagesAsDataUrls(root: HTMLElement): Promise<() => void> {
  if (!root.querySelector("[data-oversize-print-root]")) return () => {};

  const imgs = Array.from(root.querySelectorAll<HTMLImageElement>("img[src]"));
  const restores: Array<{ el: HTMLImageElement; src: string | null }> = [];

  for (const img of imgs) {
    const attrSrc = img.getAttribute("src");
    const resolved = img.currentSrc || img.src || "";
    if (!resolved || resolved.startsWith("data:")) continue;

    let dataUrl: string | null = null;

    if (img.hasAttribute("data-pdf-oversize-brokerage-logo")) {
      // 1. Try Cotala's matching PNG (cleaner than rasterising SVG)
      const pngUrl = cotalaSvgToPngUrl(resolved);
      if (pngUrl) dataUrl = await fetchAsDataUrl(pngUrl);
      // 2. Canvas-rasterise the live <img> element
      if (!dataUrl) dataUrl = await imageElementToPngDataUrl(img);
      // 3. Fetch the original SVG as a last resort
      if (!dataUrl) dataUrl = await fetchAsDataUrl(resolved);
    } else {
      dataUrl = await fetchAsDataUrl(resolved);
      if (!dataUrl) dataUrl = await imageElementToPngDataUrl(img);
    }

    if (!dataUrl) continue;
    restores.push({ el: img, src: attrSrc });
    img.setAttribute("src", dataUrl);
    try { if (typeof img.decode === "function") await img.decode(); } catch { /* ignore */ }
  }

  return () => {
    for (const { el, src } of restores) {
      if (src === null || src === "") el.removeAttribute("src");
      else el.setAttribute("src", src);
    }
  };
}

// ─── Main export ─────────────────────────────────────────────────────────────

async function renderElementCanvas(target: HTMLElement): Promise<HTMLCanvasElement> {
  return html2canvas(target, {
    scale: 3,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
    windowWidth: target.scrollWidth,
    windowHeight: target.scrollHeight,
    width: target.scrollWidth,
    height: target.scrollHeight,
    x: 0,
    y: 0,
    scrollX: 0,
    scrollY: 0,
    onclone: (clonedDoc, clonedEl) => {
      // onclone only handles oklch color translation + computed style copy.
      stripAuthorStylesFromClone(clonedDoc);
      sanitizeClonedDocumentShell(clonedDoc);
      if (clonedEl instanceof HTMLElement) {
        inlineComputedStylesOntoClone(target, clonedEl);
      }
    },
  });
}

/**
 * Renders a DOM subtree to a PDF (WYSIWYG).
 *
 * For oversize sheets, exports each child page as its own PDF page for cleaner
 * finishing (instead of one very tall raster page).
 *
 * Strategy: mutate the live DOM before html2canvas, capture every change, restore
 * after. This avoids the "onclone patch missed the element" class of bugs.
 */
export async function downloadElementAsPdf(el: HTMLElement, filename: string): Promise<void> {
  // 1. Convert all image srcs → data URLs on the live DOM
  const restoreImages = await inlineImagesAsDataUrls(el);

  // 2. Apply all layout/spacing/color fixes to the live DOM
  const snap = applyLiveFixes(el);

  let canvases: HTMLCanvasElement[] = [];
  try {
    const pageCandidates = Array.from(el.children).filter(
      (n): n is HTMLElement => n instanceof HTMLElement,
    );
    const targets = pageCandidates.length > 1 ? pageCandidates : [el];
    for (const target of targets) {
      canvases.push(await renderElementCanvas(target));
    }
  } finally {
    // 3. Always restore the live DOM
    restoreLiveFixes(snap);
    restoreImages();
  }

  if (canvases.length === 0) return;

  const first = canvases[0];
  const firstWMm = first.width / PX_PER_MM;
  const firstHMm = first.height / PX_PER_MM;
  const pdf = new jsPDF({
    unit: "mm",
    format: [firstWMm, firstHMm],
    orientation: firstWMm > firstHMm ? "landscape" : "portrait",
    compress: true,
  });

  canvases.forEach((canvas, idx) => {
    const wMm = canvas.width / PX_PER_MM;
    const hMm = canvas.height / PX_PER_MM;
    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    if (idx > 0) {
      pdf.addPage([wMm, hMm], wMm > hMm ? "landscape" : "portrait");
    }
    pdf.addImage(imgData, "JPEG", 0, 0, wMm, hMm, undefined, "FAST");
  });
  pdf.save(filename);
}
