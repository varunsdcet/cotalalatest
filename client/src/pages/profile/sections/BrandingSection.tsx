import { useEffect, useRef, useState } from "react";
import { ChevronDown, Folder, ImageOff, Loader2, Paperclip, Plus, Upload, X } from "lucide-react";
import {
  getBrandingSettings,
  updateBrandingSettings,
  uploadBrandingAsset,
  type BrandingAssetType,
} from "@/lib/api";
import FontPicker, { type FontOption } from "./FontPicker";
import { NoticeLine, SectionError, SectionLoading } from "./shared";
import { apiMessage, asArray, asRecord, asString, errorText, type Notice } from "./helpers";

type BrandFile = {
  type: BrandingAssetType;
  title: string;
  url: string;
  exists: boolean;
  preview?: string;
  uploading?: boolean;
};

type FontRole = "heading" | "subheading" | "body";
type FontSetting = FontOption & { bold: boolean; italic: boolean };

const DEFAULT_HEADSHOTS: BrandFile[] = [
  { type: "headshot", title: "Primary Headshot", url: "", exists: false },
  { type: "headshot_png", title: "Transparent Headshot", url: "", exists: false },
];

const DEFAULT_LOGOS: BrandFile[] = [
  { type: "logo_svg", title: "Main (Dark)", url: "", exists: false },
  { type: "logo_svg_white", title: "Main (Light)", url: "", exists: false },
  { type: "logo_png", title: "Submark (Light)", url: "", exists: false },
  { type: "logo_svg_black", title: "Submark (Dark)", url: "", exists: false },
];

const ACCEPT: Partial<Record<BrandingAssetType, string>> = {
  headshot: "image/jpeg,.jpg,.jpeg",
  headshot_png: "image/png,.png",
  logo_png: "image/png,.png",
  logo_svg: "image/svg+xml,.svg",
  logo_svg_white: "image/svg+xml,.svg",
  logo_svg_black: "image/svg+xml,.svg",
};

const PALETTE_LABELS = ["Primary background", "Primary text", "Secondary background", "Secondary text"];
const DEFAULT_PALETTE = ["#000000", "#FFFFFF", "#AC8ABF", "#787878"];

const SCHEMES = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "brand", label: "Brand Colours" },
];

const FONT_ROLES: Array<{ role: FontRole; label: string }> = [
  { role: "heading", label: "Heading" },
  { role: "subheading", label: "Subheading" },
  { role: "body", label: "Body" },
];

function normalizeHex(value: string, fallback: string) {
  const v = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toUpperCase();
  return fallback;
}

function readFiles(raw: unknown, defaults: BrandFile[]): BrandFile[] {
  const items = asArray(raw).map(asRecord);
  if (!items.length) return defaults;
  return items
    .filter((item) => typeof item.type === "string")
    .map((item) => {
      const type = item.type as BrandingAssetType;
      const fallback = defaults.find((d) => d.type === type);
      return {
        type,
        title: asString(item.title) || fallback?.title || type,
        url: asString(item.url),
        exists: Boolean(item.exists ?? item.active),
      };
    });
}

/** Upload responses omit titles, so merge them over the current cards by asset type. */
function mergeFiles(current: BrandFile[], raw: unknown, uploaded: BrandingAssetType, stamp: number): BrandFile[] {
  const incoming = new Map(asArray(raw).map(asRecord).map((item) => [asString(item.type), item]));
  return current.map((file) => {
    const next = incoming.get(file.type);
    const url = asString(next?.url) || file.url;
    const exists = file.type === uploaded ? true : Boolean(next?.exists ?? next?.active ?? file.exists);
    return {
      ...file,
      url: file.type === uploaded && url ? `${url.split("?")[0]}?v=${stamp}` : url,
      exists,
      uploading: file.type === uploaded ? false : file.uploading,
      preview: file.type === uploaded ? undefined : file.preview,
    };
  });
}

function readFont(raw: unknown): FontSetting | null {
  const f = asRecord(raw);
  const family = asString(f.family);
  if (!family) return null;
  return {
    id: (f.id as number | string) ?? family,
    family,
    category: asString(f.category),
    bold: Boolean(f.bold),
    italic: Boolean(f.italic),
  };
}

