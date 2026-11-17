import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { saveAs } from "file-saver";
import type { Canvas as FabricCanvas } from "fabric";
import type { KitBrand, KitListing } from "./kit-cards";
import FabricCanvasView from "./fabric-canvas";
import ImageAdjustPanel from "./image-adjust-panel";
import {
  ARTBOARD,
  FONT_FAMILIES,
  applyOps,
  applyPostcardHeadline,
  createKitDesign,
  listingTokens,
  loadStoredDesign,
  postcardPhotoSlot,
  saveStoredDesign,
  scaleDesign,
  type DesignDoc,
  type EditorGroup,
  type Op,
} from "./kit-design";
import { kitBtn, kitBtnSm } from "./kit-ui";

export type { EditorGroup };

export type SlotMap = Record<EditorGroup, string[]>;

type Props = {
  tourId: string;
  group: EditorGroup;
  index: number;
  initialPage?: number;
  photos: string[];
  slots: SlotMap;
  listing: KitListing;
  brand: KitBrand;
  ribbon?: string;
  onIndex: (index: number) => void;
  onSwap: (group: EditorGroup, index: number, url: string) => void;
  onListing: (next: KitListing) => void;
  onRibbon?: (value: string) => void;
  onClose: () => void;
};

const VARIANT_PREFIX: Record<EditorGroup, string> = {
  stories: "Story",
  square: "Square",
  landscape: "Landscape",
  postcard: "Postcard",
  reel: "Reel photo",
  pinterest: "Tower",
  flyer: "Flyer",
  brochure: "Brochure",
  email: "Email",
};

const ADD_ITEMS = [
  { type: "heading", label: "Heading" },
  { type: "text", label: "Text" },
  { type: "media", label: "Photo frame" },
  { type: "shape", label: "Shape" },
  { type: "logo", label: "Logo" },
  { type: "badge", label: "Badge" },
] as const;

const SHAPES = ["rect", "ellipse", "triangle", "star", "arrow", "line"] as const;

function variantCount(group: EditorGroup, slots: SlotMap) {
  if (group === "postcard" || group === "pinterest" || group === "brochure" || group === "email") return 1;
  if (group === "flyer") return Math.max(2, slots.flyer.length ? 2 : 0);
  return Math.max(1, slots[group]?.length || 1);
}

function designPhotos(group: EditorGroup, slots: SlotMap, photos: string[]) {
  const fromSlots = (slots[group] || []).filter(Boolean);
  return fromSlots.length ? fromSlots : photos;
}

