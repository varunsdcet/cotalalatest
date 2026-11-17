/** Slideshow layouts matched to the client WeTransfer refs (Classic / Square / Just listed). */

import type { KitBrand, KitListing } from "./kit-cards";
import { coverDraw, smoothstep } from "./cinematic";
import { photoSlot, splitListingAddress } from "./listing-templates";

export type SlideshowLook = "classic" | "square" | "listed";

const SANS = "Helvetica Neue, Helvetica, Arial, sans-serif";
const SERIF = 'Georgia, "Times New Roman", serif';

export function slideshowSize(look: SlideshowLook): { w: number; h: number } {
  if (look === "square") return { w: 1306, h: 1246 };
  if (look === "listed") return { w: 2324, h: 1246 };
  return { w: 2326, h: 1272 };
}

export function slideshowPhotoLimit(look: SlideshowLook) {
  return look === "listed" ? 8 : 14;
}

/** Classic look holds a white address card before listing photos. */
export const CLASSIC_TITLE_SECONDS = 5.0;

/** Seconds to wait before realtor voice, so it starts after the white intro is gone. */
export function slideshowVoiceDelay(look: SlideshowLook) {
  return look === "classic" ? CLASSIC_TITLE_SECONDS : 0;
}

export function slideshowDuration(look: SlideshowLook, photoCount: number) {
  const n = Math.max(1, photoCount);
  if (look === "classic") return CLASSIC_TITLE_SECONDS + Math.min(12, n) * 4.05 + 6.4;
  if (look === "listed") return Math.min(5, n) * 3.7 + 6.2 + 6.8;
  return Math.min(14, n) * 4.2;
}

type Assets = {
  headshot: HTMLImageElement | null;
  logo: HTMLImageElement | null;
};

function pick(photos: HTMLImageElement[], i: number) {
  if (!photos.length) return null;
  return photos[((i % photos.length) + photos.length) % photos.length] || null;
}

/** Last portion of each hold used for a dissolve — long enough that Ken Burns never pops. */
const SLIDE_FADE = 0.3;

function smootherMix(t: number) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

function cycleIndex(t: number, hold: number, count: number) {
  if (count <= 1) return { i: 0, local: 0, next: 0, mix: 0 };
  const raw = t / Math.max(hold, 0.001);
  const i = Math.floor(raw) % count;
  const local = raw - Math.floor(raw);
  const next = (i + 1) % count;
  const fadeStart = 1 - SLIDE_FADE;
  const mix = local > fadeStart ? smootherMix((local - fadeStart) / SLIDE_FADE) : 0;
  return { i, local, next, mix };
}

function slidePan(i: number, amp: number) {
  return i % 2 === 0 ? amp : -amp;
}

function crossSlot(
  ctx: CanvasRenderingContext2D,
  a: HTMLImageElement | null,
  b: HTMLImageElement | null,
  x: number,
  y: number,
  w: number,
  h: number,
  local: number,
  mix: number,
  panA = 0,
  panB = 0,
) {
  photoSlot(ctx, a, x, y, w, h, local, panA, 0);
  if (mix <= 0.002 || !b) return;
  ctx.save();
  ctx.globalAlpha = mix;
  /* Incoming clip stays at progress 0 + its own pan so the first frame after the cut matches this dissolve. */
  photoSlot(ctx, b, x, y, w, h, 0, panB, 0);
  ctx.restore();
}

function digits(raw: string) {
  const m = (raw || "").replace(/,/g, "").match(/[\d.]+/);
  return m ? m[0] : "";
}

function commaNum(raw: string) {
  const n = digits(raw);
  if (!n) return raw || "";
  const num = Number(n);
  if (!Number.isFinite(num)) return raw;
  return Math.round(num).toLocaleString("en-US");
}

function bedsPhrase(listing: KitListing) {
  const n = digits(listing.beds);
  return n ? `${n} Beds` : listing.beds || "";
}

function bathsPhrase(listing: KitListing) {
  const n = digits(listing.baths);
  return n ? `${n} Baths` : listing.baths || "";
}

