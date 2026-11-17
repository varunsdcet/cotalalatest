/** Listing-video templates matched to the client reference reels (Just Listed grid + Showing card). */

import type { KitBrand, KitListing } from "./kit-cards";
import { coverDraw, easeCamera, lerp, smoothstep, clamp } from "./cinematic";

type BrandAssets = {
  headshot: HTMLImageElement | null;
  logo: HTMLImageElement | null;
};

const SANS = "Helvetica Neue, Helvetica, Arial, sans-serif";
const NAVY = "#2C4E7A";
const INK = "#111111";
const MUTED = "#555555";
const GUTTER = (min: number) => Math.max(10, Math.round(min * 0.014));

export function splitListingAddress(address: string): { street: string; city: string } {
  const parts = (address || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 2) return { street: parts[0], city: parts.slice(1).join(", ") };
  return { street: address || "", city: "" };
}

export function specsLine(listing: KitListing): string {
  return [
    listing.beds && `${listing.beds} bedrooms`,
    listing.baths && `${listing.baths} bathrooms`,
    listing.sqft && `${listing.sqft} square feet`,
  ]
    .filter(Boolean)
    .join("  |  ");
}

function navy(brand: KitBrand) {
  return brand.bg && brand.bg !== "#000000" ? brand.bg : NAVY;
}

function pick(photos: HTMLImageElement[], i: number): HTMLImageElement | null {
  if (!photos.length) return null;
  return photos[((i % photos.length) + photos.length) % photos.length] || null;
}

/** Sharp cover inside a slot — tiny Ken Burns, no grade/blur. */
export function photoSlot(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  x: number,
  y: number,
  w: number,
  h: number,
  progress: number,
  panX = 0,
  panY = 0,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  if (!img) {
    ctx.fillStyle = "#d8d8d8";
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    return;
  }
  const zoom = lerp(1.0, 1.034, easeCamera(progress));
  coverDraw(ctx, img, x, y, w, h, zoom, panX, panY);
  ctx.restore();
}

function containOnWhite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  zoom: number,
) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const scale = Math.min(w / iw, h / ih) * zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function squareHeadshot(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  x: number,
  y: number,
  size: number,
  brand: KitBrand,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, size, size);
  ctx.clip();
  if (img) {
    coverDraw(ctx, img, x, y, size, size, 1, 0, 0);
  } else {
    ctx.fillStyle = navy(brand);
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 ${Math.round(size * 0.32)}px ${SANS}`;
    const parts = (brand.name || "R").trim().split(/\s+/);
    ctx.fillText(((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "R", x + size / 2, y + size / 2);
  }
  ctx.restore();
}

function drawLogoFit(
  ctx: CanvasRenderingContext2D,
  logo: HTMLImageElement | null,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
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
  ctx.fillStyle = NAVY;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.round(h * 0.22)}px ${SANS}`;
  wrapCenter(ctx, (label || "BROKERAGE").toUpperCase(), x + w / 2, y + h / 2, w * 0.9, Math.round(h * 0.2));
}

function wrapCenter(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  maxW: number,
  lineH: number,
) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxW) line = next;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  const start = cy - ((lines.length - 1) * lineH) / 2;
  lines.forEach((row, i) => ctx.fillText(row, cx, start + i * lineH));
}

