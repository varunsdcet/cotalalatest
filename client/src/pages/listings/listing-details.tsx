import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useLocation, Link } from "wouter";
import {
  AlertCircle,
  Check,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  Plus,
  Send,
  Star,
  X,
} from "lucide-react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import {
  getDashboardScreen,
  getListingDetails,
  getListingScreen,
  getPortalListingDetail,
  getPortalListingStats,
  getTourStats,
  getUserHome,
  getUserIdFromStorage,
  submitPhotographerRating,
} from "@/lib/api";
import { startFeatureSheetForListing } from "@/lib/start-feature-sheet";
import { toFullListingPhoto } from "@/pages/ai-tool/listing-photos";
import PortalFooter from "@/components/portal/PortalFooter";
import SendToPrintModal from "./send-to-print-modal";
import emptyBannerBg from "@/pages/images/banner-09.png";
import featureSheetImg from "@/pages/images/p-2.jpg";
import printFeatureSheetImg from "@/pages/images/feature-sheet.jpg";
import printTrifoldImg from "@/pages/images/Trifold.jpg";
import printPostcardImg from "@/pages/images/just-sold.jpg";
import printDoorKnockerImg from "@/pages/images/door-knockers.jpg";
import dayNightImg from "@/pages/images/vs-day-night.jpg";
import blueSkyImg from "@/pages/images/vs-blue-sky.jpg";
import virtualStagingImg from "@/pages/images/vs-virtual-staging.jpg";
import "./listing-details-v2.css";

type Rec = Record<string, unknown>;

const asRec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string =>
  typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "";
const firstStr = (...vals: unknown[]): string => {
  for (const v of vals) {
    const s = str(v);
    if (s) return s;
  }
  return "";
};

const DESIGN_EDITOR =
  (import.meta.env.VITE_DESIGN_EDITOR_URL as string | undefined)?.replace(/\/$/, "") ||
  "https://design.cotala.com";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type StatsRange = "weekly" | "monthly" | "3months" | "6months";
const STATS_RANGES: Array<{ key: StatsRange; label: string; field: string }> = [
  { key: "weekly", label: "Weekly", field: "weekly_graph" },
  { key: "monthly", label: "Monthly", field: "monthly_graph" },
  { key: "3months", label: "3 Months", field: "three_month_graph" },
  { key: "6months", label: "6 Months", field: "six_month_graph" },
];

const DEFAULT_TABS: Array<{ key: string; label: string }> = [
  { key: "photos", label: "Photos" },
  { key: "panoramas", label: "Panoramas" },
  { key: "floorplan", label: "Floorplan" },
  { key: "matterport", label: "Matterport" },
  { key: "video", label: "Video" },
  { key: "print_media", label: "Print Media" },
  { key: "eflyer", label: "E-Flyer" },
];
const HIDDEN_TABS = new Set(["virtual_services", "virtual-services", "stats", "overview"]);
const LANDING_TAB = "landing";
const SCREEN_TAB_KEYS = new Set(DEFAULT_TABS.map((t) => t.key));
const TAB_ALIASES: Record<string, string> = {
  virtual: LANDING_TAB,
  "virtual-tour": LANDING_TAB,
  stats: LANDING_TAB,
  landing: LANDING_TAB,
  print: "print_media",
  "print-media": "print_media",
  panorama: "panoramas",
  "360": "panoramas",
};

