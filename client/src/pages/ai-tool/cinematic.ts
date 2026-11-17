/** AutoReel-style camera: parallax Ken Burns + premium dissolves. */

import { drawGradedStill } from "./cinematic-gl";

export type CameraMove =
  | "push-in"
  | "pull-out"
  | "pan-left"
  | "pan-right"
  | "tilt-up"
  | "orbit-left"
  | "orbit-right"
  | "drift";

export type CameraState = {
  zoom: number;
  panX: number;
  panY: number;
  rot: number;
};

export type ReelLook = "cinematic" | "luxury" | "montage";
export type ReelOrientation = "portrait" | "landscape";

export const PORTRAIT = { w: 1080, h: 1920 };
export const LANDSCAPE = { w: 1920, h: 1080 };

export function reelSize(orientation: ReelOrientation) {
  return orientation === "landscape" ? LANDSCAPE : PORTRAIT;
}

export function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * clamp(t, 0, 1);
}

export function easeInOutCubic(t: number) {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function smoothstep(t: number) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

export function easeInOutQuart(t: number) {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2;
}

/** Hold → accelerate → ease — feels like a real operator move. */
export function easeCamera(t: number) {
  const x = clamp(t, 0, 1);
  const shaped = x * x * (3 - 2 * x);
  return easeInOutQuart(shaped);
}

const MOVES: CameraMove[] = [
  "push-in",
  "pan-right",
  "pull-out",
  "orbit-left",
  "tilt-up",
  "pan-left",
  "drift",
  "orbit-right",
  "push-in",
];

export function pickMove(index: number): CameraMove {
  return MOVES[index % MOVES.length];
}

/** Confident dolly / pan — client WeTransfer ref energy. */
export function cameraAt(move: CameraMove, t: number): CameraState {
  const held = easeCamera(clamp((t - 0.02) / 0.98, 0, 1));
  switch (move) {
    case "push-in":
      return { zoom: lerp(1.0, 1.14, held), panX: lerp(0.04, 0.45, held), panY: lerp(0.3, -0.7, held), rot: 0 };
    case "pull-out":
      return { zoom: lerp(1.16, 1.02, held), panX: lerp(-0.3, 0.18, held), panY: lerp(-0.6, 0.22, held), rot: 0 };
    case "pan-left":
      return { zoom: 1.1, panX: lerp(1.8, -1.8, held), panY: lerp(0.25, -0.28, held), rot: 0 };
    case "pan-right":
      return { zoom: 1.1, panX: lerp(-1.8, 1.8, held), panY: lerp(-0.25, 0.28, held), rot: 0 };
    case "tilt-up":
      return { zoom: 1.1, panX: lerp(-0.22, 0.22, held), panY: lerp(1.6, -1.6, held), rot: 0 };
    case "orbit-left":
      return { zoom: lerp(1.04, 1.12, held), panX: lerp(1.5, -1.5, held), panY: lerp(0.4, -0.45, held), rot: 0 };
    case "orbit-right":
      return { zoom: lerp(1.04, 1.12, held), panX: lerp(-1.5, 1.5, held), panY: lerp(-0.35, 0.4, held), rot: 0 };
    default:
      return { zoom: lerp(1.03, 1.1, held), panX: lerp(-0.6, 0.6, held), panY: lerp(0.28, -0.35, held), rot: 0 };
  }
}

export function coverDraw(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  zoom: number,
  panX = 0,
  panY = 0,
) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const scale = Math.max(w / iw, h / ih) * zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, x + (w - dw) / 2 + w * (panX / 100), y + (h - dh) / 2 + h * (panY / 100), dw, dh);
  ctx.restore();
}

export function drawCinematicStill(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  progress: number,
  move: CameraMove,
  time = 0,
) {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const cam = cameraAt(move, progress);
  if (drawGradedStill(ctx, img, w, h, cam, 1, time)) return;
  /* Canvas fallback with faux parallax */
  ctx.save();
  ctx.filter = "blur(4px) brightness(0.97)";
  coverDraw(ctx, img, 0, 0, w, h, cam.zoom * 1.08, cam.panX * 0.4, cam.panY * 0.4);
  ctx.filter = "none";
  coverDraw(ctx, img, 0, 0, w, h, cam.zoom, cam.panX, cam.panY);
  ctx.restore();
}

export function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number, amount = 0.14) {
  const g = ctx.createRadialGradient(w / 2, h * 0.42, Math.min(w, h) * 0.36, w / 2, h * 0.5, Math.max(w, h) * 0.85);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.7, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(4,6,8,${amount})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

export function drawDuskWash(ctx: CanvasRenderingContext2D, w: number, h: number, strength = 0.16) {
  const g = ctx.createLinearGradient(0, h * 0.62, 0, h);
  g.addColorStop(0, "rgba(8,10,12,0)");
  g.addColorStop(0.5, `rgba(8,10,12,${strength * 0.4})`);
  g.addColorStop(1, `rgba(8,10,12,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) line = next;
    else {
      if (line) lines.push(line);
      line = word;
      if (lines.length >= maxLines - 1) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

/** Soft dissolve length — snappy like premium listing reels. */
export const XFADE = 0.42;
