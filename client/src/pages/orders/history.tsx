import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  ChevronLeft,
  ChevronRight,
  FileText,
  RotateCcw,
  Truck,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { getOrdersScreen, getPortalOrders } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import PortalFooter from "@/components/portal/PortalFooter";
import { ReportProblemDialog } from "./report-problem-dialog";
import { CancelOrderDialog } from "./order-action-dialogs";
import "./orders-v2.css";

type OrdersTab = "all" | "completed" | "progress" | "needs_approval";

type OrderService = {
  id?: number | string;
  tourid?: number | string;
  description?: string;
  qty?: string | number;
  status?: string;
  ui_status?: string;
  rush_option?: string;
  customer_preferred?: string | null;
  customer_preferred_datestarttime?: string | null;
  service_details?: { name?: string; frontendtitle?: string; category?: string; productimage?: string } | null;
};

type PrintJob = {
  id?: number | string;
  description?: string;
  qty?: string | number;
  status?: string;
  ui_status?: string;
  needs_approval?: boolean;
  tracking?: string | null;
  product_details?: { name?: string } | null;
};

type OrderActions = {
  track: boolean;
  reorder: boolean;
  report_problem: boolean;
  request_changes: boolean;
  cancel: boolean;
};

type ScreenOrder = {
  id: number | string;
  order_number: number | string;
  date?: string;
  status?: string;
  ui_status?: string;
  total?: string | number;
  balance?: string | number;
  services: OrderService[];
  print_jobs: PrintJob[];
  tour?: { tourid?: number | string; unit?: string; address?: string; city?: string } | null;
  actions: OrderActions;
};

type Filter = { key: OrdersTab; label: string };

type Pagination = { current_page: number; last_page: number; per_page: number; total: number };

type Notice = { type: "success" | "error"; text: string };

const PER_PAGE = 50;
const SEARCH_DEBOUNCE_MS = 400;
const TAB_KEYS: OrdersTab[] = ["all", "needs_approval", "progress", "completed"];
const DEFAULT_FILTERS: Filter[] = [
  { key: "all", label: "All" },
  { key: "needs_approval", label: "Needs approval" },
  { key: "progress", label: "In progress" },
  { key: "completed", label: "Completed" },
];

const STATUS_LABELS: Record<string, string> = {
  pending: "Needs approval",
  "pending approval": "Needs approval",
  approved: "Approved",
  printing: "Printing",
  printed: "Printed",
  shipped: "Shipped",
  completed: "Completed",
  closed: "Completed",
  cancelled: "Cancelled",
  canceled: "Cancelled",
  "in progress": "In progress",
  processing: "In progress",
};

