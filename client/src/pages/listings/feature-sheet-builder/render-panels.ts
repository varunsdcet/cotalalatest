import { COTALA_FOOTER_LOGO_SRC } from "./constants";
import { renderQrSlotInnerHtml } from "./qr-svg";

export type RoomRow = { f: string; r: string; d: string };
export type BathRow = { f: string; pieces: string; ensuite: string };

export type AgentPhotoShape = "50%" | "8px" | "cutout" | "cutout-bleed";
export type AgentBarStyle = "standard" | "center-logo";
export type StrataLabel = "Maint." | "Lot Size";

export type FeatureSheetImages = {
  hero: string | null;
  agent: string | null;
  logo: string | null;
  il1: string | null;
  rh: string | null;
  fp: string | null;
  lb: Record<number, string>;
  rg: Record<number, string>;
};

export type FeatureSheetFormState = {
  useFloorplan: boolean;
  mls: string;
  addr: string;
  city: string;
  price: string;
  type: string;
  listingStatus: string;
  beds: string;
  baths: string;
  fullBaths: string;
  halfBaths: string;
  sqft: string;
  mainSqft: string;
  aboveSqft: string;
  belowSqft: string;
  bsmtSqft: string;
  totalFinishedSqft: string;
  unfinishedSqft: string;
  year: string;
  age: string;
  tax: string;
  taxYear: string;
  strata: string;
  strataLabel: StrataLabel;
  park: string;
  parkCovered: string;
  parkFeatures: string;
  locker: string;
  zone: string;
  style: string;
  pid: string;
  complex: string;
  titleToLand: string;
  lotDimensions: string;
  frontage: string;
  lotArea: string;
  floodPlain: string;
  rearYardExp: string;
  view: string;
  viewDetails: string;
  construction: string;
  foundation: string;
  rainScreen: string;
  renovations: string;
  fireplaces: string;
  outdoorArea: string;
  roofType: string;
  exterior: string;
  waterSupply: string;
  fuelHeating: string;
  floorFinish: string;
  unitsInDev: string;
  distanceTo: string;
  propertyDisc: string;
  padRental: string;
  fixturesLeased: string;
  fixturesRmvd: string;
  servicesConnected: string;
  mgmtCompany: string;
  legal: string;
  amenities: string;
  siteInfluences: string;
  features: string;
  bylawRestric: string;
  numRooms: string;
  numKitchens: string;
  levels: string;
  crawlHeight: string;
  basement: string;
  suite: string;
  rentalsAllowed: string;
  petsAllowed: string;
  desc: string;
  tour: string;
  showQr: boolean;
  heroScale: number;
  heroCrop: number;
  agentName: string;
  agentTitle: string;
  agentPhone: string;
  agentPhone2: string;
  agentEmail: string;
  agentWeb: string;
  agentBroker: string;
  agentLogoLabel: string;
  showAgentTitle: boolean;
  showAgentPhoto: boolean;
  agentPhotoShape: AgentPhotoShape;
  agentScale: number;
  agentBarStyle: AgentBarStyle;
  logoScale: number;
  bgColor: string;
  textColor: string;
  headingColor: string;
  primaryColor: string;
  accentColor: string;
  qrColor: string;
  headingFont: string;
  bodyFont: string;
  /** @deprecated use bodyFont — kept for API theme block */
  displayFont: string;
  rooms: RoomRow[];
  bathRooms: BathRow[];
  highlights: string[];
  images: FeatureSheetImages;
  layoutP2: Array<"content" | "hero">;
  layoutP4: Array<"hero" | "grid">;
};

export type RenderedPanels = {
  p1: string;
  p2: string;
  p3: string;
  p4: string;
  bgColor: string;
};

function esc(s: string | null | undefined): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const ICON_MOBILE =
  '<svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="6" y="2" width="12" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>';
const ICON_PHONE =
  '<svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.89.32 1.76.59 2.6a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.48-1.16a2 2 0 0 1 2.11-.45c.84.27 1.71.47 2.6.59A2 2 0 0 1 22 16.92z"/></svg>';
const ICON_AT =
  '<svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/></svg>';
const ICON_WORLD =
  '<svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';

