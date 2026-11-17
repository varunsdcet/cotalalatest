import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import heroBg from "@/pages/images/banner-09.png";
import {
  commitBooking,
  getBookingBootstrap,
  getBookingCatalog,
  getBookingRecommendations,
  validateBookingOption,
  type BookingCatalogData,
  type BookingCategoryKey,
  type BookingRecommendation,
  type BookingRequestBody,
  type BookingStaff,
  type BookingTimePreference,
} from "@/lib/api";
import "./booking-engine.css";

const CATEGORY_ORDER: BookingCategoryKey[] = ["photography", "drafting", "videography", "drone"];

type Step = 1 | 2 | 3;

type EditableAppt = {
  service_id: number;
  category: string;
  staff_id: number;
  email?: string;
  start: string;
  duration_minutes: number;
  serviceName?: string;
  driveIn?: string;
  driveOut?: string;
  endEst?: string;
};

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Keep booking date on/after today (API sometimes returns a past or far-ahead date). */
function clampBookingDate(value?: string | null) {
  const today = todayIso();
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return today;
  return value < today ? today : value;
}

function formatTimeLabel(value: string) {
  if (!value || value === "any") return value || "—";
  const [hStr, mStr = "00"] = value.split(":");
  let h = Number(hStr);
  if (Number.isNaN(h)) return value;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${mStr.padStart(2, "0")} ${ampm}`;
}

function addMinutes(time: string, minutes: number) {
  const [h, m] = time.split(":").map(Number);
  const total = ((((h * 60 + m + minutes) % 1440) + 1440) % 1440);
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function routeLabel(leg?: { minutes?: number | null; km?: number | null } | null) {
  if (!leg || leg.minutes == null) return "—";
  const km = leg.km != null ? ` (${Number(leg.km).toFixed(1)} km)` : "";
  return `${leg.minutes} min${km}`;
}

function staffLabel(staff?: BookingStaff | null) {
  if (!staff) return "Technician";
  const rating = staff.rating != null ? ` (${Number(staff.rating).toFixed(1)}/10)` : "";
  return `${staff.name || staff.email || `Staff #${staff.id}`}${rating}`;
}

function categoryTitle(key: string) {
  return key.replace(/_/g, " ").toUpperCase();
}

function errMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string") return err;
  return fallback;
}

/** API returns many recommendations — keep first 3 (engine order), each with appointments[]. */
function topRecommendations(list: BookingRecommendation[], limit = 3) {
  return list
    .filter((r) => Array.isArray(r.appointments) && r.appointments.length > 0)
    .slice(0, limit);
}

function rowsFromAppointments(
  rec: BookingRecommendation,
  staff: Record<string, BookingStaff>,
  names: Record<number, string>,
): EditableAppt[] {
  return (rec.appointments || []).map((a) => {
    const st = staff[String(a.staff_id)];
    return {
      service_id: a.service_id,
      category: a.category,
      staff_id: a.staff_id,
      email: a.email || st?.email,
      start: a.start,
      duration_minutes: a.duration_minutes,
      serviceName: names[a.service_id] || names[Number(a.service_id)] || `Service #${a.service_id}`,
      driveIn: routeLabel(a.route?.inbound),
      driveOut: routeLabel(a.route?.outbound),
      endEst: a.start && a.duration_minutes != null ? addMinutes(a.start, a.duration_minutes) : rec.finish || "—",
    };
  });
}

function parseStep(value: unknown): Step {
  const n = Number(value);
  if (n === 2 || n === 3) return n;
  return 1;
}

