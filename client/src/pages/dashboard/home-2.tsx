import { Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { ArrowRight, Camera, Brush, Calendar, CheckCircle2, Clock3, ExternalLink, FileText, Truck, XCircle } from "lucide-react";
import heroBg from "@/pages/images/793512.webp";
import propertyImg from "@/pages/images/84429_2.webp";
import lightLogo from "@/pages/images/logos/light-logo.svg";
import {
  COTALA_MY_LISTINGS_URL2_KEY,
  getDashboardScreen,
  getPortalDashboard,
  listingImage,
  type PortalListing,
} from "@/lib/api";
import { startFeatureSheetForListing } from "@/lib/start-feature-sheet";
import "./dashboard-home.css";

type KnowledgeBaseCard = { title: string; description: string; href: string };

// Knowledge Base cards — each links to a relevant portal page
const knowledgeBaseCards: KnowledgeBaseCard[] = [
  {
    title: "Set Up Canada Post",
    description:
      "Learn how to create Neighbourhood Admail and send out to a specific target area.",
    href: "/new-appointment",
  },
  {
    title: "Farming Mailouts",
    description:
      "Browse a variety of printed options for repeat marketing through Canada Post.",
    href: "/design-job",
  },
  {
    title: "Sign Installation",
    description:
      "Request a sign installation at a new listing or modify a current installation.",
    href: "/new-appointment",
  },
  {
    title: "Social Media Tips",
    description:
      "Best practices for promoting your listings and personal brand.",
    href: "/ai-tool",
  },
  {
    title: "Print Ready Files",
    description: "How to ensure your own print artwork is print ready.",
    href: "/design-job",
  },
  {
    title: "Listing Prep",
    description: "Checklist to help get your listing ready for showings.",
    href: "/listings",
  },
];

const knowledgeBaseHref = (title: string) => {
  const t = title.toLowerCase();
  const exact = knowledgeBaseCards.find((c) => c.title.toLowerCase() === t);
  if (exact) return exact.href;
  if (t.includes("canada post") || t.includes("sign")) return "/new-appointment";
  if (t.includes("farming") || t.includes("print")) return "/design-job";
  if (t.includes("social")) return "/ai-tool";
  return "/listings";
};

type DashboardService = {
  id?: string | number;
  description?: string;
  status?: string;
  google_start_date?: string | null;
  customer_preferred_datestarttime?: string | null;
  service_details?: { name?: string; frontendtitle?: string } | null;
};

type DashboardAppointment = {
  id: string | number;
  status?: string;
  schedule_date?: string | null;
  schedule_time?: string | null;
  summary?: string;
  services?: DashboardService[];
  tourdetails?: { tourid?: string | number; unit?: string; address?: string; city?: string } | null;
};

type DashboardPrintOrder = {
  id: string | number;
  orderid?: string | number;
  proof_id?: string | number;
  description?: string;
  status?: string;
  ui_status?: string | null;
  tourid?: string | number;
  proof_url?: string;
  approved_proof_url?: string;
  final_print_url?: string;
  final_file_url?: string;
  file_url?: string;
  pdf_url?: string;
  preview_url?: string;
  productimage?: string;
  productimageurl?: string;
  image?: string;
  image_url?: string;
  date?: string;
  order_date?: string;
  datecreated?: string;
  created_at?: string;
  needs_approval?: boolean;
  product_details?: {
    name?: string;
    description?: string;
    subtitle?: string;
    productimage?: string;
    productimageurl?: string;
    image?: string;
    image_url?: string;
  } | null;
};

type DashboardScreenData = {
  greeting?: {
    name?: string;
    headline?: string;
    appointment_cta?: { label?: string; endpoint?: string };
  };
  upcoming_service_appointments?: DashboardAppointment[];
  recent_listings?: PortalListing[];
  recent_print_orders?: DashboardPrintOrder[];
  knowledge_base?: Array<{ title?: string; description?: string }>;
};

const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const parseDate = (value?: string | null) => {
  if (!value) return null;
  const d = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
};

// "Thurs. Sept 24, 1:00pm"
const formatAppointmentDate = (appt: DashboardAppointment) => {
  let date: Date | null = null;
  if (appt.schedule_date) {
    date = parseDate(`${appt.schedule_date} ${appt.schedule_time || "00:00:00"}`);
  }
  if (!date) {
    const starts = asArray<DashboardService>(appt.services)
      .map((s) => parseDate(s.customer_preferred_datestarttime) || parseDate(s.google_start_date))
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime());
    date = starts[0] || null;
  }
  if (!date) return "Date to be confirmed";
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const time = date
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .replace(/\s/g, "")
    .toLowerCase();
  const hasTime = appt.schedule_date ? Boolean(appt.schedule_time) : true;
  return `${weekday}. ${month} ${date.getDate()}${hasTime ? `, ${time}` : ""}`;
};