interface ScreenTab {
  key: string;
  label: string;
  count: number | null;
}
interface FloorplanItem {
  url: string;
  label: string;
  type: "jpeg" | "pdf";
}
interface PrintRow {
  id: string;
  product: string;
  qty: string;
  price: string;
  status: string;
  needsApproval: boolean;
  proofUrl: string;
  image: string;
}
interface PrintMarketingProduct {
  id: string;
  name: string;
  image: string;
  blurb: string;
  match: RegExp;
}
interface ServiceRow {
  id: string;
  name: string;
  qty: string;
  price: string;
  status: string;
  start: string;
}
interface TemplateItem {
  name: string;
  image: string;
  url: string;
}
interface Graph {
  labels: string[];
  data: number[];
}
interface StatsModel {
  totalHits: string;
  avgHits: string;
  bestDay: string;
  bestHits: string;
  graphs: Record<StatsRange, Graph | null>;
}
interface EflyerModel {
  imageUrl: string;
  previewHtml: string;
  inboxUrl: string;
  inboxLabel: string;
}
interface ListingModel {
  tourid: string;
  address: string;
  street: string;
  city: string;
  mls: string;
  status: string;
  visibility: string;
  cover: string;
  virtualTour: string;
  landingUrl: string;
  photos: string[];
  panoramas: Array<{ image: string; name: string }>;
  floorplans: FloorplanItem[];
  matterport: string;
  video: string;
  eflyer: EflyerModel | null;
  printHistory: PrintRow[];
  recentTemplates: TemplateItem[];
  printMarketing: PrintMarketingProduct[];
  productImageBase: string;
  serviceHistory: ServiceRow[];
  stats: StatsModel | null;
  proofId: string | null;
  proofAlertMessage: string;
  tabs: ScreenTab[];
  photographerName: string;
  photographerRating: number;
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s.replace(" ", "T");
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatShortDate(s: string): string {
  const d = /\d{4}-\d{2}-\d{2}/.test(s) ? parseDate(s) : null;
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : s;
}

function formatGraphLabel(label: unknown): string {
  const s = str(label);
  if (/^\d{1,2}$/.test(s)) {
    const m = Number(s);
    if (m >= 1 && m <= 12) return MONTHS[m - 1];
  }
  return formatShortDate(s);
}

function formatMoney(v: unknown): string {
  const s = str(v);
  if (!s) return "—";
  const n = Number(s.replace(/[$,]/g, ""));
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : s;
}

function formatQty(v: unknown): string {
  const s = str(v);
  if (!s) return "";
  const n = Number(s);
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : s;
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function isEmptyValue(v: unknown): boolean {
  if (v == null || v === "" || v === false) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.values(v as Rec).every(isEmptyValue);
  return false;
}

/** Fill empty sections of `prev` with data from `next` (never overwrites populated data). */
function mergeScreen(prev: Rec, next: Rec): Rec {
  const out: Rec = { ...prev };
  for (const [key, value] of Object.entries(next)) {
    const current = prev[key];
    if (isEmptyValue(current)) {
      if (!isEmptyValue(value)) out[key] = value;
    } else if (
      current && typeof current === "object" && !Array.isArray(current) &&
      value && typeof value === "object" && !Array.isArray(value)
    ) {
      const merged: Rec = { ...(current as Rec) };
      for (const [k2, v2] of Object.entries(value as Rec)) {
        if (isEmptyValue(merged[k2]) && !isEmptyValue(v2)) {
          merged[k2] = v2;
        } else if (
          // Prefer richer recent_templates (e.g. productimage filled later on print_media tab)
          k2 === "recent_templates" &&
          Array.isArray(v2) &&
          v2.length > 0
        ) {
          merged[k2] = v2;
        }
      }
      out[key] = merged;
    }
  }
  return out;
}

function parseFloorplans(raw: unknown): FloorplanItem[] {
  const items: FloorplanItem[] = [];
  const seen = new Set<string>();
  const push = (url: unknown, label: string) => {
    const u = str(url);
    if (!u || seen.has(u)) return;
    seen.add(u);
    items.push({ url: u, label, type: /\.pdf(\?|$)/i.test(u) ? "pdf" : "jpeg" });
  };
  if (Array.isArray(raw)) {
    raw.forEach((url, i) => push(url, i === 0 ? "JPG (MLS Size)" : `Floorplan ${i + 1}`));
    return items;
  }
  const fp = asRec(raw);
  push(fp.mls || fp.image2, "JPG (MLS Size)");
  push(fp.image || fp.image3, "JPG");
  push(fp.branded || fp.image1, "JPG (Branded)");
  push(fp.pdf, "PDF Floorplan");
  return items;
}

function resolveMediaUrl(file: string, base = ""): string {
  const src = file.trim();
  if (!src) return "";
  if (/^https?:\/\//i.test(src) || src.startsWith("data:") || src.startsWith("blob:")) return src;
  const root = base.trim();
  if (!root) return src;
  return `${root.replace(/\/?$/, "/")}${src.replace(/^\//, "")}`;
}

function parsePrintRow(row: unknown, imageBase = ""): PrintRow | null {
  const r = asRec(row);
  const id = firstStr(r.id, r.print_job_id, r.printjobid);
  if (!id && !r.description && !r.product_details) return null;
  const status = str(r.status);
  const needsApproval =
    r.needs_approval === true ||
    (/proof|pending approval|awaiting approval|needs approval/i.test(status) && !/approved/i.test(status));
  const details = asRec(r.product_details);
  const base = firstStr(r.productimageurl, details.productimageurl, imageBase);
  return {
    id,
    product: firstStr(details.name, r.product_name, r.name, r.product, r.description) || "Print Product",
    qty: formatQty(r.qty ?? r.quantity),
    price: formatMoney(r.total ?? r.price),
    status: status || "—",
    needsApproval,
    proofUrl: firstStr(r.proof_url, r.preview_url),
    image: resolveMediaUrl(
      firstStr(details.productimage, r.productimage, r.template_image, r.image, r.image_url, r.preview_url),
      base,
    ),
  };
}

function parseServiceRow(row: unknown): ServiceRow | null {
  const r = asRec(row);
  const details = asRec(r.service_details);
  const tour = asRec(r.tourdetails);
  const orderServices = asArr(r.orderservice);
  const firstOrderService = asRec(orderServices[0]);
  const firstOrderDetails = asRec(firstOrderService.servicedetails);
  const name = firstStr(
    details.frontendtitle,
    details.name,
    firstOrderDetails.frontendtitle,
    firstOrderDetails.name,
    firstOrderService.service,
    r.name,
    r.description,
    r.service,
    r.invoice,
  );
  if (!name && !r.id) return null;
  const scheduleDate = firstStr(r.schedule_date, r.scheduled_date);
  const scheduleTime = firstStr(r.schedule_time, r.scheduled_time);
  const scheduleCombined = scheduleDate ? `${scheduleDate}${scheduleTime ? ` ${scheduleTime}` : ""}` : "";
  return {
    id: firstStr(r.id, r.orderid) || name || "service",
    name: name || "Upcoming service",
    qty: formatQty(r.qty),
    price: formatMoney(r.total ?? r.price),
    status: str(r.status) || "—",
    start: firstStr(
      r.google_start_date,
      r.customer_preferred_datestarttime,
      r.schedule_datetime,
      scheduleCombined,
      r.duedate,
      tour.schedule_date,
    ),
  };
}

function parseTemplate(row: unknown, imageBase = ""): TemplateItem | null {
  const r = asRec(row);
  const details = asRec(r.product_details);
  const name = firstStr(r.name, r.title, r.product, details.name, r.description);
  if (!name) return null;
  const base = firstStr(r.productimageurl, details.productimageurl, imageBase);
  // API sends absolute productimage on recent_templates, e.g.
  // https://cotala.com/newcotala24/webapi2025dec/assets/Booklet8.jpg
  const image = resolveMediaUrl(
    firstStr(
      r.productimage,
      details.productimage,
      r.product_image,
      details.product_image,
      r.image,
      r.image_url,
      r.preview,
      r.preview_url,
      r.thumbnail,
      r.template_image,
      r.template_image1,
    ),
    base,
  );
  return {
    name,
    image,
    url: firstStr(r.url, r.edit_url, r.link),
  };
}

function parseMarketingProduct(row: unknown, imageBase = ""): PrintMarketingProduct | null {
  const r = asRec(row);
  const details = asRec(r.product_details);
  const name = firstStr(r.name, r.title, r.product, details.name, r.description);
  if (!name) return null;
  const base = firstStr(r.productimageurl, details.productimageurl, imageBase);
  const image = resolveMediaUrl(
    firstStr(r.productimage, details.productimage, r.image, r.image_url, r.thumbnail),
    base,
  );
  return {
    id: firstStr(r.id, details.id, name),
    name,
    image,
    blurb: firstStr(r.description, details.description, r.blurb, r.subtitle),
    match: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 40), "i"),
  };
}

function parseGraph(raw: unknown): Graph | null {
  const g = asRec(raw);
  const labels = asArr(g.labels);
  const data = asArr(g.data).map((v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  });
  if (!labels.length || !data.length) return null;
  return { labels: labels.map(formatGraphLabel), data };
}

function parseStats(raw: unknown): StatsModel | null {
  const s = asRec(raw);
  if (isEmptyValue(s)) return null;
  const best = s.best_day;
  let bestDay = "";
  let bestHits = "";
  if (best && typeof best === "object") {
    const b = asRec(best);
    bestDay = formatShortDate(str(b.date));
    bestHits = str(b.hits);
  } else if (typeof best === "string" || typeof s.bestday === "string") {
    const text = str(best) || str(s.bestday);
    bestDay = text.split("(")[0].trim();
    bestHits = text.match(/\((\d+)/)?.[1] || "";
  }
  const graphs = {} as Record<StatsRange, Graph | null>;
  for (const range of STATS_RANGES) graphs[range.key] = parseGraph(s[range.field]);
  return {
    totalHits: firstStr(s.total_hits, s.totalhits),
    avgHits: firstStr(s.avg_hits_per_day, s.avgtotalhits),
    bestDay,
    bestHits,
    graphs,
  };
}

function resolveProofId(alert: unknown, proofs: unknown[], history: PrintRow[]): string | null {
  if (typeof alert === "string" || typeof alert === "number") {
    const s = str(alert);
    if (/^\d+$/.test(s)) return s;
  }
  const a = asRec(alert);
  const fromAlert = firstStr(a.id, a.proof_id, a.print_job_id, a.printjobid);
  if (fromAlert) return fromAlert;
  const proofRows = proofs.map(asRec);
  const pendingProof = proofRows.find((p) => p.needs_approval === true) || proofRows[0];
  if (pendingProof) {
    const id = firstStr(pendingProof.id, pendingProof.print_job_id, pendingProof.printjobid);
    if (id) return id;
  }
  return history.find((row) => row.needsApproval && row.id)?.id || null;
}

function splitAddress(address: string): { street: string; city: string } {
  const idx = address.lastIndexOf(",");
  if (idx <= 0) return { street: address, city: "" };
  return { street: address.slice(0, idx).trim(), city: address.slice(idx + 1).trim() };
}

function buildModel(screen: Rec, tourId: string): ListingModel {
  const header = asRec(screen.header);
  const media = asRec(screen.media);
  const printMedia = asRec(screen.print_media);
  const virtualServices = asRec(screen.virtual_services);
  const tourid = firstStr(header.tourid, tourId);
  const address = str(header.address) || "Address not available";
  const { street, city } = splitAddress(address);

  const photos = asArr(media.photos)
    .map((p) => {
      const raw = typeof p === "string" ? p.trim() : firstStr(asRec(p).url, asRec(p).image);
      return raw ? toFullListingPhoto(raw, tourid) || raw : "";
    })
    .filter(Boolean);
  const panoramas = asArr(media.panoramas)
    .map((p) => {
      const raw = str(asRec(p).image);
      return { image: raw ? toFullListingPhoto(raw, tourid) || raw : "", name: str(asRec(p).name) };
    })
    .filter((p) => p.image);
  const eflyerRaw = asRec(media.eflyer);
  const inbox = asRec(eflyerRaw.send_to_inbox);
  const eflyer: EflyerModel | null =
    eflyerRaw.available === false || isEmptyValue(eflyerRaw)
      ? null
      : {
          imageUrl: str(eflyerRaw.image_url),
          previewHtml: str(eflyerRaw.preview_html),
          inboxUrl: str(inbox.url),
          inboxLabel: str(inbox.label) || "Send to My Inbox",
        };
  const productImageBase = firstStr(
    printMedia.productimageurl,
    printMedia.product_image_url,
    printMedia.assets_url,
    screen.productimageurl,
  );
  const printHistory = asArr(printMedia.history)
    .map((row) => parsePrintRow(row, productImageBase))
    .filter((r): r is PrintRow => r !== null);
  const proofs = asArr(screen.proofs);
  const proofRows = proofs
    .map((row) => parsePrintRow(row, productImageBase))
    .filter((r): r is PrintRow => r !== null);
  for (const row of proofRows) {
    if (row.id && !printHistory.some((h) => h.id === row.id)) printHistory.push(row);
  }
  const serviceHistoryRaw = [
    ...asArr(virtualServices.history),
    ...asArr(virtualServices.upcoming),
    ...asArr(screen.upcoming_services),
    ...asArr(screen.upcoming_appointments),
    ...asArr(screen.upcoming_service_appointments),
    ...asArr(screen.appointments),
  ];
  const serviceHistorySeen = new Set<string>();
  const serviceHistory = serviceHistoryRaw
    .map(parseServiceRow)
    .filter((r): r is ServiceRow => {
      if (!r) return false;
      const key = `${r.id}|${r.name}|${r.start}`;
      if (serviceHistorySeen.has(key)) return false;
      serviceHistorySeen.add(key);
      return true;
    });
  const recentTemplates = asArr(printMedia.recent_templates)
    .map((row) => parseTemplate(row, productImageBase))
    .filter((t): t is TemplateItem => t !== null);
  const apiMarketing = (
    asArr(printMedia.products).length
      ? asArr(printMedia.products)
      : asArr(printMedia.marketing_products).length
        ? asArr(printMedia.marketing_products)
        : asArr(printMedia.catalog).length
          ? asArr(printMedia.catalog)
          : asArr(printMedia.available_products)
  )
    .map((row) => parseMarketingProduct(row, productImageBase))
    .filter((p): p is PrintMarketingProduct => p !== null);
  const floorplans = parseFloorplans(media.floorplan);
  const matterport = str(media.matterport);
  const video = str(media.video);

  const counts: Record<string, number> = {
    photos: photos.length,
    panoramas: panoramas.length,
    floorplan: floorplans.length ? 1 : 0,
    matterport: matterport ? 1 : 0,
    video: video ? 1 : 0,
    print_media: printHistory.length,
    eflyer: eflyer ? 1 : 0,
  };
  const apiTabs = asArr(screen.tabs)
    .map((t) => {
      const r = asRec(t);
      const rawKey = str(r.key);
      const key = TAB_ALIASES[rawKey] || rawKey;
      const count = Number(r.count);
      return { key, label: str(r.label) || key, count: Number.isFinite(count) ? count : null };
    })
    .filter((t) => t.key && !HIDDEN_TABS.has(t.key));
  const baseTabs = apiTabs.length
    ? apiTabs
    : DEFAULT_TABS.map((t) => ({ ...t, count: null as number | null }));
  if (!baseTabs.some((t) => t.key === "panoramas")) {
    const photosIdx = baseTabs.findIndex((t) => t.key === "photos");
    baseTabs.splice(photosIdx >= 0 ? photosIdx + 1 : 0, 0, { key: "panoramas", label: "Panoramas", count: null });
  }
  const tabs: ScreenTab[] = baseTabs
    .filter((t) => !HIDDEN_TABS.has(t.key))
    .map((t) => ({ ...t, count: t.count ?? counts[t.key] ?? null }));

  const alert = header.proof_alert;
  const alertRec = asRec(alert);
  const ratingInfo = asRec(screen.photographer_rating);
  const photographer = asRec(ratingInfo.photographer);
  const ratingValue = Number(asRec(ratingInfo.rating).rating);
  return {
    tourid,
    address,
    street,
    city,
    mls: str(header.mls),
    status: str(header.status),
    visibility: str(header.visibility),
    cover: (() => {
      const raw = str(header.cover_image);
      return raw ? toFullListingPhoto(raw, tourid) || raw : "";
    })(),
    virtualTour: firstStr(header.virtual_tour, media.virtual_tour) || (tourid ? `https://www.cotala.com/${tourid}#vtour` : ""),
    landingUrl: tourid ? `https://cotala.com/${tourid}` : "",
    photos,
    panoramas,
    floorplans,
    matterport,
    video,
    eflyer,
    printHistory,
    recentTemplates,
    printMarketing: apiMarketing,
    productImageBase,
    serviceHistory,
    stats: parseStats(screen.stats),
    proofId: resolveProofId(alert, proofs, printHistory),
    proofAlertMessage: firstStr(alertRec.message, alertRec.msg, typeof alert === "string" && !/^\d+$/.test(alert) ? alert : ""),
    tabs,
    photographerName: [str(photographer.fname), str(photographer.lname)].filter(Boolean).join(" "),
    photographerRating: Number.isFinite(ratingValue) ? Math.max(0, Math.min(5, Math.round(ratingValue))) : 0,
  };
}

function formatLegacyAddress(unit: string, address: string, city: string): string {
  const parts: string[] = [];
  if (unit) parts.push(/^\d/.test(address) ? `${unit}-${address}` : `${unit} ${address}`);
  else parts.push(address);
  if (city) parts.push(city);
  return parts.filter(Boolean).join(", ");
}

/** Builds a `listings/screen`-shaped record from the older portal / listing-details endpoints. */
async function loadLegacyScreen(tourId: string, userId: string, allowListingDetails: boolean): Promise<Rec | null> {
  let tour: Rec = {};
  let media: Rec = {};
  let printJobs: unknown[] = [];
  let proofs: unknown[] = [];
  let orders: unknown[] = [];
  try {
    const portal = await getPortalListingDetail(tourId);
    if (portal.status && portal.data) {
      const payload = asRec(portal.data);
      tour = asRec(payload.tour);
      media = asRec(payload.media);
      printJobs = asArr(payload.print_jobs);
      proofs = asArr(payload.proofs);
      orders = asArr(payload.orders);
    }
  } catch (err) {
    console.error("Failed to load portal listing detail", err);
  }
  if (isEmptyValue(tour) && allowListingDetails) {
    const legacy = await getListingDetails({ tourid: tourId, user_id: userId });
    if (legacy.status && legacy.tour) tour = legacy.tour as Rec;
  }
  if (isEmptyValue(tour)) {
    return printJobs.length || proofs.length || orders.length
      ? { print_media: { history: printJobs }, proofs, virtual_services: { history: orders } }
      : null;
  }
  const multiple = asArr(tour.multipleimages).map(str).filter(Boolean);
  const mediaPhotos = asArr(media.photos).map(str).filter(Boolean);
  const cover = str(tour.cover_image);
  const photos = multiple.length ? multiple : mediaPhotos.length ? mediaPhotos : cover ? [cover] : [];
  const tourid = firstStr(tour.tourid, tourId);
  return {
    header: {
      tourid,
      address: formatLegacyAddress(str(tour.unit), str(tour.address), str(tour.city)),
      mls: str(tour.mls),
      status: str(tour.status),
      visibility: "",
      cover_image: cover,
      virtual_tour: firstStr(tour.virtual_tour, media.virtual_tour) || `https://www.cotala.com/${tourid}#vtour`,
    },
    media: {
      photos,
      floorplan: tour.floorplanarray || media.floorplan || null,
      video: firstStr(tour.video, tour.videodownload, tour.YouTube, media.video),
      virtual_tour: firstStr(tour.virtual_tour, media.virtual_tour),
    },
    print_media: { history: printJobs },
    proofs,
    virtual_services: { history: orders },
  };
}

function videoEmbed(url: string): { kind: "iframe" | "video" | "link"; src: string } {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i);
  if (yt) return { kind: "iframe", src: `https://www.youtube.com/embed/${yt[1]}` };
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (vimeo) return { kind: "iframe", src: `https://player.vimeo.com/video/${vimeo[1]}` };
  if (/\.(mp4|mov|webm|m4v)(\?|$)/i.test(url)) return { kind: "video", src: url };
  return { kind: "link", src: url };
}

function matterportEmbed(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return `https://my.matterport.com/show/?m=${encodeURIComponent(value)}`;
}

/** Banner mock: "October 1, 1:00pm" */
function formatUpcoming(s: string): string {
  const d = parseDate(s);
  if (!d) return s;
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const hour24 = d.getHours();
  const hour = hour24 % 12 || 12;
  const mins = String(d.getMinutes()).padStart(2, "0");
  const ampm = hour24 >= 12 ? "pm" : "am";
  return `${months[d.getMonth()]} ${d.getDate()}, ${hour}:${mins}${ampm}`;
}

function sameTourId(a: unknown, b: string): boolean {
  const sa = str(a);
  if (!sa || !b) return false;
  if (sa === b) return true;
  const na = Number(sa);
  const nb = Number(b);
  return Number.isFinite(na) && Number.isFinite(nb) && na === nb;
}

/** Match user/home appointment to this listing (same data source as right sidebar). */
function appointmentMatchesTour(a: Rec, tourId: string, listingStreet = ""): boolean {
  const tid = tourId.trim();
  if (!tid) return false;
  const tour = asRec(a.tourdetails);
  if (sameTourId(tour.tourid, tid) || sameTourId(a.tourid, tid) || sameTourId(a.tour_id, tid)) return true;
  for (const os of [...asArr(a.orderservice), ...asArr(a.services)]) {
    if (sameTourId(asRec(os).tourid, tid) || sameTourId(asRec(os).tour_id, tid)) return true;
  }
  // Fallback: some rows omit tourid — match street address
  const street = listingStreet.trim().toLowerCase();
  const addr = firstStr(tour.address).toLowerCase();
  if (street && addr && (addr.includes(street) || street.includes(addr))) return true;
  return false;
}

/** Normalize "13:00:00" / "1:00 pm" → "1:00pm" */
function formatScheduleTime(raw: string): string {
  const t = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!t) return "";
  if (/(am|pm)$/i.test(t)) return t.replace(/(am|pm)/i, (m) => m.toLowerCase());
  const m = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return raw.trim();
  const hour24 = Number(m[1]);
  const mins = m[2];
  const hour = hour24 % 12 || 12;
  const ampm = hour24 >= 12 ? "pm" : "am";
  return `${hour}:${mins}${ampm}`;
}

