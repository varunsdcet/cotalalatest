import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { getPortalProfile, getUserIdFromStorage } from "@/lib/api";
import KitEditor, { type SlotMap } from "@/pages/ai-tool/kit-editor";
import type { KitBrand, KitListing } from "@/pages/ai-tool/kit-cards";
import { keepSlotsForListing, loadListingKitSource, uniquePhotos } from "@/pages/ai-tool/listing-photos";

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

function formatAddress(unit: unknown, address: string, city?: string) {
  const unitStr = unit != null && String(unit).trim() ? `${String(unit).trim()} ` : "";
  return `${unitStr}${address || "Listing"}${city ? `, ${city}` : ""}`.trim();
}

function emptySlots(photos: string[]): SlotMap {
  const none: string[] = [];
  return {
    stories: none,
    square: none,
    landscape: none,
    postcard: keepSlotsForListing([], photos, 6),
    reel: none,
    pinterest: none,
    flyer: none,
    brochure: none,
    email: none,
  };
}

function getTourIdFromUrl(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("id")?.trim() || "";
}

function getPostcardReturnPath(tourId: string): string {
  if (typeof window === "undefined") return "/design-job";
  const from = new URLSearchParams(window.location.search).get("from")?.trim() || "";
  if ((from === "listing-details" || from === "listing") && tourId) {
    return `/listing-details?id=${encodeURIComponent(tourId)}&tab=print_media`;
  }
  return "/design-job";
}

export default function PostcardStudio() {
  const [, setLocation] = useLocation();
  const [tourId, setTourId] = useState(getTourIdFromUrl);
  const returnPath = getPostcardReturnPath(tourId);
  const [photos, setPhotos] = useState<string[]>([]);
  const [slots, setSlots] = useState<SlotMap>(() => emptySlots([]));
  const [listing, setListing] = useState<KitListing>({
    address: "",
    mls: "",
    price: "",
    beds: "",
    baths: "",
    sqft: "",
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = getTourIdFromUrl();
    if (id !== tourId) setTourId(id);
  }, [tourId]);

  useEffect(() => {
    if (!tourId) {
      setLoading(false);
      setError("Missing listing id. Open this postcard from Design Job with a listing selected.");
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const userId = getUserIdFromStorage();
        const [{ photos: nextPhotos, tour, agent }, profile] = await Promise.all([
          loadListingKitSource(tourId, userId),
          getPortalProfile().catch(() => null),
        ]);
        if (cancelled) return;
        const unique = uniquePhotos(nextPhotos, tourId);
        const mdx = mlxMap(tour as Record<string, unknown> | undefined);
        setPhotos(unique);
        setSlots(emptySlots(unique));
        setListing({
          address: formatAddress(tour?.unit, String(tour?.address || ""), tour?.city ? String(tour.city) : ""),
          mls: pickText([tour?.mls, mdxPick(mdx, ["MLS Number", "MLS Number ", "MLS"])]),
          price: moneyish(pickText([mdxPick(mdx, ["List Price", "Price"]), tour?.price, tour?.listprice])),
          beds: pickText([tour?.beds, tour?.bedrooms, mdxPick(mdx, ["Bedrooms", "Beds"])]),
          baths: pickText([tour?.baths, tour?.bathrooms, mdxPick(mdx, ["Bathrooms", "Baths"])]),
          sqft: pickText([tour?.sqft, mdxPick(mdx, ["Sqft", "Floor Area -Grand Total", "Grand Total"])]),
          description: pickText([tour?.description, mdxPick(mdx, ["Remarks", "Public Remarks", "Internet Remarks"])]),
          year: pickText([tour?.built, tour?.year, mdxPick(mdx, ["Approx Year Built", "Year Built"])]),
          tourUrl: pickText([
            tour?.fullpublicurl,
            tour?.fullPublicUrl,
            tour?.virtual_tour,
            `https://www.cotala.com/tours/${tourId}/`,
          ]),
        });
        const profileData = profile?.status ? (profile.data as Record<string, unknown>) : null;
        const contact = (profileData?.contact as Record<string, unknown> | undefined)?.primary as
          | Record<string, unknown>
          | undefined;
        const assets = (profileData?.media_preferences as Record<string, unknown> | undefined)?.assets as
          | Record<string, string>
          | undefined;
        const agentRec = ((profileData?.agent as Record<string, unknown> | undefined) || agent || {}) as Record<string, unknown>;
        const looksLikeUrl = (s: unknown) =>
          typeof s === "string" && (/^https?:\/\//i.test(s) || s.startsWith("data:"));
        setBrand({
          name: String(contact?.name || agentRec.name || "").trim(),
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
              : "",
          bg: "#101214",
          text: "#ffffff",
          accent: "#B082F2",
        });
      } catch (err) {
        console.error("Failed to load postcard listing", err);
        if (!cancelled) setError("Could not load this listing.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [tourId, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-white/70">Loading postcard designer…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-3">
        <p>{error}</p>
        <button type="button" className="text-[#B082F2]" onClick={() => setLocation(returnPath)}>
          {returnPath.startsWith("/listing-details") ? "Back to Listing" : "Back to Design Job"}
        </button>
      </div>
    );
  }

  return (
    <KitEditor
      tourId={tourId}
      group="postcard"
      index={0}
      initialPage={0}
      photos={photos}
      slots={slots}
      listing={listing}
      brand={brand}
      ribbon="JUST LISTED"
      onIndex={() => undefined}
      onSwap={(group, index, url) => {
        setSlots((prev) => {
          const base = [...(prev[group] || [])];
          while (base.length <= index) base.push("");
          base[index] = url;
          return { ...prev, [group]: base };
        });
      }}
      onListing={setListing}
      onClose={() => setLocation(returnPath)}
    />
  );
}