function verticalAddress(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, maxH: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${Math.max(16, Math.round(maxH * 0.028))}px ${SANS}`;
  const clipped = text.length > 48 ? `${text.slice(0, 46)}…` : text;
  ctx.fillText(clipped.toUpperCase(), 0, 0);
  ctx.restore();
}

function cycleIndex(t: number, hold: number, count: number) {
  if (count <= 1) return { i: 0, local: 0, next: 0, mix: 0 };
  const raw = t / hold;
  const i = Math.floor(raw) % count;
  const local = raw - Math.floor(raw);
  const next = (i + 1) % count;
  const mix = local > 0.86 ? smoothstep((local - 0.86) / 0.14) : 0;
  return { i, local, next, mix };
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
  pan = 0,
) {
  if (mix <= 0.01 || !b) {
    photoSlot(ctx, a, x, y, w, h, local, pan, 0);
    return;
  }
  photoSlot(ctx, a, x, y, w, h, 1, pan, 0);
  ctx.save();
  ctx.globalAlpha = mix;
  photoSlot(ctx, b, x, y, w, h, 0, pan, 0);
  ctx.restore();
}

/** Ref 08.53.44 — Just Listed grid flyer that holds while photos cycle in slots. */
export function drawJustListedGrid(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  photos: HTMLImageElement[],
  listing: KitListing,
  brand: KitBrand,
  assets: BrandAssets,
) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const g = GUTTER(Math.min(w, h));
  const p = Math.round(Math.min(w, h) * 0.022);
  const head = Math.round(Math.min(w, h) * 0.155);
  const row2 = Math.round(head * 0.72);
  const stripW = Math.round(w * 0.125);
  const priceH = Math.round(h * 0.048);
  const botH = Math.round(h * 0.132);
  const foot = Math.round(h * 0.032);

  const y0 = p;
  squareHeadshot(ctx, assets.headshot, p, y0, head, brand);
  const navyX = p + head + g;
  const navyW = w - navyX - p;
  ctx.fillStyle = navy(brand);
  ctx.fillRect(navyX, y0, navyW, head);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const ncx = navyX + navyW / 2;
  ctx.font = `700 ${Math.round(head * 0.2)}px ${SANS}`;
  ctx.fillText((brand.brokerage || brand.name || "YOUR BROKERAGE").toUpperCase(), ncx, y0 + head * 0.32);
  ctx.font = `500 ${Math.round(head * 0.13)}px ${SANS}`;
  if (brand.phone) ctx.fillText(brand.phone, ncx, y0 + head * 0.68);

  const y1 = y0 + head + g;
  ctx.fillStyle = "#f3f3f3";
  ctx.fillRect(p, y1, head, row2);
  drawLogoFit(ctx, assets.logo, p + 8, y1 + 8, head - 16, row2 - 16, brand.brokerage || brand.name);
  const barX = p + head + g;
  const barW = w - barX - p;
  const barImg = pick(photos, 0);
  if (barImg) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    photoSlot(ctx, barImg, barX, y1, barW, row2, 0.4);
    ctx.restore();
    ctx.fillStyle = "rgba(40,50,64,0.55)";
    ctx.fillRect(barX, y1, barW, row2);
  } else {
    ctx.fillStyle = "#6b7280";
    ctx.fillRect(barX, y1, barW, row2);
  }
  ctx.fillStyle = "#fff";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.round(row2 * 0.28)}px ${SANS}`;
  ctx.fillText((brand.name || "Your realtor").toUpperCase(), barX + barW - 18, y1 + row2 * 0.38);
  ctx.font = `500 ${Math.round(row2 * 0.22)}px ${SANS}`;
  if (brand.phone) ctx.fillText(brand.phone, barX + barW - 18, y1 + row2 * 0.7);

  const mainY = y1 + row2 + g;
  const mainH = h - mainY - priceH - botH - foot - p - g * 2;
  const heroW = w - p * 2 - g - stripW;
  const hold = 3.6;
  const c = cycleIndex(t, hold, Math.max(photos.length, 1));
  const heroA = pick(photos, c.i);
  const heroB = pick(photos, c.next);
  const stripA = pick(photos, c.i + 1);
  const stripB = pick(photos, c.next + 1);
  const botA = pick(photos, c.i + 2);
  const botB = pick(photos, c.next + 2);
  const ext = pick(photos, 0);

  crossSlot(ctx, heroA, heroB, p, mainY, heroW, mainH, c.local, c.mix, 0.15);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 ${Math.round(Math.min(w, h) * 0.048)}px ${SANS}`;
  ctx.fillText("JUST LISTED", p + heroW / 2, mainY + mainH - Math.round(mainH * 0.1));

  crossSlot(ctx, stripA, stripB, p + heroW + g, mainY, stripW, mainH, c.local, c.mix, -0.2);
  verticalAddress(ctx, listing.address || "", p + heroW + g + stripW / 2, mainY + mainH / 2, mainH);

  const priceY = mainY + mainH + g;
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${Math.round(priceH * 0.55)}px ${SANS}`;
  ctx.fillText(listing.price || "", w / 2, priceY + priceH / 2);

  const botY = priceY + priceH;
  const cellW = (w - p * 2 - g) / 2;
  crossSlot(ctx, botA, botB, p, botY, cellW, botH, c.local, c.mix, 0.1);
  photoSlot(ctx, ext, p + cellW + g, botY, cellW, botH, 0.2);

  ctx.fillStyle = "#888";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.font = `500 ${Math.round(foot * 0.45)}px ${SANS}`;
  if (listing.mls) ctx.fillText(`MLS® ${listing.mls}`, w - p, h - p - foot / 2);
  ctx.textAlign = "left";
}

