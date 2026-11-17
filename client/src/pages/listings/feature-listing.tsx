import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import lightLogo from "@/pages/images/logos/light-logo.svg";
import whiteBackImg from "@/pages/images/whiteback.png";
import buildingImg from "@/pages/images/building.png";
import royalLePageImg from "@/pages/images/royal-lepage.png";
import floorImg from "@/pages/images/floor.png";
import qrDownloadImg from "@/pages/images/download.png";
import {
  COTALA_MY_LISTINGS_URL2_KEY,
  getListingDetails,
  getMyListings,
  getUserIdFromStorage,
  listingWithMlx2,
  updateProfile,
  type ListingDetailsResponse,
} from "@/lib/api";
import { isLikelyWhiteSheetBackground, normalizeCssColor } from "@/lib/normalize-css-color";
import { callAzureOpenAI, type ChatMessage } from "@/lib/chat-service";
import {
  FeatureListingSheetsPreview,
  persistFeatureListingFinalSnapshot,
  readFeatureSheetAgentBrokerageLogoUrl,
  type FeatureListingFinalSnapshot,
  type ScrapePayload,
} from "./feature-listing-preview";

const SELECT_IMAGES_API = "https://goyoga.ai/api/api/select-images";
/** Vite proxies this to goyoga.ai so localhost is not blocked by CORS. */
const SELECT_IMAGES_PROXY = "/api/api/select-images";
/** v2: prior builds cached the hardcoded Burnaby placeholder under real tour ids — bump prefix to drop stale session rows. */
const FEATURE_LISTING_CACHE_PREFIX = "cotala_feature_listing_cache_v2_";

function isHttpUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

function asImageUrlList(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") {
    const v = value.trim();
    return isHttpUrl(v) ? [v] : [];
  }
  if (!Array.isArray(value)) return [];
  const urls: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && isHttpUrl(item)) {
      urls.push(item.trim());
      continue;
    }
    if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      for (const key of ["url", "src", "image", "image_url", "photo", "cover"]) {
        if (typeof rec[key] === "string" && isHttpUrl(rec[key])) {
          urls.push(String(rec[key]).trim());
          break;
        }
      }
    }
  }
  return urls;
}

function uniqueUrls(urls: string[]): string[] {
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

/** GoYoga may return `{ success, data: { cover, primary, secondary } }` or a flatter images list. */
function parseSelectImagesPayload(payload: unknown): {
  cover: string;
  primary: string[];
  secondary: string[];
  gallery: string[];
} {
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
    gallery: uniqueUrls([cover, ...primary, ...secondary, ...extra]),
  };
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
    if (n > 0) {
      return Array.from(
        { length: n },
        (_, i) => `https://www.cotala.com/tours/${tourId}/${tourId}_${i + 1}.jpg`,
      );
    }
  } catch {
    /* ignore */
  }
  return [];
}

function selectImagesRequestUrl(tourId: string, userId: string): string {
  const qs = `?tour_id=${encodeURIComponent(tourId)}${
    userId ? `&user_id=${encodeURIComponent(userId)}` : ""
  }`;
  if (import.meta.env.DEV) return `${SELECT_IMAGES_PROXY}${qs}`;
  return `${SELECT_IMAGES_API}${qs}`;
}

/** Stored next to feature-sheet Select; must include tourId so /feature-listing?id=… never applies another listing’s scrape. */
const FEATURE_VALIDATION_SCRAPE_KEY = "cotala_feature_validation_scrape";

/** Session cache page bg, else `cotala_feature_sheet_agent` bgColour, else white — drives imagepath vs url2 from my-listings. */
function readSheetBgForMyListingsBrokerRule(currentTourId: string): string {
  try {
    const raw = window.sessionStorage.getItem(`${FEATURE_LISTING_CACHE_PREFIX}${currentTourId}`);
    if (raw) {
      const c = JSON.parse(raw) as { pageBgColor?: string };
      if (typeof c.pageBgColor === "string" && c.pageBgColor.trim()) {
        return normalizeCssColor(c.pageBgColor);
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const agentRaw = window.localStorage.getItem("cotala_feature_sheet_agent");
    if (agentRaw) {
      const p = JSON.parse(agentRaw) as { agent?: { bgColour?: string } };
      if (p?.agent?.bgColour?.trim()) {
        return normalizeCssColor(String(p.agent.bgColour));
      }
    }
  } catch {
    /* ignore */
  }
  return normalizeCssColor("#ffffff");
}

type ValidationScrapeEnvelope = { tourId: string | number; scrape: ScrapePayload };

function readValidationScrapeForTour(raw: string | null, expectedTourId: string): ScrapePayload | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      parsed !== null &&
      "tourId" in parsed &&
      "scrape" in parsed
    ) {
      const env = parsed as ValidationScrapeEnvelope;
      if (String(env.tourId) !== String(expectedTourId)) return null;
      return env.scrape;
    }
    // Legacy: plain scrape without tour id — applying it caused wrong MLS on page 4 for other tour URLs.
    return null;
  } catch {
    return null;
  }
}


function getTourIdFromSearch(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return params.get("id")?.trim() ?? "";
}

function buildListingAddressLineFromTour(
  tour: Record<string, unknown> | undefined,
): string {
  if (!tour) return "";
  const unitRaw = tour.unit != null ? String(tour.unit).trim() : "";
  const unit = unitRaw ? `${unitRaw} ` : "";
  const address = String(tour.address ?? "").trim();
  const city = String(tour.city ?? "").trim();
  const street = `${unit}${address}`.trim();
  if (street && city) return `${street}, ${city}`;
  return street || city;
}

/** API may send `mlxdetails`, `mlxdetails2`, or both — merge with v2 winning key collisions. */
function mergeTourMlxRecords(tour: Record<string, unknown> | undefined): Record<string, string> {
  if (!tour) return {};
  const m1 = tour.mlxdetails;
  const m2 = tour.mlxdetails2;
  const a =
    m1 && typeof m1 === "object" && !Array.isArray(m1)
      ? (m1 as Record<string, string>)
      : {};
  const b =
    m2 && typeof m2 === "object" && !Array.isArray(m2)
      ? (m2 as Record<string, string>)
      : {};
  return { ...a, ...b };
}

/**
 * listing-details `agent.coverimage` is often a cross-origin URL. Fetch → blob → data URL so the
 * headshot `<img>` and PDF/canvas paths get an inline src that always paints when CORS allows read.
 * If fetch/CORS fails, returns the original URL.
 */
async function remoteImageUrlToDataUrlForDisplay(url: string): Promise<string> {
  let u = url.trim();
  if (!u) return u;
  if (u.startsWith("data:")) return u;
  if (u.startsWith("//")) u = `https:${u}`;
  try {
    const res = await fetch(u, { mode: "cors", credentials: "omit" });
    if (!res.ok) return url.trim();
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () =>
        resolve(typeof reader.result === "string" ? reader.result : url.trim());
      reader.onerror = () => resolve(url.trim());
      reader.readAsDataURL(blob);
    });
  } catch {
    return url.trim();
  }
}

type AgentBrandingSetters = {
  setPageBgColor: (v: string) => void;
  setPageTextColor: (v: string) => void;
  setAgentHeadshot: (v: string | null) => void;
  setAgentLogo: (v: string | null) => void;
};

/**
 * Customer sheet colours + headshot + brokerage logo from `cotala_feature_sheet_agent` (not listing/dashboard).
 * When session cache returns early (listing photos present) it used to skip this block entirely — users lost theme + headshot if the cache omitted those keys.
 */
function hydrateFeatureListingAgentBranding(
  setters: AgentBrandingSetters,
  opts: { skipPageBg?: boolean; skipPageText?: boolean; skipHeadshot?: boolean } = {},
) {
  try {
    const agentRaw = window.localStorage.getItem("cotala_feature_sheet_agent");
    if (agentRaw) {
      const parsed = JSON.parse(agentRaw) as {
        agent?: {
          bgColour?: string;
          textColour?: string;
          headshot_url?: string;
          broker_logo?: string;
          customer_logo?: string;
        };
      };
      const agent = parsed.agent;
      if (!opts.skipPageBg && agent?.bgColour?.trim()) {
        setters.setPageBgColor(normalizeCssColor(String(agent.bgColour)));
      }
      if (!opts.skipPageText && agent?.textColour?.trim()) {
        setters.setPageTextColor(normalizeCssColor(String(agent.textColour)));
      }
      if (!opts.skipHeadshot && agent?.headshot_url?.trim()) {
        setters.setAgentHeadshot(String(agent.headshot_url).trim());
      }
      if (agent?.customer_logo || agent?.broker_logo) {
        setters.setAgentLogo(agent.broker_logo ?? agent.customer_logo ?? null);
      }
    }
  } catch (err) {
    console.error("Failed to read feature sheet agent theme", err);
  }
}

/** Sheet body: listing `description` first; if empty use legal lines (not public remarks). */
function listingSheetDescriptionFromTour(
  tour: Record<string, unknown> | undefined,
  mdx: Record<string, string>,
): string {
  if (!tour) return "";
  const raw = tour.description;
  const d = typeof raw === "string" ? raw.trim() : "";
  if (d) return d;
  const l1 = (mdx["Legal Description 1"] ?? "").trim();
  if (l1) return l1;
  return (mdx["Legal Description 2"] ?? "").trim();
}

/** Strip common chat phrasing so we never paste "change address to …" as the street line. */
function stripInstructionalAddressFragment(raw: string): string {
  let v = raw.trim();
  v = v
    .replace(
      /^(?:please\s+)?(?:change|fix|update|replace|set)\s+(?:the\s+)?(?:listing\s+)?address\s*(?::|to|=)\s*/i,
      "",
    )
    .trim();
  v = v.replace(/^address\s*(?::|to|=|ko)\s*/i, "").trim();
  if (/\b(?:please|change|fix)\b.{0,40}\baddress\b.{0,80}\bto\b\s+/i.test(v)) {
    const m = v.match(/\bto\s+(.+)$/i);
    if (m) v = m[1].trim();
  }
  return v;
}

/** Title case for property address lines (keeps numeric tokens, e.g. 92A). */
function formatAddressTitleCase(text: string): string {
  const segs = text
    .split(/\s*,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  return segs
    .map((seg) =>
      seg
        .split(/\s+/)
        .map((word) => {
          if (!word) return word;
          if (/^\d+[a-z]?$/i.test(word)) {
            const m = word.match(/^(\d+)([a-z]*)$/i);
            if (!m) return word;
            return `${m[1]}${m[2] ? m[2].toUpperCase() : ""}`;
          }
          if (/^\d+$/.test(word)) return word;
          return word
            .split("-")
            .map((h) => (h ? h.charAt(0).toUpperCase() + h.slice(1).toLowerCase() : h))
            .join("-");
        })
        .join(" "),
    )
    .join(", ");
}

/** If the user (or model) sends a short leading-number fragment, merge into the first street segment. */
function mergeAddressFragmentIntoCurrent(fragment: string, current: string): string {
  const f = fragment.trim();
  const c = current.trim();
  if (!f || !c || f.length >= c.length * 0.75) return f;
  if (!/^\d{1,5}[a-z]?$/i.test(f.replace(/\s+/g, ""))) return f;
  const firstComma = c.indexOf(",");
  const head = (firstComma === -1 ? c : c.slice(0, firstComma)).trim();
  const tail = firstComma === -1 ? "" : c.slice(firstComma + 1).trim();
  const newHead = head.replace(/^(\d+[a-z]?\s*[-–/]?\s*)/i, `${f} `).trim();
  return tail ? `${newHead}, ${tail}` : newHead;
}

/** e.g. "bhrampuri" → replace city / second comma segment instead of wiping the full line. */
function mergeShortPlaceNameIntoAddressLine(fragment: string, current: string): string {
  const f = fragment.trim();
  const parts = current.split(/\s*,\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    parts[1] = f;
    return parts.join(", ");
  }
  if (parts.length === 1 && parts[0]) {
    return `${parts[0]}, ${f}`;
  }
  return f;
}

type NormalizeAddressOptions = {
  /** When false, "change address to X" uses X as the full line (no city-only merge). */
  allowCityFragmentMerge?: boolean;
};

function normalizeListingAddressInput(
  raw: string,
  currentAddress?: string,
  opts?: NormalizeAddressOptions,
): string {
  const stripped = stripInstructionalAddressFragment(raw);
  if (!stripped) return currentAddress?.trim() ?? "";
  const c = currentAddress?.trim() ?? "";
  const allowCityMerge = opts?.allowCityFragmentMerge !== false;
  if (c) {
    const compact = stripped.replace(/\s+/g, "");
    if (/^\d{1,5}[a-z]?$/i.test(compact) && stripped.length < c.length * 0.75) {
      return formatAddressTitleCase(mergeAddressFragmentIntoCurrent(stripped, c));
    }
    if (
      allowCityMerge &&
      stripped.length < c.length * 0.55 &&
      !stripped.includes(",") &&
      /[a-z]/i.test(stripped) &&
      /\d/.test(c)
    ) {
      return formatAddressTitleCase(mergeShortPlaceNameIntoAddressLine(stripped, c));
    }
  }
  return formatAddressTitleCase(stripped);
}

/** Append a user fragment to the end of the address line (e.g. "add Phase 2 to this address"). */
function appendFragmentToListingAddress(fragment: string, current: string): string {
  const raw = stripInstructionalAddressFragment(fragment.trim());
  if (!raw) return formatAddressTitleCase(current.trim());
  const f = formatAddressTitleCase(raw);
  const c = current.trim();
  if (!c) return f;
  const norm = (s: string) => s.replace(/\s+/g, " ").toLowerCase();
  if (norm(c).includes(norm(f)) && f.length >= 3) return formatAddressTitleCase(c);
  return formatAddressTitleCase(`${c}, ${f}`);
}

type FeatureListingUndoSnapshot = {
  listingAddress: string;
  listingDescription: string | null;
  scrapeData: ScrapePayload | null;
  coverImage: string;
  primaryImages: string[];
  secondaryImages: string[];
  agentName: string;
  agentPhone: string;
  agentEmail: string;
  agentWebsite: string;
  brokerage: string;
  agentHeadshot: string | null;
  bedrooms: string;
  bathrooms: string;
  price: string | null;
  pageBgColor: string;
  pageTextColor: string;
};

const ACCOUNT_SYNC_PROMPT =
  "Would you like to update your account information as well?";

const HEADSHOT_ACCOUNT_SYNC_PROMPT =
  "Would you like to sync this headshot to your account profile as well?";

const HEADSHOT_REMOVE_ACCOUNT_SYNC_PROMPT =
  "Would you like to remove this headshot from your account profile as well?";

const WORD_TO_DIGIT: Record<string, string> = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
};