export default function KitEditor({
  tourId,
  group,
  index,
  initialPage = 0,
  photos,
  slots,
  listing,
  brand,
  ribbon,
  onIndex,
  onSwap,
  onListing,
  onRibbon,
  onClose,
}: Props) {
  const headline = ribbon || (index === 1 && group === "stories" ? "OPEN HOUSE" : "JUST LISTED");
  const [design, setDesign] = useState<DesignDoc>(
    () => loadStoredDesign(tourId, group, index) || createKitDesign(group, designPhotos(group, slots, photos), listing, brand, headline),
  );
  const [history, setHistory] = useState<DesignDoc[]>([]);
  const [future, setFuture] = useState<DesignDoc[]>([]);
  const [versions, setVersions] = useState<{ label: string; at: string }[]>([{ label: "Opened", at: new Date().toISOString() }]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(initialPage);
  const [zoom, setZoom] = useState(0.28);
  const [tab, setTab] = useState<"photos" | "data" | "assistant">("photos");
  const [saving, setSaving] = useState("Saved");
  const [prompt, setPrompt] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const page = design.pages[pageIndex] ?? design.pages[0];
  const selected = page?.objects.find((o) => o.id === selectedId) || null;
  const tokens = useMemo(() => listingTokens(listing, brand, headline), [listing, brand, headline]);
  const used = new Set((page?.objects || []).filter((o) => o.type === "image" && o.assetId).map((o) => (o.type === "image" ? o.assetId : "")));
  const variants = useMemo(() => Array.from({ length: variantCount(group, slots) }, (_, i) => `${VARIANT_PREFIX[group]} #${i + 1}`), [group, slots]);

  const fitZoom = useCallback(() => {
    const el = workspaceRef.current;
    if (!el) return;
    const scale = Math.min((el.clientWidth - 80) / design.width, (el.clientHeight - 80) / design.height, 1);
    setZoom(Math.max(0.08, Math.round(scale * 100) / 100));
  }, [design.width, design.height]);

  useEffect(() => {
    fitZoom();
    window.addEventListener("resize", fitZoom);
    return () => window.removeEventListener("resize", fitZoom);
  }, [fitZoom]);

  useEffect(() => {
    const stored = loadStoredDesign(tourId, group, index);
    const next = stored || createKitDesign(group, designPhotos(group, slots, photos), listing, brand, headline);
    setDesign(group === "postcard" ? applyPostcardHeadline(next, headline) : next);
    setHistory([]);
    setFuture([]);
    setSelectedId(null);
    setPageIndex(Math.max(0, Math.min(initialPage, next.pages.length - 1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourId, group, index, initialPage]);

  useEffect(() => {
    if (group !== "postcard") return;
    setDesign((d) => {
      const next = applyPostcardHeadline(d, headline);
      saveStoredDesign(tourId, group, index, next);
      return next;
    });
  }, [headline, group, tourId, index]);

  const dispatch = useCallback(
    (label: string, ops: Op[]) => {
      const tokenOp = ops.find((o) => o.op === "set_token_source");
      if (tokenOp && tokenOp.op === "set_token_source") {
        const map: Record<string, keyof KitListing> = {
          price: "price",
          beds: "beds",
          baths: "baths",
          sqft: "sqft",
          mls_number: "mls",
          address: "address",
          lot_sqft: "lot",
        };
        const field = map[tokenOp.tokenKey];
        if (field) onListing({ ...listing, [field]: tokenOp.value });
        if (tokenOp.tokenKey === "headline" && onRibbon) onRibbon(tokenOp.value);
      }
      const swap = ops.find((o) => o.op === "swap_photo");
      if (swap && swap.op === "swap_photo") {
        const postcardSlot = postcardPhotoSlot(swap.frameId);
        const fromFrame = /^hero_(\d+)$/.exec(swap.frameId);
        const slot = postcardSlot ?? (fromFrame ? Number(fromFrame[1]) - 1 : index);
        onSwap(group, Number.isFinite(slot) ? slot : index, swap.assetId);
      }
      const next = applyOps(design, ops);
      setHistory((h) => [...h.slice(-49), design]);
      setFuture([]);
      setDesign(next);
      saveStoredDesign(tourId, group, index, next);
      setVersions((v) => [...v, { label, at: new Date().toISOString() }]);
      setSaving("Saved");
    },
    [design, tourId, group, index, listing, onListing, onRibbon, onSwap],
  );

  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setFuture((f) => [design, ...f]);
    setHistory((h) => h.slice(0, -1));
    setDesign(prev);
    saveStoredDesign(tourId, group, index, prev);
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    setHistory((h) => [...h, design]);
    setFuture((f) => f.slice(1));
    setDesign(next);
    saveStoredDesign(tourId, group, index, next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if ((e.key === "Backspace" || e.key === "Delete") && selectedId && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        dispatch("Deleted object", [{ op: "delete_object", objId: selectedId }]);
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const downloadJpeg = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const data = canvas.toDataURL({ format: "jpeg", quality: 0.92, multiplier: 1 });
    const bin = atob(data.split(",")[1] || "");
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    saveAs(new Blob([bytes], { type: "image/jpeg" }), `${tourId}_${group}_${group === "postcard" ? (pageIndex === 0 ? "front" : "back") : index + 1}.jpg`);
  };

  const adaptAll = () => {
    (Object.keys(ARTBOARD) as EditorGroup[]).forEach((g) => {
      if (g === group) return;
      const size = ARTBOARD[g];
      saveStoredDesign(tourId, g, 0, scaleDesign(design, size.w, size.h));
    });
    setLog((l) => ["Adapted this layout to every format.", ...l]);
  };

  const runAssistant = () => {
    const q = prompt.trim().toLowerCase();
    if (!q) return;
    setLog((l) => [`You: ${prompt}`, ...l]);
    setPrompt("");
    const photoN = q.match(/photo\s*#?(\d+)/);
    const image = page.objects.find((o) => o.type === "image");
    if (photoN && image) {
      const url = photos[Number(photoN[1]) - 1];
      if (url) {
        dispatch("Assistant: swapped photo", [{ op: "swap_photo", frameId: image.id, assetId: url }]);
        setLog((l) => [`Assistant: swapped hero → photo ${photoN[1]}`, ...l]);
        return;
      }
    }
    if (q.includes("open house")) {
      const badge = page.objects.find((o) => o.type === "badge");
      if (badge) dispatch("Assistant: set Open House", [{ op: "set_style", objId: badge.id, props: { badge: "open_house" } }]);
      onRibbon?.("OPEN HOUSE");
      setLog((l) => ["Assistant: set badge to Open House", ...l]);
      return;
    }
    if (q.includes("just sold")) {
      const badge = page.objects.find((o) => o.type === "badge");
      if (badge) dispatch("Assistant: set Just Sold", [{ op: "set_style", objId: badge.id, props: { badge: "just_sold" } }]);
      onRibbon?.("JUST SOLD");
      setLog((l) => ["Assistant: set Just Sold", ...l]);
      return;
    }
    if (q.includes("just listed")) {
      const badge = page.objects.find((o) => o.type === "badge");
      if (badge) dispatch("Assistant: set Just Listed", [{ op: "set_style", objId: badge.id, props: { badge: "just_listed" } }]);
      onRibbon?.("JUST LISTED");
      setLog((l) => ["Assistant: set badge to Just Listed", ...l]);
      return;
    }
    if (q.includes("add text") || q.includes("headline")) {
      dispatch("Assistant: added heading", [{ op: "add_object", type: "heading", props: { text: listing.address || "Headline", y: 120 } }]);
      setLog((l) => ["Assistant: added a heading", ...l]);
      return;
    }
    setLog((l) => ["Assistant: try “swap photo 3”, “open house”, or “add text”.", ...l]);
  };

  const selectedImage = selected?.type === "image" ? selected : null;
  const selectedText = selected?.type === "text" ? selected : null;

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-[#0a0a0c] text-white">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10 bg-[#111114]">
        <button type="button" className="text-sm font-semibold text-[#B082F2]" onClick={onClose}>
          {group === "postcard" ? "← Back" : "← Back to kit"}
        </button>
        {variants.length > 1 ? (
        <div className="flex gap-1 p-1 rounded-lg bg-white/5 border border-white/10 overflow-x-auto">
          {variants.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => onIndex(i)}
              className={`text-[13px] font-semibold rounded-md px-3 py-1.5 whitespace-nowrap transition-all ${i === index ? "bg-white text-black shadow-[0_6px_20px_rgba(255,255,255,0.15)]" : "text-white/60"}`}
            >
              {label}
            </button>
          ))}
        </div>
        ) : (
          <p className="text-sm font-semibold mb-0">{group === "postcard" ? "Postcard · Front & back" : VARIANT_PREFIX[group]}</p>
        )}
        <button type="button" className="text-sm text-white/60" disabled={!history.length} onClick={undo}>
          Undo
        </button>
        <button type="button" className="text-sm text-white/60" disabled={!future.length} onClick={redo}>
          Redo
        </button>
        <button type="button" className="text-sm text-white/60" onClick={() => setShowVersions((s) => !s)}>
          Versions
        </button>
        <span className="flex-1" />
        <span className="hidden md:inline text-xs font-mono text-white/40">{saving} · Fabric.js</span>
        <button type="button" className="text-sm text-white/60" onClick={adaptAll}>
          Adapt to all formats
        </button>
        <button type="button" className="text-sm text-white/60" onClick={downloadJpeg}>
          Download JPG
        </button>
        <button type="button" className={kitBtn} onClick={onClose}>
          Save & close
        </button>
      </div>

      {selected ? (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10 bg-[#111114] text-[13px]">
          <span className="text-white/45 font-mono">{selected.type}</span>
          {selectedText ? (
            <select
              value={selectedText.font}
              onChange={(e) => dispatch("Changed font", [{ op: "set_style", objId: selectedText.id, props: { font: e.target.value } }])}
              className="bg-black/40 border border-white/15 rounded px-2 py-1 text-white"
            >
              {Object.keys(FONT_FAMILIES).map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          ) : null}
          <button type="button" className="text-white/70" onClick={() => dispatch("Duplicated", [{ op: "add_object", type: selected.type === "image" ? "media" : selected.type, props: { ...selected, x: selected.x + 24, y: selected.y + 24, assetId: selected.type === "image" ? selected.assetId : undefined } }])}>
            Duplicate
          </button>
          <button type="button" className="text-red-300" onClick={() => { dispatch("Deleted object", [{ op: "delete_object", objId: selected.id }]); setSelectedId(null); }}>
            Delete
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10 bg-[#111114] text-[13px] text-white/50">
          Select, move, resize, rotate. Double-click text to edit. Snap guides on.
          {design.pages.length > 1 ? (
            <span className="ml-4 flex gap-1">
              {design.pages.map((p, i) => (
                <button key={p.id} type="button" className={`px-2 py-0.5 rounded ${i === pageIndex ? "bg-white/15 text-white" : ""}`} onClick={() => setPageIndex(i)}>
                  {group === "postcard" ? (i === 0 ? "Front" : "Back") : `Page ${i + 1}`}
                </button>
              ))}
              {design.pages.length < design.limits.maxPages ? (
                <button type="button" className="text-[#B082F2]" onClick={() => dispatch("Added page", [{ op: "add_object", type: "page", props: {} }])}>
                  + Page
                </button>
              ) : null}
            </span>
          ) : design.limits.maxPages > 1 ? (
            <button type="button" className="text-[#B082F2]" onClick={() => dispatch("Added page", [{ op: "add_object", type: "page", props: {} }])}>
              + Page
            </button>
          ) : null}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        <aside className="w-[168px] border-r border-white/10 bg-[#111114] p-3 overflow-y-auto">
          <p className="text-[11px] uppercase tracking-wide text-white/40 mb-2">Add an item</p>
          {ADD_ITEMS.map((item) => (
            <button
              key={item.type}
              type="button"
              className="block w-full text-left text-[13px] text-white/80 py-1.5 hover:text-white"
              onClick={() => dispatch(`Added ${item.label}`, [{ op: "add_object", type: item.type, props: {} }])}
            >
              {item.label}
            </button>
          ))}
          <p className="text-[11px] uppercase tracking-wide text-white/40 mt-4 mb-2">Shapes</p>
          {SHAPES.map((shape) => (
            <button
              key={shape}
              type="button"
              className="block w-full text-left text-[13px] text-white/80 py-1 hover:text-white capitalize"
              onClick={() => dispatch(`Added ${shape}`, [{ op: "add_object", type: "shape", props: { shape } }])}
            >
              {shape}
            </button>
          ))}
        </aside>

        <section ref={workspaceRef} className="relative flex-1 flex items-center justify-center overflow-auto" style={{ background: group === "postcard" ? "#cfc8bb" : "#16161a" }} onPointerDown={() => setSelectedId(null)}>
          <FabricCanvasView
            design={design}
            pageIndex={pageIndex}
            zoom={zoom}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            photos={photos}
            brand={brand}
            tokens={tokens}
            dispatch={dispatch}
            canvasRefOut={fabricRef}
          />
          <div className="absolute left-5 bottom-5 flex items-center gap-3 rounded-full bg-black/70 border border-white/15 px-4 py-2">
            <button type="button" onClick={() => setZoom((z) => Math.max(0.08, z - 0.05))}>−</button>
            <span className="text-xs font-mono text-white/70 w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((z) => Math.min(1.5, z + 0.05))}>+</button>
            <button type="button" className="text-xs font-semibold text-[#B082F2]" onClick={fitZoom}>
              Fit
            </button>
          </div>
        </section>

        <aside className="w-[300px] max-w-[42vw] border-l border-white/10 bg-[#111114] flex flex-col min-h-0">
          <div className="flex border-b border-white/10">
            {(["photos", "data", "assistant"] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex-1 py-3 text-[12px] font-semibold capitalize ${tab === id ? "text-[#B082F2] border-b-2 border-[#B082F2]" : "text-white/50"}`}
              >
                {id === "data" ? "Listing" : id === "assistant" ? "AI" : "Photos"}
              </button>
            ))}
          </div>
          {tab === "photos" ? (
            <div className="p-3 overflow-y-auto flex-1">
              {selectedImage ? <ImageAdjustPanel frame={selectedImage} dispatch={dispatch} /> : null}
              <p className="text-[13px] font-semibold mb-1">Tap a photo to swap</p>
              <p className="text-[12px] text-white/40 mb-3">Drag onto the canvas · ✓ used</p>
              <div className="grid grid-cols-3 gap-2">
                {photos.map((url, i) => {
                  const inDesign = used.has(url);
                  return (
                    <button
                      key={`${url}-${i}`}
                      type="button"
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", url)}
                      onClick={() => {
                        const frame = selectedImage || page.objects.find((o) => o.type === "image");
                        if (frame) dispatch("Swapped photo", [{ op: "swap_photo", frameId: frame.id, assetId: url }]);
                      }}
                      className="relative aspect-square rounded-lg overflow-hidden p-0 border-0"
                      style={{ outline: inDesign ? "2px solid #E8A13D" : "1px solid rgba(255,255,255,0.08)" }}
                    >
                      <img src={url} alt={`#${i + 1}`} className="w-full h-full object-cover" />
                      {inDesign ? <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#E8A13D] text-black text-[10px] font-bold">✓</span> : null}
                      <span className="absolute bottom-0 left-0 text-[9px] px-1 bg-black/70">#{i + 1}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          {tab === "data" ? (
            <div className="p-4 overflow-y-auto flex-1 space-y-3">
              {(
                [
                  ["address", "Address"],
                  ["price", "Price"],
                  ["beds", "Beds"],
                  ["baths", "Baths"],
                  ["sqft", "Square ft"],
                  ["mls", "MLS#"],
                ] as Array<[keyof KitListing, string]>
              ).map(([key, label]) => (
                <label key={key} className="block">
                  <span className="text-[11px] text-white/45 block mb-1">{label}</span>
                  <input
                    value={String(listing[key] || "")}
                    onChange={(e) => onListing({ ...listing, [key]: e.target.value })}
                    className="w-full rounded-lg px-3 py-2 text-sm bg-black/40 border border-white/15 text-white"
                  />
                </label>
              ))}
              <p className="text-[12px] text-white/35">Smart tokens on the canvas update from these fields. Double-click a token to write back.</p>
            </div>
          ) : null}
          {tab === "assistant" ? (
            <div className="p-3 flex flex-col flex-1 min-h-0">
              <p className="text-[13px] font-semibold mb-2">In-editor assistant</p>
              <div className="flex-1 overflow-y-auto text-[12px] text-white/60 space-y-2 mb-3">
                {log.map((line, i) => (
                  <p key={i} className="mb-0">{line}</p>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runAssistant()}
                  placeholder="swap photo 3"
                  className="flex-1 rounded-lg px-3 py-2 text-sm bg-black/40 border border-white/15 text-white"
                />
                <button type="button" className={kitBtnSm} onClick={runAssistant}>
                  Go
                </button>
              </div>
            </div>
          ) : null}
        </aside>
      </div>

      {showVersions ? (
        <div className="absolute right-4 top-16 w-72 max-h-80 overflow-auto rounded-xl border border-white/15 bg-[#111114] p-3 z-[130]">
          <p className="text-[13px] font-semibold mb-2">Version history</p>
          {versions.slice().reverse().map((v, i) => (
            <p key={`${v.at}-${i}`} className="text-[12px] text-white/60 mb-1">
              v{versions.length - i} · {v.label}
            </p>
          ))}
          <button
            type="button"
            className="text-[12px] text-[#B082F2] mt-2"
            onClick={() => {
              const fresh = createKitDesign(group, slots[group] || photos, listing, brand, headline);
              setDesign(fresh);
              saveStoredDesign(tourId, group, index, fresh);
              setShowVersions(false);
            }}
          >
            Reset to v0
          </button>
        </div>
      ) : null}
    </div>
  );
}