const appointmentServices = (appt: DashboardAppointment) => {
  const names = asArray<DashboardService>(appt.services)
    .map((s) => s.service_details?.frontendtitle || s.service_details?.name || "")
    .map((n) => n.trim())
    .filter(Boolean);
  return Array.from(new Set(names)).join(", ");
};

const printProofId = (order: DashboardPrintOrder) => order.proof_id || order.id;

const rememberProofForReview = (order: DashboardPrintOrder) => {
  const proofId = printProofId(order);
  try {
    sessionStorage.setItem(
      `cotala_proof_${proofId}`,
      JSON.stringify({
        id: proofId,
        description: order.description,
        status: order.status,
        proof_url: order.proof_url || order.preview_url,
        product_details: order.product_details,
      }),
    );
  } catch {
    /* storage unavailable */
  }
};

const printOrderStatus = (order: DashboardPrintOrder) => {
  const status = String(order.ui_status || order.status || "").trim();
  const s = status.toLowerCase();
  if (s.includes("cancel")) return { label: status || "Cancelled", className: "status-cancelled", kind: "cancelled" as const, needsReview: false };
  if (order.needs_approval || /pending\s*approval|changes?\s*required/.test(s)) {
    return { label: "Pending Approval", className: "status-pending", kind: "pending" as const, needsReview: true };
  }
  if (s.includes("ship")) return { label: status || "Shipped", className: "status-shipped", kind: "shipped" as const, needsReview: false };
  if (s.includes("approv")) return { label: status || "Approved", className: "status-approved", kind: "approved" as const, needsReview: false };
  if (s.includes("complete") || s.includes("closed") || s.includes("printed")) {
    return { label: status || "Completed", className: "status-approved", kind: "approved" as const, needsReview: false };
  }
  if (s.includes("wait") || s.includes("hold") || s.includes("mls") || s.includes("proof")) {
    return { label: status || "Waiting", className: "status-waiting", kind: "waiting" as const, needsReview: false };
  }
  return { label: status || "In Progress", className: "status-progress", kind: "progress" as const, needsReview: false };
};

const printOrderFile = (order: DashboardPrintOrder) =>
  order.final_print_url ||
  order.final_file_url ||
  order.approved_proof_url ||
  order.proof_url ||
  order.pdf_url ||
  order.file_url ||
  order.preview_url ||
  "";