function parseWordOrNumToken(s: string): string | null {
  const x = s.trim().toLowerCase();
  if (WORD_TO_DIGIT[x] !== undefined) return WORD_TO_DIGIT[x];
  if (/^\d+(\.\d+)?$/.test(x)) return x;
  return null;
}

/** e.g. "change two bathrooms to three", "2 bed to 4" */
function parseBedBathNaturalLanguage(
  text: string,
): { field: "bedrooms" | "bathrooms"; value: string } | null {
  const t = text.toLowerCase().trim();
  const bathPatterns = [
    /(?:change|set|update)\s+(?:the\s+)?(\w+|\d+)\s*(?:bath|bathroom)s?\s+(?:to|into)\s+(\w+|\d+)/i,
    /(\w+|\d+)\s*(?:bath|bathroom)s?\s+(?:to|into)\s+(\w+|\d+)/i,
  ];
  for (const re of bathPatterns) {
    const m = t.match(re);
    if (m && /bath/.test(t)) {
      const v = parseWordOrNumToken(m[2]);
      if (v) return { field: "bathrooms", value: v };
    }
  }
  const bedPatterns = [
    /(?:change|set|update)\s+(?:the\s+)?(\w+|\d+)\s*(?:bed|bedroom)s?\s+(?:to|into)\s+(\w+|\d+)/i,
    /(\w+|\d+)\s*(?:bed|bedroom)s?\s+(?:to|into)\s+(\w+|\d+)/i,
  ];
  for (const re of bedPatterns) {
    const m = t.match(re);
    if (m && /bed/.test(t)) {
      const v = parseWordOrNumToken(m[2]);
      if (v) return { field: "bedrooms", value: v };
    }
  }
  return null;
}

function patchScrapeBedBath(
  prev: ScrapePayload | null,
  field: "bedrooms" | "bathrooms",
  valueStr: string,
): ScrapePayload | null {
  if (!prev) return null;
  const pd = { ...(prev.property_details ?? {}) };
  if (field === "bedrooms") {
    const n = parseInt(valueStr, 10);
    if (Number.isFinite(n)) pd.bedrooms = n;
  } else {
    const n = parseFloat(valueStr);
    if (Number.isFinite(n)) pd.bathrooms = n;
  }
  return { ...prev, property_details: pd };
}

function isContactFieldName(field: string): boolean {
  const f = field.toLowerCase();
  return (
    f === "agent name" ||
    f === "agent email" ||
    f === "agent phone" ||
    f === "website"
  );
}

/** Maps sheet contact labels → `profile/update` body keys (partial update only). */
function mapContactChangesToProfileFields(
  changes: { field: string; value: string }[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of changes) {
    const f = c.field.toLowerCase();
    if (f === "agent name") out.name = c.value;
    else if (f === "agent email") out.email = c.value;
    else if (f === "agent phone") out.phone = c.value;
    else if (f === "website") out.url = c.value;
  }
  return out;
}

function isAffirmativeAccountSync(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length < 1 || t.length > 120) return false;
  return (
    /^(haan ji|ji haan|han ji|theek hai|bilkul|zaroor|y|yes|yeah|yep|yup|sure|ok|okay|please|pls|plz|ha|haan|han|hmm|ji|jee|do it|update( it)?|sync|go ahead|confirm|absolutely|kar do|kardo|theek|thik|chalo)!*$/i.test(
      t,
    ) || /^(haan|yes|yeah|ok|okay|sure|pls|plz|ji|jee|haan ji)!*$/i.test(t)
  );
}

function isNegativeAccountSync(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /^(n|no|nope|nah|nahi|na|mat|don'?t|skip|cancel)$/i.test(t);
}

/**
 * Local detection for listing-remarks edits so we do not rely on Azure returning
 * rewrite_listing_description (handles typos like "descrption", "add description …").
 */
/** Internal marker: replace remarks with following text verbatim (no AI rewrite). */
const VERBATIM_DESC_PREFIX = "__DESC_VERBATIM__\n";

/** P1 cover + P2–P7 primary + P8–P15 secondary (8 slots). */
type FeatureListingLayout = {
  coverImage: string;
  primaryImages: string[];
  secondaryImages: string[];
};

function readLayoutSlot(p: number, L: FeatureListingLayout): string {
  if (p === 1) return L.coverImage ?? "";
  if (p >= 2 && p <= 7) return L.primaryImages[p - 2] ?? "";
  if (p >= 8 && p <= 15) return L.secondaryImages[p - 8] ?? "";
  return "";
}

function padSecondary(sec: string[]): string[] {
  const s = [...sec];
  while (s.length < 8) s.push("");
  return s.slice(0, 8);
}

function writeLayoutSlot(p: number, url: string, L: FeatureListingLayout): FeatureListingLayout {
  const out: FeatureListingLayout = {
    coverImage: L.coverImage,
    primaryImages: [...L.primaryImages],
    secondaryImages: padSecondary(L.secondaryImages),
  };
  if (p === 1) out.coverImage = url;
  else if (p >= 2 && p <= 7) {
    while (out.primaryImages.length < p - 1) out.primaryImages.push("");
    out.primaryImages[p - 2] = url;
  } else if (p >= 8 && p <= 15) {
    while (out.secondaryImages.length < p - 7) out.secondaryImages.push("");
    out.secondaryImages[p - 8] = url;
  }
  out.secondaryImages = padSecondary(out.secondaryImages);
  return out;
}

function swapLayoutSlots(a: number, b: number, L: FeatureListingLayout): FeatureListingLayout {
  const va = readLayoutSlot(a, L);
  const vb = readLayoutSlot(b, L);
  let n = writeLayoutSlot(a, vb, L);
  n = writeLayoutSlot(b, va, n);
  return n;
}

function clearLayoutSlots(slots: readonly number[], L: FeatureListingLayout): FeatureListingLayout {
  let n = L;
  for (let i = 0; i < slots.length; i++) {
    const p = slots[i]!;
    if (p >= 1 && p <= 15) n = writeLayoutSlot(p, "", n);
  }
  return n;
}

function keepOnlyLayoutSlots(keep: Set<number>, L: FeatureListingLayout): FeatureListingLayout {
  let n = L;
  for (let p = 1; p <= 15; p++) {
    if (!keep.has(p)) n = writeLayoutSlot(p, "", n);
  }
  return n;
}

function parseSwapCommand(text: string): { a: number; b: number } | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, " ");
  const patterns: RegExp[] = [
    /(?:switch|swap|transpose)\s+p?(\d+)\s+(?:with|and)\s+p?(\d+)/,
    /p?(\d+)\s+(?:switch|swap)\s+(?:with\s+)?p?(\d+)/,
    /\bp(\d+)\s+with\s+p(\d+)\b/,
    /transpose\s+p?(\d+)\s+p?(\d+)/,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      if (a >= 1 && a <= 15 && b >= 1 && b <= 15 && a !== b) return { a, b };
    }
  }
  return null;
}

/** e.g. remove all but P1, P3 — returns slot numbers to keep. */
function parseRemoveAllButCommand(text: string): number[] | null {
  const t = text.trim();
  let rest: string | null = null;
  const m1 = t.match(/^(?:remove|omit|clear)\s+all\s+(?:but|except)\s+(.+)$/i);
  if (m1) rest = m1[1];
  if (!rest) {
    const m2 = t.match(/^keep\s+only\s+(.+)$/i);
    if (m2) rest = m2[1];
  }
  if (!rest) return null;
  const keep = new Set<number>();
  const digitMatches = Array.from(rest.matchAll(/\bp?\s*(\d+)\b/gi));
  for (let i = 0; i < digitMatches.length; i++) {
    const n = parseInt(digitMatches[i]![1], 10);
    if (n >= 1 && n <= 15) keep.add(n);
  }
  if (keep.size === 0) return null;
  return Array.from(keep).sort((x, y) => x - y);
}

/** e.g. remove P5, omit P1 P2 — returns slots to clear. */
function parseRemoveSlotsCommand(text: string): number[] | null {
  const t = text.trim();
  if (/^(?:remove|omit|clear|empty)\s+all\b/i.test(t)) return null;
  const m = t.match(/^(?:remove|omit|clear|empty)\s+(.+)$/i);
  if (!m) return null;
  const tail = m[1].trim();
  if (/^only\b/i.test(tail)) return null;
  const slots: number[] = [];
  const tailMatches = Array.from(tail.matchAll(/\bp?\s*(\d+)\b/gi));
  for (let i = 0; i < tailMatches.length; i++) {
    const n = parseInt(tailMatches[i]![1], 10);
    if (n >= 1 && n <= 15) slots.push(n);
  }
  if (slots.length === 0) return null;
  return Array.from(new Set(slots)).sort((x, y) => x - y);
}

function extractListingDescriptionInstruction(raw: string): string | null {
  const t = raw.trim();
  if (t.length < 4) return null;
  if (/^(?:address\s+)?undo\b|^revert\b/i.test(t)) return null;
  if (/\badd\s+.+\s+to\s+(?:this\s+)?address\b/i.test(t)) return null;
  if (/\badd\s+(?:in\s+to|into)\s+this\s+address\b/i.test(t)) return null;

  const KW =
    "(?:description|descrption|decription|discription|remarks|remark|mls\\s+remarks|public\\s+remarks|listing\\s+remarks|listing\\s+text)";

  const VERBS =
    "(?:add|chnge|chagne|change|set|update|edit|rewrite|fix|modify|shorten|lengthen|improve)";

  /** "change description to …" / "chnge description to …" — use new text verbatim */
  const mChangeTo = t.match(
    new RegExp(
      `^(?:please\\s+)?${VERBS}\\s+(?:the\\s+)?(?:listing\\s+)?${KW}\\s+to\\s+(.+)$`,
      "is",
    ),
  );
  if (mChangeTo?.[1]?.trim()) {
    return `${VERBATIM_DESC_PREFIX}${mChangeTo[1].trim()}`;
  }

  const mAdd = t.match(
    new RegExp(
      `^(?:please\\s+)?${VERBS}\\s+(?:the\\s+)?(?:listing\\s+)?${KW}\\s+(.+)$`,
      "is",
    ),
  );
  if (mAdd?.[1]?.trim()) {
    let rest = mAdd[1].trim();
    if (/^to\s+/i.test(rest)) rest = rest.replace(/^to\s+/i, "").trim();
    return rest;
  }

  const mColon = t.match(new RegExp(`^${KW}\\s*[:=-]\\s*(.+)$`, "is"));
  if (mColon?.[1]?.trim()) return mColon[1].trim();

  const mTo = t.match(new RegExp(`^${KW}\\s+(?:to|as|be)\\s+(.+)$`, "is"));
  if (mTo?.[1]?.trim()) return mTo[1].trim();

  const mHi = t.match(/(?:description|remarks|descrption)\s+(?:ko|mein|me)\s+(.+)/i);
  if (mHi?.[1]?.trim()) return mHi[1].trim();

  if (
    /^(?:please\s+)?(?:rewrite|shorten|lengthen|improve|fix|polish)\s+(?:the\s+)?(?:listing\s+)?(?:description|remarks|descrption)\s*$/i.test(
      t,
    )
  ) {
    return "Rewrite the listing remarks for clarity and a professional tone; keep factual details when present.";
  }

  return null;
}

async function rewriteListingDescriptionWithAI(
  current: string | null,
  instruction: string,
): Promise<string | null> {
  if (instruction.startsWith(VERBATIM_DESC_PREFIX)) {
    const body = instruction.slice(VERBATIM_DESC_PREFIX.length).trim();
    return body.length > 0 ? body : null;
  }
  const base = (current ?? "").trim();
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You edit real-estate listing / MLS public remarks. Apply the user's instruction exactly: " +
        "fix numeric wording (e.g. bedrooms/bathrooms counts), remove time-sensitive content (open houses, showing times, dated events) when asked, " +
        "and keep professional tone. Output ONLY the revised full remarks text — no quotes, no markdown fences.",
    },
    {
      role: "user",
      content:
        (base ? `Current remarks:\n\n${base}\n\n` : "No existing remarks.\n\n") +
        `Instruction:\n${instruction}`,
    },
  ];
  const out = await callAzureOpenAI(messages, 0.2, 2048);
  const trimmed = out?.trim();
  return trimmed || null;
}