export default function BookingEnginePage() {
  const [, setLocation] = useLocation();
  const [step, setStepState] = useState<Step>(() => {
    if (typeof window === "undefined") return 1;
    return parseStep(new URLSearchParams(window.location.search).get("step"));
  });
  const [maxReached, setMaxReached] = useState<Step>(() => {
    if (typeof window === "undefined") return 1;
    return parseStep(new URLSearchParams(window.location.search).get("step"));
  });
  const [bootLoading, setBootLoading] = useState(true);

  const setStep = useCallback((next: Step, mode: "push" | "replace" = "push") => {
    setStepState(next);
    setMaxReached((prev) => (next > prev ? next : prev));
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (next <= 1) url.searchParams.delete("step");
    else url.searchParams.set("step", String(next));
    const href = `${url.pathname}${url.search}${url.hash}`;
    if (mode === "replace") window.history.replaceState({ bookingStep: next }, "", href);
    else window.history.pushState({ bookingStep: next }, "", href);
  }, []);

  useEffect(() => {
    const onPop = () => {
      const next = parseStep(new URLSearchParams(window.location.search).get("step"));
      setStepState(next);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [recLoading, setRecLoading] = useState(false);
  const [commitLoading, setCommitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [cities, setCities] = useState<string[]>([]);
  const [timePrefs, setTimePrefs] = useState<BookingTimePreference[]>([]);
  const [catalog, setCatalog] = useState<BookingCatalogData | null>(null);

  const [unit, setUnit] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState("10:30");
  const [sizeSf, setSizeSf] = useState("1000");

  const [selectedServices, setSelectedServices] = useState<Record<string, string>>({});
  const [selectedAddons, setSelectedAddons] = useState<Record<string, string[]>>({});
  const [selectedDiscounts, setSelectedDiscounts] = useState<string[]>([]);
  const [printQty, setPrintQty] = useState<Record<string, number>>({});
  const [instructions, setInstructions] = useState<Record<string, string>>({});

  const [recommendations, setRecommendations] = useState<BookingRecommendation[]>([]);
  const [staffMap, setStaffMap] = useState<Record<string, BookingStaff>>({});
  const [serviceNames, setServiceNames] = useState<Record<number, string>>({});
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editableAppts, setEditableAppts] = useState<EditableAppt[]>([]);
  const [committedId, setCommittedId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBootLoading(true);
      setError(null);
      try {
        const res = await getBookingBootstrap();
        if (cancelled) return;
        const data = res.data || {};
        const cityList = (data.cities || []).map((c) => c.city).filter(Boolean);
        setCities(cityList);
        setTimePrefs(data.time_preferences || []);
        // Always land on today or later — never leave a past API date selected.
        setDate(clampBookingDate(data.requested_date));
        if (data.preferred_time || data.default_time) {
          setTime(data.preferred_time || data.default_time || "10:30");
        }
        if (cityList.length && !city) setCity(cityList.includes("Coquitlam") ? "Coquitlam" : cityList[0]);
      } catch (e) {
        if (!cancelled) setError(errMessage(e, "Failed to load booking bootstrap."));
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCatalog = useCallback(async (sf: number) => {
    setCatalogLoading(true);
    setError(null);
    try {
      const res = await getBookingCatalog(sf);
      setCatalog(res.data || null);
    } catch (e) {
      setError(errMessage(e, "Failed to load service catalog."));
      setCatalog(null);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    const n = Number(sizeSf);
    if (!Number.isFinite(n) || n <= 0) return;
    const t = window.setTimeout(() => {
      void loadCatalog(n);
    }, 350);
    return () => window.clearTimeout(t);
  }, [sizeSf, loadCatalog]);

  const categories = useMemo(() => {
    const raw = catalog?.categories || {};
    const keys = [
      ...CATEGORY_ORDER.filter((k) => raw[k]),
      ...Object.keys(raw).filter((k) => !CATEGORY_ORDER.includes(k)),
    ];
    return keys.map((key) => ({ key, ...raw[key] }));
  }, [catalog]);

  const showPrint = useMemo(() => {
    const photo = categories.find((c) => c.key === "photography");
    if (!photo) return false;
    const sid = selectedServices.photography;
    if (!sid) return false;
    const svc = photo.services?.find((s) => String(s.id) === String(sid));
    return svc?.printaddons === "yes";
  }, [categories, selectedServices]);

  function setService(category: string, serviceId: string) {
    setSelectedServices((prev) => {
      const next = { ...prev };
      if (!serviceId) delete next[category];
      else next[category] = serviceId;
      return next;
    });
    // Print add-ons are photography-only — clear qty when photo service drops / changes off print.
    if (category === "photography") {
      const photo = categories.find((c) => c.key === "photography");
      const svc = photo?.services?.find((s) => String(s.id) === String(serviceId));
      if (!serviceId || svc?.printaddons !== "yes") setPrintQty({});
    }
  }

  const selectedServiceIds = useMemo(() => {
    return Object.values(selectedServices)
      .filter(Boolean)
      .map((id) => Number(id))
      .filter((n) => Number.isFinite(n));
  }, [selectedServices]);

  function toggleAddon(category: string, code: string) {
    setSelectedAddons((prev) => {
      const cur = new Set(prev[category] || []);
      if (cur.has(code)) cur.delete(code);
      else cur.add(code);
      return { ...prev, [category]: Array.from(cur) };
    });
  }

  function toggleDiscount(code: string) {
    setSelectedDiscounts((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  function buildRequestBody(option?: BookingRequestBody["option"]): BookingRequestBody {
    const addons: Record<string, string[]> = {};
    for (const [cat, codes] of Object.entries(selectedAddons)) {
      if (codes?.length) addons[cat] = codes;
    }
    const print: Record<string, number> = {};
    for (const [code, qty] of Object.entries(printQty)) {
      if (qty > 0) print[code] = qty;
    }
    const instr: Record<string, string> = {};
    for (const [cat, text] of Object.entries(instructions)) {
      if (text?.trim()) instr[cat] = text.trim();
    }
    const discounts: Record<string, boolean> = {};
    for (const code of selectedDiscounts) discounts[code] = true;

    return {
      unit: unit.trim(),
      street: street.trim(),
      city: city.trim(),
      size_sf: Number(sizeSf) || 0,
      date,
      time,
      service_ids: selectedServiceIds,
      addons,
      discounts,
      print,
      instructions: instr,
      ...(option ? { option } : {}),
    };
  }

  function hydrateEditable(
    rec: BookingRecommendation,
    staff: Record<string, BookingStaff>,
    names: Record<number, string>,
    index = 0,
  ) {
    setEditableAppts(rowsFromAppointments(rec, staff, names));
    setSelectedIndex(index);
  }

  async function onReviewRecommendations() {
    setError(null);
    setSuccess(null);
    setInfo(null);
    if (!street.trim() || !city.trim()) {
      setError("Street and city are required.");
      return;
    }
    if (!selectedServiceIds.length) {
      setError("Select at least one service.");
      return;
    }
    setRecLoading(true);
    try {
      const res = await getBookingRecommendations(buildRequestBody());
      const data = res.data || {};
      const staff = data.staff || {};
      const names: Record<number, string> = {};
      for (const s of data.services || []) names[Number(s.id)] = s.name || `Service #${s.id}`;
      // Also map catalog names so appointment service_id always resolves.
      for (const cat of categories) {
        for (const s of cat.services || []) {
          const id = Number(s.id);
          if (!names[id] && s.name) names[id] = s.name;
        }
      }
      // data.recommendations → top 3 → each option uses recommendation.appointments[]
      const recs = topRecommendations(data.recommendations || []);
      setRecommendations(recs);
      setStaffMap(staff);
      setServiceNames(names);
      if (!recs.length) {
        setError("No recommendations available for this request.");
        setStep(2, "replace");
        return;
      }
      hydrateEditable(recs[0], staff, names, 0);
      setStep(3);
      if (data.warnings?.length) setInfo(data.warnings.join(" "));
    } catch (e) {
      setError(errMessage(e, "Failed to load recommendations."));
    } finally {
      setRecLoading(false);
    }
  }

  function selectRecommendation(index: number) {
    const rec = recommendations[index];
    if (!rec) return;
    hydrateEditable(rec, staffMap, serviceNames, index);
  }

  function updateAppt(index: number, patch: Partial<EditableAppt>) {
    setEditableAppts((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const next = { ...row, ...patch };
        if (patch.staff_id != null) {
          const st = staffMap[String(patch.staff_id)];
          next.email = st?.email || next.email;
        }
        if (patch.start != null) next.endEst = addMinutes(patch.start, next.duration_minutes);
        return next;
      }),
    );
  }

  function buildOptionFromEditable(): BookingRequestBody["option"] {
    const base = recommendations[selectedIndex];
    if (!base || !editableAppts.length) return undefined;

    // Selected recommendation's appointment times (e.g. Akshat 15:00) — not the requested form time.
    const appointments = editableAppts.map((a) => {
      const st = staffMap[String(a.staff_id)];
      return {
        service_id: Number(a.service_id),
        category: a.category,
        staff_id: Number(a.staff_id),
        email: a.email || st?.email || "",
        start: a.start,
        duration_minutes: Number(a.duration_minutes),
      };
    });

    const starts = appointments.map((a) => a.start).filter(Boolean).sort();
    const finishes = appointments
      .map((a) => addMinutes(a.start, a.duration_minutes))
      .filter(Boolean)
      .sort();

    return {
      date: base.date,
      start: starts[0] || base.start,
      finish: finishes[finishes.length - 1] || base.finish,
      pattern: base.pattern || "single",
      appointments,
    };
  }

  async function onCommit() {
    setError(null);
    setSuccess(null);
    if (!editableAppts.length) {
      setError("No appointment option selected.");
      return;
    }
    const option = buildOptionFromEditable();
    if (!option?.appointments?.length) {
      setError("Selected option has no appointments to validate.");
      return;
    }
    const summary = editableAppts
      .map((a) => {
        const st = staffMap[String(a.staff_id)];
        return `• ${a.serviceName}\n  ${staffLabel(st)}\n  ${option.date} ${formatTimeLabel(a.start)}`;
      })
      .join("\n\n");
    const ok = window.confirm(
      `Create ${editableAppts.length} pending appointment(s) in Google Calendars?\n\n${summary}\n\nThis action writes to the calendars and cannot be undone from this preview.`,
    );
    if (!ok) return;

    setCommitLoading(true);
    try {
      // Top-level date/time = requested; option.* = selected slot (staff + start from appointments[]).
      const body = buildRequestBody(option);
      const validated = await validateBookingOption(body);
      if (validated.data && validated.data.valid === false) {
        setError("This option is no longer valid. Please review recommendations again.");
        return;
      }
      const res = await commitBooking(body);
      const bookingId = res.data?.booking_id;
      setCommittedId(bookingId ?? null);
      const qs = bookingId != null ? `?booking_id=${encodeURIComponent(String(bookingId))}` : "";
      setLocation(`/booking-thank-you${qs}`);
      return;
    } catch (e) {
      setError(errMessage(e, "Commit failed."));
    } finally {
      setCommitLoading(false);
    }
  }

  const staffOptionsForService = useCallback(
    (serviceId: number) => {
      return Object.values(staffMap).filter((s) => s.skills?.[String(serviceId)]);
    },
    [staffMap],
  );

  return (
    <div className="booking-engine">
      <header className="booking-engine__hero">
        <div className="booking-engine__hero-bg" style={{ backgroundImage: `url(${heroBg})` }} />
        <div className="booking-engine__hero-content">
          <div className="booking-engine__eyebrow">Cotala · Booking</div>
          <h1 className="booking-engine__title">Booking engine</h1>
          <p className="booking-engine__sub">
            Property details, services, ranked technician recommendations, then commit to calendars.
          </p>
        </div>
      </header>

      <div className="booking-engine__body">
        <div className="booking-engine__steps">
          <button
            type="button"
            className={`booking-engine__step-pill ${step === 1 ? "is-active" : step > 1 ? "is-done" : ""}`}
            onClick={() => setStep(1)}
          >
            <span className="booking-engine__step-num">1</span> Property
          </button>
          <button
            type="button"
            className={`booking-engine__step-pill ${step === 2 ? "is-active" : step > 2 ? "is-done" : ""}`}
            disabled={maxReached < 2}
            onClick={() => maxReached >= 2 && setStep(2)}
          >
            <span className="booking-engine__step-num">2</span> Services
          </button>
          <button
            type="button"
            className={`booking-engine__step-pill ${step === 3 ? "is-active" : ""}`}
            disabled={maxReached < 3 || recommendations.length === 0}
            onClick={() => maxReached >= 3 && recommendations.length > 0 && setStep(3)}
          >
            <span className="booking-engine__step-num">3</span> Recommendations
          </button>
        </div>

        {bootLoading && (
          <div className="booking-engine__loading">
            <span className="booking-engine__spinner" /> Loading booking options…
          </div>
        )}
        {error && <div className="booking-engine__error">{error}</div>}
        {info && <div className="booking-engine__info">{info}</div>}
        {success && (
          <div className="booking-engine__success">
            {success}
            {committedId != null && (
              <div style={{ marginTop: 8 }}>
                <Link href="/orders" style={{ color: "inherit", textDecoration: "underline" }}>
                  View orders
                </Link>
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <section className="booking-engine__panel">
            <h2>Property details</h2>
            <p className="hint">Address and timing feed the recommendation engine.</p>
            <div className="booking-engine__grid">
              <label className="field">
                Unit
                <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Optional" />
              </label>
              <label className="field">
                Street
                <input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="20315 96 Avenue" />
              </label>
              <label className="field">
                City
                <select value={city} onChange={(e) => setCity(e.target.value)}>
                  <option value="">Select city</option>
                  {cities.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Square footage (SF)
                <input
                  type="number"
                  min={1}
                  value={sizeSf}
                  onChange={(e) => setSizeSf(e.target.value)}
                />
              </label>
              <label className="field">
                Requested date
                <input
                  type="date"
                  min={todayIso()}
                  value={date}
                  onChange={(e) => setDate(clampBookingDate(e.target.value))}
                  onClick={(e) => {
                    const target = e.currentTarget;
                    if (typeof target.showPicker === "function") {
                      try {
                        target.showPicker();
                      } catch {
                        target.focus();
                      }
                    }
                  }}
                />
              </label>
              <label className="field">
                Requested time
                <select value={time} onChange={(e) => setTime(e.target.value)}>
                  {timePrefs.length ? (
                    timePrefs.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                        {t.surcharge ? ` (+$${t.surcharge})` : ""}
                      </option>
                    ))
                  ) : (
                    <option value={time}>{formatTimeLabel(time)}</option>
                  )}
                </select>
              </label>
            </div>
            <div className="booking-engine__actions">
              <button
                type="button"
                className="booking-engine__btn booking-engine__btn--primary"
                disabled={bootLoading || catalogLoading || !city || !street.trim()}
                onClick={() => setStep(2)}
              >
                Continue to services
              </button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="booking-engine__panel">
            <h2>Services & add-ons</h2>
            <p className="hint">
              Services update with square footage. Select one service per category.
              {catalogLoading ? " Loading catalog…" : ""}
            </p>

            {categories.map((cat) => (
              <div key={cat.key} className="booking-engine__category">
                <h3>{categoryTitle(cat.key)}</h3>
                <label className="field">
                  Service
                  <select
                    value={selectedServices[cat.key] || ""}
                    onChange={(e) => setService(cat.key, e.target.value)}
                  >
                    <option value="">Select service</option>
                    {(cat.services || []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {s.ppu != null ? ` (${Number(s.ppu).toFixed(2)})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedServices[cat.key] && (cat.addons || []).length > 0 && (
                  <div className="booking-engine__addons">
                    {(cat.addons || []).map((a) => (
                      <label key={`${cat.key}-${a.code}`} className="booking-engine__check">
                        <input
                          type="checkbox"
                          checked={(selectedAddons[cat.key] || []).includes(a.code)}
                          onChange={() => toggleAddon(cat.key, a.code)}
                        />
                        <span>{a.code}</span>
                      </label>
                    ))}
                  </div>
                )}
                {selectedServices[cat.key] && (
                  <label className="field" style={{ marginTop: 12 }}>
                    Instructions ({categoryTitle(cat.key)})
                    <textarea
                      rows={2}
                      value={instructions[cat.key] || ""}
                      onChange={(e) =>
                        setInstructions((prev) => ({ ...prev, [cat.key]: e.target.value }))
                      }
                      placeholder="Notes for the technician…"
                    />
                  </label>
                )}
                {cat.key === "photography" && showPrint && (catalog?.printAddons || []).length > 0 && (
                  <div className="booking-engine__print-block">
                    <h4 className="booking-engine__print-title">Printed add-ons (quantities)</h4>
                    <div className="booking-engine__print-grid">
                      {(catalog?.printAddons || []).map((p) => (
                        <div key={p.code} className="booking-engine__print-item">
                          <span>{p.name}</span>
                          <input
                            type="number"
                            min={0}
                            value={printQty[p.code] ?? 0}
                            onChange={(e) =>
                              setPrintQty((prev) => ({
                                ...prev,
                                [p.code]: Math.max(0, Number(e.target.value) || 0),
                              }))
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {(catalog?.discounts || []).length > 0 && (
              <div className="booking-engine__category">
                <h3>Discounts</h3>
                <div className="booking-engine__addons">
                  {(catalog?.discounts || []).map((d) => (
                    <label key={d.code} className="booking-engine__check">
                      <input
                        type="checkbox"
                        checked={selectedDiscounts.includes(d.code)}
                        onChange={() => toggleDiscount(d.code)}
                      />
                      <span>{d.code}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="booking-engine__actions">
              <button
                type="button"
                className="booking-engine__btn booking-engine__btn--ghost"
                onClick={() => setStep(1)}
              >
                Back to property
              </button>
              <button
                type="button"
                className="booking-engine__btn booking-engine__btn--primary"
                disabled={recLoading || !selectedServiceIds.length}
                onClick={() => void onReviewRecommendations()}
              >
                {recLoading ? "Finding times…" : "Review recommendations"}
              </button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="booking-engine__panel">
            <h2>Ranked recommendations</h2>
            <p className="hint">
              Edit technician, date, or start time as needed. End and drive figures reflect the original
              recommendation and do not recalculate after edits.
            </p>

            <div className="booking-engine__actions" style={{ marginTop: 0, marginBottom: 16 }}>
              <button
                type="button"
                className="booking-engine__btn booking-engine__btn--ghost"
                onClick={() => {
                  setSuccess(null);
                  setError(null);
                  setStep(2);
                }}
              >
                Back to services
              </button>
            </div>

            {recommendations.map((rec, idx) => {
              const selected = idx === selectedIndex;
              // Always bind rows from this recommendation's appointments[]
              const rows = selected
                ? editableAppts
                : rowsFromAppointments(rec, staffMap, serviceNames);

              return (
                <div
                  key={`${rec.date}-${rec.start}-${rec.appointments?.[0]?.staff_id}-${idx}`}
                  className={`booking-engine__option ${selected ? "is-selected" : ""}`}
                >
                  <div className="booking-engine__option-head">
                    <h3>
                      {idx + 1}. {rec.date} {formatTimeLabel(rec.start)} ({(rec.pattern || "single").toUpperCase()})
                    </h3>
                    <div className="booking-engine__meta">
                      {rec.team_rank != null && <span className="booking-engine__chip">Rank {rec.team_rank}</span>}
                      {rec.incremental_drive_minutes != null && (
                        <span className="booking-engine__chip">Drive +{rec.incremental_drive_minutes} min</span>
                      )}
                      {rec.minutes_from_requested != null && (
                        <span className="booking-engine__chip">
                          {rec.minutes_from_requested === 0
                            ? "On requested time"
                            : `${rec.minutes_from_requested} min from requested`}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="booking-engine__table-wrap">
                    <table className="booking-engine__table">
                      <thead>
                        <tr>
                          <th>Service</th>
                          <th>Technician</th>
                          <th>Start</th>
                          <th>End (est.)</th>
                          <th>Drive in</th>
                          <th>Drive out</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.length === 0 ? (
                          <tr>
                            <td colSpan={6}>No appointments in this recommendation.</td>
                          </tr>
                        ) : (
                          rows.map((row, ri) => {
                            const st =
                              staffMap[String(row.staff_id)] ||
                              Object.values(staffMap).find(
                                (s) => s.email && row.email && s.email.toLowerCase() === row.email.toLowerCase(),
                              );
                            if (!selected) {
                              return (
                                <tr key={`${idx}-${row.service_id}-${row.staff_id}-${ri}`}>
                                  <td>{row.serviceName}</td>
                                  <td>{staffLabel(st || { id: row.staff_id, email: row.email, name: row.email })}</td>
                                  <td>{formatTimeLabel(row.start)}</td>
                                  <td>{row.endEst}</td>
                                  <td>{row.driveIn}</td>
                                  <td>{row.driveOut}</td>
                                </tr>
                              );
                            }

                            const skilled = staffOptionsForService(row.service_id);
                            const assigned =
                              st ||
                              ({
                                id: row.staff_id,
                                name: row.email,
                                email: row.email,
                              } as BookingStaff);
                            const list = [
                              assigned,
                              ...skilled.filter((s) => Number(s.id) !== Number(row.staff_id)),
                            ];
                            return (
                              <tr key={`${idx}-${row.service_id}-${ri}`}>
                                <td>{row.serviceName}</td>
                                <td>
                                  <select
                                    value={String(row.staff_id)}
                                    onChange={(e) => updateAppt(ri, { staff_id: Number(e.target.value) })}
                                  >
                                    {list.map((s) => (
                                      <option key={s.id} value={s.id}>
                                        {staffLabel(s)}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td>
                                  <input
                                    type="time"
                                    value={row.start}
                                    onChange={(e) => updateAppt(ri, { start: e.target.value })}
                                  />
                                </td>
                                <td>{row.endEst}</td>
                                <td>{row.driveIn}</td>
                                <td>{row.driveOut}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="booking-engine__actions">
                    {!selected ? (
                      <button
                        type="button"
                        className="booking-engine__btn booking-engine__btn--ghost"
                        onClick={() => selectRecommendation(idx)}
                      >
                        Schedule this option
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="booking-engine__btn booking-engine__btn--primary"
                        disabled={commitLoading || !!committedId}
                        onClick={() => void onCommit()}
                      >
                        {commitLoading
                          ? "Committing…"
                          : committedId
                            ? "Committed"
                            : "Commit these appointments to calendars"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}
