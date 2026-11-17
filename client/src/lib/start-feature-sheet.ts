import {
  getListingDetails,
  getPortalListingDetail,
  getUserIdFromStorage,
  listingWithMlx2,
  type ListingWithMlx2Response,
  type ListingWithMlx2Tour,
} from "@/lib/api";
import {
  fetchFeatureSheetListingPhotos,
  type FeatureSheetPhotoSet,
} from "@/lib/feature-sheet-photos";
import {
  persistFeatureListingFinalSnapshot,
  type FeatureListingFinalSnapshot,
  type ScrapePayload,
} from "@/pages/listings/feature-listing-preview";

const FULL_PUBLIC_KEY = "yU87Ps32f";

export type FeatureSheetListingInput = {
  tourid: string | number;
  mls?: string;
  address?: string;
  city?: string;
  unit?: string;
  [key: string]: unknown;
};

export type FeatureSheetProgress = "loading" | "scraping" | "done";

function trimStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function mergeListingMlxDetails(tour: Record<string, unknown>): Record<string, string> {
  const m1 = tour.mlxdetails;
  const m2 = tour.mlxdetails2;
  const a =
    m1 && typeof m1 === "object" && !Array.isArray(m1) ? (m1 as Record<string, string>) : {};
  const b =
    m2 && typeof m2 === "object" && !Array.isArray(m2) ? (m2 as Record<string, string>) : {};
  return { ...a, ...b };
}