/** Build banner label from user/home schedule fields: "October 1, 1:00pm" */
function formatUserHomeSchedule(scheduleDate: string, scheduleTime: string): string {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const d = parseDate(scheduleDate);
  const datePart = d ? `${months[d.getMonth()]} ${d.getDate()}` : scheduleDate.trim();
  const timePart = formatScheduleTime(scheduleTime);
  if (datePart && timePart) return `${datePart}, ${timePart}`;
  return datePart || timePart;
}

/**
 * Flatten home/dashboard upcoming into banner rows for this tour
 * (one row per service — same source as Home upcoming cards).
 */
function expandTourAppointments(rawList: unknown[], tourId: string, listingStreet = ""): ServiceRow[] {
  const out: ServiceRow[] = [];
  const seen = new Set<string>();

  for (const raw of rawList) {
    const a = asRec(raw);
    if (!appointmentMatchesTour(a, tourId, listingStreet)) continue;

    const status = str(a.status);
    if (/^cancel/i.test(status)) continue;

    const scheduleDate = firstStr(a.schedule_date, a.scheduled_date);
    const scheduleTime = firstStr(a.schedule_time, a.scheduled_time);
    const startLabel =
      formatUserHomeSchedule(scheduleDate, scheduleTime) ||
      firstStr(a.schedule_datetime, a.google_start_date, a.customer_preferred_datestarttime);
    const orderId = firstStr(a.id, a.orderid) || "appt";
    const services = asArr(a.services).length ? asArr(a.services) : asArr(a.orderservice);

    if (services.length) {
      for (const svc of services) {
        const s = asRec(svc);
        if (/^cancel/i.test(str(s.status))) continue;
        const details = asRec(s.service_details);
        const details2 = asRec(s.servicedetails);
        const name = firstStr(
          details.frontendtitle,
          details.name,
          details2.frontendtitle,
          details2.name,
          s.description,
          s.service,
          s.name,
        );
        if (!name) continue;
        const key = `${orderId}|${name}|${startLabel}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          id: firstStr(s.id) ? `${orderId}-${str(s.id)}` : `${orderId}-${name}`,
          name,
          qty: "—",
          price: "—",
          status: str(s.status) || status || "Scheduled",
          start: startLabel,
        });
      }
    } else {
      const name = firstStr(a.summary, a.description, a.name, "Upcoming service");
      const key = `${orderId}|${name}|${startLabel}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: orderId,
        name,
        qty: "—",
        price: "—",
        status: status || "Scheduled",
        start: startLabel,
      });
    }
  }

  return out;
}

