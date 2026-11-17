import type { KitBrand, KitListing } from "./kit-cards";
import {
  type CameraMove,
  type ReelLook,
  type ReelOrientation,
  PORTRAIT,
  XFADE,
  clamp,
  coverDraw,
  drawCinematicStill,
  drawDuskWash,
  drawVignette,
  lerp,
  pickMove,
  reelSize,
  smoothstep,
  wrapText,
} from "./cinematic";
import { drawListedTimeline, drawMontageWall, drawShowingTimeline } from "./listing-templates";

export type { ReelLook, ReelOrientation };
export { reelSize };

export const REEL_W = PORTRAIT.w;
export const REEL_H = PORTRAIT.h;
/** Match client WeTransfer refs (~58–60fps) for smooth camera. */
export const REEL_FPS = 60;
export const REEL_MAX_PHOTOS = 10;
export const REEL_BITRATE = 18_000_000;

export type BeatKind = "photo" | "collage" | "grid" | "contact";

export type PlannedBeat = {
  kind: BeatKind;
  urls: string[];
  caption: string;
  seconds: number;
  intro?: boolean;
  index: number;
  move?: CameraMove;
};

export type LoadedBeat = Omit<PlannedBeat, "urls"> & { images: HTMLImageElement[] };

export type ReelAssets = {
  headshot: HTMLImageElement | null;
  logo: HTMLImageElement | null;
};

export type ReelStyle = {
  look: ReelLook;
  orientation: ReelOrientation;
  captions: boolean;
};

const DEFAULT_STYLE: ReelStyle = {
  look: "cinematic",
  orientation: "portrait",
  captions: true,
};

export function planBeats(photos: string[], listing?: KitListing, look: ReelLook = "cinematic"): PlannedBeat[] {
  const urls = photos.filter(Boolean).slice(0, REEL_MAX_PHOTOS);
  if (!urls.length) return [];
  if (look === "luxury") {
    return [{ kind: "photo", urls, caption: "listed", seconds: 31, intro: true, index: 0, move: "push-in" }];
  }
  if (look === "cinematic") {
    return [{ kind: "photo", urls, caption: "showing", seconds: 35.5, intro: true, index: 0, move: "push-in" }];
  }
  return [{ kind: "photo", urls, caption: "collage", seconds: 28, intro: true, index: 0, move: "push-in" }];
}

export function reelDuration(beats: { seconds: number }[]) {
  return beats.reduce((s, b) => s + b.seconds, 0);
}

export function formatDuration(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export async function loadReelImage(url: string): Promise<HTMLImageElement | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const obj = URL.createObjectURL(blob);
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("img"));
      img.src = obj;
    });
  } catch {
    return await new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }
}

export async function loadBeatsAndAssets(
  photos: string[],
  brand: KitBrand,
  listing?: KitListing,
  _look: ReelLook = "cinematic",
): Promise<{ beats: LoadedBeat[]; assets: ReelAssets }> {
  const urls = photos.filter(Boolean).slice(0, REEL_MAX_PHOTOS);
  const loaded = new Map<string, HTMLImageElement>();
  await Promise.all(
    urls.map(async (url) => {
      const img = await loadReelImage(url);
      if (img) loaded.set(url, img);
    }),
  );
  const images = urls.map((u) => loaded.get(u)).filter(Boolean) as HTMLImageElement[];
  const beats: LoadedBeat[] = images.length
    ? [
        {
          kind: "photo",
          urls,
          caption: "",
          seconds: 31,
          intro: true,
          index: 0,
          move: "push-in",
          images,
        },
      ]
    : [];
  const [headshot, logo] = await Promise.all([
    brand.headshot ? loadReelImage(brand.headshot) : Promise.resolve(null),
    brand.logo ? loadReelImage(brand.logo) : Promise.resolve(null),
  ]);
  return { beats, assets: { headshot, logo } };
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "•";
}

