import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Input } from "@/components/ui/input";
import {
  getPortalListings,
  getPortalProfile,
  getUserIdFromStorage,
  type PortalListing,
} from "@/lib/api";
import PortalFooter from "@/components/portal/PortalFooter";
import heroBg from "@/pages/images/new-bg-1.jpg";
import {
  BrochureCard,
  EmailBannerCard,
  LandscapeCard,
  PinterestCard,
  PostcardBack,
  PostcardFront,
  SquareCard,
  StoryCard,
  type KitBrand,
  type KitListing,
} from "./kit-cards";
import { copyText, downloadPhotosZip, embedCodeFor } from "./kit-download";
import {
  collectUrls,
  keepSlotsForListing,
  listingCoverUrl,
  loadListingKitSource,
  orderedListingPhotos,
} from "./listing-photos";
import ReelStudio from "./reel-studio";
import SlideshowStudio from "./slideshow-studio";
import DownloadCenter from "./download-center";
import ListingVideo from "./listing-video";
import StoryStudio from "./story-studio";
import KitEditor, { type EditorGroup } from "./kit-editor";
import { loadStoredDesign, purgeInvalidDesignAssets } from "./kit-design";
import KitLoader from "./kit-loader";
import { inferAgentGender } from "./slideshow";
import { kitBtn } from "./kit-ui";

const KIT_SLOTS_KEY = "cotala_ai_kit_slots_v4_";

const KIT_NAV = [
  { id: "info", label: "Info" },
  { id: "photos", label: "Photos" },
  { id: "video", label: "Video" },
  { id: "reels", label: "Reels" },
  { id: "slideshows", label: "Slideshow" },
  { id: "stories", label: "Stories" },
  { id: "square", label: "Square" },
  { id: "landscape", label: "Landscape" },
  { id: "pinterest", label: "Pinterest" },
  { id: "postcard", label: "Postcard" },
  { id: "brochure", label: "Brochure" },
  { id: "site", label: "Site" },
  { id: "copy", label: "AI copy" },
] as const;

type SlotMap = {
  stories: string[];
  square: string[];
  landscape: string[];
  postcard: string[];
  reel: string[];
  pinterest: string[];
  brochure: string[];
  email: string[];
  flyer: string[];
};

function formatAddress(unit: unknown, address: string, city?: string) {
  const parts: string[] = [];
  if (unit && String(unit).trim() !== "") {
    const unitStr = String(unit).trim();
    const addressStr = address || "";
    const addressMatch = addressStr.match(/^(\d+)/);
    parts.push(addressMatch ? `${unitStr}-${addressStr}` : `${unitStr} ${addressStr}`);
  } else {
    parts.push(address || "No Address");
  }
  if (city && city.trim() !== "") parts.push(city.trim());
  return parts.join(", ");
}

function pickText(sources: unknown[]): string {
  for (const value of sources) {
    if (value == null) continue;
    const s = String(value).trim();
    if (s && s !== "0" && s !== "undefined") return s;
  }
  return "";
}

function mlxMap(tour: Record<string, unknown> | undefined): Record<string, string> {
  if (!tour) return {};
  const out: Record<string, string> = {};
  const ingest = (raw: unknown) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (value == null) continue;
      const s = String(value).trim();
      if (!s || s === "undefined") continue;
      out[key] = s;
      out[key.trim()] = s;
      out[key.toLowerCase().trim()] = s;
    }
  };
  ingest(tour.mlxdetails);
  ingest(tour.mlxdetails2);
  return out;
}

function mdxPick(mdx: Record<string, string>, names: string[]): string {
  for (const name of names) {
    const direct = mdx[name] || mdx[name.trim()] || mdx[name.toLowerCase()];
    if (direct && direct !== "0") return direct;
  }
  const wanted = new Set(names.map((n) => n.toLowerCase().replace(/[^a-z0-9]/g, "")));
  for (const [key, value] of Object.entries(mdx)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (wanted.has(normalized) && value && value !== "0") return value;
  }
  return "";
}

