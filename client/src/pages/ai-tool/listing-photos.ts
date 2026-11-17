import {
  getListingDetails,
  getMyListings,
  getPortalListingDetail,
  getPortalListingMedia,
  listingWithMlx2,
  type ListingDetailsAgent,
  type ListingDetailsTour,
} from "@/lib/api";

const DUMMY_RE = /logo1\.png|84429_2|placeholder|dummy|stock|unsplash|picsum/i;

export function tourPhotoUrl(tourId: string, index: number) {
  return `https://www.cotala.com/tours/${tourId}/${tourId}_${index}.jpg`;
}

export function tourPhotosFromCount(tourId: string, numpics: number): string[] {
  const n = Math.max(0, Number(numpics) || 0);
  return Array.from({ length: n }, (_, i) => tourPhotoUrl(tourId, i + 1));
}

export function toFullListingPhoto(url: string, tourId?: string): string {
  let u = url.trim();
  if (!u) return "";
  u = u.replace("_thm.jpg", ".jpg").replace("_thm.JPG", ".jpg");
  const testtool = u.match(/testtool\/img\/(\d+)_(\d+)\.jpg/i);
  if (testtool) return tourPhotoUrl(testtool[1], Number(testtool[2]));
  if (tourId && /\/tours\/\d+\//.test(u) && !u.includes(`/tours/${tourId}/`)) return "";
  return u;
}

export function isRealListingPhoto(url: unknown, tourId?: string): url is string {
  if (typeof url !== "string") return false;
  const u = url.trim();
  if (!u || !/^https?:\/\//i.test(u)) return false;
  if (DUMMY_RE.test(u)) return false;
  if (tourId && /\/tours\/\d+\//.test(u) && !u.includes(`/tours/${tourId}/`)) return false;
  return true;
}

export function collectUrls(value: unknown, tourId?: string): string[] {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : [value];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const full = toFullListingPhoto(item, tourId);
    if (isRealListingPhoto(full, tourId)) out.push(full);
  }
  return out;
}

export function uniquePhotos(urls: string[], tourId?: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    const full = toFullListingPhoto(url, tourId);
    if (!isRealListingPhoto(full, tourId) || seen.has(full)) continue;
    seen.add(full);
    out.push(full);
  }
  return out;
}

/** Put likely exterior shots first, then interiors — used for reels/slideshows. */
export function orderedListingPhotos(photos: string[]): string[] {
  if (photos.length <= 4) return photos;
  const exteriorCount = Math.min(3, Math.max(1, Math.ceil(photos.length * 0.22)));
  const exterior = photos.slice(0, exteriorCount);
  const interior = photos.slice(exteriorCount);
  return [...exterior, ...interior];
}

export function listingCoverUrl(listing: {
  tourid?: string | number;
  cover_image?: string;
  multipleimages?: string[];
  numpics?: number;
}): string {
  const id = listing.tourid != null ? String(listing.tourid) : "";
  const fromMulti = collectUrls(listing.multipleimages, id)[0];
  if (fromMulti) return fromMulti;
  const cover = listing.cover_image ? toFullListingPhoto(String(listing.cover_image), id) : "";
  if (isRealListingPhoto(cover, id)) return cover;
  if (id && Number(listing.numpics) > 0) return tourPhotoUrl(id, 1);
  return "";
}

export function keepSlotsForListing(saved: string[] | undefined, photos: string[], count: number): string[] {
  const allowed = new Set(photos);
  const kept = (saved || []).filter((url) => allowed.has(url));
  const out = [...kept];
  for (const url of photos) {
    if (out.length >= count) break;
    if (!out.includes(url)) out.push(url);
  }
  return out.slice(0, Math.min(count, photos.length));
}

export function youtubeIdFrom(raw: unknown): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  const id = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/)?.[1];
  if (id) return id;
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  return "";
}

export function youtubeWatchUrl(raw: unknown): string {
  const id = youtubeIdFrom(raw);
  return id ? `https://www.youtube.com/watch?v=${id}` : "";
}

