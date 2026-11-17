import { useEffect, useMemo } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { CheckCircle2 } from "lucide-react";
import heroBg from "@/pages/images/banner-09.png";
import "./booking-engine.css";

export default function BookingThankYouPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const bookingId = params.get("booking_id") || params.get("id") || "";

  useEffect(() => {
    const timer = window.setTimeout(() => setLocation("/orders"), 8000);
    return () => window.clearTimeout(timer);
  }, [setLocation]);

  return (
    <div className="booking-engine booking-engine--thankyou">
      <header className="booking-engine__hero" style={{ minHeight: 180 }}>
        <div className="booking-engine__hero-bg" style={{ backgroundImage: `url(${heroBg})` }} />
        <div className="booking-engine__hero-content">
          <div className="booking-engine__eyebrow">Cotala · Booking</div>
          <h1 className="booking-engine__title">Thank you</h1>
        </div>
      </header>

      <div className="booking-engine__body" style={{ maxWidth: 640, width: "100%" }}>
        <section className="booking-engine__panel" style={{ textAlign: "center", padding: "40px 28px" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
            <CheckCircle2 size={72} color="#6ee7a8" strokeWidth={1.5} />
          </div>
          <h2 style={{ margin: "0 0 10px", fontSize: 28 }}>Event created successfully</h2>
          <p className="hint" style={{ marginBottom: 8 }}>
            Your appointment has been committed to the calendars.
          </p>
          {bookingId ? (
            <p style={{ color: "var(--be-accent-2)", margin: "0 0 24px", fontSize: 14 }}>
              Booking ID: {bookingId}
            </p>
          ) : (
            <div style={{ height: 24 }} />
          )}

          <div className="booking-engine__actions" style={{ justifyContent: "center" }}>
            <button
              type="button"
              className="booking-engine__btn booking-engine__btn--primary"
              onClick={() => setLocation("/orders")}
            >
              View orders
            </button>
            <button
              type="button"
              className="booking-engine__btn booking-engine__btn--ghost"
              onClick={() => setLocation("/booking-engine")}
            >
              Book another
            </button>
          </div>

          <p style={{ marginTop: 24, color: "var(--be-muted)", fontSize: 12 }}>
            Redirecting to orders in a few seconds…{" "}
            <Link href="/orders" style={{ color: "inherit", textDecoration: "underline" }}>
              Go now
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