function displayFont(look: ReelLook) {
  return look === "luxury" ? "Playfair Display, Georgia, serif" : "Space Grotesk, Helvetica, Arial, sans-serif";
}

function drawCircleImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  cx: number,
  cy: number,
  r: number,
  fallback: string,
  initialsText: string,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (img) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const scale = Math.max((r * 2) / iw, (r * 2) / ih);
    ctx.drawImage(img, cx - (iw * scale) / 2, cy - (ih * scale) / 2, iw * scale, ih * scale);
  } else {
    ctx.fillStyle = fallback;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = "#fff";
    ctx.font = `600 ${Math.round(r * 0.7)}px Helvetica, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initialsText, cx, cy);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = Math.max(3, r * 0.05);
  ctx.stroke();
}

function drawPhotoBeat(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  beat: LoadedBeat,
  local: number,
  listing: KitListing,
  brand: KitBrand,
  style: ReelStyle,
) {
  const img = beat.images[0];
  if (!img) return;
  drawCinematicStill(ctx, img, w, h, local / beat.seconds, beat.move || pickMove(beat.index), local);
  drawDuskWash(ctx, w, h, style.look === "luxury" ? 0.22 : 0.12);
  drawVignette(ctx, w, h, 0.1);

  if (!style.captions) return;
  const font = displayFont(style.look);
  const u = Math.min(w, h);
  const pad = Math.round(u * 0.065);
  const fadeIn = smoothstep(clamp((local - 0.4) / 0.5, 0, 1));
  const fadeOut = local > beat.seconds - 0.45 ? clamp((beat.seconds - local) / 0.45, 0, 1) : 1;

  if (beat.intro) {
    ctx.save();
    ctx.globalAlpha = fadeIn * fadeOut;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = `600 ${Math.round(u * 0.016)}px Instrument Sans, Helvetica, sans-serif`;
    ctx.fillText("JUST LISTED", pad, h * 0.76);
    ctx.fillStyle = "#fff";
    ctx.font = `500 ${Math.round(u * 0.048)}px ${font}`;
    let y = h * 0.81;
    wrapText(ctx, listing.address || "Private listing", w * 0.84, 2).forEach((line) => {
      ctx.fillText(line, pad, y);
      y += Math.round(u * 0.054);
    });
    if (listing.price) {
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.font = `400 ${Math.round(u * 0.032)}px Instrument Sans, Helvetica, sans-serif`;
      ctx.fillText(listing.price, pad, y + 10);
    }
    ctx.restore();
    return;
  }

  if (!beat.caption) return;
  ctx.save();
  ctx.globalAlpha = fadeIn * fadeOut;
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 22;
  ctx.fillStyle = "#fff";
  ctx.font = `500 ${Math.round(u * 0.036)}px ${font}`;
  ctx.fillText(beat.caption, pad, h * 0.9);
  ctx.restore();
}

function drawCollage(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  beat: LoadedBeat,
  local: number,
  brand: KitBrand,
) {
  ctx.fillStyle = brand.bg || "#101214";
  ctx.fillRect(0, 0, w, h);
  const gap = Math.round(w * 0.018);
  const pics = beat.images.slice(0, 3);
  const zoom = (i: number) => lerp(1.04, 1.12 + i * 0.01, local / beat.seconds);
  if (pics.length >= 3) {
    const topH = (h - gap * 3) * 0.58;
    coverDraw(ctx, pics[0], gap, gap, w - gap * 2, topH, zoom(0));
    const botY = gap * 2 + topH;
    const botH = h - botY - gap;
    const cellW = (w - gap * 3) / 2;
    coverDraw(ctx, pics[1], gap, botY, cellW, botH, zoom(1));
    coverDraw(ctx, pics[2], gap * 2 + cellW, botY, cellW, botH, zoom(2));
  }
  drawVignette(ctx, w, h, 0.16);
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  beat: LoadedBeat,
  local: number,
  brand: KitBrand,
) {
  ctx.fillStyle = brand.bg || "#101214";
  ctx.fillRect(0, 0, w, h);
  const gap = Math.round(w * 0.016);
  const cellW = (w - gap * 3) / 2;
  const cellH = (h - gap * 3) / 2;
  beat.images.slice(0, 4).forEach((img, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    coverDraw(ctx, img, gap + col * (cellW + gap), gap + row * (cellH + gap), cellW, cellH, lerp(1.04, 1.1, local / beat.seconds));
  });
  drawVignette(ctx, w, h, 0.16);
}

function drawContact(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  local: number,
  listing: KitListing,
  brand: KitBrand,
  assets: ReelAssets,
  look: ReelLook,
  hero?: HTMLImageElement | null,
) {
  const cinematic = look !== "montage";
  if (hero) {
    drawCinematicStill(ctx, hero, w, h, Math.min(1, local / 3.2), "drift", local);
    ctx.fillStyle = "rgba(8,10,14,0.72)";
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = cinematic ? brand.bg || "#0e1014" : "#ffffff";
    ctx.fillRect(0, 0, w, h);
  }
  if (cinematic) drawVignette(ctx, w, h, 0.28);
  const fade = smoothstep(clamp(local / 0.35, 0, 1));
  ctx.save();
  ctx.globalAlpha = fade;
  const cx = w / 2;
  const u = Math.min(w, h);
  let y = h * 0.24;
  const r = u * 0.12;
  drawCircleImage(ctx, assets.headshot, cx, y + r, r, brand.accent || "#B082F2", initials(brand.name));
  y += r * 2 + Math.round(h * 0.035);
  ctx.textAlign = "center";
  const ink = "#fff";
  const muted = "rgba(255,255,255,0.72)";
  ctx.fillStyle = ink;
  ctx.font = `600 ${Math.round(u * 0.046)}px ${displayFont(look)}`;
  ctx.fillText(brand.name || "Your realtor", cx, y);
  y += Math.round(u * 0.05);
  if (brand.phone) {
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = `500 ${Math.round(u * 0.03)}px Instrument Sans, Helvetica, sans-serif`;
    ctx.fillText(brand.phone, cx, y);
    y += Math.round(u * 0.042);
  }
  if (brand.brokerage) {
    ctx.fillStyle = muted;
    ctx.font = `500 ${Math.round(u * 0.022)}px Helvetica, Arial, sans-serif`;
    ctx.fillText(brand.brokerage, cx, y);
    y += Math.round(u * 0.048);
  }
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fillRect(w * 0.38, y, w * 0.24, 1);
  y += Math.round(u * 0.048);
  ctx.fillStyle = ink;
  ctx.font = `500 ${Math.round(u * 0.026)}px ${displayFont(look)}`;
  wrapText(ctx, [listing.address, listing.price].filter(Boolean).join("  ·  "), w * 0.78, 3).forEach((row) => {
    ctx.fillText(row, cx, y);
    y += Math.round(u * 0.036);
  });
  ctx.restore();
  ctx.textAlign = "left";
}

function drawChrome(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  hideAfter: number,
  brand: KitBrand,
  assets: ReelAssets,
  look: ReelLook,
) {
  const visible =
    t < 0.4 ? t / 0.4 : t > hideAfter - 0.35 ? clamp((hideAfter - t) / 0.35, 0, 1) : 1;
  if (visible <= 0) return;
  ctx.save();
  ctx.globalAlpha = visible * (look === "cinematic" ? 0.88 : 1);
  const pad = Math.round(Math.min(w, h) * 0.045);
  const chipH = Math.round(Math.min(w, h) * 0.038);
  if (assets.logo) {
    const lw = assets.logo.naturalWidth || assets.logo.width;
    const lh = assets.logo.naturalHeight || assets.logo.height;
    const dw = lh ? (lw / lh) * chipH : chipH * 2.2;
    ctx.drawImage(assets.logo, pad, pad, dw, chipH);
  } else if (look !== "cinematic") {
    const mark = (brand.brokerage || brand.name || "COTALA").slice(0, 18).toUpperCase();
    ctx.font = `600 ${Math.round(chipH * 0.55)}px Helvetica, Arial, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(mark, pad, pad + chipH * 0.85);
  }
  if (look === "luxury") {
    drawCircleImage(
      ctx,
      assets.headshot,
      w - pad - 40,
      pad + 40,
      40,
      brand.accent || "#B082F2",
      initials(brand.name),
    );
  }
  ctx.restore();
}