export default function FeatureListing() {
  const [, setLocation] = useLocation();
  const tourId = getTourIdFromSearch();
  const [listingPhotos, setListingPhotos] = useState<string[]>([]);
  const [coverImage, setCoverImage] = useState<string>("");
  const [primaryImages, setPrimaryImages] = useState<string[]>([]);
  const [secondaryImages, setSecondaryImages] = useState<string[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [replacements, setReplacements] = useState<
    { id: number; targetP: number; sourceIndex: number }[]
  >([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        'I can replace layout photos (e.g. P1 replace by 2), swap two slots (e.g. switch P3 with P4, swap P3 and P4), clear slots (remove P5, omit all but P1 P3), update agent contact info, bedrooms/baths, rewrite listing remarks / description, or set your headshot from a gallery #. To add text to the address line, say e.g. "add Phase 2 to this address". After address edits, say undo or address undo to step back toward the saved listing address; "Undo last edit" still reverts your last full sheet change. For casing only, try title case address or uppercase address. Ask in plain English, Hindi, or Mandarin (中文).',
    },
  ]);
  const [listingAddress, setListingAddress] = useState("");
  const [mlsNumber, setMlsNumber] = useState<string | null>(null);
  const [agentName, setAgentName] = useState("");
  const [agentPhone, setAgentPhone] = useState("");
  const [agentEmail, setAgentEmail] = useState("");
  const [agentWebsite, setAgentWebsite] = useState("");
  const [brokerage, setBrokerage] = useState("");
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(false);
  const [isLoadingFeature, setIsLoadingFeature] = useState(true);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState(1);
  /** Larger gallery cells, full photo visible (letterboxed), not cropped. */
  const [galleryThumbExpanded, setGalleryThumbExpanded] = useState(false);
  const [listingDescription, setListingDescription] = useState<string | null>(null);
  const [price, setPrice] = useState<string | null>(null);
  const [style, setStyle] = useState("");
  const [tax, setTax] = useState("");
  const [maintFee, setMaintFee] = useState("");
  const [size, setSize] = useState("");
  const [bedrooms, setBedrooms] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [mainFloorSqft, setMainFloorSqft] = useState("");
  const [balconySqft, setBalconySqft] = useState("");
  const [totalLivable, setTotalLivable] = useState("");
  const [totalExtras, setTotalExtras] = useState("");
  const [pageBgColor, setPageBgColor] = useState<string>("#ffffff");
  const [pageTextColor, setPageTextColor] = useState<string>("#374151"); // gray-700
  const [agentHeadshot, setAgentHeadshot] = useState<string | null>(null);
  const [agentLogo, setAgentLogo] = useState<string | null>(null);
  const [scrapeData, setScrapeData] = useState<ScrapePayload | null>(null);
  const undoStackRef = useRef<FeatureListingUndoSnapshot[]>([]);
  const [undoDepth, setUndoDepth] = useState(0);
  /** Saved listing line from API (or selector) for this tour — target for full restore. */
  const canonicalListingAddressRef = useRef<string>("");
  /** Previous address lines before each chat-driven address edit (LIFO undo). */
  const addressBeforeEditStackRef = useRef<string[]>([]);
  const lastSheetMutationRef = useRef<
    "address" | "image" | "description" | "contact" | "other" | null
  >(null);
  const listingAddressRef = useRef(listingAddress);
  const [pendingAccountSync, setPendingAccountSync] = useState<
    | { kind: "contact"; fields: Record<string, string> }
    | { kind: "headshot"; clearAccount?: boolean }
    | null
  >(null);
  const [editorTab, setEditorTab] = useState<
    "chat" | "property" | "photos" | "rooms" | "agent" | "design"
  >("chat");

  useEffect(() => {
    listingAddressRef.current = listingAddress;
  }, [listingAddress]);

  const commitListingAddressChange = (prev: string, next: string) => {
    const p = prev.trim();
    const n = next.trim();
    if (!n || p === n) return;
    addressBeforeEditStackRef.current = [...addressBeforeEditStackRef.current, p].slice(-30);
    lastSheetMutationRef.current = "address";
    setListingAddress(next);
  };

  /** One step back in address history, or jump to canonical when stack is empty but line still edited. */
  const popOneAddressEdit = (): "popped" | "canonical" | false => {
    const stack = addressBeforeEditStackRef.current;
    if (stack.length > 0) {
      const restore = stack[stack.length - 1]!;
      addressBeforeEditStackRef.current = stack.slice(0, -1);
      setListingAddress(restore);
      if (addressBeforeEditStackRef.current.length === 0) {
        lastSheetMutationRef.current = null;
      }
      return "popped";
    }
    const c = canonicalListingAddressRef.current.trim();
    if (c && listingAddressRef.current.trim() !== c) {
      setListingAddress(c);
      lastSheetMutationRef.current = null;
      return "canonical";
    }
    return false;
  };

  const openImageZoom = (url: string) => {
    setZoomedImage(url);
    setZoomScale(1);
  };

  const pushUndoSnapshot = () => {
    const snap: FeatureListingUndoSnapshot = {
      listingAddress,
      listingDescription,
      scrapeData: scrapeData ? (JSON.parse(JSON.stringify(scrapeData)) as ScrapePayload) : null,
      coverImage,
      primaryImages: [...primaryImages],
      secondaryImages: [...secondaryImages],
      agentName,
      agentPhone,
      agentEmail,
      agentWebsite,
      brokerage,
      agentHeadshot,
      bedrooms,
      bathrooms,
      price,
      pageBgColor,
      pageTextColor,
    };
    undoStackRef.current = [...undoStackRef.current.slice(-19), snap];
    setUndoDepth(undoStackRef.current.length);
  };

  const handleUndoLastEdit = (source: "button" | "chat" = "button") => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const snap = stack[stack.length - 1];
    undoStackRef.current = stack.slice(0, -1);
    setUndoDepth(undoStackRef.current.length);
    addressBeforeEditStackRef.current = [];
    lastSheetMutationRef.current = null;
    setListingAddress(snap.listingAddress);
    setListingDescription(snap.listingDescription);
    setScrapeData(snap.scrapeData);
    setCoverImage(snap.coverImage);
    setPrimaryImages(snap.primaryImages);
    setSecondaryImages(snap.secondaryImages);
    setAgentName(snap.agentName);
    setAgentPhone(snap.agentPhone);
    setAgentEmail(snap.agentEmail);
    setAgentWebsite(snap.agentWebsite);
    setBrokerage(snap.brokerage);
    setAgentHeadshot(snap.agentHeadshot);
    setBedrooms(snap.bedrooms);
    setBathrooms(snap.bathrooms);
    setPrice(snap.price);
    setPageBgColor(snap.pageBgColor);
    setPageTextColor(snap.pageTextColor);
    const msg =
      source === "chat"
        ? "Undone — your listing address and the rest of the sheet are back to before that last chat edit."
        : "Reverted your last assistant edit.";
    setChatMessages((prev) => [...prev, { role: "assistant", content: msg }]);
  };

  /**
   * Same source as `/feature-sheet`: `user/listingwithmlx2` returns `agent` (broker_logo, colours, etc.).
   * Always refresh on feature-listing so logo/contact are not missing when localStorage was never set from the selector page.
   */
  useEffect(() => {
    const uid = getUserIdFromStorage();
    if (!uid?.trim() || !tourId?.trim()) return;
    let cancelled = false;
    void listingWithMlx2({ user_id: uid.trim(), mls_or_address: "", page: 1 })
      .then((data) => {
        if (cancelled || !data.status || !data.agent) return;
        const payload = { imagepath: data.imagepath, agent: data.agent };
        try {
          window.localStorage.setItem("cotala_feature_sheet_agent", JSON.stringify(payload));
        } catch {
          /* ignore */
        }
        hydrateFeatureListingAgentBranding(
          {
            setPageBgColor,
            setPageTextColor,
            setAgentHeadshot,
            setAgentLogo,
          },
          { skipHeadshot: true },
        );
        const a = data.agent as Record<string, unknown>;
        if (typeof a.name === "string" && a.name.trim()) setAgentName(String(a.name).trim());
        if (typeof a.email === "string" && a.email.trim()) setAgentEmail(String(a.email).trim());
        const phone =
          typeof a.phone === "string" && String(a.phone).trim()
            ? String(a.phone).trim()
            : typeof a.mobile === "string" && String(a.mobile).trim()
              ? String(a.mobile).trim()
              : "";
        if (phone) setAgentPhone(phone);
        if (typeof a.url === "string" && a.url.trim()) setAgentWebsite(String(a.url).trim());
      })
      .catch((err) => {
        console.error("feature-listing: listingWithMlx2 agent refresh failed", err);
      });
    return () => {
      cancelled = true;
    };
  }, [tourId]);

  useEffect(() => {
    canonicalListingAddressRef.current = "";
    addressBeforeEditStackRef.current = [];
    lastSheetMutationRef.current = null;

    // My-listings `imagepath`/`url2` still stored for other readers; feature sheet brokerage logo is only from `cotala_feature_sheet_agent`.
    const uidListings = getUserIdFromStorage();
    const tourIdForListings = tourId;
    if (uidListings) {
      getMyListings()
        .then((data) => {
          if (!data.status) return;
          const sheetBg = readSheetBgForMyListingsBrokerRule(tourIdForListings);
          const white = isLikelyWhiteSheetBackground(sheetBg);
          const ip = data.imagepath != null ? String(data.imagepath).trim() : "";
          const u2 = data.url2 != null ? String(data.url2).trim() : "";
          const chosen = white ? ip : u2;
          if (chosen) {
            try {
              window.localStorage.setItem(COTALA_MY_LISTINGS_URL2_KEY, chosen);
            } catch {
              /* ignore */
            }
          } else {
            try {
              window.localStorage.removeItem(COTALA_MY_LISTINGS_URL2_KEY);
            } catch {
              /* ignore */
            }
          }
          setAgentLogo(readFeatureSheetAgentBrokerageLogoUrl());
        })
        .catch(() => {
          /* non-fatal */
        });
    }

    const cacheKey = `${FEATURE_LISTING_CACHE_PREFIX}${tourId}`;
    let skipAgentPageBg = false;
    let skipAgentPageText = false;
    let skipAgentHeadshot = false;
    let photosFromCache = false;
    try {
      const rawCache = sessionStorage.getItem(cacheKey);
      if (rawCache) {
        const cache = JSON.parse(rawCache) as {
          listingPhotos?: string[];
          coverImage?: string;
          primaryImages?: string[];
          secondaryImages?: string[];
          listingAddress?: string;
          mlsNumber?: string | null;
          agentName?: string;
          agentPhone?: string;
          agentEmail?: string;
          agentWebsite?: string;
          brokerage?: string;
          listingDescription?: string | null;
          price?: string | null;
          style?: string;
          tax?: string;
          maintFee?: string;
          size?: string;
          bedrooms?: string;
          bathrooms?: string;
          mainFloorSqft?: string;
          balconySqft?: string;
          totalLivable?: string;
          totalExtras?: string;
          pageBgColor?: string;
          pageTextColor?: string;
          agentHeadshot?: string | null;
          agentLogo?: string | null;
          scrapeData?: ScrapePayload | null;
        };

        const cachedBg =
          typeof cache.pageBgColor === "string" ? normalizeCssColor(cache.pageBgColor) : "";
        const cachedTx =
          typeof cache.pageTextColor === "string" ? normalizeCssColor(cache.pageTextColor) : "";
        /** Editor defaults saved into cache before profile hydrated — still allow agent theme. */
        const cacheHasOnlyEditorDefaultColours =
          cachedBg.toLowerCase() === "#ffffff" && cachedTx.toLowerCase() === "#374151";
        skipAgentPageBg = typeof cache.pageBgColor === "string" && !cacheHasOnlyEditorDefaultColours;
        skipAgentPageText = typeof cache.pageTextColor === "string" && !cacheHasOnlyEditorDefaultColours;
        skipAgentHeadshot = Object.prototype.hasOwnProperty.call(cache, "agentHeadshot");

        if (Array.isArray(cache.listingPhotos)) setListingPhotos(cache.listingPhotos);
        if (typeof cache.coverImage === "string") setCoverImage(cache.coverImage);
        if (Array.isArray(cache.primaryImages)) setPrimaryImages(cache.primaryImages);
        if (Array.isArray(cache.secondaryImages)) setSecondaryImages(cache.secondaryImages);
        if (typeof cache.listingAddress === "string") setListingAddress(cache.listingAddress);
        if (typeof cache.mlsNumber !== "undefined") setMlsNumber(cache.mlsNumber ?? null);
        if (typeof cache.agentName === "string") setAgentName(cache.agentName);
        if (typeof cache.agentPhone === "string") setAgentPhone(cache.agentPhone);
        if (typeof cache.agentEmail === "string") setAgentEmail(cache.agentEmail);
        if (typeof cache.agentWebsite === "string") setAgentWebsite(cache.agentWebsite);
        if (typeof cache.brokerage === "string") setBrokerage(cache.brokerage);
        if (typeof cache.listingDescription !== "undefined") setListingDescription(cache.listingDescription ?? null);
        if (typeof cache.price !== "undefined") setPrice(cache.price ?? null);
        if (typeof cache.style === "string") setStyle(cache.style);
        if (typeof cache.tax === "string") setTax(cache.tax);
        if (typeof cache.maintFee === "string") setMaintFee(cache.maintFee);
        if (typeof cache.size === "string") setSize(cache.size);
        if (typeof cache.bedrooms === "string") setBedrooms(cache.bedrooms);
        if (typeof cache.bathrooms === "string") setBathrooms(cache.bathrooms);
        if (typeof cache.mainFloorSqft === "string") setMainFloorSqft(cache.mainFloorSqft);
        if (typeof cache.balconySqft === "string") setBalconySqft(cache.balconySqft);
        if (typeof cache.totalLivable === "string") setTotalLivable(cache.totalLivable);
        if (typeof cache.totalExtras === "string") setTotalExtras(cache.totalExtras);
        if (typeof cache.pageBgColor === "string") setPageBgColor(normalizeCssColor(cache.pageBgColor));
        if (typeof cache.pageTextColor === "string") setPageTextColor(normalizeCssColor(cache.pageTextColor));
        if (typeof cache.agentHeadshot !== "undefined") setAgentHeadshot(cache.agentHeadshot ?? null);
        setAgentLogo(readFeatureSheetAgentBrokerageLogoUrl());
        if (typeof cache.scrapeData !== "undefined") setScrapeData(cache.scrapeData ?? null);

        photosFromCache = Array.isArray(cache.listingPhotos) && cache.listingPhotos.length > 0;
        if (!photosFromCache) {
          setListingPhotos([]);
          setIsLoadingPhotos(true);
          setIsLoadingFeature(true);
        }
      }
    } catch (err) {
      console.error("Failed to read feature listing cache", err);
    }

    // If coming from feature-sheet selector, hydrate from stored selection
    try {
      const raw = window.localStorage.getItem("cotala_feature_sheet_selection");
      if (raw) {
        const sel = JSON.parse(raw) as {
          tourid?: number | string;
          fullAddress?: string;
          mls?: string;
          description?: string;
          agentName?: string;
          agentPhone?: string;
          agentEmail?: string;
          agentWebsite?: string;
          /** Same as agent website / agent profile `url` (MLS URL → tour → dashboard agent). */
          url?: string;
          brokerage?: string;
          style?: string;
          tax?: string;
          maintFee?: string;
          size?: string;
          bedrooms?: string;
          bathrooms?: string;
          mainFloorSqft?: string;
          balconySqft?: string;
          totalLivable?: string;
          totalExtras?: string;
        };
        // Never apply another listing’s row: legacy objects without `tourid` must not hydrate.
        if (sel.tourid != null && String(sel.tourid) === String(tourId)) {
          if (sel.fullAddress) {
            setListingAddress(sel.fullAddress);
            canonicalListingAddressRef.current = sel.fullAddress;
            addressBeforeEditStackRef.current = [];
          }
          if (sel.mls) setMlsNumber(sel.mls);
          if (sel.description) setListingDescription(sel.description);
          if (sel.agentName) setAgentName(sel.agentName);
          if (sel.agentPhone) setAgentPhone(sel.agentPhone);
          if (sel.agentEmail) setAgentEmail(sel.agentEmail);
          {
            const w = sel.agentWebsite || sel.url;
            if (w) setAgentWebsite(w);
          }
          if (sel.brokerage) setBrokerage(sel.brokerage);
          if (sel.style) setStyle(sel.style);
          if (sel.tax) setTax(sel.tax);
          if (sel.maintFee) setMaintFee(sel.maintFee);
          if (sel.size) setSize(sel.size);
          if (sel.bedrooms) setBedrooms(sel.bedrooms);
          if (sel.bathrooms) setBathrooms(sel.bathrooms);
          if (sel.mainFloorSqft) setMainFloorSqft(sel.mainFloorSqft);
          if (sel.balconySqft) setBalconySqft(sel.balconySqft);
          if (sel.totalLivable) setTotalLivable(sel.totalLivable);
          if (sel.totalExtras) setTotalExtras(sel.totalExtras);
        }
      }
    } catch (err) {
      console.error("Failed to read feature sheet selection", err);
    }

    hydrateFeatureListingAgentBranding(
      {
        setPageBgColor,
        setPageTextColor,
        setAgentHeadshot,
        setAgentLogo,
      },
      {
        skipPageBg: skipAgentPageBg,
        skipPageText: skipAgentPageText,
        skipHeadshot: skipAgentHeadshot,
      },
    );

    // Hydrate scrape/validator payload (from feature-sheet Select) — only when tourId matches URL
    try {
      const scrapeRaw = window.localStorage.getItem(FEATURE_VALIDATION_SCRAPE_KEY);
      const parsed = readValidationScrapeForTour(scrapeRaw, tourId);
      if (parsed) {
        setScrapeData(parsed);
        // Do not set `listingDescription` from `parsed.description` — that is MLS public remarks (page 4 only).
        // P2 body comes from tour + MLX via `getListingDetails` / `listingSheetDescriptionFromTour` or selection.

        // Also hydrate summary metrics (price, maint fee, size, beds, baths, taxes)
        // directly from the scrape payload so the top strip and card use the same source
        // as the full page 4 MLS-style detail.
        if (parsed.listing?.listed_price != null) {
          setPrice(String(parsed.listing.listed_price));
        }
        if (parsed.pricing?.maintenance_fee != null) {
          setMaintFee(String(parsed.pricing.maintenance_fee));
        }
        if (parsed.size?.total_sqft != null) {
          setSize(String(parsed.size.total_sqft));
        } else if (parsed.floor_area?.finished_total_sqft != null) {
          setSize(String(parsed.floor_area.finished_total_sqft));
        }
        if (parsed.property_details?.bedrooms != null) {
          setBedrooms(String(parsed.property_details.bedrooms));
        }
        if (parsed.property_details?.bathrooms != null) {
          setBathrooms(String(parsed.property_details.bathrooms));
        }
        if (parsed.pricing?.gross_taxes != null) {
          setTax(`$${parsed.pricing.gross_taxes.toLocaleString()}`);
        }
      }
    } catch (err) {
      console.error("Failed to read feature validation scrape payload", err);
    }

    const user_id = getUserIdFromStorage() ?? "";
    const mlxPhotos = photosFromStoredMlx2(tourId);

    const applyGalleryIfEmpty = (urls: string[]) => {
      const next = uniqueUrls(urls);
      if (!next.length) return;
      setListingPhotos((prev) => (prev.length > 0 ? prev : next));
    };

    const applyGoYogaLayout = (parsed: ReturnType<typeof parseSelectImagesPayload>) => {
      // GoYoga owns sheet slots (cover / P1–P15). Gallery can stay the fuller listing set.
      if (parsed.cover) setCoverImage(parsed.cover);
      if (parsed.primary.length) setPrimaryImages(parsed.primary);
      if (parsed.secondary.length) {
        const sec = [...parsed.secondary];
        while (sec.length < 8) sec.push("");
        setSecondaryImages(sec.slice(0, 8));
      }
      applyGalleryIfEmpty(parsed.gallery);
    };

    const applyListingPhotoSet = (images: string[]) => {
      const next = uniqueUrls(images);
      if (!next.length) return;
      setListingPhotos(next);
      setCoverImage((prev) => prev || next[0] || "");
      setPrimaryImages((prev) => (prev.length > 0 ? prev : next.slice(1, 8)));
      setSecondaryImages((prev) => {
        if (prev.some(Boolean)) return prev;
        const sec = next.slice(8, 16);
        while (sec.length < 8) sec.push("");
        return sec.slice(0, 8);
      });
    };

    if (photosFromCache) {
      setIsLoadingPhotos(false);
    }

    // listing-details: gallery + address/agent (user_id from cotala_user or cotala_user_id)
    if (tourId && user_id && !photosFromCache) {
      setIsLoadingPhotos(true);
      getListingDetails({ tourid: tourId, user_id })
        .then(async (data: ListingDetailsResponse) => {
          const images = asImageUrlList(data.tour?.multipleimages);
          if (images.length > 0) applyListingPhotoSet(images);
          const tour = data.tour as Record<string, unknown> | undefined;
          const agent = data.agent as Record<string, unknown> | undefined;
          const mdx = mergeTourMlxRecords(tour);
          const addrLine = buildListingAddressLineFromTour(tour);
          if (addrLine) {
            setListingAddress(addrLine);
            canonicalListingAddressRef.current = addrLine;
            addressBeforeEditStackRef.current = [];
          }
          if (tour?.mls != null && String(tour.mls).trim() !== "") {
            setMlsNumber(String(tour.mls).trim());
          }
          const listingBody = listingSheetDescriptionFromTour(tour, mdx);
          if (listingBody) {
            setListingDescription(listingBody);
          }
          if (agent?.name) setAgentName(String(agent.name));
          if (agent?.email) setAgentEmail(String(agent.email));
          if (agent?.phone || tour?.agent_phone) setAgentPhone(String(agent?.phone ?? tour?.agent_phone ?? ""));
          if (agent?.website || tour?.agent_website) setAgentWebsite(String(agent?.website ?? tour?.agent_website ?? ""));
          if (tour?.brokerage || mdx["Listing Office Name"]) setBrokerage(String(tour?.brokerage ?? mdx["Listing Office Name"] ?? ""));
          if (tour?.style || mdx["Style"]) setStyle(String(tour?.style ?? mdx["Style"] ?? ""));
          if (tour?.taxes || mdx["Taxes"]) setTax(String(tour?.taxes ?? mdx["Taxes"] ?? ""));
          if (tour?.maint || mdx["Maintenance Fee"]) setMaintFee(String(tour?.maint ?? mdx["Maintenance Fee"] ?? ""));
          if (tour?.sqft || mdx["Sqft"]) setSize(String(tour?.sqft ?? mdx["Sqft"] ?? ""));
          if (tour?.beds || mdx["Bedrooms"]) setBedrooms(String(tour?.beds ?? mdx["Bedrooms"] ?? ""));
          if (tour?.baths || mdx["Bathrooms"]) setBathrooms(String(tour?.baths ?? mdx["Bathrooms"] ?? ""));
          if (mdx["Main Floor"]) setMainFloorSqft(String(mdx["Main Floor"]));
          if (mdx["Balcony"]) setBalconySqft(String(mdx["Balcony"]));
          if (mdx["Total Livable"]) setTotalLivable(String(mdx["Total Livable"]));
          if (mdx["Total Extras"]) setTotalExtras(String(mdx["Total Extras"]));
          if (mdx["List Price"] || (tour as any)?.price) {
            const rawPrice = (mdx["List Price"] as string | undefined) ?? (tour as any).price;
            if (rawPrice != null) setPrice(String(rawPrice));
          }

          // listing-details `agent` carries real sheet colours + headshot URL (not feature-sheet cache).
          if (agent) {
            const bg = typeof agent.bgColour === "string" ? agent.bgColour.trim() : "";
            const tx = typeof agent.textColour === "string" ? agent.textColour.trim() : "";
            if (bg) setPageBgColor(normalizeCssColor(bg));
            if (tx) setPageTextColor(normalizeCssColor(tx));
          }

          if (!skipAgentHeadshot && agent) {
            const looksLikeUrl = (s: string) =>
              /^https?:\/\//i.test(s) || s.startsWith("data:") || s.startsWith("//");
            const headshotUrl =
              (typeof agent.headshot_url === "string" && looksLikeUrl(agent.headshot_url.trim())
                ? agent.headshot_url.trim()
                : "") ||
              (typeof agent.coverimage === "string" && looksLikeUrl(agent.coverimage.trim())
                ? agent.coverimage.trim()
                : "") ||
              (typeof agent.headshot === "string" &&
              looksLikeUrl(agent.headshot.trim()) &&
              !/^(yes|no)$/i.test(agent.headshot.trim())
                ? agent.headshot.trim()
                : "");
            if (headshotUrl) {
              const displaySrc = await remoteImageUrlToDataUrlForDisplay(headshotUrl);
              setAgentHeadshot(displaySrc || headshotUrl);
            }
          }
        })
        .catch((err) => {
          console.error("Failed to load listing photos for feature sheet", err);
          applyGalleryIfEmpty(mlxPhotos);
        })
        .finally(() => {
          setIsLoadingPhotos(false);
        });
    } else if (!photosFromCache) {
      applyGalleryIfEmpty(mlxPhotos);
      setIsLoadingPhotos(false);
    }

    // GoYoga select-images: sheet cover/primary/secondary + gallery fallback (tour_id is enough)
    if (tourId) {
      setIsLoadingFeature(true);
      fetch(selectImagesRequestUrl(tourId, user_id))
        .then(async (res) => {
          if (!res.ok) throw new Error(`select-images ${res.status}`);
          return res.json();
        })
        .then((payload: unknown) => {
          const parsed = parseSelectImagesPayload(payload);
          if (parsed.gallery.length) applyGoYogaLayout(parsed);
          else applyGalleryIfEmpty(mlxPhotos);
        })
        .catch((err) => {
          console.error("Failed to load feature images from GoYoga select-images API", err);
          applyGalleryIfEmpty(mlxPhotos);
        })
        .finally(() => {
          setIsLoadingFeature(false);
        });
    } else {
      setIsLoadingFeature(false);
      if (!photosFromCache) setIsLoadingPhotos(false);
    }
  }, [tourId]);

  useEffect(() => {
    if (isLoadingFeature || isLoadingPhotos) return;
    const cacheKey = `${FEATURE_LISTING_CACHE_PREFIX}${tourId}`;
    try {
      // Omit `listingPhotos` + `scrapeData`: dozens of full URLs + MLS blob exceed sessionStorage quota.
      const desc =
        listingDescription && listingDescription.length > 8000
          ? `${listingDescription.slice(0, 8000)}…`
          : listingDescription;
      const payload = {
        coverImage,
        primaryImages: primaryImages.slice(0, 12),
        secondaryImages: secondaryImages.slice(0, 12),
        listingAddress,
        mlsNumber,
        agentName,
        agentPhone,
        agentEmail,
        agentWebsite,
        brokerage,
        listingDescription: desc,
        price,
        style,
        tax,
        maintFee,
        size,
        bedrooms,
        bathrooms,
        mainFloorSqft,
        balconySqft,
        totalLivable,
        totalExtras,
        pageBgColor,
        pageTextColor,
        agentHeadshot,
        agentLogo,
      };
      const json = JSON.stringify(payload);
      try {
        sessionStorage.setItem(cacheKey, json);
      } catch {
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k?.startsWith(FEATURE_LISTING_CACHE_PREFIX) && k !== cacheKey) {
            try {
              sessionStorage.removeItem(k);
            } catch {
              /* ignore */
            }
          }
        }
        sessionStorage.setItem(cacheKey, json);
      }
    } catch (err) {
      console.error("Failed to write feature listing cache", err);
    }
  }, [
    tourId,
    isLoadingFeature,
    isLoadingPhotos,
    listingPhotos,
    coverImage,
    primaryImages,
    secondaryImages,
    listingAddress,
    mlsNumber,
    agentName,
    agentPhone,
    agentEmail,
    agentWebsite,
    brokerage,
    listingDescription,
    price,
    style,
    tax,
    maintFee,
    size,
    bedrooms,
    bathrooms,
    mainFloorSqft,
    balconySqft,
    totalLivable,
    totalExtras,
    pageBgColor,
    pageTextColor,
    agentHeadshot,
    agentLogo,
    scrapeData,
  ]);

  // Right-side grid: only real listing photos (no placeholder stock images)
  const sidebarImages = listingPhotos;

  // Parse replace commands: "p1 replace by 4", "replace p1 with #1", "p1 to 6", "p1 replace 2", etc.
  const parseReplaceCommand = (text: string): { targetP: number; sourceIndex: number } | null => {
    const normalized = text.toLowerCase().trim();

    const patterns: Array<RegExp> = [
      /replace\s+p(\d+)\s+(?:image\s+)?(?:with|by)\s*#?(\d+)/,   // "replace p1 with #1", "replace p1 image with #1", "replace p1 by 4"
      /p(\d+)\s+replace\s+(?:by\s+)?#?(\d+)/,                     // "p1 replace by 4", "p1 replace 4", "p1 replace #4"
      /p(\d+)\s+(?:with|by|to)\s*#?(\d+)/,                       // "p1 with #1", "p1 by 4", "p1 to 6"
      /replace\s+p(\d+)\s+(\d+)/,                                // "replace p1 2"
    ];

    for (const re of patterns) {
      const m = normalized.match(re);
      if (m) {
        const targetP = parseInt(m[1], 10);
        const sourceIndex = parseInt(m[2], 10);
        return { targetP, sourceIndex };
      }
    }
    return null;
  };

  const normalizeImageUrl = (url: string): string => {
    // Remove query/hash so duplicate detection works across CDN variants
    // like `...jpg?width=...` vs `...jpg`.
    const base = url.split("#")[0];
    return base.split("?")[0];
  };

  const handleImageCommand = (
    text: string,
    currentLayout?: FeatureListingLayout,
  ): { targetP: number; sourceIndex: number; duplicateSlots?: number[] } | null => {
    const parsed = parseReplaceCommand(text);
    if (!parsed) return null;

    const { targetP, sourceIndex } = parsed;
    const sourceUrl = sidebarImages[sourceIndex - 1];
    if (!sourceUrl) return null;
    const sourceKey = normalizeImageUrl(sourceUrl);

    // Find slots (P1–P15) that already show this image (excluding target). We'll clear those and show assistant message.
    const duplicateSlots: number[] = [];
    if (currentLayout) {
      if (
        targetP !== 1 &&
        currentLayout.coverImage &&
        normalizeImageUrl(currentLayout.coverImage) === sourceKey
      ) {
        duplicateSlots.push(1);
      }
      currentLayout.primaryImages.forEach((url, i) => {
        const p = i + 2;
        if (p !== targetP && url && normalizeImageUrl(url) === sourceKey) duplicateSlots.push(p);
      });
      currentLayout.secondaryImages.forEach((url, i) => {
        const p = i + 8;
        if (p !== targetP && url && normalizeImageUrl(url) === sourceKey) duplicateSlots.push(p);
      });
    }

    // Apply replace: set target to sourceUrl, clear any other slot that had sourceUrl (blank/grey box)
    if (targetP === 1) {
      setCoverImage(sourceUrl);
      setPrimaryImages((prev) =>
        prev.map((url) => (url && normalizeImageUrl(url) === sourceKey ? "" : url)),
      );
      setSecondaryImages((prev) =>
        prev.map((url) => (url && normalizeImageUrl(url) === sourceKey ? "" : url)),
      );
    } else if (targetP >= 2 && targetP <= 7) {
      const targetIdx = targetP - 2;
      setCoverImage((prev) => (prev && normalizeImageUrl(prev) === sourceKey ? "" : prev));
      setPrimaryImages((prev) => {
        const next = [...prev];
        while (next.length <= targetIdx) next.push("");
        return next.map((url, i) =>
          i === targetIdx ? sourceUrl : url && normalizeImageUrl(url) === sourceKey ? "" : url,
        );
      });
      setSecondaryImages((prev) =>
        prev.map((url) => (url && normalizeImageUrl(url) === sourceKey ? "" : url)),
      );
    } else if (targetP >= 8) {
      const targetIdx = targetP - 8;
      setCoverImage((prev) => (prev && normalizeImageUrl(prev) === sourceKey ? "" : prev));
      setPrimaryImages((prev) =>
        prev.map((url) => (url && normalizeImageUrl(url) === sourceKey ? "" : url)),
      );
      setSecondaryImages((prev) => {
        const next = [...prev];
        while (next.length < 8) next.push("");
        return next
          .map((url, i) =>
            i === targetIdx ? sourceUrl : url && normalizeImageUrl(url) === sourceKey ? "" : url,
          )
          .slice(0, 8);
      });
    }

    setReplacements((prev) => [
      ...prev,
      { id: prev.length + 1, targetP, sourceIndex },
    ]);

    return duplicateSlots.length > 0 ? { targetP, sourceIndex, duplicateSlots } : { targetP, sourceIndex };
  };

  // Parse text edit commands like "change address to ...", "address change kardo 197 bharampuri se", etc.
  const handleTextCommand = (
    text: string,
  ): { field: string; value: string }[] | null => {
    const changes: { field: string; value: string }[] = [];
    const tAll = text.trim();

    if (/^(title\s*case|capitalize)\s+(?:the\s+)?address$/i.test(tAll)) {
      const next = formatAddressTitleCase(listingAddress);
      commitListingAddressChange(listingAddress, next);
      changes.push({ field: "address (title case)", value: next });
      return changes;
    }
    if (/^uppercase\s+(?:the\s+)?address$/i.test(tAll)) {
      const next = listingAddress
        .split(/\s*,\s*/)
        .map((s) => s.trim().toUpperCase())
        .join(", ");
      commitListingAddressChange(listingAddress, next);
      changes.push({ field: "address (uppercase)", value: next });
      return changes;
    }

    // Strip leading command words and trailing " se", " kardo", " se replace kardo", etc.
    const cleanupValue = (raw: string) => {
      let v = raw.trim();
      v = v.replace(/^(change\s+kardo|replace|badlo|change|kardo|karo)\s+/gi, "").trim();
      v = v.replace(/\s+(se\s+)?(replace\s+)?(kardo|karo|kar\s+do)\s*$/gi, "").trim();
      v = v.replace(/\s+se\s*$/i, "").trim();
      return v;
    };

    // Append: "add X to this address" / "add into this address X" / "address mein X add"
    let addToAddressFragment: string | null = null;
    const addPat1 = text.match(/\badd\s+(.+?)\s+to\s+(?:this\s+)?address\b/i);
    if (addPat1) addToAddressFragment = cleanupValue(addPat1[1]);
    if (!addToAddressFragment) {
      const addPat2 = text.match(
        /\badd\s+(?:in\s*to|into)\s+this\s+address\s*[,:]?\s*(.+)/i,
      );
      if (addPat2) addToAddressFragment = cleanupValue(addPat2[1]);
    }
    if (!addToAddressFragment) {
      const addPat3 = text.match(/address\s+(?:mein|mai)\s+(.+?)\s+add\b/i);
      if (addPat3) addToAddressFragment = cleanupValue(addPat3[1]);
    }
    if (addToAddressFragment) {
      const nextAddr = appendFragmentToListingAddress(addToAddressFragment, listingAddress);
      commitListingAddressChange(listingAddress, nextAddr);
      changes.push({ field: "address (appended)", value: nextAddr });
      return changes;
    }

    // Address: "change|replace address to …" first (full-line replace, no city-only merge).
    // Then "address change kardo …", then informal "address to …" / "address ko …".
    let addressValue: string | null = null;
    let addressFromExplicitChange = false;
    const addrExplicit = text.match(/(?:change|replace)\s+address\s+(?:to\s+)?(.+)/i);
    if (addrExplicit) {
      addressValue = cleanupValue(addrExplicit[1]);
      addressFromExplicitChange = true;
    }
    if (!addressValue) {
      const addrChangeKardo = text.match(/address\s+change\s+kardo\s+(.+)/i);
      if (addrChangeKardo) {
        addressValue = addrChangeKardo[1].replace(/\s+se\s*$/i, "").trim();
      }
    }
    if (!addressValue) {
      const addrTo = text.match(/address\s+(?:ko\s+)?(?:to\s+|se\s+)?(.+?)(?:\s+se\s+replace\s+kardo)?\s*$/i);
      if (addrTo) addressValue = cleanupValue(addrTo[1]);
    }
    if (addressValue) {
      const nextAddr = normalizeListingAddressInput(addressValue, listingAddress, {
        allowCityFragmentMerge: !addressFromExplicitChange,
      });
      commitListingAddressChange(listingAddress, nextAddr);
      changes.push({ field: "address", value: nextAddr });
    }

    const nameMatch = text.match(
      /(agent\s+name|agent)[^a-zA-Z0-9]+(?:to|se|with|=|:|ko)?\s+(.+)/i,
    );
    if (nameMatch) {
      const value = cleanupValue(nameMatch[2]);
      if (value) {
        setAgentName(value);
        changes.push({ field: "agent name", value });
      }
    }

    const emailMatch = text.match(
      /(agent\s+email|email)[^a-zA-Z0-9]+(?:to|se|with|=|:|ko)?\s+(.+)/i,
    );
    if (emailMatch) {
      const value = cleanupValue(emailMatch[2]);
      if (value) {
        setAgentEmail(value);
        changes.push({ field: "agent email", value });
      }
    }

    const phoneMatch = text.match(
      /(agent\s+phone|phone\s+number|phone)[^a-zA-Z0-9]+(?:to|se|with|=|:|ko)?\s+(.+)/i,
    );
    if (phoneMatch) {
      const value = cleanupValue(phoneMatch[2]);
      if (value) {
        setAgentPhone(value);
        changes.push({ field: "agent phone", value });
      }
    }

    const websiteMatch = text.match(
      /(website|web\s*site)[^a-zA-Z0-9]+(?:to|se|with|=|:|ko)?\s+(.+)/i,
    );
    if (websiteMatch) {
      const value = cleanupValue(websiteMatch[2]);
      if (value) {
        setAgentWebsite(value);
        changes.push({ field: "website", value });
      }
    }

    const brokerageMatch = text.match(
      /(brokerage|office|company)[^a-zA-Z0-9]+(?:to|se|with|=|:|ko)?\s+(.+)/i,
    );
    if (brokerageMatch) {
      const value = cleanupValue(brokerageMatch[2]);
      if (value) {
        setBrokerage(value);
        changes.push({ field: "brokerage", value });
      }
    }

    // Background color commands (e.g. "background color #000000" / "bg color white")
    const bgMatch = text.match(
      /(background\s+color|bg\s+color)[^a-zA-Z0-9]+(?:to|se|with|=|:|ko)?\s+(.+)/i,
    );
    if (bgMatch) {
      const raw = cleanupValue(bgMatch[2]);
      if (raw) {
        setPageBgColor(normalizeCssColor(raw));
        changes.push({ field: "background color", value: normalizeCssColor(raw) });
      }
    }

    // Text color commands (e.g. "text color black" / "text color #ffffff")
    const textColorMatch = text.match(
      /(text\s+color|font\s+color)[^a-zA-Z0-9]+(?:to|se|with|=|:|ko)?\s+(.+)/i,
    );
    if (textColorMatch) {
      const raw = cleanupValue(textColorMatch[2]);
      if (raw) {
        setPageTextColor(normalizeCssColor(raw));
        changes.push({ field: "text color", value: normalizeCssColor(raw) });
      }
    }

    const bedBath = parseBedBathNaturalLanguage(text);
    if (bedBath) {
      if (bedBath.field === "bedrooms") {
        setBedrooms(bedBath.value);
        setScrapeData((prev) => patchScrapeBedBath(prev, "bedrooms", bedBath.value));
        changes.push({ field: "bedrooms", value: bedBath.value });
      } else {
        setBathrooms(bedBath.value);
        setScrapeData((prev) => patchScrapeBedBath(prev, "bathrooms", bedBath.value));
        changes.push({ field: "bathrooms", value: bedBath.value });
      }
    }

    if (changes.length === 0) return null;
    const addrTouched = changes.some(
      (c) => c.field === "address" || c.field.startsWith("address ("),
    );
    if (addrTouched) {
      lastSheetMutationRef.current = "address";
    } else if (changes.some((c) => isContactFieldName(c.field))) {
      lastSheetMutationRef.current = "contact";
    } else {
      lastSheetMutationRef.current = "other";
    }
    return changes;
  };

  const appendAccountSyncIfNeeded = (changes: { field: string }[]) => {
    const need = changes.some((c) => isContactFieldName(c.field));
    return need ? `\n\n${ACCOUNT_SYNC_PROMPT}` : "";
  };

  const applyListingDescriptionInstruction = async (instruction: string): Promise<void> => {
    try {
      const remarksSource = scrapeData?.description?.trim() || "";
      const next = await rewriteListingDescriptionWithAI(remarksSource, instruction);
      if (next) {
        lastSheetMutationRef.current = "description";
        setScrapeData((prev) => (prev ? { ...prev, description: next } : prev));
        const trimmed = next.trim();
        const firstBlock =
          trimmed.split(/\r?\n/).find((line) => line.trim().length > 0) ?? trimmed;
        const preview =
          firstBlock.length > 500 ? `${firstBlock.slice(0, 497).trim()}…` : firstBlock;
        setChatMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              `${preview}\n\nListing remarks have been updated per your instruction. Review the preview to confirm.`,
          },
        ]);
      } else {
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Could not revise remarks. Try rephrasing." },
        ]);
      }
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Failed to update remarks." },
      ]);
    }
  };

  const handleSend = async () => {
    const text = chatInput.trim();
    if (!text) return;
    setChatInput("");

    const userMessage: ChatMessage = { role: "user", content: text };
    setChatMessages((prev) => [...prev, userMessage]);

    if (pendingAccountSync) {
      if (isAffirmativeAccountSync(text)) {
        const uid = getUserIdFromStorage();
        if (!uid) {
          setPendingAccountSync(null);
          setChatMessages((prev) => [
            ...prev,
            { role: "assistant", content: "Log in to update your Cotala account." },
          ]);
          return;
        }
        if (pendingAccountSync.kind === "contact") {
          const fields = pendingAccountSync.fields;
          if (Object.keys(fields).length === 0) {
            setPendingAccountSync(null);
            setChatMessages((prev) => [...prev, { role: "assistant", content: "Nothing to sync." }]);
            return;
          }
          try {
            const res = await updateProfile(fields);
            setPendingAccountSync(null);
            if (res.status) {
              setChatMessages((prev) => [
                ...prev,
                { role: "assistant", content: "Your account profile has been updated." },
              ]);
            } else {
              const errMsg =
                res.message ||
                res.msg ||
                (res.errors &&
                  Object.entries(res.errors)
                    .map(([k, v]) => `${k}: ${(v as string[]).join(", ")}`)
                    .join("; ")) ||
                "Update failed.";
              setChatMessages((prev) => [...prev, { role: "assistant", content: errMsg }]);
            }
          } catch (e) {
            setPendingAccountSync(null);
            setChatMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: e instanceof Error ? e.message : "Could not update profile.",
              },
            ]);
          }
          return;
        }
        if (pendingAccountSync.kind === "headshot") {
          const clearing = pendingAccountSync.clearAccount === true;
          let headshotPayload: Record<string, string>;
          if (clearing) {
            headshotPayload = { headshot: "", headshot_jpg: "", headshot_png: "" };
          } else {
            const url = agentHeadshot?.trim();
            if (!url) {
              setPendingAccountSync(null);
              setChatMessages((prev) => [
                ...prev,
                { role: "assistant", content: "No headshot to sync." },
              ]);
              return;
            }
            headshotPayload = { headshot: url };
          }
          try {
            const res = await updateProfile(headshotPayload);
            setPendingAccountSync(null);
            if (res.status) {
              setChatMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: clearing
                    ? "Headshot removed from your account profile."
                    : "Your account headshot has been updated.",
                },
              ]);
            } else {
              const errMsg =
                res.message ||
                res.msg ||
                (res.errors &&
                  Object.entries(res.errors)
                    .map(([k, v]) => `${k}: ${(v as string[]).join(", ")}`)
                    .join("; ")) ||
                "Update failed.";
              setChatMessages((prev) => [...prev, { role: "assistant", content: errMsg }]);
            }
          } catch (e) {
            setPendingAccountSync(null);
            setChatMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: e instanceof Error ? e.message : "Could not update profile.",
              },
            ]);
          }
          return;
        }
      } else if (isNegativeAccountSync(text)) {
        setPendingAccountSync(null);
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Okay — your account profile was not changed." },
        ]);
        return;
      } else {
        setChatMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Reply yes or no (e.g. ok, pls, ji) to update your account, or say skip to leave it unchanged.",
          },
        ]);
        return;
      }
    }

    const trimmedSend = text.trim();
    const normalizedUndo = trimmedSend.replace(/\s+/g, " ").trim();
    const simpleUndoPhrase =
      /^(undo|revert|wapas)$/i.test(normalizedUndo) ||
      /^undo\s+last(?:\s+edit)?$/i.test(trimmedSend);

    if (
      /^(address\s+undo|undo\s+address|address\s+wapas|address\s+peeche|address\s+revert|listing\s+address\s+wapas)/i.test(
        trimmedSend,
      )
    ) {
      const r = popOneAddressEdit();
      if (r === "popped") {
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Reverted one address change." },
        ]);
      } else if (r === "canonical") {
        setChatMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Restored the saved listing address from the property data.",
          },
        ]);
      } else {
        setChatMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "No address step to undo — you are already on the saved listing line (or the listing has no address yet).",
          },
        ]);
      }
      return;
    }

    if (
      simpleUndoPhrase &&
      lastSheetMutationRef.current === "address" &&
      addressBeforeEditStackRef.current.length > 0
    ) {
      const r = popOneAddressEdit();
      if (r === "popped") {
        setChatMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Reverted one address change. Say undo again to step back further, or use Undo last edit to revert your last full sheet change (photos, remarks, etc.).",
          },
        ]);
      } else if (r === "canonical") {
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Restored the saved listing address." },
        ]);
      }
      return;
    }

    if (
      /^(?:address\s+)?undo(?:\s+last(?:\s+edit)?)?$/i.test(trimmedSend) ||
      /^revert(?:\s+last(?:\s+edit)?)?$/i.test(trimmedSend) ||
      /^wapas$/i.test(trimmedSend)
    ) {
      const depthBefore = undoStackRef.current.length;
      handleUndoLastEdit("chat");
      if (undoStackRef.current.length === depthBefore) {
        setChatMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              'Nothing to undo yet. After you change the address, photos, colours, or remarks, say undo or tap "Undo last edit".',
          },
        ]);
      }
      return;
    }

    pushUndoSnapshot();

    const layoutNow: FeatureListingLayout = {
      coverImage,
      primaryImages,
      secondaryImages,
    };

    const removeAllButSlots = parseRemoveAllButCommand(text);
    if (removeAllButSlots) {
      const next = keepOnlyLayoutSlots(new Set(removeAllButSlots), layoutNow);
      setCoverImage(next.coverImage);
      setPrimaryImages(next.primaryImages);
      setSecondaryImages(next.secondaryImages);
      lastSheetMutationRef.current = "image";
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Cleared the layout except ${removeAllButSlots.map((p) => `P${p}`).join(", ")}.`,
        },
      ]);
      return;
    }

    const swapSlots = parseSwapCommand(text);
    if (swapSlots) {
      const next = swapLayoutSlots(swapSlots.a, swapSlots.b, layoutNow);
      setCoverImage(next.coverImage);
      setPrimaryImages(next.primaryImages);
      setSecondaryImages(next.secondaryImages);
      lastSheetMutationRef.current = "image";
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Swapped P${swapSlots.a} and P${swapSlots.b} in the layout.`,
        },
      ]);
      return;
    }

    const removeSlots = parseRemoveSlotsCommand(text);
    if (removeSlots) {
      const next = clearLayoutSlots(removeSlots, layoutNow);
      setCoverImage(next.coverImage);
      setPrimaryImages(next.primaryImages);
      setSecondaryImages(next.secondaryImages);
      lastSheetMutationRef.current = "image";
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Cleared ${removeSlots.map((p) => `P${p}`).join(", ")}.`,
        },
      ]);
      return;
    }

    const imgResult = handleImageCommand(text, {
      coverImage,
      primaryImages,
      secondaryImages,
    });
    if (imgResult) {
      lastSheetMutationRef.current = "image";
      const content =
        imgResult.duplicateSlots && imgResult.duplicateSlots.length > 0
          ? "You have chosen an image that is already used in the layout, I have removed the duplicate image. Which image would you like to use in its place?"
          : `Okay, I've replaced P${imgResult.targetP} with image #${imgResult.sourceIndex} from the sidebar.`;
      setChatMessages((prev) => [...prev, { role: "assistant", content }]);
      return;
    }

    const localChanges = handleTextCommand(text);
    if (localChanges && localChanges.length > 0) {
      const summary = localChanges.map((c) => `${c.field} → "${c.value}"`).join(" · ");
      const extra = appendAccountSyncIfNeeded(localChanges);
      const contactFields = mapContactChangesToProfileFields(
        localChanges.filter((c) => isContactFieldName(c.field)),
      );
      if (Object.keys(contactFields).length > 0) {
        setPendingAccountSync({ kind: "contact", fields: contactFields });
      }
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Done. ${summary}.${extra}` },
      ]);
      return;
    }

    const localDescInstruction = extractListingDescriptionInstruction(text);
    if (localDescInstruction) {
      await applyListingDescriptionInstruction(localDescInstruction);
      return;
    }

    const intentSystem =
      "You are an intent detection engine for a real-estate feature sheet editor. " +
      "Respond with ONLY minified JSON, no markdown, no backticks.\n" +
      "Intents:\n" +
      '{ "intent":"replace_image","targetP":<number>,"sourceIndex":<number> }\n' +
      '{ "intent":"swap_layout_slots","slotA":<number>,"slotB":<number> } — user wants to transpose two sheet photo positions (switch / swap / transpose P3 with P4); NOT replacing from sidebar.\n' +
      '{ "intent":"remove_layout_slots","slots":[<number>,...] } — clear those P slots to empty (remove / omit / clear P5).\n' +
      '{ "intent":"remove_layout_slots_except","keepSlots":[<number>,...] } — remove all layout photos except listed Ps (remove all but P1, P3).\n' +
      '{ "intent":"update_fields","fields":{ "address"?:string,"agentName"?:string,"agentPhone"?:string,"agentEmail"?:string,"agentWebsite"?:string,"brokerage"?:string } }\n' +
      "Phrases like add … to this / into this address are handled locally (no JSON needed).\n" +
      "For update_fields.address: return ONLY the final property address line in Title Case (capitalize each word; keep numbers like 1502, 92A). Never echo instructions (e.g. do not return the phrase 'change address to'). If the user clearly wants the entire line replaced (e.g. 'change address to 123 Main St, Vancouver'), return that full line. If they only give a city or neighbourhood word to swap in, return just that token so it can be merged into the existing line.\n" +
      '{ "intent":"rewrite_listing_description","instruction":string } — user wants to change listing remarks/description: apply instruction to full public remarks (shorten, tone, remove open house / time-sensitive text, fix wording).\n' +
      '{ "intent":"update_bedrooms","bedrooms":string }\n' +
      '{ "intent":"update_bathrooms","bathrooms":string }\n' +
      '{ "intent":"set_headshot_from_gallery","sourceIndex":number } — sidebar image #n for agent headshot.\n' +
      '{ "intent":"remove_headshot" }\n' +
      '{ "intent":"undo_last_edit" } — user says undo / revert last change (handled client-side; still return this if they only say undo).\n' +
      '{ "intent":"none" }\n' +
      "Rules: If the user mentions description, remarks, listing text, listing remarks, or typos like descrption/decription, and wants to add/change/rewrite text, ALWAYS use rewrite_listing_description with instruction set to their full message or the part after the keyword.\n" +
      "If the user wants two layout slots exchanged (English switch/swap/transpose, Hindi बदल दो/अदला-बदली, Chinese 交换/对调), use swap_layout_slots with slotA and slotB (1–15).\n" +
      "If they want slots emptied (remove/omit/删除/去掉某个照片位), use remove_layout_slots or remove_layout_slots_except.\n" +
      "Infer best intent; informal or Hindi / Mandarin Chinese (中文) / English mix is OK.";

    const messages: ChatMessage[] = [
      { role: "system", content: intentSystem },
      { role: "user", content: text },
    ];

    try {
      const reply = await callAzureOpenAI(messages, 0, 700);
      if (!reply) return;

      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = JSON.parse(reply) as Record<string, unknown>;
      } catch {
        setChatMessages((prev) => [...prev, { role: "assistant", content: reply }]);
        return;
      }

      const intent = parsed.intent as string | undefined;

      if (intent === "replace_image") {
        const targetP = Number(parsed.targetP);
        const sourceIndex = Number(parsed.sourceIndex);
        if (Number.isFinite(targetP) && Number.isFinite(sourceIndex)) {
          const result = handleImageCommand(`p${targetP} replace ${sourceIndex}`, {
            coverImage,
            primaryImages,
            secondaryImages,
          });
          if (result) {
            const content =
              result.duplicateSlots && result.duplicateSlots.length > 0
                ? "You have chosen an image that is already used in the layout, I have removed the duplicate image. Which image would you like to use in its place?"
                : `Okay, I've replaced P${result.targetP} with image #${result.sourceIndex} from the sidebar.`;
            setChatMessages((prev) => [...prev, { role: "assistant", content }]);
          }
        }
        return;
      }

      if (intent === "swap_layout_slots") {
        const slotA = Number(parsed.slotA);
        const slotB = Number(parsed.slotB);
        if (
          Number.isFinite(slotA) &&
          Number.isFinite(slotB) &&
          slotA >= 1 &&
          slotA <= 15 &&
          slotB >= 1 &&
          slotB <= 15 &&
          slotA !== slotB
        ) {
          const next = swapLayoutSlots(slotA, slotB, {
            coverImage,
            primaryImages,
            secondaryImages,
          });
          setCoverImage(next.coverImage);
          setPrimaryImages(next.primaryImages);
          setSecondaryImages(next.secondaryImages);
          lastSheetMutationRef.current = "image";
          setChatMessages((prev) => [
            ...prev,
            { role: "assistant", content: `Swapped P${slotA} and P${slotB} in the layout.` },
          ]);
        }
        return;
      }

      if (intent === "remove_layout_slots" && Array.isArray(parsed.slots)) {
        const slots = (parsed.slots as unknown[])
          .map((x) => Number(x))
          .filter((n) => Number.isFinite(n) && n >= 1 && n <= 15);
        if (slots.length > 0) {
          const next = clearLayoutSlots(slots, {
            coverImage,
            primaryImages,
            secondaryImages,
          });
          setCoverImage(next.coverImage);
          setPrimaryImages(next.primaryImages);
          setSecondaryImages(next.secondaryImages);
          lastSheetMutationRef.current = "image";
          setChatMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Cleared ${slots.map((p) => `P${p}`).join(", ")}.`,
            },
          ]);
        }
        return;
      }

      if (intent === "remove_layout_slots_except" && Array.isArray(parsed.keepSlots)) {
        const keep = new Set(
          (parsed.keepSlots as unknown[])
            .map((x) => Number(x))
            .filter((n) => Number.isFinite(n) && n >= 1 && n <= 15),
        );
        if (keep.size > 0) {
          const next = keepOnlyLayoutSlots(keep, {
            coverImage,
            primaryImages,
            secondaryImages,
          });
          setCoverImage(next.coverImage);
          setPrimaryImages(next.primaryImages);
          setSecondaryImages(next.secondaryImages);
          lastSheetMutationRef.current = "image";
          const list = Array.from(keep).sort((a, b) => a - b);
          setChatMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Cleared the layout except ${list.map((p) => `P${p}`).join(", ")}.`,
            },
          ]);
        }
        return;
      }

      if (intent === "rewrite_listing_description" && typeof parsed.instruction === "string") {
        await applyListingDescriptionInstruction(parsed.instruction);
        return;
      }

      if (intent === "undo_last_edit") {
        const depthBefore = undoStackRef.current.length;
        handleUndoLastEdit("chat");
        if (undoStackRef.current.length === depthBefore) {
          setChatMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content:
                'Nothing to undo yet. Change the address, photos, colours, or remarks first — then say undo or use "Undo last edit".',
            },
          ]);
        }
        return;
      }

      if (intent === "none") {
        const fb = extractListingDescriptionInstruction(text);
        if (fb) {
          await applyListingDescriptionInstruction(fb);
          return;
        }
        if (/\b(descrption|decription|discription|listing\s+remarks|public\s+remarks)\b/i.test(text)) {
          await applyListingDescriptionInstruction(text);
          return;
        }
        setChatMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              'I did not understand that command. To edit listing remarks, try e.g. “add description …” with your text, “rewrite remarks shorter”, or describe the change in plain English. To fix address wording, try “title case address” or “capitalize address”. Say undo (or use the Undo button) to revert your last edit.',
          },
        ]);
        return;
      }

      if (intent === "update_bedrooms" && typeof parsed.bedrooms === "string") {
        setBedrooms(parsed.bedrooms);
        setScrapeData((prev) => patchScrapeBedBath(prev, "bedrooms", parsed.bedrooms as string));
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Bedrooms set to ${parsed.bedrooms}.` },
        ]);
        return;
      }

      if (intent === "update_bathrooms" && typeof parsed.bathrooms === "string") {
        setBathrooms(parsed.bathrooms);
        setScrapeData((prev) => patchScrapeBedBath(prev, "bathrooms", parsed.bathrooms as string));
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Bathrooms set to ${parsed.bathrooms}.` },
        ]);
        return;
      }

      if (intent === "set_headshot_from_gallery") {
        const n = Number(parsed.sourceIndex);
        if (Number.isFinite(n) && n >= 1) {
          const url = sidebarImages[n - 1];
          if (url) {
            setAgentHeadshot(url);
            setPendingAccountSync({ kind: "headshot", clearAccount: false });
            setChatMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `Headshot updated from gallery #${n}.\n\n${HEADSHOT_ACCOUNT_SYNC_PROMPT}`,
              },
            ]);
            return;
          }
        }
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Pick a valid sidebar image number for the headshot." },
        ]);
        return;
      }

      if (intent === "remove_headshot") {
        setAgentHeadshot(null);
        setPendingAccountSync({ kind: "headshot", clearAccount: true });
        setChatMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Headshot removed from the feature sheet (blank).\n\n${HEADSHOT_REMOVE_ACCOUNT_SYNC_PROMPT}`,
          },
        ]);
        return;
      }

      if (intent === "update_fields" && parsed.fields && typeof parsed.fields === "object") {
        const fields = parsed.fields as {
          address?: string;
          agentName?: string;
          agentPhone?: string;
          agentEmail?: string;
          agentWebsite?: string;
          brokerage?: string;
        };

        const applied: { field: string; value: string }[] = [];
        if (fields.address) {
          const nextAddr = normalizeListingAddressInput(
            fields.address,
            listingAddressRef.current,
          );
          if (nextAddr.trim() !== listingAddressRef.current.trim()) {
            lastSheetMutationRef.current = "address";
            setListingAddress(nextAddr);
          }
          applied.push({ field: "address", value: nextAddr });
        }
        if (fields.agentName) {
          setAgentName(fields.agentName);
          applied.push({ field: "agent name", value: fields.agentName });
        }
        if (fields.agentPhone) {
          setAgentPhone(fields.agentPhone);
          applied.push({ field: "agent phone", value: fields.agentPhone });
        }
        if (fields.agentEmail) {
          setAgentEmail(fields.agentEmail);
          applied.push({ field: "agent email", value: fields.agentEmail });
        }
        if (fields.agentWebsite) {
          setAgentWebsite(fields.agentWebsite);
          applied.push({ field: "website", value: fields.agentWebsite });
        }
        if (fields.brokerage) {
          setBrokerage(fields.brokerage);
          applied.push({ field: "brokerage", value: fields.brokerage });
        }

        if (applied.length > 0) {
          const summary = applied.map((a) => `${a.field} → "${a.value}"`).join(", ");
          const extra = appendAccountSyncIfNeeded(applied);
          const contactFields = mapContactChangesToProfileFields(
            applied.filter((a) => isContactFieldName(a.field)),
          );
          if (Object.keys(contactFields).length > 0) {
            setPendingAccountSync({ kind: "contact", fields: contactFields });
          }
          setChatMessages((prev) => [
            ...prev,
            { role: "assistant", content: `Done. ${summary}.${extra}` },
          ]);
          return;
        }
      }

      const lateDescriptionInstruction = extractListingDescriptionInstruction(text);
      if (lateDescriptionInstruction) {
        await applyListingDescriptionInstruction(lateDescriptionInstruction);
        return;
      }
      if (/\b(descrption|decription|discription|listing\s+remarks|public\s+remarks)\b/i.test(text)) {
        await applyListingDescriptionInstruction(text);
        return;
      }

      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "I did not understand that command. You can change photos (P1 replace 2), swap slots (switch P3 with P4), clear slots (remove P5, remove all but P1 P3), contact fields, bedrooms/baths, or listing remarks — e.g. “add description …” followed by your wording.",
        },
      ]);
    } catch (err) {
      console.error("Failed to call Azure OpenAI", err);
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-[#101622] text-slate-100">
      {/* Top Navigation Bar */}
      <header className="flex h-16 items-center justify-between border-b border-slate-700/60 bg-slate-900/90 px-4 md:px-6 z-10">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="flex items-center justify-center w-10 h-10 rounded-lg hover:opacity-90 transition-opacity"
            aria-label="Back to previous page"
          >
            <img src={whiteBackImg} alt="" className="h-6 w-6 object-contain" />
          </button>
          <img src={lightLogo} alt="Cotala Logo" className="h-7 w-auto" />
        </div>
        <div className="flex items-center gap-3">
          {!isLoadingFeature && (
            <button
              className="bg-[#0E94B9] text-white px-4 py-2 rounded-lg font-bold text-xs shadow-sm hover:bg-[#0E94B9]/90 flex items-center gap-2"
              onClick={() => {
                const tid = String(tourId ?? "").trim();
                if (!tid) {
                  setChatMessages((prev) => [
                    ...prev,
                    {
                      role: "assistant",
                      content:
                        "Missing listing id in the URL (?id=…). Open this page from your listing with a tour id, then try Finished Editing again.",
                    },
                  ]);
                  return;
                }
                const snap: FeatureListingFinalSnapshot = {
                  version: 1,
                  tourId: tid,
                  pageBgColor,
                  pageTextColor,
                  listingAddress,
                  coverImage,
                  primaryImages: [...primaryImages],
                  secondaryImages: [...secondaryImages],
                  agentName,
                  agentPhone,
                  agentEmail,
                  agentWebsite,
                  agentHeadshot,
                  agentLogo,
                  price,
                  listingDescription,
                  maintFee,
                  size,
                  bedrooms,
                  bathrooms,
                  tax,
                  scrapeData,
                };
                persistFeatureListingFinalSnapshot(snap);
                setLocation(`/feature-sheet-builder?id=${encodeURIComponent(tid)}`);
              }}
            >
              <span>Finished Editing</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Layout Container */}
      <main className="flex flex-1 overflow-hidden">
        {/* Left Panel: Chat + Property / Photos / Rooms / Agent / Design tabs */}
        <aside className="flex w-80 flex-col border-r border-slate-800 bg-slate-950/80">
          <div className="flex flex-wrap border-b border-slate-800">
            {(
              [
                ["chat", "Chat"],
                ["property", "Property"],
                ["photos", "Photos"],
                ["rooms", "Rooms"],
                ["agent", "Agent"],
                ["design", "Design"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setEditorTab(id)}
                className={`flex-1 min-w-[44px] px-1.5 py-2 text-[10px] font-semibold whitespace-nowrap border-b-2 transition-colors ${
                  editorTab === id
                    ? "border-[#0E94B9] text-white"
                    : "border-transparent text-slate-500 hover:text-slate-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {editorTab === "chat" && (
            <>
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">Assistant</span>
            <button
              type="button"
              disabled={undoDepth === 0}
              onClick={() => handleUndoLastEdit("button")}
              className="text-[10px] font-semibold px-2 py-1 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none"
            >
              Undo last edit
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.map((msg, idx) => {
              if (msg.role === "user") {
                return (
                  <div key={idx} className="flex justify-end">
                    <div className="bg-[#0E94B9] text-white rounded-2xl rounded-tr-none p-3 text-xs shadow-md max-w-[80%]">
                      {msg.content}
                    </div>
                  </div>
                );
              }
              if (msg.role === "assistant") {
                return (
                  <div key={idx} className="flex justify-start">
                    <div className="bg-slate-800/80 text-slate-100 rounded-2xl rounded-tl-none p-3 text-xs max-w-[80%]">
                      {msg.content}
                    </div>
                  </div>
                );
              }
              return null;
            })}
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-slate-800">
            <div className="relative">
              <textarea
                className="w-full resize-none rounded-xl border border-slate-700 bg-slate-900/70 p-3 pr-10 text-xs focus:ring-2 focus:ring-[#0E94B9] focus:border-transparent outline-none"
                placeholder='e.g. P1 replace by 2 · switch P3 with P4 · remove all but P1, P3 (Enter to send)'
                rows={3}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <button
                className="absolute bottom-2.5 right-2.5 p-1.5 bg-[#0E94B9] text-white rounded-lg hover:bg-[#0E94B9]/90 shadow-md"
                onClick={handleSend}
              >
                <span className="material-symbols-outlined text-sm">send</span>
              </button>
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                className="shrink-0 text-[10px] font-bold px-3 py-1 bg-slate-900 border border-slate-700 rounded-full hover:border-[#0E94B9]"
                onClick={() => setChatInput("switch P3 with P4")}
              >
                Swap Images
              </button>
              <button
                type="button"
                className="shrink-0 text-[10px] font-bold px-3 py-1 bg-slate-900 border border-slate-700 rounded-full hover:border-[#0E94B9]"
                onClick={() => setEditorTab("design")}
              >
                Change Colors
              </button>
              <button
                type="button"
                className="shrink-0 text-[10px] font-bold px-3 py-1 bg-slate-900 border border-slate-700 rounded-full hover:border-[#0E94B9]"
                onClick={() => setChatInput("rewrite description: ")}
              >
                Edit Text
              </button>
            </div>
          </div>
            </>
          )}

          {editorTab === "property" && (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-800 pb-1">
                Listing Info
              </div>
              <label className="block space-y-1">
                <span className="text-[10px] text-slate-400">Address</span>
                <input
                  className="w-full rounded-lg border border-slate-700 bg-slate-900/70 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-[#0E94B9]"
                  value={listingAddress}
                  onChange={(e) => setListingAddress(e.target.value)}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] text-slate-400">List Price</span>
                <input
                  className="w-full rounded-lg border border-slate-700 bg-slate-900/70 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-[#0E94B9]"
                  value={price ?? ""}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className="text-[10px] text-slate-400">Bedrooms</span>
                  <input
                    className="w-full rounded-lg border border-slate-700 bg-slate-900/70 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-[#0E94B9]"
                    value={bedrooms}
                    onChange={(e) => setBedrooms(e.target.value)}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[10px] text-slate-400">Bathrooms</span>
                  <input
                    className="w-full rounded-lg border border-slate-700 bg-slate-900/70 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-[#0E94B9]"
                    value={bathrooms}
                    onChange={(e) => setBathrooms(e.target.value)}
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className="text-[10px] text-slate-400">Size (sq ft)</span>
                  <input
                    className="w-full rounded-lg border border-slate-700 bg-slate-900/70 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-[#0E94B9]"
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[10px] text-slate-400">Taxes</span>
                  <input
                    className="w-full rounded-lg border border-slate-700 bg-slate-900/70 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-[#0E94B9]"
                    value={tax}
                    onChange={(e) => setTax(e.target.value)}
                  />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-[10px] text-slate-400">Maint. Fee</span>
                <input
                  className="w-full rounded-lg border border-slate-700 bg-slate-900/70 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-[#0E94B9]"
                  value={maintFee}
                  onChange={(e) => setMaintFee(e.target.value)}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] text-slate-400">Style / Complex</span>
                <input
                  className="w-full rounded-lg border border-slate-700 bg-slate-900/70 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-[#0E94B9]"
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] text-slate-400">Description / Remarks</span>
                <textarea
                  className="w-full resize-none rounded-lg border border-slate-700 bg-slate-900/70 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-[#0E94B9]"
                  rows={6}
                  value={listingDescription ?? ""}
                  onChange={(e) => setListingDescription(e.target.value)}
                />
              </label>
            </div>
          )}

          {editorTab === "photos" && (
            <div className="flex-1 overflow-y-auto p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Listing Gallery
                </span>
                <span className="bg-slate-800 text-[10px] px-2 py-0.5 rounded font-bold">
                  {sidebarImages.length} TOTAL
                </span>
              </div>
              <p className="mb-3 text-[10px] text-slate-500">
                Tap a photo to zoom. In Chat, use e.g. &quot;P1 replace by 2&quot; with gallery #.
              </p>
              {isLoadingPhotos ? (
                <div className="flex h-40 items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-[#0E94B9]" />
                </div>
              ) : sidebarImages.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-700 px-4 py-8 text-center text-[12px] text-slate-500">
                  No photos for this listing yet.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {sidebarImages.map((url, idx) => (
                    <button
                      key={url + idx}
                      type="button"
                      className="relative aspect-square overflow-hidden rounded-lg border border-[#0E94B9]/40 bg-slate-900"
                      onClick={() => openImageZoom(url)}
                    >
                      <img src={url} alt={`Gallery ${idx + 1}`} className="h-full w-full object-cover" />
                      <span className="absolute top-1 left-1 rounded bg-slate-900 px-1.5 py-0.5 text-[9px] font-bold">
                        #{idx + 1}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {editorTab === "rooms" && (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-800 pb-1">
                Room Dimensions
              </div>
              <div className="grid grid-cols-3 gap-1 text-[9px] text-slate-500 px-0.5">
                <span>Floor</span>
                <span>Type</span>
                <span>Dimensions</span>
              </div>
              {(Array.isArray(scrapeData?.room_list) ? scrapeData!.room_list : [])
                .filter((r) => (r?.name ?? "").trim() !== "")
                .map((r, i) => (
                  <div key={i} className="grid grid-cols-3 gap-1 text-[11px] text-slate-200">
                    <span className="truncate rounded border border-slate-800 bg-slate-900/60 px-1.5 py-1">
                      {r.floor ?? "-"}
                    </span>
                    <span className="truncate rounded border border-slate-800 bg-slate-900/60 px-1.5 py-1">
                      {r.name ?? "-"}
                    </span>
                    <span className="truncate rounded border border-slate-800 bg-slate-900/60 px-1.5 py-1">
                      {r.dimensions ?? "-"}
                    </span>
                  </div>
                ))}
              {!(scrapeData?.room_list ?? []).some((r) => (r?.name ?? "").trim()) && (
                <p className="text-[11px] text-slate-500">No room list in MLS scrape yet.</p>
              )}
              <div className="pt-2 text-[10px] text-slate-500">
                Edit beds/baths in Property, or ask Chat (e.g. &quot;beds to 4&quot;).
              </div>
            </div>
          )}

          {editorTab === "agent" && (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-800 pb-1">
                Agent
              </div>
              <label className="block space-y-1">
                <span className="text-[10px] text-slate-400">Name</span>
                <input
                  className="w-full rounded-lg border border-slate-700 bg-slate-900/70 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-[#0E94B9]"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] text-slate-400">Phone</span>
                <input
                  className="w-full rounded-lg border border-slate-700 bg-slate-900/70 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-[#0E94B9]"
                  value={agentPhone}
                  onChange={(e) => setAgentPhone(e.target.value)}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] text-slate-400">Email</span>
                <input
                  className="w-full rounded-lg border border-slate-700 bg-slate-900/70 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-[#0E94B9]"
                  value={agentEmail}
                  onChange={(e) => setAgentEmail(e.target.value)}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] text-slate-400">Website</span>
                <input
                  className="w-full rounded-lg border border-slate-700 bg-slate-900/70 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-[#0E94B9]"
                  value={agentWebsite}
                  onChange={(e) => setAgentWebsite(e.target.value)}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] text-slate-400">Brokerage</span>
                <input
                  className="w-full rounded-lg border border-slate-700 bg-slate-900/70 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-[#0E94B9]"
                  value={brokerage}
                  onChange={(e) => setBrokerage(e.target.value)}
                />
              </label>
              <div className="space-y-1">
                <span className="text-[10px] text-slate-400">Headshot</span>
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-600 bg-slate-900">
                  {agentHeadshot ? (
                    <img src={agentHeadshot} alt="Agent" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-[10px] text-slate-500">None</span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500">
                  Chat: &quot;set headshot from gallery #3&quot; or remove headshot.
                </p>
              </div>
            </div>
          )}

          {editorTab === "design" && (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-800 pb-1">
                Page Colors
              </div>
              <label className="block space-y-1">
                <span className="text-[10px] text-slate-400">Background</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    className="h-8 w-8 cursor-pointer rounded border border-slate-600 bg-transparent"
                    value={normalizeCssColor(pageBgColor) || "#ffffff"}
                    onChange={(e) => setPageBgColor(e.target.value)}
                  />
                  <input
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-900/70 px-2.5 py-1.5 font-mono text-xs text-slate-100 outline-none focus:border-[#0E94B9]"
                    value={pageBgColor}
                    onChange={(e) => setPageBgColor(e.target.value)}
                  />
                </div>
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] text-slate-400">Text</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    className="h-8 w-8 cursor-pointer rounded border border-slate-600 bg-transparent"
                    value={normalizeCssColor(pageTextColor) || "#374151"}
                    onChange={(e) => setPageTextColor(e.target.value)}
                  />
                  <input
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-900/70 px-2.5 py-1.5 font-mono text-xs text-slate-100 outline-none focus:border-[#0E94B9]"
                    value={pageTextColor}
                    onChange={(e) => setPageTextColor(e.target.value)}
                  />
                </div>
              </label>
            </div>
          )}
        </aside>

        {/* Center Workspace: The Feature Sheet Preview */}
        <section className="relative flex flex-1 flex-col bg-slate-900/60 p-4 md:p-8 overflow-y-auto">
          {isLoadingFeature ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-600 border-t-[#0E94B9]" />
            </div>
          ) : (
            <FeatureListingSheetsPreview
              tourId={tourId}
              pageBgColor={pageBgColor}
              pageTextColor={pageTextColor}
              listingAddress={listingAddress}
              coverImage={coverImage}
              primaryImages={primaryImages}
              secondaryImages={secondaryImages}
              agentName={agentName}
              agentPhone={agentPhone}
              agentEmail={agentEmail}
              agentWebsite={agentWebsite}
              agentHeadshot={agentHeadshot}
              agentLogo={agentLogo}
              price={price}
              listingDescription={listingDescription}
              maintFee={maintFee}
              size={size}
              bedrooms={bedrooms}
              bathrooms={bathrooms}
              tax={tax}
              scrapeData={scrapeData}
              onCoverClick={(url) => openImageZoom(url)}
            />
          )}
        </section>

        {/* Right Drawer: Image Gallery */}
        <aside className="hidden md:flex w-72 flex-col border-l border-slate-800 bg-slate-950/90">
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-3">
            <button
              type="button"
              title={
                galleryThumbExpanded
                  ? "Smaller thumbnails (cropped grid)"
                  : "Larger thumbnails — full photo, no crop"
              }
              aria-label={
                galleryThumbExpanded
                  ? "Use smaller gallery thumbnails"
                  : "Use larger gallery thumbnails with full image visible"
              }
              aria-pressed={galleryThumbExpanded}
              onClick={() => setGalleryThumbExpanded((v) => !v)}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                galleryThumbExpanded
                  ? "border-[#0E94B9] bg-[#0E94B9]/20 text-[#0E94B9]"
                  : "border-slate-600 bg-slate-900 text-slate-300 hover:border-slate-500"
              }`}
            >
              {galleryThumbExpanded ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <rect x="3" y="3" width="7.5" height="7.5" rx="1.2" stroke="currentColor" strokeWidth="1.35" />
                  <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.2" stroke="currentColor" strokeWidth="1.35" />
                  <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.2" stroke="currentColor" strokeWidth="1.35" />
                  <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.2" stroke="currentColor" strokeWidth="1.35" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <rect x="2.5" y="3" width="19" height="14" rx="2" stroke="currentColor" strokeWidth="1.4" />
                  <rect x="11" y="10" width="10" height="9" rx="1.2" stroke="currentColor" strokeWidth="1.4" fill="currentColor" fillOpacity="0.12" />
                </svg>
              )}
            </button>
            <span className="bg-slate-800 text-[10px] px-2 py-0.5 rounded font-bold">
              {sidebarImages.length} TOTAL
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {isLoadingPhotos ? (
              <div className="flex h-full items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-[#0E94B9]" />
              </div>
            ) : sidebarImages.length === 0 ? (
              <div className="flex min-h-[160px] items-center justify-center rounded-lg border border-dashed border-slate-700 px-4 text-center text-[13px] text-slate-500">
                No photos for this listing yet.
              </div>
            ) : (
              <div
                className={`grid gap-3 ${galleryThumbExpanded ? "grid-cols-1" : "grid-cols-2"}`}
              >
                {sidebarImages.map((url, idx) => (
                  <div
                    key={url + idx}
                    className={`relative group cursor-pointer rounded-lg border-2 border-[#0E94B9]/40 bg-slate-900/80 ${
                      galleryThumbExpanded
                        ? "aspect-[4/3] min-h-[7.5rem]"
                        : "aspect-square"
                    }`}
                    onClick={() => openImageZoom(url)}
                    role="button"
                    tabIndex={0}
                  >
                    <img
                      alt={`Image ${idx + 1}`}
                      className={
                        galleryThumbExpanded
                          ? "absolute inset-0 m-auto max-h-full max-w-full rounded-md object-contain p-1.5"
                          : "h-full w-full rounded-lg object-cover"
                      }
                      src={url}
                    />
                    <div className="absolute top-1.5 left-1.5 bg-slate-900 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                      #{idx + 1}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {replacements.length > 0 && (
              <div className="mt-4 border-t border-slate-800 pt-3 space-y-1">
                {replacements.map((r) => (
                  <div key={r.id} className="text-[11px] text-slate-300">
                    R{r.id}: P{r.targetP} ← #{r.sourceIndex}
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </main>

      {/* Image zoom lightbox */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setZoomedImage(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Zoomed image"
        >
          {/* Close (cross) button – zoom se wapas / band karne ke liye */}
          <button
            type="button"
            className="absolute top-4 right-4 z-10 flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-red-500"
            onClick={() => setZoomedImage(null)}
            aria-label="Close"
          >
            <span className="material-symbols-outlined text-xl">close</span>
            <span>Close</span>
          </button>

          <div
            className="absolute top-4 left-4 flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm text-white hover:bg-slate-600 disabled:opacity-50"
              onClick={() => setZoomScale((s) => Math.max(0.5, s - 0.25))}
              disabled={zoomScale <= 0.5}
            >
              Zoom out
            </button>
            <span className="text-sm text-white">{Math.round(zoomScale * 100)}%</span>
            <button
              type="button"
              className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm text-white hover:bg-slate-600 disabled:opacity-50"
              onClick={() => setZoomScale((s) => Math.min(3, s + 0.25))}
              disabled={zoomScale >= 3}
            >
              Zoom in
            </button>
          </div>
          <div
            className="max-h-[90vh] max-w-[90vw] overflow-auto"
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => {
              e.preventDefault();
              if (e.deltaY < 0) setZoomScale((s) => Math.min(3, s + 0.15));
              else setZoomScale((s) => Math.max(0.5, s - 0.15));
            }}
          >
            <img
              src={zoomedImage}
              alt="Zoomed"
              className="object-contain transition-transform duration-150"
              style={{ transform: `scale(${zoomScale})`, transformOrigin: "center" }}
              draggable={false}
            />
          </div>
        </div>
      )}
    </div>
  );
}