const printOrderImage = (order: DashboardPrintOrder) => {
  const file =
    order.product_details?.productimage ||
    order.productimage ||
    order.product_details?.image_url ||
    order.product_details?.image ||
    order.image_url ||
    order.image ||
    "";
  if (!file) return "";
  if (/^https?:\/\//i.test(file) || file.startsWith("data:")) return file;
  const base = (order.productimageurl || order.product_details?.productimageurl || "").trim();
  if (!base) return file;
  return `${base.replace(/\/?$/, "/")}${file.replace(/^\//, "")}`;
};

const printOrderDate = (order: DashboardPrintOrder) => {
  const raw = order.order_date || order.date || order.datecreated || order.created_at || "";
  const date = parseDate(raw);
  return date ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : raw || "—";
};

export default function Home2() {
  const [, setLocation] = useLocation();
  const [userName, setUserName] = useState("");
  const [headline, setHeadline] = useState("What would you like to do today?");
  const [ctaLabel, setCtaLabel] = useState("New Service Appointment");
  const [listings, setListings] = useState<PortalListing[]>([]);
  const [appointments, setAppointments] = useState<DashboardAppointment[]>([]);
  const [printOrders, setPrintOrders] = useState<DashboardPrintOrder[]>([]);
  const [kbCards, setKbCards] = useState<KnowledgeBaseCard[]>(knowledgeBaseCards);
  const [loading, setLoading] = useState(true);
  const [dynamicLogo, setDynamicLogo] = useState<string | null>(null);
  const [homeSearch, setHomeSearch] = useState("");
  const [startingSheetTourId, setStartingSheetTourId] = useState<string | number | null>(null);
  const [cardActionLabel, setCardActionLabel] = useState("");
  const [hoveredListingId, setHoveredListingId] = useState<string | number | null>(null);

  // Get time-based greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) {
      return "Good Morning";
    } else if (hour < 17) {
      return "Good Afternoon";
    } else if (hour < 21) {
      return "Good Evening";
    } else {
      return "Good Night";
    }
  };

  // Properly format name with title case (handles "Voight" correctly)
  const formatName = (name: string) => {
    if (!name) return "";
    // First, add space before capital letters if name is camelCase (e.g., "GaryVoight" -> "Gary Voight")
    const spacedName = name.replace(/([a-z])([A-Z])/g, '$1 $2');
    return spacedName
      .split(/\s+/)
      .map(word => {
        if (!word) return "";
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(" ");
  };

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

    if (city && String(city).trim() !== "") {
      parts.push(String(city).trim());
    }

    return parts.join(", ");
  };

  const appointmentAddress = (appt: DashboardAppointment) => {
    const td = appt.tourdetails;
    if (td?.address) return formatAddress(td.unit, td.address, td.city);
    const fromService = asArray<DashboardService>(appt.services).find((s) => s.description)?.description;
    return fromService || appt.summary || "Service Appointment";
  };

  const clearBrokerLogo = () => {
    setDynamicLogo(null);
    try {
      window.localStorage.removeItem(COTALA_MY_LISTINGS_URL2_KEY);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const userData = localStorage.getItem("cotala_user");
    if (userData) {
      try {
        const user = JSON.parse(userData);
        setUserName(user.name || user.username || user.email || "");
      } catch (e) {
        console.error("Failed to parse user data", e);
      }
    }

    const loadLegacyDashboard = async () => {
      const data = await getPortalDashboard();
      const payload = (data.data || {}) as {
        greeting_name?: string;
        recent_listings?: PortalListing[];
        performing_agents?: Array<{ image_url?: string }>;
      };
      if (payload.greeting_name) {
        setUserName(payload.greeting_name);
      }
      setListings(asArray<PortalListing>(payload.recent_listings));
      const logo = payload.performing_agents?.[0]?.image_url || "";
      if (logo) {
        setDynamicLogo(logo);
        try {
          window.localStorage.setItem(COTALA_MY_LISTINGS_URL2_KEY, logo);
        } catch {
          /* ignore quota */
        }
      }
    };

    const loadDashboard = async () => {
      setLoading(true);
      try {
        const res = await getDashboardScreen();
        if (!res?.status || !res.data) throw new Error(res?.msg || res?.message || "Dashboard screen unavailable");
        const data = res.data as DashboardScreenData;
        if (data.greeting?.name) setUserName(data.greeting.name);
        if (data.greeting?.headline) setHeadline(data.greeting.headline);
        if (data.greeting?.appointment_cta?.label) setCtaLabel(data.greeting.appointment_cta.label);
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const upcoming = asArray<DashboardAppointment>(data.upcoming_service_appointments).filter((appt) => {
          const raw =
            appt.schedule_date ||
            appt.services?.[0]?.google_start_date ||
            appt.services?.[0]?.customer_preferred_datestarttime ||
            "";
          const d = parseDate(raw);
          return !d || d.getTime() >= todayStart.getTime();
        });
        setAppointments(upcoming);
        setListings(asArray<PortalListing>(data.recent_listings));
        const prints = asArray<DashboardPrintOrder>(data.recent_print_orders);
        const needingApproval = prints.filter(
          (o) => o.needs_approval || /pending\s*approval|changes?\s*required/i.test(String(o.ui_status || o.status || "")),
        );
        setPrintOrders(needingApproval.length ? needingApproval : prints);
        const kb = asArray<{ title?: string; description?: string }>(data.knowledge_base)
          .filter((c) => c?.title)
          .map((c) => ({
            title: String(c.title),
            description: String(c.description || ""),
            href: knowledgeBaseHref(String(c.title)),
          }));
        if (kb.length) setKbCards(kb);
      } catch (error) {
        console.error("Failed to load dashboard screen, falling back", error);
        try {
          await loadLegacyDashboard();
        } catch (fallbackError) {
          console.error("Failed to load dashboard", fallbackError);
        }
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, []);

  const handleHomeSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = homeSearch.trim().toLowerCase();
    if (!q) return;
    if (q.includes("book") || q.includes("appointment") || q.includes("order")) {
      setLocation("/new-appointment");
      return;
    }
    if (q.includes("design")) {
      setLocation("/design-job");
      return;
    }
    if (q.includes("account") || q.includes("profile")) {
      setLocation("/profile");
      return;
    }
    setLocation(`/listings?search=${encodeURIComponent(homeSearch.trim())}`);
  };

  const externalLinkIcon = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="icon icon-tabler icons-tabler-outline icon-tabler-external-link"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6" />
      <path d="M11 13l9 -9" />
      <path d="M15 4h5v5" />
    </svg>
  );

  const spinner = (className: string) => (
    <svg
      className={`animate-spin text-[#b082f2] ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );

  return (
    <div className="dashboard-home min-h-screen bg-black text-white">
      {startingSheetTourId != null && (
        <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/60">
          {spinner("h-10 w-10 mb-3")}
          <p className="text-white text-base font-semibold">please wait</p>
        </div>
      )}

      {/* Hero */}
      <div className="new-bg-1 overflow-hidden" style={{ backgroundImage: `url(${heroBg})` }}>
        <div className="top-button">
          <Link href="/new-appointment" className="custom-font no-underline">
            {ctaLabel}
          </Link>
        </div>
        <div className="overlay-1">
          <h1 className="text-white">
            {getGreeting()},
            <br />
            {formatName(userName)}
          </h1>
        </div>
        {dynamicLogo ? (
          <div className="hidden lg:flex absolute right-12 bottom-8 w-[30vw] max-w-[420px] h-[180px] items-center justify-center pointer-events-none">
            <img
              src={dynamicLogo}
              alt="Brokerage logo"
              className="w-full h-full object-contain opacity-50"
              onError={clearBrokerLogo}
            />
          </div>
        ) : null}
      </div>

      <div className="service-package bg-black">
        {/* Search box — temporarily hidden for V1; keep its functionality for later. */}
        {false && (
          <div className="container mx-auto px-4 pt-4">
            <form className="search-box" onSubmit={handleHomeSearch}>
              <input
                type="text"
                placeholder="I want to book an appointment..."
                value={homeSearch}
                onChange={(e) => setHomeSearch(e.target.value)}
              />
              <button type="submit" className="search-btn" aria-label="Search">
                <ArrowRight className="w-5 h-5" />
              </button>
            </form>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center text-white py-16">
            {spinner("h-8 w-8 mb-3")}
            <p className="text-white/70">Loading your dashboard...</p>
          </div>
        ) : (
          <>
            {/* Upcoming Service Appointments */}
            <section className="container mx-auto px-4 pt-4 pb-2">
              <h2 className="appointments-title">Upcoming Service Appointments</h2>
              {appointments.length === 0 ? (
                <div className="text-left">
                  <p className="text-white/70 mb-4">You have no upcoming service appointments.</p>
                  <Link href="/new-appointment">
                    <button className="btn btn-outline-light manage-btn">BOOK AN APPOINTMENT</button>
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {appointments.map((appt) => {
                    const services = appointmentServices(appt);
                    return (
                      <article key={appt.id} className="appointment-card">
                        <div className="appointment-content">
                          <h3 className="appointment-address">{appointmentAddress(appt)}</h3>
                          <p className="appointment-date">{formatAppointmentDate(appt)}</p>
                          {services ? <p className="appointment-services">{services}</p> : null}
                        </div>
                        <div className="appointment-footer">
                          <Link href={`/order-details?id=${appt.id}`} className="manage-appointments">
                            MANAGE APPOINTMENTS
                          </Link>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Recent Listing */}
            <section className="container mx-auto px-4 pt-10">
              <div className="flex justify-start items-center gap-2 mb-4 text-left">
                <h2 className="section-title mb-0">Recent Listing</h2>
                <Link href="/listings" className="section-title-link hover:opacity-80 transition-opacity" aria-label="View all listings">
                  {externalLinkIcon}
                </Link>
              </div>

              {listings.length === 0 ? (
                <div className="text-left">
                  <p className="text-white/70 mb-4">You have no pending or active listings.</p>
                  <Link href="/listings">
                    <button className="btn btn-outline-light manage-btn">VIEW ALL LISTINGS</button>
                  </Link>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {listings.map((listing) => {
                      const imageSrc = listingImage(listing, propertyImg);
                      return (
                        <div
                          key={listing.tourid}
                          className="card property-card flex flex-col cursor-pointer"
                          style={{ backgroundColor: '#040405' }}
                          onClick={() => setLocation(`/listing-details?id=${listing.tourid}`)}
                        >
                          <div className="img-wrapper relative">
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
                            <div className="hover-overlay" onClick={(e) => e.stopPropagation()}>
                              {hoveredListingId === listing.tourid && cardActionLabel ? (
                                <div className="dashboard-action-tooltip" aria-live="polite">
                                  {cardActionLabel}
                                </div>
                              ) : null}
                              <div
                                className="icon-group"
                                onMouseLeave={() => {
                                  setCardActionLabel("");
                                  setHoveredListingId(null);
                                }}
                              >
                                <button
                                  type="button"
                                  className="dashboard-card-action"
                                  aria-label="Open Media Center"
                                  onMouseEnter={() => {
                                    setHoveredListingId(listing.tourid);
                                    setCardActionLabel("Media Center");
                                  }}
                                  onFocus={() => {
                                    setHoveredListingId(listing.tourid);
                                    setCardActionLabel("Media Center");
                                  }}
                                  onBlur={() => {
                                    setCardActionLabel("");
                                    setHoveredListingId(null);
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setLocation(`/listing-details?id=${listing.tourid}`);
                                  }}
                                >
                                  <Camera
                                    className="w-5 h-5"
                                  />
                                </button>
                                <button
                                  type="button"
                                  className="dashboard-card-action"
                                  aria-label="Open Design Studio"
                                  disabled={startingSheetTourId === listing.tourid}
                                  onMouseEnter={() => {
                                    setHoveredListingId(listing.tourid);
                                    setCardActionLabel("Design Studio");
                                  }}
                                  onFocus={() => {
                                    setHoveredListingId(listing.tourid);
                                    setCardActionLabel("Design Studio");
                                  }}
                                  onBlur={() => {
                                    setCardActionLabel("");
                                    setHoveredListingId(null);
                                  }}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (startingSheetTourId) return;
                                    try {
                                      setStartingSheetTourId(listing.tourid);
                                      const href = await startFeatureSheetForListing(listing);
                                      setLocation(href);
                                    } catch (err) {
                                      console.error("Failed to start feature sheet", err);
                                      setLocation(`/feature-sheet-builder?id=${listing.tourid}`);
                                    } finally {
                                      setStartingSheetTourId(null);
                                    }
                                  }}
                                >
                                  <Brush
                                    className="w-5 h-5"
                                  />
                                </button>
                                <button
                                  type="button"
                                  className="dashboard-card-action"
                                  aria-label="Schedule Service"
                                  onMouseEnter={() => {
                                    setHoveredListingId(listing.tourid);
                                    setCardActionLabel("Schedule Service");
                                  }}
                                  onFocus={() => {
                                    setHoveredListingId(listing.tourid);
                                    setCardActionLabel("Schedule Service");
                                  }}
                                  onBlur={() => {
                                    setCardActionLabel("");
                                    setHoveredListingId(null);
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setLocation("/new-appointment");
                                  }}
                                >
                                  <Calendar
                                    className="w-5 h-5"
                                  />
                                </button>
                              </div>
                            </div>
                          </div>
                          <div className="card-body flex flex-col flex-grow px-3 py-3" style={{ backgroundColor: '#040405' }}>
                            <h5 className="text-white mb-0 text-lg font-semibold">
                              {formatAddress(listing.unit, listing.address || "No Address", listing.city)}
                            </h5>
                            <div className="flex justify-between items-center mt-3">
                              {listing.mls && String(listing.mls).trim() !== "" ? (
                                <p className="text-white/50 mb-0 text-sm">MLS #{String(listing.mls)}</p>
                              ) : <span />}
                              <span className="property-status">
                                {listing.status ? String(listing.status).charAt(0).toUpperCase() + String(listing.status).slice(1) : "Active"}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="text-center mt-6">
                    <Link href="/listings">
                      <button className="btn btn-outline-light text-uppercase manage-btn px-6 py-3">
                        View More Listings
                      </button>
                    </Link>
                  </div>
                </>
              )}
            </section>

            {/* Jobs needing approval / recent print orders */}
            <section className="container mx-auto px-4 pt-10">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="print-orders-title mb-0">
                  {printOrders.some((o) => o.needs_approval || /pending\s*approval/i.test(String(o.ui_status || o.status || "")))
                    ? "Jobs needing approval"
                    : "Recent Print Orders"}
                </h2>
                <Link href="/orders" className="text-sm font-semibold text-[#b388ff] hover:underline">
                  See all
                </Link>
              </div>
              {printOrders.length === 0 ? (
                <div className="text-left">
                  <p className="text-white/70 mb-4">You have no recent print orders.</p>
                  <Link href="/design-job">
                    <button className="btn btn-outline-light manage-btn">BROWSE PRINT PRODUCTS</button>
                  </Link>
                </div>
              ) : (
                <div className="print-orders-table-wrapper">
                  <table className="print-orders-table mb-0">
                    <thead>
                      <tr>
                        <th scope="col" style={{ width: "23%" }}>Products</th>
                        <th scope="col" style={{ width: "20%" }}>Description</th>
                        <th scope="col" style={{ width: "17%" }}>Status</th>
                        <th scope="col" style={{ width: "23%" }}>Proof / Action</th>
                        <th scope="col" style={{ width: "10%" }}>Order Date</th>
                        <th scope="col" aria-label="Order details" style={{ width: "7%" }} />
                      </tr>
                    </thead>
                    <tbody>
                      {printOrders.map((order) => {
                        const status = printOrderStatus(order);
                        const proofId = printProofId(order);
                        const fileUrl = printOrderFile(order);
                        const productImage = printOrderImage(order);
                        const StatusIcon = status.kind === "shipped"
                          ? Truck
                          : status.kind === "approved"
                            ? CheckCircle2
                            : status.kind === "cancelled"
                              ? XCircle
                              : Clock3;
                        return (
                          <tr key={order.id}>
                            <td>
                              <div className="print-product-cell">
                                <div className="print-product-thumb">
                                  {productImage ? (
                                    <img src={productImage} alt="" loading="lazy" />
                                  ) : (
                                    <FileText aria-hidden="true" />
                                  )}
                                </div>
                                <div>
                                  <span className="product-name">{order.product_details?.name || "Print Order"}</span>
                                  {(order.product_details?.subtitle || order.product_details?.description) && (
                                    <span className="product-subtitle">
                                      {order.product_details.subtitle || order.product_details.description}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className="product-description">{order.description || "—"}</span>
                            </td>
                            <td>
                              <span className={`print-status-pill ${status.className}`}>
                                <StatusIcon aria-hidden="true" />
                                {status.label}
                              </span>
                            </td>
                            <td>
                              {status.needsReview ? (
                                <div className="proof-review-action">
                                  <Link
                                    href={`/proof-review?id=${proofId}`}
                                    className="proof-button is-review"
                                    onClick={() => rememberProofForReview(order)}
                                  >
                                    Review &amp; Approve <ArrowRight aria-hidden="true" />
                                  </Link>
                                  <span>Approve artwork to proceed to print</span>
                                </div>
                              ) : fileUrl && status.kind !== "cancelled" ? (
                                <a className="proof-file-link" href={fileUrl} target="_blank" rel="noopener noreferrer">
                                  <span className="pdf-file-icon"><FileText aria-hidden="true" /></span>
                                  <span>{status.kind === "shipped" ? "View Final Print.pdf" : "View Approved Proof.pdf"}</span>
                                  <ExternalLink aria-hidden="true" />
                                </a>
                              ) : (
                                <span className="proof-empty">—</span>
                              )}
                            </td>
                            <td><span className="print-order-date">{printOrderDate(order)}</span></td>
                            <td>
                              {order.orderid ? (
                                <Link href={`/order-details?id=${order.orderid}`} className="proof-detail-link">
                                  View Detail
                                </Link>
                              ) : <span className="proof-empty">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {/* Knowledge Base — temporarily hidden; keep the section and functionality for later. */}
        {false && (
        <section className="py-12 text-light px-4">
          <div className="container mx-auto">
            <div className="flex justify-start items-center mb-6 gap-2">
              <h2 className="section-title mb-0">Knowledge Base</h2>
              <Link
                href="/listings"
                className="text-light text-decoration-none hover:opacity-80 transition-opacity"
              >
                {externalLinkIcon}
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {kbCards.map((card) => (
                <Link
                  key={card.title}
                  href={card.href}
                  className="kb-card p-6 h-full relative group cursor-pointer hover:bg-white/5 transition-colors rounded-lg border border-white/10 block no-underline"
                >
                  <h5 className="mb-2 text-white text-lg font-semibold">{card.title}</h5>
                  <p className="mb-0 text-white/50 text-sm pr-6">{card.description}</p>
                  <span className="arrow absolute right-4 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="icon icon-tabler icons-tabler-outline icon-tabler-chevron-right"
                    >
                      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                      <path d="M9 6l6 6l-6 6" />
                    </svg>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
        )}
      </div>

      {/* Footer */}
      <footer className="footer bg-black border-t border-white/10">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="text-left mb-3 md:mb-0">
              <img src={lightLogo} width="100" alt="Logo" className="mb-2" />
              <div className="copyright text-sm text-white/50 text-left">
                © {new Date().getFullYear()} Cotala Cross Media Inc. All Rights Reserved.
              </div>
            </div>

            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("cotala-open-chat"))}
              className="chat-support hover:opacity-80 transition-opacity"
              aria-label="Open chat support"
            >
              <div className="status-dot"></div>
              <div className="font-medium">CHAT SUPPORT</div>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