function plainStatus(raw?: string | null) {
  const key = String(raw || "").trim().toLowerCase();
  if (!key) return "In progress";
  return STATUS_LABELS[key] || String(raw).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
const EMPTY_PAGINATION: Pagination = { current_page: 1, last_page: 1, per_page: PER_PAGE, total: 0 };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;

function asObject(value: unknown): Raw {
  return value && typeof value === "object" ? value : {};
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const d = new Date(String(value).replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(value?: string | null) {
  const d = parseDate(value);
  if (!d) return value || "";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatAppointment(value?: string | null) {
  const raw = (value || "").trim();
  if (!raw || ["alltime", "null", "undefined"].includes(raw.toLowerCase())) return "";
  const d = parseDate(raw);
  if (!d) return raw;
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
}

function formatMoney(value?: string | number) {
  const n = Number(value ?? 0);
  return `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
}

function formatQty(value?: string | number) {
  if (value == null || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : String(value);
}

function normalizeActions(raw: unknown, fallback: boolean): OrderActions {
  const a = asObject(raw);
  return {
    track: a.track === true,
    reorder: a.reorder === true,
    report_problem: fallback ? a.report_problem !== false : a.report_problem === true,
    request_changes: a.request_changes === true,
    cancel: a.cancel === true,
  };
}

/** Accepts both the orders/screen shape and the legacy `orders` shape. */
function normalizeOrder(raw: Raw, fallback: boolean): ScreenOrder {
  const o = asObject(raw);
  const tour = asObject(o.tour ?? o.tourdetails);
  return {
    id: o.id ?? "",
    order_number: o.order_number ?? o.id ?? "",
    date: o.date ?? o.datecreated,
    status: o.status,
    ui_status: o.ui_status ?? o.status,
    total: o.total,
    balance: o.balance,
    services: Array.isArray(o.services) ? o.services : [],
    print_jobs: Array.isArray(o.print_jobs) ? o.print_jobs : [],
    tour: Object.keys(tour).length ? tour : null,
    actions: normalizeActions(o.actions, fallback),
  };
}

function normalizePagination(raw: unknown, count: number, page: number): Pagination {
  const p = asObject(raw);
  return {
    current_page: Number(p.current_page) || page,
    last_page: Math.max(1, Number(p.last_page) || 1),
    per_page: Number(p.per_page) || PER_PAGE,
    total: Number(p.total ?? count) || 0,
  };
}

function statusKey(raw?: string) {
  return (raw || "").trim().toLowerCase();
}

function statusClass(raw?: string) {
  const s = statusKey(raw);
  if (s.includes("cancel")) return "status-cancelled";
  if (["complete", "completed", "closed", "shipped", "delivered", "approved", "paid", "billed"].includes(s)) {
    return "status-complete";
  }
  if (s.includes("pending") || s.includes("approval") || s.includes("hold") || s.includes("proof")) {
    return "status-pending";
  }
  if (["new", "estimate", "spec"].includes(s)) return "status-new";
  return "status-progress";
}

function cardClass(order: ScreenOrder) {
  const cls = statusClass(order.ui_status);
  if (cls === "status-complete") return "order-card order-purple";
  if (cls === "status-cancelled") return "order-card order-cancelled";
  return "order-card";
}

function orderAddress(order: ScreenOrder) {
  return [order.tour?.unit, order.tour?.address, order.tour?.city].filter(Boolean).join(", ");
}

function orderTourId(order: ScreenOrder) {
  const fromTour = order.tour?.tourid;
  if (fromTour != null && String(fromTour).trim()) return String(fromTour);
  const fromService = order.services.find((s) => s.tourid != null && String(s.tourid).trim())?.tourid;
  return fromService != null ? String(fromService) : "";
}

function trackingHref(tracking: string) {
  if (/^https?:\/\//i.test(tracking)) return tracking;
  return `https://www.canadapost-postescanada.ca/track-reperage/en#/search?searchFor=${encodeURIComponent(tracking)}`;
}

function jobTracking(job: PrintJob) {
  return typeof job.tracking === "string" ? job.tracking.trim() : "";
}

function serviceTitle(service: OrderService) {
  return service.service_details?.name || service.service_details?.frontendtitle || "Service";
}

function pageWindow(current: number, last: number) {
  const pages: Array<number | "ellipsis"> = [];
  const start = Math.max(1, current - 2);
  const end = Math.min(last, current + 2);
  if (start > 1) {
    pages.push(1);
    if (start > 2) pages.push("ellipsis");
  }
  for (let p = start; p <= end; p += 1) pages.push(p);
  if (end < last) {
    if (end < last - 1) pages.push("ellipsis");
    pages.push(last);
  }
  return pages;
}

function StatusBadge({ status, href }: { status: string; href?: string }) {
  const label = plainStatus(status);
  const cls = `order-status ${href ? "status-track" : statusClass(status)}`;
  if (href) {
    return (
      <a className={cls} href={href} target="_blank" rel="noopener noreferrer">
        Track
      </a>
    );
  }
  return <span className={cls}>{label}</span>;
}

function orderNeedsApproval(order: ScreenOrder) {
  return order.print_jobs.some((job) => job.needs_approval) || /pending|approval|proof/i.test(String(order.ui_status || order.status || ""));
}

function orderIsOpen(order: ScreenOrder) {
  const s = statusKey(order.ui_status || order.status);
  return !["complete", "completed", "closed", "shipped", "delivered", "cancelled", "canceled"].includes(s);
}

function WarningIcon() {
  return (
    <span className="warning-icon" title="Attention required" aria-label="Attention required">
      <AlertTriangle className="w-6 h-6" fill="currentColor" stroke="#111111" />
    </span>
  );
}

export default function OrderHistory() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<OrdersTab>("all");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  const [filters, setFilters] = useState<Filter[]>(DEFAULT_FILTERS);
  const [orders, setOrders] = useState<ScreenOrder[]>([]);
  const [pagination, setPagination] = useState<Pagination>(EMPTY_PAGINATION);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [reportOrder, setReportOrder] = useState<ScreenOrder | null>(null);
  const [cancelOrder, setCancelOrder] = useState<ScreenOrder | null>(null);

  const requestSeq = useRef(0);

  useEffect(() => {
    const next = search.trim();
    if (next === query) return;
    const t = window.setTimeout(() => {
      setPage(1);
      setQuery(next);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [search, query]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    const params = { tab, search: query || undefined, page, per_page: PER_PAGE };
    setLoading(true);
    try {
      let nextOrders: ScreenOrder[] = [];
      let nextPagination = EMPTY_PAGINATION;
      try {
        const res = await getOrdersScreen(params);
        if (!res?.status) throw new Error(res?.msg || "orders/screen failed");
        const data = asObject(res.data);
        const list = Array.isArray(data.orders) ? data.orders : [];
        nextOrders = list.map((o: Raw) => normalizeOrder(o, false));
        nextPagination = normalizePagination(data.pagination ?? res.pagination, list.length, page);
      } catch (screenErr) {
        console.warn("orders/screen unavailable, falling back to orders", screenErr);
        const res = await getPortalOrders(params);
        if (!res?.status) throw new Error(res?.msg || "Failed to load orders");
        const list = Array.isArray(res.data) ? res.data : [];
        nextOrders = list.map((o: Raw) => normalizeOrder(o, true));
        nextPagination = normalizePagination(res.pagination, list.length, page);
      }
      if (seq !== requestSeq.current) return;
      const visible =
        tab === "needs_approval"
          ? nextOrders.filter(orderNeedsApproval)
          : nextOrders.filter((o) => !/cancel/i.test(String(o.ui_status || o.status || "")));
      setOrders(visible);
      setPagination(nextPagination);
      setFilters(DEFAULT_FILTERS);
      setError(null);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      console.error(err);
      setOrders([]);
      setPagination(EMPTY_PAGINATION);
      setError("Failed to load orders. Please try again.");
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [tab, query, page]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const rangeLabel = useMemo(() => {
    if (!pagination.total) return "";
    const start = (pagination.current_page - 1) * pagination.per_page + 1;
    const end = Math.min(pagination.total, pagination.current_page * pagination.per_page);
    return `Showing ${start}–${end} of ${pagination.total}`;
  }, [pagination]);

  const showSuccess = (text: string) => {
    setNotice({ type: "success", text });
    toast({ title: text });
  };

  const changeTab = (next: OrdersTab) => {
    if (next === tab) return;
    setTab(next);
    setPage(1);
  };

  const goToPage = (next: number) => {
    const clamped = Math.min(pagination.last_page, Math.max(1, next));
    if (clamped === page) return;
    setPage(clamped);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="orders-v2 min-h-screen bg-black text-white">
      <div className="hero-section orders-hero orders-v2-hero">
        <div className="top-button">
          <Link href="/new-appointment" className="custom-font">
            NEW SERVICE APPOINTMENT
          </Link>
        </div>
        <div className="container mx-auto px-4">
          <h1 className="hero-title">My Orders</h1>
          <p className="hero-desc">Search all orders...</p>
          <form
            className="search-box"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setQuery(search.trim());
            }}
          >
            <input
              type="text"
              placeholder="Search by address, MLS number etc..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="submit" className="search-btn" aria-label="Search orders">
              <ArrowRight className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>

      <div className="service-package">
        <div className="container mx-auto px-4 my-3">
          <div className="tabs" role="tablist">
            {filters.map((f) => (
              <div
                key={f.key}
                role="tab"
                aria-selected={tab === f.key}
                className={`tab ${tab === f.key ? "active" : ""}`}
                onClick={() => changeTab(f.key)}
              >
                {f.label}
              </div>
            ))}
          </div>

          {notice && (
            <div className={`ov2-notice ${notice.type}`} role="status">
              {notice.text}
            </div>
          )}

          {!loading && !error && rangeLabel && <div className="orders-range">{rangeLabel}</div>}

          {loading && <div className="ov2-empty">Loading orders...</div>}
          {!loading && error && (
            <div className="ov2-empty">
              <p className="text-red-400 mb-3">{error}</p>
              <button type="button" className="ov2-btn" onClick={() => setReloadKey((k) => k + 1)}>
                <RotateCcw className="w-3.5 h-3.5" />
                Retry
              </button>
            </div>
          )}
          {!loading && !error && orders.length === 0 && (
            <div className="ov2-empty">
              {query ? `No orders match "${query}".` : "No orders found."}
            </div>
          )}

          {!loading && !error && orders.length > 0 && (
            <section className="order-history-section">
              {orders.map((order) => {
                const address = orderAddress(order);
                const tourId = orderTourId(order);
                const firstTracking = order.print_jobs.map(jobTracking).find(Boolean) || "";
                const canTrack = order.actions.track && !!firstTracking;
                const canReorder = order.actions.reorder && !!tourId;
                const hasRows = order.services.length > 0 || order.print_jobs.length > 0;

                return (
                  <article key={String(order.id)} className={cardClass(order)}>
                    <div className="order-card-header">
                      <div className="order-meta">
                        <div className="order-meta-label">Order Placed</div>
                        <div className="order-meta-value">{formatDate(order.date) || "—"}</div>
                      </div>
                      <div className="order-meta">
                        <div className="order-meta-label">Total</div>
                        <div className="order-meta-value">{formatMoney(order.total)}</div>
                      </div>
                      {/* Balance summary hidden for V1; data retained. */}
                      {false && Number(order.balance) > 0 && (
                        <div className="order-meta">
                          <div className="order-meta-label">Balance</div>
                          <div className="order-meta-value">{formatMoney(order.balance)}</div>
                        </div>
                      )}
                      {/* Overall order Status summary hidden for V1; row statuses remain visible. */}
                      {false && <div className="order-meta">
                        <div className="order-meta-label">Status</div>
                        <div className="order-meta-value">{order.ui_status || "—"}</div>
                      </div>}
                      <div className="order-meta">
                        <div className="order-meta-label">Order #{order.order_number}</div>
                        <div className="order-meta-value">{plainStatus(order.ui_status || order.status)}</div>
                      </div>
                    </div>

                    <div className="order-table-wrapper">
                      <table className="order-table">
                        <thead>
                          <tr>
                            <th scope="col">Product / Service</th>
                            <th scope="col">Description</th>
                            <th scope="col">Qty</th>
                            <th scope="col">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {!hasRows && (
                            <tr>
                              <td colSpan={4}>
                                <span className="product-description">No services on this order</span>
                              </td>
                            </tr>
                          )}
                          {order.services.map((service, idx) => {
                            const status = service.ui_status || service.status || "In Progress";
                            const appointment = formatAppointment(
                              service.customer_preferred_datestarttime || service.customer_preferred,
                            );
                            const rush = (service.rush_option || "").trim();
                            return (
                              <tr key={`s-${service.id ?? idx}`}>
                                <td>
                                  <span className="product-title">{serviceTitle(service)}</span>
                                  {appointment && <span className="product-sub">Appointment: {appointment}</span>}
                                  {rush && <span className="product-sub">Rush: {rush}</span>}
                                </td>
                                <td>
                                  <span className="product-description">{service.description || address}</span>
                                </td>
                                <td>
                                  <span className="product-qty">{formatQty(service.qty)}</span>
                                </td>
                                <td>
                                  <StatusBadge status={status} />
                                </td>
                              </tr>
                            );
                          })}
                          {order.print_jobs.map((job, idx) => {
                            const status = job.needs_approval
                              ? "Pending"
                              : job.ui_status || job.status || "In Progress";
                            const tracking = order.actions.track ? jobTracking(job) : "";
                            return (
                              <tr key={`p-${job.id ?? idx}`}>
                                <td>
                                  <span className="product-title">
                                    {job.product_details?.name || "Print Product"}
                                  </span>
                                  {job.needs_approval && job.id != null && (
                                    <Link href={`/proof-review?id=${job.id}`} className="product-sub">
                                      Review proof →
                                    </Link>
                                  )}
                                </td>
                                <td>
                                  <span className="product-description">{address || job.description || ""}</span>
                                </td>
                                <td>
                                  <span className="product-qty">{formatQty(job.qty)}</span>
                                </td>
                                <td>
                                  {job.needs_approval ? (
                                    <div className="status-cell-content">
                                      <StatusBadge status={status} />
                                      <WarningIcon />
                                    </div>
                                  ) : (
                                    <StatusBadge
                                      status={status}
                                      href={tracking ? trackingHref(tracking) : undefined}
                                    />
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="order-card-actions">
                      <Link href={`/order-details?id=${order.id}`} className="ov2-btn">
                        <FileText className="w-3.5 h-3.5" />
                        {orderIsOpen(order) ? "View details" : "View invoice"}
                      </Link>
                      {canTrack && (
                        <a
                          className="ov2-btn"
                          href={trackingHref(firstTracking)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Truck className="w-3.5 h-3.5" />
                          Track
                        </a>
                      )}
                      {canReorder && (
                        <button
                          type="button"
                          className="ov2-btn"
                          onClick={() => navigate(`/new-order?tourid=${encodeURIComponent(tourId)}`)}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Reorder
                        </button>
                      )}
                      {order.actions.cancel && (
                        <button type="button" className="ov2-btn danger" onClick={() => setCancelOrder(order)}>
                          <Ban className="w-3.5 h-3.5" />
                          Cancel
                        </button>
                      )}
                      {order.actions.report_problem && (
                        <button type="button" className="ov2-btn primary" onClick={() => setReportOrder(order)}>
                          Report a problem
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </section>
          )}

          {!loading && !error && pagination.last_page > 1 && (
            <nav className="orders-pagination" aria-label="Orders pagination">
              <button
                type="button"
                className="orders-page-btn"
                disabled={page <= 1}
                onClick={() => goToPage(page - 1)}
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <div className="orders-page-list">
                {pageWindow(pagination.current_page, pagination.last_page).map((item, idx) =>
                  item === "ellipsis" ? (
                    <span key={`e-${idx}`} className="orders-page-ellipsis">
                      …
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      className={`orders-page-num ${item === page ? "active" : ""}`}
                      onClick={() => goToPage(item)}
                    >
                      {item}
                    </button>
                  ),
                )}
              </div>
              <button
                type="button"
                className="orders-page-btn"
                disabled={page >= pagination.last_page}
                onClick={() => goToPage(page + 1)}
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </nav>
          )}
        </div>
      </div>

      <ReportProblemDialog
        open={reportOrder != null}
        onOpenChange={(open) => {
          if (!open) setReportOrder(null);
        }}
        orderId={reportOrder?.id ?? ""}
        orderTotal={reportOrder?.total}
        orderDate={reportOrder?.date ? formatDate(reportOrder.date) : undefined}
        onSubmitted={(msg) => toast({ title: msg })}
      />
      <CancelOrderDialog
        open={cancelOrder != null}
        onOpenChange={(open) => {
          if (!open) setCancelOrder(null);
        }}
        orderId={cancelOrder?.id ?? ""}
        onSuccess={(msg) => {
          showSuccess(msg);
          setReloadKey((k) => k + 1);
        }}
      />
      <PortalFooter />
    </div>
  );
}