function buildAgentPhotoHtml(
  state: FeatureSheetFormState,
  imgs: FeatureSheetImages,
  accent: string,
): string {
  if (!state.showAgentPhoto) return "";

  const shape = state.agentPhotoShape;
  const scale = state.agentScale || 1;
  const isCutout = shape === "cutout";
  const isCutoutBleed = shape === "cutout-bleed";
  const actualRadius = isCutout || isCutoutBleed ? "0" : shape;

  if (isCutoutBleed) {
    return (
      '<div style="width:180px;height:100px;position:relative;flex-shrink:0;">' +
      (imgs.agent
        ? `<img src="${imgs.agent}" style="width:180px;height:300px;object-fit:contain;object-position:bottom left;position:absolute;bottom:-55px;left:0;z-index:10;filter:drop-shadow(0 4px 6px rgba(0,0,0,0.3));transform:scale(${scale});transform-origin:bottom left;" alt="Agent">`
        : `<div style="width:180px;height:300px;background:#ddd;display:flex;align-items:center;justify-content:center;color:#aaa;position:absolute;bottom:-70px;left:0;z-index:10;box-shadow:0 4px 6px rgba(0,0,0,0.3);transform:scale(${scale});transform-origin:bottom left;font-size:30px;">👤</div>`) +
      "</div>"
    );
  }

  if (isCutout) {
    return (
      '<div style="width:130px;height:100px;position:relative;flex-shrink:0;">' +
      (imgs.agent
        ? `<img src="${imgs.agent}" style="width:130px;height:180px;object-fit:contain;object-position:bottom left;position:absolute;bottom:-10px;left:0;z-index:10;filter:drop-shadow(0 4px 6px rgba(0,0,0,0.3));transform:scale(${scale});transform-origin:bottom left;" alt="Agent">`
        : `<div style="width:130px;height:180px;background:#ddd;display:flex;align-items:center;justify-content:center;color:#aaa;position:absolute;bottom:-10px;left:0;z-index:10;box-shadow:0 4px 6px rgba(0,0,0,0.3);transform:scale(${scale});transform-origin:bottom left;font-size:30px;">👤</div>`) +
      "</div>"
    );
  }

  return imgs.agent
    ? `<img src="${imgs.agent}" style="width:100px;height:100px;border-radius:${actualRadius};object-fit:cover;flex-shrink:0;transform:scale(${scale});transform-origin:center;border:2px solid ${accent};" alt="Agent">`
    : `<div style="width:100px;height:100px;border-radius:${actualRadius};background:#ddd;border:2px solid ${accent};display:flex;align-items:center;justify-content:center;color:#aaa;flex-shrink:0;transform:scale(${scale});transform-origin:center;font-size:30px;">👤</div>`;
}