/** Matches listing-details empty mock: "Sept 30, 2026 at 1:00pm" */
function formatMediaWhen(s: string): string {
  const d = parseDate(s);
  if (!d) return s;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];
  const hour24 = d.getHours();
  const hour = hour24 % 12 || 12;
  const mins = String(d.getMinutes()).padStart(2, "0");
  const ampm = hour24 >= 12 ? "pm" : "am";
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} at ${hour}:${mins}${ampm}`;
}

function isVideoServiceName(name: string): boolean {
  return /video|videograph|cinematic|film|reel|youtube/i.test(name);
}

function isPhotoMediaServiceName(name: string): boolean {
  if (isVideoServiceName(name)) return false;
  return /photo|hdr|photography|media|shoot|floor.?plan|matterport|drone|twilight|blue.?sky|staging|listing/i.test(name);
}

function StatsChart({ graph }: { graph: Graph | null }) {
  if (!graph) {
    return (
      <div className="data-empty h-full">
        <p>Gathering data. Check back soon!</p>
      </div>
    );
  }
  const max = Math.max(1, ...graph.data);
  const labelEvery = graph.labels.length > 14 ? Math.ceil(graph.labels.length / 10) : 1;
  return (
    <>
      <div className="ld-bars">
        {graph.data.map((value, i) => (
          <div className="ld-bar-col" key={`${graph.labels[i]}-${i}`} title={`${graph.labels[i] ?? ""}: ${value} hits`}>
            {value > 0 && <span className="ld-bar-value">{value}</span>}
            <div className="ld-bar" style={{ height: `${(value / max) * 85}%` }} />
          </div>
        ))}
      </div>
      <div className="ld-bar-labels">
        {graph.data.map((_, i) => (
          <span key={i}>{i % labelEvery === 0 ? graph.labels[i] ?? "" : ""}</span>
        ))}
      </div>
    </>
  );
}

const PdfIcon = () => (
  <svg width="25" height="25" viewBox="0 0 512 512" aria-hidden="true">
    <path fill="#E5252A" d="M448.968 168.463v280.281c0 26.099-21.157 47.256-47.256 47.256H110.289c-26.099 0-47.256-21.157-47.256-47.256V63.256C63.032 37.157 84.189 16 110.289 16h195.188z" />
    <path fill="#ED676A" d="M448.968 168.463H336.981c-17.399 0-31.504-14.105-31.504-31.504V16z" />
    <text x="256" y="390" textAnchor="middle" fontSize="120" fontWeight="700" fill="#fff" fontFamily="Arial, sans-serif">PDF</text>
  </svg>
);

type TemplateKind = "feature" | "trifold" | "postcard" | "doorknocker";
const PRINT_PRODUCTS: Array<{ kind: TemplateKind; title: string; image: string; blurb: string; match: RegExp }> = [
  { kind: "feature", title: "Oversized Feature Sheet", image: printFeatureSheetImg, blurb: "11\" x 17\" feature sheet built from your listing photos.", match: /feature\s*sheet|oversize/i },
  { kind: "trifold", title: "Oversized Trifold Brochure", image: printTrifoldImg, blurb: "Folded brochure for open houses and showings.", match: /tri\s*-?fold|brochure/i },
  { kind: "postcard", title: "Just Listed / Just Sold Postcards", image: printPostcardImg, blurb: "8.5\" x 5.5\" postcards for neighbourhood mailers.", match: /post\s*card|just\s*(listed|sold)/i },
  { kind: "doorknocker", title: "Door Knockers", image: printDoorKnockerImg, blurb: "Door hangers to promote the listing around the block.", match: /door/i },
];

const VIRTUAL_PRODUCTS: Array<{ title: string; image: string; match: RegExp }> = [
  { title: "Day to Night Conversion", image: dayNightImg, match: /day\s*to\s*night|twilight|dusk/i },
  { title: "Blue Sky Replacement", image: blueSkyImg, match: /sky/i },
  { title: "Virtual Staging", image: virtualStagingImg, match: /staging/i },
];

export default function ListingDetails() {
  const [, setLocation] = useLocation();
  const [screen, setScreen] = useState<Rec | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("photos");
  const [tabLoading, setTabLoading] = useState<string | null>(null);
  const [statsTab, setStatsTab] = useState<StatsRange>("weekly");
  const [fallbackStats, setFallbackStats] = useState<StatsModel | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [sendCopy, setSendCopy] = useState(false);
  const [emailNote, setEmailNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [ratingHover, setRatingHover] = useState(0);
  const [ratingSaving, setRatingSaving] = useState(false);
  const [ratingNote, setRatingNote] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [startingSheet, setStartingSheet] = useState(false);
  const [printModal, setPrintModal] = useState<{ id: string; proofUrl?: string } | null>(null);
  const [hiddenPhotos, setHiddenPhotos] = useState<Set<string>>(() => new Set());
  const [lightboxPhoto, setLightboxPhoto] = useState<{ url: string; alt: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [bannerUpcoming, setBannerUpcoming] = useState<ServiceRow[]>([]);
  const fetchedTabs = useRef(new Set<string>());
  const statsFallbackTried = useRef(false);

  const urlParams = new URLSearchParams(window.location.search);
  const tourId = urlParams.get("id")?.trim() || "";
  const tabParam = urlParams.get("tab");
  const user_id = getUserIdFromStorage() || localStorage.getItem("cotala_user_id");

  useEffect(() => {
    if (!tourId) return;
    try {
      const saved = JSON.parse(localStorage.getItem(`cotala_hidden_listing_photos_${tourId}`) || "[]");
      setHiddenPhotos(new Set(Array.isArray(saved) ? saved.filter((item): item is string => typeof item === "string") : []));
    } catch {
      setHiddenPhotos(new Set());
    }
  }, [tourId]);

  useEffect(() => {
    if (!lightboxPhoto) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxPhoto(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = "";
    };
  }, [lightboxPhoto]);

  useEffect(() => {
    if (!tabParam) return;
    const normalized = TAB_ALIASES[tabParam] || tabParam;
    if (SCREEN_TAB_KEYS.has(normalized) || normalized === LANDING_TAB) setActiveTab(normalized);
  }, [tabParam]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!tourId) {
        setError("Listing ID is required");
        setLoading(false);
        return;
      }
      if (!user_id) {
        setError("User not logged in");
        setLoading(false);
        return;
      }
      setLoading(reloadKey === 0);
      setError(null);
      fetchedTabs.current = new Set();
      try {
        let primary: Rec | null = null;
        try {
          const res = await getListingScreen(tourId, "overview");
          if (res.status && res.data && !isEmptyValue(asRec(asRec(res.data).header))) primary = asRec(res.data);
        } catch (err) {
          console.error("Failed to load listing screen", err);
        }

        if (primary) {
          if (cancelled) return;
          setScreen(primary);
          setLoading(false);
          return;
        }

        const legacy = await loadLegacyScreen(tourId, user_id, true);
        if (cancelled) return;
        if (legacy && !isEmptyValue(asRec(legacy.header))) {
          setScreen(legacy);
        } else {
          setError("Failed to load listing details");
        }
      } catch (err) {
        console.error("Failed to load listing details", err);
        if (!cancelled) setError("Failed to load listing details. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [tourId, user_id, reloadKey]);

  const model = useMemo(() => (screen ? buildModel(screen, tourId) : null), [screen, tourId]);
  const stats = model?.stats || fallbackStats;
  const listingStreet = model?.street || "";

  useEffect(() => {
    if (!tourId || !user_id) {
      setBannerUpcoming([]);
      return;
    }
    let cancelled = false;
    const loadUpcoming = async () => {
      try {
        // Same source as Home "Upcoming Service Appointments"
        let list: unknown[] = [];
        try {
          const dash = await getDashboardScreen();
          if (dash?.status && dash.data) {
            list = asArr(asRec(dash.data).upcoming_service_appointments);
          }
        } catch (err) {
          console.error("dashboard/screen upcoming failed, trying user/home", err);
        }
        if (!list.length) {
          const home = await getUserHome({
            user_id,
            device_id: "web",
            device_token: "web-token",
            device_type: "web",
          });
          if (home.status) list = asArr(home.upcomingservice);
        }
        if (cancelled) return;
        setBannerUpcoming(expandTourAppointments(list, tourId, listingStreet));
      } catch (err) {
        console.error("Failed to load upcoming appointments for listing", err);
        if (!cancelled) setBannerUpcoming([]);
      }
    };
    void loadUpcoming();
    return () => {
      cancelled = true;
    };
  }, [tourId, user_id, reloadKey, listingStreet]);

  const tabHasData = useCallback((key: string, m: ListingModel) => {
    switch (key) {
      case "photos":
        return m.photos.length > 0;
      case "panoramas":
        return m.panoramas.length > 0;
      case "floorplan":
        return m.floorplans.length > 0;
      case "matterport":
        return !!m.matterport;
      case "video":
        return !!m.video;
      case "print_media":
        return m.printHistory.length > 0;
      case "eflyer":
        return !!m.eflyer;
      default:
        return true;
    }
  }, []);

  useEffect(() => {
    if (!tourId || !model || !SCREEN_TAB_KEYS.has(activeTab)) return;
    if (fetchedTabs.current.has(activeTab) || tabHasData(activeTab, model)) return;
    if (model.tabs.find((t) => t.key === activeTab)?.count === 0) return;
    fetchedTabs.current.add(activeTab);
    const key = activeTab;
    setTabLoading(key);
    getListingScreen(tourId, key)
      .then((res) => {
        if (res.status && res.data) setScreen((prev) => (prev ? mergeScreen(prev, asRec(res.data)) : prev));
      })
      .catch((err) => console.error(`Failed to load listing tab ${key}`, err))
      .finally(() => setTabLoading((current) => (current === key ? null : current)));
  }, [activeTab, model, tourId, tabHasData]);

  useEffect(() => {
    if (!model || model.stats || statsFallbackTried.current || !tourId || !user_id) return;
    statsFallbackTried.current = true;
    const load = async () => {
      setStatsLoading(true);
      try {
        try {
          const portal = await getPortalListingStats(tourId);
          const parsed = portal.status ? parseStats(portal.data) : null;
          if (parsed) {
            setFallbackStats(parsed);
            return;
          }
        } catch (err) {
          console.error("Failed to load portal listing stats", err);
        }
        const legacy = await getTourStats({ tourid: tourId, user_id });
        if (legacy.status) setFallbackStats(parseStats(legacy));
      } catch (err) {
        console.error("Failed to load statistics", err);
      } finally {
        setStatsLoading(false);
      }
    };
    void load();
  }, [model, tourId, user_id]);

  const handleFeatureListingClick = async () => {
    if (!tourId) return;
    if (startingSheet) return;
    setStartingSheet(true);
    try {
      const href = await startFeatureSheetForListing({
        tourid: tourId,
        mls: model?.mls || undefined,
        address: model?.street || undefined,
        city: model?.city || undefined,
      });
      setLocation(href);
    } catch (err) {
      console.error("Failed to start feature sheet", err);
      setLocation(`/feature-sheet-builder?id=${encodeURIComponent(tourId)}`);
    } finally {
      setStartingSheet(false);
    }
  };

  const openTemplate = (kind: TemplateKind) => {
    const id = encodeURIComponent(tourId);
    switch (kind) {
      case "feature":
        void handleFeatureListingClick();
        return;
      case "trifold":
        setLocation(`/ai-tool?id=${id}#brochure`);
        return;
      case "postcard":
        setLocation(`/design-job/postcard?id=${id}&from=listing-details`);
        return;
      case "doorknocker":
        window.location.assign(`${DESIGN_EDITOR}/create-print-card?size=141&tourid=${id}`);
        return;
    }
  };

  const openRecentTemplate = (template: TemplateItem) => {
    if (template.url) {
      window.open(template.url, "_blank", "noopener,noreferrer");
      return;
    }
    const match = PRINT_PRODUCTS.find((p) => p.match.test(template.name));
    if (match) openTemplate(match.kind);
    else setLocation("/design-job");
  };

  const appointmentHref = `/new-appointment${tourId ? `?tourid=${encodeURIComponent(tourId)}` : ""}`;
  const openTourManager = () => {
    setActiveTab("photos");
    if (tourId) window.open(`https://www.cotala.com/${tourId}`, "_blank", "noopener,noreferrer");
  };

  const downloadZip = async (urls: Array<{ url: string; name: string }>, zipName: string, failMessage: string) => {
    try {
      const zip = new JSZip();
      await Promise.all(
        urls.map(async ({ url, name }) => {
          try {
            const response = await fetch(url);
            zip.file(name, await response.blob());
          } catch (err) {
            console.error(`Failed to fetch ${url}`, err);
          }
        }),
      );
      saveAs(await zip.generateAsync({ type: "blob" }), zipName);
    } catch (err) {
      console.error("Failed to create ZIP file:", err);
      alert(failMessage);
    }
  };

  const handleDownloadAllPhotos = () => {
    if (!model?.photos.length) return;
    void downloadZip(
      model.photos.map((url, i) => ({ url, name: `photo_${String(i + 1).padStart(3, "0")}.jpg` })),
      `listing_${tourId}_photos.zip`,
      "Failed to download photos. Please try again.",
    );
  };

  const handleDownloadFloorplans = () => {
    if (!model?.floorplans.length) return;
    const jpegs = model.floorplans.filter((f) => f.type === "jpeg");
    if (jpegs.length) {
      void downloadZip(
        jpegs.map((f) => ({ url: f.url, name: `floorplan_${f.label.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.jpg` })),
        `listing_${tourId}_floorplans.zip`,
        "Failed to download floorplans. Please try again.",
      );
    } else {
      window.open(model.floorplans[0].url, "_blank", "noopener,noreferrer");
    }
  };

  const togglePhotoVisibility = (photo: string) => {
    setHiddenPhotos((current) => {
      const next = new Set(current);
      if (next.has(photo)) next.delete(photo);
      else next.add(photo);
      try {
        localStorage.setItem(`cotala_hidden_listing_photos_${tourId}`, JSON.stringify(Array.from(next)));
      } catch {
        /* Storage can be unavailable in private browsing. */
      }
      return next;
    });
  };

  const downloadFloorplanImage = async (fp: FloorplanItem) => {
    const safeLabel = fp.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "floorplan";
    const extension = fp.url.match(/\.(png|jpe?g|webp)(?:\?|$)/i)?.[1]?.replace("jpeg", "jpg") || "jpg";
    const filename = `listing_${tourId}_${safeLabel}.${extension}`;
    try {
      const response = await fetch(fp.url);
      if (!response.ok) throw new Error(`Download failed with status ${response.status}`);
      saveAs(await response.blob(), filename);
    } catch (err) {
      console.error("Failed to download floorplan image", err);
      const fallback = document.createElement("a");
      fallback.href = fp.url;
      fallback.download = filename;
      fallback.target = "_blank";
      fallback.rel = "noopener noreferrer";
      fallback.click();
    }
  };

  const copyLandingLink = async () => {
    if (!model?.landingUrl) return;
    try {
      await navigator.clipboard.writeText(model.landingUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", model.landingUrl);
    }
  };

  const handleRate = async (value: number) => {
    if (!tourId || ratingSaving) return;
    setRatingSaving(true);
    setRatingNote(null);
    try {
      const res = await submitPhotographerRating({ tourid: Number(tourId) || tourId, rating: value });
      if (!res.status) throw new Error(res.msg || res.message || "Could not submit rating.");
      const data = asRec(res.data);
      setScreen((prev) => (prev ? { ...prev, photographer_rating: { ...asRec(prev.photographer_rating), ...data } } : prev));
      setRatingNote({ kind: "ok", text: "Thanks for your rating!" });
    } catch (err) {
      setRatingNote({ kind: "error", text: err instanceof Error ? err.message : "Could not submit rating." });
    } finally {
      setRatingSaving(false);
    }
  };

  const handleEmailStats = () => {
    const recipients = emailInput
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
    if (!recipients.length) {
      setEmailNote("Enter at least one valid email address.");
      return;
    }
    let selfEmail = "";
    try {
      selfEmail = str(asRec(JSON.parse(localStorage.getItem("cotala_user") || "{}")).email);
    } catch {
      selfEmail = "";
    }
    const lines = [
      `Landing page statistics for ${model?.address || "your listing"}`,
      "",
      `Total hits: ${stats?.totalHits || "-"}`,
      `Avg. hits per day: ${stats?.avgHits || "-"}`,
      `Best day: ${stats?.bestDay ? `${stats.bestDay}${stats.bestHits ? ` (${stats.bestHits} hits)` : ""}` : "-"}`,
      "",
      `View the listing: ${model?.landingUrl || ""}`,
    ];
    const params = new URLSearchParams({
      subject: `Listing stats: ${model?.address || ""}`,
      body: lines.join("\n"),
    });
    if (sendCopy && selfEmail) params.set("cc", selfEmail);
    window.location.href = `mailto:${recipients.join(",")}?${params.toString().replace(/\+/g, "%20")}`;
    setEmailNote("Opening your email app with the stats summary…");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#b388ff] mx-auto mb-4" />
          <p className="text-white/70">Loading listing details...</p>
        </div>
      </div>
    );
  }

  if (error || !model) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Error</h2>
          <p className="text-white/70 mb-6">{error || "Listing not found"}</p>
          <button
            type="button"
            onClick={() => setLocation("/listings")}
            className="bg-[#b388ff] hover:bg-[#b388ff]/80 text-white px-5 py-2 rounded-md"
          >
            Back to Listings
          </button>
        </div>
      </div>
    );
  }

  const hasPhotos = model.photos.length > 0;
  const isInactive = !hasPhotos && !model.mls;
  // Real listing media only — do not treat empty/placeholder cover as a banner
  const listingHeroImage = (hasPhotos ? model.photos[0] || model.cover : model.cover) || "";
  const hasListingHero = Boolean(listingHeroImage) && hasPhotos;
  // No listing photos → banner-09 (same asset as /new-appointment)
  const heroImage = hasListingHero ? listingHeroImage : emptyBannerBg;
  const badgeLabel = isInactive ? "Not Active" : capitalize(model.visibility || model.status || "Public");
  const pendingRow = model.proofId ? model.printHistory.find((r) => r.id === model.proofId) : undefined;
  // Banner card uses ONLY user/home (same as sidebar) — never mix in virtual_services history
  const upcoming = bannerUpcoming;
  const manageApptHref = upcoming[0]?.id
    ? `/order-details?id=${encodeURIComponent(String(upcoming[0].id).split("-")[0])}`
    : "/orders";

  const photoAppointment =
    upcoming.find((s) => isPhotoMediaServiceName(s.name) && s.start) ||
    upcoming.find((s) => !isVideoServiceName(s.name) && s.start) ||
    null;
  const videoAppointment =
    upcoming.find((s) => isVideoServiceName(s.name) && s.start) ||
    model.serviceHistory.find(
      (s) =>
        isVideoServiceName(s.name) &&
        s.start &&
        /process|edit|pending|progress|production|scheduled/i.test(s.status),
    ) ||
    null;

  const mediaEmptyCta = (label: string, href: string) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="btn-media-empty">
      {label}
    </a>
  );

  const emptyPhotos = () => {
    if (photoAppointment?.start) {
      return (
        <div className="media-empty-block">
          <p className="media-empty-msg">
            Photos scheduled for <span className="when">{formatMediaWhen(photoAppointment.start)}</span>.
          </p>
          {mediaEmptyCta("MANAGE APPOINTMENT", photoAppointment.id ? `/order-details?id=${encodeURIComponent(photoAppointment.id)}` : "/orders")}
        </div>
      );
    }
    return (
      <div className="media-empty-block">
        <p className="media-empty-msg">No photos to show.</p>
        {mediaEmptyCta("SCHEDULE MEDIA SHOOT", appointmentHref)}
      </div>
    );
  };

  const emptyVideo = () => {
    if (videoAppointment?.start) {
      return (
        <div className="media-empty-block">
          <p className="media-empty-msg">
            Video processing. Check back on <span className="when">{formatMediaWhen(videoAppointment.start)}</span>.
          </p>
        </div>
      );
    }
    return (
      <div className="media-empty-block">
        <p className="media-empty-msg">No Video to show.</p>
        {mediaEmptyCta("SCHEDULE MEDIA SHOOT", appointmentHref)}
      </div>
    );
  };

  const emptyMedia = (label: string) => (
    <div className="media-empty-block">
      <p className="media-empty-msg">No {label} to show.</p>
      {mediaEmptyCta(
        label.toLowerCase().includes("floor") ? "SCHEDULE FLOOR PLAN" : "SCHEDULE MEDIA SHOOT",
        appointmentHref,
      )}
    </div>
  );

  const lockedSection = (
    <div className="data-empty">
      <p className="empty-text">Upload photos first to unlock print media and marketing services.</p>
    </div>
  );

  const tabSpinner = (
    <div className="flex items-center justify-center py-12 text-white/70 gap-2">
      <Loader2 className="w-5 h-5 animate-spin" /> Loading…
    </div>
  );

  const rateBlock = (title: string) => {
    if (!model.photographerName) return null;
    const shown = ratingHover || model.photographerRating;
    const initials = model.photographerName
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
    return (
      <div>
        <div className="rate-label">RATE YOUR SERVICE</div>
        <div className="rating-card">
          <div className="rating-avatar">{initials}</div>
          <div className="flex-grow">
            <div className="rating-title">{title}</div>
            <div className="rating-subtitle">
              with <span className="text-2">{model.photographerName}</span>
            </div>
          </div>
          <div className="stars" onMouseLeave={() => setRatingHover(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                disabled={ratingSaving}
                aria-label={`Rate ${n} star${n > 1 ? "s" : ""}`}
                onMouseEnter={() => setRatingHover(n)}
                onClick={() => void handleRate(n)}
              >
                <Star fill={n <= shown ? "currentColor" : "none"} />
              </button>
            ))}
          </div>
        </div>
        {ratingNote && (
          <p className={`rating-note ${ratingNote.kind === "ok" ? "text-green-400" : "text-red-400"}`}>{ratingNote.text}</p>
        )}
      </div>
    );
  };

  const renderPhotos = () => {
    if (!hasPhotos) return tabLoading === "photos" ? tabSpinner : emptyPhotos();
    return (
      <>
        <div className="floorplan-section mb-4">
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn-floorplan" onClick={handleDownloadAllPhotos}>
              <Download className="w-4 h-4" /> Download All Photos
            </button>
          </div>
          {rateBlock("Photography")}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {model.photos.map((photo, index) => {
            const isHidden = hiddenPhotos.has(photo);
            return (
            <div key={`${photo}-${index}`} className="text-center">
              <div className={`floorplan-wrapper is-photo ${isHidden ? "is-hidden-photo" : ""}`}>
                <button
                  type="button"
                  className="floorplan-download-btn"
                  onClick={() => togglePhotoVisibility(photo)}
                  aria-label={`${isHidden ? "Show" : "Hide"} photo ${index + 1} on listing page`}
                  aria-pressed={isHidden}
                  title={isHidden ? "Show image on listing page" : "Hide image on listing page"}
                >
                  {isHidden ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
                <button
                  type="button"
                  className="photo-lightbox-trigger"
                  onClick={() => setLightboxPhoto({ url: photo, alt: `Photo ${index + 1}` })}
                  aria-label={`Open photo ${index + 1} full size`}
                >
                  <img src={photo} alt={`Photo ${index + 1}`} loading="lazy" />
                </button>
                {isHidden && <span className="hidden-photo-label">Hidden on this listing</span>}
              </div>
              <p className="media-caption">{index + 1}</p>
            </div>
            );
          })}
        </div>
      </>
    );
  };

  const renderPanoramas = () => {
    if (!model.panoramas.length) {
      return tabLoading === "panoramas" ? tabSpinner : emptyMedia("Panoramas");
    }
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {model.panoramas.map((pano) => (
          <div key={pano.image} className="text-center">
            <div className="floorplan-wrapper is-photo">
              <button
                type="button"
                className="photo-lightbox-trigger"
                onClick={() => setLightboxPhoto({ url: pano.image, alt: pano.name || "Panorama" })}
                aria-label={`Open ${pano.name || "panorama"} full size`}
              >
                <img src={pano.image} alt={pano.name || "Panorama"} loading="lazy" />
              </button>
            </div>
            <p className="media-caption">{pano.name}</p>
          </div>
        ))}
      </div>
    );
  };

  const floorplanTile = (fp: FloorplanItem) =>
    fp.type === "pdf" ? (
      <div className="floorplan-wrapper flex flex-col items-center justify-center min-h-[240px] !leading-normal">
        <FileText className="w-12 h-12 text-white/70 mb-3" />
        <a href={fp.url} target="_blank" rel="noopener noreferrer" className="btn-floorplan">
          <Download className="w-4 h-4" /> Download PDF
        </a>
      </div>
    ) : (
      <div className="floorplan-wrapper">
        <button
          type="button"
          className="floorplan-download-btn"
          onClick={() => void downloadFloorplanImage(fp)}
          aria-label={`Download ${fp.label}`}
          title="Download Floorplan"
        >
          <Download className="w-5 h-5" />
        </button>
        <button
          type="button"
          className="floorplan-image-download photo-lightbox-trigger"
          onClick={() => setLightboxPhoto({ url: fp.url, alt: fp.label })}
          aria-label={`Zoom ${fp.label}`}
          title="Zoom floorplan"
        >
          <img src={fp.url} alt={fp.label} loading="lazy" />
        </button>
      </div>
    );

  const renderFloorplan = () => {
    if (!model.floorplans.length) return tabLoading === "floorplan" ? tabSpinner : emptyMedia("Floorplan");
    const [first, ...rest] = model.floorplans;
    return (
      <>
        <div className="floorplan-section mb-4">
          <button type="button" className="btn-floorplan" onClick={handleDownloadFloorplans}>
            <Download className="w-4 h-4" /> Download Floorplan
          </button>
          {rateBlock("Floorplan")}
        </div>
        <div className="text-center mb-6">
          {floorplanTile(first)}
          <p className="media-caption">{first.label}</p>
        </div>
        {rest.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {rest.map((fp) => (
              <div key={fp.url} className="text-center">
                {floorplanTile(fp)}
                <p className="media-caption">{fp.label}</p>
              </div>
            ))}
          </div>
        )}
      </>
    );
  };

  const shareRow = (
    <div className="landing-link-row mt-4 justify-center">
      <a href={model.landingUrl} className="landing-url" target="_blank" rel="noopener noreferrer">
        Share Link: {model.landingUrl}
      </a>
      <button type="button" className="landing-action-btn" onClick={copyLandingLink}>
        {copied ? "COPIED" : "COPY LINK"}
      </button>
    </div>
  );

  const renderVideo = () => {
    if (!model.video) return tabLoading === "video" ? tabSpinner : emptyVideo();
    const embed = videoEmbed(model.video);
    return (
      <>
        <div className="floorplan-section mb-4">
          <a
            className="btn-floorplan"
            href={model.video}
            target="_blank"
            rel="noopener noreferrer"
            {...(embed.kind === "video" ? { download: true } : {})}
          >
            <Download className="w-4 h-4" /> {embed.kind === "video" ? "Download Video" : "Open Video"}
          </a>
          {rateBlock("Video")}
        </div>
        {embed.kind !== "link" && (
          <div className="ld-embed">
            {embed.kind === "iframe" ? (
              <iframe src={embed.src} title="Listing video" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
            ) : (
              <video src={embed.src} controls preload="metadata" />
            )}
          </div>
        )}
        {shareRow}
      </>
    );
  };

  const renderMatterport = () => {
    if (!model.matterport) return tabLoading === "matterport" ? tabSpinner : emptyMedia("Matterport");
    const src = matterportEmbed(model.matterport);
    return (
      <>
        <div className="floorplan-section mb-4">
          <a className="btn-floorplan" href={src} target="_blank" rel="noopener noreferrer">
            Open Matterport
          </a>
        </div>
        <div className="ld-embed">
          <iframe src={src} title="Matterport tour" allow="xr-spatial-tracking; fullscreen" allowFullScreen />
        </div>
      </>
    );
  };

  const renderPrintMedia = () => {
    if (tabLoading === "print_media" && !model.printHistory.length) return tabSpinner;
    if (!hasPhotos && !model.printHistory.length) return lockedSection;
    return (
      <>
        <h6 className="section-heading mb-3">LISTING PRINT ORDER HISTORY</h6>
        {model.printHistory.length ? (
          <div className="custom-table overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Products</th>
                  <th>Quantity</th>
                  <th>Price</th>
                  <th>Status</th>
                  <th>Proof</th>
                </tr>
              </thead>
              <tbody>
                {model.printHistory.map((row, i) => (
                  <tr key={`${row.id}-${i}`} className={row.needsApproval ? "highlight-row" : ""}>
                    <td>{row.product}</td>
                    <td>{row.qty || "—"}</td>
                    <td>{row.price}</td>
                    <td className={row.needsApproval ? "text-red-400" : "text-white"}>
                      {row.needsApproval && !/pending/i.test(row.status) ? "Pending Approval" : row.status}
                    </td>
                    <td>
                      {row.needsApproval && row.id ? (
                        <div className="flex flex-wrap gap-2 items-center">
                          <Link href={`/proof-review?id=${encodeURIComponent(row.id)}`}>
                            <span className="btn-review">Review</span>
                          </Link>
                          <button
                            type="button"
                            className="btn-review"
                            onClick={() => setPrintModal({ id: row.id, proofUrl: row.proofUrl || undefined })}
                          >
                            Send to print
                          </button>
                        </div>
                      ) : row.proofUrl ? (
                        <a href={row.proofUrl} target="_blank" rel="noopener noreferrer" title="View proof PDF">
                          <PdfIcon />
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-white/60 text-sm">No print orders for this listing yet.</p>
        )}
      </>
    );
  };

  const renderVirtualServices = () => {
    if (tabLoading === "virtual_services" && !model.serviceHistory.length) return tabSpinner;
    if (!hasPhotos && !model.serviceHistory.length) return lockedSection;
    return (
      <>
        <h6 className="section-heading mb-3">VIRTUAL SERVICES ORDER HISTORY</h6>
        {model.serviceHistory.length ? (
          <div className="custom-table overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Products</th>
                  <th>Quantity</th>
                  <th>Price</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {model.serviceHistory.map((row, i) => {
                  const active = !/complete|cancel/i.test(row.status);
                  return (
                    <tr key={`${row.id}-${i}`} className={active ? "highlight-row" : ""}>
                      <td>{row.name}</td>
                      <td>{row.qty}</td>
                      <td>{row.price}</td>
                      <td className="text-white">{row.status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-white/60 text-sm">No virtual services ordered for this listing yet.</p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          {VIRTUAL_PRODUCTS.map((product) => {
            const ordered = model.serviceHistory.some((row) => product.match.test(row.name));
            return (
              <div
                key={product.title}
                className="template-card"
                role="button"
                tabIndex={0}
                onClick={() => setLocation(appointmentHref)}
                onKeyDown={(e) => e.key === "Enter" && setLocation(appointmentHref)}
              >
                <img src={product.image} alt={product.title} />
                <p>{product.title}</p>
                {ordered && (
                  <span className="status-pill on-image inline-flex items-center gap-1">
                    <Check className="w-3 h-3" /> ORDERED
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </>
    );
  };

  const renderEflyer = () => {
    if (!model.eflyer) {
      if (tabLoading === "eflyer") return tabSpinner;
      return hasPhotos ? (
        <div className="data-empty">
          <p className="empty-text">No E-Flyer available for this listing yet.</p>
        </div>
      ) : (
        lockedSection
      );
    }
    const { eflyer } = model;
    return (
      <>
        <div className="floorplan-section mb-4">
          <div className="flex flex-wrap gap-3">
            {eflyer.inboxUrl && (
              <a className="btn-floorplan" href={eflyer.inboxUrl} target="_blank" rel="noopener noreferrer">
                <Send className="w-4 h-4" /> {eflyer.inboxLabel}
              </a>
            )}
            {model.landingUrl && (
              <a className="btn-floorplan" href={model.landingUrl} target="_blank" rel="noopener noreferrer">
                View page
              </a>
            )}
          </div>
        </div>
        {eflyer.previewHtml ? (
          <iframe
            title="E-Flyer preview"
            srcDoc={eflyer.previewHtml}
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            className="w-full max-w-[680px] mx-auto block bg-[#f3f3f3] rounded-lg"
            style={{ height: 900, border: 0 }}
          />
        ) : eflyer.imageUrl ? (
          <img src={eflyer.imageUrl} alt="E-Flyer" className="w-full max-w-[680px] mx-auto block rounded-lg" />
        ) : null}
      </>
    );
  };

  const renderLanding = () => {
    const graph = stats?.graphs[statsTab] ?? null;
    return (
      <section className="text-white">
        <div className="pb-10">
          <h2 className="landing-link-title">Landing Page Link</h2>
          <div className="landing-link-row">
            <a href={model.landingUrl} className="landing-url" target="_blank" rel="noopener noreferrer">
              {model.landingUrl}
            </a>
            <button type="button" className="landing-action-btn" onClick={copyLandingLink}>
              {copied ? "COPIED" : "COPY LINK"}
            </button>
            <a href={model.landingUrl} className="landing-action-btn" target="_blank" rel="noopener noreferrer">
              VIEW PAGE
            </a>
            {model.virtualTour && (
              <a href={model.virtualTour} className="landing-action-btn" target="_blank" rel="noopener noreferrer">
                VIRTUAL TOUR
              </a>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <h5 className="text-white uppercase font-semibold">Landing Page Statistics</h5>
            <ul className="ld-tabs bg-grey border-radius-50" role="tablist">
              {STATS_RANGES.map((range) => (
                <li key={range.key} className="flex-1 flex">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={statsTab === range.key}
                    className={`nav-link w-full ${statsTab === range.key ? "active" : ""}`}
                    onClick={() => setStatsTab(range.key)}
                  >
                    {range.label}
                  </button>
                </li>
              ))}
            </ul>
            <div className="chart-box mt-4">
              {statsLoading && !stats ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-6 h-6 animate-spin text-[#b388ff]" />
                </div>
              ) : (
                <StatsChart graph={graph} />
              )}
            </div>
          </div>

          <div>
            <h5 className="text-white uppercase font-semibold mb-4">All time</h5>
            <div className="stats-box mb-6">
              <div className="stat-item">
                <h2>{stats?.totalHits || "-"}</h2>
                <p>Total Hits</p>
              </div>
              <div className="stat-item">
                <h2>{stats?.avgHits || "-"}</h2>
                <p>Avg. Hits Per Day</p>
              </div>
              <div className="stat-item">
                <h2>{stats?.bestDay || "-"}</h2>
                <p>{stats?.bestHits ? `Best Day (${stats.bestHits} Hits)` : "Best Day"}</p>
              </div>
            </div>

            <h6 className="uppercase text-white font-semibold mb-3">Email Stats</h6>
            <div className="email-box mb-3">
              <input
                type="email"
                className="email-input"
                placeholder="Recipient email (separate with comma)"
                value={emailInput}
                onChange={(e) => {
                  setEmailInput(e.target.value);
                  setEmailNote(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && handleEmailStats()}
              />
              <button type="button" className="send-btn" onClick={handleEmailStats} aria-label="Send stats">
                <Send className="w-4 h-4" />
              </button>
            </div>
            {emailNote && <p className="text-xs text-white/60 mb-2">{emailNote}</p>}
            <label className="flex items-center gap-2 text-sm text-white mb-6">
              <input
                type="checkbox"
                className="accent-[#b284f6] w-4 h-4"
                checked={sendCopy}
                onChange={(e) => setSendCopy(e.target.checked)}
              />
              Send me a copy
            </label>

            <h6 className="uppercase text-white font-semibold mb-2">Understanding Your Stats</h6>
            <p className="text-white/50 text-sm leading-relaxed">
              Landing Page activity naturally varies depending on how long your listing has been live. It's common to
              see lower numbers when a page is first published or once a property is nearing the end of its marketing
              cycle. These stats are meant to give you insight into engagement over time—so don't stress if the
              numbers fluctuate. Consistent promotion and fresh updates help maintain steady visibility.
            </p>
          </div>
        </div>
      </section>
    );
  };

  const renderTab = () => {
    switch (activeTab) {
      case "photos":
        return renderPhotos();
      case "panoramas":
        return renderPanoramas();
      case "floorplan":
        return renderFloorplan();
      case "matterport":
        return renderMatterport();
      case "video":
        return renderVideo();
      case "print_media":
        return renderPrintMedia();
      case "eflyer":
        return renderEflyer();
      case LANDING_TAB:
        return renderLanding();
      default:
        return tabLoading === activeTab ? tabSpinner : <p className="empty-text">Nothing to show here yet.</p>;
    }
  };

  const tabs = [
    ...model.tabs.filter((t) => !HIDDEN_TABS.has(t.key) && t.key !== LANDING_TAB),
    { key: LANDING_TAB, label: "Landing Page", count: null as number | null },
  ];

  return (
    <div className="ld-v2">
      {/* Hero */}
      <div
        className={`ld-hero${hasListingHero ? "" : " is-empty"}`}
        style={{ backgroundImage: `url("${heroImage}")` }}
      >
        <div className="hero-content ld-page-inner">
          <div className="flex flex-wrap items-center gap-y-8">
            <div className="w-full lg:w-7/12">
              <span className={`ld-badge ${isInactive ? "is-inactive" : ""}`}>{badgeLabel}</span>
              <h1>
                {model.street}
                {model.city && <span className="ld-city">{model.city}</span>}
              </h1>
              <p className={`mb-6 text-lg ${isInactive ? "font-bold text-white" : "text-white/75"}`}>
                MLS® Number: {model.mls || "Not Active"}
              </p>
              <div className="flex flex-wrap gap-3 items-center">
                <a href={appointmentHref} target="_blank" rel="noopener noreferrer" className="btn-outline-light">
                  ORDER SERVICES
                </a>
              </div>
            </div>

            {upcoming.length > 0 && (
              <div className="w-full lg:w-5/12 flex lg:justify-end lg:self-center">
                <div className="upcoming-services-card">
                  <div className="upcoming-services-content">
                    <h2 className="upcoming-services-title">Upcoming Services</h2>
                    {upcoming.slice(0, 4).map((s, i, arr) => (
                      <div className={`upcoming-service-item${i === arr.length - 1 ? " is-last" : ""}`} key={`${s.id}-${s.name}-${i}`}>
                        <h3 className="upcoming-service-name">{s.name}</h3>
                        {s.start ? (
                          <p className="upcoming-service-time">
                            {/* start is already "October 1, 1:00pm" from user/home; only reformat if raw datetime */}
                            {/^\d{4}-\d{2}-\d{2}/.test(s.start) ? formatUpcoming(s.start) : s.start}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <Link href={manageApptHref} className="manage-appointment-bar">
                    MANAGE APPOINTMENT
                  </Link>
                </div>
              </div>
            )}

            {model.proofId && (
              <div className="w-full lg:w-10/12">
                <div className="approval-alert">
                  <AlertCircle className="w-7 h-7 text-red-500 flex-shrink-0" />
                  <div>
                    <h6>Print Proof Needs Approval</h6>
                    <p>
                      {model.proofAlertMessage || (
                        <>
                          We've detected that your {pendingRow?.product?.toLowerCase() || "feature sheet"} at{" "}
                          <strong>{model.address}</strong> is waiting for approval.
                        </>
                      )}
                    </p>
                    <ol className="approval-steps">
                      <li>
                        <span className="step-num">1</span> Review the proof
                      </li>
                      <li>
                        <span className="step-num">2</span> Choose stock, quantity &amp; shipping
                      </li>
                      <li>
                        <span className="step-num">3</span> Approve &amp; send to print
                      </li>
                    </ol>
                    <div className="approval-actions">
                      <Link href={`/proof-review?id=${encodeURIComponent(model.proofId)}`} className="btn-alert">
                        REVIEW PROOF
                      </Link>
                      <button
                        type="button"
                        className="btn-alert is-primary"
                        onClick={() => setPrintModal({ id: model.proofId as string, proofUrl: pendingRow?.proofUrl || undefined })}
                      >
                        SEND TO PRINT
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Media tabs */}
      <div className="ld-page-inner mt-10 pb-12">
        <ul className="ld-tabs bg-grey border-radius-50" role="tablist">
          {tabs.map((tab) => (
            <li key={tab.key} className="flex-1 flex">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                className={`nav-link w-full ${activeTab === tab.key ? "active" : ""}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
                {tab.count !== null && tab.count > 0 && <span className="tab-count">{tab.count}</span>}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-6 p-1" role="tabpanel">
          {renderTab()}
        </div>
      </div>

      {lightboxPhoto && (
        <div
          className="photo-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={lightboxPhoto.alt}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setLightboxPhoto(null);
          }}
        >
          <button
            type="button"
            className="photo-lightbox-close"
            onClick={() => setLightboxPhoto(null)}
            aria-label="Close image preview"
          >
            <X className="w-6 h-6" />
          </button>
          <img src={lightboxPhoto.url} alt={lightboxPhoto.alt} />
        </div>
      )}

      <PortalFooter />

      <SendToPrintModal
        proofId={printModal?.id ?? null}
        open={!!printModal}
        onOpenChange={(open) => {
          if (!open) setPrintModal(null);
        }}
        listingAddress={model.address}
        proofUrl={printModal?.proofUrl}
        onSent={() => setReloadKey((k) => k + 1)}
      />
    </div>
  );
}