function drawBeat(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  beat: LoadedBeat,
  local: number,
  listing: KitListing,
  brand: KitBrand,
  assets: ReelAssets,
  style: ReelStyle,
  hero?: HTMLImageElement | null,
) {
  if (beat.kind === "contact") drawContact(ctx, w, h, local, listing, brand, assets, style.look, hero);
  else if (beat.kind === "collage") drawCollage(ctx, w, h, beat, local, brand);
  else if (beat.kind === "grid") drawGrid(ctx, w, h, beat, local, brand);
  else drawPhotoBeat(ctx, w, h, beat, local, listing, brand, style);
}

function beatAt(beats: LoadedBeat[], t: number) {
  let cursor = t;
  for (let i = 0; i < beats.length; i++) {
    if (cursor < beats[i].seconds) return { beat: beats[i], local: cursor, index: i };
    cursor -= beats[i].seconds;
  }
  const last = beats[beats.length - 1];
  return { beat: last, local: last?.seconds ?? 0, index: beats.length - 1 };
}

export function drawReelScene(
  ctx: CanvasRenderingContext2D,
  t: number,
  beats: LoadedBeat[],
  listing: KitListing,
  brand: KitBrand,
  assets: ReelAssets,
  w = REEL_W,
  h = REEL_H,
  style: ReelStyle = DEFAULT_STYLE,
) {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (!beats.length) return;
  const total = reelDuration(beats);
  const time = clamp(t, 0, Math.max(total - 0.001, 0));
  const photos = uniqueImages(beats);

  if (style.look === "luxury") {
    drawListedTimeline(ctx, w, h, time, photos, listing, brand, assets);
    return;
  }
  if (style.look === "cinematic") {
    drawShowingTimeline(ctx, w, h, time, photos, listing, brand, assets);
    return;
  }

  drawMontageWall(ctx, w, h, time, photos, listing);
}

