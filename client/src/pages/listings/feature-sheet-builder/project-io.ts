import type { FeatureSheetFormState } from "./render-panels";

export type BrandKitExport = {
  version: 1;
  inputs: Record<string, string | number | boolean>;
  images: { agent: string | null; logo: string | null };
};

export type ProjectExport = {
  version: 1;
  form: FeatureSheetFormState;
  lbCount: number;
  rgCount: number;
};

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportBrandKit(form: FeatureSheetFormState): void {
  const payload: BrandKitExport = {
    version: 1,
    inputs: {
      agentName: form.agentName,
      agentTitle: form.agentTitle,
      agentPhone: form.agentPhone,
      agentPhone2: form.agentPhone2,
      agentEmail: form.agentEmail,
      agentWeb: form.agentWeb,
      agentBroker: form.agentBroker,
      agentLogoLabel: form.agentLogoLabel,
      agentPhotoShape: form.agentPhotoShape,
      agentBarStyle: form.agentBarStyle,
      agentScale: form.agentScale,
      logoScale: form.logoScale,
      showAgentTitle: form.showAgentTitle,
      showAgentPhoto: form.showAgentPhoto,
      bgColor: form.bgColor,
      textColor: form.textColor,
      headingColor: form.headingColor,
      primaryColor: form.primaryColor,
      accentColor: form.accentColor,
      qrColor: form.qrColor,
      headingFont: form.headingFont,
      bodyFont: form.bodyFont,
    },
    images: {
      agent: form.images.agent,
      logo: form.images.logo,
    },
  };
  const name = (form.agentName || "Agent").replace(/\s+/g, "_");
  downloadJson(`${name}_BrandKit.json`, payload);
}

export function parseBrandKitImport(json: unknown): Partial<FeatureSheetFormState> | null {
  if (!json || typeof json !== "object") return null;
  const o = json as BrandKitExport;
  if (!o.inputs) return null;
  const i = o.inputs;
  return {
    agentName: String(i.agentName ?? ""),
    agentTitle: String(i.agentTitle ?? ""),
    agentPhone: String(i.agentPhone ?? ""),
    agentPhone2: String(i.agentPhone2 ?? ""),
    agentEmail: String(i.agentEmail ?? ""),
    agentWeb: String(i.agentWeb ?? ""),
    agentBroker: String(i.agentBroker ?? ""),
    agentLogoLabel: String(i.agentLogoLabel ?? ""),
    agentPhotoShape: (i.agentPhotoShape as FeatureSheetFormState["agentPhotoShape"]) ?? "50%",
    agentBarStyle: (i.agentBarStyle as FeatureSheetFormState["agentBarStyle"]) ?? "standard",
    agentScale: Number(i.agentScale) || 1,
    logoScale: Number(i.logoScale) || 1,
    showAgentTitle: i.showAgentTitle !== false,
    showAgentPhoto: i.showAgentPhoto !== false,
    bgColor: String(i.bgColor ?? "#ffffff"),
    textColor: String(i.textColor ?? "#555555"),
    headingColor: String(i.headingColor ?? "#222222"),
    primaryColor: String(i.primaryColor ?? "#1a3a5c"),
    accentColor: String(i.accentColor ?? "#e3a79a"),
    qrColor: String(i.qrColor ?? "#000000"),
    headingFont: String(i.headingFont ?? "'Playfair Display', serif"),
    bodyFont: String(i.bodyFont ?? "'Montserrat', sans-serif"),
    images: {
      hero: null,
      agent: o.images?.agent ?? null,
      logo: o.images?.logo ?? null,
      il1: null,
      rh: null,
      fp: null,
      lb: {},
      rg: {},
    },
  };
}

export function exportProject(
  form: FeatureSheetFormState,
  lbCount: number,
  rgCount: number,
): void {
  const payload: ProjectExport = { version: 1, form, lbCount, rgCount };
  const addrName = (form.addr || "Listing").split(",")[0].replace(/\s+/g, "_");
  downloadJson(`${addrName}_Project.json`, payload);
}

export function parseProjectImport(json: unknown): {
  form: FeatureSheetFormState;
  lbCount: number;
  rgCount: number;
} | null {
  if (!json || typeof json !== "object") return null;
  const o = json as ProjectExport;
  if (!o.form || typeof o.form !== "object") return null;
  return {
    form: o.form,
    lbCount: o.lbCount ?? 0,
    rgCount: o.rgCount ?? 0,
  };
}
