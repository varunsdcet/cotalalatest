import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Calendar,
  CheckCircle,
  DollarSign,
  FileText,
  Printer,
  XCircle,
} from "lucide-react";
import {
  getOrderDetails,
  getPortalOrderDetail,
  getPortalOrders,
  getUserHome,
  getUserIdFromStorage,
  type OrderDetailsResponse,
  type OrderPaymentRecord,
  type OrderPrintJob,
} from "@/lib/api";
import PortalFooter from "@/components/portal/PortalFooter";

type LooseService = Record<string, unknown> & {
  service_details?: OrderDetailsResponse["orderservice"][number]["servicedetails"];
  servicedetails?: OrderDetailsResponse["orderservice"][number]["servicedetails"];
  tourdetails?: OrderDetailsResponse["orderservice"][number]["tourdetails"];
};

type InvoiceLine = {
  key: string;
  item: string;
  description: string;
  qty: string;
  rate: string;
  price: string;
  gst: string;
  pst: string;
  status: string;
};

function mapServices(
  services: LooseService[] | undefined,
  tour?: OrderDetailsResponse["orderservice"][number]["tourdetails"]
): OrderDetailsResponse["orderservice"] {
  return (services || []).map((service) => ({
    ...(service as OrderDetailsResponse["orderservice"][number]),
    servicedetails:
      service.service_details ||
      service.servicedetails ||
      (service as OrderDetailsResponse["orderservice"][number]).servicedetails,
    tourdetails: service.tourdetails || tour,
  }));
}

function listItems(raw: unknown): Array<Record<string, unknown>> {
  if (!raw || typeof raw !== "object") return [];
  const root = raw as Record<string, unknown>;
  if (Array.isArray(root)) return root as Array<Record<string, unknown>>;
  if (Array.isArray(root.data)) return root.data as Array<Record<string, unknown>>;
  if (root.data && typeof root.data === "object") {
    const inner = root.data as Record<string, unknown>;
    if (Array.isArray(inner.data)) return inner.data as Array<Record<string, unknown>>;
    if (Array.isArray(inner.items)) return inner.items as Array<Record<string, unknown>>;
  }
  if (Array.isArray(root.upcomingservice)) return root.upcomingservice as Array<Record<string, unknown>>;
  return [];
}

function asPrintJobs(raw: unknown): OrderPrintJob[] {
  return Array.isArray(raw) ? (raw as OrderPrintJob[]) : [];
}

function detailsFromRow(row: Record<string, unknown>, fallbackId?: string): OrderDetailsResponse | null {
  if (!row) return null;
  const id = row.id ?? fallbackId;
  if (id == null) return null;
  const services = (row.services || row.orderservice || []) as LooseService[];
  return {
    status: true,
    order: {
      id,
      status: String(row.status || ""),
      total: String(row.total ?? "0"),
      subtotal: String(row.subtotal ?? row.total ?? "0"),
      gst: String(row.gst ?? "0"),
      pst: String(row.pst ?? "0"),
      balance: String(row.balance ?? "0"),
      po: String(row.po ?? ""),
      sales: String(row.sales ?? ""),
      datecreated: String(row.datecreated || row.created || ""),
      datebilled: row.datebilled ? String(row.datebilled) : null,
      datepaid: row.datepaid ? String(row.datepaid) : null,
      datecompleted: row.datecompleted ? String(row.datecompleted) : null,
      transactionID: String(row.transactionID ?? ""),
      summary: String(row.summary || ""),
      notes: String(row.notes || ""),
      recurring: String(row.recurring || ""),
      mediashell: String(row.mediashell || ""),
    } as OrderDetailsResponse["order"],
    orderservice: mapServices(
      Array.isArray(services) ? services : [],
      (row.tourdetails || row.tour) as OrderDetailsResponse["orderservice"][number]["tourdetails"]
    ),
    print_jobs: asPrintJobs(row.print_jobs),
    payments: Array.isArray(row.payments) ? (row.payments as OrderPaymentRecord[]) : [],
  };
}

