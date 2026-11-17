import { saveAs } from "file-saver";
import { shareOrSaveBlob } from "./kit-download";
import type { FabricObject } from "fabric";
import type { KitBrand, KitListing } from "./kit-cards";
import {
  BADGE_WORDS,
  FONT_FAMILIES,
  SHAPE_POINTS,
  imageRadiusPx,
  listingTokens,
  resolveText,
  type DesignDoc,
  type DesignObject,
  type EditorGroup,
  type ImageAdjust,
  loadStoredDesign,
} from "./kit-design";

type Fabric = typeof import("fabric");

const ORIGIN = { originX: "left" as const, originY: "top" as const };

function shapeFill(fabric: Fabric, fill: string | undefined, _w: number, h: number) {
  if (!fill) return undefined;
  const match = fill.match(/^linear-gradient\(\s*to\s+(top|bottom)\s*,\s*(.+)\s*,\s*(.+)\s*\)$/i);
  if (!match) return fill;
  const toTop = match[1].toLowerCase() === "top";
  const first = match[2].trim() === "transparent" ? "rgba(0,0,0,0)" : match[2].trim();
  const second = match[3].trim() === "transparent" ? "rgba(0,0,0,0)" : match[3].trim();
  return new fabric.Gradient({
    type: "linear",
    gradientUnits: "pixels",
    coords: { x1: 0, y1: 0, x2: 0, y2: h },
    colorStops: [
      { offset: 0, color: toTop ? second : first },
      { offset: 1, color: toTop ? first : second },
    ],
  });
}