function buildAgentBar(
  state: FeatureSheetFormState,
  imgs: FeatureSheetImages,
  opts: {
    bgColor: string;
    txtColor: string;
    hdColor: string;
    accent: string;
    fontH: string;
    fontB: string;
  },
): string {
  const { bgColor, txtColor, hdColor, accent, fontH, fontB } = opts;
  const aName = (state.agentName || "").toUpperCase();
  const aTitle = state.agentTitle || "";
  const aPhone = state.agentPhone || "";
  const aPhone2 = state.agentPhone2 || "";
  const aEmail = state.agentEmail || "";
  const aWeb = state.agentWeb || "";
  const aBlbl = state.agentLogoLabel || "";
  const lScale = state.logoScale || 1;
  const photoHTML = buildAgentPhotoHtml(state, imgs, accent);

  const titleHTML =
    state.showAgentTitle && aTitle
      ? `<div style="font-size:8px;line-height:1.2;margin-bottom:4px;font-family:${fontB};opacity:0.85;">${esc(aTitle)}</div>`
      : "";

  if (state.agentBarStyle === "center-logo") {
    const iconStyle = `display:flex;align-items:center;justify-content:center;width:13px;height:13px;border-radius:50%;background:${accent};color:${bgColor};margin-right:6px;font-size:8px;flex-shrink:0;`;
    const lines: string[] = [];
    if (aPhone) {
      lines.push(
        `<div style="display:flex;align-items:center;margin-bottom:4px;"><span style="${iconStyle}">${ICON_MOBILE}</span>${esc(aPhone)}</div>`,
      );
    }
    if (aPhone2) {
      lines.push(
        `<div style="display:flex;align-items:center;margin-bottom:4px;"><span style="${iconStyle}">${ICON_PHONE}</span>${esc(aPhone2)}</div>`,
      );
    }
    if (aEmail) {
      lines.push(
        `<div style="display:flex;align-items:center;margin-bottom:4px;"><span style="${iconStyle}">${ICON_AT}</span>${esc(aEmail)}</div>`,
      );
    }
    if (aWeb) {
      lines.push(
        `<div style="display:flex;align-items:center;"><span style="${iconStyle}">${ICON_WORLD}</span>${esc(aWeb)}</div>`,
      );
    }

    const rightInfo = `<div style="font-size:7.5px;font-family:${fontB};color:${txtColor};display:flex;flex-direction:column;justify-content:center;white-space:nowrap;">${lines.join("")}</div>`;
    const centerLogo = imgs.logo
      ? `<img src="${imgs.logo}" style="max-height:75px;max-width:200px;object-fit:contain;transform:scale(${lScale});transform-origin:left center;" alt="Logo">`
      : `<div style="font-size:14px;font-weight:700;color:${txtColor};font-family:${fontH};">YOUR LOGO</div>`;

    return (
      `<div style="display:flex;align-items:center;justify-content:flex-start;gap:20px;padding:20px 24px 38px;background:${bgColor};color:${txtColor};flex-shrink:0;position:relative;z-index:20;">` +
      photoHTML +
      `<div style="display:flex;justify-content:flex-start;">${centerLogo}</div>` +
      rightInfo +
      "</div>"
    );
  }

  return (
    `<div style="display:flex;align-items:center;gap:15px;padding:25px 24px 38px;background:${bgColor};color:${txtColor};flex-shrink:0;position:relative;z-index:20;">` +
    photoHTML +
    `<div style="flex:1;min-width:0">` +
    `<div style="font-size:16px;font-weight:600;line-height:1.1;margin-bottom:${state.showAgentTitle && aTitle ? "2px" : "4px"};font-family:${fontH};color:${hdColor};">${esc(aName)}</div>` +
    titleHTML +
    `<div style="font-size:9px;line-height:1.4;font-family:${fontB};opacity:0.8;">${esc(aPhone)}${aPhone2 ? `<br>${esc(aPhone2)}` : ""}<br>${esc(aEmail)}<br>${esc(aWeb)}</div></div>` +
    `<div style="display:flex;flex-direction:column;align-items:center;gap:5px;flex-shrink:0">` +
    (imgs.logo
      ? `<img src="${imgs.logo}" style="max-height:30px;max-width:80px;object-fit:contain;transform:scale(${lScale});transform-origin:center;" alt="Logo">`
      : `<div style="background:#111;padding:6px 10px;border-radius:2px;font-size:12px;font-weight:700;color:white;font-family:${fontH};">co</div>`) +
    `<div style="font-size:5px;text-align:center;max-width:80px;line-height:1.2;font-family:${fontB};opacity:0.6;">${esc(aBlbl)}</div></div></div>`
  );
}

