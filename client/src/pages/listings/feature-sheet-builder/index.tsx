import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useLocation } from "wouter";
import { Download, Loader2 } from "lucide-react";
import { persistFeatureSheetBuilderSnapshot } from "@/lib/start-feature-sheet";
import {
  fetchFeatureSheetListingPhotos,
  immediateFeatureSheetPhotos,
  uniquePhotoUrls,
} from "@/lib/feature-sheet-photos";
import {
  persistFeatureListingFinalSnapshot,
  readFeatureListingFinalSnapshot,
  type FeatureListingFinalSnapshot,
} from "../feature-listing-preview";
import { BODY_FONT_OPTIONS, HEADING_FONT_OPTIONS } from "./constants";
import { createDefaultFormState, PRINT_LAYOUT, fillFormImagesFromPhotos, formToSnapshot, snapshotToFormState } from "./defaults";
import {
  fmtCurrencyValue,
  fmtPhoneValue,
  fmtStrataValue,
  fmtTextWithNumbers,
} from "./format-helpers";
import {
  exportBrandKit,
  exportProject,
  parseBrandKitImport,
  parseProjectImport,
} from "./project-io";
import { renderFeatureSheetPanels, type FeatureSheetFormState } from "./render-panels";
import { BuilderChatPanel } from "./builder-chat";
import { FeatureSheetOrderPopup } from "./order-popup";
import {
  BrandKitBar,
  CheckboxLabel,
  ColorField,
  FeatureSheetTopbar,
  RangeField,
  SheetPhotoHeader,
} from "./ui-parts";
import "./feature-sheet-builder.css";

type TabId = "chat" | "property" | "photos" | "rooms" | "agent" | "design" | "preview";
type PhotoSlotId = "hero" | "il1" | "rh" | `lb-${number}` | `rg-${number}`;

function getTourIdFromSearch(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("id")?.trim() ?? "";
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}

function countLbSlots(images: FeatureSheetFormState["images"]): number {
  return Math.max(0, ...Object.keys(images.lb).map(Number), 0);
}

function countRgSlots(images: FeatureSheetFormState["images"]): number {
  return Math.max(0, ...Object.keys(images.rg).map(Number), 0);
}

function collectGalleryFromSnapshot(snap: FeatureListingFinalSnapshot): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (u: string | null | undefined) => {
    const t = u?.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  add(snap.coverImage);
  add(snap.agentHeadshot);
  add(snap.agentLogo);
  (snap.primaryImages ?? []).forEach(add);
  (snap.secondaryImages ?? []).forEach(add);
  return out;
}

function seedBuilderState(tourId: string) {
  const snap = tourId ? readFeatureListingFinalSnapshot(tourId) : null;
  const photos = tourId ? immediateFeatureSheetPhotos(tourId) : { cover: "", primary: [], secondary: [], gallery: [] };
  const form = fillFormImagesFromPhotos(
    snap ? snapshotToFormState(snap) : createDefaultFormState(tourId),
    photos,
  );
  const gallery = uniquePhotoUrls([
    ...photos.gallery,
    ...(snap ? collectGalleryFromSnapshot(snap) : []),
  ]);
  return { snap, form, gallery };
}