function fontFamily(font: string) {
  return (FONT_FAMILIES[font] ?? FONT_FAMILIES.body).split(",")[0]!.replace(/['"]/g, "").trim();
}

function brandColor(color: string, brand: KitBrand) {
  if (color === "@primary") return brand.bg || "#1B3050";
  if (color === "@secondary") return brand.accent || "#B082F2";
  return color;
}

function fitImage(img: import("fabric").FabricImage, w: number, h: number, fit: "cover" | "contain") {
  const iw = img.width || w;
  const ih = img.height || h;
  const scale = fit === "contain" ? Math.min(w / iw, h / ih) : Math.max(w / iw, h / ih);
  img.set({
    scaleX: scale,
    scaleY: scale,
    cropX: Math.max(0, (iw - w / scale) * 0.5),
    cropY: Math.max(0, (ih - h / scale) * 0.5),
    width: Math.min(iw, w / scale),
    height: Math.min(ih, h / scale),
  });
}

function applyAdjust(fabric: Fabric, img: import("fabric").FabricImage, adj: ImageAdjust | undefined, w: number, h: number) {
  if (!adj) return;
  const filters = [];
  if (adj.brightness) filters.push(new fabric.filters.Brightness({ brightness: adj.brightness / 100 }));
  if (adj.contrast) filters.push(new fabric.filters.Contrast({ contrast: adj.contrast / 100 }));
  if (adj.saturation) filters.push(new fabric.filters.Saturation({ saturation: adj.saturation / 100 }));
  if (adj.hue) filters.push(new fabric.filters.HueRotation({ rotation: adj.hue / 180 }));
  if (adj.blur) filters.push(new fabric.filters.Blur({ blur: (((adj.blur / 100) * 24) / Math.max(w, h)) * 4 }));
  if (filters.length) {
    img.filters = filters;
    img.applyFilters();
  }
  if (adj.radius) {
    const rx = imageRadiusPx(adj, img.width || w, img.height || h);
    img.set({
      clipPath: new fabric.Rect({
        width: img.width,
        height: img.height,
        rx,
        ry: rx,
        originX: "center",
        originY: "center",
      }),
    });
  }
}

async function buildObject(
  fabric: Fabric,
  obj: DesignObject,
  brand: KitBrand,
  tokens: Record<string, string>,
): Promise<FabricObject | null> {
  switch (obj.type) {
    case "image": {
      const url = obj.assetId;
      if (!url) return new fabric.Rect({ ...ORIGIN, left: obj.x, top: obj.y, width: obj.w, height: obj.h, fill: "#222" });
      const img = await fabric.FabricImage.fromURL(url, { crossOrigin: "anonymous" }).catch(() =>
        fabric.FabricImage.fromURL(url).catch(() => null),
      );
      if (!img) return new fabric.Rect({ ...ORIGIN, left: obj.x, top: obj.y, width: obj.w, height: obj.h, fill: "#222" });
      fitImage(img, obj.w, obj.h, obj.fit);
      img.set({ ...ORIGIN, left: obj.x, top: obj.y });
      applyAdjust(fabric, img, obj.adjust, obj.w, obj.h);
      return img;
    }
    case "text": {
      return new fabric.Textbox(resolveText(obj, tokens) || obj.text, {
        ...ORIGIN,
        left: obj.x,
        top: obj.y,
        width: obj.w,
        fontSize: obj.size,
        fontWeight: String(obj.weight),
        fontFamily: fontFamily(obj.font),
        fill: brandColor(obj.color, brand),
        textAlign: obj.align,
        lineHeight: 1.15,
      });
    }
    case "shape": {
      const points = SHAPE_POINTS[obj.shape];
      const fill = obj.fill ? shapeFill(fabric, brandColor(obj.fill, brand), obj.w, obj.h) : undefined;
      if (points) {
        const poly = new fabric.Polygon(
          points.split(" ").map((pair) => {
            const [px, py] = pair.split(",").map(Number);
            return { x: px || 0, y: py || 0 };
          }),
          { ...ORIGIN, fill, objectCaching: false },
        );
        poly.set({ left: obj.x, top: obj.y, scaleX: obj.w / 100, scaleY: obj.h / 100 });
        return poly;
      }
      if (obj.shape === "ellipse") {
        return new fabric.Ellipse({ ...ORIGIN, left: obj.x, top: obj.y, rx: obj.w / 2, ry: obj.h / 2, fill });
      }
      return new fabric.Rect({
        ...ORIGIN,
        left: obj.x,
        top: obj.y,
        width: obj.w,
        height: obj.h,
        fill,
        rx: obj.radius,
        ry: obj.radius,
        objectCaching: false,
      });
    }
    case "logo": {
      if (!brand.logo) return new fabric.Rect({ ...ORIGIN, left: obj.x, top: obj.y, width: obj.w, height: obj.h, fill: "#333" });
      const img = await fabric.FabricImage.fromURL(brand.logo, { crossOrigin: "anonymous" }).catch(() => null);
      if (!img) return null;
      const iw = img.width || obj.w;
      const ih = img.height || obj.h;
      const scale = Math.min(obj.w / iw, obj.h / ih);
      img.set({ ...ORIGIN, scaleX: scale, scaleY: scale, left: obj.x + (obj.w - iw * scale) / 2, top: obj.y + (obj.h - ih * scale) / 2 });
      return img;
    }
    case "headshot": {
      if (!brand.headshot) {
        const initials = (tokens.agent_name || "R").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
        const bg = new fabric.Circle({ ...ORIGIN, radius: obj.w / 2, fill: brand.bg || "#1B3050", stroke: "#fff", strokeWidth: 4 });
        const label = new fabric.FabricText(initials, {
          fontSize: obj.h * 0.38,
          fontWeight: "600",
          fill: "#fff",
          originX: "center",
          originY: "center",
          left: obj.w / 2,
          top: obj.h / 2,
        });
        return new fabric.Group([bg, label], { ...ORIGIN, left: obj.x, top: obj.y });
      }
      const img = await fabric.FabricImage.fromURL(brand.headshot, { crossOrigin: "anonymous" }).catch(() => null);
      if (!img) return null;
      fitImage(img, obj.w, obj.h, "cover");
      img.set({
        ...ORIGIN,
        left: obj.x,
        top: obj.y,
        clipPath: new fabric.Circle({ radius: (img.width || obj.w) / 2, originX: "center", originY: "center" }),
      });
      return img;
    }
    case "badge": {
      const words = BADGE_WORDS[obj.badge] || BADGE_WORDS.just_listed;
      const pill = new fabric.Rect({ ...ORIGIN, width: obj.w, height: obj.h, rx: obj.h / 2, ry: obj.h / 2, fill: brand.bg || "#1B3050" });
      const label = new fabric.FabricText(words.join(" ").toUpperCase(), {
        fontSize: Math.min(obj.h * 0.42, 36),
        fontWeight: "600",
        fontFamily: fontFamily("display"),
        fill: "#fff",
        originX: "center",
        originY: "center",
        left: obj.w / 2,
        top: obj.h / 2,
      });
      return new fabric.Group([pill, label], { ...ORIGIN, left: obj.x, top: obj.y });
    }
    default:
      return null;
  }
}

export async function exportDesignToDataUrl(
  design: DesignDoc,
  pageIndex: number,
  brand: KitBrand,
  listing: KitListing,
  headline = "Just Listed",
): Promise<string> {
  const fabric = await import("fabric");
  await document.fonts.ready.catch(() => null);
  const page = design.pages[pageIndex] ?? design.pages[0];
  const tokens = listingTokens(listing, brand, headline);
  const el = document.createElement("canvas");
  const canvas = new fabric.StaticCanvas(el, {
    width: design.width,
    height: design.height,
    backgroundColor: page?.objects.some((o) => o.id === "hero_2") ? "#ffffff" : "#101214",
  });
  const built: FabricObject[] = [];
  for (const obj of page.objects) {
    const fobj = await buildObject(fabric, obj, brand, tokens);
    if (!fobj) continue;
    fobj.set({ angle: obj.rot, selectable: false, evented: false });
    built.push(fobj);
  }
  built.forEach((o) => canvas.add(o));
  canvas.renderAll();
  const dataUrl = canvas.toDataURL({ format: "jpeg", quality: 0.92, multiplier: 1 });
  canvas.dispose();
  return dataUrl;
}

export async function downloadStoredDesign(
  tourId: string,
  group: EditorGroup,
  index: number,
  listing: KitListing,
  brand: KitBrand,
  filename: string,
  headline = "Just Listed",
  pageIndex = 0,
): Promise<boolean> {
  const doc = loadStoredDesign(tourId, group, index);
  if (!doc) return false;
  const dataUrl = await exportDesignToDataUrl(doc, pageIndex, brand, listing, headline);
  const bin = atob(dataUrl.split(",")[1] || "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  saveAs(new Blob([bytes], { type: "image/jpeg" }), filename);
  return true;
}

export async function storedDesignPreviewUrl(
  tourId: string,
  group: EditorGroup,
  index: number,
  listing: KitListing,
  brand: KitBrand,
  headline = "Just Listed",
): Promise<string | null> {
  const doc = loadStoredDesign(tourId, group, index);
  if (!doc) return null;
  try {
    return await exportDesignToDataUrl(doc, 0, brand, listing, headline);
  } catch {
    return null;
  }
}

export async function shareStoredDesign(
  tourId: string,
  group: EditorGroup,
  index: number,
  listing: KitListing,
  brand: KitBrand,
  filename: string,
  headline = "Just Listed",
): Promise<boolean> {
  const doc = loadStoredDesign(tourId, group, index);
  if (!doc) return false;
  const dataUrl = await exportDesignToDataUrl(doc, 0, brand, listing, headline);
  const bin = atob(dataUrl.split(",")[1] || "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: "image/jpeg" });
  await shareOrSaveBlob(blob, filename, listing.address || "Listing post");
  return true;
}

export async function cardShareAsset(opts: {
  node: HTMLElement | null;
  filename: string;
  title: string;
  tourId?: string;
  group?: EditorGroup;
  index?: number;
  listing: KitListing;
  brand: KitBrand;
  headline?: string;
  fallbackShare: () => Promise<void>;
}): Promise<void> {
  if (opts.tourId && opts.group != null) {
    const ok = await shareStoredDesign(
      opts.tourId,
      opts.group,
      opts.index ?? 0,
      opts.listing,
      opts.brand,
      opts.filename,
      opts.headline,
    );
    if (ok) return;
  }
  await opts.fallbackShare();
}

export async function downloadCardAsset(opts: {
  node: HTMLElement | null;
  filename: string;
  tourId?: string;
  group?: EditorGroup;
  index?: number;
  listing: KitListing;
  brand: KitBrand;
  headline?: string;
  fallbackDownload: () => Promise<void>;
}): Promise<void> {
  if (opts.tourId && opts.group != null) {
    const ok = await downloadStoredDesign(
      opts.tourId,
      opts.group,
      opts.index ?? 0,
      opts.listing,
      opts.brand,
      opts.filename,
      opts.headline,
    );
    if (ok) return;
  }
  await opts.fallbackDownload();
}