function uniqueImages(beats: LoadedBeat[]): HTMLImageElement[] {
  const seen = new Set<HTMLImageElement>();
  const out: HTMLImageElement[] = [];
  for (const b of beats) {
    for (const img of b.images) {
      if (!img || seen.has(img)) continue;
      seen.add(img);
      out.push(img);
    }
  }
  return out;
}

export function recorderMimeCandidates(): string[] {
  const safari =
    typeof navigator !== "undefined" && /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  /* Prefer codecs that include an audio track — vp9-only WebM records silent video. */
  const types = safari
    ? ["video/mp4", "video/webm;codecs=vp8,opus", "video/webm"]
    : [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm;codecs=opus,vp9",
        "video/webm",
        "video/webm;codecs=vp9",
        "video/mp4",
      ];
  return types.filter((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t));
}

export function pickRecorderMime(): string {
  return recorderMimeCandidates()[0] || "";
}

export function blobTypeForMime(mime: string) {
  return mime.startsWith("video/mp4") ? "video/mp4" : "video/webm";
}

async function waitMs(ms: number) {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function recordListingReel(opts: {
  photos: string[];
  listing: KitListing;
  brand: KitBrand;
  audioUrl?: string | null;
  voiceUrl?: string | null;
  look?: ReelLook;
  orientation?: ReelOrientation;
  captions?: boolean;
  onProgress?: (pct: number) => void;
}): Promise<Blob> {
  const look = opts.look || "cinematic";
  const orientation = opts.orientation || "portrait";
  const style: ReelStyle = {
    look,
    orientation,
    captions: opts.captions !== false,
  };
  const { w, h } = reelSize(orientation);
  const { beats, assets } = await loadBeatsAndAssets(opts.photos, opts.brand, opts.listing, look);
  if (!beats.some((b) => b.kind !== "contact")) throw new Error("No photos to render");
  const mime = pickRecorderMime();
  if (!mime) throw new Error("This browser cannot record video. Use Chrome.");

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.style.cssText = "position:fixed;left:-9999px;top:0;pointer-events:none";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  if (!ctx) {
    canvas.remove();
    throw new Error("Canvas unavailable");
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const total = reelDuration(beats);
  const frameCount = Math.max(1, Math.ceil(total * REEL_FPS));
  const frameMs = 1000 / REEL_FPS;

  /* Prefer MediaStreamTrackGenerator — exact 60fps frames, no realtime stutter. */
  const TrackGen = (globalThis as unknown as { MediaStreamTrackGenerator?: new (init: { kind: string }) => MediaStreamTrack }).MediaStreamTrackGenerator;
  const VideoFrameCtor = (globalThis as unknown as { VideoFrame?: typeof VideoFrame }).VideoFrame;
  let stream: MediaStream;
  let stopAudio: (() => void) | null = null;
  let armAudio: (() => void) | null = null;
  let writer: WritableStreamDefaultWriter | null = null;
  let useGenerator = false;

  if (TrackGen && VideoFrameCtor) {
    try {
      const videoTrack = new TrackGen({ kind: "video" });
      writer = (videoTrack as unknown as { writable: WritableStream }).writable.getWriter();
      stream = new MediaStream([videoTrack as unknown as MediaStreamTrack]);
      useGenerator = true;
    } catch {
      stream = canvas.captureStream(REEL_FPS);
    }
  } else {
    stream = canvas.captureStream(REEL_FPS);
  }

  const audioTracks: Array<{ url: string; volume: number; loop?: boolean }> = [];
  if (opts.audioUrl) audioTracks.push({ url: opts.audioUrl, volume: opts.voiceUrl ? 0.12 : 0.5, loop: true });
  if (opts.voiceUrl) audioTracks.push({ url: opts.voiceUrl, volume: 1, loop: false });
  if (audioTracks.length) {
    try {
      const { mixAudioTracks } = await import("./reel-music");
      const mixed = await mixAudioTracks(stream, audioTracks);
      stream = mixed.stream;
      stopAudio = mixed.stop;
      armAudio = mixed.armDelayed;
    } catch {
      /* keep video-only */
    }
  }

  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: REEL_BITRATE,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error("Recording failed"));
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime.includes("mp4") ? "video/mp4" : mime }));
  });

  try {
    recorder.start(Math.max(40, Math.round(frameMs)));
    armAudio?.();
    for (let i = 0; i < frameCount; i++) {
      const t = Math.min((i + 0.001) / REEL_FPS, total - 0.001);
      drawReelScene(ctx, t, beats, opts.listing, opts.brand, assets, w, h, style);
      if (useGenerator && writer && VideoFrameCtor) {
        const frame = new VideoFrameCtor(canvas, {
          timestamp: Math.round((i * 1_000_000) / REEL_FPS),
          duration: Math.round(1_000_000 / REEL_FPS),
        });
        await writer.write(frame);
        frame.close();
      } else {
        const tickStart = performance.now();
        const spent = performance.now() - tickStart;
        const wait = frameMs - spent;
        if (wait > 1) await waitMs(wait);
        else await waitMs(0);
      }
      opts.onProgress?.(Math.min(99, Math.round(((i + 1) / frameCount) * 100)));
    }
    if (writer) {
      try {
        await writer.close();
      } catch {
        /* ignore */
      }
    }
    await waitMs(useGenerator ? 80 : 140);
    recorder.stop();
    opts.onProgress?.(100);
    return await done;
  } finally {
    stopAudio?.();
    stream.getTracks().forEach((tr) => tr.stop());
    canvas.remove();
  }
}
