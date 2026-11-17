import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  getDesignJobOptions,
  getPortalListings,
  listingImage,
  type PortalListing,
} from "@/lib/api";
import { startFeatureSheetForListing } from "@/lib/start-feature-sheet";
import PortalFooter from "@/components/portal/PortalFooter";
import brochureImg from "@/pages/images/brochure.png";
import cardsImg from "@/pages/images/business-cards.png";
import magazineImg from "@/pages/images/listing-magazine-1.jpeg";
import sheetImg from "@/pages/images/p-2.jpg";
import cardImg from "@/pages/images/card.png";
import photoFallback from "@/pages/images/standard-real-estate-photography-4-1024x683.jpg";

type DesignProduct = {
  id: number | string;
  name?: string;
  class?: string;
  description?: string;
  image_url?: string;
  image?: string;
  productimage?: string;
  [key: string]: unknown;
};

const CATEGORY_COLORS = ["purple", "blue", "green"] as const;
const CATEGORY_ORDER = [
  "Feature Sheets",
  "Digital",
  "Banner",
  "Bifold",
  "Booklet",
  "Business Cards",
  "Post Cards",
  "Greeting Cards",
  "Door Knockers",
];

type DigitalRoute = "ai-tool" | "ai-tool#landscape" | "ai-tool#brochure" | "ai-tool#reels" | "new-appointment";

const DIGITAL_PRODUCTS: Array<DesignProduct & { digitalRoute?: DigitalRoute }> = [
  { id: "digital-1", name: "Marketing Kit", class: "Digital", image: magazineImg, digitalRoute: "ai-tool" },
  { id: "digital-2", name: "Social Posts & Reels", class: "Digital", image: brochureImg, digitalRoute: "ai-tool#reels" },
  { id: "banner-1", name: "Email Banner 16:9", class: "Banner", image: sheetImg, digitalRoute: "ai-tool#landscape" },
  { id: "bifold-1", name: "Bi-fold Brochure", class: "Bifold", image: brochureImg, digitalRoute: "ai-tool#brochure" },
  { id: "booklet-1", name: "8-Page Listing Booklet", class: "Booklet", image: magazineImg, digitalRoute: "new-appointment" },
];

const DESIGN_EDITOR =
  (import.meta.env.VITE_DESIGN_EDITOR_URL as string | undefined)?.replace(/\/$/, "") ||
  "https://design.cotala.com";

const PRINT_SIZE_BY_CATEGORY: Record<string, string> = {
  "Post Cards": "141",
  "Business Cards": "141",
  "Greeting Cards": "141",
  "Door Knockers": "141",
  "Feature Sheets": "19",
};

const FALLBACK_PRODUCTS: DesignProduct[] = [
  { id: 19, name: "Oversized Feature Sheet | 01", class: "Feature Sheets", image: sheetImg },
  { id: 19, name: "Oversized Feature Sheet | 02", class: "Feature Sheets", image: sheetImg },
  { id: 19, name: "Oversized Feature Sheet | 03", class: "Feature Sheets", image: magazineImg },
  { id: 141, name: 'Post Card 8.5"x5.5" | 01', class: "Post Cards", image: brochureImg },
  { id: 141, name: 'Post Card 8.5"x5.5" | 02', class: "Post Cards", image: magazineImg },
  { id: 141, name: 'Post Card 8.5"x5.5" | 03', class: "Post Cards", image: sheetImg },
  { id: 141, name: 'Post Card 8.5"x5.5" | 04', class: "Post Cards", image: brochureImg },
  { id: 141, name: 'Post Card 8.5"x5.5" | 05', class: "Post Cards", image: magazineImg },
  { id: 141, name: 'Post Card 8.5"x5.5" | 06', class: "Post Cards", image: brochureImg },
  { id: 141, name: "Door Knockers 01", class: "Door Knockers", image: cardImg },
  { id: 141, name: "Door Knockers 02", class: "Door Knockers", image: cardsImg },
  { id: 141, name: "Door Knockers 03", class: "Door Knockers", image: cardImg },
  { id: 141, name: "Door Knockers 04", class: "Door Knockers", image: cardsImg },
  { id: 141, name: "Business Cards | 01", class: "Business Cards", image: cardsImg },
  { id: 141, name: "Business Cards | 02", class: "Business Cards", image: cardImg },
  { id: 141, name: "Greeting Cards | 01", class: "Greeting Cards", image: magazineImg },
  ...DIGITAL_PRODUCTS,
];

