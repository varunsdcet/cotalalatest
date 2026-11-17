import type { FeatureListingFinalSnapshot, ScrapePayload } from "../feature-listing-preview";
import { featureSheetPublicRemarksBody } from "../feature-listing-preview";
import type { FeatureSheetFormState, RoomRow } from "./render-panels";
import { scrapeToFormFields } from "./scrape-to-form";

export const DEFAULT_ROOMS: RoomRow[] = [];

export const DEFAULT_HIGHLIGHTS: string[] = [];

/** Printed MLS sheet — neutral dark text on white (matches mockup `.sheet { color: #222 }`). */
export const FEATURE_SHEET_MLS_TEXT_COLOR = "#222222";
export const FEATURE_SHEET_MLS_BG_COLOR = "#ffffff";

export function createDefaultFormState(tourId = ""): FeatureSheetFormState {
  return {
    useFloorplan: false,
    mls: "",
    addr: "",
    city: "",
    price: "",
    type: "",
    listingStatus: "Residential",
    beds: "",
    baths: "",
    fullBaths: "",
    halfBaths: "",
    sqft: "",
    mainSqft: "",
    aboveSqft: "",
    belowSqft: "",
    bsmtSqft: "",
    totalFinishedSqft: "",
    unfinishedSqft: "",
    year: "",
    age: "",
    tax: "",
    taxYear: "",
    strata: "",
    park: "",
    parkCovered: "",
    parkFeatures: "",
    locker: "",
    zone: "",
    style: "",
    pid: "",
    complex: "",
    titleToLand: "",
    lotDimensions: "",
    frontage: "",
    lotArea: "",
    floodPlain: "",
    rearYardExp: "",
    view: "",
    viewDetails: "",
    construction: "",
    foundation: "",
    rainScreen: "",
    renovations: "",
    fireplaces: "",
    outdoorArea: "",
    roofType: "",
    exterior: "",
    waterSupply: "",
    fuelHeating: "",
    floorFinish: "",
    unitsInDev: "",
    distanceTo: "",
    propertyDisc: "",
    padRental: "",
    fixturesLeased: "",
    fixturesRmvd: "",
    servicesConnected: "",
    mgmtCompany: "",
    legal: "",
    amenities: "",
    siteInfluences: "",
    features: "",
    bylawRestric: "",
    numRooms: "",
    numKitchens: "",
    levels: "",
    crawlHeight: "",
    basement: "",
    suite: "",
    rentalsAllowed: "",
    petsAllowed: "",
    desc: "",
    tour: tourId ? `cotala.com/${tourId}` : "",
    agentName: "",
    agentTitle: "",
    agentPhone: "",
    agentEmail: "",
    agentWeb: "",
    agentBroker: "",
    agentLogoLabel: "YOUR BROKER NAME / LOGO",
    agentPhone2: "",
    showAgentTitle: true,
    showAgentPhoto: true,
    agentPhotoShape: "50%",
    agentScale: 1,
    agentBarStyle: "standard",
    logoScale: 1,
    heroScale: 1,
    heroCrop: 100,
    showQr: true,
    strataLabel: "Maint.",
    bgColor: FEATURE_SHEET_MLS_BG_COLOR,
    textColor: "#555555",
    headingColor: FEATURE_SHEET_MLS_TEXT_COLOR,
    primaryColor: "#1a3a5c",
    accentColor: "#e3a79a",
    qrColor: "#000000",
    headingFont: "'Playfair Display', serif",
    bodyFont: "'Montserrat', sans-serif",
    displayFont: "'Montserrat', sans-serif",
    rooms: [],
    bathRooms: [],
    highlights: [],
    images: { hero: null, agent: null, logo: null, il1: null, rh: null, fp: null, lb: {}, rg: {} },
    layoutP2: ["content", "hero"],
    layoutP4: ["hero", "grid"],
  };
}

function formatPrice(price: string | null): string {
  if (!price?.trim()) return "";
  const n = Number(price.replace(/[^0-9.]/g, ""));
  if (Number.isNaN(n)) return price;
  return `$${n.toLocaleString()}`;
}

const FEATURE_VALIDATION_SCRAPE_KEY = "cotala_feature_validation_scrape";

