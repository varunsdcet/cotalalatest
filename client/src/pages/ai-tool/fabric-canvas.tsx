import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { Canvas as FabricCanvas, FabricImage, FabricObject } from "fabric";
import type { KitBrand } from "./kit-cards";
import {
  BADGE_WORDS,
  FONT_FAMILIES,
  SHAPE_POINTS,
  type DesignDoc,
  type DesignObject,
  type ImageAdjust,
  type Op,
  imageRadiusPx,
  resolveText,
} from "./kit-design";

type Tagged = FabricObject & { portalId?: string };
type Fabric = typeof import("fabric");

const SNAP = 8;
const ORIGIN = { originX: "left" as const, originY: "top" as const };
const SELECT_STYLE = {
  borderColor: "#B082F2",
  cornerColor: "#ffffff",
  cornerStrokeColor: "#B082F2",
  cornerSize: 10,
  cornerStyle: "rect" as const,
  transparentCorners: false,
  borderScaleFactor: 1.6,
  padding: 0,
};

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

function fitImage(img: FabricImage, w: number, h: number, fit: "cover" | "contain") {
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

function applyAdjust(fabric: Fabric, img: FabricImage, adj: ImageAdjust | undefined, w: number, h: number) {
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

export default function FabricCanvasView({
  design,
  pageIndex,
  zoom,
  selectedId,
  setSelectedId,
  photos,
  brand,
  tokens,
  dispatch,
  canvasRefOut,
}: {
  design: DesignDoc;
  pageIndex: number;
  zoom: number;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  photos: string[];
  brand: KitBrand;
  tokens: Record<string, string>;
  dispatch: (label: string, ops: Op[]) => void;
  canvasRefOut?: MutableRefObject<FabricCanvas | null>;
}) {
  const hostRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<FabricCanvas | null>(null);
  const suppress = useRef(false);
  const liveRef = useRef({ page: design.pages[pageIndex], design, dispatch, tokens, brand });
  const [ready, setReady] = useState(0);
  const [guides, setGuides] = useState<{ v: number | null; h: number | null }>({ v: null, h: null });
  const page = design.pages[pageIndex] ?? design.pages[0];
  liveRef.current = { page, design, dispatch, tokens, brand };

  useEffect(() => {
    let disposed = false;
    let local: FabricCanvas | null = null;
    const mount = async () => {
      const fabric = await import("fabric");
      await document.fonts.ready.catch(() => null);
      if (disposed || !hostRef.current) return;
      const canvas = new fabric.Canvas(hostRef.current, {
        width: design.width,
        height: design.height,
        preserveObjectStacking: true,
        selection: false,
        backgroundColor: design.pages[0]?.objects.some((o) => o.id === "hero_2") ? "#ffffff" : "#101214",
        stopContextMenu: true,
        uniformScaling: false,
      });
      local = canvas;
      canvasRef.current = canvas;
      if (canvasRefOut) canvasRefOut.current = canvas;
      setReady((n) => n + 1);

      const syncSelection = () => {
        if (suppress.current) return;
        setSelectedId((canvas.getActiveObject() as Tagged | undefined)?.portalId ?? null);
      };
      canvas.on("selection:created", syncSelection);
      canvas.on("selection:updated", syncSelection);
      canvas.on("selection:cleared", syncSelection);
      canvas.on("object:moving", (e) => {
        const t = e.target;
        if (!t) return;
        const w = t.getScaledWidth();
        const h = t.getScaledHeight();
        let v: number | null = null;
        let hz: number | null = null;
        const d = liveRef.current.design;
        const cx = (t.left || 0) + w / 2;
        const cy = (t.top || 0) + h / 2;
        if (Math.abs(cx - d.width / 2) < SNAP) {
          t.set({ left: d.width / 2 - w / 2 });
          v = d.width / 2;
        } else if (Math.abs(t.left || 0) < SNAP) {
          t.set({ left: 0 });
          v = 0;
        } else if (Math.abs((t.left || 0) + w - d.width) < SNAP) {
          t.set({ left: d.width - w });
          v = d.width;
        }
        if (Math.abs(cy - d.height / 2) < SNAP) {
          t.set({ top: d.height / 2 - h / 2 });
          hz = d.height / 2;
        } else if (Math.abs(t.top || 0) < SNAP) {
          t.set({ top: 0 });
          hz = 0;
        } else if (Math.abs((t.top || 0) + h - d.height) < SNAP) {
          t.set({ top: d.height - h });
          hz = d.height;
        }
        setGuides({ v, h: hz });
      });
      canvas.on("object:modified", (e) => {
        setGuides({ v: null, h: null });
        const t = e.target as Tagged;
        if (!t?.portalId) return;
        const source = liveRef.current.page.objects.find((o) => o.id === t.portalId);
        if (!source) return;
        const w = Math.round(t.getScaledWidth());
        const h = Math.round(t.getScaledHeight());
        const patch: { x?: number; y?: number; w?: number; h?: number; rot?: number } = {};
        if (Math.round(t.left || 0) !== source.x) patch.x = Math.round(t.left || 0);
        if (Math.round(t.top || 0) !== source.y) patch.y = Math.round(t.top || 0);
        if (w !== source.w) patch.w = w;
        if (h !== source.h) patch.h = h;
        if (Math.round(t.angle || 0) !== source.rot) patch.rot = Math.round(t.angle || 0);
        if (!Object.keys(patch).length) return;
        liveRef.current.dispatch("Moved object", [{ op: "transform", objId: t.portalId, ...patch }]);
      });
      canvas.on("text:editing:exited", (e) => {
        const t = e.target as Tagged & { text?: string };
        if (!t?.portalId) return;
        const source = liveRef.current.page.objects.find((o) => o.id === t.portalId);
        if (!source || source.type !== "text") return;
        const value = t.text ?? "";
        if (source.tokenKey) {
          liveRef.current.dispatch(`Updated ${source.tokenKey}`, [{ op: "set_token_source", tokenKey: source.tokenKey, value }]);
        } else if (value !== source.text) {
          liveRef.current.dispatch("Edited text", [{ op: "set_text", objId: source.id, value }]);
        }
      });
    };
    void mount();
    return () => {
      disposed = true;
      void local?.dispose();
      if (canvasRef.current === local) canvasRef.current = null;
      if (canvasRefOut && canvasRefOut.current === local) canvasRefOut.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design.width, design.height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let stale = false;
    const build = async (fabric: Fabric, obj: DesignObject): Promise<FabricObject | null> => {
      const b = liveRef.current.brand;
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
          const box = new fabric.Textbox(resolveText(obj, liveRef.current.tokens) || obj.text, {
            ...ORIGIN,
            left: obj.x,
            top: obj.y,
            width: obj.w,
            fontSize: obj.size,
            fontWeight: String(obj.weight),
            fontFamily: fontFamily(obj.font),
            fill: brandColor(obj.color, b),
            textAlign: obj.align,
            lineHeight: 1.15,
            editable: true,
          });
          return box;
        }
        case "shape": {
          const points = SHAPE_POINTS[obj.shape];
          const fill = obj.fill ? shapeFill(fabric, brandColor(obj.fill, b), obj.w, obj.h) : undefined;
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
          if (!b.logo) return new fabric.Rect({ ...ORIGIN, left: obj.x, top: obj.y, width: obj.w, height: obj.h, fill: "#333" });
          const img = await fabric.FabricImage.fromURL(b.logo, { crossOrigin: "anonymous" }).catch(() => null);
          if (!img) return null;
          const iw = img.width || obj.w;
          const ih = img.height || obj.h;
          const scale = Math.min(obj.w / iw, obj.h / ih);
          img.set({ ...ORIGIN, scaleX: scale, scaleY: scale, left: obj.x + (obj.w - iw * scale) / 2, top: obj.y + (obj.h - ih * scale) / 2 });
          return img;
        }
        case "headshot": {
          if (!b.headshot) {
            const initials = (tokens.agent_name || "R").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
            const bg = new fabric.Circle({ ...ORIGIN, radius: obj.w / 2, fill: b.bg || "#1B3050", stroke: "#fff", strokeWidth: 4 });
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
          const img = await fabric.FabricImage.fromURL(b.headshot, { crossOrigin: "anonymous" }).catch(() => null);
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
          const pill = new fabric.Rect({ ...ORIGIN, width: obj.w, height: obj.h, rx: obj.h / 2, ry: obj.h / 2, fill: b.bg || "#1B3050" });
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
    };
    const paint = async () => {
      const fabric = await import("fabric");
      const built: FabricObject[] = [];
      for (const obj of page.objects) {
        const fobj = await build(fabric, obj);
        if (stale) return;
        if (!fobj) continue;
        fobj.set({ angle: obj.rot, selectable: !obj.locked, evented: !obj.locked, ...SELECT_STYLE });
        (fobj as Tagged).portalId = obj.id;
        built.push(fobj);
      }
      if (stale || !canvasRef.current) return;
      suppress.current = true;
      canvas.remove(...canvas.getObjects());
      built.forEach((o) => canvas.add(o));
      const keep = built.find((o) => (o as Tagged).portalId === selectedId);
      if (keep) canvas.setActiveObject(keep);
      suppress.current = false;
      canvas.requestRenderAll();
    };
    void paint();
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, design, pageIndex, photos, brand.logo, brand.headshot, brand.bg, brand.accent, tokens]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    suppress.current = true;
    const active = canvas.getActiveObject() as Tagged | undefined;
    if (!selectedId && active) canvas.discardActiveObject();
    if (selectedId && active?.portalId !== selectedId) {
      const target = canvas.getObjects().find((o) => (o as Tagged).portalId === selectedId);
      if (target) canvas.setActiveObject(target);
    }
    canvas.requestRenderAll();
    suppress.current = false;
  }, [selectedId]);

  return (
    <div
      ref={wrapRef}
      className="relative"
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        width: design.width * zoom,
        height: design.height * zoom,
        boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
      }}
    >
      <div style={{ transform: `scale(${zoom})`, transformOrigin: "0 0", width: design.width, height: design.height }}>
        <canvas ref={hostRef} />
      </div>
      {guides.v !== null ? (
        <div style={{ position: "absolute", left: guides.v * zoom, top: 0, bottom: 0, width: 1, background: "#E8A13D", pointerEvents: "none" }} />
      ) : null}
      {guides.h !== null ? (
        <div style={{ position: "absolute", top: guides.h * zoom, left: 0, right: 0, height: 1, background: "#E8A13D", pointerEvents: "none" }} />
      ) : null}
    </div>
  );
}
