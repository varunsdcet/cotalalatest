import type { KitBrand, KitListing } from "./kit-cards";

export type EditorGroup =
  | "stories"
  | "square"
  | "landscape"
  | "postcard"
  | "reel"
  | "pinterest"
  | "flyer"
  | "brochure"
  | "email";

export const FONT_FAMILIES: Record<string, string> = {
  display: "'Space Grotesk', Helvetica, sans-serif",
  body: "'Instrument Sans', Helvetica, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
  serif: "'Playfair Display', Georgia, serif",
  script: "'Caveat', cursive",
  condensed: "'Oswald', Helvetica, sans-serif",
};

export const SHAPE_POINTS: Record<string, string> = {
  triangle: "50,0 100,100 0,100",
  arrow: "0,35 60,35 60,10 100,50 60,90 60,65 0,65",
  star: "50,0 61.2,34.6 97.6,34.6 68.1,55.9 79.4,90.5 50,69 20.6,90.5 31.9,55.9 2.4,34.6 38.8,34.6",
};

export const BADGE_WORDS: Record<string, [string, string]> = {
  just_listed: ["Just", "Listed"],
  open_house: ["Open", "House"],
  sold: ["Just", "Sold"],
  price_reduced: ["Price", "Reduced"],
  coming_soon: ["Coming", "Soon"],
};

export type SmartTokenKey =
  | "price"
  | "beds"
  | "baths"
  | "sqft"
  | "lot_sqft"
  | "mls_number"
  | "address"
  | "headline"
  | "agent_name"
  | "agent_phone"
  | "brokerage";

export type ImageAdjust = {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  blur: number;
  radius: number;
};

export const NEUTRAL_ADJUST: ImageAdjust = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  blur: 0,
  radius: 0,
};

type Base = { id: string; x: number; y: number; w: number; h: number; rot: number; locked: boolean };

export type DesignObject =
  | (Base & { type: "image"; assetId: string | null; fit: "cover" | "contain"; adjust: ImageAdjust })
  | (Base & {
      type: "text";
      text: string;
      font: keyof typeof FONT_FAMILIES;
      size: number;
      weight: number;
      color: string;
      align: "left" | "center" | "right";
      tokenKey: SmartTokenKey | null;
    })
  | (Base & {
      type: "shape";
      shape: "rect" | "ellipse" | "line" | "triangle" | "arrow" | "star";
      fill: string | null;
      stroke: string | null;
      strokeWidth: number;
      radius: number;
    })
  | (Base & { type: "logo"; variant: "light" | "dark" })
  | (Base & { type: "headshot"; shape: "circle" | "square"; ring: string | null })
  | (Base & { type: "badge"; badge: keyof typeof BADGE_WORDS; style: "pill" | "editorial" });

export type DesignPage = { id: string; optional: boolean; objects: DesignObject[] };

export type DesignDoc = {
  schemaVersion: 1;
  kind: "static";
  width: number;
  height: number;
  pages: DesignPage[];
  limits: { minPages: number; maxPages: number };
};

export type Op =
  | { op: "swap_photo"; frameId: string; assetId: string }
  | ({ op: "adjust_image"; frameId: string } & Partial<ImageAdjust>)
  | { op: "set_text"; objId: string; value: string }
  | { op: "set_token_source"; tokenKey: SmartTokenKey; value: string }
  | { op: "add_object"; type: string; props: Record<string, unknown> }
  | { op: "transform"; objId: string; x?: number; y?: number; w?: number; h?: number; rot?: number }
  | { op: "set_style"; objId: string; props: Record<string, unknown> }
  | { op: "delete_object"; objId: string };

export const ARTBOARD: Record<EditorGroup, { w: number; h: number; maxPages: number }> = {
  stories: { w: 1080, h: 1920, maxPages: 1 },
  square: { w: 1080, h: 1080, maxPages: 1 },
  landscape: { w: 1920, h: 1080, maxPages: 1 },
  pinterest: { w: 1000, h: 1500, maxPages: 1 },
  postcard: { w: 1875, h: 1275, maxPages: 2 },
  flyer: { w: 1275, h: 1650, maxPages: 2 },
  brochure: { w: 1920, h: 1080, maxPages: 4 },
  email: { w: 1200, h: 628, maxPages: 1 },
  reel: { w: 1080, h: 1920, maxPages: 1 },
};