function normalizeOrderDetail(raw: unknown, fallbackId?: string): OrderDetailsResponse | null {
  if (!raw || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;
  if (root.status === false) return null;
  const payload =
    root.data && typeof root.data === "object" && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : root;
  const orderCandidate = (payload.order || (payload.id ? payload : null)) as
    | Record<string, unknown>
    | null;
  if (!orderCandidate) return null;
  const services = (payload.services ||
    payload.orderservice ||
    root.orderservice ||
    []) as LooseService[];
  return {
    status: true,
    order: {
      ...(orderCandidate as OrderDetailsResponse["order"]),
      id: (orderCandidate.id as string | number) ?? Number(fallbackId),
    },
    orderservice: mapServices(
      Array.isArray(services) ? services : [],
      (payload.tour || orderCandidate.tourdetails) as OrderDetailsResponse["orderservice"][number]["tourdetails"]
    ),
    print_jobs: asPrintJobs(payload.print_jobs ?? root.print_jobs),
    payments: Array.isArray(payload.payments)
      ? (payload.payments as OrderPaymentRecord[])
      : Array.isArray(root.payments)
        ? (root.payments as OrderPaymentRecord[])
        : [],
  };
}

function money(value?: string | number | null, blankZero = false) {
  const n = Number(value);
  if (!Number.isFinite(n)) return blankZero ? "" : "0.00";
  if (blankZero && n === 0) return "";
  return n.toFixed(2);
}

function qtyLabel(value?: string | number | null) {
  if (value == null || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  if (Number.isInteger(n)) return String(n);
  return String(value);
}

function createdBy(sales?: string) {
  if (!sales) return "";
  const name = sales.split("@")[0] || sales;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function paymentResponseText(payment: OrderPaymentRecord): string {
  if (!payment.paymentlog) return "";
  try {
    const parsed = JSON.parse(payment.paymentlog) as { response?: { resptext?: string } };
    return parsed?.response?.resptext?.trim() || "";
  } catch {
    return "";
  }
}

export default function OrderDetails() {
  const [location, setLocation] = useLocation();
  const [orderData, setOrderData] = useState<OrderDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getOrderId = () => {
    try {
      let search = window.location.search;
      if (!search && window.location.href.includes("?")) {
        const url = new URL(window.location.href);
        search = url.search;
      }
      return new URLSearchParams(search).get("id");
    } catch (e) {
      console.error("Error parsing URL params:", e);
      return null;
    }
  };

  useEffect(() => {
    const loadOrderDetails = async () => {
      const orderId = getOrderId();

      if (!orderId) {
        setError("Order ID is required");
        setLoading(false);
        return;
      }

      const user_id = getUserIdFromStorage();
      if (!user_id) {
        setError("User not logged in");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        setOrderData(null);

        let details: OrderDetailsResponse | null = null;
        let lastMsg = "";

        try {
          const portal = await getPortalOrderDetail(orderId);
          details = normalizeOrderDetail(portal, orderId);
          lastMsg = String(
            (portal as { msg?: string; message?: string }).msg ||
              (portal as { message?: string }).message ||
              ""
          );
        } catch (portalErr) {
          console.warn("Portal order detail failed", portalErr);
        }

        if (!details) {
          try {
            const legacy = await getOrderDetails({ id: orderId, user_id });
            details = normalizeOrderDetail(legacy, orderId);
            lastMsg =
              lastMsg ||
              String((legacy as { msg?: string; message?: string }).msg || (legacy as { message?: string }).message || "");
          } catch (legacyErr) {
            console.warn("Legacy order-details failed", legacyErr);
          }
        }

        if (!details) {
          try {
            const lists = await Promise.allSettled([
              getPortalOrders({ search: orderId, per_page: 50 }),
              getPortalOrders({ per_page: 50 }),
              getUserHome({
                user_id,
                device_id: "web",
                device_token: "web-token",
                device_type: "web",
              }),
            ]);
            for (const result of lists) {
              if (result.status !== "fulfilled") continue;
              const items = listItems(result.value);
              const found = items.find((item) => String(item.id) === String(orderId));
              if (found) {
                details = detailsFromRow(found, orderId);
                break;
              }
            }
          } catch (listErr) {
            console.warn("Orders list fallback failed", listErr);
          }
        }

        if (details?.order) {
          setOrderData(details);
        } else {
          setError(lastMsg || "Failed to load order details");
        }
      } catch (err) {
        console.error("Failed to load order details", err);
        setError("Failed to load order details. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    loadOrderDetails();

    const handleUrlChange = () => {
      loadOrderDetails();
    };
    window.addEventListener("popstate", handleUrlChange);

    let previousOrderId = getOrderId();
    const checkInterval = setInterval(() => {
      const currentOrderId = getOrderId();
      if (currentOrderId && currentOrderId !== previousOrderId) {
        previousOrderId = currentOrderId;
        loadOrderDetails();
      }
    }, 300);

    return () => {
      window.removeEventListener("popstate", handleUrlChange);
      clearInterval(checkInterval);
    };
  }, [location]);

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "—";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    });
  };

  const formatDateTime = (dateString: string | null | undefined) => {
    if (!dateString) return "—";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusColor = (status?: string) => {
    const statusLower = (status || "").toLowerCase();
    if (
      ["paid", "complete", "completed", "closed", "shipped", "approved", "billed"].includes(
        statusLower
      )
    ) {
      return "bg-green-500/20 text-green-400 border-green-500/50";
    }
    if (statusLower === "cancelled") {
      return "bg-red-500/20 text-red-400 border-red-500/50";
    }
    if (["spec", "new", "in progress"].includes(statusLower)) {
      return "bg-blue-500/20 text-blue-400 border-blue-500/50";
    }
    if (statusLower === "pending") {
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/50";
    }
    return "bg-gray-500/20 text-gray-400 border-gray-500/50";
  };

  const lines: InvoiceLine[] = useMemo(() => {
    if (!orderData) return [];
    const serviceLines: InvoiceLine[] = (orderData.orderservice || []).map((service) => {
      const name = service.servicedetails?.name || service.servicedetails?.frontendtitle || "Service";
      const desc = [name, service.description].filter(Boolean).join(" — ");
      return {
        key: `svc-${service.id}`,
        item: `S${service.service || service.servicedetails?.id || ""}`,
        description: desc,
        qty: qtyLabel(service.qty),
        rate: money(service.rate),
        price: money(service.price),
        gst: money(service.gst, true),
        pst: money(service.pst, true),
        status: service.ui_status || service.status || "",
      };
    });
    const printLines: InvoiceLine[] = (orderData.print_jobs || []).map((job) => {
      const name = job.product_details?.name || "Print Product";
      const size =
        job.longedge && job.shortedge ? `${job.longedge}"x${job.shortedge}"` : "";
      const parts = [name, size, job.colour, job.description, job.id ? `(JOB# ${job.id})` : ""]
        .map((p) => String(p || "").trim())
        .filter(Boolean);
      return {
        key: `print-${job.id}`,
        item: `P${job.prod || job.product_details?.id || ""}`,
        description: parts.join(", "),
        qty: qtyLabel(job.qty),
        rate: money(job.rate),
        price: money(job.price),
        gst: money(job.gst, true),
        pst: money(job.pst, true),
        status: job.needs_approval ? "Pending" : String(job.status || ""),
      };
    });
    return [...printLines, ...serviceLines];
  }, [orderData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#b388ff] mx-auto mb-4"></div>
          <p className="text-white/70">Loading invoice...</p>
        </div>
      </div>
    );
  }

  if (error || !orderData?.order) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <XCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Error</h2>
          <p className="text-white/70 mb-6">{error || "Order not found"}</p>
          <Button
            onClick={() => setLocation("/orders")}
            className="bg-[#b388ff] hover:bg-[#b388ff]/80 text-white"
          >
            Back to Orders
          </Button>
        </div>
      </div>
    );
  }

  const order = orderData.order;
  const payments = orderData.payments || [];
  const paymentsTotal = payments.reduce((sum, p) => sum + Number(p.amt || 0), 0);
  const paidAmount =
    paymentsTotal > 0 ? paymentsTotal : Number(order.total || 0) - Number(order.balance || 0);
  const isPaid = payments.length > 0 || Boolean(order.datepaid) || paidAmount > 0;

  return (
    <div className="min-h-screen bg-black text-white invoice-page">
      <div className="new-bg-4 w-full relative print:hidden" style={{ height: "160px", minHeight: "160px" }}>
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative h-full flex flex-col justify-end p-6 md:p-8 z-10">
          <div className="overlay-1">
            <Button
              onClick={() => setLocation("/orders")}
              variant="ghost"
              className="text-white hover:bg-white/10 mb-2"
            >
              <ArrowLeft className="h-5 w-5 mr-2" />
              Back
            </Button>
            <h2 className="text-[#b388ff] text-3xl md:text-4xl font-bold">Order No. {order.id}</h2>
          </div>
        </div>
      </div>

      <div className="service-package bg-black">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6 print:hidden">
            <h1 className="text-[#b388ff] text-2xl font-semibold hidden md:block">Order No. {order.id}</h1>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-white/20 text-white hover:bg-white/10"
                onClick={() => window.print()}
              >
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
              <span className={`px-4 py-2 rounded-full border text-sm font-semibold ${getStatusColor(order.status)}`}>
                {order.status}
              </span>
            </div>
          </div>

          <div className="bg-black/40 border border-white/20 rounded-lg p-6 mb-6">
            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4 text-sm">
              <div>
                <dt className="text-white/50">Date Created</dt>
                <dd className="text-white mt-1">{formatDate(order.datecreated)}</dd>
              </div>
              {order.sales ? (
                <div>
                  <dt className="text-white/50">Created By</dt>
                  <dd className="text-white mt-1">{createdBy(order.sales)}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-white/50">Date Billed</dt>
                <dd className="text-white mt-1">{formatDate(order.datebilled)}</dd>
              </div>
              <div>
                <dt className="text-white/50">Date Paid</dt>
                <dd className="text-white mt-1">{formatDate(order.datepaid)}</dd>
              </div>
              <div>
                <dt className="text-white/50">PO#</dt>
                <dd className="text-white mt-1">{order.po?.trim() || "—"}</dd>
              </div>
              <div>
                <dt className="text-white/50">Recurring</dt>
                <dd className="text-white mt-1">
                  {String(order.recurring || "").toLowerCase() === "yes" ? "Yes" : "No"}
                </dd>
              </div>
            </dl>
            {order.notes ? (
              <div className="mt-5 pt-4 border-t border-white/10">
                <p className="text-white/50 text-sm mb-1">Order Notes</p>
                <p className="text-white/80 text-sm whitespace-pre-wrap">{order.notes}</p>
              </div>
            ) : null}
            {order.summary ? (
              <p className="text-white/50 text-sm mt-4">{order.summary}</p>
            ) : null}
          </div>

          <div className="bg-black/40 border border-white/20 rounded-lg p-4 md:p-6 mb-6 overflow-x-auto">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Line items
            </h3>
            {lines.length === 0 ? (
              <p className="text-white/70">No line items on this order.</p>
            ) : (
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-left text-[#b388ff] border-b border-white/15">
                    <th className="py-2 pr-3 font-medium">Item</th>
                    <th className="py-2 pr-3 font-medium">Description</th>
                    <th className="py-2 pr-3 font-medium text-right">Ordered</th>
                    <th className="py-2 pr-3 font-medium text-right">Rate</th>
                    <th className="py-2 pr-3 font-medium text-right">Price</th>
                    <th className="py-2 pr-3 font-medium text-right">GST</th>
                    <th className="py-2 pr-3 font-medium text-right">PST</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.key} className="border-b border-white/10 align-top">
                      <td className="py-3 pr-3 font-semibold text-[#b388ff] whitespace-nowrap">{line.item}</td>
                      <td className="py-3 pr-3 text-white/85">{line.description}</td>
                      <td className="py-3 pr-3 text-right text-white">{line.qty}</td>
                      <td className="py-3 pr-3 text-right text-white/80">{line.rate}</td>
                      <td className="py-3 pr-3 text-right text-white">{line.price}</td>
                      <td className="py-3 pr-3 text-right text-white/80">{line.gst}</td>
                      <td className="py-3 pr-3 text-right text-white/80">{line.pst}</td>
                      <td className="py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full border text-xs ${getStatusColor(line.status)}`}>
                          {line.status || "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-black/40 border border-white/20 rounded-lg p-6">
              <h3 className="text-[#b388ff] text-lg font-semibold mb-4">Payments</h3>
              {payments.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="text-left text-[#b388ff] border-b border-white/15">
                        <th className="py-2 pr-3 font-medium">Date</th>
                        <th className="py-2 pr-3 font-medium">Method</th>
                        <th className="py-2 pr-3 font-medium">Card</th>
                        <th className="py-2 pr-3 font-medium text-right">Amount</th>
                        <th className="py-2 font-medium">Transaction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((payment) => {
                        const respText = paymentResponseText(payment);
                        return (
                          <tr key={String(payment.id)} className="border-b border-white/10 align-top">
                            <td className="py-3 pr-3 text-white/85 whitespace-nowrap">
                              {formatDateTime(payment.date)}
                            </td>
                            <td className="py-3 pr-3 text-white">{payment.method || "—"}</td>
                            <td className="py-3 pr-3 text-white/80">{payment.cardnumber || "—"}</td>
                            <td className="py-3 pr-3 text-right text-white font-medium">
                              ${money(payment.amt)}
                            </td>
                            <td className="py-3 text-white/80">
                              {payment.transactionID ? (
                                <span className="font-mono text-xs">TR# {payment.transactionID}</span>
                              ) : (
                                "—"
                              )}
                              {respText ? (
                                <span className="block text-xs text-green-400 mt-0.5">{respText}</span>
                              ) : null}
                              {payment.depositto ? (
                                <span className="block text-xs text-white/45 mt-0.5">{payment.depositto}</span>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : isPaid ? (
                <p className="text-white/85 text-sm leading-relaxed">
                  Paid ${money(paidAmount > 0 ? paidAmount : order.total)} on {formatDateTime(order.datepaid)}
                  {order.transactionID ? ` TR# ${order.transactionID}` : ""}.
                </p>
              ) : (
                <p className="text-white/60 text-sm">No payments recorded yet.</p>
              )}
              {order.datecreated ? (
                <div className="mt-6 flex items-start gap-2 text-white/50 text-sm">
                  <Calendar className="h-4 w-4 mt-0.5" />
                  <span>Order placed {formatDateTime(order.datecreated)}</span>
                </div>
              ) : null}
            </div>

            <div className="bg-black/40 border border-white/20 rounded-lg p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Totals
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-white/70">
                  <span>Pre Tax Total</span>
                  <span>${money(order.subtotal)}</span>
                </div>
                <div className="flex justify-between text-white/70">
                  <span>GST</span>
                  <span>${money(order.gst)}</span>
                </div>
                <div className="flex justify-between text-white/70">
                  <span>PST</span>
                  <span>${money(order.pst)}</span>
                </div>
                <div className="flex justify-between text-white font-semibold pt-2 border-t border-white/15">
                  <span>Total</span>
                  <span>${money(order.total)}</span>
                </div>
                <div className="flex justify-between text-white/70">
                  <span>Payments</span>
                  <span>-${money(isPaid ? (paidAmount > 0 ? paidAmount : order.total) : 0)}</span>
                </div>
                <div className={`flex justify-between font-bold ${Number(order.balance || 0) > 0 ? "text-red-400" : "text-white"}`}>
                  <span>Balance</span>
                  <span className="inline-flex items-center gap-1">
                    ${money(order.balance)}
                    {Number(order.balance || 0) === 0 ? <CheckCircle className="h-4 w-4 text-green-400" /> : null}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <PortalFooter />
    </div>
  );
}
