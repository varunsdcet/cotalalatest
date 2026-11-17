import type { CSSProperties } from "react";
import { QRCode } from "react-qrcode-logo";
import royalLePageImg from "@/pages/images/royal-lepage.png";
import cotalaBlk from "@/pages/images/cotala-blk.png";
import cotalaWhite from "@/pages/images/cotala-white.png";

/** Brokerage logo from `cotala_feature_sheet_agent` — `broker_logo` / `customer_logo` (e.g. data URLs). */
export function readFeatureSheetAgentBrokerageLogoUrl(): string | null {
  try {
    const raw = window.localStorage.getItem("cotala_feature_sheet_agent");
    if (!raw) return null;
    const p = JSON.parse(raw) as {
      agent?: { broker_logo?: string; customer_logo?: string };
    };
    const u =
      p.agent?.broker_logo?.trim() ||
      p.agent?.customer_logo?.trim() ||
      "";
    return u || null;
  } catch {
    return null;
  }
}

/** Light / white sheet text → white wordmark so it reads on dark backgrounds. */
export function isLikelyLightTextOnDarkBg(cssColor: string): boolean {
  const src = (cssColor || "").trim().toLowerCase();
  if (src === "white") return true;
  let hex = src.startsWith("#") ? src.slice(1) : "";
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.72;
  }
  const rgb = src.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) {
    const r = Number(rgb[1]);
    const g = Number(rgb[2]);
    const b = Number(rgb[3]);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.72;
  }
  return false;
}

export function pickCotalaFooterLogoForTextColor(pageTextColor: string): string {
  return isLikelyLightTextOnDarkBg(pageTextColor) ? cotalaWhite : cotalaBlk;
}

export type ScrapePayload = {
  listing?: {
    mls_number?: string;
    listed_price?: number | null;
    source?: string | null;
    tour_link?: string | null;
  };
  property?: {
    address?: string | null;
    city?: string | null;
    province?: string | null;
    postal_code?: string | null;
    subarea?: string | null;
    property_type?: string | null;
    zoning?: string | null;
    pid?: string | null;
    complex_name?: string | null;
    ownership_type?: string | null;
    outdoor_area?: string | null;
    property_disc?: string | null;
    fixtures_leased?: string | null;
    fixtures_rmvd?: string | null;
    distance_to?: string | null;
  };
  pricing?: {
    maintenance_fee?: number | null;
    gross_taxes?: number | null;
    tax_year?: string | null;
  };
  property_details?: {
    bedrooms?: number | null;
    bathrooms?: number | null;
    full_baths?: number | null;
    half_baths?: number | null;
    approx_year_built?: number | null;
    age?: number | null;
    style_of_home?: string | null;
    basement?: string | null;
    levels?: string | null;
    suite?: string | null;
  };
  lot?: {
    lot_dimensions?: string | null;
    frontage_ft?: string | null;
    lot_area?: string | null;
    flood_plain?: boolean | null;
    rear_yard_exposure?: string | null;
    view?: boolean | null;
    view_details?: string | null;
  };
  building?: {
    building_type?: string | null;
    construction_materials?: string[] | null;
    foundation?: string | null;
    roof_type?: string | null;
    floor_finish?: string | null;
    units_in_development?: number | null;
    total_units_in_strata?: number | null;
  };
  utilities?: {
    water_supply?: string | null;
    fuel_heating?: string[] | null;
    services_connected?: string[] | null;
  };
  parking?: {
    total?: number | null;
    covered?: string | null;
    features?: string[] | null;
    locker?: string | null;
  };
  counts?: {
    number_of_rooms?: number | null;
    number_of_kitchens?: number | null;
    rentals_allowed_percent?: number | null;
  };
  floor_area?: {
    finished_main_sqft?: number | null;
    finished_above_sqft?: number | null;
    finished_below_sqft?: number | null;
    finished_basement_sqft?: number | null;
    finished_total_sqft?: number | null;
    unfinished_sqft?: number | null;
    grand_total_sqft?: number | null;
  };
  pet_policy?: {
    restrictions?: string | null;
  };
  legal?: {
    legal_description?: string | null;
  };
  management?: {
    company?: string | null;
    phone?: string | null;
  };
  description?: string | null;
  amenities?: string[] | null;
  community_features?: string[] | null;
  appliances?: string[] | null;
  features?: string[] | null;
  room_list?: Array<{
    floor?: string | null;
    name?: string | null;
    dimensions?: string | null;
    pieces?: number | null;
    ensuite?: boolean | null;
  }> | null;
  fireplace?: {
    count?: number | null;
    fuel?: string[] | null;
  };
  size?: {
    total_sqft?: number | null;
    main_sqft?: number | null;
    above_sqft?: number | null;
    below_sqft?: number | null;
  };
};

/**
 * MLS public remarks for the sheet: scrape `description` first, then tour `listingDescription`.
 * Same string as the “Public Remarks” block on page 4.
 */
export function featureSheetPublicRemarksBody(
  listingDescription: string | null | undefined,
  scrape: ScrapePayload | null | undefined,
): string {
  return scrape?.description?.trim() || listingDescription?.trim() || "";
}

/**
 * P2 fallback when public remarks are empty: tour `listingDescription`, else legal from scrape.
 */
export function featureSheetP2BodyText(
  listingDescription: string | null | undefined,
  scrape: ScrapePayload | null,
): string {
  const fromListing = listingDescription?.trim() ?? "";
  if (fromListing) return fromListing;
  return (scrape?.legal?.legal_description ?? "").trim();
}

