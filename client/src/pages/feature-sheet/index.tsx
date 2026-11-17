import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  getUserIdFromStorage,
  listingWithMlx2,
  type ListingWithMlx2Tour,
  type ListingWithMlx2Response,
} from "@/lib/api";
import { persistFeatureSheetBuilderSnapshot } from "@/lib/start-feature-sheet";

// Temporary hardcoded scrape/validator response for MLS R3095036.
// The external scrape API is still called, but this object will override
// the scraped payload when building the validator payload.
const HARDCODED_SCRAPE_R3095036 = {
  listing: {
    mls_number: "R3095036",
    listed_price: 980000,
    price: 980000,
    price_per_sqft: 585.07,
    days_on_market: null,
    status: "Residential",
    source: "MLS",
    tour_link: "https://www.cotala.com/mls/FullPublic.php?k=yU87Ps32f&mls=R3095036",
  },
  property: {
    address: "4 127 172 STREET",
    city: "Surrey",
    province: "BC",
    postal_code: "V3Z 0W9",
    subarea: "Pacific Douglas",
    area: null,
    region: null,
    country: null,
    property_type: "Townhouse",
    ownership_type: "Freehold Strata",
    zoning: "RM30",
    pid: "030371937",
    complex_name: "The Eagles By Dawson Sawyer",
  },
  agent: {
    name: null,
    phone: null,
    email: null,
    image: null,
    brokerage: null,
  },
  pricing: {
    maintenance_fee: 378.58,
    gross_taxes: 3683.25,
    tax_year: 2025,
  },
  property_details: {
    bedrooms: 4,
    bathrooms: 4,
    full_baths: 3,
    half_baths: 1,
    approx_year_built: 2018,
    age: 8,
    style_of_home: "3 Storey",
    basement: "None",
    levels: "Three Or More",
  },
  rooms: {
    bedrooms: 4,
    bathrooms: 4,
    full_baths: 3,
    half_baths: 1,
    kitchens: 1,
  },
  size: {
    total_sqft: 1675,
    main_sqft: 663,
    above_sqft: 690,
    below_sqft: 322,
  },
  lot: {
    lot_dimensions: null,
    frontage_ft: null,
    lot_area: null,
    flood_plain: false,
    rear_yard_exposure: null,
    view: false,
  },
  building: {
    building_type: "Townhouse",
    building_storeys: null,
    units_in_development: 93,
    total_units_in_strata: null,
    construction_materials: [
      "Frame Wood",
      "Fibre Cement (Exterior)",
      "Mixed (Exterior)",
    ],
    construction: null,
    foundation: "Concrete Perimeter",
    roof_type: "Asphalt",
    roof: null,
    floor_finish: ["Laminate", "Tile", "Carpet"],
    year_built: 2018,
    age: 8,
  },
  utilities: {
    water_supply: "Public",
    water: null,
    sewer_type: null,
    fuel_heating: ["Baseboard", "Electric"],
    heating: [],
    services_connected: [
      "Electricity Connected",
      "Natural Gas Connected",
      "Water Connected",
    ],
    services: [],
  },
  fireplace: {
    count: null,
    fuel: [],
  },
  parking: {
    total: 2,
    covered: 2,
    features: ["Garage Double", "Lane Access"],
    locker: 0,
  },
  financial: {
    maintenance_fee: 378.58,
    taxes: 3683.25,
    tax_year: 2025,
  },
  amenities: [
    "Clubhouse",
    "Trash",
    "Maintenance Grounds",
    "Management",
    "Recreation Facilities",
    "Sewer",
  ],
  community_features: ["Near Golf Course", "Marina Nearby", "Private"],
  appliances: [
    "Washer/Dryer",
    "Dishwasher",
    "Refrigerator",
    "Stove",
    "Microwave",
  ],
  features: ["Shopping Nearby", "Patio", "Deck", "Window Coverings"],
  pet_policy: {
    pets_allowed: true,
    cats_ok: true,
    number_limit: 2,
    restrictions: "Yes With Restrictions",
  },
  pets: {
    allowed: true,
    types: ["Cats", "Dogs"],
  },
  room_list: [
    { floor: "Main", pieces: 2, ensuite: false },
    { floor: "Above", pieces: 5, ensuite: false },
    { floor: "Above", pieces: 4, ensuite: false },
    { floor: "Below", pieces: 4, ensuite: false },
  ],
  floor_area: {
    finished_main_sqft: 663,
    finished_above_sqft: 690,
    finished_below_sqft: 322,
    finished_basement_sqft: 0,
    finished_total_sqft: 1675,
    unfinished_sqft: 0,
    grand_total_sqft: 1675,
  },
  counts: {
    number_of_rooms: 8,
    number_of_kitchens: 1,
    rentals_allowed_percent: 100,
  },
  legal: {
    legal_description:
      "STRATA LOT 4, PLAN EPS4772, SECTION 6, TOWNSHIP 7, NEW WESTMINSTER LAND DISTRICT, TOGETHER WITH AN INTEREST IN THE COMMON PROPERTY IN PROPORTION TO THE UNIT ENTITLEMENT OF THE STRATA LOT AS SHOWN ON FORM V",
  },
  management: {
    company: "Peninsula Property Mmgt",
    phone: "604-385-2242",
  },
  description:
    "Welcome to The Eagles! This SPACIOUS DUPLEX-STYLE END UNIT on the SOUTH SIDE offers 4 bedrooms, 4 bathrooms, and a side-by-side double garage—the street entry makes it feel like a detached home! Main floor boasts open-concept living with 9ft ceilings, oversized island, quartz counters, stainless steel appliances, gas cooktop, built-in bar and a bright living room. Sun-drenched balcony off the kitchen and covered balcony perfect for morning coffee, both with gas hookup. Upstairs has 3 bedrooms and 2 baths. Entry level features a versatile 4th bedroom/office with ensuite, and laundry. Extra windows flood this home with light. PRIVATE outside spaces with views and street parking! Walk to schools, parks, golf, beach. Minutes to Hwy 99 and U.S. border. Shows 10/10!",
};