function oid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

function box(id: string, x: number, y: number, w: number, h: number): Base {
  return { id, x, y, w, h, rot: 0, locked: false };
}

export function listingTokens(listing: KitListing, brand: KitBrand, headline: string): Record<SmartTokenKey, string> {
  return {
    price: listing.price || "",
    beds: listing.beds || "",
    baths: listing.baths || "",
    sqft: listing.sqft || "",
    lot_sqft: listing.lot || "",
    mls_number: listing.mls || "",
    address: listing.address || "",
    headline,
    agent_name: brand.name || "",
    agent_phone: brand.phone || "",
    brokerage: brand.brokerage || "",
  };
}

export function formatToken(key: SmartTokenKey, value: string) {
  if (key === "beds") return `${value} bd`;
  if (key === "baths") return `${value} ba`;
  if (key === "sqft") return `${value} sf`;
  if (key === "mls_number") return value ? `MLS® ${value}` : "";
  return value;
}

export function resolveText(obj: Extract<DesignObject, { type: "text" }>, tokens: Record<string, string>) {
  if (obj.tokenKey) {
    const v = tokens[obj.tokenKey];
    return v ? formatToken(obj.tokenKey, v) : "";
  }
  return obj.text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => tokens[k] || "");
}

export function imageRadiusPx(adj: ImageAdjust | undefined, w: number, h: number) {
  if (!adj?.radius) return 0;
  return (Math.min(w, h) * adj.radius) / 200;
}

export function createKitDesign(
  group: EditorGroup,
  photos: string[],
  listing: KitListing,
  brand: KitBrand,
  headline: string,
): DesignDoc {
  if (group === "postcard") return createPostcardDesign(photos, listing, brand, headline);
  const { w, h, maxPages } = ARTBOARD[group];
  const photo = photos[0] || "";
  const m = Math.round(Math.min(w, h) * 0.06);
  const objects: DesignObject[] = [
    { ...box("hero_1", 0, 0, w, h), type: "image", assetId: photo || null, fit: "cover", adjust: { ...NEUTRAL_ADJUST } },
    {
      ...box("wash_1", 0, Math.round(h * 0.55), w, Math.round(h * 0.45)),
      type: "shape",
      shape: "rect",
      fill: "rgba(16,18,20,0.72)",
      stroke: null,
      strokeWidth: 0,
      radius: 0,
    },
    {
      ...box("badge_1", m, h - Math.round(h * 0.28), Math.round(w * 0.42), Math.round(h * 0.045)),
      type: "badge",
      badge: /open/i.test(headline) ? "open_house" : "just_listed",
      style: "pill",
    },
    {
      ...box("addr_1", m, h - Math.round(h * 0.21), w - m * 2, Math.round(h * 0.08)),
      type: "text",
      text: listing.address || "Address",
      font: "display",
      size: Math.round(Math.min(w, h) * 0.045),
      weight: 600,
      color: "#ffffff",
      align: "left",
      tokenKey: "address",
    },
    {
      ...box("price_1", m, h - Math.round(h * 0.12), w - m * 2, Math.round(h * 0.06)),
      type: "text",
      text: listing.price || "",
      font: "body",
      size: Math.round(Math.min(w, h) * 0.032),
      weight: 500,
      color: brand.accent || "#B082F2",
      align: "left",
      tokenKey: "price",
    },
    { ...box("logo_1", m, m, Math.round(w * 0.22), Math.round(h * 0.06)), type: "logo", variant: "light" },
    {
      ...box("shot_1", w - m - Math.round(Math.min(w, h) * 0.12), m, Math.round(Math.min(w, h) * 0.12), Math.round(Math.min(w, h) * 0.12)),
      type: "headshot",
      shape: "circle",
      ring: "#ffffff",
    },
  ];
  if (group === "landscape" && photos[1]) {
    objects[0] = { ...objects[0], w: Math.round(w * 0.58) } as DesignObject;
    objects.splice(1, 0, {
      ...box("hero_2", Math.round(w * 0.58) + 12, 0, w - Math.round(w * 0.58) - 12, h),
      type: "image",
      assetId: photos[1],
      fit: "cover",
      adjust: { ...NEUTRAL_ADJUST },
    });
  }
  return {
    schemaVersion: 1,
    kind: "static",
    width: w,
    height: h,
    pages: [{ id: "p1", optional: false, objects }],
    limits: { minPages: 1, maxPages },
  };
}

