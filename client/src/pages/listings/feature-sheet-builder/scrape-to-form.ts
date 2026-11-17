import type { ScrapePayload } from "../feature-listing-preview";
import { featureSheetPublicRemarksBody } from "../feature-listing-preview";
import type { BathRow, FeatureSheetFormState, RoomRow } from "./render-panels";

function cleanScrapedAddress(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  const streetMatch = s.match(
    /(\d+\s+[\dA-Za-z/.'-]*(?:\s+(?:AVENUE|AVE|STREET|ST|ROAD|RD|DRIVE|DR|WAY|BLVD|BOULEVARD|CRESCENT|CR|LANE|LN|PLACE|PL|COURT|CT|TRAIL|GROVE|PARADE|TERRACE|CRES|HWY|HIGHWAY)[^,]*(?:,.*)?))$/i,
  );
  if (streetMatch) return streetMatch[1].trim();
  return s.replace(/^\w+\s+[\w/]+\s+/i, "").trim();
}

function asTrimmedString(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function formatSqftNumber(v: unknown): string {
  if (v == null || String(v).trim() === "") return "";
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n.toLocaleString() : String(v);
}

function joinList(items: unknown): string {
  if (Array.isArray(items)) return items.filter(Boolean).join(", ");
  if (typeof items === "string") return items.trim();
  return "";
}

function yesNo(v: boolean | null | undefined): string {
  if (v == null) return "";
  return v ? "Yes" : "No";
}

function formatTax(pricing: ScrapePayload["pricing"]): string {
  if (pricing?.gross_taxes != null) {
    return `$${Number(pricing.gross_taxes).toLocaleString()}`;
  }
  return "";
}

function formatMaint(pricing: ScrapePayload["pricing"]): string {
  if (pricing?.maintenance_fee != null) {
    return `$${Number(pricing.maintenance_fee).toLocaleString()}`;
  }
  return "";
}

function mapRooms(scrape: ScrapePayload): RoomRow[] {
  const list = Array.isArray(scrape.room_list) ? scrape.room_list : [];
  return list
    .filter((r) => asTrimmedString(r?.name) !== "")
    .map((r) => ({
      f: asTrimmedString(r.floor),
      r: asTrimmedString(r.name),
      d: asTrimmedString(r.dimensions),
    }));
}

function mapBaths(scrape: ScrapePayload): BathRow[] {
  const list = Array.isArray(scrape.room_list) ? scrape.room_list : [];
  return list
    .filter((r) => r?.pieces != null)
    .map((r) => ({
      f: asTrimmedString(r.floor),
      pieces: r.pieces != null ? String(r.pieces) : "",
      ensuite: r.ensuite == null ? "" : r.ensuite ? "Yes" : "No",
    }));
}

function mapHighlights(scrape: ScrapePayload): string[] {
  const fromFeatures = (scrape.features ?? []).filter(Boolean).slice(0, 6);
  if (fromFeatures.length) return fromFeatures as string[];
  const fromAmenities = (scrape.amenities ?? []).filter(Boolean).slice(0, 6);
  return fromAmenities as string[];
}

function formatFireplaces(scrape: ScrapePayload): string {
  const fp = scrape.fireplace;
  if (fp?.count == null) return "";
  const fuel =
    Array.isArray(fp.fuel) && fp.fuel.length > 0 ? ` - Fuel: ${fp.fuel.join(", ")}` : "";
  return `${fp.count}${fuel}`;
}

function formatUnits(building: ScrapePayload["building"]): string {
  if (!building) return "";
  const a = building.units_in_development;
  const b = building.total_units_in_strata;
  if (a == null && b == null) return "";
  return `${a ?? "-"} - Total Units in Strata: ${b ?? "-"}`;
}

function formatViewDetails(lot: ScrapePayload["lot"]): string {
  if (!lot || lot.view == null) return "";
  if (!lot.view) return "No";
  const clean = asTrimmedString(lot.view_details).replace(/^yes\s*:?\s*/i, "").trim();
  return clean ? `Yes : ${clean}` : "Yes";
}

function formatMgmt(management: ScrapePayload["management"]): string {
  if (!management?.company) return "";
  return management.phone
    ? `${management.company} - ${management.phone}`
    : management.company;
}

/** Map MLS scrape payload → feature sheet builder form (same fields as FeatureListingPage4Static). */
export function scrapeToFormFields(
  scrape: ScrapePayload | null | undefined,
): Partial<FeatureSheetFormState> {
  if (!scrape) return {};

  const listing = scrape.listing ?? {};
  const property = scrape.property ?? {};
  const pricing = scrape.pricing ?? {};
  const details = scrape.property_details ?? {};
  const lot = scrape.lot ?? {};
  const building = scrape.building ?? {};
  const utilities = scrape.utilities ?? {};
  const parking = scrape.parking ?? {};
  const floor = scrape.floor_area ?? {};
  const size = scrape.size ?? {};
  const counts = scrape.counts ?? {};
  const pet = scrape.pet_policy ?? {};
  const legal = scrape.legal ?? {};
  const management = scrape.management ?? {};

  const cleanAddress = cleanScrapedAddress(property.address);
  const cityProvPostal = [property.city, property.province, property.postal_code]
    .map((v) => asTrimmedString(v))
    .filter(Boolean)
    .join(" ");
  const cleanLower = cleanAddress.toLowerCase();
  const addCityProvPostal =
    cityProvPostal &&
    !cleanLower.includes(asTrimmedString(property.postal_code).toLowerCase()) &&
    !cleanLower.includes(asTrimmedString(property.city).toLowerCase());
  const headerAddress =
    [cleanAddress, addCityProvPostal ? cityProvPostal : ""].filter(Boolean).join(", ") || "";
  const headerCityLine = (
    (property.subarea ? `${asTrimmedString(property.subarea)}, ` : "") +
    asTrimmedString(property.postal_code)
  ).trim();

  const fullBaths = details.full_baths != null ? String(details.full_baths) : "";
  const halfBaths = details.half_baths != null ? String(details.half_baths) : "";
  const baths =
    details.bathrooms != null
      ? String(details.bathrooms)
      : fullBaths && halfBaths
        ? String(Number(fullBaths) + Number(halfBaths))
        : fullBaths || halfBaths;

  const mainSqft = formatSqftNumber(floor.finished_main_sqft ?? size.main_sqft);
  const aboveSqft = formatSqftNumber(floor.finished_above_sqft ?? size.above_sqft);
  const belowSqft = formatSqftNumber(floor.finished_below_sqft ?? size.below_sqft);
  const bsmtSqft = formatSqftNumber(floor.finished_basement_sqft);
  const totalFinishedSqft = formatSqftNumber(floor.finished_total_sqft);
  const unfinishedSqft = formatSqftNumber(floor.unfinished_sqft);
  const grandSqft = formatSqftNumber(
    floor.grand_total_sqft ?? floor.finished_total_sqft ?? size.total_sqft,
  );

  const rooms = mapRooms(scrape);
  const bathRooms = mapBaths(scrape);
  const highlights = mapHighlights(scrape);

  const features =
    joinList(scrape.appliances) || joinList(scrape.features);

  const listedPrice =
    listing.listed_price != null
      ? `$${Number(listing.listed_price).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : "";

  return {
    mls: asTrimmedString(listing.mls_number),
    addr: headerAddress,
    city: headerCityLine,
    price: listedPrice,
    type: asTrimmedString(building.building_type || property.property_type),
    listingStatus: "Residential",
    beds: details.bedrooms != null ? String(details.bedrooms) : "",
    baths,
    fullBaths,
    halfBaths,
    sqft: grandSqft,
    mainSqft,
    aboveSqft,
    belowSqft,
    bsmtSqft,
    totalFinishedSqft,
    unfinishedSqft,
    year: details.approx_year_built != null ? String(details.approx_year_built) : "",
    age: details.age != null ? String(details.age) : "",
    tax: formatTax(pricing),
    taxYear: asTrimmedString(pricing.tax_year),
    strata: formatMaint(pricing),
    park: parking.total != null ? `Total: ${parking.total}` : "",
    parkCovered: asTrimmedString(parking.covered),
    parkFeatures: joinList(parking.features),
    locker: asTrimmedString(parking.locker),
    zone: asTrimmedString(property.zoning),
    style: asTrimmedString(details.style_of_home),
    pid: asTrimmedString(property.pid),
    complex: asTrimmedString(property.complex_name),
    titleToLand: asTrimmedString(property.ownership_type),
    lotDimensions: asTrimmedString(lot.lot_dimensions),
    frontage: lot.frontage_ft != null ? String(lot.frontage_ft) : "",
    lotArea: lot.lot_area != null ? String(lot.lot_area) : "",
    floodPlain: yesNo(lot.flood_plain),
    rearYardExp: asTrimmedString(lot.rear_yard_exposure),
    view: yesNo(lot.view),
    viewDetails: formatViewDetails(lot),
    construction: joinList(building.construction_materials),
    foundation: asTrimmedString(building.foundation),
    rainScreen: "",
    renovations: "",
    fireplaces: formatFireplaces(scrape),
    outdoorArea: asTrimmedString(property.outdoor_area),
    roofType: asTrimmedString(building.roof_type),
    floorFinish: asTrimmedString(building.floor_finish),
    exterior: asTrimmedString(building.building_type),
    waterSupply: asTrimmedString(utilities.water_supply),
    fuelHeating: joinList(utilities.fuel_heating),
    unitsInDev: formatUnits(building),
    distanceTo: asTrimmedString(property.distance_to),
    propertyDisc: asTrimmedString(property.property_disc),
    padRental: "",
    fixturesLeased: asTrimmedString(property.fixtures_leased),
    fixturesRmvd: asTrimmedString(property.fixtures_rmvd),
    servicesConnected: joinList(utilities.services_connected),
    mgmtCompany: formatMgmt(management),
    legal: asTrimmedString(legal.legal_description),
    amenities: joinList(scrape.amenities),
    siteInfluences: joinList(scrape.community_features),
    features,
    bylawRestric: asTrimmedString(pet.restrictions),
    numRooms: counts.number_of_rooms != null ? String(counts.number_of_rooms) : rooms.length ? String(rooms.length) : "",
    numKitchens: counts.number_of_kitchens != null ? String(counts.number_of_kitchens) : "",
    levels: asTrimmedString(details.levels),
    crawlHeight: "",
    basement: asTrimmedString(details.basement),
    suite: asTrimmedString(details.suite),
    rentalsAllowed:
      counts.rentals_allowed_percent != null ? String(counts.rentals_allowed_percent) : "",
    petsAllowed: asTrimmedString(pet.restrictions),
    desc: featureSheetPublicRemarksBody(null, scrape),
    ...(rooms.length ? { rooms } : {}),
    ...(bathRooms.length ? { bathRooms } : {}),
    ...(highlights.length ? { highlights } : {}),
  };
}