function sqftPhrase(listing: KitListing) {
  const n = commaNum(listing.sqft);
  return n ? `${n} Sq. Ft.` : "";
}

function drawTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  tracking: number,
) {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + tracking * Math.max(0, chars.length - 1);
  let x = cx - total / 2;
  chars.forEach((c, i) => {
    ctx.fillText(c, x, y);
    x += widths[i] + tracking;
  });
}

function clipPoly(ctx: CanvasRenderingContext2D, pts: Array<[number, number]>) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.clip();
}

function logoContain(
  ctx: CanvasRenderingContext2D,
  logo: HTMLImageElement | null,
  x: number,
  y: number,
  w: number,
  h: number,
  fallback: string,
  color = "#1B3050",
) {
  if (logo) {
    const iw = logo.naturalWidth || logo.width;
    const ih = logo.naturalHeight || logo.height;
    if (!iw || !ih) return;
    const scale = Math.min(w / iw, h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(logo, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    return;
  }
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.round(h * 0.22)}px ${SANS}`;
  const label = (fallback || "BROKERAGE").toUpperCase();
  ctx.fillText(label.slice(0, 18), x + w / 2, y + h / 2);
}

function portraitSlot(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  x: number,
  y: number,
  w: number,
  h: number,
  brand: KitBrand,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  if (img) {
    coverDraw(ctx, img, x, y, w, h, 1, 0, -6);
  } else {
    ctx.fillStyle = brand.bg || "#1B3050";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 ${Math.round(Math.min(w, h) * 0.28)}px ${SANS}`;
    const parts = (brand.name || "R").trim().split(/\s+/);
    ctx.fillText(((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "R", x + w / 2, y + h / 2);
  }
  ctx.restore();
}

function drawEho(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  const s = size;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.4, s * 0.07);
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(-s * 0.46, s * 0.02);
  ctx.lineTo(0, -s * 0.48);
  ctx.lineTo(s * 0.46, s * 0.02);
  ctx.stroke();
  ctx.strokeRect(-s * 0.32, s * 0.02, s * 0.64, s * 0.4);
  ctx.beginPath();
  ctx.moveTo(-s * 0.14, s * 0.2);
  ctx.lineTo(s * 0.14, s * 0.2);
  ctx.moveTo(-s * 0.14, s * 0.3);
  ctx.lineTo(s * 0.14, s * 0.3);
  ctx.stroke();
  ctx.restore();
}

function drawRealtorMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.5, size * 0.08);
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.48, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = `700 ${Math.round(size * 0.55)}px ${SANS}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("R", cx, cy + size * 0.04);
  ctx.restore();
}

function glyphCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  kind: "price" | "beds" | "baths" | "sqft",
) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#111";
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#fff";
  ctx.lineWidth = Math.max(1.6, r * 0.12);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (kind === "price") {
    ctx.font = `700 ${Math.round(r * 1.15)}px ${SANS}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("$", cx, cy + r * 0.06);
    return;
  }
  if (kind === "beds") {
    const x = cx - r * 0.42;
    const y = cy - r * 0.08;
    const w = r * 0.84;
    const h = r * 0.42;
    ctx.beginPath();
    ctx.roundRect?.(x, y, w, h, r * 0.08);
    if (!ctx.roundRect) ctx.rect(x, y, w, h);
    ctx.stroke();
    ctx.strokeRect(x + w * 0.08, y - r * 0.22, w * 0.28, r * 0.22);
    ctx.strokeRect(x + w * 0.48, y - r * 0.22, w * 0.28, r * 0.22);
    return;
  }
  if (kind === "baths") {
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.42, cy + r * 0.08);
    ctx.quadraticCurveTo(cx, cy + r * 0.48, cx + r * 0.42, cy + r * 0.08);
    ctx.lineTo(cx + r * 0.42, cy - r * 0.08);
    ctx.lineTo(cx - r * 0.42, cy - r * 0.08);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + r * 0.22, cy - r * 0.28, r * 0.1, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.32, cy + r * 0.32);
  ctx.lineTo(cx - r * 0.32, cy - r * 0.32);
  ctx.lineTo(cx + r * 0.36, cy - r * 0.32);
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const x = cx - r * 0.32 + ((i + 1) / 5) * r * 0.68;
    ctx.beginPath();
    ctx.moveTo(x, cy - r * 0.32);
    ctx.lineTo(x, cy - r * 0.18);
    ctx.stroke();
  }
}