function createPostcardDesign(photos: string[], listing: KitListing, brand: KitBrand, headline: string): DesignDoc {
  const { w, h, maxPages } = ARTBOARD.postcard;
  const sold = /sold/i.test(headline);
  const status = sold ? "JUST SOLD" : "JUST LISTED";
  const statusColor = sold ? "#c62828" : "#1f8a4d";
  const priceLabel = sold ? "SOLD FOR" : "LISTED FOR";
  const addr = (listing.address || "ADDRESS").toUpperCase();
  const facts = [listing.sqft && `${listing.sqft} SF`, listing.beds && `${listing.beds} BEDROOMS`, listing.baths && `${listing.baths} BATHROOMS`]
    .filter(Boolean)
    .join("  |  ");
  const meta = [listing.mls && `MLS®: ${listing.mls}`, listing.year && `Year Built: ${listing.year}`].filter(Boolean).join("  |  ");
  const copy =
    listing.description?.trim() ||
    "Thinking of buying or selling? Let me help you reach your goals in this changing market.";
  const img = (id: string, x: number, y: number, iw: number, ih: number, src: string | undefined): DesignObject => ({
    ...box(id, x, y, iw, ih),
    type: "image",
    assetId: src || photos[0] || null,
    fit: "cover",
    adjust: { ...NEUTRAL_ADJUST },
  });
  const rect = (id: string, x: number, y: number, rw: number, rh: number, fill: string): DesignObject => ({
    ...box(id, x, y, rw, rh),
    type: "shape",
    shape: "rect",
    fill,
    stroke: null,
    strokeWidth: 0,
    radius: 0,
  });
  const txt = (
    id: string,
    x: number,
    y: number,
    tw: number,
    th: number,
    text: string,
    size: number,
    weight: number,
    color: string,
    extra?: Partial<Extract<DesignObject, { type: "text" }>>,
  ): DesignObject => ({
    ...box(id, x, y, tw, th),
    type: "text",
    text,
    font: extra?.font || "body",
    size,
    weight,
    color,
    align: extra?.align || "left",
    tokenKey: extra?.tokenKey ?? null,
  });

  const leftW = 1180;
  const gap = 14;
  const barH = 70;
  const thumbH = 360;
  const heroH = h - barH - thumbH;
  const thumbW = Math.round((leftW - gap) / 2);
  const rightX = leftW;
  const rightW = w - leftW;
  const pad = 48;

  const front: DesignObject[] = [
    rect("front_bg", 0, 0, w, h, "#ffffff"),
    img("front_hero", 0, 0, leftW, heroH, photos[0]),
    rect("front_bar", 0, heroH, leftW, barH, "#1e3a5f"),
    txt("front_addr", 24, heroH + 16, leftW - 48, 40, addr, 28, 700, "#ffffff", { font: "condensed", tokenKey: "address" }),
    img("front_t1", 0, heroH + barH, thumbW, thumbH, photos[1]),
    img("front_t2", thumbW + gap, heroH + barH, leftW - thumbW - gap, thumbH, photos[2]),
    txt("front_status", rightX + pad, 70, rightW - pad * 2, 70, status, 54, 800, statusColor, { font: "condensed", tokenKey: "headline" }),
    txt("front_ask", rightX + pad, 170, rightW - pad * 2, 70, "Thinking of Buying or Selling?", 32, 700, "#333333", { font: "display" }),
    txt(
      "front_sub",
      rightX + pad,
      250,
      rightW - pad * 2,
      90,
      "Let me help you reach your goals in this changing market.",
      22,
      400,
      "#6b7280",
    ),
    txt("front_by", rightX + pad, 620, rightW - pad * 2, 28, "MARKETED BY", 14, 600, "#9ca3af"),
    txt("front_name", rightX + pad, 656, rightW - pad * 2, 44, brand.name || "Your realtor", 30, 700, "#111111", {
      tokenKey: "agent_name",
    }),
    txt("front_phone", rightX + pad, 706, rightW - pad * 2, 32, brand.phone || "", 20, 500, "#111111", { tokenKey: "agent_phone" }),
    txt("front_email", rightX + pad, 740, rightW - pad * 2, 32, brand.email || "", 18, 400, "#4b5563"),
    txt("front_web", rightX + pad, 774, rightW - pad * 2, 32, brand.website || "", 18, 400, "#4b5563"),
    { ...box("front_logo", rightX + pad, h - 160, 220, 80), type: "logo", variant: "dark" },
  ];

  const bLeft = 1020;
  const bHeroH = 760;
  const bThumbH = h - bHeroH;
  const bThumbW = Math.round((bLeft - gap) / 2);
  const qr = listing.tourUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(listing.tourUrl)}`
    : "";
  const back: DesignObject[] = [
    rect("back_bg", 0, 0, w, h, "#ffffff"),
    img("back_hero", 0, 0, bLeft, bHeroH, photos[3] || photos[0]),
    img("back_t1", 0, bHeroH, bThumbW, bThumbH, photos[4] || photos[1]),
    img("back_t2", bThumbW + gap, bHeroH, bLeft - bThumbW - gap, bThumbH, photos[5] || photos[2]),
    ...(qr
      ? [
          rect("back_qr_bg", 24, 24, 168, 196, "#ffffff"),
          img("back_qr", 36, 32, 144, 144, qr),
          txt("back_qr_cap", 28, 176, 160, 36, "SCAN THE TOUR", 12, 700, "#111111", { align: "center", font: "condensed" }),
        ]
      : []),
    txt("back_addr", bLeft + pad, 48, w - bLeft - pad * 2, 70, addr, 28, 700, "#111111", { font: "condensed", tokenKey: "address" }),
    txt("back_plabel", bLeft + pad, 130, w - bLeft - pad * 2, 28, priceLabel, 16, 600, "#6b7280"),
    txt("back_price", bLeft + pad, 158, w - bLeft - pad * 2, 64, listing.price || "", 48, 800, "#111111", {
      font: "display",
      tokenKey: "price",
    }),
    rect("back_rule", bLeft + pad, 236, w - bLeft - pad * 2, 3, "#d1d5db"),
    txt("back_facts", bLeft + pad, 256, w - bLeft - pad * 2, 40, facts, 20, 600, "#111111"),
    txt("back_meta", bLeft + pad, 300, w - bLeft - pad * 2, 36, meta, 18, 400, "#6b7280", { tokenKey: "mls_number" }),
    txt("back_copy", bLeft + pad, 360, w - bLeft - pad * 2, 280, copy, 18, 400, "#374151"),
    {
      ...box("back_shot", bLeft + pad, h - 220, 120, 120),
      type: "headshot",
      shape: "circle",
      ring: "#ffffff",
    },
    txt("back_name", bLeft + pad + 140, h - 210, 420, 36, brand.name || "Your realtor", 24, 700, "#111111", {
      tokenKey: "agent_name",
    }),
    txt("back_phone", bLeft + pad + 140, h - 172, 420, 28, brand.phone || "", 16, 500, "#111111", { tokenKey: "agent_phone" }),
    txt("back_email", bLeft + pad + 140, h - 144, 420, 28, brand.email || "", 15, 400, "#4b5563"),
    txt("back_web", bLeft + pad + 140, h - 118, 420, 28, brand.website || "", 15, 400, "#4b5563"),
    txt("back_cotala", 24, h - 36, 360, 24, "Produced / printed by cotala.", 12, 500, "#9ca3af"),
    txt(
      "back_legal",
      400,
      h - 36,
      w - 424,
      24,
      "This communication is not intended to solicit properties already listed for sale.",
      11,
      400,
      "#9ca3af",
      { align: "right" },
    ),
  ];

  return {
    schemaVersion: 1,
    kind: "static",
    width: w,
    height: h,
    pages: [
      { id: "front", optional: false, objects: front },
      { id: "back", optional: false, objects: back },
    ],
    limits: { minPages: 2, maxPages },
  };
}

export function applyPostcardHeadline(doc: DesignDoc, headline: string): DesignDoc {
  const sold = /sold/i.test(headline);
  const status = sold ? "JUST SOLD" : "JUST LISTED";
  const statusColor = sold ? "#c62828" : "#1f8a4d";
  const priceLabel = sold ? "SOLD FOR" : "LISTED FOR";
  const next: DesignDoc = structuredClone(doc);
  for (const page of next.pages) {
    for (const obj of page.objects) {
      if (obj.type !== "text") continue;
      if (obj.id === "front_status") {
        obj.text = status;
        obj.color = statusColor;
      }
      if (obj.id === "back_plabel") obj.text = priceLabel;
    }
  }
  return next;
}

export function postcardPhotoSlot(frameId: string): number | null {
  const map: Record<string, number> = {
    front_hero: 0,
    front_t1: 1,
    front_t2: 2,
    back_hero: 3,
    back_t1: 4,
    back_t2: 5,
  };
  return map[frameId] ?? null;
}

export function scaleDesign(doc: DesignDoc, w: number, h: number): DesignDoc {
  const sx = w / doc.width;
  const sy = h / doc.height;
  return {
    ...structuredClone(doc),
    width: w,
    height: h,
    pages: doc.pages.map((p) => ({
      ...p,
      objects: p.objects.map((o) => ({
        ...o,
        x: Math.round(o.x * sx),
        y: Math.round(o.y * sy),
        w: Math.round(o.w * sx),
        h: Math.round(o.h * sy),
        ...(o.type === "text" ? { size: Math.max(12, Math.round(o.size * Math.min(sx, sy))) } : {}),
      })),
    })),
  };
}

function findObject(doc: DesignDoc, objId: string) {
  for (const page of doc.pages) {
    const obj = page.objects.find((o) => o.id === objId);
    if (obj) return { page, obj };
  }
  return null;
}

export function applyOps(design: DesignDoc, ops: Op[]): DesignDoc {
  const doc: DesignDoc = structuredClone(design);
  for (const op of ops) {
    if (op.op === "swap_photo") {
      const hit = findObject(doc, op.frameId);
      if (hit && hit.obj.type === "image") hit.obj.assetId = op.assetId;
    } else if (op.op === "adjust_image") {
      const hit = findObject(doc, op.frameId);
      if (hit && hit.obj.type === "image") {
        const { brightness, contrast, saturation, hue, blur, radius } = op;
        hit.obj.adjust = {
          ...hit.obj.adjust,
          ...(brightness !== undefined ? { brightness } : {}),
          ...(contrast !== undefined ? { contrast } : {}),
          ...(saturation !== undefined ? { saturation } : {}),
          ...(hue !== undefined ? { hue } : {}),
          ...(blur !== undefined ? { blur } : {}),
          ...(radius !== undefined ? { radius } : {}),
        };
      }
    } else if (op.op === "set_text") {
      const hit = findObject(doc, op.objId);
      if (hit && hit.obj.type === "text") hit.obj.text = op.value;
    } else if (op.op === "transform") {
      const hit = findObject(doc, op.objId);
      if (!hit) continue;
      if (op.x !== undefined) hit.obj.x = op.x;
      if (op.y !== undefined) hit.obj.y = op.y;
      if (op.w !== undefined) hit.obj.w = op.w;
      if (op.h !== undefined) hit.obj.h = op.h;
      if (op.rot !== undefined) hit.obj.rot = op.rot;
    } else if (op.op === "set_style") {
      const hit = findObject(doc, op.objId);
      if (hit) Object.assign(hit.obj, op.props);
    } else if (op.op === "delete_object") {
      const pageIdx = doc.pages.findIndex((p) => p.id === op.objId);
      if (pageIdx >= 0 && doc.pages[pageIdx].optional && doc.pages.length > doc.limits.minPages) {
        doc.pages.splice(pageIdx, 1);
      } else {
        for (const page of doc.pages) page.objects = page.objects.filter((o) => o.id !== op.objId);
      }
    } else if (op.op === "add_object") {
      if (op.type === "page") {
        if (doc.pages.length >= doc.limits.maxPages) continue;
        const last = doc.pages[doc.pages.length - 1];
        doc.pages.push({ id: oid("p"), optional: true, objects: structuredClone(last.objects) });
        continue;
      }
      const page = doc.pages[(op.props.pageIndex as number) || 0] || doc.pages[0];
      const base = box(oid("obj"), (op.props.x as number) || 48, (op.props.y as number) || 48, (op.props.w as number) || 280, (op.props.h as number) || 80);
      if (op.type === "text" || op.type === "heading") {
        page.objects.push({
          ...base,
          type: "text",
          text: (op.props.text as string) || "New text",
          font: ((op.props.font as keyof typeof FONT_FAMILIES) || (op.type === "heading" ? "display" : "body")),
          size: (op.props.size as number) || (op.type === "heading" ? 48 : 28),
          weight: op.type === "heading" ? 600 : 400,
          color: (op.props.color as string) || "#ffffff",
          align: "left",
          tokenKey: null,
        });
      } else if (op.type === "media") {
        page.objects.push({ ...base, w: 360, h: 360, type: "image", assetId: (op.props.assetId as string) || null, fit: "cover", adjust: { ...NEUTRAL_ADJUST } });
      } else if (op.type === "shape") {
        const shape = (op.props.shape as Extract<DesignObject, { type: "shape" }>["shape"]) || "rect";
        page.objects.push({
          ...base,
          w: shape === "line" ? 320 : 180,
          h: shape === "line" ? 8 : 180,
          type: "shape",
          shape,
          fill: (op.props.fill as string) || "#1B3050",
          stroke: null,
          strokeWidth: 0,
          radius: 0,
        });
      } else if (op.type === "logo") {
        page.objects.push({ ...base, w: 220, h: 72, type: "logo", variant: "light" });
      } else if (op.type === "badge") {
        page.objects.push({ ...base, w: 280, h: 56, type: "badge", badge: "just_listed", style: "pill" });
      }
    }
  }
  return doc;
}

export function designStorageKey(tourId: string, group: EditorGroup, index: number) {
  return `cotala_ai_fabric_v5_${tourId}_${group}_${index}`;
}

export function loadStoredDesign(tourId: string, group: EditorGroup, index: number): DesignDoc | null {
  try {
    const raw = localStorage.getItem(designStorageKey(tourId, group, index));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DesignDoc;
    if (!parsed?.pages?.length || !parsed.width) return null;
    if (group === "postcard") {
      const ids = new Set((parsed.pages[0]?.objects || []).map((o) => o.id));
      if (!ids.has("front_hero") || !ids.has("front_status") || parsed.pages.length < 2) return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveStoredDesign(tourId: string, group: EditorGroup, index: number, doc: DesignDoc) {
  localStorage.setItem(designStorageKey(tourId, group, index), JSON.stringify(doc));
}

/** Drop stored designs that reference photos no longer on this listing. */
export function purgeInvalidDesignAssets(tourId: string, validPhotos: string[]) {
  const valid = new Set(validPhotos.filter(Boolean));
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(`cotala_ai_fabric_v5_${tourId}_`)) continue;
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const doc = JSON.parse(raw) as DesignDoc;
        let stale = false;
        for (const page of doc.pages || []) {
          for (const obj of page.objects || []) {
            if (obj.type !== "image" || !obj.assetId) continue;
            if (valid.has(obj.assetId)) continue;
            if (obj.assetId.startsWith("data:") || obj.assetId.startsWith("blob:")) continue;
            stale = true;
            break;
          }
          if (stale) break;
        }
        if (stale) localStorage.removeItem(key);
      } catch {
        localStorage.removeItem(key);
      }
    }
  } catch {
    /* ignore quota */
  }
}
