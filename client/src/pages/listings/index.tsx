import { useState, useEffect, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getPortalListings, listingImage, type PortalListing } from "@/lib/api";
import heroBg from "@/pages/images/new-bg-1.jpg";
import propertyImg from "@/pages/images/84429_2.webp";
import lightLogo from "@/pages/images/logos/light-logo.svg";

const PER_PAGE = 12;

// Format address with proper commas and hyphens (always include city)
const formatAddress = (unit: unknown, address: string, city?: string) => {
  const parts: string[] = [];

  if (unit && String(unit).trim() !== "") {
    const unitStr = String(unit).trim();
    const addressStr = address || "";
    const addressMatch = addressStr.match(/^(\d+)/);
    if (addressMatch) {
      parts.push(`${unitStr}-${addressStr}`);
    } else {
      parts.push(`${unitStr} ${addressStr}`);
    }
  } else {
    parts.push(address || "No Address");
  }

  if (city && city.trim() !== "") {
    parts.push(city.trim());
  }

  return parts.join(", ");
};

export default function Listings() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const initialSearch = new URLSearchParams(searchString).get("search")?.trim() || "";

  const [listings, setListings] = useState<PortalListing[]>([]);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    current_page: 1,
    last_page: 1,
    per_page: PER_PAGE,
    total: 0,
  });

  const loadListings = useCallback(async (nextPage: number, query: string) => {
    try {
      setLoading(true);
      const data = await getPortalListings({
        search: query.trim(),
        per_page: PER_PAGE,
        page: nextPage,
      });
      if (data.status && Array.isArray(data.data)) {
        setListings(data.data as PortalListing[]);
        if (data.pagination) {
          setPagination({
            current_page: data.pagination.current_page ?? nextPage,
            last_page: data.pagination.last_page ?? 1,
            per_page: data.pagination.per_page ?? PER_PAGE,
            total: data.pagination.total ?? data.data.length,
          });
        } else {
          setPagination({
            current_page: nextPage,
            last_page: 1,
            per_page: PER_PAGE,
            total: data.data.length,
          });
        }
      } else {
        setListings([]);
        setPagination({ current_page: 1, last_page: 1, per_page: PER_PAGE, total: 0 });
      }
    } catch (error) {
      console.error("Failed to load listings", error);
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(searchString).get("search")?.trim() || "";
    setSearchQuery(q);
    setPage(1);
  }, [searchString]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadListings(page, searchQuery);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [page, searchQuery, loadListings]);

  const filteredListings =
    listings?.filter((listing) => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        listing.address?.toLowerCase().includes(query) ||
        listing.city?.toLowerCase().includes(query) ||
        String(listing.mls || "")
          .toLowerCase()
          .includes(query) ||
        String(listing.tourid).includes(query)
      );
    }) || [];

  const rangeStart = pagination.total === 0 ? 0 : (pagination.current_page - 1) * pagination.per_page + 1;
  const rangeEnd = Math.min(pagination.current_page * pagination.per_page, pagination.total);

  return (
    <div className="min-h-screen bg-black">
      <div
        className="new-bg-4 w-full relative"
        style={{
          // Banner image temporarily hidden for V1: `url(${heroBg})`.
          backgroundSize: "cover",
          backgroundPosition: "center center",
          height: "200px",
          minHeight: "200px",
        }}
      >
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative h-full flex flex-col justify-end p-6 md:p-8 z-10">
          <div className="overlay-1">
            <h2 className="text-white text-3xl md:text-4xl font-bold">All Listings</h2>
          </div>
        </div>
      </div>

      <div className="service-package">
        <div className="container mx-auto mb-4 pt-6 px-4">
          <Input
            type="text"
            className="w-full text-white bg-black/40 border-white/20"
            placeholder="Search by address, city, MLS#, or tour ID…"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="container mx-auto pb-5 px-4">
          {!loading && pagination.total > 0 ? (
            <p className="text-white/50 text-sm mb-4">
              Showing {rangeStart}–{rangeEnd} of {pagination.total} listings
            </p>
          ) : null}

          {loading ? (
            <div className="text-center text-white py-12">
              <p>Loading listings...</p>
            </div>
          ) : filteredListings.length === 0 ? (
            <div className="text-center text-white py-12">
              <p>No listings found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredListings.map((listing) => {
                const imageSrc = listingImage(listing, propertyImg);

                return (
                  <div
                    key={listing.tourid}
                    className="property-card-wrapper cursor-pointer"
                    onClick={() => setLocation(`/listing-details?id=${listing.tourid}`)}
                  >
                    <div
                      className="card property-card flex flex-col hover:opacity-90 transition-opacity"
                      style={{
                        backgroundColor: "#040405",
                        borderColor: "#1a1a1a",
                        borderWidth: "1px",
                        borderStyle: "solid",
                        boxShadow:
                          "0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4)",
                      }}
                    >
                      <img
                        src={imageSrc}
                        className="property-img"
                        alt="Property Image"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          if (target.src !== propertyImg) {
                            target.src = propertyImg;
                          }
                        }}
                      />
                      <div className="card-body flex flex-col flex-grow px-3 py-3" style={{ backgroundColor: "#040405" }}>
                        <div className="flex justify-between items-center">
                          <h5 className="text-white mb-0 text-lg font-semibold">
                            {formatAddress(listing.unit, listing.address || "No Address", listing.city)}
                          </h5>
                        </div>
                        <div className="flex justify-between items-center mt-3">
                          {listing.mls && String(listing.mls).trim() !== "" ? (
                            <p className="text-white/50 mb-0 text-sm">MLS #{String(listing.mls)}</p>
                          ) : null}
                          <span className="property-status">
                            {listing.status
                              ? String(listing.status).charAt(0).toUpperCase() + String(listing.status).slice(1)
                              : "Active"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && pagination.last_page > 1 ? (
            <div className="flex flex-wrap items-center justify-center gap-2 mt-8">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.current_page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="border-white/20 text-white"
              >
                Previous
              </Button>
              {Array.from({ length: pagination.last_page }, (_, i) => i + 1)
                .filter((n) => {
                  const cur = pagination.current_page;
                  return n === 1 || n === pagination.last_page || Math.abs(n - cur) <= 2;
                })
                .map((n, idx, arr) => {
                  const prev = arr[idx - 1];
                  const showEllipsis = prev != null && n - prev > 1;
                  return (
                    <span key={n} className="flex items-center gap-2">
                      {showEllipsis ? <span className="text-white/40 px-1">…</span> : null}
                      <Button
                        variant={n === pagination.current_page ? "default" : "outline"}
                        size="sm"
                        onClick={() => setPage(n)}
                        className={
                          n === pagination.current_page
                            ? "bg-[#B082F2] text-white"
                            : "border-white/20 text-white"
                        }
                      >
                        {n}
                      </Button>
                    </span>
                  );
                })}
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.current_page >= pagination.last_page}
                onClick={() => setPage((p) => Math.min(pagination.last_page, p + 1))}
                className="border-white/20 text-white"
              >
                Next
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <footer className="footer bg-black border-t border-white/10">
        <div className="container mx-auto px-4 py-3">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="text-left mb-3 md:mb-0">
              <img src={lightLogo} width="100" alt="Logo" className="mb-2" />
              <div className="copyright text-sm text-white/50 text-left">
                © 2025 Cotala Cross Media Inc. All Rights Reserved.
              </div>
            </div>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("cotala-open-chat"))}
              className="chat-support flex items-center gap-2 hover:opacity-80 transition-opacity"
              aria-label="Open chat support"
            >
              <div className="status-dot w-2 h-2 bg-green-500 rounded-full" />
              <div className="text-sm font-medium text-white">CHAT SUPPORT</div>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