function drawCenteredAddress(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  listing: KitListing,
  streetColor: string,
  cityColor: string,
  ruleColor: string,
  weight = "500",
) {
  const { street, city } = splitListingAddress(listing.address);
  const streetSize = Math.round(h * 0.052);
  const citySize = Math.round(h * 0.028);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = streetColor;
  ctx.font = `${weight} ${streetSize}px ${SANS}`;
  ctx.fillText(street || listing.address || "New listing", w / 2, h * 0.455);
  const ruleW = Math.max(ctx.measureText(street || "New listing").width * 1.15, w * 0.28);
  ctx.strokeStyle = ruleColor;
  ctx.lineWidth = Math.max(1, h * 0.0016);
  ctx.beginPath();
  ctx.moveTo((w - ruleW) / 2, h * 0.5);
  ctx.lineTo((w + ruleW) / 2, h * 0.5);
  ctx.stroke();
  ctx.fillStyle = cityColor;
  ctx.font = `400 ${citySize}px ${SANS}`;
  ctx.fillText(city || "", w / 2, h * 0.545);
}

function drawClassicTitle(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  img: HTMLImageElement | null,
  listing: KitListing,
  p: number,
) {
  ctx.fillStyle = "#f2f2f2";
  ctx.fillRect(0, 0, w, h);
  if (img) {
    const wash = smoothstep(p / 0.52);
    ctx.save();
    ctx.globalAlpha = 0.22 * (1 - wash);
    photoSlot(ctx, img, 0, 0, w, h, p * 0.35, 0, 0);
    ctx.restore();
    ctx.fillStyle = `rgba(255,255,255,${0.72 + wash * 0.28})`;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.save();
  ctx.globalAlpha = p > 0.84 ? 1 - smoothstep((p - 0.84) / 0.16) : 1;
  drawCenteredAddress(ctx, w, h, listing, "#2a2a2a", "#6b6b6b", "rgba(0,0,0,0.22)", "400");
  ctx.restore();
}

function drawClassicStats(ctx: CanvasRenderingContext2D, w: number, h: number, listing: KitListing) {
  const items: Array<{ kind: "price" | "beds" | "baths" | "sqft"; label: string }> = [];
  if (listing.price) items.push({ kind: "price", label: listing.price });
  const beds = bedsPhrase(listing);
  if (beds) items.push({ kind: "beds", label: beds });
  const baths = bathsPhrase(listing);
  if (baths) items.push({ kind: "baths", label: baths });
  const sqft = sqftPhrase(listing);
  if (sqft) items.push({ kind: "sqft", label: sqft });
  if (!items.length) return;

  const barH = Math.round(h * 0.112);
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fillRect(0, h - barH, w, barH);

  const col = w / items.length;
  const r = Math.round(barH * 0.22);
  ctx.font = `500 ${Math.round(barH * 0.28)}px ${SANS}`;
  items.forEach((it, i) => {
    const labelW = ctx.measureText(it.label).width;
    const group = r * 2 + 14 + labelW;
    const left = col * i + (col - group) / 2;
    const cy = h - barH / 2;
    glyphCircle(ctx, left + r, cy, r, it.kind);
    ctx.fillStyle = "#111";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = `500 ${Math.round(barH * 0.28)}px ${SANS}`;
    ctx.fillText(it.label, left + r * 2 + 14, cy);
  });
}

function drawClassicOutro(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  brand: KitBrand,
  assets: Assets,
) {
  ctx.fillStyle = "#f2f2f2";
  ctx.fillRect(0, 0, w, h);
  const pw = Math.round(h * 0.22);
  const ph = Math.round(h * 0.28);
  portraitSlot(ctx, assets.headshot, (w - pw) / 2, h * 0.1, pw, ph, brand);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#222";
  ctx.font = `400 ${Math.round(h * 0.05)}px ${SANS}`;
  ctx.fillText(brand.name || "Your realtor", w / 2, h * 0.46);

  const lines = ["Realtor", brand.phone, brand.email].filter(Boolean) as string[];
  ctx.fillStyle = "#555";
  ctx.font = `400 ${Math.round(h * 0.022)}px ${SANS}`;
  lines.forEach((line, i) => ctx.fillText(line, w / 2, h * 0.505 + i * h * 0.032));

  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w * 0.12, h * 0.64);
  ctx.lineTo(w * 0.88, h * 0.64);
  ctx.stroke();

  logoContain(ctx, assets.logo, w * 0.38, h * 0.67, w * 0.24, h * 0.1, brand.brokerage || brand.name || "Cotala");
  ctx.fillStyle = "#444";
  ctx.font = `400 ${Math.round(h * 0.018)}px ${SANS}`;
  const office = [brand.brokerage, brand.website].filter(Boolean).join("  ·  ");
  if (office) ctx.fillText(office, w / 2, h * 0.82);

  ctx.fillStyle = "#888";
  ctx.font = `400 ${Math.round(h * 0.013)}px ${SANS}`;
  ctx.textAlign = "right";
  ctx.fillText("Information deemed reliable but not guaranteed", w - h * 0.08, h * 0.94);
  drawEho(ctx, w - h * 0.045, h * 0.94, h * 0.028, "#333");
}