function moneyish(value: unknown): string {
  if (value == null) return "";
  const s = String(value).trim();
  if (!s) return "";
  if (s.startsWith("$")) return s;
  const n = Number(String(s).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return s;
  return `$${n.toLocaleString()}`;
}

function floorplanUrls(tour: Record<string, unknown> | undefined): string[] {
  const fp = tour?.floorplanarray;
  if (!fp) return [];
  if (Array.isArray(fp)) return collectUrls(fp);
  if (typeof fp === "object") {
    return collectUrls(Object.values(fp as Record<string, unknown>));
  }
  return [];
}

function defaultSlots(photos: string[]): SlotMap {
  const ordered = orderedListingPhotos(photos);
  return {
    stories: keepSlotsForListing(ordered.slice(0, 3), photos, 3),
    square: keepSlotsForListing(ordered.slice(3, 6), photos, 3),
    landscape: keepSlotsForListing([ordered[0], ordered[Math.min(6, ordered.length - 1)] || ordered[1]], photos, 2),
    postcard: keepSlotsForListing(ordered.slice(0, 6), photos, 6),
    reel: ordered.slice(0, 15),
    pinterest: keepSlotsForListing(ordered.slice(1, 4), photos, 3),
    brochure: keepSlotsForListing(ordered.slice(0, 4), photos, 4),
    email: keepSlotsForListing([ordered[0]], photos, 1),
    flyer: [],
  };
}

function readSlots(tourId: string, photos: string[]): SlotMap {
  const fallback = defaultSlots(photos);
  try {
    const raw = window.localStorage.getItem(`${KIT_SLOTS_KEY}${tourId}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<SlotMap>;
    return {
      stories: keepSlotsForListing(parsed.stories, photos, 3),
      square: keepSlotsForListing(parsed.square, photos, 3),
      landscape: keepSlotsForListing(parsed.landscape, photos, 2),
      postcard: keepSlotsForListing(parsed.postcard, photos, 6),
      reel: keepSlotsForListing(parsed.reel, photos, Math.min(15, photos.length)),
      pinterest: keepSlotsForListing(parsed.pinterest, photos, 3),
      brochure: keepSlotsForListing(parsed.brochure, photos, 4),
      email: keepSlotsForListing(parsed.email, photos, 1),
      flyer: [],
    };
  } catch {
    return fallback;
  }
}

function writeSlots(tourId: string, slots: SlotMap) {
  try {
    window.localStorage.setItem(`${KIT_SLOTS_KEY}${tourId}`, JSON.stringify(slots));
  } catch {
    /* ignore quota */
  }
}

function socialCaption(listing: KitListing, tone: "short" | "long"): string {
  const facts = [listing.beds && `${listing.beds} beds`, listing.baths && `${listing.baths} baths`, listing.sqft && `${listing.sqft} sqft`]
    .filter(Boolean)
    .join(", ");
  if (tone === "short") {
    return [listing.address, listing.price, facts].filter(Boolean).join(" · ");
  }
  const body = listing.description?.trim() || "Newly listed and ready to tour.";
  return `${listing.address}${listing.price ? ` — listed at ${listing.price}` : ""}. ${facts ? `${facts}. ` : ""}${body}`.trim();
}

export default function AiTool() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const tourId = new URLSearchParams(search).get("id")?.trim() || new URLSearchParams(search).get("tourid")?.trim() || "";
  const [listings, setListings] = useState<PortalListing[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingKit, setLoadingKit] = useState(Boolean(tourId));
  const [photos, setPhotos] = useState<string[]>([]);
  const [listing, setListing] = useState<KitListing>({
    address: "",
    mls: "",
    price: "",
    beds: "",
    baths: "",
    sqft: "",
    lot: "",
    description: "",
  });
  const [brand, setBrand] = useState<KitBrand>({
    name: "",
    phone: "",
    brokerage: "",
    logo: "",
    headshot: "",
    bg: "#101214",
    text: "#ffffff",
    accent: "#B082F2",
  });
  const [slots, setSlots] = useState<SlotMap>(defaultSlots([]));
  const [editor, setEditor] = useState<{ group: EditorGroup; index: number; page?: number } | null>(null);
  const [designRevision, setDesignRevision] = useState(0);
  const [ribbons, setRibbons] = useState<Record<string, string>>({});
  const [zipping, setZipping] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState("info");
  const [videoUrl, setVideoUrl] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [floorplans, setFloorplans] = useState<string[]>([]);
  const [tourUrl, setTourUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const loadListings = async () => {
      try {
        setLoadingList(true);
        const data = await getPortalListings({ per_page: 200 });
        if (data.status && Array.isArray(data.data)) setListings(data.data as PortalListing[]);
        else setListings([]);
      } catch (error) {
        console.error("Failed to load listings for AI kit", error);
        setListings([]);
      } finally {
        setLoadingList(false);
      }
    };
    void loadListings();
  }, []);

  useEffect(() => {
    if (!tourId) {
      setLoadingKit(false);
      return;
    }
    const userId = getUserIdFromStorage();
    let cancelled = false;
    const load = async () => {
      setLoadingKit(true);
      try {
        const [{ photos: nextPhotos, tour, agent, video }, profile] = await Promise.all([
          loadListingKitSource(tourId, userId),
          getPortalProfile().catch(() => null),
        ]);
        if (cancelled) return;

        const mdx = mlxMap(tour);
        setPhotos(nextPhotos);
        purgeInvalidDesignAssets(tourId, nextPhotos);
        setSlots(readSlots(tourId, nextPhotos));

        const unit = tour?.unit;
        const address = String(tour?.address ?? "");
        const city = String(tour?.city ?? "");
        const nextListing: KitListing = {
          address: formatAddress(unit, address, city),
          mls: pickText([
            tour?.mls,
            mdxPick(mdx, ["MLS Number", "MLS Number ", "MLS", "MlsNumber", "MLS#"]),
          ]),
          price: moneyish(
            pickText([
              mdxPick(mdx, ["List Price", "Price", "Original Price"]),
              tour?.price,
              tour?.listprice,
            ]),
          ),
          beds: pickText([
            tour?.beds,
            tour?.bedrooms,
            mdxPick(mdx, ["Bedrooms", "Beds", "Total Bedrooms", "Total Beds", "No. of Bedrooms"]),
          ]),
          baths: pickText([
            tour?.baths,
            tour?.bathrooms,
            mdxPick(mdx, ["Bathrooms", "Baths", "Total Baths", "Total Bathrooms", "No. of Bathrooms"]),
          ]),
          sqft: pickText([
            tour?.sqft,
            tour?.size,
            mdxPick(mdx, [
              "Sqft",
              "Floor Area",
              "Total Floor Area",
              "Floor Area -Grand Total",
              "Floor Area-Grand Total",
              "Grand Total",
              "Finished Floor (Total)",
            ]),
          ]),
          lot: pickText([
            tour?.lot,
            tour?.lotsize,
            tour?.lot_size,
            mdxPick(mdx, ["Lot Size", "LotSize", "Lot Sqft", "Lot Area", "Lot (sq.ft.)"]),
          ]),
          description: pickText([
            tour?.description,
            mdxPick(mdx, ["Remarks", "Public Remarks", "PublicRemarks", "Internet Remarks"]),
          ]),
          year: pickText([
            tour?.built,
            tour?.year,
            mdxPick(mdx, ["Approx Year Built", "Year Built", "YearBuilt"]),
          ]),
          tourUrl: pickText([
            tour?.fullpublicurl,
            tour?.fullPublicUrl,
            tour?.virtual_tour,
            `https://www.cotala.com/tours/${tourId}/`,
          ]),
        };
        setListing(nextListing);
        setCaption(socialCaption(nextListing, "long"));
        setVideoUrl(video.fileUrl);
        setYoutubeUrl(video.youtubeUrl);
        setFloorplans(floorplanUrls(tour as Record<string, unknown> | undefined));
        setTourUrl(
          pickText([
            tour?.fullpublicurl,
            tour?.fullPublicUrl,
            tour?.virtual_tour,
            `https://www.cotala.com/tours/${tourId}/`,
          ]),
        );

        const profileData = profile?.status ? (profile.data as Record<string, unknown>) : null;
        const contact = (profileData?.contact as Record<string, unknown> | undefined)?.primary as
          | Record<string, unknown>
          | undefined;
        const assets = (profileData?.media_preferences as Record<string, unknown> | undefined)?.assets as
          | Record<string, string>
          | undefined;
        const agentRec = (profileData?.agent as Record<string, unknown> | undefined) || agent || {};
        const looksLikeUrl = (s: unknown) =>
          typeof s === "string" && (/^https?:\/\//i.test(s) || s.startsWith("data:"));
        const agentName = String(contact?.name || agentRec.name || "").trim();
        setBrand({
          name: agentName,
          phone: String(contact?.phone || agentRec.phone || "").trim(),
          email: String(contact?.email || agentRec.email || "").trim(),
          website: String(contact?.url || agentRec.url || agentRec.website || "").trim(),
          brokerage: String(agentRec.brokerage || tour?.brokerage || "").trim(),
          logo: looksLikeUrl(assets?.logo)
            ? String(assets?.logo)
            : looksLikeUrl(assets?.broker_logo)
              ? String(assets?.broker_logo)
              : "",
          headshot: looksLikeUrl(assets?.headshot)
            ? String(assets?.headshot)
            : looksLikeUrl(agentRec.headshot_url)
              ? String(agentRec.headshot_url)
              : looksLikeUrl(agentRec.coverimage)
                ? String(agentRec.coverimage)
                : "",
          bg: String(agentRec.bgColour || agentRec.bgcolour || "#101214"),
          text: String(agentRec.textColour || agentRec.textcolour || "#ffffff"),
          accent: String(agentRec.accentColour || "#B082F2"),
          gender: inferAgentGender(
            agentName,
            agentRec.gender ?? agentRec.sex ?? contact?.gender ?? contact?.sex ?? profileData?.gender,
          ),
        });
      } catch (error) {
        console.error("Failed to load marketing kit", error);
      } finally {
        if (!cancelled) setLoadingKit(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [tourId]);

  useEffect(() => {
    if (!tourId || photos.length) return;
    const row = listings.find((item) => String(item.tourid) === String(tourId));
    if (!row) return;
    const fromList = collectUrls(row.multipleimages, tourId);
    const cover = listingCoverUrl(row);
    const next = fromList.length ? fromList : cover ? [cover] : [];
    if (!next.length) return;
    setPhotos(next);
    setSlots(readSlots(tourId, next));
  }, [listings, tourId, photos.length]);

  const filteredListings = useMemo(() => {
    if (!searchQuery) return listings;
    const q = searchQuery.toLowerCase();
    return listings.filter(
      (row) =>
        row.address?.toLowerCase().includes(q) ||
        row.city?.toLowerCase().includes(q) ||
        String(row.tourid).includes(q),
    );
  }, [listings, searchQuery]);

  const openKit = (id: string | number) => setLocation(`/ai-tool?id=${id}`);

  const setSlot = (group: keyof SlotMap, index: number, url: string) => {
    setSlots((prev) => {
      const base = [...(prev[group] || [])];
      while (base.length <= index) base.push("");
      base[index] = url;
      const next = { ...prev, [group]: base };
      if (tourId) writeSlots(tourId, next);
      return next;
    });
  };

  const downloadZip = async () => {
    if (!photos.length) return;
    setZipping(true);
    setZipError(null);
    try {
      await downloadPhotosZip(photos, `listing_${tourId}_photos.zip`);
    } catch (error) {
      setZipError(error instanceof Error ? error.message : "Could not download photos");
    } finally {
      setZipping(false);
    }
  };

  useEffect(() => {
    if (!tourId) return;
    const hash = window.location.hash.replace(/^#/, "").trim();
    if (!hash) return;
    const timer = window.setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveNav(hash);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [tourId]);

  const goSection = (id: string) => {
    setActiveNav(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const copyValue = async (key: string, value: string) => {
    try {
      await copyText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((cur) => (cur === key ? null : cur)), 1600);
    } catch {
      setCopied(null);
    }
  };

  const completeness = [
    listing.price,
    listing.beds,
    listing.baths,
    listing.sqft,
    listing.mls,
    brand.logo || brand.headshot,
  ].filter(Boolean).length;
  const completePct = Math.round((completeness / 6) * 100);
  const qrSrc = tourUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(tourUrl)}`
    : "";
  const mlsUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/ai-tool?id=${tourId}`;

  return (
    <div className="min-h-screen bg-black text-white">
      <div
        className="new-bg-4 w-full relative"
        style={{
          backgroundImage: `url(${tourId && photos[0] ? photos[0] : heroBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center center",
          height: tourId ? "260px" : "200px",
          minHeight: tourId ? "260px" : "200px",
        }}
      >
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative h-full flex flex-col justify-end p-6 md:p-8 z-10">
          <div className="overlay-1">
            <h2 className="text-white text-3xl md:text-4xl font-bold">
              {tourId ? "Marketing Kit" : "AI Tool"}
            </h2>
            {tourId && listing.address ? (
              <p className="text-white/80 mt-2 mb-0">
                {listing.address}
                {listing.mls ? ` · MLS® ${listing.mls}` : ""}
                {photos.length ? ` · ${photos.length} photos` : ""}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {!tourId ? (
        <div className="service-package">
          <div className="container mx-auto mb-4 pt-6 px-4">
            <p className="text-white/70 mb-4">
              Select a listing. Photos, downloads, social posts, reels, and postcards all use this tour’s real Cotala photos.
            </p>
            <Input
              type="text"
              className="w-full text-white bg-black/40 border-white/20"
              placeholder="Search listing…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="container mx-auto pb-5 px-4">
            {loadingList ? (
              <KitLoader />
            ) : filteredListings.length === 0 ? (
              <p className="text-center text-white py-12">No listings found</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredListings.map((row) => {
                  const imageSrc = listingCoverUrl(row);
                  return (
                    <div
                      key={String(row.tourid)}
                      className="property-card-wrapper cursor-pointer"
                      onClick={() => openKit(row.tourid)}
                    >
                      <div
                        className="card property-card flex flex-col hover:opacity-90 transition-opacity"
                        style={{
                          backgroundColor: "#040405",
                          borderColor: "#1a1a1a",
                          borderWidth: 1,
                          borderStyle: "solid",
                        }}
                      >
                        {imageSrc ? (
                          <img
                            src={imageSrc}
                            className="property-img"
                            alt=""
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="property-img flex items-center justify-center text-white/40 text-sm" style={{ minHeight: 160 }}>
                            No photos
                          </div>
                        )}
                        <div className="card-body flex flex-col flex-grow px-3 py-3" style={{ backgroundColor: "#040405" }}>
                          <h5 className="text-white mb-0 text-lg font-semibold">
                            {formatAddress(row.unit, row.address || "No Address", row.city)}
                          </h5>
                          <div className="flex justify-between items-center mt-3">
                            {row.mls ? <p className="text-white/50 mb-0 text-sm">MLS #{String(row.mls)}</p> : <span />}
                            <span className="property-status">{row.status || "Active"}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : loadingKit ? (
        <KitLoader />
      ) : (
        <>
          <div className="sticky top-0 z-30 bg-black/95 backdrop-blur border-b border-white/10 pt-20">
            <div className="container mx-auto px-4 pl-16 pr-4 md:pl-6 md:pr-8 flex gap-1 overflow-x-auto">
              {KIT_NAV.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => goSection(item.id)}
                  className={`px-3 py-3 text-sm whitespace-nowrap border-b-2 ${
                    activeNav === item.id
                      ? "text-[#B082F2] border-[#B082F2]"
                      : "text-white/55 border-transparent hover:text-white"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="container mx-auto px-4 py-6 pb-24 space-y-14">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                className="text-sm text-white/70 hover:text-white"
                onClick={() => setLocation("/ai-tool")}
              >
                ← All listings
              </button>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="border border-white/40 text-white uppercase tracking-wide rounded-xl px-4 py-2 text-sm hover:bg-white/10"
                  onClick={() => goSection("photos")}
                >
                  Download Center
                </button>
                <button
                  type="button"
                  disabled={!photos.length || zipping}
                  onClick={() => void downloadZip()}
                  className={kitBtn}
                >
                  {zipping ? "Preparing zip…" : "Download photos"}
                </button>
              </div>
              {zipError ? <p className="w-full text-red-400 text-sm mb-0">{zipError}</p> : null}
            </div>

            <section
              id="info"
              className="scroll-mt-44 rounded-xl p-5 md:p-8 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8"
              style={{ background: "#0b0b0c", border: "1px solid #1a1a1a" }}
            >
              <div>
                <h3 className="text-xl font-semibold mb-1">Profile & property info</h3>
                <p className="text-white/45 text-sm mb-5">Edits update every story, postcard, and reel on this page.</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {(
                    [
                      ["price", "Price"],
                      ["beds", "Beds"],
                      ["baths", "Baths"],
                      ["sqft", "Square ft"],
                      ["lot", "Lot size"],
                      ["mls", "MLS#"],
                      ["year", "Year built"],
                    ] as Array<[keyof KitListing, string]>
                  ).map(([key, label]) => (
                    <label key={key} className="block">
                      <span className="text-xs text-white/50 block mb-1">{label}</span>
                      <input
                        value={String(listing[key] || "")}
                        onChange={(e) => setListing((prev) => ({ ...prev, [key]: e.target.value }))}
                        className="w-full rounded-lg px-3 py-2 text-sm bg-black/40 border border-white/15 text-white"
                      />
                    </label>
                  ))}
                </div>
                <label className="block mt-3">
                  <span className="text-xs text-white/50 block mb-1">Description</span>
                  <textarea
                    value={listing.description || ""}
                    onChange={(e) => setListing((prev) => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    className="w-full rounded-lg px-3 py-2 text-sm bg-black/40 border border-white/15 text-white"
                  />
                </label>
                <div className="mt-4">
                  <div className="flex justify-between text-xs mb-1">
                    <span>Listing info {completePct}% complete</span>
                    <span className="text-white/40">Add a logo or headshot in Profile for branded assets</span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-[#B082F2]" style={{ width: `${completePct}%` }} />
                  </div>
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold mb-3">Brand on every asset</p>
                <div className="flex gap-3">
                  <div className="flex-1 rounded-lg overflow-hidden border border-white/10">
                    {brand.headshot ? (
                      <img src={brand.headshot} alt="" className="w-full h-24 object-cover" />
                    ) : (
                      <div className="h-24 bg-white/5 flex items-center justify-center text-xs text-white/35">Headshot</div>
                    )}
                    <p className="text-[11px] text-white/45 px-2 py-1.5 mb-0">{brand.name || "Agent"}</p>
                  </div>
                  <div className="flex-1 rounded-lg overflow-hidden border border-white/10">
                    {brand.logo ? (
                      <img src={brand.logo} alt="" className="w-full h-24 object-contain bg-white/5 p-2" />
                    ) : (
                      <div className="h-24 bg-white/5 flex items-center justify-center text-xs text-white/35">Logo</div>
                    )}
                    <p className="text-[11px] text-white/45 px-2 py-1.5 mb-0">{brand.brokerage || "Brokerage"}</p>
                  </div>
                </div>
              </div>
            </section>

            <DownloadCenter
              tourId={tourId}
              photos={photos}
              floorplans={floorplans}
            />

            <ListingVideo
              tourId={tourId}
              fileUrl={videoUrl}
              youtubeUrl={youtubeUrl}
              poster={photos[0]}
              address={listing.address}
              photos={photos}
              listing={listing}
              brand={brand}
            />

            {photos.length === 0 ? (
              <p className="text-white/50">No photos on this listing yet — branded kit uses only this tour’s real photos.</p>
            ) : (
              <>
                <section id="reels" className="scroll-mt-44">
                  <ReelStudio
                    active={activeNav === "reels"}
                    photos={slots.reel.length ? slots.reel : photos}
                    listing={listing}
                    brand={brand}
                    fileName={`${tourId}_reel`}
                    onEditPhoto={(index) => setEditor({ group: "reel", index })}
                  />
                </section>

                <SlideshowStudio
                  active={activeNav === "slideshows"}
                  photos={photos}
                  listing={listing}
                  brand={brand}
                  fileName={`${tourId}_slideshow`}
                  onBrandGender={(gender) => setBrand((prev) => ({ ...prev, gender }))}
                />

                <section id="stories" className="scroll-mt-44">
                  <h3 className="text-xl font-semibold mb-4">
                    Stories <span className="text-sm font-mono text-white/40">{slots.stories.length}</span>
                  </h3>
                  <div className="flex flex-wrap gap-5">
                    {slots.stories.map((photo, i) => (
                      <StoryCard
                        key={`story-${i}-${designRevision}`}
                        title={`Story #${i + 1}`}
                        photo={photo}
                        listing={listing}
                        brand={brand}
                        tourId={tourId}
                        designGroup="stories"
                        designIndex={i}
                        designRevision={designRevision}
                        headline={ribbons[`stories-${i}`] || (i === 1 ? "OPEN HOUSE" : "JUST LISTED")}
                        ribbon={ribbons[`stories-${i}`] || (i === 1 ? "OPEN HOUSE" : "JUST LISTED")}
                        downloadName={`${tourId}_story_${i + 1}.jpg`}
                        edited={Boolean(tourId && loadStoredDesign(tourId, "stories", i))}
                        onEdit={() => setEditor({ group: "stories", index: i })}
                      />
                    ))}
                  </div>
                  <StoryStudio photos={photos} listing={listing} brand={brand} tourId={tourId} />
                </section>

                <section id="square" className="scroll-mt-44">
                  <h3 className="text-xl font-semibold mb-4">
                    Square posts <span className="text-sm font-mono text-white/40">{slots.square.length}</span>
                  </h3>
                  <div className="flex flex-wrap gap-5">
                    {slots.square.map((photo, i) => (
                      <SquareCard
                        key={`sq-${i}-${designRevision}`}
                        title={`Square #${i + 1}`}
                        photo={photo}
                        listing={listing}
                        brand={brand}
                        tourId={tourId}
                        designGroup="square"
                        designIndex={i}
                        designRevision={designRevision}
                        ribbon={ribbons[`square-${i}`] || "JUST LISTED"}
                        downloadName={`${tourId}_square_${i + 1}.jpg`}
                        edited={Boolean(tourId && loadStoredDesign(tourId, "square", i))}
                        onEdit={() => setEditor({ group: "square", index: i })}
                      />
                    ))}
                  </div>
                </section>

                <section id="landscape" className="scroll-mt-44">
                  <h3 className="text-xl font-semibold mb-4">
                    Landscape posts <span className="text-sm font-mono text-white/40">{slots.landscape.length}</span>
                  </h3>
                  <div className="flex flex-wrap gap-5">
                    {slots.landscape.map((photo, i) => (
                      <LandscapeCard
                        key={`ls-${i}-${designRevision}`}
                        title={`Landscape #${i + 1}`}
                        photo={photo}
                        extra={i === 0 ? [slots.landscape[1] || photos[1] || ""] : []}
                        listing={listing}
                        brand={brand}
                        tourId={tourId}
                        designGroup="landscape"
                        designIndex={i}
                        designRevision={designRevision}
                        ribbon={ribbons[`landscape-${i}`] || "JUST LISTED"}
                        downloadName={`${tourId}_landscape_${i + 1}.jpg`}
                        edited={Boolean(tourId && loadStoredDesign(tourId, "landscape", i))}
                        onEdit={() => setEditor({ group: "landscape", index: i })}
                      />
                    ))}
                    <EmailBannerCard
                      title="Email banner"
                      photo={slots.email[0] || photos[0]}
                      listing={listing}
                      brand={brand}
                      downloadName={`${tourId}_email_banner.jpg`}
                      onEdit={() => setEditor({ group: "email", index: 0 })}
                    />
                  </div>
                </section>

                <section id="pinterest" className="scroll-mt-44">
                  <h3 className="text-xl font-semibold mb-4">Pinterest tower</h3>
                  <PinterestCard
                    title="Tower #1"
                    photo={slots.pinterest[0] || photos[0]}
                    extra={slots.pinterest.slice(1)}
                    listing={listing}
                    brand={brand}
                    downloadName={`${tourId}_pinterest.jpg`}
                    onEdit={() => setEditor({ group: "pinterest", index: 0 })}
                  />
                </section>

                <section id="postcard" className="scroll-mt-44">
                  <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
                    <div>
                      <h3 className="text-xl font-semibold mb-1">Postcard</h3>
                      <p className="text-white/55 text-sm mb-0">
                        Print front and back — same Just Listed / Just Sold template as Design Job. Click a side to edit.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {(["JUST LISTED", "JUST SOLD"] as const).map((status) => {
                        const active = (ribbons["postcard-0"] || "JUST LISTED") === status;
                        return (
                          <button
                            key={status}
                            type="button"
                            onClick={() => setRibbons((prev) => ({ ...prev, "postcard-0": status }))}
                            className="text-xs px-3 py-1.5 rounded-full border"
                            style={{
                              borderColor: active ? "#B082F2" : "rgba(255,255,255,0.18)",
                              color: active ? "#fff" : "rgba(255,255,255,0.6)",
                              background: active ? "rgba(176,130,242,0.15)" : "transparent",
                            }}
                          >
                            {status === "JUST LISTED" ? "Just listed" : "Just sold"}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        className={kitBtn}
                        onClick={() => setEditor({ group: "postcard", index: 0, page: 0 })}
                      >
                        Start designing
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-6">
                    <PostcardFront
                      title="Front"
                      ribbon={ribbons["postcard-0"] || "JUST LISTED"}
                      photos={slots.postcard}
                      listing={listing}
                      brand={brand}
                      downloadName={`${tourId}_postcard_front.jpg`}
                      onEdit={() => setEditor({ group: "postcard", index: 0, page: 0 })}
                    />
                    <PostcardBack
                      title="Back"
                      ribbon={ribbons["postcard-0"] || "JUST LISTED"}
                      photos={slots.postcard}
                      listing={listing}
                      brand={brand}
                      downloadName={`${tourId}_postcard_back.jpg`}
                      onEdit={() => setEditor({ group: "postcard", index: 0, page: 1 })}
                    />
                  </div>
                </section>

                <section id="brochure" className="scroll-mt-44">
                  <h3 className="text-xl font-semibold mb-2">Brochure</h3>
                  <div className="flex flex-wrap gap-6">
                    <BrochureCard
                      title="Brochure · bi-fold"
                      photos={slots.brochure}
                      listing={listing}
                      brand={brand}
                      downloadName={`${tourId}_brochure.jpg`}
                      onEdit={() => setEditor({ group: "brochure", index: 0 })}
                    />
                  </div>
                </section>
              </>
            )}

            <section
              id="site"
              className="scroll-mt-44 rounded-xl p-5 md:p-8 grid grid-cols-1 md:grid-cols-3 gap-6"
              style={{ background: "#0b0b0c", border: "1px solid #1a1a1a" }}
            >
              <div>
                <h3 className="text-xl font-semibold mb-3">Property site</h3>
                <div className="rounded-lg overflow-hidden border border-white/10">
                  {photos[0] ? (
                    <img src={photos[0]} alt="" className="w-full h-36 object-cover" />
                  ) : (
                    <div className="h-36 bg-white/5" />
                  )}
                  <div className="p-3">
                    <p className="text-sm font-semibold mb-0">{listing.address}</p>
                    {listing.price ? <p className="text-xs text-[#B082F2] mb-0">{listing.price}</p> : null}
                  </div>
                </div>
                {tourUrl ? (
                  <a href={tourUrl} target="_blank" rel="noreferrer" className="inline-block mt-3 text-sm text-[#B082F2]">
                    Preview tour →
                  </a>
                ) : null}
              </div>
              <div>
                <p className="text-sm font-semibold mb-3">Share links</p>
                <div className="rounded-lg border border-white/10 p-3 mb-3">
                  <p className="text-xs text-white/45 mb-1">Copy URL</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-mono text-white/70 mb-0 truncate flex-1">{tourUrl || "—"}</p>
                    <button
                      type="button"
                      className="text-xs text-[#B082F2] shrink-0"
                      onClick={() => void copyValue("branded", tourUrl)}
                    >
                      {copied === "branded" ? "Copied" : "Copy URL"}
                    </button>
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 p-3 mb-3">
                  <p className="text-xs text-white/45 mb-1">Copy embed code</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-mono text-white/70 mb-0 truncate flex-1">
                      {tourUrl ? embedCodeFor(tourUrl, listing.address || "Property tour", "page") : "—"}
                    </p>
                    <button
                      type="button"
                      className="text-xs text-[#B082F2] shrink-0"
                      onClick={() =>
                        void copyValue("embed", embedCodeFor(tourUrl, listing.address || "Property tour", "page"))
                      }
                    >
                      {copied === "embed" ? "Copied" : "Copy embed"}
                    </button>
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 p-3">
                  <p className="text-xs text-white/45 mb-1">Kit link</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-mono text-white/70 mb-0 truncate flex-1">{mlsUrl}</p>
                    <button
                      type="button"
                      className="text-xs text-[#B082F2]"
                      onClick={() => void copyValue("kit", mlsUrl)}
                    >
                      {copied === "kit" ? "Copied" : "Copy URL"}
                    </button>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold mb-3">QR code</p>
                {qrSrc ? (
                  <img src={qrSrc} alt="Listing QR" className="w-28 h-28 rounded bg-white p-1" />
                ) : (
                  <p className="text-white/40 text-sm">No tour URL on this listing.</p>
                )}
                {qrSrc ? (
                  <a href={qrSrc} download={`${tourId}_qr.png`} className="block mt-2 text-xs text-[#B082F2]">
                    Download QR
                  </a>
                ) : null}
              </div>
            </section>

            <section
              id="copy"
              className="scroll-mt-44 rounded-xl p-5 md:p-8"
              style={{ background: "#0b0b0c", border: "1px solid #1a1a1a" }}
            >
              <h3 className="text-xl font-semibold mb-3">AI copy studio</h3>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={4}
                className="w-full rounded-lg px-3 py-2 text-sm bg-black/40 border border-white/15 text-white mb-3"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`text-sm ${kitBtn}`}
                  onClick={() => void copyValue("caption", caption)}
                >
                  {copied === "caption" ? "Copied" : "Copy caption"}
                </button>
                <button
                  type="button"
                  className="text-sm border border-white/30 text-white px-3 py-1.5 rounded-lg"
                  onClick={() => setCaption(socialCaption(listing, "short"))}
                >
                  Shorter
                </button>
                <button
                  type="button"
                  className="text-sm border border-white/30 text-white px-3 py-1.5 rounded-lg"
                  onClick={() => setCaption(socialCaption(listing, "long"))}
                >
                  Longer
                </button>
              </div>
            </section>
          </div>
        </>
      )}

      {editor ? (
        <KitEditor
          tourId={tourId}
          group={editor.group}
          index={editor.index}
          initialPage={editor.page}
          photos={photos}
          slots={slots}
          listing={listing}
          brand={brand}
          ribbon={ribbons[`${editor.group}-${editor.index}`]}
          onIndex={(i) => setEditor({ group: editor.group, index: i })}
          onSwap={(group, index, url) => setSlot(group, index, url)}
          onListing={setListing}
          onRibbon={(value) =>
            setRibbons((prev) => ({ ...prev, [`${editor.group}-${editor.index}`]: value }))
          }
          onClose={() => {
            setEditor(null);
            setDesignRevision((r) => r + 1);
          }}
        />
      ) : null}

      <PortalFooter />
    </div>
  );
}