function readStoredListingWithMlx2(): ListingWithMlx2Response | null {
  try {
    const raw = window.localStorage.getItem("cotala_listingwithmlx2_response");
    if (!raw) return null;
    return JSON.parse(raw) as ListingWithMlx2Response;
  } catch {
    return null;
  }
}

function trimStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Dashboard agent profile `url` (e.g. www.traceybosch.com) from `cotala_feature_sheet_agent`. */
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

/** Prefer the row from cached `tours[]` by `tourid` when present; otherwise the clicked in-memory row (e.g. before scroll merge writes storage). */
function resolvedTourFromMlxCache(
  mlx: ListingWithMlx2Response | null,
  clicked: ListingWithMlx2Tour,
): ListingWithMlx2Tour {
  const id = String(clicked.tourid);
  const fromList = mlx?.tours?.find((t) => String(t.tourid) === id);
  return fromList ?? clicked;
}

function mergeListingMlxDetails(tour: Record<string, unknown>): Record<string, string> {
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

/** P2 sheet text: `description` first; else legal lines — not public remarks. */
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

export default function FeatureSheetSelector() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ListingWithMlx2Tour[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [scrapingTourId, setScrapingTourId] = useState<number | null>(null);

  const userId = getUserIdFromStorage();

  const handleListingResponse = (data: ListingWithMlx2Response) => {
    // Store full API response (including agent) for debugging / later use
    try {
      window.localStorage.setItem(
        "cotala_listingwithmlx2_response",
        JSON.stringify(data),
      );
    } catch {
      // ignore storage errors
    }

    if (data.status && Array.isArray(data.tours)) {
      setResults(data.tours);
      setHasMore(data.tours.length > 0);
    } else {
      setResults([]);
      setHasMore(false);
    }

    if (data.agent) {
      const payload = {
        imagepath: data.imagepath,
        agent: data.agent,
      };
      try {
        window.localStorage.setItem("cotala_feature_sheet_agent", JSON.stringify(payload));
      } catch {
        // ignore storage errors
      }
      console.log("ListingWithMlx2 agent payload:", payload);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) {
      setError("User not found. Please log in again.");
      return;
    }
    const trimmed = query.trim();
    setPage(1);
    setHasMore(true);
    setError(null);
    setLoading(true);
    try {
      const data = await listingWithMlx2({
        user_id: userId,
        mls_or_address: trimmed,
        page: 1,
      });
      handleListingResponse(data);
      if (!data.status || !Array.isArray(data.tours) || data.tours.length === 0) {
        setError("No results found for that MLS ID or address.");
      }
    } catch (err) {
      console.error("Failed to search listings", err);
      setError("Something went wrong while searching. Please try again.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setQuery("");
    setError(null);
    setPage(1);
    setHasMore(true);
    // Reload default list with empty MLS/address
    if (!userId) return;
    setLoading(true);
    listingWithMlx2({ user_id: userId, mls_or_address: "", page: 1 })
      .then((data) => {
        handleListingResponse(data);
      })
      .catch((err) => {
        console.error("Failed to reload listings", err);
        setResults([]);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const formatDate = (created?: string) => {
    if (!created) return "";
    const d = new Date(created);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // On first load, hit API with empty mls_or_address to show default listings
  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    listingWithMlx2({ user_id: userId, mls_or_address: "", page: 1 })
      .then((data) => {
        handleListingResponse(data);
      })
      .catch((err) => {
        console.error("Failed to load default listings", err);
        setResults([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [userId]);

  // Infinite scroll: load next page when near bottom
  useEffect(() => {
    if (!userId) return;
    const handleScroll = () => {
      if (loading || !hasMore) return;
      const scrollPosition = window.innerHeight + window.scrollY;
      const threshold = document.body.offsetHeight - 400;
      if (scrollPosition >= threshold) {
        const nextPage = page + 1;
        setLoading(true);
        listingWithMlx2({
          user_id: userId,
          mls_or_address: query.trim(),
          page: nextPage,
        })
          .then((data) => {
            if (data.status && Array.isArray(data.tours) && data.tours.length > 0) {
              setResults((prev) => [...prev, ...data.tours!]);
              setPage(nextPage);
              setHasMore(true);
              try {
                const raw = window.localStorage.getItem(
                  "cotala_listingwithmlx2_response",
                );
                if (raw && data.tours.length) {
                  const prev = JSON.parse(raw) as ListingWithMlx2Response;
                  const seen = new Set(
                    (prev.tours || []).map((t) => String(t.tourid)),
                  );
                  const appended = data.tours.filter(
                    (t) => !seen.has(String(t.tourid)),
                  );
                  if (appended.length) {
                    window.localStorage.setItem(
                      "cotala_listingwithmlx2_response",
                      JSON.stringify({
                        ...prev,
                        ...data,
                        tours: [...(prev.tours || []), ...appended],
                      }),
                    );
                  }
                }
              } catch {
                // ignore storage merge errors
              }
            } else {
              setHasMore(false);
            }

            if (data.agent) {
              const payload = {
                imagepath: data.imagepath,
                agent: data.agent,
              };
              try {
                window.localStorage.setItem("cotala_feature_sheet_agent", JSON.stringify(payload));
              } catch {
                // ignore storage errors
              }
              console.log("ListingWithMlx2 agent payload:", payload);
            }
          })
          .catch((err) => {
            console.error("Failed to load more listings", err);
            setHasMore(false);
          })
          .finally(() => {
            setLoading(false);
          });
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [userId, page, hasMore, loading, query]);

  return (
    <div className="min-h-screen bg-[#060914] text-white">
      <div className="w-full bg-gradient-to-r from-[#101622] via-[#182544] to-[#101622] px-6 py-10 md:px-12">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-3xl md:text-4xl font-semibold mb-3">Select Listing or Tour</h1>
          <p className="text-sm md:text-base text-slate-300">
            Choose a property to associate with your Feature Sheet order.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-0 -mt-8 space-y-6 pb-10">
        <form
          onSubmit={handleSearch}
          className="bg-[#111827] border border-slate-700/70 rounded-2xl shadow-xl p-4 md:p-5 flex flex-col md:flex-row gap-3 items-stretch md:items-center"
        >
          <input
            type="text"
            className="flex-1 rounded-xl border border-slate-700 bg-[#020617] px-3 py-2.5 text-sm outline-none text-slate-100 placeholder:text-slate-500 focus:border-[#0E94B9] focus:ring-1 focus:ring-[#0E94B9]"
            placeholder="Search by Address or MLS ID (e.g. 123 Main St or R234567)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-xs font-semibold bg-[#0E94B9] text-white hover:bg-[#0E94B9]/90 whitespace-nowrap"
              disabled={loading}
            >
              {loading ? "Searching..." : "Search"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-xs font-semibold bg-red-600/80 text-white hover:bg-red-600 whitespace-nowrap"
            >
              Reset
            </button>
          </div>
        </form>

        {error && (
          <div className="bg-red-900/40 border border-red-700/70 text-red-100 text-xs md:text-sm px-3 py-2 rounded-xl">
            {error}
          </div>
        )}

        {!loading && results.length === 0 && !error && (
          <p className="text-xs md:text-sm text-slate-400">
            Enter an MLS ID or address above to search your listings.
          </p>
        )}

        <div className="space-y-5">
          {results.map((tour) => {
            const createdDate = formatDate(tour.created);
            const fullAddress = `${tour.unit ? `${tour.unit} ` : ""}${tour.address}, ${tour.city}`;
            const anyTour = tour as Record<string, unknown>;
            const rowMdx = mergeListingMlxDetails(anyTour);
            const mlsValue =
              (String(anyTour.mls ?? "").trim() ||
                rowMdx["MLS Number"] ||
                rowMdx["MLS Number "] ||
                "") as string;
            const hasFloorplan = !!(anyTour.floorplan || anyTour.floorplanarray);
            return (
              <div
                key={tour.tourid}
                className="border border-[#0E94B9]/60 bg-gradient-to-r from-[#020617] via-[#020617] to-[#020617] rounded-2xl shadow-lg p-4 md:p-5"
              >
                <div className="flex flex-col md:flex-row gap-4 md:gap-6 items-start">
                  {/* Thumbnail */}
                  <div className="md:w-[200px] w-full">
                    <div className="rounded-xl overflow-hidden bg-slate-800 h-[140px] md:h-[130px]">
                      <img
                        src={tour.multipleimages?.[0]}
                        alt={fullAddress}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <span className="inline-flex items-center rounded-full bg-[#0E94B9] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em]">
                        Active Listing
                      </span>
                      {mlsValue && (
                        <span className="text-[11px] text-slate-300">
                          MLS: <span className="font-semibold">{mlsValue}</span>
                        </span>
                      )}
                    </div>

                    <h4 className="text-sm md:text-base font-semibold text-white">
                      {fullAddress}
                    </h4>

                    {createdDate && (
                      <p className="text-[11px] text-slate-400">
                        Photographed on{" "}
                        <span className="font-medium text-slate-200">{createdDate}</span>
                      </p>
                    )}

                    {/* Summary line: show values like the HTML design (Photos, Floor Plan, Video Tour) without icon tags */}
                    <div className="mt-1 flex flex-wrap items-center gap-4 text-[11px] text-slate-200">
                      <span>{tour.numpics} Photos</span>
                      {hasFloorplan && <span>1 Floor Plan</span>}
                      {(tour as any).YouTube && <span>Video Tour</span>}
                    </div>

                    <div className="flex items-center justify-end gap-3 mt-3">
                      <button
                        type="button"
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-slate-300/60 text-xs font-semibold text-slate-100 hover:bg-white/5 disabled:opacity-60 disabled:cursor-not-allowed"
                        onClick={async () => {
          
                          setScrapingTourId(tour.tourid);
                          // Hoist so `selectedTour` is always in scope for navigation / selection (try blocks alone can confuse bundlers).
                          let selectedTour: ListingWithMlx2Tour = tour;
                          try {
                            // Clicked row is the source of truth; localStorage only enriches (agent / fuller MLX row) when present.
                            const mlxSnapshot = readStoredListingWithMlx2();
                            selectedTour = resolvedTourFromMlxCache(mlxSnapshot, tour);
                            const merged: {
                              agent: ListingWithMlx2Response["agent"];
                              imagepath?: string;
                              status?: unknown;
                              selectedTour: ListingWithMlx2Tour;
                            } = {
                              agent: mlxSnapshot?.agent,
                              imagepath: mlxSnapshot?.imagepath,
                              status: mlxSnapshot?.status,
                              selectedTour,
                            };
                            {
                              const a = merged.agent as Record<string, unknown> | undefined;
                              console.log(
                                "%c[feature-sheet] Select click — page colour, text colour, headshot",
                                "color:#0E94B9;font-weight:bold",
                                {
                                  bgColour: a?.bgColour ?? "(missing — scrape/theme fallbacks use #ffffff)",
                                  textColour: a?.textColour ?? "(missing — fallbacks use #374151)",
                                  headshot_url: a?.headshot_url ?? "(missing)",
                                  coverimage: a?.coverimage ?? "(missing)",
                                },
                              );
                            }
                            try {
                                console.log(
                                  "Feature-sheet merged response on Select click:",
                                  JSON.stringify(merged, null, 2),
                                );

                                const anyTour = selectedTour as Record<string, unknown>;
                                const mdx = mergeListingMlxDetails(anyTour);
                                const sheetListingDescription =
                                  listingDescriptionForFeatureSheet(anyTour, mdx);

                                // Build scrape-style validator payload
                                const rawFullPublic =
                                  anyTour.fullpublicurl ?? anyTour.fullPublicUrl;
                                const fullPublicUrl: string | undefined =
                                  typeof rawFullPublic === "string" && rawFullPublic.trim() !== ""
                                    ? rawFullPublic.trim()
                                    : undefined;

                                let validatorPayload: any | null = null;

                                // Helper to normalize numeric strings like "529800" or "529,800"
                                const toNumber = (value: unknown): number | null => {
                                  if (value == null) return null;
                                  const cleaned = String(value).replace(/[^0-9.]/g, "");
                                  const n = Number(cleaned);
                                  return Number.isFinite(n) ? n : null;
                                };
                                
                        

                       
                                // If we have a FullPublic URL, try external scrape API
                                if (fullPublicUrl) {
                                  try {
                                    const scrapeRes = await fetch(
                                      "https://goyoga.ai/validator/scrape",
                                      {
                                        method: "POST",
                                        headers: {
                                          "Content-Type": "application/json",
                                        },
                                        body: JSON.stringify({ url: fullPublicUrl }),
                                      },
                                    );
                                    if (scrapeRes.ok) {
                                      const scraped = await scrapeRes.json();
                                      console.log(
                                        "Scrape API raw response:",
                                        JSON.stringify(scraped, null, 2),
                                      );

                                      // For now, override with hardcoded payload for MLS R3095036.
                                      // The API is still being called to verify connectivity,
                                      // but the data used for feature listing comes from
                                      // HARDCODED_SCRAPE_R3095036.
                                      validatorPayload = {
                                        ...scraped,
                                        theme: {
                                          bgColour: merged.agent?.bgColour ?? "#ffffff",
                                          textColour: merged.agent?.textColour ?? "#374151",
                                        },
                                      };
                                    } else {
                                      console.warn(
                                        "Scrape API failed with status",
                                        scrapeRes.status,
                                      );
                                    }
                                  } catch (err) {
                                    console.error("Failed to call scrape API", err);
                                  }
                                }



                                // Fallback: build scrape-style object from merged response
                                if (!validatorPayload) {
                                  const mlsFromTour: string | undefined =
                                    anyTour.mls != null && String(anyTour.mls).trim() !== ""
                                      ? String(anyTour.mls).trim()
                                      : undefined;
                                  const mlsFromMdx: string | undefined =
                                    mdx["MLS Number"] || mdx["MLS Number "];
                                  const listPriceRaw =
                                    mdx["List Price"] ?? anyTour.price ?? null;

                                  const maintenanceRaw =
                                    mdx["Strata Maint Fee"] ?? anyTour.maint ?? null;
                                  const taxesRaw =
                                    mdx["Gross Taxes"] ?? anyTour.taxes ?? null;

                                  const bedroomsRaw =
                                    mdx["Bedrooms"] ??
                                    mdx["Total Bedrooms"] ??
                                    anyTour.beds ??
                                    null;
                                  const bathroomsRaw =
                                    mdx["Bathrooms"] ??
                                    mdx["Total Baths"] ??
                                    anyTour.baths ??
                                    null;

                                  const yearBuiltRaw =
                                    mdx["Approx Year Built"] ?? anyTour.built ?? null;
                                  const ageRaw = mdx["Age"] ?? anyTour.age ?? null;

                                  // Try to derive total square footage so that the
                                  // validator payload matches the "scraped" shape
                                  // used on the next page (size + floor_area).
                                  const sqftRaw =
                                    mdx["Sqft"] ??
                                    mdx["Floor Area -Grand Total"] ??
                                    anyTour.sqft ??
                                    null;
                                  const totalSqft = toNumber(sqftRaw);

                                  validatorPayload = {
                                    listing: {
                                      mls_number:
                                        mlsFromTour || mlsFromMdx || merged.selectedTour?.mls || null,
                                      listed_price: toNumber(listPriceRaw),
                                      price_per_sqft: null,
                                      days_on_market: null,
                                      status: anyTour.status || null,
                                      source: "Cotala",
                                      tour_link:
                                        fullPublicUrl ||
                                        anyTour.fullpublicurl ||
                                        anyTour.virtual_tour ||
                                        "",
                                    },
                                    property: {
                                      address: fullAddress,
                                      city: anyTour.city || null,
                                      province: merged.agent?.province ?? null,
                                      postal_code:
                                        anyTour.postal || mdx["Postal Code"] || null,
                                      subarea:
                                        anyTour.subarea ||
                                        mdx["Sub-Area/Community"] ||
                                        null,
                                      area: mdx["Area"] || null,
                                      region: null,
                                      country: "Canada",
                                      property_type:
                                        anyTour.type ||
                                        mdx["Property Type"] ||
                                        anyTour.style ||
                                        null,
                                      ownership_type: mdx["Title to Land"] || null,
                                      zoning: mdx["Zoning"] || null,
                                      pid: mdx["PID #"] || null,
                                      complex_name:
                                        mdx["Complex/Subdivision"] || anyTour.complex || null,
                                    },
                                    agent: {
                                      name: merged.agent?.name ?? anyTour.agent ?? null,
                                      phone:
                                        merged.agent?.phone ??
                                        merged.agent?.cell ??
                                        null,
                                      email: merged.agent?.email ?? null,
                                      image: merged.agent?.headshot_url ?? null,
                                      brokerage: merged.agent?.brokerage ?? null,
                                    },
                                    pricing: {
                                      maintenance_fee: toNumber(maintenanceRaw),
                                      gross_taxes: toNumber(taxesRaw),
                                      tax_year:
                                        mdx["For Tax Year"] ??
                                        (typeof anyTour.taxes === "string"
                                          ? anyTour.taxes.split("/")[1]
                                          : null) ??
                                        null,
                                    },
                                    size: {
                                      total_sqft: totalSqft,
                                      main_sqft: null,
                                      above_sqft: null,
                                      below_sqft: null,
                                    },
                                    property_details: {
                                      bedrooms: toNumber(bedroomsRaw),
                                      bathrooms: toNumber(bathroomsRaw),
                                      full_baths: toNumber(bathroomsRaw),
                                      half_baths: null,
                                      approx_year_built: toNumber(yearBuiltRaw),
                                      age: toNumber(ageRaw),
                                      style_of_home:
                                        anyTour.style || mdx["Style of Home"] || null,
                                      basement:
                                        mdx["Basement Area"] || anyTour.basement || null,
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
                                      legal_description:
                                        mdx["Legal Description 1"] ||
                                        mdx["Legal Description 2"] ||
                                        "",
                                    },
                                    management: {},
                                    description: sheetListingDescription,
                                    theme: {
                                      bgColour: merged.agent?.bgColour ?? "#ffffff",
                                      textColour: merged.agent?.textColour ?? "#374151",
                                    },
                                  };
                                }

                                try {
                                  window.localStorage.setItem(
                                    "cotala_feature_validation_scrape",
                                    JSON.stringify({
                                      tourId: selectedTour.tourid,
                                      scrape: validatorPayload,
                                    }),
                                  );
                                } catch {
                                  // ignore storage errors
                                }
                              } catch {
                                console.log(
                                  "Feature-sheet Select: failed to build or store validation scrape",
                                );
                              }

                            const selAny = selectedTour as Record<string, unknown>;
                            const selMdx = mergeListingMlxDetails(selAny);
                            const fullAddressSel = `${selectedTour.unit ? `${String(selectedTour.unit)} ` : ""}${selectedTour.address}, ${selectedTour.city}`;
                            const mlsValueSel =
                              (String(selAny.mls ?? "").trim() ||
                                selMdx["MLS Number"] ||
                                selMdx["MLS Number "] ||
                                "") as string;

                            const agRecord = merged.agent as Record<string, unknown> | undefined;
                            const resolvedAgentUrl =
                              trimStr(selMdx["Listing Agent URL"]) ||
                              trimStr(selAny.agentWebsite) ||
                              trimStr(agRecord?.url) ||
                              readStoredFeatureSheetAgentUrl();

                            const selection = {
                              tourid: selectedTour.tourid,
                              fullAddress: fullAddressSel,
                              mls: mlsValueSel,
                              description: listingDescriptionForFeatureSheet(selAny, selMdx),
                              agentName: selMdx["Listing Agent Name"] ?? selAny.agentName ?? "",
                              agentPhone:
                                selMdx["Listing Agent Preferred Phone"] ??
                                selMdx["Listing Agent Phone"] ??
                                selAny.agentPhone ??
                                "",
                              agentEmail: selMdx["Listing Agent Email"] ?? selAny.agentEmail ?? "",
                              agentWebsite: resolvedAgentUrl,
                              url: resolvedAgentUrl,
                              brokerage:
                                selMdx["Listing Office Name"] ??
                                selMdx["Board"] ??
                                selAny.brokerage ??
                                "",
                              style: selMdx["Style"] ?? selAny.style ?? "",
                              tax: selMdx["Taxes"] ?? selAny.taxes ?? "",
                              maintFee: selMdx["Maintenance Fee"] ?? selAny.maint ?? "",
                              size: selMdx["Sqft"] ?? selAny.sqft ?? "",
                              bedrooms: selMdx["Bedrooms"] ?? selAny.beds ?? "",
                              bathrooms: selMdx["Bathrooms"] ?? selAny.baths ?? "",
                              mainFloorSqft: selMdx["Main Floor"] ?? "",
                              balconySqft: selMdx["Balcony"] ?? "",
                              totalLivable: selMdx["Total Livable"] ?? "",
                              totalExtras: selMdx["Total Extras"] ?? "",
                            };
                            window.localStorage.setItem(
                              "cotala_feature_sheet_selection",
                              JSON.stringify(selection),
                            );
                            try {
                              await persistFeatureSheetBuilderSnapshot({
                                tourId: String(selectedTour.tourid),
                                listingAddress: fullAddressSel,
                                agent: merged.agent,
                                selection,
                              });
                            } catch (persistErr) {
                              console.warn("Feature sheet snapshot persist failed", persistErr);
                            }
                            try {
                              const agentStored = window.localStorage.getItem(
                                "cotala_feature_sheet_agent",
                              );
                              if (agentStored) {
                                const p = JSON.parse(agentStored) as {
                                  agent?: Record<string, unknown>;
                                };
                                const ag = p.agent;
                                console.log(
                                  "%c[feature-sheet] Select — localStorage cotala_feature_sheet_agent (feature-listing theme)",
                                  "color:#7cb342;font-weight:bold",
                                  {
                                    bgColour: ag?.bgColour ?? "(missing)",
                                    textColour: ag?.textColour ?? "(missing)",
                                    headshot_url: ag?.headshot_url ?? "(missing)",
                                    coverimage: ag?.coverimage ?? "(missing)",
                                  },
                                );
                              } else {
                                console.warn(
                                  "[feature-sheet] Select — no cotala_feature_sheet_agent in localStorage (search / scroll must have set agent first)",
                                );
                              }
                            } catch {
                              /* ignore */
                            }
                            setLocation(`/feature-sheet-builder?id=${selectedTour.tourid}`);
                          } catch (err) {
                            console.error("Failed to store feature sheet selection", err);
                          } finally {
                            setScrapingTourId(null);
                          }
                        }}
                        disabled={scrapingTourId === tour.tourid}
                      >
                        {scrapingTourId === tour.tourid ? (
                          <>
                            <svg
                              className="animate-spin h-4 w-4 text-white"
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                            >
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                              />
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                              />
                            </svg>
                            Scraping…
                          </>
                        ) : (
                          "Select"
                        )}
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center px-4 py-2 rounded-xl border border-emerald-400/70 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/10"
                        onClick={() => {
                          try {
                            // Log full ListingWithMlx2 API response (including agent)
                            const respRaw = window.localStorage.getItem(
                              "cotala_listingwithmlx2_response",
                            );
                            if (respRaw) {
                              try {
                                const respParsed = JSON.parse(respRaw);
                                console.log(
                                  "Feature-sheet full ListingWithMlx2Response on Validate PDF click:",
                                  respParsed,
                                );
                              } catch {
                                console.log(
                                  "Feature-sheet full ListingWithMlx2Response raw on Validate PDF click:",
                                  respRaw,
                                );
                              }
                            } else {
                              console.log(
                                "Feature-sheet full ListingWithMlx2Response on Validate PDF click: no stored response",
                              );
                            }

                            const anyTour = tour as Record<string, unknown>;
                            const mdx = mergeListingMlxDetails(anyTour);
                            const mlsResponse = {
                              tour: {
                                address: tour.address,
                                city: tour.city,
                                postal_code: mdx["Postal Code"] ?? String(anyTour.postal ?? ""),
                                beds: mdx["Bedrooms"] ?? mdx["Total Bedrooms"] ?? anyTour.beds ?? null,
                                baths: mdx["Bathrooms"] ?? mdx["Total Baths"] ?? anyTour.baths ?? null,
                                sqft:
                                  mdx["Sqft"] ||
                                  mdx["Floor Area -Grand Total"] ||
                                  anyTour.sqft ||
                                  null,
                                price:
                                  (mdx["List Price"] as number | string | undefined) != null
                                    ? Number(mdx["List Price"] as string | number)
                                    : (anyTour.price as number | string | undefined) != null &&
                                        String(anyTour.price).trim() !== ""
                                      ? Number(anyTour.price)
                                      : null,
                                mls_number: mlsValue || String(anyTour.mls ?? "") || "",
                              },
                              agent: {
                                name: mdx["Listing Agent Name"] ?? anyTour.agentName ?? "",
                                brokerage:
                                  mdx["Listing Office Name"] ??
                                  anyTour.brokerage ??
                                  "",
                                email: mdx["Listing Agent Email"] ?? anyTour.agentEmail ?? "",
                                phone:
                                  mdx["Listing Agent Preferred Phone"] ??
                                  mdx["Listing Agent Phone"] ??
                                  anyTour.agentPhone ??
                                  "",
                                url:
                                  trimStr(mdx["Listing Agent URL"]) ||
                                  trimStr(anyTour.agentWebsite) ||
                                  readStoredFeatureSheetAgentUrl(),
                              },
                            };
                            window.localStorage.setItem(
                              "cotala_feature_validation_mls_response",
                              JSON.stringify(mlsResponse),
                            );
                          } catch (err) {
                            console.error("Failed to store MLS validation payload", err);
                          }
                          setLocation(`/feature-validate?id=${tour.tourid}`);
                        }}
                      >
                        Validate PDF
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