function drawClassic(
  ctx: CanvasRenderingContext2D,
  t: number,
  duration: number,
  photos: HTMLImageElement[],
  listing: KitListing,
  brand: KitBrand,
  assets: Assets,
  w: number,
  h: number,
) {
  const title = CLASSIC_TITLE_SECONDS;
  const outro = 6.4;
  if (t < title) {
    drawClassicTitle(ctx, w, h, pick(photos, 0), listing, t / title);
    return;
  }
  if (t >= duration - outro) {
    drawClassicOutro(ctx, w, h, brand, assets);
    return;
  }
  const n = Math.max(1, Math.min(12, photos.length));
  const hold = (duration - title - outro) / n;
  const into = t - title;
  const { i, local, next, mix } = cycleIndex(into, hold, n);
  crossSlot(ctx, pick(photos, i), pick(photos, next), 0, 0, w, h, local, mix, slidePan(i, 0.32), slidePan(next, 0.32));
  drawClassicStats(ctx, w, h, listing);
  if (into < 0.65) {
    ctx.save();
    ctx.globalAlpha = 1 - smootherMix(into / 0.65);
    drawClassicTitle(ctx, w, h, pick(photos, 0), listing, 1);
    ctx.restore();
  }
}

function drawSquareChrome(ctx: CanvasRenderingContext2D, w: number, h: number, listing: KitListing, brand: KitBrand, assets: Assets) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 1;
  drawCenteredAddress(ctx, w, h, listing, "#fff", "rgba(255,255,255,0.92)", "rgba(255,255,255,0.85)", "300");
  ctx.restore();

  const pad = Math.round(Math.min(w, h) * 0.045);
  const badge = Math.round(Math.min(w, h) * 0.118);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(pad, h - pad - badge, badge, badge, 8);
  else ctx.rect(pad, h - pad - badge, badge, badge);
  ctx.fill();
  logoContain(
    ctx,
    assets.logo,
    pad + 8,
    h - pad - badge + 8,
    badge - 16,
    badge - 16,
    brand.brokerage || brand.name || "Cotala",
  );
  drawEho(ctx, w - pad - 18, h - pad - 18, 28, "#fff");
}

function drawSquare(
  ctx: CanvasRenderingContext2D,
  t: number,
  duration: number,
  photos: HTMLImageElement[],
  listing: KitListing,
  brand: KitBrand,
  assets: Assets,
  w: number,
  h: number,
) {
  const n = Math.max(1, photos.length);
  const hold = duration / n;
  const { i, local, next, mix } = cycleIndex(t, hold, n);
  crossSlot(ctx, pick(photos, i), pick(photos, next), 0, 0, w, h, local, mix, slidePan(i, 0.28), slidePan(next, 0.28));
  drawSquareChrome(ctx, w, h, listing, brand, assets);
}