export function listingVideoFileUrl(raw: unknown, tourId: string): string {
  const s = String(raw || "").trim();
  if (!s || s === "0" || /^(yes|no|true|false)$/i.test(s)) return "";
  if (youtubeIdFrom(s)) return "";
  if (/\.(jpe?g|png|gif|webp|bmp|svg|avif)(\?|#|$)/i.test(s)) return "";
  if (/^https?:\/\//i.test(s) && /youtu/i.test(s)) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (/\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(s)) {
    return `https://www.cotala.com/tours/${tourId}/${s.replace(/^\//, "")}`;
  }
  return "";
}

export function listingVideoCandidates(tourId: string, fileUrl?: string): string[] {
  const out: string[] = [];
  const add = (url: string) => {
    if (url && !out.includes(url)) out.push(url);
  };
  add(listingVideoFileUrl(fileUrl, tourId));
  if (!fileUrl && !out.length) return out;
  add(`https://www.cotala.com/tours/${tourId}/${tourId}.mp4`);
  add(`https://www.cotala.com/tours/${tourId}/${tourId}_video.mp4`);
  add(`https://www.cotala.com/tours/${tourId}/tour.mp4`);
  add(`https://www.cotala.com/tours/${tourId}/video.mp4`);
  return out;
}

export function collectListingVideo(
  tourId: string,
  sources: Array<Record<string, unknown> | undefined>,
): { fileUrl: string; youtubeUrl: string } {
  let fileUrl = "";
  let youtubeUrl = "";
  let shouldProbe = false;
  for (const src of sources) {
    if (!src) continue;
    const raw = src.videodownload ?? src.video ?? src.video_url ?? src.videourl ?? src.mp4;
    const s = String(raw ?? "").trim();
    if (s && s !== "0" && !/^(yes|no|true|false)$/i.test(s) && !youtubeIdFrom(s)) shouldProbe = true;
    if (!fileUrl) fileUrl = listingVideoFileUrl(raw, tourId);
    if (!youtubeUrl) {
      youtubeUrl = youtubeWatchUrl(src.YouTube ?? src.youtube ?? src.video ?? src.videodownload);
    }
  }
  if (!fileUrl && shouldProbe && !youtubeUrl) {
    fileUrl = `https://www.cotala.com/tours/${tourId}/${tourId}.mp4`;
  }
  return { fileUrl, youtubeUrl };
}

function isFilled(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") {
    const s = value.trim();
    return Boolean(s) && s !== "0" && s !== "undefined";
  }
  if (typeof value === "object") {
    if (Array.isArray(value)) return value.length > 0;
    return Object.keys(value as Record<string, unknown>).length > 0;
  }
  return true;
}

function mergeMlxBlob(a: unknown, b: unknown): Record<string, unknown> {
  const left = a && typeof a === "object" && !Array.isArray(a) ? (a as Record<string, unknown>) : {};
  const right = b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
  return { ...left, ...right };
}

function mergeTourRecords(
  current: Record<string, unknown> | undefined,
  next: Record<string, unknown>,
): Record<string, unknown> {
  if (!current) return { ...next };
  const out: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(next)) {
    if (key === "mlxdetails" || key === "mlxdetails2") {
      out[key] = mergeMlxBlob(out[key], value);
      continue;
    }
    if (!isFilled(out[key]) && isFilled(value)) out[key] = value;
  }
  return out;
}

export async function loadListingKitSource(tourId: string, userId: string | null): Promise<{
  photos: string[];
  tour?: ListingDetailsTour & Record<string, unknown>;
  agent?: ListingDetailsAgent & Record<string, unknown>;
  video: { fileUrl: string; youtubeUrl: string };
}> {
  let tour: (ListingDetailsTour & Record<string, unknown>) | undefined;
  let agent: (ListingDetailsAgent & Record<string, unknown>) | undefined;
  let mediaRecord: Record<string, unknown> | undefined;
  const photos: string[] = [];

  const takeTour = (next?: Record<string, unknown>) => {
    if (!next) return;
    tour = mergeTourRecords(tour, next) as ListingDetailsTour & Record<string, unknown>;
    photos.push(...collectUrls(next.multipleimages, tourId));
    const n = Number(next.numpics) || 0;
    if (n > 0) photos.push(...tourPhotosFromCount(tourId, n));
  };

  try {
    const portal = await getPortalListingDetail(tourId);
    if (portal.status && portal.data) {
      const payload = portal.data as {
        tour?: Record<string, unknown>;
        agent?: Record<string, unknown>;
        media?: { photos?: string[]; video?: string };
      };
      takeTour(payload.tour);
      if (payload.agent) agent = payload.agent as ListingDetailsAgent & Record<string, unknown>;
      photos.push(...collectUrls(payload.media?.photos, tourId));
      if (payload.media) mediaRecord = payload.media as Record<string, unknown>;
    }
  } catch (err) {
    console.error("Portal listing detail failed", err);
  }

  try {
    if (userId) {
      const details = await getListingDetails({ tourid: tourId, user_id: userId });
      if (details.status && details.tour) {
        takeTour(details.tour as unknown as Record<string, unknown>);
        if (!agent && details.agent) agent = details.agent as ListingDetailsAgent & Record<string, unknown>;
      }
    }
  } catch (err) {
    console.error("listing-details failed", err);
  }

  try {
    if (userId) {
      const mls = String(tour?.mls ?? "").trim();
      const address = String(tour?.address ?? "").trim();
      const queries = [mls, address, ""].filter((q, i, arr) => arr.indexOf(q) === i);
      for (const mls_or_address of queries) {
        const data = await listingWithMlx2({ user_id: userId, mls_or_address, page: 1 });
        const match = data.tours?.find((row) => String(row.tourid) === String(tourId));
        if (match) {
          takeTour(match as unknown as Record<string, unknown>);
          if (!agent && data.agent) agent = data.agent as ListingDetailsAgent & Record<string, unknown>;
          break;
        }
      }
    }
  } catch (err) {
    console.error("listingwithmlx2 failed", err);
  }

  try {
    const media = await getPortalListingMedia(tourId);
    if (media.status && media.data) {
      const data = media.data as { photos?: string[]; video?: string };
      photos.push(...collectUrls(data.photos, tourId));
      mediaRecord = { ...(mediaRecord || {}), ...(data as Record<string, unknown>) };
    }
  } catch (err) {
    console.error("listing media failed", err);
  }

  try {
    const mine = await getMyListings();
    const match = mine.tours?.find((row) => String(row.tourid) === String(tourId));
    if (match) takeTour(match as unknown as Record<string, unknown>);
  } catch (err) {
    console.error("my-listings failed", err);
  }

  return {
    photos: uniquePhotos(photos, tourId),
    tour,
    agent,
    video: collectListingVideo(tourId, [mediaRecord, tour as Record<string, unknown> | undefined]),
  };
}