/** Opening beat of ref 08.54.13 — polaroids over a washed hero + NEW ON THE MARKET. */
export function drawMarketIntro(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  photos: HTMLImageElement[],
  listing: KitListing,
) {
  ctx.fillStyle = "#f4f1ea";
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const hero = pick(photos, 0);
  if (hero) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    coverDraw(ctx, hero, 0, 0, w, h, 1.08, 0, 0);
    ctx.restore();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillRect(0, 0, w, h);
  }

  const frames = [
    { img: pick(photos, 1), x: w * 0.08, y: h * 0.1, ww: w * 0.62, hh: h * 0.28, rot: -0.04 },
    { img: pick(photos, 2), x: w * 0.42, y: h * 0.36, ww: w * 0.48, hh: h * 0.26, rot: 0.05 },
    { img: pick(photos, 0), x: w * 0.1, y: h * 0.58, ww: w * 0.5, hh: h * 0.3, rot: -0.02 },
  ];
  const border = Math.round(Math.min(w, h) * 0.012);
  frames.forEach((f, i) => {
    if (!f.img) return;
    const appear = smoothstep(clamp((t - i * 0.18) / 0.35, 0, 1));
    ctx.save();
    ctx.globalAlpha = appear;
    ctx.translate(f.x + f.ww / 2, f.y + f.hh / 2);
    ctx.rotate(f.rot);
    ctx.shadowColor = "rgba(0,0,0,0.22)";
    ctx.shadowBlur = 24;
    ctx.fillStyle = "#fff";
    ctx.fillRect(-f.ww / 2 - border, -f.hh / 2 - border, f.ww + border * 2, f.hh + border * 2);
    ctx.shadowBlur = 0;
    photoSlot(ctx, f.img, -f.ww / 2, -f.hh / 2, f.ww, f.hh, clamp(t / 6, 0, 1));
    ctx.restore();
  });

  const { street, city } = splitListingAddress(listing.address);
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fillRect(0, h * 0.08, w * 0.72, h * 0.22);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#5B7C8A";
  ctx.font = `800 ${Math.round(h * 0.028)}px ${SANS}`;
  ctx.fillText("NEW ON THE MARKET!", w * 0.06, h * 0.135);
  ctx.fillStyle = INK;
  ctx.font = `600 ${Math.round(h * 0.026)}px ${SANS}`;
  ctx.fillText(street || listing.address, w * 0.06, h * 0.185);
  if (city) ctx.fillText(city, w * 0.06, h * 0.22);
  if (listing.price) {
    ctx.font = `700 ${Math.round(h * 0.03)}px ${SANS}`;
    ctx.fillText(listing.price, w * 0.06, h * 0.262);
  }
}

/** Ref 08.54.13 hold — hero photo + white agent panel. */
export function drawShowingCard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  photos: HTMLImageElement[],
  listing: KitListing,
  brand: KitBrand,
  assets: BrandAssets,
) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const panel = Math.round(h * (w > h ? 0.14 : 0.11));
  const heroH = h - panel;
  const hold = 4.2;
  const c = cycleIndex(t, hold, Math.max(photos.length, 1));
  crossSlot(ctx, pick(photos, c.i), pick(photos, c.next), 0, 0, w, heroH, c.local, c.mix, 0.12);

  const g = ctx.createLinearGradient(0, heroH * 0.7, 0, heroH);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, heroH);

  const { street, city } = splitListingAddress(listing.address);
  const specs = specsLine(listing);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#fff";
  const pad = Math.round(w * 0.045);
  let ty = heroH - Math.round(h * 0.055);
  ctx.font = `700 ${Math.round(h * 0.022)}px ${SANS}`;
  ctx.fillText(street || listing.address || "", pad, ty);
  ty += Math.round(h * 0.022);
  const sub = [city, listing.price, specs].filter(Boolean).join("  ·  ");
  if (sub) {
    ctx.font = `500 ${Math.round(h * 0.014)}px ${SANS}`;
    ctx.fillText(sub, pad, ty);
  }

  const py = heroH;
  const shot = Math.round(panel * 0.78);
  const mx = pad;
  const my = py + Math.round((panel - shot) / 2);
  squareHeadshot(ctx, assets.headshot, mx, my, shot, brand);

  const tx = mx + shot + Math.round(w * 0.028);
  const logoW = Math.round(w * 0.18);
  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const mid = py + panel / 2;
  ctx.font = `700 ${Math.round(h * 0.015)}px ${SANS}`;
  ctx.fillText(brand.name || "Your realtor", tx, mid - Math.round(h * 0.014));
  ctx.fillStyle = MUTED;
  ctx.font = `500 ${Math.round(h * 0.012)}px ${SANS}`;
  ctx.fillText([brand.phone, brand.brokerage].filter(Boolean).join("  ·  ") || "Schedule a showing", tx, mid + Math.round(h * 0.014));

  drawLogoFit(
    ctx,
    assets.logo,
    w - pad - logoW,
    py + Math.round(panel * 0.16),
    logoW,
    Math.round(panel * 0.68),
    brand.brokerage || "",
  );
}