function listedBands(h: number) {
  return {
    topL: h * 0.17,
    topR: h * 0.095,
    botL: h * 0.15,
    botR: h * 0.21,
  };
}

function drawListedChrome(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  listing: KitListing,
  brand: KitBrand,
  assets: Assets,
) {
  const { topL, topR, botL, botR } = listedBands(h);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w, 0);
  ctx.lineTo(w, topR);
  ctx.lineTo(0, topL);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, h - botL);
  ctx.lineTo(w, h - botR);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#111";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.round(h * 0.052)}px ${SERIF}`;
  ctx.fillText("just listed.", w * 0.032, topL * 0.38);

  const { street, city } = splitListingAddress(listing.address);
  const loc = [street, city].filter(Boolean).join(", ");
  const right = [loc, listing.price].filter(Boolean).join("  ·  ").toUpperCase();
  ctx.textAlign = "right";
  ctx.font = `500 ${Math.round(h * 0.02)}px ${SANS}`;
  ctx.fillText(right, w * 0.975, topR * 0.48);

  const footY = h - botL * 0.48;
  drawRealtorMark(ctx, w * 0.038, h - botL * 0.42, h * 0.038, "#111");
  drawEho(ctx, w * 0.072, h - botL * 0.42, h * 0.032, "#111");

  const shot = Math.round(h * 0.118);
  const sx = w - shot - Math.round(w * 0.012);
  const sy = h - shot - Math.round(h * 0.012);
  portraitSlot(ctx, assets.headshot, sx, sy, shot, shot, brand);

  const contactX = sx - Math.round(w * 0.018);
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#111";
  const contact = [
    `${(brand.name || "Your realtor").toUpperCase()}  ·  REALTOR`,
    brand.phone,
    brand.brokerage,
    brand.website,
  ]
    .filter(Boolean)
    .map((s) => String(s).toUpperCase());
  ctx.font = `600 ${Math.round(h * 0.016)}px ${SANS}`;
  const start = footY - ((contact.length - 1) * h * 0.02) / 2;
  contact.forEach((line, i) => {
    ctx.font = i === 0 ? `700 ${Math.round(h * 0.017)}px ${SANS}` : `500 ${Math.round(h * 0.015)}px ${SANS}`;
    ctx.fillText(line, contactX, start + i * h * 0.02);
  });
}

function listedFeatures(listing: KitListing) {
  const out: Array<{ num: string; label: string }> = [];
  const beds = digits(listing.beds);
  if (beds) out.push({ num: beds, label: "BEDROOMS" });
  const baths = digits(listing.baths);
  if (baths) out.push({ num: baths, label: "BATHROOMS" });
  const sqft = commaNum(listing.sqft);
  if (sqft) out.push({ num: sqft, label: "SQUARE FEET" });
  return out;
}

function drawFeatureCallout(ctx: CanvasRenderingContext2D, w: number, h: number, num: string, label: string, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 18;
  ctx.font = `200 ${Math.round(h * 0.16)}px ${SANS}`;
  ctx.fillText(num, w / 2, h * 0.46);
  ctx.font = `700 ${Math.round(h * 0.028)}px ${SANS}`;
  ctx.shadowBlur = 10;
  drawTracked(ctx, label, w / 2, h * 0.56, Math.round(h * 0.006));
  ctx.restore();
}