function isProduct(value: unknown): value is DesignProduct {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const rec = value as Record<string, unknown>;
  return rec.id != null || typeof rec.name === "string";
}

function asProductList(value: unknown, depth = 0): DesignProduct[] {
  if (value == null || depth > 4) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (isProduct(item)) return [item];
      return asProductList(item, depth + 1);
    });
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["products", "list", "data"]) {
      const nested = asProductList(record[key], depth + 1);
      if (nested.length) return nested;
    }
    const grouped = Object.values(record).flatMap((item) => asProductList(item, depth + 1));
    return grouped.filter(isProduct);
  }
  return [];
}

function categoryName(raw: string | undefined) {
  const s = (raw || "Other").trim();
  if (/feature|oversize/i.test(s)) return "Feature Sheets";
  if (/business/i.test(s)) return "Business Cards";
  if (/post\s*card|postcard|print\s*card|eddm|mailer/i.test(s)) return "Post Cards";
  if (/greeting/i.test(s)) return "Greeting Cards";
  if (/door/i.test(s)) return "Door Knockers";
  if (/digital|marketing kit|social/i.test(s)) return "Digital";
  if (/banner|email/i.test(s)) return "Banner";
  if (/bifold|brochure|bi-fold/i.test(s)) return "Bifold";
  if (/booklet|magazine/i.test(s)) return "Booklet";
  if (/flyer/i.test(s)) return "Other";
  return s || "Other";
}

function digitalRouteFor(product: DesignProduct): DigitalRoute | null {
  const route = (product as DesignProduct & { digitalRoute?: DigitalRoute }).digitalRoute;
  if (route) return route;
  const hay = productLabel(product);
  if (/booklet/i.test(hay)) return "new-appointment";
  if (/banner|email/i.test(hay)) return "ai-tool#landscape";
  if (/bifold|brochure/i.test(hay)) return "ai-tool#brochure";
  if (/digital|marketing|social|reel/i.test(hay)) return "ai-tool";
  return null;
}

function categorySlug(name: string) {
  return `dj-cat-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function resolveAssetUrl(raw: string) {
  const s = raw.trim();
  if (!s || /logo1\.png/i.test(s)) return "";
  if (/^https?:\/\//i.test(s)) {
    return s.replace("/newcotala24/webapi2025dec/assets/", "/newcotala24/assets/");
  }
  if (s.startsWith("/")) return `https://cotala.com/newcotala24${s}`;
  if (s.startsWith("assets/")) return `https://cotala.com/newcotala24/${s}`;
  return `https://cotala.com/newcotala24/assets/print/${s}`;
}

