import { useEffect } from "react";
import { useLocation } from "wouter";

/** Legacy route — redirects to feature-sheet-builder. */
export default function FeatureListingRedirect() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id")?.trim();
    if (id) {
      setLocation(`/feature-sheet-builder?id=${encodeURIComponent(id)}`);
    } else {
      setLocation("/feature-sheet");
    }
  }, [setLocation]);

  return (
    <div className="min-h-[40vh] flex items-center justify-center text-white/60">
      Opening feature sheet workspace…
    </div>
  );
}