function drawListedCta(ctx: CanvasRenderingContext2D, w: number, h: number, photos: HTMLImageElement[]) {
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  const gap = Math.max(8, Math.round(w * 0.007));
  const panels: Array<{ img: HTMLImageElement | null; pts: Array<[number, number]> }> = [
    {
      img: pick(photos, 0),
      pts: [
        [0, 0],
        [w * 0.42, 0],
        [w * 0.34, h * 0.55],
        [0, h * 0.5],
      ],
    },
    {
      img: pick(photos, 1),
      pts: [
        [0, h * 0.5 + gap],
        [w * 0.34, h * 0.55 + gap],
        [w * 0.46, h],
        [0, h],
      ],
    },
    {
      img: pick(photos, 2),
      pts: [
        [w * 0.42 + gap, 0],
        [w, 0],
        [w, h * 0.72],
        [w * 0.52, h * 0.62],
      ],
    },
    {
      img: pick(photos, 3),
      pts: [
        [w * 0.46 + gap, h],
        [w * 0.52 + gap, h * 0.62 + gap],
        [w, h * 0.72 + gap],
        [w, h],
      ],
    },
  ];
  panels.forEach((panel, i) => {
    ctx.save();
    clipPoly(ctx, panel.pts);
    photoSlot(ctx, panel.img, 0, 0, w, h, 0.35 + i * 0.08, i % 2 ? 0.4 : -0.3, 0);
    ctx.restore();
  });
  ctx.fillStyle = "rgba(16, 20, 28, 0.5)";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `italic 600 ${Math.round(h * 0.078)}px ${SERIF}`;
  ["Schedule", "A Showing", "Today!"].forEach((line, i) => {
    ctx.fillText(line, w / 2, h * 0.38 + i * h * 0.1);
  });
}

function drawListedAgent(ctx: CanvasRenderingContext2D, w: number, h: number, brand: KitBrand, assets: Assets) {
  if (assets.headshot) {
    coverDraw(ctx, assets.headshot, 0, 0, w, h * 0.78, 1.04, 0, -8);
  } else {
    ctx.fillStyle = brand.bg || "#1B3050";
    ctx.fillRect(0, 0, w, h);
  }
  ctx.fillStyle = "#fff";
  const y0 = h * 0.64;
  ctx.beginPath();
  ctx.moveTo(0, y0);
  ctx.quadraticCurveTo(w / 2, y0 - h * 0.055, w, y0);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#111";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${Math.round(h * 0.032)}px ${SANS}`;
  const line = [brand.name, brand.phone].filter(Boolean).join("  ·  ");
  ctx.fillText(line || "Your realtor", w / 2, h * 0.78);
  logoContain(ctx, assets.logo, w * 0.42, h * 0.84, w * 0.16, h * 0.1, brand.brokerage || brand.name || "Cotala");
}

function drawListed(
  ctx: CanvasRenderingContext2D,
  t: number,
  duration: number,
  photos: HTMLImageElement[],
  listing: KitListing,
  brand: KitBrand,
  assets: Assets,
  w: number,
  h: number,
) {
  const cta = 6.2;
  const agent = 6.8;
  const photoEnd = duration - cta - agent;
  if (t >= duration - agent) {
    drawListedAgent(ctx, w, h, brand, assets);
    return;
  }
  if (t >= photoEnd) {
    drawListedCta(ctx, w, h, photos);
    return;
  }
  const n = Math.max(1, Math.min(5, photos.length));
  const hold = photoEnd / n;
  const { i, local, next, mix } = cycleIndex(t, hold, n);
  crossSlot(ctx, pick(photos, i), pick(photos, next), 0, 0, w, h, local, mix, slidePan(i, 0.26), slidePan(next, 0.26));
  drawListedChrome(ctx, w, h, listing, brand, assets);
  const feats = listedFeatures(listing);
  if (feats.length) {
    const fHold = photoEnd / feats.length;
    const f = cycleIndex(t, fHold, feats.length);
    drawFeatureCallout(ctx, w, h, feats[f.i].num, feats[f.i].label, 1 - f.mix);
    if (f.mix > 0.02) drawFeatureCallout(ctx, w, h, feats[f.next].num, feats[f.next].label, f.mix);
  }
}

export function drawSlideshowLook(
  ctx: CanvasRenderingContext2D,
  look: SlideshowLook,
  t: number,
  duration: number,
  photos: HTMLImageElement[],
  listing: KitListing,
  brand: KitBrand,
  assets: Assets,
  w: number,
  h: number,
) {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, w, h);
  if (look === "square") drawSquare(ctx, t, duration, photos, listing, brand, assets, w, h);
  else if (look === "listed") drawListed(ctx, t, duration, photos, listing, brand, assets, w, h);
  else drawClassic(ctx, t, duration, photos, listing, brand, assets, w, h);
}