function productImage(product: DesignProduct | undefined, index: number) {
  const fromApi = product?.image_url || product?.image || product?.productimage;
  if (typeof fromApi === "string" && fromApi.trim() && !/logo1\.png/i.test(fromApi)) {
    if (/^https?:\/\//i.test(fromApi)) return resolveAssetUrl(fromApi);
    if (fromApi.startsWith("/") || fromApi.startsWith("data:") || fromApi.startsWith("blob:")) return fromApi;
    return resolveAssetUrl(fromApi);
  }
  const name = `${product?.class || ""} ${product?.name || ""}`.toLowerCase();
  if (name.includes("feature") || name.includes("sheet")) return sheetImg;
  if (name.includes("business")) return cardsImg;
  if (name.includes("door")) return cardImg;
  if (name.includes("post")) return brochureImg;
  if (name.includes("flyer") || name.includes("greeting")) return magazineImg;
  return [sheetImg, cardsImg, magazineImg, brochureImg, cardImg][index % 5];
}

function productLabel(product: DesignProduct) {
  return `${product.class || ""} ${product.name || ""} ${product.description || ""}`.toLowerCase();
}

const IN_APP_POSTCARD_SIZES = new Set(["115", "140"]);

function isPostcardProduct(product: DesignProduct, category?: string) {
  if (category === "Post Cards" || categoryName(product.class) === "Post Cards") return true;
  const hay = productLabel(product);
  if (/post\s*card|postcard|eddm|direct\s*mail|mailer/i.test(hay)) return true;
  if (/8\.?\s*5/.test(hay) && /5\.?\s*5/.test(hay)) return true;
  const size = printSizeId(product);
  if (IN_APP_POSTCARD_SIZES.has(size) && !isOversizeProduct(product) && !/business|greeting|door|flyer|feature/i.test(hay)) {
    return true;
  }
  return false;
}

function isOversizeProduct(product: DesignProduct) {
  if (/post\s*card|postcard/i.test(productLabel(product))) return false;
  return /oversize|feature sheet/i.test(productLabel(product)) || String(product.id) === "19";
}

function printSizeId(product: DesignProduct) {
  for (const candidate of [product.id, product.prod, product.size, product.product_id]) {
    const n = Number(candidate);
    if (Number.isFinite(n) && n > 0) return String(n);
  }
  return PRINT_SIZE_BY_CATEGORY[categoryName(product.class)] || "141";
}

function printEditorUrl(product: DesignProduct, tourId: string) {
  if (isPostcardProduct(product)) {
    return `/design-job/postcard?id=${encodeURIComponent(tourId)}`;
  }
  const size = encodeURIComponent(printSizeId(product));
  const tour = encodeURIComponent(tourId);
  const path = isOversizeProduct(product) ? "/create-oversized-card" : "/create-print-card";
  return `${DESIGN_EDITOR}${path}?size=${size}&tourid=${tour}`;
}

function listingLabel(listing: PortalListing) {
  const unit = listing.unit ? `${listing.unit} ` : "";
  const addr = listing.full_address || `${unit}${listing.address || "Listing"}${listing.city ? `, ${listing.city}` : ""}`;
  return addr;
}

function listingsFromResponse(data: { status?: boolean; data?: unknown }) {
  const payload = data.data;
  if (Array.isArray(payload)) return payload as PortalListing[];
  if (payload && typeof payload === "object") {
    const rec = payload as Record<string, unknown>;
    if (Array.isArray(rec.listings)) return rec.listings as PortalListing[];
    if (Array.isArray(rec.data)) return rec.data as PortalListing[];
  }
  return [];
}

function CarouselRow({
  variant,
  children,
}: {
  variant: "explore" | "templates";
  children: React.ReactNode;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => {
    const amount = variant === "explore" ? 480 : 360;
    rowRef.current?.scrollBy({ left: dir * amount, behavior: "smooth" });
  };
  return (
    <div className={`dj-carousel dj-carousel-${variant}`}>
      <div ref={rowRef} className={`dj-track dj-track-${variant}`}>
        {children}
      </div>
      <button type="button" className="swiper-button-prev" onClick={() => scroll(-1)} aria-label="Previous">
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button type="button" className="swiper-button-next" onClick={() => scroll(1)} aria-label="Next">
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function DesignJob() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<DesignProduct[]>(FALLBACK_PRODUCTS);
  const [listings, setListings] = useState<PortalListing[]>([]);
  const [listingSearch, setListingSearch] = useState("");
  const [picked, setPicked] = useState<DesignProduct | null>(null);
  const [pickedCategory, setPickedCategory] = useState("");
  const [tourId, setTourId] = useState("");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const data = await getDesignJobOptions(query);
        const payload = ((data as { data?: unknown }).data || data) as unknown;
        const list = asProductList(payload);
        const merged = [...(list.length ? list : FALLBACK_PRODUCTS)];
        const seen = new Set(merged.map((p) => `${p.class}|${p.name}`));
        for (const digital of DIGITAL_PRODUCTS) {
          const key = `${digital.class}|${digital.name}`;
          if (!seen.has(key)) {
            merged.push(digital);
            seen.add(key);
          }
        }
        setProducts(merged);
      } catch (error) {
        console.error("Failed to load design jobs", error);
        setProducts(FALLBACK_PRODUCTS);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await getPortalListings({ per_page: 200 });
        if (!cancelled) setListings(listingsFromResponse(data));
      } catch (error) {
        console.error("Failed to load listings", error);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    const withoutFlyers = products.filter(
      (product) => !/flyer/i.test(`${product.name || ""} ${product.class || ""}`),
    );
    if (!term) return withoutFlyers;
    return withoutFlyers.filter((product) => {
      const hay = `${product.name || ""} ${product.class || ""} ${product.description || ""}`.toLowerCase();
      return hay.includes(term);
    });
  }, [products, query]);

  const grouped = useMemo(() => {
    const map: Record<string, DesignProduct[]> = {};
    visible.forEach((product) => {
      const key = categoryName(product.class);
      if (!map[key]) map[key] = [];
      map[key].push(product);
    });
    const keys = [
      ...CATEGORY_ORDER.filter((name) => map[name]?.length),
      ...Object.keys(map).filter((name) => !CATEGORY_ORDER.includes(name)),
    ];
    return keys.map((name) => ({ name, items: map[name] }));
  }, [visible]);

  const exploreCats = grouped.map((g) => g.name);

  const listingChoices = useMemo(() => {
    const term = listingSearch.trim().toLowerCase();
    const filtered = term
      ? listings.filter((row) => {
          const hay = `${row.tourid} ${listingLabel(row)} ${row.mls || ""}`.toLowerCase();
          return hay.includes(term);
        })
      : listings;
    const typed = listingSearch.trim();
    if (/^\d+$/.test(typed) && !filtered.some((row) => String(row.tourid) === typed)) {
      return [{ tourid: typed, address: `Tour ${typed}` } as PortalListing, ...filtered];
    }
    return filtered;
  }, [listings, listingSearch]);

  const selectedListing =
    listings.find((row) => String(row.tourid) === String(tourId)) ||
    listingChoices.find((row) => String(row.tourid) === String(tourId)) ||
    (tourId ? ({ tourid: tourId } as PortalListing) : null);

  const openProduct = (product: DesignProduct, category: string) => {
    setPicked(product);
    setPickedCategory(category);
    setTourId("");
    setListingSearch("");
    setStartError(null);
  };

  const startDesign = () => {
    if (!picked || !tourId) {
      setStartError("Choose a listing to design.");
      return;
    }
    setStartError(null);
    const digital = digitalRouteFor(picked);
    if (digital) {
      setPicked(null);
      if (digital === "new-appointment") {
        setLocation(`/new-appointment?tourid=${encodeURIComponent(String(tourId))}`);
        return;
      }
      const hash = digital.includes("#") ? digital.split("#")[1] : "";
      const base = `/ai-tool?id=${encodeURIComponent(String(tourId))}`;
      setLocation(hash ? `${base}#${hash}` : base);
      return;
    }
    if (isPostcardProduct(picked, pickedCategory)) {
      setPicked(null);
      setLocation(`/design-job/postcard?id=${encodeURIComponent(String(tourId))}`);
      return;
    }
    if (isOversizeProduct(picked) || pickedCategory === "Feature Sheets") {
      const listing = selectedListing;
      setStarting(true);
      void (async () => {
        try {
          const href = await startFeatureSheetForListing({
            tourid: tourId,
            mls: listing?.mls,
            address: listing?.address,
            city: listing?.city,
            unit: listing?.unit,
          });
          setPicked(null);
          setLocation(href);
        } catch (err) {
          console.error("Failed to start feature sheet", err);
          setPicked(null);
          setLocation(`/feature-sheet-builder?id=${encodeURIComponent(String(tourId))}`);
        } finally {
          setStarting(false);
        }
      })();
      return;
    }
    setStarting(true);
    window.location.assign(printEditorUrl(picked, String(tourId)));
  };

  return (
    <div className="min-h-screen bg-black text-white design-job-page">
      <div className="hero-section design-job-hero">
        <div className="container mx-auto px-4">
          <h1 className="hero-title">What would you like to design?</h1>
          <form
            className="search-box"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(search.trim());
            }}
          >
            <input
              type="text"
              placeholder="Search templates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="submit" className="search-btn" aria-label="Search templates">
              <ArrowRight className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>

      <div className="service-package">
        <div className="container mx-auto px-4 mb-8 pb-10">
          <div className="section">
            <div className="section-title-1">Explore templates</div>
            {loading ? (
              <div className="text-white/60 py-6">Loading templates...</div>
            ) : (
              <CarouselRow variant="explore">
                {exploreCats.map((cat, index) => (
                  <button
                    key={cat}
                    type="button"
                    className={`category-card ${CATEGORY_COLORS[index % CATEGORY_COLORS.length]}`}
                    onClick={() => {
                      document.getElementById(categorySlug(cat))?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  >
                    <span>{cat}</span>
                    <img src={productImage(grouped.find((g) => g.name === cat)?.items[0], index)} alt="" />
                  </button>
                ))}
              </CarouselRow>
            )}
          </div>

          {grouped.map((group) => (
            <div className="section" id={categorySlug(group.name)} key={group.name}>
              <div className="section-title-1">{group.name}</div>
              <CarouselRow variant="templates">
                {group.items.map((product, index) => (
                  <button
                    key={`${product.id}-${product.name || index}`}
                    type="button"
                    className="template-card"
                    onClick={() => openProduct(product, group.name)}
                  >
                    <img src={productImage(product, index)} alt={product.name || group.name} />
                    <div className="template-info">
                      <div className="template-title">{product.name || `${group.name} | 0${index + 1}`}</div>
                      <div className="badge-new">New</div>
                    </div>
                  </button>
                ))}
              </CarouselRow>
            </div>
          ))}
        </div>
      </div>
      <PortalFooter />

      {picked ? (
        <div className="dj-modal-backdrop" onClick={() => !starting && setPicked(null)}>
          <div className="dj-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="dj-modal-close"
              onClick={() => setPicked(null)}
              disabled={starting}
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="dj-modal-hero">
              <img src={productImage(picked, 0)} alt="" />
              <div>
                <p className="dj-modal-kicker">{categoryName(picked.class)}</p>
                <h2>{picked.name || "Design job"}</h2>
                {picked.description ? <p className="dj-modal-desc">{String(picked.description)}</p> : null}
              </div>
            </div>
            <div className="dj-steps">
              <div>
                <p>1. Select</p>
                <span>Pick a listing and the template that fits the job.</span>
              </div>
              <div>
                <p>2. Create</p>
                <span>
                  {isPostcardProduct(picked, pickedCategory)
                    ? "Edit the front and back in Cotala — same print postcard layout."
                    : "Open the Cotala print designer with this listing’s photos."}
                </span>
              </div>
              <div>
                <p>3. Checkout</p>
                <span>Send the proof through and order print when you are ready.</span>
              </div>
            </div>
            <label className="dj-field">
              <span>Search listing</span>
              <input
                type="text"
                value={listingSearch}
                onChange={(e) => {
                  const value = e.target.value;
                  setListingSearch(value);
                  if (/^\d+$/.test(value.trim())) setTourId(value.trim());
                }}
                placeholder="Address, MLS, or tour id…"
                disabled={starting}
              />
            </label>
            <label className="dj-field">
              <span>Choose listing</span>
              <select value={tourId} onChange={(e) => setTourId(e.target.value)} disabled={starting}>
                <option value="">Select a listing…</option>
                {listingChoices.map((listing) => (
                  <option key={String(listing.tourid)} value={String(listing.tourid)}>
                    {listingLabel(listing)} {listing.tourid ? `(${listing.tourid})` : ""}
                  </option>
                ))}
              </select>
            </label>
            {selectedListing && tourId ? (
              <div className="dj-listing-preview">
                <img src={listingImage(selectedListing, photoFallback)} alt="" />
                <p>{listingLabel(selectedListing)}</p>
              </div>
            ) : null}
            {tourId ? (
              <p className="dj-editor-dest">
                {isPostcardProduct(picked, pickedCategory)
                  ? "Opens the in-app postcard editor — front and back. Will not leave Cotala."
                  : "Opens the print designer with this listing."}
              </p>
            ) : null}
            {startError ? <p className="dj-error">{startError}</p> : null}
            <button type="button" className="dj-start" disabled={starting || !tourId} onClick={startDesign}>
              {starting ? "Opening designer…" : "Start Designing"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
