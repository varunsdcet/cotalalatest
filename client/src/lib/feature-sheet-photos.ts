import { getListingDetails, getUserIdFromStorage } from "@/lib/api";

const SELECT_IMAGES_API = "https://goyoga.ai/api/api/select-images";
const SELECT_IMAGES_PROXY = "/api/api/select-images";

export type FeatureSheetPhotoSet = {
  cover: string;
  primary: string[];
  secondary: string[];
  gallery: string[];
};

function asImageUrlList(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") {
    const t = value.trim();
    return t ? [t] : [];
  }
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim()) out.push(item.trim());
    else if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      const u =
        (typeof rec.url === "string" && rec.url.trim()) ||
        (typeof rec.src === "string" && rec.src.trim()) ||
        (typeof rec.image === "string" && rec.image.trim()) ||
        "";
      if (u) out.push(u);
    }
  }
  return out;
}

export function uniquePhotoUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const u = raw.trim();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

function parseSelectImagesPayload(payload: unknown): FeatureSheetPhotoSet {
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const nested =
    root.data && typeof root.data === "object" && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : root;
  const cover =
    (typeof nested.cover === "string" && nested.cover.trim()) ||
    (typeof nested.cover_image === "string" && nested.cover_image.trim()) ||
    "";
  const primary = asImageUrlList(nested.primary);
  const secondary = asImageUrlList(nested.secondary);
  const extra = [
    ...asImageUrlList(nested.images),
    ...asImageUrlList(nested.photos),
    ...asImageUrlList(nested.selected_images),
    ...asImageUrlList(root.images),
    ...asImageUrlList(root.photos),
    ...asImageUrlList(root.data),
  ];
  return {
    cover,
    primary,
    secondary,
    gallery: uniquePhotoUrls([cover, ...primary, ...secondary, ...extra]),
  };
}

export function guessedTourPhotoUrls(tourId: string, count = 16): string[] {
  const tid = String(tourId).trim();
  if (!tid) return [];
  return Array.from(
    { length: count },
    (_, i) => `https://www.cotala.com/tours/${tid}/${tid}_${i + 1}.jpg`,
  );
}

function photosFromStoredMlx2(tourId: string): string[] {
  if (!tourId || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem("cotala_listingwithmlx2_response");
    if (!raw) return [];
    const parsed = JSON.parse(raw) as {
      tours?: Array<{ tourid?: string | number; multipleimages?: unknown; numpics?: number }>;
    };
    const tours = Array.isArray(parsed?.tours) ? parsed.tours : [];
    const tour = tours.find((t) => String(t?.tourid) === String(tourId));
    const fromApi = asImageUrlList(tour?.multipleimages);
    if (fromApi.length) return fromApi;
    const n = Number(tour?.numpics) || 0;
    if (n > 0) return guessedTourPhotoUrls(tourId, n);
  } catch {
    /* ignore */
  }
  return [];
}

function photoSetFromGallery(gallery: string[]): FeatureSheetPhotoSet {
  return {
    cover: gallery[0] || "",
    primary: gallery.slice(1, 8),
    secondary: gallery.slice(8, 16),
    gallery: uniquePhotoUrls(gallery),
  };
}

/** Sync listing photos from cache — no network. */
export function immediateFeatureSheetPhotos(tourId: string): FeatureSheetPhotoSet {
  const tid = String(tourId).trim();
  if (!tid) return { cover: "", primary: [], secondary: [], gallery: [] };
  return photoSetFromGallery(photosFromStoredMlx2(tid));
}

async function fetchJsonWithTimeout(url: string, ms = 6000): Promise<unknown | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function selectImagesRequestUrl(tourId: string, userId: string): string {
  const qs = `?tour_id=${encodeURIComponent(tourId)}${
    userId ? `&user_id=${encodeURIComponent(userId)}` : ""
  }`;
  if (import.meta.env.DEV) return `${SELECT_IMAGES_PROXY}${qs}`;
  return `${SELECT_IMAGES_API}${qs}`;
}

/** Listing gallery + GoYoga cover/primary/secondary for the builder. */
export async function fetchFeatureSheetListingPhotos(tourId: string): Promise<FeatureSheetPhotoSet> {
  const tid = String(tourId).trim();
  const empty: FeatureSheetPhotoSet = { cover: "", primary: [], secondary: [], gallery: [] };
  if (!tid) return empty;

  const userId = getUserIdFromStorage() ?? "";
  const immediate = immediateFeatureSheetPhotos(tid);
  let cover = immediate.cover;
  let primary = immediate.primary;
  let secondary = immediate.secondary;
  let gallery = immediate.gallery;

  const [selectPayload, listing] = await Promise.all([
    fetchJsonWithTimeout(selectImagesRequestUrl(tid, userId), 6000),
    userId
      ? getListingDetails({ tourid: tid, user_id: userId }).catch((err) => {
          console.warn("listing-details photos failed", err);
          return null;
        })
      : Promise.resolve(null),
  ]);

  if (selectPayload) {
    const parsed = parseSelectImagesPayload(selectPayload);
    if (parsed.cover) cover = parsed.cover;
    if (parsed.primary.length) primary = parsed.primary;
    if (parsed.secondary.some(Boolean)) secondary = parsed.secondary;
    if (parsed.gallery.length) gallery = uniquePhotoUrls([...parsed.gallery, ...gallery]);
  }

  const listingImages = asImageUrlList(listing?.tour?.multipleimages);
  if (listingImages.length) {
    gallery = uniquePhotoUrls([...listingImages, ...gallery]);
    if (!cover) cover = listingImages[0] || "";
    if (!primary.length) primary = listingImages.slice(1, 8);
    if (!secondary.some(Boolean)) {
      const sec = listingImages.slice(8, 16);
      while (sec.length < 8) sec.push("");
      secondary = sec.slice(0, 8);
    }
  } else {
    const n = Number(listing?.tour?.numpics) || 0;
    if (n > 0) {
      const guessed = guessedTourPhotoUrls(tid, n);
      gallery = uniquePhotoUrls([...guessed, ...gallery]);
      if (!cover) cover = guessed[0] || "";
      if (!primary.length) primary = guessed.slice(1, 8);
      if (!secondary.some(Boolean)) secondary = guessed.slice(8, 16);
    }
  }

  return {
    cover,
    primary,
    secondary,
    gallery: uniquePhotoUrls(gallery),
  };
}
