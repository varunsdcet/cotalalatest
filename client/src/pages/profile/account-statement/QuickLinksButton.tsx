import { useEffect, useRef, useState } from "react";
import { Link2 } from "lucide-react";

const LINKS = [
  { label: "My Orders", href: "/orders" },
  { label: "Profile", href: "/profile" },
  { label: "Billing", href: "/profile?tab=billing" },
  { label: "Preferences", href: "/profile?tab=preferences" },
  { label: "New Appointment", href: "/new-appointment" },
];

export function QuickLinksButton() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div className="acct-stmt-quick-wrap" ref={rootRef}>
      <button
        type="button"
        className="acct-stmt-quick-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Link2 className="h-4 w-4 shrink-0" />
        Quick Links
      </button>
      {open ? (
        <div className="acct-stmt-quick-menu">
          {LINKS.map((link) => (
            <a key={link.href} href={link.href} className="acct-stmt-quick-item" onClick={() => setOpen(false)}>
              {link.label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