function useGoogleFont(family: string | undefined) {
  useEffect(() => {
    if (!family) return;
    const id = `ma-font-${family.replace(/\s+/g, "-").toLowerCase()}`;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}&display=swap`;
    document.head.appendChild(link);
  }, [family]);
}

function AssetCard({ file, onPick }: { file: BrandFile; onPick: () => void }) {
  // `exists` from settings/branding/details can lag the file server, so always try the URL.
  const src = file.preview || file.url;
  const [broken, setBroken] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setBroken(false);
    setLoaded(false);
  }, [src]);
  const onFile = file.exists || (loaded && !broken);
  const isLogo = file.type.startsWith("logo");
  const ext = file.type.includes("svg") ? "SVG" : file.type.includes("png") ? "PNG" : "JPG";
  return (
    <div className={`headshot-card ma-asset-card p-2 ${isLogo ? "ma-asset-card--logo" : ""} ${file.type === "logo_svg_white" ? "ma-asset-card--on-dark" : ""}`}>
      <button type="button" className="ma-asset-media" onClick={onPick} disabled={file.uploading} aria-label={`Upload ${file.title}`}>
        {src && !broken ? (
          <img src={src} alt={file.title} onLoad={() => setLoaded(true)} onError={() => setBroken(true)} />
        ) : (
          <span className="ma-asset-empty">
            <ImageOff className="w-6 h-6" />
            <span>No file yet</span>
          </span>
        )}
        <span className="ma-asset-overlay">
          {file.uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
          <span>{file.uploading ? "Uploading…" : onFile ? "Replace" : "Upload"}</span>
        </span>
      </button>
      <div className="mt-2">
        <h6 className="mb-1 text-white">{file.title}</h6>
        <small className="text-grey">
          {ext} <span className="ma-dot" /> {onFile ? "On file" : "Missing"}
        </small>
      </div>
    </div>
  );
}

function AddNewButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className="add-btn" onClick={onOpen}>
      <Plus className="inline w-3 h-3" />
      &nbsp; ADD NEW
    </button>
  );
}

export default function BrandingSection() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [assetNotice, setAssetNotice] = useState<Notice>(null);
  const [fonts, setFonts] = useState<FontOption[]>([]);
  const [scheme, setScheme] = useState("brand");
  const [palette, setPalette] = useState<string[]>(DEFAULT_PALETTE);
  const [fontSel, setFontSel] = useState<Record<FontRole, FontSetting | null>>({ heading: null, subheading: null, body: null });
  const [headshots, setHeadshots] = useState<BrandFile[]>(DEFAULT_HEADSHOTS);
  const [logos, setLogos] = useState<BrandFile[]>(DEFAULT_LOGOS);
  const [previewText, setPreviewText] = useState<Record<FontRole, string>>({ heading: "", subheading: "", body: "" });
  const fileInput = useRef<HTMLInputElement>(null);
  const modalFileInput = useRef<HTMLInputElement>(null);
  const pendingType = useRef<BrandingAssetType | null>(null);
  const [uploadChoices, setUploadChoices] = useState<BrandFile[] | null>(null);
  const [modalFile, setModalFile] = useState<File | null>(null);
  const [modalType, setModalType] = useState<BrandingAssetType | "">("");
  const [modalError, setModalError] = useState("");
  const [modalUploading, setModalUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  useGoogleFont(fontSel.heading?.family);
  useGoogleFont(fontSel.subheading?.family);
  useGoogleFont(fontSel.body?.family);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await getBrandingSettings();
      if (!res.status) {
        setLoadError(apiMessage(res, "Unable to load branding settings."));
        return;
      }
      const data = asRecord(res.data);
      const master = asRecord(data.master_data);
      setFonts(
        asArray(master.fonts)
          .map(asRecord)
          .filter((f) => asString(f.family))
          .map((f) => ({ id: (f.id as number | string) ?? asString(f.family), family: asString(f.family), category: asString(f.category) })),
      );
      const selected = asRecord(data.selected);
      setScheme(asString(selected.colour_scheme) || "brand");
      const pal = asArray<string>(selected.colour_palette);
      setPalette(DEFAULT_PALETTE.map((fallback, i) => asString(pal[i]).trim() || fallback));
      const sf = asRecord(selected.fonts);
      setFontSel({ heading: readFont(sf.heading), subheading: readFont(sf.subheading), body: readFont(sf.body) });
      const files = asRecord(data.brand_files);
      setHeadshots(readFiles(files.headshots, DEFAULT_HEADSHOTS));
      setLogos(readFiles(files.logos, DEFAULT_LOGOS));
    } catch (err) {
      setLoadError(errorText(err, "Unable to load branding settings."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!uploadChoices) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !modalUploading) closeUploadModal();
    };
    document.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = "";
    };
  }, [uploadChoices, modalUploading]);

  const openUploadModal = (files: BrandFile[]) => {
    setUploadChoices(files);
    setModalFile(null);
    setModalType("");
    setModalError("");
    setDragActive(false);
  };

  const closeUploadModal = () => {
    if (modalUploading) return;
    setUploadChoices(null);
    setModalFile(null);
    setModalType("");
    setModalError("");
    setDragActive(false);
  };

  const chooseModalFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setModalFile(null);
      setModalError("File must be 4 MB or smaller.");
      return;
    }
    if (!file.type.startsWith("image/") && !/\.(jpe?g|png|svg)$/i.test(file.name)) {
      setModalFile(null);
      setModalError("Choose a JPG, PNG, or SVG image.");
      return;
    }
    setModalFile(file);
    setModalError("");
  };

  const pickFile = (type: BrandingAssetType) => {
    pendingType.current = type;
    if (fileInput.current) {
      fileInput.current.accept = ACCEPT[type] || "image/*";
      fileInput.current.value = "";
      fileInput.current.click();
    }
  };

  const updateCard = (type: BrandingAssetType, patch: Partial<BrandFile>) => {
    const apply = (list: BrandFile[]) => list.map((f) => (f.type === type ? { ...f, ...patch } : f));
    setHeadshots(apply);
    setLogos(apply);
  };

  const uploadFile = async (file: File, type: BrandingAssetType) => {
    setAssetNotice(null);
    const preview = URL.createObjectURL(file);
    updateCard(type, { preview, uploading: true });
    try {
      const res = await uploadBrandingAsset(type, file);
      if (!res.status) {
        updateCard(type, { preview: undefined, uploading: false });
        setAssetNotice({ kind: "error", text: apiMessage(res, "Upload failed.") });
        return false;
      }
      const data = asRecord(res.data);
      const stamp = Date.now();
      setHeadshots((list) => mergeFiles(list, data.headshots, type, stamp));
      setLogos((list) => mergeFiles(list, data.logos, type, stamp));
      setAssetNotice({ kind: "success", text: apiMessage(res, "Asset uploaded") });
      return true;
    } catch (err) {
      updateCard(type, { preview: undefined, uploading: false });
      setAssetNotice({ kind: "error", text: errorText(err, "Upload failed.") });
      return false;
    } finally {
      URL.revokeObjectURL(preview);
    }
  };

  const onFileChosen = async (file: File | undefined) => {
    const type = pendingType.current;
    if (!file || !type) return;
    await uploadFile(file, type);
  };

  const continueModalUpload = async () => {
    if (!modalFile || !modalType || modalUploading) return;
    setModalUploading(true);
    setModalError("");
    const uploaded = await uploadFile(modalFile, modalType);
    setModalUploading(false);
    if (uploaded) closeUploadModal();
    else setModalError("Upload failed. Please try again.");
  };

  const setFontRole = (role: FontRole, patch: Partial<FontSetting>) => {
    setFontSel((prev) => {
      const base = prev[role];
      if (!base && !patch.family) return prev;
      return {
        ...prev,
        [role]: { ...(base || { id: "", family: "", bold: false, italic: false }), ...patch } as FontSetting,
      };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setNotice(null);
    const fontsPayload: Record<string, unknown> = {};
    for (const { role } of FONT_ROLES) {
      const f = fontSel[role];
      if (f?.family) {
        fontsPayload[role] = { id: f.id, family: f.family, category: f.category || "", bold: f.bold, italic: f.italic };
      }
    }
    try {
      const res = await updateBrandingSettings({
        colour_scheme: scheme,
        colour_palette: palette,
        fonts: fontsPayload,
      });
      setNotice(res.status ? { kind: "success", text: apiMessage(res, "Branding settings saved") } : { kind: "error", text: apiMessage(res, "Unable to save branding.") });
    } catch (err) {
      setNotice({ kind: "error", text: errorText(err, "Unable to save branding.") });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SectionLoading label="Loading branding…" />;
  if (loadError) return <SectionError text={loadError} onRetry={() => void load()} />;

  return (
    <div className="ma-branding">
      <h2>Branding</h2>
      <input ref={fileInput} type="file" className="hidden" onChange={(e) => void onFileChosen(e.target.files?.[0])} />

      <div className="mt-6 mb-8">
        <div className="flex justify-between items-center mb-4">
          <h5 className="mb-0 text-white">Headshots</h5>
          <AddNewButton onOpen={() => openUploadModal(headshots)} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {headshots.map((file) => (
            <AssetCard key={file.type} file={file} onPick={() => pickFile(file.type)} />
          ))}
        </div>
      </div>

      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h5 className="mb-0 text-white">Logo Variation</h5>
          <AddNewButton onOpen={() => openUploadModal(logos)} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {logos.map((file) => (
            <AssetCard key={file.type} file={file} onPick={() => pickFile(file.type)} />
          ))}
        </div>
        <NoticeLine notice={assetNotice} />
      </div>

      <div className="mb-8">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <h5 className="mb-0 text-white">Colour Palette</h5>
          <div className="photography flex flex-wrap" role="radiogroup" aria-label="Colour scheme">
            {SCHEMES.map((s) => (
              <button
                key={s.value}
                type="button"
                role="radio"
                aria-checked={scheme === s.value}
                className={`btn ${scheme === s.value ? "active" : ""}`}
                onClick={() => setScheme(s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-6">
          {palette.map((colour, i) => {
            const valid = normalizeHex(colour, "") !== "";
            return (
            <div key={PALETTE_LABELS[i]} className="color-item">
              <label className={`ma-color-swatch ${valid ? "" : "ma-color-swatch--invalid"}`} style={{ backgroundColor: valid ? normalizeHex(colour, "") : undefined }}>
                <input
                  type="color"
                  value={normalizeHex(colour, "#000000")}
                  aria-label={PALETTE_LABELS[i]}
                  onChange={(e) => setPalette((prev) => prev.map((c, idx) => (idx === i ? e.target.value.toUpperCase() : c)))}
                />
              </label>
              <div className="mt-2 text-white text-sm">{PALETTE_LABELS[i]}</div>
              <input
                className="ma-hex-input"
                defaultValue={colour}
                key={colour}
                maxLength={7}
                aria-label={`${PALETTE_LABELS[i]} hex`}
                onBlur={(e) => {
                  const next = normalizeHex(e.target.value, colour);
                  setPalette((prev) => prev.map((c, idx) => (idx === i ? next : c)));
                }}
              />
              {!valid ? <div className="ma-color-invalid">Invalid colour</div> : null}
            </div>
            );
          })}
        </div>
      </div>

      {/* Font selection — temporarily hidden for V1; keep the controls and state for later. */}
      {false && (
      <div className="mb-6 font-selection">
        <h5 className="mb-4 text-white">Fonts</h5>
        {!fonts.length ? <p className="small-muted mb-4">Font list is unavailable right now; current selections are kept.</p> : null}
        {FONT_ROLES.map(({ role, label }) => {
          const f = fontSel[role];
          return (
            <div key={role} className="mb-5">
              <label className="form-label text-white">{label}</label>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <FontPicker
                  fonts={fonts}
                  value={f}
                  onChange={(font) => setFontRole(role, { id: font.id, family: font.family, category: font.category })}
                />
                <button
                  type="button"
                  className={`icon-btn font-bold ${f?.bold ? "active" : ""}`}
                  aria-pressed={Boolean(f?.bold)}
                  disabled={!f}
                  onClick={() => setFontRole(role, { bold: !f?.bold })}
                >
                  B
                </button>
                <button
                  type="button"
                  className={`icon-btn italic ${f?.italic ? "active" : ""}`}
                  aria-pressed={Boolean(f?.italic)}
                  disabled={!f}
                  onClick={() => setFontRole(role, { italic: !f?.italic })}
                >
                  I
                </button>
              </div>
              <input
                type="text"
                className="form-control"
                placeholder={label}
                value={previewText[role]}
                onChange={(e) => setPreviewText((p) => ({ ...p, [role]: e.target.value }))}
                style={{
                  fontFamily: f?.family ? `"${f.family}", ${f.category || "sans-serif"}` : undefined,
                  fontWeight: f?.bold ? 700 : 400,
                  fontStyle: f?.italic ? "italic" : "normal",
                }}
              />
            </div>
          );
        })}
      </div>
      )}

      <div className="flex items-center gap-4 flex-wrap">
        <button type="button" className="btn-purple" disabled={saving} onClick={() => void handleSave()}>
          {saving ? "Saving…" : "Save Branding"}
        </button>
        <NoticeLine notice={notice} />
      </div>

      {uploadChoices && (
        <div
          className="ma-brand-upload-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeUploadModal();
          }}
        >
          <div className="ma-brand-upload-dialog" role="dialog" aria-modal="true" aria-labelledby="brand-upload-title">
            <div className="ma-brand-upload-body">
              <div className="ma-brand-upload-heading">
                <h3 id="brand-upload-title">Upload branding assets</h3>
                <p>Drag and drop files and select usage.</p>
              </div>

              <input
                ref={modalFileInput}
                type="file"
                className="hidden"
                accept="image/jpeg,image/png,image/svg+xml,.jpg,.jpeg,.png,.svg"
                onChange={(event) => {
                  chooseModalFile(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />

              <div
                className={`ma-brand-dropzone ${dragActive ? "is-dragging" : ""}`}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => {
                  event.preventDefault();
                  if (event.currentTarget === event.target) setDragActive(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                  chooseModalFile(event.dataTransfer.files?.[0]);
                }}
              >
                <Folder aria-hidden="true" />
                <strong>Drag and drop to upload</strong>
                <span>or click to browse (4 MB max)</span>
                <button type="button" onClick={() => modalFileInput.current?.click()} disabled={modalUploading}>
                  Select Files
                </button>
              </div>

              {modalFile && (
                <div className="ma-brand-file-row">
                  <button
                    type="button"
                    className="ma-brand-file-remove"
                    onClick={() => {
                      setModalFile(null);
                      setModalError("");
                    }}
                    disabled={modalUploading}
                    aria-label="Remove selected file"
                  >
                    <X aria-hidden="true" />
                  </button>
                  <div className="ma-brand-file-name">
                    <Paperclip aria-hidden="true" />
                    <span>{modalFile.name}</span>
                  </div>
                  <label className={`ma-brand-usage ${modalType ? "has-value" : ""}`}>
                    <span className="sr-only">Select usage</span>
                    <select
                      value={modalType}
                      onChange={(event) => setModalType(event.target.value as BrandingAssetType | "")}
                      disabled={modalUploading}
                    >
                      <option value="">Select Usage</option>
                      {uploadChoices.map((file) => (
                        <option key={file.type} value={file.type}>
                          {file.title}
                        </option>
                      ))}
                    </select>
                    <ChevronDown aria-hidden="true" />
                  </label>
                </div>
              )}

              {modalError && <p className="ma-brand-upload-error" role="alert">{modalError}</p>}
            </div>

            <div className="ma-brand-upload-footer">
              <button type="button" className="ma-brand-modal-cancel" onClick={closeUploadModal} disabled={modalUploading}>
                Cancel
              </button>
              <button
                type="button"
                className="ma-brand-modal-continue"
                disabled={!modalFile || !modalType || modalUploading}
                onClick={() => void continueModalUpload()}
              >
                {modalUploading ? <><Loader2 className="animate-spin" /> Uploading…</> : "Continue"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