function listingDescriptionForFeatureSheet(
  tour: Record<string, unknown>,
  mdx: Record<string, string>,
): string {
  const raw = tour.description;
  const d = typeof raw === "string" ? raw.trim() : "";
  if (d) return d;
  const l1 = (mdx["Legal Description 1"] ?? "").trim();
  if (l1) return l1;
  return (mdx["Legal Description 2"] ?? "").trim();
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const cleaned = String(value).replace(/[^0-9.]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function fullAddressFromTour(tour: FeatureSheetListingInput): string {
  return `${tour.unit ? `${String(tour.unit)} ` : ""}${tour.address || ""}${tour.city ? `, ${tour.city}` : ""}`.trim();
}

function mlsFromTour(tour: Record<string, unknown>, mdx: Record<string, string>): string {
  return (
    trimStr(tour.mls) ||
    trimStr(mdx["MLS Number"]) ||
    trimStr(mdx["MLS Number "]) ||
    ""
  );
}

/** Same FullPublic URL the feature-sheet Select / listingwithmlx2 API builds. */
function fullPublicUrlForTour(tour: Record<string, unknown>, mdx: Record<string, string>): string | undefined {
  const existing = tour.fullpublicurl ?? tour.fullPublicUrl;
  if (typeof existing === "string" && existing.trim()) return existing.trim();
  const mls = mlsFromTour(tour, mdx);
  if (!mls) return undefined;
  return `https://www.cotala.com/mls/FullPublic.php?k=${FULL_PUBLIC_KEY}&mls=${encodeURIComponent(mls)}`;
}

function readStoredListingWithMlx2(): ListingWithMlx2Response | null {
  try {
    const raw = window.localStorage.getItem("cotala_listingwithmlx2_response");
    if (!raw) return null;
    return JSON.parse(raw) as ListingWithMlx2Response;
  } catch {
    return null;
  }
}

function readStoredFeatureSheetAgentUrl(): string {
  try {
    const raw = window.localStorage.getItem("cotala_feature_sheet_agent");
    if (!raw) return "";
    const p = JSON.parse(raw) as { agent?: { url?: unknown } };
    return trimStr(p.agent?.url);
  } catch {
    return "";
  }
}

function storeAgentAndMlx(data: ListingWithMlx2Response) {
  try {
    window.localStorage.setItem("cotala_listingwithmlx2_response", JSON.stringify(data));
  } catch {
    /* ignore */
  }
  if (data.agent) {
    try {
      window.localStorage.setItem(
        "cotala_feature_sheet_agent",
        JSON.stringify({ imagepath: data.imagepath, agent: data.agent }),
      );
    } catch {
      /* ignore */
    }
  }
}

async function resolveFullTour(
  listing: FeatureSheetListingInput,
  userId: string | null,
): Promise<{ tour: ListingWithMlx2Tour; agent?: ListingWithMlx2Response["agent"] }> {
  const tourId = String(listing.tourid);
  const cached = readStoredListingWithMlx2();
  const cachedMatch = cached?.tours?.find((t) => String(t.tourid) === tourId);
  let selectedTour: ListingWithMlx2Tour = cachedMatch || {
    ...(listing as ListingWithMlx2Tour),
    tourid: Number(listing.tourid) || (listing.tourid as number),
    address: String(listing.address || ""),
    city: String(listing.city || ""),
    mls: String(listing.mls || ""),
    status: String(listing.status || ""),
    orderid: String(listing.orderid || ""),
    numpics: Number(listing.numpics || 0),
  };
  let agent: ListingWithMlx2Response["agent"] | undefined = cached?.agent;

  if (userId) {
    const search =
      trimStr(listing.mls) ||
      [listing.unit, listing.address, listing.city].filter((p) => trimStr(p)).join(" ");
    const queries = search ? [search, ""] : [""];
    for (const mls_or_address of queries) {
      try {
        const data = await listingWithMlx2({ user_id: userId, mls_or_address, page: 1 });
        storeAgentAndMlx(data);
        if (data.agent) agent = data.agent;
        const match = data.tours?.find((t) => String(t.tourid) === tourId);
        if (match) {
          selectedTour = match;
          break;
        }
      } catch (err) {
        console.warn("listingwithmlx2 failed", err);
      }
    }

    if (!(selectedTour as Record<string, unknown>).fullpublicurl && !(selectedTour as Record<string, unknown>).mlxdetails) {
      try {
        const portal = await getPortalListingDetail(tourId);
        const payload = (portal.data || {}) as { tour?: ListingWithMlx2Tour; agent?: ListingWithMlx2Response["agent"] };
        if (payload.tour) selectedTour = { ...selectedTour, ...payload.tour };
        if (payload.agent) agent = payload.agent;
      } catch {
        /* ignore */
      }
      try {
        const legacy = await getListingDetails({ tourid: tourId, user_id: userId });
        if (legacy.status && legacy.tour) {
          selectedTour = { ...selectedTour, ...(legacy.tour as ListingWithMlx2Tour) };
        }
      } catch {
        /* ignore */
      }
    }
  }

  return { tour: selectedTour, agent };
}

async function storeScrapeAndSelection(
  selectedTour: ListingWithMlx2Tour,
  agent: ListingWithMlx2Response["agent"] | undefined,
  onProgress?: (phase: FeatureSheetProgress) => void,
) {
  const anyTour = selectedTour as Record<string, unknown>;
  const mdx = mergeListingMlxDetails(anyTour);
  const fullAddress = fullAddressFromTour(selectedTour);
  const fullPublicUrl = fullPublicUrlForTour(anyTour, mdx);
  const sheetListingDescription = listingDescriptionForFeatureSheet(anyTour, mdx);

  let validatorPayload: Record<string, unknown> | null = null;

  if (fullPublicUrl) {
    onProgress?.("scraping");
    try {
      const scrapeRes = await fetch("https://goyoga.ai/validator/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: fullPublicUrl }),
      });
      if (scrapeRes.ok) {
        const scraped = await scrapeRes.json();
        validatorPayload = {
          ...scraped,
          theme: {
            bgColour: agent?.bgColour ?? "#ffffff",
            textColour: agent?.textColour ?? "#374151",
          },
        };
      }
    } catch (err) {
      console.warn("Feature sheet scrape failed", err);
    }
  }

  if (!validatorPayload) {
    const mlsFromTourVal = mlsFromTour(anyTour, mdx) || selectedTour.mls || null;
    const listPriceRaw = mdx["List Price"] ?? anyTour.price ?? null;
    const sqftRaw = mdx["Sqft"] ?? mdx["Floor Area -Grand Total"] ?? anyTour.sqft ?? null;
    const totalSqft = toNumber(sqftRaw);
    validatorPayload = {
      listing: {
        mls_number: mlsFromTourVal,
        listed_price: toNumber(listPriceRaw),
        price_per_sqft: null,
        days_on_market: null,
        status: anyTour.status || null,
        source: "Cotala",
        tour_link: fullPublicUrl || anyTour.fullpublicurl || anyTour.virtual_tour || "",
      },
      property: {
        address: fullAddress,
        city: anyTour.city || null,
        province: agent?.province ?? null,
        postal_code: anyTour.postal || mdx["Postal Code"] || null,
        subarea: anyTour.subarea || mdx["Sub-Area/Community"] || null,
        area: mdx["Area"] || null,
        region: null,
        country: "Canada",
        property_type: anyTour.type || mdx["Property Type"] || anyTour.style || null,
        ownership_type: mdx["Title to Land"] || null,
        zoning: mdx["Zoning"] || null,
        pid: mdx["PID #"] || null,
        complex_name: mdx["Complex/Subdivision"] || anyTour.complex || null,
      },
      agent: {
        name: agent?.name ?? anyTour.agent ?? null,
        phone: agent?.phone ?? agent?.cell ?? null,
        email: agent?.email ?? null,
        image: agent?.headshot_url ?? null,
        brokerage: agent?.brokerage ?? null,
      },
      pricing: {
        maintenance_fee: toNumber(mdx["Strata Maint Fee"] ?? anyTour.maint ?? null),
        gross_taxes: toNumber(mdx["Gross Taxes"] ?? anyTour.taxes ?? null),
        tax_year:
          mdx["For Tax Year"] ??
          (typeof anyTour.taxes === "string" ? anyTour.taxes.split("/")[1] : null) ??
          null,
      },
      size: { total_sqft: totalSqft, main_sqft: null, above_sqft: null, below_sqft: null },
      property_details: {
        bedrooms: toNumber(mdx["Bedrooms"] ?? mdx["Total Bedrooms"] ?? anyTour.beds ?? null),
        bathrooms: toNumber(mdx["Bathrooms"] ?? mdx["Total Baths"] ?? anyTour.baths ?? null),
        full_baths: toNumber(mdx["Bathrooms"] ?? mdx["Total Baths"] ?? anyTour.baths ?? null),
        half_baths: null,
        approx_year_built: toNumber(mdx["Approx Year Built"] ?? anyTour.built ?? null),
        age: toNumber(mdx["Age"] ?? anyTour.age ?? null),
        style_of_home: anyTour.style || mdx["Style of Home"] || null,
        basement: mdx["Basement Area"] || anyTour.basement || null,
        levels: mdx["No Floor Levels"] || null,
      },
      lot: {},
      building: {},
      utilities: {},
      fireplace: {},
      parking: {},
      amenities: [],
      community_features: [],
      appliances: [],
      features: [],
      pet_policy: {},
      rooms: [],
      floor_area: {
        finished_main_sqft: null,
        finished_above_sqft: null,
        finished_below_sqft: null,
        finished_basement_sqft: null,
        finished_total_sqft: totalSqft,
        unfinished_sqft: null,
        grand_total_sqft: totalSqft,
      },
      counts: {},
      legal: {
        legal_description: mdx["Legal Description 1"] || mdx["Legal Description 2"] || "",
      },
      management: {},
      description: sheetListingDescription,
      theme: {
        bgColour: agent?.bgColour ?? "#ffffff",
        textColour: agent?.textColour ?? "#374151",
      },
    };
  }

  try {
    window.localStorage.setItem(
      "cotala_feature_validation_scrape",
      JSON.stringify({ tourId: selectedTour.tourid, scrape: validatorPayload }),
    );
  } catch {
    /* ignore */
  }

  const agRecord = agent as Record<string, unknown> | undefined;
  const resolvedAgentUrl =
    trimStr(mdx["Listing Agent URL"]) ||
    trimStr(anyTour.agentWebsite) ||
    trimStr(agRecord?.url) ||
    readStoredFeatureSheetAgentUrl();
  const mlsValue = mlsFromTour(anyTour, mdx);

  window.localStorage.setItem(
    "cotala_feature_sheet_selection",
    JSON.stringify({
      tourid: selectedTour.tourid,
      fullAddress,
      mls: mlsValue,
      description: sheetListingDescription,
      agentName: mdx["Listing Agent Name"] ?? anyTour.agentName ?? "",
      agentPhone:
        mdx["Listing Agent Preferred Phone"] ??
        mdx["Listing Agent Phone"] ??
        anyTour.agentPhone ??
        "",
      agentEmail: mdx["Listing Agent Email"] ?? anyTour.agentEmail ?? "",
      agentWebsite: resolvedAgentUrl,
      url: resolvedAgentUrl,
      brokerage: mdx["Listing Office Name"] ?? mdx["Board"] ?? anyTour.brokerage ?? "",
      style: mdx["Style"] ?? anyTour.style ?? "",
      tax: mdx["Taxes"] ?? anyTour.taxes ?? "",
      maintFee: mdx["Maintenance Fee"] ?? anyTour.maint ?? "",
      size: mdx["Sqft"] ?? anyTour.sqft ?? "",
      bedrooms: mdx["Bedrooms"] ?? anyTour.beds ?? "",
      bathrooms: mdx["Bathrooms"] ?? anyTour.baths ?? "",
      mainFloorSqft: mdx["Main Floor"] ?? "",
      balconySqft: mdx["Balcony"] ?? "",
      totalLivable: mdx["Total Livable"] ?? "",
      totalExtras: mdx["Total Extras"] ?? "",
    }),
  );

  return validatorPayload as ScrapePayload | null;
}

type StoredSheetSelection = {
  tourid?: string | number;
  fullAddress?: string;
  mls?: string;
  description?: string;
  agentName?: string;
  agentPhone?: string;
  agentEmail?: string;
  agentWebsite?: string;
  tax?: string;
  maintFee?: string;
  size?: string;
  bedrooms?: string;
  bathrooms?: string;
};

function readStoredSelection(): StoredSheetSelection | null {
  try {
    const raw = window.localStorage.getItem("cotala_feature_sheet_selection");
    if (!raw) return null;
    return JSON.parse(raw) as StoredSheetSelection;
  } catch {
    return null;
  }
}

function readStoredScrape(tourId: string): ScrapePayload | null {
  try {
    const raw = window.localStorage.getItem("cotala_feature_validation_scrape");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { tourId?: string | number; scrape?: ScrapePayload };
    if (parsed?.scrape && String(parsed.tourId ?? "") === String(tourId)) return parsed.scrape;
  } catch {
    /* ignore */
  }
  return null;
}

function readStoredAgent(): Record<string, unknown> | null {
  try {
    const raw = window.localStorage.getItem("cotala_feature_sheet_agent");
    if (!raw) return null;
    const p = JSON.parse(raw) as { agent?: Record<string, unknown> };
    return p.agent ?? null;
  } catch {
    return null;
  }
}

function looksLikeUrl(s: string): boolean {
  return /^https?:\/\//i.test(s) || s.startsWith("data:") || s.startsWith("//");
}

function strField(v: unknown): string {
  return typeof v === "string" ? v.trim() : v != null ? String(v).trim() : "";
}

/**
 * Writes the Finished-Editing snapshot so `/feature-sheet-builder` can load without `/feature-listing`.
 */
export async function persistFeatureSheetBuilderSnapshot(args: {
  tourId: string;
  listingAddress?: string;
  scrape?: ScrapePayload | null;
  agent?: ListingWithMlx2Response["agent"] | Record<string, unknown> | null;
  selection?: StoredSheetSelection | null;
  photos?: FeatureSheetPhotoSet;
}): Promise<FeatureListingFinalSnapshot | null> {
  const tourId = String(args.tourId ?? "").trim();
  if (!tourId) return null;

  const scrape = args.scrape ?? readStoredScrape(tourId);
  const scrapeExtra = (scrape ?? {}) as {
    theme?: { bgColour?: string; textColour?: string };
    agent?: { name?: string | null; phone?: string | null; email?: string | null; image?: string | null };
  };
  const selection = args.selection ?? readStoredSelection();
  const agent = (args.agent ?? readStoredAgent() ?? {}) as Record<string, unknown>;
  const photos = args.photos ?? (await fetchFeatureSheetListingPhotos(tourId));

  const listedPrice = scrape?.listing?.listed_price;
  const price =
    listedPrice != null && Number.isFinite(Number(listedPrice)) ? String(listedPrice) : "";

  const headshotRaw =
    strField(agent.headshot_url) ||
    strField(agent.coverimage) ||
    strField(agent.headshot) ||
    strField(scrapeExtra.agent?.image);
  const agentHeadshot =
    headshotRaw && looksLikeUrl(headshotRaw) && !/^(yes|no)$/i.test(headshotRaw) ? headshotRaw : null;

  const agentLogo =
    strField(agent.broker_logo) || strField(agent.customer_logo) || null;

  const snap: FeatureListingFinalSnapshot = {
    version: 1,
    tourId,
    pageBgColor: strField(agent.bgColour) || scrapeExtra.theme?.bgColour || "#ffffff",
    pageTextColor: strField(agent.textColour) || scrapeExtra.theme?.textColour || "#374151",
    listingAddress:
      args.listingAddress?.trim() ||
      strField(selection?.fullAddress) ||
      strField(scrape?.property?.address) ||
      "",
    coverImage: photos.cover || photos.gallery[0] || "",
    primaryImages: photos.primary.length ? photos.primary : photos.gallery.slice(1, 8),
    secondaryImages: photos.secondary.length
      ? photos.secondary
      : photos.gallery.slice(8, 16),
    agentName: strField(selection?.agentName) || strField(agent.name) || strField(scrapeExtra.agent?.name),
    agentPhone:
      strField(selection?.agentPhone) ||
      strField(agent.phone) ||
      strField(agent.cell) ||
      strField(scrapeExtra.agent?.phone),
    agentEmail: strField(selection?.agentEmail) || strField(agent.email) || strField(scrapeExtra.agent?.email),
    agentWebsite: strField(selection?.agentWebsite) || strField(agent.url),
    agentHeadshot,
    agentLogo,
    price: price || null,
    listingDescription: strField(selection?.description) || scrape?.description || null,
    maintFee: strField(selection?.maintFee) || (scrape?.pricing?.maintenance_fee != null ? String(scrape.pricing.maintenance_fee) : ""),
    size: strField(selection?.size) || (scrape?.size?.total_sqft != null ? String(scrape.size.total_sqft) : ""),
    bedrooms:
      strField(selection?.bedrooms) ||
      (scrape?.property_details?.bedrooms != null ? String(scrape.property_details.bedrooms) : ""),
    bathrooms:
      strField(selection?.bathrooms) ||
      (scrape?.property_details?.bathrooms != null ? String(scrape.property_details.bathrooms) : ""),
    tax: strField(selection?.tax) || (scrape?.pricing?.gross_taxes != null ? String(scrape.pricing.gross_taxes) : ""),
    scrapeData: scrape,
  };

  persistFeatureListingFinalSnapshot(snap);
  return snap;
}

/**
 * Same path as Feature Sheet → Select:
 * listingwithmlx2 → goyoga scrape → snapshot → /feature-sheet-builder
 */
export async function startFeatureSheetForListing(
  listing: FeatureSheetListingInput,
  onProgress?: (phase: FeatureSheetProgress) => void,
): Promise<string> {
  const tourId = String(listing.tourid);
  const userId = getUserIdFromStorage();
  onProgress?.("loading");
  const { tour, agent } = await resolveFullTour(listing, userId);
  const scrape = await storeScrapeAndSelection(tour, agent, onProgress);
  await persistFeatureSheetBuilderSnapshot({
    tourId: String(tour.tourid || tourId),
    listingAddress: fullAddressFromTour(tour),
    scrape,
    agent,
  });
  onProgress?.("done");
  return `/feature-sheet-builder?id=${encodeURIComponent(String(tour.tourid || tourId))}`;
}