export function readValidationScrapeForTour(tourId: string): ScrapePayload | null {
  if (typeof window === "undefined" || !tourId.trim()) return null;
  try {
    const raw = window.localStorage.getItem(FEATURE_VALIDATION_SCRAPE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { tourId?: string | number; scrape?: ScrapePayload };
    if (parsed?.scrape && String(parsed.tourId ?? "") === String(tourId)) {
      return parsed.scrape;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function snapshotToFormState(snap: FeatureListingFinalSnapshot): FeatureSheetFormState {
  const base = createDefaultFormState(snap.tourId);
  const scrape = snap.scrapeData ?? readValidationScrapeForTour(snap.tourId);
  const fromScrape = scrapeToFormFields(scrape);

  const primary = snap.primaryImages ?? [];
  const secondary = snap.secondaryImages ?? [];

  const lb: Record<number, string> = {};
  for (let i = 1; i <= 3; i++) {
    const url = primary[i]?.trim();
    if (url) lb[i] = url;
  }
  const rg: Record<number, string> = {};
  const rgSources = [primary[5], ...secondary.slice(0, 8)];
  rgSources.forEach((url, idx) => {
    if (url?.trim()) rg[idx + 1] = url.trim();
  });

  const descFromSnap = featureSheetPublicRemarksBody(snap.listingDescription, scrape);

  return {
    ...base,
    ...fromScrape,
    addr: fromScrape.addr || snap.listingAddress || base.addr,
    price: formatPrice(snap.price) || fromScrape.price || base.price,
    beds: snap.bedrooms || fromScrape.beds || base.beds,
    baths: snap.bathrooms || fromScrape.baths || base.baths,
    sqft: snap.size || fromScrape.sqft || base.sqft,
    tax: snap.tax || fromScrape.tax || base.tax,
    strata: snap.maintFee || fromScrape.strata || base.strata,
    desc: descFromSnap || fromScrape.desc || base.desc,
    tour: `cotala.com/${snap.tourId}`,
    agentName: snap.agentName || base.agentName,
    agentPhone: snap.agentPhone || base.agentPhone,
    agentEmail: snap.agentEmail || base.agentEmail,
    agentWeb: snap.agentWebsite || base.agentWeb,
    // Do not inherit agent brand textColour (often blue) — MLS print uses neutral colors like mockup.
    bgColor: FEATURE_SHEET_MLS_BG_COLOR,
    textColor: "#555555",
    headingColor: FEATURE_SHEET_MLS_TEXT_COLOR,
    images: {
      hero: snap.coverImage?.trim() || null,
      agent: snap.agentHeadshot?.trim() || null,
      logo: snap.agentLogo?.trim() || null,
      il1: primary[0]?.trim() || null,
      rh: primary[4]?.trim() || null,
      fp: null,
      lb,
      rg,
    },
  };
}

/** Fill empty builder slots from listing photos without overwriting picks the user already made. */
export function fillFormImagesFromPhotos(
  form: FeatureSheetFormState,
  photos: { cover?: string; primary?: string[]; secondary?: string[]; gallery?: string[] },
): FeatureSheetFormState {
  const g = photos.gallery ?? [];
  const primary = photos.primary ?? [];
  const secondary = photos.secondary ?? [];
  const images = {
    ...form.images,
    lb: { ...form.images.lb },
    rg: { ...form.images.rg },
  };
  if (!images.hero) images.hero = photos.cover?.trim() || g[0] || null;
  if (!images.il1) images.il1 = primary[0]?.trim() || g[1] || null;
  if (!images.rh) images.rh = primary[4]?.trim() || g[5] || null;
  for (let i = 1; i <= 3; i++) {
    if (!images.lb[i]) {
      const u = primary[i]?.trim() || g[i + 1];
      if (u) images.lb[i] = u;
    }
  }
  const rgSources = [primary[5], ...secondary.slice(0, 8)];
  for (let i = 1; i <= 9; i++) {
    if (!images.rg[i]) {
      const u = rgSources[i - 1]?.trim() || g[i + 5];
      if (u) images.rg[i] = u;
    }
  }
  return { ...form, images };
}

export function formToSnapshot(
  form: FeatureSheetFormState,
  tourId: string,
  previous: FeatureListingFinalSnapshot | null,
): FeatureListingFinalSnapshot {
  const lb = [form.images.lb[1], form.images.lb[2], form.images.lb[3]].map((u) => u?.trim() || "");
  const rg = Array.from({ length: 9 }, (_, i) => form.images.rg[i + 1]?.trim() || "");
  const primaryImages = [
    form.images.il1?.trim() || "",
    lb[0],
    lb[1],
    lb[2],
    form.images.rh?.trim() || "",
    rg[0],
  ];
  const secondaryImages = rg.slice(1);
  return {
    version: 1,
    tourId,
    pageBgColor: form.bgColor || previous?.pageBgColor || FEATURE_SHEET_MLS_BG_COLOR,
    pageTextColor: form.textColor || previous?.pageTextColor || FEATURE_SHEET_MLS_TEXT_COLOR,
    listingAddress: form.addr || previous?.listingAddress || "",
    coverImage: form.images.hero?.trim() || previous?.coverImage || "",
    primaryImages,
    secondaryImages,
    agentName: form.agentName || previous?.agentName || "",
    agentPhone: form.agentPhone || previous?.agentPhone || "",
    agentEmail: form.agentEmail || previous?.agentEmail || "",
    agentWebsite: form.agentWeb || previous?.agentWebsite || "",
    agentHeadshot: form.images.agent?.trim() || previous?.agentHeadshot || null,
    agentLogo: form.images.logo?.trim() || previous?.agentLogo || null,
    price: form.price || previous?.price || null,
    listingDescription: form.desc || previous?.listingDescription || null,
    maintFee: form.strata || previous?.maintFee || "",
    size: form.sqft || previous?.size || "",
    bedrooms: form.beds || previous?.bedrooms || "",
    bathrooms: form.baths || previous?.bathrooms || "",
    tax: form.tax || previous?.tax || "",
    scrapeData: previous?.scrapeData ?? readValidationScrapeForTour(tourId),
  };
}

export const PRINT_LAYOUT = {
  finishWidthIn: 17,
  finishHeightIn: 11,
  docWidthIn: 17.5,
  docHeightIn: 11.5,
  bleedIn: 0.25,
  markOffsetIn: 0.125,
  safetyIn: 0.25,
  refWidthPx: 556,
  refHeightPx: 748,
  previewScale: 0.47,
} as const;