export default function FeatureSheetBuilderPage() {
  const [, setLocation] = useLocation();
  const tourId = getTourIdFromSearch();
  const seeded = useMemo(() => seedBuilderState(tourId), [tourId]);
  const [tab, setTab] = useState<TabId>("photos");
  const [curPg, setCurPg] = useState<1 | 2>(1);
  const [form, setForm] = useState<FeatureSheetFormState>(() => seeded.form);
  const [snapshot, setSnapshot] = useState<FeatureListingFinalSnapshot | null>(() => seeded.snap);
  const [galleryPhotos, setGalleryPhotos] = useState<string[]>(() => seeded.gallery);
  const [listingPhotos, setListingPhotos] = useState<string[]>(() => seeded.gallery);
  const [photosLoading, setPhotosLoading] = useState(() => seeded.gallery.length === 0);
  const [orderOpen, setOrderOpen] = useState(false);
  const [activeSlot, setActiveSlot] = useState<PhotoSlotId>("hero");
  const [lbCount, setLbCount] = useState(() =>
    countLbSlots(seeded.form.images) > 0 ? Math.max(3, countLbSlots(seeded.form.images)) : 0,
  );
  const [rgCount, setRgCount] = useState(() =>
    countRgSlots(seeded.form.images) > 0 ? Math.max(9, countRgSlots(seeded.form.images)) : 0,
  );
  const brandInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const listingPhotoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!tourId) return;
    let cancelled = false;
    const applyGallery = (urls: string[]) => {
      const gallery = uniquePhotoUrls(urls);
      setListingPhotos(gallery);
      setGalleryPhotos(gallery);
      if (gallery.length) setPhotosLoading(false);
    };

    void (async () => {
      if (!seeded.gallery.length) setPhotosLoading(true);
      let photos;
      try {
        photos = await fetchFeatureSheetListingPhotos(tourId);
      } catch {
        photos = { cover: "", primary: [], secondary: [], gallery: [] };
      }
      if (cancelled) return;
      applyGallery(photos.gallery.length ? photos.gallery : seeded.gallery);
      setForm((prev) => fillFormImagesFromPhotos(prev, photos));
      if (photos.gallery.length > 2) setLbCount((c) => Math.max(c, 3));
      if (photos.gallery.length > 6) setRgCount((c) => Math.max(c, 9));

      if (!seeded.snap) {
        try {
          const seededSnap = await persistFeatureSheetBuilderSnapshot({ tourId, photos });
          if (cancelled || !seededSnap) return;
          setSnapshot(seededSnap);
          setForm((prev) => ({ ...snapshotToFormState(seededSnap), images: prev.images }));
        } catch (err) {
          console.warn("Could not seed feature sheet snapshot", err);
        }
      }
      if (!cancelled) setPhotosLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tourId, seeded.gallery, seeded.snap]);

  useEffect(() => {
    listingPhotos.slice(0, 12).forEach((url) => {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
    });
  }, [listingPhotos]);

  useEffect(() => {
    if (!tourId) return;
    const timer = window.setTimeout(() => {
      setSnapshot((prev) => {
        const next = formToSnapshot(form, tourId, prev);
        persistFeatureListingFinalSnapshot(next);
        return next;
      });
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [form, tourId]);

  const panels = useMemo(() => renderFeatureSheetPanels(form), [form]);

  const patch = useCallback((partial: Partial<FeatureSheetFormState>) => {
    setForm((prev) => {
      const next = { ...prev, ...partial };
      if (partial.bodyFont) next.displayFont = partial.bodyFont;
      return next;
    });
  }, []);

  const onImagePick = useCallback(
    async (e: ChangeEvent<HTMLInputElement>, key: keyof FeatureSheetFormState["images"] | `lb-${number}` | `rg-${number}`) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const dataUrl = await readFileAsDataUrl(file);
      setForm((prev) => {
        const images = { ...prev.images };
        if (key.startsWith("lb-")) {
          const n = Number(key.split("-")[1]);
          images.lb = { ...images.lb, [n]: dataUrl };
        } else if (key.startsWith("rg-")) {
          const n = Number(key.split("-")[1]);
          images.rg = { ...images.rg, [n]: dataUrl };
        } else {
          images[key as keyof typeof images] = dataUrl as never;
        }
        return { ...prev, images };
      });
      setGalleryPhotos((prev) => (prev.includes(dataUrl) ? prev : [...prev, dataUrl]));
    },
    [],
  );

  const bulkLoadLb = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 3);
    e.target.value = "";
    if (!files.length) return;
    const urls = await Promise.all(files.map(readFileAsDataUrl));
    setForm((prev) => {
      const lb = { ...prev.images.lb };
      urls.forEach((url, i) => {
        lb[i + 1] = url;
      });
      return { ...prev, images: { ...prev.images, lb } };
    });
    setLbCount(Math.max(lbCount, urls.length));
  };

  const bulkLoadRg = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 9);
    e.target.value = "";
    if (!files.length) return;
    const urls = await Promise.all(files.map(readFileAsDataUrl));
    setForm((prev) => {
      const rg = { ...prev.images.rg };
      urls.forEach((url, i) => {
        rg[i + 1] = url;
      });
      return { ...prev, images: { ...prev.images, rg } };
    });
    setRgCount(Math.max(rgCount, urls.length));
  };

  const onBrandImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const json = JSON.parse(await file.text()) as unknown;
      const partial = parseBrandKitImport(json);
      if (!partial) {
        window.alert("Invalid brand kit file.");
        return;
      }
      const { images: brandImages, ...rest } = partial;
      patch({
        ...rest,
        images: {
          ...form.images,
          agent: brandImages?.agent ?? form.images.agent,
          logo: brandImages?.logo ?? form.images.logo,
        },
      });
    } catch {
      window.alert("Could not read brand kit file.");
    }
  };

  const onProjectImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const json = JSON.parse(await file.text()) as unknown;
      const parsed = parseProjectImport(json);
      if (!parsed) {
        window.alert("Invalid project file.");
        return;
      }
      setForm(parsed.form);
      setLbCount(parsed.lbCount);
      setRgCount(parsed.rgCount);
    } catch {
      window.alert("Could not read project file.");
    }
  };

  const addLb = () => {
    if (lbCount >= 3) return;
    setLbCount((c) => c + 1);
  };
  const addRg = () => {
    if (rgCount >= 9) return;
    setRgCount((c) => c + 1);
  };

  const goSheet = (n: 1 | 2) => setCurPg(n);

  const panelClose = () => {
    setLocation("/feature-sheet");
  };

  const hint =
    curPg === 1
      ? "Exterior: MLS data (left) + Marketing (right) · Fold at center"
      : "Interior: Photo spread — left panel + right panel · Fold at center";

  const applyListingPhoto = (url: string, slot: PhotoSlotId = activeSlot) => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setForm((prev) => {
      const images = { ...prev.images, lb: { ...prev.images.lb }, rg: { ...prev.images.rg } };
      if (slot === "hero") images.hero = trimmed;
      else if (slot === "il1") images.il1 = trimmed;
      else if (slot === "rh") images.rh = trimmed;
      else if (slot.startsWith("lb-")) images.lb[Number(slot.split("-")[1])] = trimmed;
      else if (slot.startsWith("rg-")) images.rg[Number(slot.split("-")[1])] = trimmed;
      return { ...prev, images };
    });
    if (slot.startsWith("lb-")) {
      setLbCount((c) => Math.max(c, Number(slot.split("-")[1]), 1));
    }
    if (slot.startsWith("rg-")) {
      setRgCount((c) => Math.max(c, Number(slot.split("-")[1]), 1));
    }
  };

  const onAddListingPhotos = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    const urls = await Promise.all(files.map(readFileAsDataUrl));
    setListingPhotos((prev) => uniquePhotoUrls([...prev, ...urls]));
    setGalleryPhotos((prev) => uniquePhotoUrls([...prev, ...urls]));
    if (urls[0]) applyListingPhoto(urls[0]);
  };

  const persistCurrentSnapshot = () => {
    if (!tourId) return null;
    const next = formToSnapshot(form, tourId, snapshot);
    persistFeatureListingFinalSnapshot(next);
    setSnapshot(next);
    return next;
  };

  const openOrderPopup = () => {
    if (!tourId) {
      window.alert("Missing listing id.");
      return;
    }
    persistCurrentSnapshot();
    setOrderOpen(true);
  };

  const formatStrataField = () => {
    patch({ strata: fmtStrataValue(form.strata, form.strataLabel) });
  };

  const tabLabels: Record<TabId, string> = {
    chat: "Chat",
    property: "Property",
    photos: "Photos",
    rooms: "Rooms",
    agent: "Agent",
    design: "Design",
    preview: "Preview",
  };

  const previewPanel = (
    <>
      <div className="fsb-pnav">
        <button type="button" className={`fsb-pn ${curPg === 1 ? "active" : ""}`} onClick={() => goSheet(1)}>Sheet 1 — Exterior</button>
        <button type="button" className={`fsb-pn ${curPg === 2 ? "active" : ""}`} onClick={() => goSheet(2)}>Sheet 2 — Interior</button>
      </div>
      <div className="fsb-hint">{hint}</div>
      <div className="fsb-sw">
        <div className="fsb-sheet">
          <div className="fsb-bb" />
          {curPg === 1 ? (
            <>
              <div className="fsb-pg fsb-fold" style={{ display: "flex", flexDirection: "column" }} dangerouslySetInnerHTML={{ __html: panels.p1 }} />
              <div className="fsb-pg" style={{ display: "flex", flexDirection: "column" }} dangerouslySetInnerHTML={{ __html: panels.p2 }} />
            </>
          ) : (
            <>
              <div className="fsb-pg fsb-fold" style={{ display: "flex", flexDirection: "column" }} dangerouslySetInnerHTML={{ __html: panels.p3 }} />
              <div className="fsb-pg" style={{ display: "flex", flexDirection: "column" }} dangerouslySetInnerHTML={{ __html: panels.p4 }} />
            </>
          )}
        </div>
      </div>
      <div className="fsb-hint" style={{ marginTop: 5 }}>
        Blue outline = {PRINT_LAYOUT.docWidthIn}&quot;×{PRINT_LAYOUT.docHeightIn}&quot; bleed · Dashed = fold · Sheet 1112×748px
      </div>
    </>
  );

  return (
    <div className="fsb-root">
      <FeatureSheetTopbar />
      <div className={`fsb-app ${tab === "preview" ? "fsb-app--preview-focus" : ""}`}>
        <div className="fsb-ep">
          <div className="fsb-eh">
            <h2>Feature Sheet Editor — 4 Panel</h2>
            <p>Sheet 1: Exterior · Sheet 2: Interior (photo spread)</p>
            {tourId ? (
              <button type="button" className="fsb-back-link" onClick={panelClose}>
                ← Back to feature sheets
              </button>
            ) : null}
          </div>
          <div className="fsb-tabs">
            {(["chat", "property", "photos", "rooms", "agent", "design", "preview"] as TabId[]).map((t) => (
              <button key={t} type="button" className={`fsb-tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
                {tabLabels[t]}
              </button>
            ))}
          </div>

          <div className={`fsb-tc fsb-tc-chat ${tab === "chat" ? "show" : ""}`}>
            <BuilderChatPanel
              form={form}
              setForm={setForm}
              galleryPhotos={galleryPhotos}
              onGoPhotosTab={() => setTab("photos")}
            />
          </div>

          <div className={`fsb-tc ${tab === "property" ? "show" : ""}`}>
            <div className="fsb-st">Sheet 1 Layout</div>
            <label className="fsb-fg" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={form.useFloorplan} onChange={(e) => patch({ useFloorplan: e.target.checked })} />
              <span className="fsb-fl" style={{ margin: 0 }}>Show floorplan instead of MLS data</span>
            </label>
            <label className="fsb-pslot" style={{ width: "100%", height: 60, marginBottom: 12 }}>
              Upload Floorplan
              <input type="file" accept="image/*,application/pdf" hidden onChange={(e) => void onImagePick(e, "fp")} />
            </label>
            <div className="fsb-st">Listing Info</div>
            <div className="fsb-fr2">
              <div className="fsb-fg">
                <label className="fsb-fl">MLS #</label>
                <input className="fsb-fi" value={form.mls} onChange={(e) => patch({ mls: e.target.value })} />
              </div>
              <div className="fsb-fg">
                <label className="fsb-fl">List Price</label>
                <input
                  className="fsb-fi"
                  value={form.price}
                  onChange={(e) => patch({ price: e.target.value })}
                  onBlur={() => patch({ price: fmtCurrencyValue(form.price) })}
                />
              </div>
            </div>
            <div className="fsb-fg">
              <label className="fsb-fl">Address</label>
              <input className="fsb-fi" value={form.addr} onChange={(e) => patch({ addr: e.target.value })} />
            </div>
            <div className="fsb-fg">
              <label className="fsb-fl">City / Area</label>
              <input className="fsb-fi" value={form.city} onChange={(e) => patch({ city: e.target.value })} />
            </div>
            <div className="fsb-st">Key Stats</div>
            <div className="fsb-fr2">
              <div className="fsb-fg"><label className="fsb-fl">Bedrooms</label><input className="fsb-fi" value={form.beds} onChange={(e) => patch({ beds: e.target.value })} /></div>
              <div className="fsb-fg"><label className="fsb-fl">Bathrooms</label><input className="fsb-fi" value={form.baths} onChange={(e) => patch({ baths: e.target.value })} /></div>
            </div>
            <div className="fsb-fr2">
              <div className="fsb-fg">
                <label className="fsb-fl">Size (sq ft)</label>
                <input
                  className="fsb-fi"
                  value={form.sqft}
                  onChange={(e) => patch({ sqft: e.target.value })}
                  onBlur={() => patch({ sqft: fmtTextWithNumbers(form.sqft) })}
                />
              </div>
              <div className="fsb-fg"><label className="fsb-fl">Year Built</label><input className="fsb-fi" value={form.year} onChange={(e) => patch({ year: e.target.value })} /></div>
            </div>
            <div className="fsb-fr2">
              <div className="fsb-fg">
                <label className="fsb-fl">Taxes</label>
                <input
                  className="fsb-fi"
                  value={form.tax}
                  onChange={(e) => patch({ tax: e.target.value })}
                  onBlur={() => patch({ tax: fmtCurrencyValue(form.tax) })}
                />
              </div>
              <div className="fsb-fg">
                <select
                  className="fsb-fl fsb-fl-select"
                  value={form.strataLabel}
                  onChange={(e) => {
                    const strataLabel = e.target.value as FeatureSheetFormState["strataLabel"];
                    patch({ strataLabel, strata: fmtStrataValue(form.strata, strataLabel) });
                  }}
                >
                  <option value="Maint.">Maint.</option>
                  <option value="Lot Size">Lot Size</option>
                </select>
                <input
                  className="fsb-fi"
                  value={form.strata}
                  onChange={(e) => patch({ strata: e.target.value })}
                  onBlur={formatStrataField}
                />
              </div>
            </div>
            <div className="fsb-fr2">
              <div className="fsb-fg"><label className="fsb-fl">Parking</label><input className="fsb-fi" value={form.park} onChange={(e) => patch({ park: e.target.value })} /></div>
              <div className="fsb-fg"><label className="fsb-fl">Zoning</label><input className="fsb-fi" value={form.zone} onChange={(e) => patch({ zone: e.target.value })} /></div>
            </div>
            <div className="fsb-fg"><label className="fsb-fl">Style / Complex</label><input className="fsb-fi" value={form.style} onChange={(e) => patch({ style: e.target.value })} /></div>
            <div className="fsb-st">Description</div>
            <div className="fsb-fg"><textarea className="fsb-fi" rows={5} value={form.desc} onChange={(e) => patch({ desc: e.target.value })} /></div>
            <div className="fsb-fg">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                <label className="fsb-fl" style={{ marginBottom: 0 }}>Virtual Tour URL</label>
                <CheckboxLabel checked={form.showQr} onChange={(v) => patch({ showQr: v })}>Show QR</CheckboxLabel>
              </div>
              <input className="fsb-fi" value={form.tour} onChange={(e) => patch({ tour: e.target.value })} />
            </div>
          </div>

          <div className={`fsb-tc ${tab === "photos" ? "show" : ""}`}>
            <div className="fsb-st" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Listing gallery — tap a photo to swap into the selected slot</span>
              <span className="fsb-gallery-count">{listingPhotos.length} TOTAL</span>
            </div>
            <p className="fsb-gallery-hint">Selected slot is outlined. Click a listing photo to swap it in, or add your own.</p>
            {photosLoading && listingPhotos.length === 0 ? (
              <div className="fsb-gallery-loading">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              </div>
            ) : listingPhotos.length === 0 ? (
              <div className="fsb-gallery-empty">No listing photos yet. Add photos below.</div>
            ) : (
              <div className="fsb-listing-gallery">
                {listingPhotos.map((url, idx) => (
                  <button
                    key={`${url}-${idx}`}
                    type="button"
                    className="fsb-gallery-thumb"
                    onClick={() => applyListingPhoto(url)}
                    title={`Swap photo #${idx + 1} into ${activeSlot}`}
                  >
                    <img
                      src={url}
                      alt={`Listing ${idx + 1}`}
                      loading={idx < 8 ? "eager" : "lazy"}
                      decoding="async"
                      onError={() => {
                        setListingPhotos((prev) => prev.filter((u) => u !== url));
                        setGalleryPhotos((prev) => prev.filter((u) => u !== url));
                      }}
                    />
                    <span>#{idx + 1}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="fsb-btn-row" style={{ marginBottom: 12 }}>
              <button type="button" className="fsb-addbtn" onClick={() => listingPhotoInputRef.current?.click()}>
                Add listing photos
              </button>
              <input
                ref={listingPhotoInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => void onAddListingPhotos(e)}
              />
            </div>
            <div style={{ opacity: curPg === 1 ? 1 : 0.35, pointerEvents: curPg === 1 ? "auto" : "none" }}>
              <SheetPhotoHeader title="Sheet 1 - Exterior" onPreview={() => goSheet(1)} />
              <div className="fsb-st">Exterior - Hero {activeSlot === "hero" ? "(selected)" : ""}</div>
              <label
                className={`fsb-pslot${activeSlot === "hero" ? " fsb-pslot-active" : ""}`}
                style={{ width: "100%", height: 60, marginBottom: 6 }}
                onClick={() => setActiveSlot("hero")}
              >
                {form.images.hero ? <img src={form.images.hero} alt="" /> : "Exterior hero photo"}
                <input type="file" accept="image/*" hidden onChange={(e) => void onImagePick(e, "hero")} />
              </label>
              <div className="fsb-fr2" style={{ marginBottom: 12 }}>
                <RangeField label="Image Scale (Zoom)" min={1} max={2.5} step={0.05} value={form.heroScale} onChange={(v) => patch({ heroScale: v })} />
                <RangeField label="Vertical Crop" min={40} max={100} step={1} value={form.heroCrop} onChange={(v) => patch({ heroCrop: v })} />
              </div>
            </div>
            <div style={{ opacity: curPg === 2 ? 1 : 0.35, pointerEvents: curPg === 2 ? "auto" : "none", marginTop: 12 }}>
              <SheetPhotoHeader title="Sheet 2 - Interior" onPreview={() => goSheet(2)} />
              <div className="fsb-st">Interior Left — Large Photo {activeSlot === "il1" ? "(selected)" : ""}</div>
              <label
                className={`fsb-pslot${activeSlot === "il1" ? " fsb-pslot-active" : ""}`}
                style={{ width: "100%", height: 80, marginBottom: 6 }}
                onClick={() => setActiveSlot("il1")}
              >
                {form.images.il1 ? <img src={form.images.il1} alt="" /> : "Left large photo"}
                <input type="file" accept="image/*" hidden onChange={(e) => void onImagePick(e, "il1")} />
              </label>
              <div className="fsb-st">Bottom Row (3)</div>
              <div className="fsb-pgrid">
                {Array.from({ length: lbCount }, (_, i) => i + 1).map((n) => (
                  <label
                    key={n}
                    className={`fsb-pslot${activeSlot === `lb-${n}` ? " fsb-pslot-active" : ""}`}
                    style={{ aspectRatio: "4/3" }}
                    onClick={() => setActiveSlot(`lb-${n}`)}
                  >
                    {form.images.lb[n] ? <img src={form.images.lb[n]} alt="" /> : `Bottom ${n}`}
                    <input type="file" accept="image/*" hidden onChange={(e) => void onImagePick(e, `lb-${n}`)} />
                  </label>
                ))}
              </div>
              <div className="fsb-btn-row">
                <button type="button" className="fsb-addbtn" onClick={addLb} disabled={lbCount >= 3}>Add one</button>
                <label className="fsb-addbtn fsb-addbtn-outline">
                  Upload all 3
                  <input type="file" accept="image/*" multiple hidden onChange={(e) => void bulkLoadLb(e)} />
                </label>
              </div>
              <div className="fsb-st">Interior Right — Hero {activeSlot === "rh" ? "(selected)" : ""}</div>
              <label
                className={`fsb-pslot${activeSlot === "rh" ? " fsb-pslot-active" : ""}`}
                style={{ width: "100%", height: 90, marginBottom: 6 }}
                onClick={() => setActiveSlot("rh")}
              >
                {form.images.rh ? <img src={form.images.rh} alt="" /> : "Right hero photo"}
                <input type="file" accept="image/*" hidden onChange={(e) => void onImagePick(e, "rh")} />
              </label>
              <div className="fsb-st">Grid (9)</div>
              <div className="fsb-pgrid">
                {Array.from({ length: rgCount }, (_, i) => i + 1).map((n) => (
                  <label
                    key={n}
                    className={`fsb-pslot${activeSlot === `rg-${n}` ? " fsb-pslot-active" : ""}`}
                    style={{ aspectRatio: "4/3" }}
                    onClick={() => setActiveSlot(`rg-${n}`)}
                  >
                    {form.images.rg[n] ? <img src={form.images.rg[n]} alt="" /> : `Grid ${n}`}
                    <input type="file" accept="image/*" hidden onChange={(e) => void onImagePick(e, `rg-${n}`)} />
                  </label>
                ))}
              </div>
              <div className="fsb-btn-row">
                <button type="button" className="fsb-addbtn" onClick={addRg} disabled={rgCount >= 9}>Add one</button>
                <label className="fsb-addbtn fsb-addbtn-outline">
                  Upload up to 9
                  <input type="file" accept="image/*" multiple hidden onChange={(e) => void bulkLoadRg(e)} />
                </label>
              </div>
            </div>
          </div>

          <div className={`fsb-tc ${tab === "rooms" ? "show" : ""}`}>
            <div className="fsb-st">Room Dimensions</div>
            {form.rooms.map((rm, i) => (
              <div key={i} className="fsb-rrow">
                <input className="fsb-fi" value={rm.f} onChange={(e) => { const rooms = [...form.rooms]; rooms[i] = { ...rm, f: e.target.value }; patch({ rooms }); }} />
                <input className="fsb-fi" value={rm.r} onChange={(e) => { const rooms = [...form.rooms]; rooms[i] = { ...rm, r: e.target.value }; patch({ rooms }); }} />
                <input className="fsb-fi" value={rm.d} onChange={(e) => { const rooms = [...form.rooms]; rooms[i] = { ...rm, d: e.target.value }; patch({ rooms }); }} />
                <button type="button" className="fsb-delbtn" onClick={() => patch({ rooms: form.rooms.filter((_, j) => j !== i) })}>×</button>
              </div>
            ))}
            <button type="button" className="fsb-addbtn" onClick={() => patch({ rooms: [...form.rooms, { f: "Main", r: "", d: "" }] })}>Add room</button>
            <div className="fsb-st">Property Highlights</div>
            {form.highlights.map((hl, i) => (
              <div key={i} className="fsb-fg" style={{ display: "flex", gap: 4 }}>
                <input
                  className="fsb-fi"
                  value={hl}
                  onChange={(e) => {
                    const highlights = [...form.highlights];
                    highlights[i] = e.target.value;
                    patch({ highlights });
                  }}
                />
                <button type="button" className="fsb-delbtn" onClick={() => patch({ highlights: form.highlights.filter((_, j) => j !== i) })}>×</button>
              </div>
            ))}
            <button type="button" className="fsb-addbtn" onClick={() => patch({ highlights: [...form.highlights, ""] })}>Add highlight</button>
          </div>

          <div className={`fsb-tc ${tab === "agent" ? "show" : ""}`}>
            <BrandKitBar onSave={() => exportBrandKit(form)} onLoadClick={() => brandInputRef.current?.click()} />
            <input ref={brandInputRef} type="file" accept=".json" hidden onChange={(e) => void onBrandImport(e)} />
            <div className="fsb-st">Agent</div>
            <div className="fsb-fg">
              <label className="fsb-fl">Name</label>
              <input className="fsb-fi" value={form.agentName} onChange={(e) => patch({ agentName: e.target.value })} />
            </div>
            <div className="fsb-fg">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                <label className="fsb-fl" style={{ marginBottom: 0 }}>Title</label>
                <CheckboxLabel checked={form.showAgentTitle} onChange={(v) => patch({ showAgentTitle: v })}>Show</CheckboxLabel>
              </div>
              <input className="fsb-fi" value={form.agentTitle} onChange={(e) => patch({ agentTitle: e.target.value })} />
            </div>
            <div className="fsb-fg">
              <label className="fsb-fl">Mobile Phone</label>
              <input
                className="fsb-fi"
                value={form.agentPhone}
                onChange={(e) => patch({ agentPhone: e.target.value })}
                onBlur={() => patch({ agentPhone: fmtPhoneValue(form.agentPhone) })}
              />
            </div>
            <div className="fsb-fg">
              <label className="fsb-fl">Office Phone</label>
              <input
                className="fsb-fi"
                value={form.agentPhone2}
                onChange={(e) => patch({ agentPhone2: e.target.value })}
                onBlur={() => patch({ agentPhone2: fmtPhoneValue(form.agentPhone2) })}
              />
            </div>
            {[
              ["Email", "agentEmail"],
              ["Website", "agentWeb"],
              ["Brokerage", "agentBroker"],
              ["Broker Logo Label", "agentLogoLabel"],
            ].map(([label, key]) => (
              <div key={key} className="fsb-fg">
                <label className="fsb-fl">{label}</label>
                <input className="fsb-fi" value={(form as Record<string, string>)[key]} onChange={(e) => patch({ [key]: e.target.value } as Partial<FeatureSheetFormState>)} />
              </div>
            ))}
            <div className="fsb-st" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Agent Photo</span>
              <CheckboxLabel checked={form.showAgentPhoto} onChange={(v) => patch({ showAgentPhoto: v })}>Show</CheckboxLabel>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 6 }}>
              <label className="fsb-pslot" style={{ width: 70, height: 70, flexShrink: 0 }}>
                {form.images.agent ? <img src={form.images.agent} alt="" style={{ objectFit: "cover" }} /> : "Agent"}
                <input type="file" accept="image/*" hidden onChange={(e) => void onImagePick(e, "agent")} />
              </label>
              <div style={{ flex: 1 }}>
                <div className="fsb-fg" style={{ marginBottom: 6 }}>
                  <label className="fsb-fl">Shape</label>
                  <select className="fsb-fi" value={form.agentPhotoShape} onChange={(e) => patch({ agentPhotoShape: e.target.value as FeatureSheetFormState["agentPhotoShape"] })}>
                    <option value="50%">Round</option>
                    <option value="8px">Square</option>
                    <option value="cutout">Transparent Cutout (Overlap)</option>
                    <option value="cutout-bleed">Transparent Cutout (Large / Bleed Edge)</option>
                  </select>
                </div>
                <RangeField label="Scale (Zoom)" min={0.5} max={2.5} step={0.05} value={form.agentScale} onChange={(v) => patch({ agentScale: v })} />
              </div>
            </div>
            <div className="fsb-st">Company Logo</div>
            <label className="fsb-pslot" style={{ width: "100%", height: 40 }}>
              {form.images.logo ? <img src={form.images.logo} alt="" style={{ objectFit: "contain" }} /> : "Company logo"}
              <input type="file" accept="image/*" hidden onChange={(e) => void onImagePick(e, "logo")} />
            </label>
          </div>

          <div className={`fsb-tc ${tab === "design" ? "show" : ""}`}>
            <BrandKitBar onSave={() => exportBrandKit(form)} onLoadClick={() => brandInputRef.current?.click()} />
            <div className="fsb-st">Page Colors</div>
            <ColorField label="Background Color" value={form.bgColor} onChange={(v) => patch({ bgColor: v })} />
            <ColorField label="Body Text Color" value={form.textColor} onChange={(v) => patch({ textColor: v })} />
            <ColorField label="Heading Text Color" value={form.headingColor} onChange={(v) => patch({ headingColor: v })} />
            <div className="fsb-st">Brand Colors & Layout</div>
            <ColorField label="Primary" value={form.primaryColor} onChange={(v) => patch({ primaryColor: v })} />
            <ColorField label="Accent / Icon Color" value={form.accentColor} onChange={(v) => patch({ accentColor: v })} />
            <ColorField label="QR Code Color" value={form.qrColor} onChange={(v) => patch({ qrColor: v })} />
            <div className="fsb-fg">
              <label className="fsb-fl">Agent Bar Layout</label>
              <select className="fsb-fi" value={form.agentBarStyle} onChange={(e) => patch({ agentBarStyle: e.target.value as FeatureSheetFormState["agentBarStyle"] })}>
                <option value="standard">Standard (Left Aligned)</option>
                <option value="center-logo">Centered Logo & Icons (Modern)</option>
              </select>
            </div>
            <RangeField label="Logo Scale (Zoom)" min={0.5} max={2.5} step={0.05} value={form.logoScale} onChange={(v) => patch({ logoScale: v })} />
            <div className="fsb-st">Typography</div>
            <div className="fsb-fg">
              <label className="fsb-fl">Heading Font</label>
              <select className="fsb-fi" value={form.headingFont} onChange={(e) => patch({ headingFont: e.target.value })}>
                {HEADING_FONT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="fsb-fg">
              <label className="fsb-fl">Body Font</label>
              <select className="fsb-fi" value={form.bodyFont} onChange={(e) => patch({ bodyFont: e.target.value, displayFont: e.target.value })}>
                {BODY_FONT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={`fsb-tc fsb-tc-preview ${tab === "preview" ? "show" : ""}`}>
            <div className="fsb-st">Live preview</div>
            <p className="fsb-preview-note">Switch between Sheet 1 and Sheet 2 below. Use other tabs to edit content.</p>
          </div>

          <div className="fsb-acts">
            <button type="button" className="fsb-btn fsb-btnp" onClick={openOrderPopup}>
              <Download className="inline h-3 w-3" aria-hidden /> Download
            </button>
            <button type="button" className="fsb-btn" onClick={() => goSheet(curPg === 1 ? 2 : 1)}>
              Sheet {curPg === 1 ? "2 →" : "1 ←"}
            </button>
            <div className="fsb-acts-divider" />
            <button type="button" className="fsb-btn" style={{ flex: 1 }} onClick={() => exportProject(form, lbCount, rgCount)}>
              Save Project
            </button>
            <button type="button" className="fsb-btn" style={{ flex: 1 }} onClick={() => projectInputRef.current?.click()}>
              Load Project
            </button>
            <input ref={projectInputRef} type="file" accept=".json" hidden onChange={(e) => void onProjectImport(e)} />
          </div>
        </div>

        <div className="fsb-pp">{previewPanel}</div>
      </div>
      <FeatureSheetOrderPopup
        open={orderOpen}
        tourId={tourId}
        form={form}
        panels={panels}
        snapshot={snapshot}
        onClose={() => setOrderOpen(false)}
      />
    </div>
  );
}