export function FeatureListingPage4Static({
  scrape = null,
  footerLogo,
  brandTextColor = "#374151",
  /** Sheet / editor line for page 4 Public Remarks — shown before MLS scrape `description`. */
  sheetListingDescription = null,
  /** When set (e.g. oversize preview), clamps Public Remarks to this height to align with cover image band. */
  publicRemarksMaxHeightPx,
  /** Oversize print preview: hide the Public Remarks block (remarks still in snapshot for other uses). */
  hidePublicRemarks = false,
  /** Tabloid oversize: tighter padding so MLS + remarks fit the 17″×11″ column. */
  compactOversize = false,
  /** Oversize tabloid: PDF-like section gaps, row rhythm, Arial/Helvetica stack. */
  oversizePdfSpacing = false,
}: {
  scrape?: ScrapePayload | null;
  footerLogo: string;
  /** Customer profile / sheet text colour (not hardcoded gray) */
  brandTextColor?: string;
  sheetListingDescription?: string | null;
  publicRemarksMaxHeightPx?: number;
  hidePublicRemarks?: boolean;
  compactOversize?: boolean;
  oversizePdfSpacing?: boolean;
}) {
  const listing = scrape?.listing ?? {};
  const property = scrape?.property ?? {};
  const pricing = scrape?.pricing ?? {};
  const details = scrape?.property_details ?? {};
  const lot = scrape?.lot ?? {};
  const building = scrape?.building ?? {};
  const utilities = scrape?.utilities ?? {};
  const parking = scrape?.parking ?? {};
  const counts = scrape?.counts ?? {};
  const floor = scrape?.floor_area ?? {};
  const pet = scrape?.pet_policy ?? {};
  const legal = scrape?.legal ?? {};
  const management = scrape?.management ?? {};

  const publicRemarksBody = featureSheetPublicRemarksBody(sheetListingDescription, scrape);
  const hasPublicRemarks =
    !hidePublicRemarks && Boolean((publicRemarksBody ?? "").trim());

  /** Dividers follow sheet text colour (not fixed gray) so dark/custom themes match PDF output. */
  const dividerStyle: CSSProperties = {
    border: 0,
    borderTop: `${oversizePdfSpacing ? "0.75" : "1"}px solid color-mix(in srgb, ${brandTextColor} ${oversizePdfSpacing ? "26" : "30"}%, transparent)`,
    margin: 0,
  };

  /** Tighter than full PDF print — short remarks (few lines) + no clipping. */
  const hrAfterHeader = oversizePdfSpacing ? "my-[4px]" : "my-2";
  const hrBetweenSections = oversizePdfSpacing ? "my-[6px]" : "my-4";

  const toDisplay = (v: unknown): string =>
    v == null || String(v).trim() === "" ? "-" : String(v);
  const formatSqft = (v: unknown): string => {
    if (v == null || String(v).trim() === "") return "-";
    const n = Number(String(v).replace(/,/g, ""));
    return Number.isFinite(n) ? `${n.toLocaleString()} sqft` : `${String(v)} sqft`;
  };
  const cleanScrapedAddress = (raw: string | null | undefined): string => {
    const s = (raw ?? "").trim();
    if (!s) return "";
    return s.replace(/^\w+\s+[\w/]+\s+/i, "").trim();
  };

  const headerMls = listing.mls_number ?? "-";
  const headerType = building.building_type || property.property_type || "-";
  const cleanAddress = cleanScrapedAddress(property.address);
  const cityProvPostal = [property.city, property.province, property.postal_code]
    .map((v) => (v ?? "").trim())
    .filter(Boolean)
    .join(" ");
  const cleanLower = cleanAddress.toLowerCase();
  const addCityProvPostal =
    cityProvPostal &&
    !cleanLower.includes((property.postal_code ?? "").toLowerCase()) &&
    !cleanLower.includes((property.city ?? "").toLowerCase());
  const headerAddress =
    [cleanAddress, addCityProvPostal ? cityProvPostal : ""].filter(Boolean).join(", ") || "-";
  const headerCityLine =
    (property.subarea ? `${property.subarea}, ` : "") +
    (property.postal_code ?? "-");
  const headerPrice =
    pricing.maintenance_fee != null && listing.listed_price == null
      ? undefined
      : listing.listed_price;
  const roomList = Array.isArray(scrape?.room_list) ? scrape.room_list : [];
  const roomRows = roomList.filter((r) => (r?.name ?? "").trim() !== "");
  const bathRows = roomList.filter((r) => r?.pieces != null);
  const viewTop = lot.view == null ? "-" : lot.view ? "Yes" : "No";
  const cleanViewDetails = (lot.view_details ?? "")
    .trim()
    .replace(/^yes\s*:?\s*/i, "")
    .trim();
  const viewMiddle =
    lot.view == null
      ? "-"
      : lot.view
        ? cleanViewDetails
          ? `Yes : ${cleanViewDetails}`
          : "Yes"
        : "No";
  return (
    <div
      className={`max-w-6xl w-full ${
        hasPublicRemarks || compactOversize ? "text-xs" : "text-base"
      } ${compactOversize ? "px-1 py-0.5" : "p-8"}`}
      style={{ color: brandTextColor, backgroundColor: "transparent" }}
    >
      <div
        className={`body-table-container ${oversizePdfSpacing && compactOversize ? "feature-sheet-p4-pdf-spacing" : ""}${
          !hasPublicRemarks ? " feature-sheet-p4-no-public-remarks" : ""
        }`}
      >
        {/* HEADER */}
        <table className="header-table t-header table w-full">
          <thead>
            <tr className="t-header-row">
              <td className="t-header-col-1 column-5 vertical-align-middle bold">
                {headerMls}
                <br />
                {headerType}
              </td>
              <td className="t-header-col-2 center vertical-align-middle bold">
                <span className="uppercase address">
                  {headerAddress}
                </span>
                <br />
                <span
                  className={
                    compactOversize
                      ? hasPublicRemarks
                        ? "text-[7px] leading-tight"
                        : "text-[9px] leading-snug"
                      : "text-sm leading-snug"
                  }
                >
                  {headerCityLine}
                </span>
              </td>
              <td className="t-header-col-3 right column-5 vertical-align-middle bold">
                Residential
                <br />
                <strong>
                  {headerPrice != null
                    ? `$${headerPrice.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}`
                    : "-"}
                </strong>{" "}
                (LP)
              </td>
            </tr>
          </thead>
        </table>

        <hr style={dividerStyle} className={hrAfterHeader} />

        {/* ROW 1 – Depth/Size / Beds/Baths / Taxes */}
        <table className="first-table table w-full">
          <tbody>
            <tr className="t-row-1">
              {/* LEFT */}
              <td className="t-row-1-col-1 vertical-align-top left column-3 sep-left">
                <table className="nested-Table w-full">
                  <tbody>
                    <tr>
                      <th>Lot Dimensions (ft):</th>
                      <td>{lot.lot_dimensions ?? "-"}</td>
                    </tr>
                    <tr>
                      <th>Frontage (ft):</th>
                      <td>{lot.frontage_ft ?? "-"}</td>
                    </tr>
                    <tr>
                      <th>Lot Area:</th>
                      <td>{toDisplay(lot.lot_area)}</td>
                    </tr>
                    <tr>
                      <th>Flood Plain:</th>
                      <td>
                        {lot.flood_plain == null
                          ? "-"
                          : lot.flood_plain
                          ? "Yes"
                          : "No"}
                      </td>
                    </tr>
                    <tr>
                      <th>Rear Yard Exp:</th>
                      <td>{toDisplay(lot.rear_yard_exposure)}</td>
                    </tr>
                    <tr>
                      <th>View:</th>
                      <td>{viewTop}</td>
                    </tr>
                  </tbody>
                </table>
              </td>

              {/* MIDDLE */}
              <td className="t-row-1-col-2 vertical-align-top left column-3 sep-middle">
                <table className="nested-Table w-full">
                  <tbody>
                    <tr>
                      <th>Bedrooms:</th>
                      <td>{details.bedrooms ?? "-"}</td>
                    </tr>
                    <tr>
                      <th>Bathrooms:</th>
                      <td>{details.bathrooms ?? "-"}</td>
                    </tr>
                    <tr>
                      <th>Full Baths:</th>
                      <td>{details.full_baths ?? "-"}</td>
                    </tr>
                    <tr>
                      <th>Half Baths:</th>
                      <td>{details.half_baths ?? "-"}</td>
                    </tr>
                    <tr>
                      <th>Maint. Fee:</th>
                      <td>
                        {pricing.maintenance_fee != null
                          ? pricing.maintenance_fee
                          : "-"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>

              {/* RIGHT */}
              <td className="t-row-1-col-3 vertical-align-top left column-3 sep-right">
                <table className="nested-Table w-full">
                  <tbody>
                    <tr>
                      <th>Approx. Year Built:</th>
                      <td>{details.approx_year_built ?? "-"}</td>
                    </tr>
                    <tr>
                      <th>Age:</th>
                      <td>{details.age ?? "-"}</td>
                    </tr>
                    <tr>
                      <th>Zoning:</th>
                      <td>{property.zoning ?? "-"}</td>
                    </tr>
                    <tr>
                      <th>Gross Taxes:</th>
                      <td>
                        {pricing.gross_taxes != null
                          ? `$${pricing.gross_taxes.toLocaleString()}`
                          : "-"}
                      </td>
                    </tr>
                    <tr>
                      <th>For Tax Year:</th>
                      <td>{pricing.tax_year ?? "-"}</td>
                    </tr>
                    <tr>
                      <th>P.I.D.:</th>
                      <td>{property.pid ?? "-"}</td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        <hr style={dividerStyle} className={hrBetweenSections} />

        {/* ROW 2 – Style / Parking / Title etc. (dynamic, '-' when missing) */}
        <table className="second-table table w-full">
          <tbody>
            <tr className="t-row-2">
              {/* LEFT */}
              <td className="t-row-2-col-1 column-2 vertical-align-top sep-left">
                <table className="nested-Table w-full">
                  <tbody>
                    <tr>
                      <th>Style of Home:</th>
                      <td>{details.style_of_home ?? "-"}</td>
                    </tr>
                    <tr>
                      <th>Construction Materials:</th>
                      <td>
                        {Array.isArray(building.construction_materials)
                          ? building.construction_materials.join(", ")
                          : building.construction_materials ?? "-"}
                      </td>
                    </tr>
                    <tr>
                      <th>Foundation:</th>
                      <td>{building.foundation ?? "-"}</td>
                    </tr>
                    <tr>
                      <th>Rain Screen:</th>
                      <td>-</td>
                    </tr>
                    <tr>
                      <th>Renovations:</th>
                      <td>-</td>
                    </tr>
                    <tr>
                      <th>No. of Fireplaces:</th>
                      <td>
                        {scrape?.fireplace?.count != null
                          ? `${scrape.fireplace.count}${
                              Array.isArray(scrape.fireplace.fuel) &&
                              scrape.fireplace.fuel.length > 0
                                ? ` - Fuel: ${scrape.fireplace.fuel.join(", ")}`
                                : ""
                            }`
                          : "-"}
                      </td>
                    </tr>
                    <tr>
                      <th>Water Supply:</th>
                      <td>{utilities.water_supply ?? "-"}</td>
                    </tr>
                    <tr>
                      <th>Fuel/Heating:</th>
                      <td>
                        {Array.isArray(utilities.fuel_heating)
                          ? utilities.fuel_heating.join(", ")
                          : utilities.fuel_heating ?? "-"}
                      </td>
                    </tr>
                    <tr>
                      <th>Outdoor Area:</th>
                      <td>{toDisplay(property.outdoor_area)}</td>
                    </tr>
                    <tr>
                      <th>Type of Roof:</th>
                      <td>{building.roof_type ?? "-"}</td>
                    </tr>
                    <tr>
                      <th>Floor Finish:</th>
                      <td>{building.floor_finish ?? "-"}</td>
                    </tr>
                  </tbody>
                </table>
              </td>

              {/* RIGHT */}
              <td className="t-row-2-col-2 column-2 vertical-align-top sep-right">
                <table className="nested-Table w-full">
                  <tbody>
                    <tr>
                      <th>Parking:</th>
                      <td>
                        Total: {parking.total != null ? parking.total : "-"}
                      </td>
                    </tr>
                    <tr>
                      <th>Covered Parking:</th>
                      <td>{parking.covered ?? "-"}</td>
                    </tr>
                    <tr>
                      <th>Parking Features:</th>
                      <td>
                        {Array.isArray(parking.features)
                          ? parking.features.join(", ")
                          : parking.features ?? "-"}
                      </td>
                    </tr>
                    <tr>
                      <th>Locker:</th>
                      <td>{parking.locker ?? "-"}</td>
                    </tr>
                    <tr>
                      <th>Units in Dev:</th>
                      <td>
                        {(building.units_in_development ??
                          "-") + " - Total Units in Strata: " +
                          (building.total_units_in_strata ?? "-")}
                      </td>
                    </tr>
                    <tr>
                      <th>Distance to:</th>
                      <td>{toDisplay(property.distance_to)}</td>
                    </tr>
                    <tr>
                      <th>Title to Land:</th>
                      <td>{property.ownership_type ?? "-"}</td>
                    </tr>
                    <tr>
                      <th>Property Disc:</th>
                      <td>{toDisplay(property.property_disc)}</td>
                    </tr>
                    <tr>
                      <th>PAD Rental:</th>
                      <td>-</td>
                    </tr>
                    <tr>
                      <th>Fixtures Leased:</th>
                      <td>{toDisplay(property.fixtures_leased)}</td>
                    </tr>
                    <tr>
                      <th>Fixtures Rmvd:</th>
                      <td>{toDisplay(property.fixtures_rmvd)}</td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        <hr style={dividerStyle} className={hrBetweenSections} />

        {/* ROW 3 – View / Mgmt / Legal / Amenities */}
        <table className="third-table table w-full">
          <tbody>
            <tr>
              <td>
                <table className="nested-Table w-full">
                  <tbody>
                    <tr>
                      <th>View:</th>
                      <td>{viewMiddle}</td>
                    </tr>
                    <tr>
                      <th>Mgmt. Company:</th>
                      <td>
                        {management.company
                          ? management.phone
                            ? `${management.company} - ${management.phone}`
                            : management.company
                          : ""}
                      </td>
                    </tr>
                    <tr>
                      <th>Complex / Subdiv:</th>
                      <td>{property.complex_name ?? ""}</td>
                    </tr>
                    <tr>
                      <th>Services Connected:</th>
                      <td>
                        {Array.isArray(utilities.services_connected)
                          ? utilities.services_connected.join(", ")
                          : utilities.services_connected ?? ""}
                      </td>
                    </tr>
                    <tr>
                      <th>Legal:</th>
                      <td>{legal.legal_description ?? ""}</td>
                    </tr>
                    <tr>
                      <th>Amenities:</th>
                      <td>
                        {Array.isArray(scrape?.amenities)
                          ? (scrape!.amenities as string[]).join(", ")
                          : ""}
                      </td>
                    </tr>
                    <tr>
                      <th>Site Influences:</th>
                      <td>
                        {Array.isArray(scrape?.community_features)
                          ? (scrape!.community_features as string[]).join(", ")
                          : ""}
                      </td>
                    </tr>
                    <tr>
                      <th>Features:</th>
                      <td>
                        {Array.isArray(scrape?.appliances)
                          ? (scrape!.appliances as string[]).join(", ")
                          : Array.isArray(scrape?.features)
                            ? (scrape!.features as string[]).join(", ")
                          : ""}
                      </td>
                    </tr>
                    <tr>
                      <th>Bylaw Restric:</th>
                      <td>{pet.restrictions ?? ""}</td>
                    </tr>
                    <tr>
                      <th>Listing Broker(s):</th>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        <hr style={dividerStyle} className={hrBetweenSections} />

        {/* ROW 4 – Floor / Type / Dimensions (dynamic or empty) */}
        {(() => {
          const mid = Math.ceil(roomRows.length / 2);
          const leftRooms = roomRows.slice(0, mid);
          const rightRooms = roomRows.slice(mid);
          return (
        <table className="fourth-table table w-full">
          <tbody>
            <tr>
              <td className="t-row-4-col-1 column-2 vertical-align-top sep-left">
                <table className="nested-Table w-full">
                  <tbody>
                    <tr>
                      <th>Floor</th>
                      <th>Type</th>
                      <th>Dimensions</th>
                    </tr>
                    {leftRooms.length > 0 ? (
                      leftRooms.map((r, i) => (
                        <tr key={`r-l-${i}`}>
                          <td>{toDisplay(r.floor)}</td>
                          <td>{toDisplay(r.name)}</td>
                          <td>{toDisplay(r.dimensions)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td>-</td>
                        <td>-</td>
                        <td>-</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </td>
              <td className="t-row-4-col-2 column-2 sep-right vertical-align-top">
                <table className="nested-Table w-full">
                  <tbody>
                    <tr>
                      <th>Floor</th>
                      <th>Type</th>
                      <th>Dimensions</th>
                    </tr>
                    {rightRooms.length > 0 ? (
                      rightRooms.map((r, i) => (
                        <tr key={`r-r-${i}`}>
                          <td>{toDisplay(r.floor)}</td>
                          <td>{toDisplay(r.name)}</td>
                          <td>{toDisplay(r.dimensions)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td>-</td>
                        <td>-</td>
                        <td>-</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
          );
        })()}

        <hr style={dividerStyle} className={hrBetweenSections} />

        {/* ROW 5 – Finished floor / rooms / bathrooms (dynamic) */}
        <table className="fifth-table table w-full">
          <tbody>
            <tr>
              {/* LEFT */}
              <td className="t-row-5-col-1 vertical-align-top column-3 sep-left">
                <table className="nested-Table w-full">
                  <tbody>
                    <tr>
                      <th>Finished Floor (Main):</th>
                      <td>{formatSqft(floor.finished_main_sqft)}</td>
                    </tr>
                    <tr>
                      <th>Finished Floor (Above):</th>
                      <td>{formatSqft(floor.finished_above_sqft)}</td>
                    </tr>
                    <tr>
                      <th>Finished Floor (Below):</th>
                      <td>{formatSqft(floor.finished_below_sqft)}</td>
                    </tr>
                    <tr>
                      <th>Finished Floor (Bsmt):</th>
                      <td>{formatSqft(floor.finished_basement_sqft)}</td>
                    </tr>
                    <tr>
                      <th>Finished Floor (Total):</th>
                      <td>{formatSqft(floor.finished_total_sqft)}</td>
                    </tr>
                    <tr>
                      <th>Unfinished Floor:</th>
                      <td>{formatSqft(floor.unfinished_sqft)}</td>
                    </tr>
                    <tr>
                      <th>Grand Total:</th>
                      <td>{formatSqft(floor.grand_total_sqft)}</td>
                    </tr>
                  </tbody>
                </table>
              </td>

              {/* MIDDLE */}
              <td className="t-row-5-col-2 vertical-align-top column-3 sep-middle">
                <table className="nested-Table w-full">
                  <tbody>
                    <tr>
                      <th>No. of Rooms:</th>
                      <td>{counts.number_of_rooms ?? "-"}</td>
                    </tr>
                    <tr>
                      <th>No. of Kitchens:</th>
                      <td>{counts.number_of_kitchens ?? "-"}</td>
                    </tr>
                    <tr>
                      <th>No. of Levels:</th>
                      <td>{details.levels ?? "-"}</td>
                    </tr>
                    <tr>
                      <th>Crawl/Bsmt Height:</th>
                      <td></td>
                    </tr>
                    <tr>
                      <th>Basement:</th>
                      <td>{details.basement ?? "-"}</td>
                    </tr>
                    <tr>
                      <th>Suite:</th>
                      <td>{toDisplay(details.suite)}</td>
                    </tr>
                    <tr>
                      <th>No. or % of Rentals Allowed:</th>
                      <td>{counts.rentals_allowed_percent ?? "-"}</td>
                    </tr>
                    <tr>
                      <th>Pets Allowed:</th>
                      <td>{pet.restrictions ?? "-"}</td>
                    </tr>
                  </tbody>
                </table>
              </td>

              {/* RIGHT */}
              <td className="t-row-5-col-3 vertical-align-top column-3 sep-right">
                <table className="nested-Table w-full">
                  <tbody>
                    <tr>
                      <th>Bathroom Floor</th>
                      <th>No. of Pieces</th>
                      <th>Ensuite?</th>
                    </tr>
                    {bathRows.length > 0 ? (
                      bathRows.map((r, i) => (
                        <tr key={`bath-${i}`}>
                          <td>{toDisplay(r.floor)}</td>
                          <td>{toDisplay(r.pieces)}</td>
                          <td>
                            {r.ensuite == null ? "-" : r.ensuite ? "Yes" : "No"}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td>-</td>
                        <td>-</td>
                        <td>-</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>



        {/* STATEMENT BEFORE FOOTER */}
      

        <hr
          style={dividerStyle}
          className={`${hrBetweenSections}${!hasPublicRemarks && oversizePdfSpacing ? " mb-[10px]" : !hasPublicRemarks ? " mb-6" : ""}`}
        />

        {!hidePublicRemarks && publicRemarksBody ? (
          <div className="body-table-container feature-sheet-public-remarks mb-0.5">
            <table className="nested-Table w-full">
              <tbody>
                <tr>
                
                  <td className="align-top vertical-align-top">
                    <div
                      className={
                        compactOversize
                          ? "min-h-0 whitespace-pre-line text-justify text-[7px] leading-normal"
                          : "min-h-0 whitespace-pre-line text-justify text-xs leading-snug"
                      }
                      style={
                        publicRemarksMaxHeightPx != null
                          ? {
                              maxHeight: publicRemarksMaxHeightPx,
                              overflowY: "auto",
                              color: brandTextColor,
                            }
                          : { color: brandTextColor }
                      }
                    >
                      {publicRemarksBody}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}

        {/* FOOTER */}
        <table
          className={`footer-table footer table w-full${!hasPublicRemarks ? " mt-4" : ""}`}
        >
          <tfoot>
            <tr>
              <td
                width="40%"
                className="t-footer-col-1"
                style={{ textAlign: "left", fontSize: "9px" }}
              >
                <img
                  src={footerLogo}
                  className="logo max-w-full"
                  data-pdf-cotala-footer-logo
                  style={{
                    width: "auto",
                    maxWidth: "88px",
                    height: "auto",
                    marginBottom: "3px",
                    display: "block",
                  }}
                  alt="Cotala"
                />
                <span data-pdf-footer-credit>Produced and printed by Cotala Cross-Media Inc.</span>
              </td>
              <td
                width="60%"
                className="t-footer-col-2"
                style={{
                  textAlign: "right",
                  fontSize: compactOversize ? "7px" : "8px",
                  color: brandTextColor,
                  fontStyle: "italic",
                }}
              >
                The enclosed information while deemed to be correct, is not guaranteed.
                Information and measurements should not be relied upon without independent
                verification. PREC* indicates &apos;Personal Real Estate
                Corporation&apos;. This communication is not intended to solicit
                properties already listed for sale.
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export type FeatureListingSheetsPreviewProps = {
  tourId: string;
  pageBgColor: string;
  pageTextColor: string;
  listingAddress: string;
  coverImage: string;
  primaryImages: string[];
  secondaryImages: string[];
  agentName: string;
  agentPhone: string;
  agentEmail: string;
  agentWebsite: string;
  agentHeadshot: string | null;
  agentLogo: string | null;
  price: string | null;
  listingDescription: string | null;
  maintFee: string;
  size: string;
  bedrooms: string;
  bathrooms: string;
  tax: string;
  scrapeData: ScrapePayload | null;
  onCoverClick?: (url: string) => void;
};

export function FeatureListingSheetsPreview({
  tourId,
  pageBgColor,
  pageTextColor,
  listingAddress,
  coverImage,
  primaryImages,
  secondaryImages,
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
  onCoverClick,
}: FeatureListingSheetsPreviewProps) {
  const handleCover = () => {
    if (coverImage && onCoverClick) onCoverClick(coverImage);
  };

  const bleed: CSSProperties = { padding: "3mm", boxSizing: "border-box" };

  /** Same inner padding + minimum block height so sheet “pages” 1–4 read as one size family (not squat on 1 & 4). */
  const sheetPageInnerClass =
    "p-8 min-h-[42rem] md:min-h-[46rem] flex flex-col box-border";

  const cotalaFooterSrc = pickCotalaFooterLogoForTextColor(pageTextColor);
  const p2BodyText = featureSheetP2BodyText(listingDescription, scrapeData);
  const publicRemarksBody = featureSheetPublicRemarksBody(listingDescription, scrapeData);
  /** P2 main copy matches page 4 Public Remarks when present; otherwise tour description / legal. */
  const p2SheetBlockText = publicRemarksBody || p2BodyText;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 shadow-2xl">
      <div className="max-w-6xl w-full" style={{ backgroundColor: pageBgColor }}>
        <div style={bleed}>
          <div className={sheetPageInnerClass}>
        <div className="mb-8 shrink-0 text-center" style={{ color: pageTextColor }}>
          <p className="text-lg opacity-70">Welcome to</p>
          <h1 className="text-2xl font-semibold tracking-wide">{listingAddress}</h1>
        </div>
        <div className="mb-8 flex min-h-0 flex-1 items-stretch gap-2">
          <span className="shrink-0 pt-1 text-xs font-bold text-slate-500">P1</span>
          {coverImage ? (
            <div
              className={`relative aspect-[4/3] min-h-0 min-w-0 flex-1 overflow-hidden ${onCoverClick ? "cursor-pointer" : ""}`}
              onClick={onCoverClick ? handleCover : undefined}
              role={onCoverClick ? "button" : undefined}
              tabIndex={onCoverClick ? 0 : undefined}
            >
              <img
                src={coverImage}
                className="absolute inset-0 h-full w-full object-cover"
                alt="Property"
              />
            </div>
          ) : (
            <div className="flex aspect-[4/3] min-h-[12rem] min-w-0 flex-1 items-center justify-center bg-slate-300 text-sm text-slate-600">
              Property Image
            </div>
          )}
        </div>
        <div
          className="mt-auto grid shrink-0 grid-cols-[100px_1fr_100px] items-center gap-1"
          style={{ color: pageTextColor }}
        >
          <div className="flex justify-start">
            {agentHeadshot?.trim() ? (
              <img
                src={agentHeadshot}
                className="h-20 w-20 rounded-full object-cover"
                alt="Agent"
              />
            ) : (
              <div
                className="h-20 w-20 shrink-0 rounded-full bg-slate-200/70"
                aria-label="No agent photo"
              />
            )}
          </div>
          <div className="text-center">
            <h2 className="mb-2 text-2xl font-semibold" style={{ color: pageTextColor }}>
              {agentName}
            </h2>
            <p className="text-lg" style={{ color: pageTextColor, opacity: 0.92 }}>
              {agentPhone}
            </p>
            <p className="text-lg" style={{ color: pageTextColor, opacity: 0.92 }}>
              {agentEmail}
            </p>
            <p className="text-lg" style={{ color: pageTextColor, opacity: 0.92 }}>
              {agentWebsite}
            </p>
          </div>
          <div className="flex justify-end">
            <img
              src={agentLogo?.trim() || readFeatureSheetAgentBrokerageLogoUrl() || royalLePageImg}
              className="h-20 w-20 object-contain"
              alt="Brokerage"
            />
          </div>
        </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl w-full" style={{ backgroundColor: pageBgColor, color: pageTextColor }}>
        <div style={bleed}>
          <div className={sheetPageInnerClass}>
        <h1 className="mb-3 text-lg leading-tight">{listingAddress}</h1>
        <div className="mb-3 flex items-end gap-3">
          <span className="text-xs uppercase opacity-70">Listed For</span>
          <span className="text-xl font-semibold tabular-nums">
            {price ? `$${Number(price).toLocaleString()}` : "—"}
          </span>
        </div>
        <div
          data-pdf-export="listing-description"
          className="mb-5 min-h-[7.5rem] max-h-[9.5rem] overflow-y-auto whitespace-pre-line text-justify text-xs leading-snug"
          aria-label="Public remarks when available; otherwise tour description or legal description"
        >
          {p2SheetBlockText ? p2SheetBlockText : "\u00a0"}
        </div>
        <div className="mb-8 border-t border-b py-3 text-[10px] leading-snug tracking-wide opacity-80">
          <div className="flex flex-wrap gap-3">
            <span>
              MAINT FEE <b>{maintFee && maintFee.trim() !== "" ? maintFee : "-"}</b>
            </span>
            <span>|</span>
            <span>
              SIZE <b>{size && size.trim() !== "" ? `${size} SF` : "-"}</b>
            </span>
            <span>|</span>
            <span>{bedrooms && bedrooms.trim() !== "" ? bedrooms : "-"} BED</span>
            <span>|</span>
            <span>{bathrooms && bathrooms.trim() !== "" ? bathrooms : "-"} BATH</span>
            <span>|</span>
            <span>
              TAXES <b>{tax && tax.trim() !== "" ? tax : "-"}</b>
            </span>
          </div>
        </div>

        <div className="mb-4 flex min-w-0 items-start gap-2">
          <span className="shrink-0 pt-1 text-xs font-bold text-slate-500">P2</span>
          {primaryImages[0] ? (
            <div className="relative aspect-[5/3] min-h-0 min-w-0 flex-1 overflow-hidden">
              <img
                src={primaryImages[0]}
                className="absolute inset-0 h-full w-full object-cover"
                alt="Interior main"
              />
            </div>
          ) : (
            <div className="flex aspect-[5/3] min-h-[10rem] min-w-0 flex-1 items-center justify-center bg-slate-300 text-xs text-slate-600">
              Interior Image
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => {
            const url = primaryImages[i];
            const slotNum = i + 2;
            return (
              <div key={i} className="flex min-w-0 items-start gap-2">
                <span className="shrink-0 pt-1 text-xs font-bold text-slate-500">P{slotNum}</span>
                {url ? (
                  <div className="relative aspect-square min-h-0 min-w-0 flex-1 overflow-hidden">
                    <img src={url} className="absolute inset-0 h-full w-full object-cover" alt="" />
                  </div>
                ) : (
                  <div className="flex aspect-square min-h-0 min-w-0 flex-1 items-center justify-center bg-slate-300 text-xs text-slate-500">
                    Image
                  </div>
                )}
              </div>
            );
          })}
        </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl w-full" style={{ backgroundColor: pageBgColor, color: pageTextColor }}>
        <div style={bleed}>
          <div className={sheetPageInnerClass}>
        <div className="mb-6 flex min-w-0 items-start gap-2">
          <span className="shrink-0 pt-1 text-xs font-bold text-slate-500">P6</span>
          <div className="relative aspect-[21/9] min-h-[10rem] min-w-0 flex-1 overflow-hidden">
            {primaryImages[4]?.trim() ? (
              <img
                src={primaryImages[4]}
                className="absolute inset-0 h-full w-full object-cover"
                alt="Hero"
              />
            ) : (
              <div className="flex h-full min-h-[10rem] w-full items-center justify-center bg-slate-300 text-xs text-slate-500">
                Hero
              </div>
            )}
            <div
              className="absolute right-0 top-0 flex min-w-[7.5rem] flex-col items-center px-3 py-3 text-center shadow-md"
              style={{ backgroundColor: pageBgColor, color: pageTextColor }}
            >
              <div className="mb-2 flex h-20 w-20 shrink-0 items-center justify-center">
                <QRCode
                  value={`https://www.cotala.com/${tourId}`}
                  size={80}
                  quietZone={2}
                  bgColor="#FFFFFF"
                  fgColor="#000000"
                  qrStyle="squares"
                />
              </div>
              <p className="w-full text-xs font-semibold" style={{ color: pageTextColor, opacity: 0.95 }}>
                TAKE THE TOUR
              </p>
              <p className="w-full text-xs" style={{ color: pageTextColor, opacity: 0.75 }}>
                cotala.com/{tourId}
              </p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 9 }, (_, idx) => {
            const slotNum = idx + 7;
            let url: string | undefined;
            if (idx === 0) {
              url = primaryImages[5];
            } else {
              const secIndex = idx - 1;
              url = secondaryImages[secIndex];
            }
            return (
              <div key={idx} className="flex min-w-0 items-start gap-2">
                <span className="shrink-0 pt-1 text-xs font-bold text-slate-500">P{slotNum}</span>
                {url ? (
                  <div className="relative aspect-square min-h-0 min-w-0 flex-1 overflow-hidden">
                    <img src={url} className="absolute inset-0 h-full w-full object-cover" alt="" />
                  </div>
                ) : (
                  <div className="flex aspect-square min-h-0 min-w-0 flex-1 items-center justify-center bg-slate-300 text-xs text-slate-500">
                    Photo
                  </div>
                )}
              </div>
            );
          })}
        </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl w-full" style={{ backgroundColor: pageBgColor, color: pageTextColor }}>
        <div style={bleed}>
          <div className="min-h-[42rem] w-full box-border md:min-h-[46rem]">
            <FeatureListingPage4Static
              scrape={scrapeData ?? undefined}
              footerLogo={cotalaFooterSrc}
              brandTextColor={pageTextColor}
              sheetListingDescription={listingDescription}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export const FEATURE_LISTING_FINAL_SNAPSHOT_KEY = "cotala_feature_listing_final_snapshot";

function finalSnapshotStorageKey(tourId: string): string {
  return `${FEATURE_LISTING_FINAL_SNAPSHOT_KEY}_${tourId}`;
}

/** Same-tab + survives some private modes; written on Finished Editing alongside localStorage. */
function oversizeSessionSnapshotKey(tourId: string): string {
  return `cotala_feature_listing_oversize_snap_v1_${tourId}`;
}

export type FeatureListingFinalSnapshot = {
  version: 1;
  tourId: string;
  pageBgColor: string;
  pageTextColor: string;
  listingAddress: string;
  coverImage: string;
  primaryImages: string[];
  secondaryImages: string[];
  agentName: string;
  agentPhone: string;
  agentEmail: string;
  agentWebsite: string;
  agentHeadshot: string | null;
  agentLogo: string | null;
  price: string | null;
  listingDescription: string | null;
  maintFee: string;
  size: string;
  bedrooms: string;
  bathrooms: string;
  tax: string;
  scrapeData: ScrapePayload | null;
};

/** Same-tab listeners (e.g. Oversize page already open) can refresh preview after save. */
export const FEATURE_LISTING_SNAPSHOT_SAVED_EVENT = "cotala:featureListingSnapshotSaved";

const MAX_LISTING_DESCRIPTION_CHARS = 12_000;
const MAX_SCRAPE_DESCRIPTION_CHARS = 10_000;
const MAX_SCRAPE_LEGAL_CHARS = 6_000;
/** Stay under ~4MB string length; browsers often cap localStorage ~5MB per origin. */
const MAX_SNAPSHOT_JSON_CHARS = 900_000;

function truncate(str: string | null | undefined, max: number): string | null {
  if (str == null) return null;
  if (str.length <= max) return str;
  return `${str.slice(0, max)}…`;
}

function compactScrapeForStorage(s: ScrapePayload | null): ScrapePayload | null {
  if (!s) return null;
  return {
    ...s,
    description: truncate(s.description ?? null, MAX_SCRAPE_DESCRIPTION_CHARS),
    legal: s.legal?.legal_description
      ? {
          legal_description: truncate(s.legal.legal_description, MAX_SCRAPE_LEGAL_CHARS) ?? "",
        }
      : s.legal,
    amenities: Array.isArray(s.amenities) ? s.amenities.slice(0, 50) : s.amenities,
    community_features: Array.isArray(s.community_features)
      ? s.community_features.slice(0, 50)
      : s.community_features,
    features: Array.isArray(s.features) ? s.features.slice(0, 80) : s.features,
  };
}

/** Shrink snapshot JSON so Finished Editing / session cache stay under storage quotas. */
export function compactFeatureListingSnapshotForStorage(
  data: FeatureListingFinalSnapshot,
): FeatureListingFinalSnapshot {
  const listingDescription = truncate(
    data.listingDescription ?? null,
    MAX_LISTING_DESCRIPTION_CHARS,
  );
  let scrapeData = compactScrapeForStorage(data.scrapeData);
  let out: FeatureListingFinalSnapshot = {
    ...data,
    listingDescription,
    scrapeData,
    primaryImages: Array.isArray(data.primaryImages) ? data.primaryImages.slice(0, 16) : [],
    secondaryImages: Array.isArray(data.secondaryImages) ? data.secondaryImages.slice(0, 16) : [],
  };
  let json = JSON.stringify(out);
  if (json.length > MAX_SNAPSHOT_JSON_CHARS) {
    out = { ...out, scrapeData: null };
    json = JSON.stringify(out);
  }
  if (json.length > MAX_SNAPSHOT_JSON_CHARS) {
    out = {
      ...out,
      primaryImages: out.primaryImages.slice(0, 8),
      secondaryImages: out.secondaryImages.slice(0, 8),
      listingDescription: truncate(out.listingDescription, 4000),
    };
    json = JSON.stringify(out);
  }
  return out;
}

function evictListingLocalStorageKeys(neverRemove: Set<string>): void {
  if (typeof localStorage === "undefined") return;
  const prefixes = [
    "cotala_feature_listing_cache_v2_",
    "cotala_feature_listing_final_snapshot_",
  ];
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || neverRemove.has(k)) continue;
    if (prefixes.some((p) => k.startsWith(p))) keys.push(k);
  }
  for (const k of keys) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}

const LS_AUTH_KEYS = new Set(["cotala_token", "cotala_user_id", "cotala_user"]);

/** Last resort: drop other `cotala_*` keys (e.g. MLX cache) but never auth/session keys. */
function evictAllCotalaLocalStorageExcept(neverRemove: Set<string>): void {
  if (typeof localStorage === "undefined") return;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || neverRemove.has(k) || LS_AUTH_KEYS.has(k)) continue;
    if (k.startsWith("cotala_")) keys.push(k);
  }
  for (const k of keys) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}

function trySetLocalStorage(key: string, value: string, neverRemove: Set<string>): boolean {
  const write = () => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  };
  if (write()) return true;
  evictListingLocalStorageKeys(neverRemove);
  if (write()) return true;
  evictAllCotalaLocalStorageExcept(neverRemove);
  return write();
}

function evictOversizeSessionKeys(keepTourId: string): void {
  if (typeof sessionStorage === "undefined") return;
  const keep = oversizeSessionSnapshotKey(keepTourId);
  const keys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    if (!k || k === keep) continue;
    if (k.startsWith("cotala_feature_listing_oversize_snap_v1_")) keys.push(k);
  }
  for (const k of keys) {
    try {
      sessionStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}

function evictAllCotalaSessionExcept(neverRemove: Set<string>): void {
  if (typeof sessionStorage === "undefined") return;
  const keys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    if (!k || neverRemove.has(k)) continue;
    if (k.startsWith("cotala_")) keys.push(k);
  }
  for (const k of keys) {
    try {
      sessionStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}

function trySetSessionStorage(key: string, value: string, tourId: string): boolean {
  const neverRemove = new Set([key]);
  const write = () => {
    try {
      sessionStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  };
  if (write()) return true;
  evictOversizeSessionKeys(tourId);
  if (write()) return true;
  evictAllCotalaSessionExcept(neverRemove);
  return write();
}

export function persistFeatureListingFinalSnapshot(data: FeatureListingFinalSnapshot): void {
  const tid = String(data.tourId ?? "").trim();
  if (!tid) {
    console.warn("persistFeatureListingFinalSnapshot: missing tourId, not saving");
    return;
  }
  const payload: FeatureListingFinalSnapshot = { ...data, tourId: tid, version: 1 };
  const compact = compactFeatureListingSnapshotForStorage(payload);
  const json = JSON.stringify(compact);
  const perTourKey = finalSnapshotStorageKey(tid);
  const neverRemove = new Set([perTourKey, FEATURE_LISTING_FINAL_SNAPSHOT_KEY]);

  const lsPerOk = trySetLocalStorage(perTourKey, json, neverRemove);
  if (!lsPerOk) {
    console.error("persistFeatureListingFinalSnapshot: could not write per-tour localStorage after eviction");
  }
  if (!trySetLocalStorage(FEATURE_LISTING_FINAL_SNAPSHOT_KEY, json, neverRemove)) {
    console.error("persistFeatureListingFinalSnapshot: could not write legacy localStorage after eviction");
  }
  const sessKey = oversizeSessionSnapshotKey(tid);
  if (!trySetSessionStorage(sessKey, json, tid)) {
    console.error("persistFeatureListingFinalSnapshot: could not write sessionStorage after eviction");
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(FEATURE_LISTING_SNAPSHOT_SAVED_EVENT, { detail: { tourId: tid } }),
    );
  }
}

export function readFeatureListingFinalSnapshot(tourId: string): FeatureListingFinalSnapshot | null {
  const tid = String(tourId).trim();
  if (!tid) return null;

  const normalize = (parsed: FeatureListingFinalSnapshot): FeatureListingFinalSnapshot => ({
    ...parsed,
    version: 1,
    tourId: tid,
  });

  const tryParse = (raw: string | null): FeatureListingFinalSnapshot | null => {
    if (!raw?.trim()) return null;
    try {
      const parsed = JSON.parse(raw) as FeatureListingFinalSnapshot;
      if (!parsed || typeof parsed !== "object") return null;
      return normalize(parsed);
    } catch {
      return null;
    }
  };

  try {
    // 1) Per-tour localStorage — key is authoritative; inner tourId may be missing or stale.
    const fromLsTour = tryParse(localStorage.getItem(finalSnapshotStorageKey(tid)));
    if (fromLsTour) return fromLsTour;

    // 2) Same-tab mirror from Finished Editing (sessionStorage).
    if (typeof window !== "undefined") {
      const fromSession = tryParse(sessionStorage.getItem(oversizeSessionSnapshotKey(tid)));
      if (fromSession) return fromSession;
    }

    // 3) Legacy global key — only if JSON tour matches URL (shared across tours).
    const raw = localStorage.getItem(FEATURE_LISTING_FINAL_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FeatureListingFinalSnapshot;
    if (!parsed || typeof parsed !== "object") return null;
    if (String(parsed.tourId ?? "") !== tid) return null;
    return normalize(parsed);
  } catch {
    return null;
  }
}