export function renderFeatureSheetPanels(state: FeatureSheetFormState): RenderedPanels {
  const accent = state.accentColor || "#e3a79a";
  const bgColor = state.bgColor || "#ffffff";
  const txtColor = state.textColor || "#555555";
  const hdColor = state.headingColor || "#222222";
  const qrColor = state.qrColor || "#000000";
  const fontH = state.headingFont || "'Playfair Display', serif";
  const fontB = state.bodyFont || state.displayFont || "'Montserrat', sans-serif";
  const imgs = state.images;
  const rooms = state.rooms;
  const layoutP2 = state.layoutP2;
  const layoutP4 = state.layoutP4;
  const heroScale = state.heroScale || 1;
  const heroCrop = state.heroCrop || 100;
  const strataLabel = state.strataLabel || "Maint.";

  const addr = state.addr || "";
  const city = state.city || "";
  const price = state.price || "";
  const beds = state.beds || "";
  const baths = state.baths || "";
  const sqft = state.sqft || "";
  const yr = state.year || "";
  const tax = state.tax || "";
  const strata = state.strata || "";
  const park = state.park || "";
  const zone = state.zone || "";
  const mls = state.mls || "";
  const style2 = state.style || "";
  const desc = state.desc || "";
  const tour = state.tour || "";
  const listingStatus = state.listingStatus || "Residential";
  const fullBaths = state.fullBaths || "";
  const halfBaths = state.halfBaths || "";
  const pid = state.pid || "";
  const age = state.age || "";
  const complex = state.complex || "";
  const titleToLand = state.titleToLand || "";
  const lotDimensions = state.lotDimensions || "";
  const frontage = state.frontage || "";
  const lotArea = state.lotArea || "";
  const floodPlain = state.floodPlain || "";
  const construction = state.construction || "";
  const waterSupply = state.waterSupply || "";
  const fuelHeating = state.fuelHeating || "";
  const floorFinish = state.floorFinish || "";
  const propertyDisc = state.propertyDisc || "";
  const fixturesLeased = state.fixturesLeased || "";
  const servicesConnected = state.servicesConnected || "";
  const amenities = state.amenities || "";
  const features = state.features || "";
  const mainSqft = state.mainSqft || "";
  const aboveSqft = state.aboveSqft || "";
  const belowSqft = state.belowSqft || "";
  const bsmtSqft = state.bsmtSqft || "";
  const totalFinishedSqft = state.totalFinishedSqft || "";
  const unfinishedSqft = state.unfinishedSqft || "";
  const propType = state.type || "";
  const aBroker = state.agentBroker || "";
  const taxYear = state.taxYear || "";
  const rearYardExp = state.rearYardExp || "";
  const view = state.view || "";
  const viewDetails = state.viewDetails || "";
  const foundation = state.foundation || "";
  const rainScreen = state.rainScreen || "";
  const renovations = state.renovations || "";
  const fireplaces = state.fireplaces || "";
  const outdoorArea = state.outdoorArea || "";
  const roofType = state.roofType || "";
  const parkCovered = state.parkCovered || "";
  const parkFeatures = state.parkFeatures || "";
  const locker = state.locker || "";
  const unitsInDev = state.unitsInDev || "";
  const distanceTo = state.distanceTo || "";
  const padRental = state.padRental || "";
  const fixturesRmvd = state.fixturesRmvd || "";
  const mgmtCompany = state.mgmtCompany || "";
  const legal = state.legal || "";
  const siteInfluences = state.siteInfluences || "";
  const bylawRestric = state.bylawRestric || "";
  const numRooms = state.numRooms || (rooms.length ? String(rooms.length) : "");
  const numKitchens = state.numKitchens || "";
  const levels = state.levels || "";
  const crawlHeight = state.crawlHeight || "";
  const basement = state.basement || "";
  const suite = state.suite || "";
  const rentalsAllowed = state.rentalsAllowed || "";
  const petsAllowed = state.petsAllowed || "";
  const bathRooms = state.bathRooms || [];

  const strataFieldLabel = strataLabel === "Lot Size" ? "Lot Size:" : "Maint. Fee:";
  const strataStatLabel = strataLabel === "Lot Size" ? "LOT" : "MAINT";
  const dash = (v: string) => (v.trim() ? esc(v) : "-");
  const sqftLine = (v: string) => (v.trim() ? `${esc(v)} sqft` : "-");

  const heroH = imgs.hero
    ? `<img src="${imgs.hero}" decoding="async" fetchpriority="high" style="width:100%;height:100%;object-fit:cover;display:block;transform:scale(${heroScale});transform-origin:center;" alt="Property">`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:5px;background:#e0e0e0"><span style='font-size:9px;color:#bbb'>Exterior hero photo</span></div>`;

  const hr = `<div style="border-top:0.5px solid ${txtColor}; margin: 3px 0; opacity: 0.6;"></div>`;
  const labelStyle = `font-weight:700; width:88px; display:inline-block; color:${txtColor}; flex-shrink:0;`;
  const row = (label: string, value: string) =>
    `<div style="margin-bottom:1px;display:flex;"><span style="${labelStyle}">${label}</span><span style="flex:1;">${dash(value)}</span></div>`;
  const rowWide = (label: string, value: string) =>
    `<div style="display:flex;margin-bottom:1px;"><span style="${labelStyle}">${label}</span><span style="flex:1;">${dash(value)}</span></div>`;

  const roomTableH =
    `<table style="width:100%; border-collapse:collapse; font-size:5.5px; color:${txtColor};">` +
    `<thead><tr><th style="text-align:left; padding-bottom:2px; border-bottom:0.5px solid ${txtColor}; opacity:0.6;">Floor</th><th style="text-align:left; padding-bottom:2px; border-bottom:0.5px solid ${txtColor}; opacity:0.6;">Type</th><th style="text-align:left; padding-bottom:2px; border-bottom:0.5px solid ${txtColor}; opacity:0.6;">Dimensions</th>` +
    `<th style="text-align:left; padding-bottom:2px; border-bottom:0.5px solid ${txtColor}; opacity:0.6;">Floor</th><th style="text-align:left; padding-bottom:2px; border-bottom:0.5px solid ${txtColor}; opacity:0.6;">Type</th><th style="text-align:left; padding-bottom:2px; border-bottom:0.5px solid ${txtColor}; opacity:0.6;">Dimensions</th></tr></thead><tbody>` +
    (() => {
      let out = "";
      const h = Math.max(1, Math.ceil(rooms.length / 2));
      for (let i = 0; i < h; i++) {
        const a = rooms[i] || { f: "", r: "", d: "" };
        const b = rooms[i + h] || { f: "", r: "", d: "" };
        out +=
          `<tr>` +
          `<td style="padding:1px 0;">${dash(a.f)}</td><td style="padding:1px 0;">${dash(a.r)}</td><td style="padding:1px 0;">${dash(a.d)}</td>` +
          `<td style="padding:1px 0;">${dash(b.f)}</td><td style="padding:1px 0;">${dash(b.r)}</td><td style="padding:1px 0;">${dash(b.d)}</td>` +
          `</tr>`;
      }
      return out;
    })() +
    `</tbody></table>`;

  const bathTableH =
    `<table style="width:100%; border-collapse:collapse; font-size:5.5px; color:${txtColor};">` +
    `<thead><tr><th style="text-align:left; padding-bottom:2px; opacity:0.6;">Bathroom Floor</th><th style="text-align:left; padding-bottom:2px; opacity:0.6;">No. of Pieces</th><th style="text-align:left; padding-bottom:2px; opacity:0.6;">Ensuite?</th></tr></thead><tbody>` +
    (bathRooms.length
      ? bathRooms
          .map(
            (b) =>
              `<tr><td style="padding:1px 0;">${dash(b.f)}</td><td style="padding:1px 0;">${dash(b.pieces)}</td><td style="padding:1px 0;">${dash(b.ensuite)}</td></tr>`,
          )
          .join("")
      : `<tr><td style="padding:1px 0;">-</td><td style="padding:1px 0;">-</td><td style="padding:1px 0;">-</td></tr>`) +
    `</tbody></table>`;

  const fpH = imgs.fp
    ? `<img src="${imgs.fp}" style="width:100%;height:100%;object-fit:contain" alt="Floorplan">`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:5px;background:#e8e8e8;border:1px dashed #ccc;"><span style='font-size:9px;color:#bbb'>Floorplan placeholder</span></div>`;

  /** Full MLS layout — same fields as FeatureListingPage4Static. */
  const dataContent =
    `<div style="display:flex; justify-content:space-between; align-items:flex-end; padding-bottom:4px;">` +
    `<div style="font-size:5.5px; font-weight:700;">${dash(mls)}<br>${dash(propType)}</div>` +
    `<div style="text-align:center;"><div style="font-size:10px; font-weight:700; color:${hdColor}; font-family:${fontH};">${esc(addr).toUpperCase() || "-"}</div><div style="font-size:5.5px;">${dash(city)}</div></div>` +
    `<div style="font-size:5.5px; font-weight:700; text-align:right;">${esc(listingStatus)}<br>${dash(price)} (LP)</div>` +
    `</div>` +
    hr +
    `<div style="display:flex; font-size:5.5px; gap:4px;">` +
    `<div style="flex:1;">` +
    row("Lot Dimensions (ft):", lotDimensions) +
    row("Frontage (ft):", frontage) +
    row("Lot Area:", lotArea) +
    row("Flood Plain:", floodPlain) +
    row("Rear Yard Exp:", rearYardExp) +
    row("View:", view) +
    `</div>` +
    `<div style="flex:1;">` +
    row("Bedrooms:", beds) +
    row("Bathrooms:", baths) +
    row("Full Baths:", fullBaths) +
    row("Half Baths:", halfBaths) +
    row(strataFieldLabel, strata) +
    `</div>` +
    `<div style="flex:1;">` +
    row("Approx. Year Built:", yr) +
    row("Age:", age) +
    row("Zoning:", zone) +
    row("Gross Taxes:", tax) +
    row("For Tax Year:", taxYear) +
    row("P.I.D.:", pid) +
    `</div>` +
    `</div>` +
    hr +
    `<div style="display:flex; font-size:5.5px; gap:4px;">` +
    `<div style="flex:1.2;">` +
    row("Style of Home:", style2) +
    row("Construction Materials:", construction) +
    row("Foundation:", foundation) +
    row("Rain Screen:", rainScreen) +
    row("Renovations:", renovations) +
    row("No. of Fireplaces:", fireplaces) +
    row("Water Supply:", waterSupply) +
    row("Fuel/Heating:", fuelHeating) +
    row("Outdoor Area:", outdoorArea) +
    row("Type of Roof:", roofType) +
    row("Floor Finish:", floorFinish) +
    `</div>` +
    `<div style="flex:1;">` +
    row("Parking:", park) +
    row("Covered Parking:", parkCovered) +
    row("Parking Features:", parkFeatures) +
    row("Locker:", locker) +
    row("Units in Dev:", unitsInDev) +
    row("Distance to:", distanceTo) +
    row("Title to Land:", titleToLand) +
    row("Property Disc:", propertyDisc) +
    row("PAD Rental:", padRental) +
    row("Fixtures Leased:", fixturesLeased) +
    row("Fixtures Rmvd:", fixturesRmvd) +
    `</div>` +
    `</div>` +
    hr +
    `<div style="font-size:5.5px;">` +
    rowWide("View:", viewDetails) +
    rowWide("Mgmt. Company:", mgmtCompany) +
    rowWide("Complex / Subdiv:", complex) +
    rowWide("Services Connected:", servicesConnected) +
    rowWide("Legal:", legal) +
    rowWide("Amenities:", amenities) +
    rowWide("Site Influences:", siteInfluences) +
    rowWide("Features:", features) +
    rowWide("Bylaw Restric:", bylawRestric) +
    rowWide("Listing Broker(s):", aBroker) +
    `</div>` +
    hr +
    roomTableH +
    hr +
    `<div style="display:flex; font-size:5.5px; gap:4px;">` +
    `<div style="flex:1;">` +
    `<div style="margin-bottom:1px;display:flex;"><span style="${labelStyle}">Finished Floor (Main):</span><span style="flex:1;">${sqftLine(mainSqft)}</span></div>` +
    `<div style="margin-bottom:1px;display:flex;"><span style="${labelStyle}">Finished Floor (Above):</span><span style="flex:1;">${sqftLine(aboveSqft)}</span></div>` +
    `<div style="margin-bottom:1px;display:flex;"><span style="${labelStyle}">Finished Floor (Below):</span><span style="flex:1;">${sqftLine(belowSqft)}</span></div>` +
    `<div style="margin-bottom:1px;display:flex;"><span style="${labelStyle}">Finished Floor (Bsmt):</span><span style="flex:1;">${sqftLine(bsmtSqft)}</span></div>` +
    `<div style="margin-bottom:1px;display:flex;"><span style="${labelStyle}">Finished Floor (Total):</span><span style="flex:1;">${sqftLine(totalFinishedSqft)}</span></div>` +
    `<div style="margin-bottom:1px;display:flex;"><span style="${labelStyle}">Unfinished Floor:</span><span style="flex:1;">${sqftLine(unfinishedSqft)}</span></div>` +
    `<div style="margin-bottom:1px;display:flex;"><span style="${labelStyle}">Grand Total:</span><span style="flex:1;">${sqftLine(sqft)}</span></div>` +
    `</div>` +
    `<div style="flex:1;">` +
    row("No. of Rooms:", numRooms) +
    row("No. of Kitchens:", numKitchens) +
    row("No. of Levels:", levels) +
    row("Crawl/Bsmt Height:", crawlHeight) +
    row("Basement:", basement) +
    row("Suite:", suite) +
    row("No. or % of Rentals Allowed:", rentalsAllowed) +
    row("Pets Allowed:", petsAllowed) +
    `</div>` +
    `<div style="flex:1;">${bathTableH}</div>` +
    `</div>` +
    hr +
    `<div style="font-size:5.5px; line-height:1.35; margin-top:2px;">${esc(desc)}</div>`;

  const fpContent = `<div style="flex:1; width:100%; overflow:hidden; margin-bottom:10px;">${fpH}</div>`;
  const mainContent = state.useFloorplan
    ? fpContent
    : `<div style="flex:1; display:flex; flex-direction:column;">${dataContent}</div>`;

  const p1 =
    `<div style="display:flex; flex-direction:column; height:100%; background:${bgColor}; color:${txtColor}; font-family:${fontB}; padding:17px 17px 17px 16px; box-sizing:border-box;">` +
    mainContent +
    `<div style="margin-top:auto; border-top:0.5px solid ${txtColor}; padding-top:4px; display:flex; gap:10px; align-items:center; opacity: 0.8; flex-shrink:0;">` +
    `<img src="${COTALA_FOOTER_LOGO_SRC}" style="height:8px; width:auto; display:block;" alt="Cotala">` +
    `<div style="flex:1; font-size:4.5px; line-height:1.2; text-align:right;">The enclosed information while deemed to be correct, is not guaranteed. Information and measurements should not be relied upon without independent verification. Not intended to solicit properties already listed for sale.</div>` +
    `</div>` +
    `</div>`;

  const agentBarClean = buildAgentBar(state, imgs, { bgColor, txtColor, hdColor, accent, fontH, fontB });

  const cleanCity = city ? city.split(",")[0].trim() : "";
  const heroAddress = addr + (cleanCity ? `, ${cleanCity}` : "");

  const p2Dict: Record<string, string> = {
    content:
      `<div style="background:${bgColor}; color:${txtColor}; padding: 24px 24px 10px;">` +
      `<div style="font-size:10px; opacity:0.7; margin-bottom:2px; font-family:${fontB};">Welcome to</div>` +
      `<div style="font-size:15px; font-weight:700; letter-spacing:0.5px; font-family:${fontH}; color:${hdColor};">${esc(heroAddress).toUpperCase()}</div>` +
      `</div>`,
    hero:
      `<div style="flex:1; padding: 0 24px; background:${bgColor}; display:flex; flex-direction:column; align-items:center; justify-content:center; overflow:hidden;">` +
      `<div style="width:100%; height:${heroCrop}%; overflow:hidden; border-radius:2px;">${heroH}</div>` +
      `</div>`,
  };

  const p2 =
    `<div style="display:flex;flex-direction:column;height:100%;background:${bgColor};">` +
    layoutP2.map((key) => p2Dict[key]).join("") +
    agentBarClean +
    `</div>`;

  const statLineP3 =
    `<div style="font-size:7px;color:${txtColor};padding:5px 0;border-top:0.5px solid ${txtColor};border-bottom:0.5px solid ${txtColor};margin:10px 0;display:flex;justify-content:space-between;text-transform:uppercase;opacity:0.8;">` +
    `<span>SIZE &nbsp;<strong>${esc(sqft)} SF</strong></span>&nbsp; | &nbsp;` +
    `<span>BEDS &nbsp;<strong>${esc(beds)}</strong></span>&nbsp; | &nbsp;` +
    `<span>BATHS &nbsp;<strong>${esc(baths)}</strong></span>&nbsp; | &nbsp;` +
    `<span>TAX &nbsp;<strong>${esc(tax)}</strong></span>&nbsp; | &nbsp;` +
    `<span>${strataStatLabel} &nbsp;<strong>${esc(strata)}</strong></span></div>`;

  const p3Top =
    `<div style="padding: 30px 24px 10px; background:${bgColor}; color:${txtColor};">` +
    `<div style="font-size:14px;font-weight:600;color:${hdColor};margin-bottom:6px;font-family:${fontH};opacity:0.9;text-transform:uppercase;">${esc(addr)}</div>` +
    `<div style="display:flex;align-items:flex-end;gap:5px;margin-bottom:12px;">` +
    `<div style="font-size:6px;color:${txtColor};letter-spacing:0.04em;text-transform:uppercase;font-family:${fontB};opacity:0.6;line-height:1.1;margin-bottom:1px;">Listed<br>For</div>` +
    `<div style="font-size:20px;font-weight:400;color:${hdColor};font-family:${fontH};line-height:1;">${esc(price)}</div></div>` +
    `<div style="font-size:6.5px;line-height:1.6;font-family:${fontB};opacity:0.9;">${esc(desc)}</div>` +
    statLineP3 +
    `</div>`;

  const il1H = imgs.il1
    ? `<img src="${imgs.il1}" decoding="async" style="width:100%;height:100%;object-fit:cover;display:block;" alt="Interior">`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:5px;background:#d8d8d8"><span style='font-size:9px;color:#bbb'>Left large photo — e.g. kitchen</span></div>`;

  let lbPhotos = "";
  for (let i = 1; i <= 3; i++) {
    lbPhotos +=
      `<div style="flex:1;width:100%;height:100%;overflow:hidden;background:${i === 2 ? "#ccc" : "#d4d4d4"}">` +
      (imgs.lb[i]
        ? `<img src="${imgs.lb[i]}" decoding="async" style="width:100%;height:100%;object-fit:cover;display:block;" alt="Interior ${i + 1}">`
        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:8px;color:#bbb">Bottom ${i}</div>`) +
      `</div>`;
  }

  const p3 =
    `<div style="display:flex;flex-direction:column;height:100%;background:${bgColor};">` +
    p3Top +
    `<div style="flex:1;overflow:hidden;padding:0 24px;margin-bottom:5px;">${il1H}</div>` +
    `<div style="height:159px;display:flex;gap:5px;padding:0 24px 32px;flex-shrink:0;">${lbPhotos}</div>` +
    `</div>`;

  const rhH = imgs.rh
    ? `<img src="${imgs.rh}" decoding="async" style="width:100%;height:100%;object-fit:cover;display:block;" alt="Interior hero">`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:5px;background:#d0d0d0"><span style='font-size:9px;color:#bbb'>Right hero photo — e.g. living room</span></div>`;

  let rgPhotos = "";
  for (let j = 1; j <= 9; j++) {
    rgPhotos +=
      `<div style="width:100%;height:100%;overflow:hidden;background:${j % 2 ? "#d8d8d8" : "#ccc"}">` +
      (imgs.rg[j]
        ? `<img src="${imgs.rg[j]}" decoding="async" style="width:100%;height:100%;object-fit:cover;display:block;" alt="Grid ${j}">`
        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:8px;color:#bbb">Photo ${j}</div>`) +
      `</div>`;
  }

  const qrInner = renderQrSlotInnerHtml(tour, qrColor);
  const qrBlock = state.showQr
    ? `<div style="position:absolute;top:0;right:0;background:${bgColor};padding:8px 8px 6px;display:flex;flex-direction:column;align-items:center;gap:2px;">` +
      `<div class="qr-slot" style="width:36px;height:36px;background:#e8e8e8;border:0.5px solid #ccc;border-radius:2px;display:flex;align-items:center;justify-content:center;overflow:hidden">${qrInner}</div>` +
      `<div style="font-size:4px;color:${txtColor};text-align:center;line-height:1.2;font-weight:700;">TAKE THE TOUR<br><span style="font-weight:400;opacity:0.8;">${esc(tour)}</span></div></div>`
    : "";

  const p4Dict: Record<string, string> = {
    hero: `<div style="flex:0.85;width:100%;height:100%;overflow:hidden;position:relative;background:#d0d0d0">${rhH}${qrBlock}</div>`,
    grid: `<div style="flex:1.15;width:100%;height:100%;display:grid;grid-template-columns:repeat(3, 1fr);grid-template-rows:repeat(3, 1fr);gap:5px;overflow:hidden;">${rgPhotos}</div>`,
  };

  const p4 =
    `<div style="display:flex;flex-direction:column;width:100%;height:100%;background:${bgColor};padding:32px 24px;">` +
    `<div style="display:flex;flex-direction:column;gap:5px;width:100%;height:100%;">` +
    layoutP4.map((key) => p4Dict[key]).join("") +
    `</div></div>`;

  return { p1, p2, p3, p4, bgColor };
}
