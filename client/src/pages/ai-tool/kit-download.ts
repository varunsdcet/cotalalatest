import html2canvas from "html2canvas";
import { saveAs } from "file-saver";
import JSZip from "jszip";

export async function fetchPhotoBlob(url: string): Promise<Blob | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (res.ok) return await res.blob();
  } catch {
    /* try no-cors-less fallback below */
  }
  try {
    const res = await fetch(url);
    if (res.ok) return await res.blob();
  } catch {
    return null;
  }
  return null;
}

export async function fetchAsDataUrl(url: string): Promise<string | null> {
  const blob = await fetchPhotoBlob(url);
  if (!blob) return null;
  return await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

async function inlineImages(root: HTMLElement): Promise<() => void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  const restores: Array<{ el: HTMLImageElement; src: string }> = [];
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.currentSrc || img.getAttribute("src") || "";
      if (!src || src.startsWith("data:")) return;
      const data = await fetchAsDataUrl(src);
      if (!data) return;
      restores.push({ el: img, src });
      img.setAttribute("src", data);
      try {
        if (typeof img.decode === "function") await img.decode();
      } catch {
        /* ignore */
      }
    }),
  );
  return () => {
    for (const { el, src } of restores) el.setAttribute("src", src);
  };
}

export async function downloadNodeAsJpeg(node: HTMLElement | null, filename: string): Promise<void> {
  if (!node) throw new Error("Nothing to download");
  const restore = await inlineImages(node);
  try {
    const canvas = await html2canvas(node, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#000000",
      logging: false,
      width: node.offsetWidth,
      height: node.offsetHeight,
    });
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92),
    );
    if (!blob) throw new Error("Could not render image");
    saveAs(blob, filename);
  } finally {
    restore();
  }
}

export async function downloadPhotoFile(url: string, filename: string): Promise<void> {
  const blob = await fetchPhotoBlob(url);
  if (!blob) throw new Error("Could not download photo");
  saveAs(blob, filename);
}

export async function downloadPhotosZip(urls: string[], zipName: string): Promise<number> {
  const zip = new JSZip();
  let ok = 0;
  await Promise.all(
    urls.map(async (url, index) => {
      const blob = await fetchPhotoBlob(url);
      if (!blob) return;
      zip.file(`photo_${String(index + 1).padStart(3, "0")}.jpg`, blob);
      ok += 1;
    }),
  );
  if (!ok) throw new Error("Could not download listing photos");
  saveAs(await zip.generateAsync({ type: "blob" }), zipName);
  return ok;
}

export async function nodeToJpegBlob(node: HTMLElement | null): Promise<Blob> {
  if (!node) throw new Error("Nothing to download");
  const restore = await inlineImages(node);
  try {
    const canvas = await html2canvas(node, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#000000",
      logging: false,
      width: node.offsetWidth,
      height: node.offsetHeight,
    });
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92),
    );
    if (!blob) throw new Error("Could not render image");
    return blob;
  } finally {
    restore();
  }
}

export async function shareOrSaveBlob(blob: Blob, filename: string, title: string): Promise<void> {
  const file = new File([blob], filename, { type: blob.type || "image/jpeg" });
  const canFiles = typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  if (typeof navigator.share === "function" && canFiles) {
    await navigator.share({ files: [file], title, text: title });
    return;
  }
  saveAs(blob, filename);
}

export async function shareNodeAsJpeg(node: HTMLElement | null, filename: string, title: string): Promise<void> {
  const blob = await nodeToJpegBlob(node);
  await shareOrSaveBlob(blob, filename, title);
}

export async function copyText(value: string): Promise<void> {
  if (!value) throw new Error("Nothing to copy");
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  throw new Error("Clipboard not available");
}

function attrEscape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function embedCodeFor(url: string, title: string, kind: "image" | "video" | "page" = "image"): string {
  if (!url) return "";
  const t = attrEscape(title || "Cotala listing");
  const u = attrEscape(url);
  if (kind === "page") {
    return `<iframe src="${u}" width="100%" height="640" style="border:0;max-width:100%" allowfullscreen title="${t}"></iframe>`;
  }
  if (kind === "video") {
    if (/youtu\.be|youtube\.com\/(watch|embed|shorts)/i.test(url)) {
      const id = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/)?.[1];
      const src = id ? `https://www.youtube.com/embed/${id}` : u;
      return `<iframe src="${src}" width="100%" height="480" style="border:0;max-width:100%" allow="autoplay; fullscreen" allowfullscreen title="${t}"></iframe>`;
    }
    return `<video src="${u}" controls playsinline style="width:100%;max-height:720px" title="${t}"></video>`;
  }
  return `<a href="${u}" target="_blank" rel="noopener"><img src="${u}" alt="${t}" style="max-width:100%;height:auto" /></a>`;
}

async function fitJpeg(blob: Blob, maxW: number, maxH: number): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(maxW / bmp.width, maxH / bmp.height, 1);
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return blob;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    return (await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9))) || blob;
  } catch {
    return blob;
  }
}

export async function downloadPhotosResizedZip(
  urls: string[],
  zipName: string,
  maxW: number,
  maxH: number,
): Promise<number> {
  const zip = new JSZip();
  let ok = 0;
  await Promise.all(
    urls.map(async (url, index) => {
      const raw = await fetchPhotoBlob(url);
      if (!raw) return;
      const blob = await fitJpeg(raw, maxW, maxH);
      zip.file(`photo_${String(index + 1).padStart(3, "0")}_${maxW}x${maxH}.jpg`, blob);
      ok += 1;
    }),
  );
  if (!ok) throw new Error("Could not download listing photos");
  saveAs(await zip.generateAsync({ type: "blob" }), zipName);
  return ok;
}