/** White-letterbox hero used as the first ~2s of the Just Listed reel. */
export function drawLetterboxOpen(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  img: HTMLImageElement | null,
) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  if (!img) return;
  const fade = smoothstep(clamp(t / 0.45, 0, 1));
  ctx.save();
  ctx.globalAlpha = fade;
  const boxH = h * 0.62;
  const boxY = (h - boxH) / 2;
  containOnWhite(ctx, img, w * 0.06, boxY, w * 0.88, boxH, lerp(1.0, 1.04, easeCamera(clamp(t / 2.2, 0, 1))));
  ctx.restore();
}

export function drawListedTimeline(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  photos: HTMLImageElement[],
  listing: KitListing,
  brand: KitBrand,
  assets: BrandAssets,
) {
  drawJustListedGrid(ctx, w, h, t, photos, listing, brand, assets);
}

export function drawShowingTimeline(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  photos: HTMLImageElement[],
  listing: KitListing,
  brand: KitBrand,
  assets: BrandAssets,
) {
  drawShowingCard(ctx, w, h, t, photos, listing, brand, assets);
}

/** Polaroid wall — distinct from the Just Listed grid and Showing card. */
export function drawMontageWall(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  photos: HTMLImageElement[],
  listing: KitListing,
) {
  ctx.fillStyle = "#ebe4d6";
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const pad = Math.round(w * 0.028);
  const top = Math.round(h * 0.078);
  const bot = Math.round(h * 0.062);
  const cols = 2;
  const rows = 3;
  const gap = Math.round(Math.min(w, h) * 0.01);
  const areaW = w - pad * 2;
  const areaH = h - top - bot;
  const cellW = (areaW - gap) / cols;
  const cellH = (areaH - gap * (rows - 1)) / rows;
  const hold = 3.2;
  const c = cycleIndex(t, hold, Math.max(photos.length, 1));

  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const i = r * cols + col;
      const x = pad + col * (cellW + gap);
      const y = top + r * (cellH + gap);
      const rot = ((i % 2) * 2 - 1) * 0.012;
      ctx.save();
      ctx.translate(x + cellW / 2, y + cellH / 2);
      ctx.rotate(rot);
      const bw = cellW;
      const bh = cellH;
      ctx.shadowColor = "rgba(0,0,0,0.16)";
      ctx.shadowBlur = 10;
      ctx.fillStyle = "#fff";
      ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
      ctx.shadowBlur = 0;
      const inset = Math.max(4, Math.round(Math.min(bw, bh) * 0.018));
      crossSlot(
        ctx,
        pick(photos, c.i + i),
        pick(photos, c.next + i),
        -bw / 2 + inset,
        -bh / 2 + inset,
        bw - inset * 2,
        bh - inset * 2,
        c.local,
        c.mix,
        (i % 2) * 0.12 - 0.06,
      );
      ctx.restore();
    }
  }

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, top);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#5B7C8A";
  ctx.font = `800 ${Math.round(h * 0.026)}px ${SANS}`;
  ctx.fillText("NEW ON THE MARKET", w / 2, top * 0.38);
  ctx.fillStyle = INK;
  ctx.font = `600 ${Math.round(h * 0.02)}px ${SANS}`;
  const { street, city } = splitListingAddress(listing.address);
  ctx.fillText(street || listing.address || "", w / 2, top * 0.72);

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, h - bot, w, bot);
  ctx.fillStyle = INK;
  ctx.font = `700 ${Math.round(h * 0.028)}px ${SANS}`;
  ctx.fillText(listing.price || city || "", w / 2, h - bot / 2);
}
